/**
 * @fileoverview Integration tests for /api/invite routes (public invite-link endpoints)
 * Covers: invite preview (public), join via invite (authenticated), expiry, max-uses
 */

import request from "supertest";
import bcrypt from "bcryptjs";

import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import { createTestApp } from "../test-utils/createTestApp";
import { clearDb, createTestDb } from "../test-utils/createTestDb";

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;

let db, app;

beforeAll(() => {
  db  = createTestDb();
  mockedGetDb.mockReturnValue(db);
  app = createTestApp();
});
beforeEach(() => clearDb(db));
afterAll(() => db.close());

// ─── helpers ─────────────────────────────────────────────────────────────────

function seedUser(username = "alice", role = "member") {
  const hash = bcrypt.hashSync("pw", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, '👤', ?)"
  ).run(username, `${username}@t.com`, hash, role);
  return { id: lastInsertRowid, username, email: `${username}@t.com`, role };
}

function seedChannel(name, createdBy) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO channels (name, description, created_by) VALUES (?, 'desc', ?)"
  ).run(name, createdBy);
  db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, createdBy);
  return lastInsertRowid;
}

function seedInvite(
  channelId,
  createdBy,
  opts: { code?: string; maxUses?: number | null; usesCount?: number; expiresAt?: string | null } = {},
) {
  const code      = opts.code      || "testcode12";
  const maxUses   = opts.maxUses   ?? null;
  const usesCount = opts.usesCount ?? 0;
  const expiresAt = opts.expiresAt ?? null;
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO channel_invites (channel_id, created_by, code, max_uses, uses_count, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(channelId, createdBy, code, maxUses, usesCount, expiresAt);
  return lastInsertRowid;
}

// ─── GET /api/invite/:code ────────────────────────────────────────────────────

describe("GET /api/invite/:code (public)", () => {
  test("returns invite preview without authentication", async () => {
    const owner = seedUser("owner");
    const chId  = seedChannel("testch", owner.id);
    seedInvite(chId, owner.id, { code: "abc1234567" });

    const res = await request(app).get("/api/invite/abc1234567");
    expect(res.status).toBe(200);
    expect(res.body.invite.channel_name).toBe("testch");
    expect(res.body.invite.created_by_username).toBe("owner");
  });

  test("returns 404 for unknown code", async () => {
    const res = await request(app).get("/api/invite/unknowncode");
    expect(res.status).toBe(404);
  });

  test("returns 410 when invite is expired", async () => {
    const owner = seedUser("owner");
    const chId  = seedChannel("expch", owner.id);
    const past  = new Date(Date.now() - 3600 * 1000).toISOString();
    seedInvite(chId, owner.id, { code: "expired1234", expiresAt: past });

    const res = await request(app).get("/api/invite/expired1234");
    expect(res.status).toBe(410);
  });

  test("returns 410 when invite has reached max uses", async () => {
    const owner = seedUser("owner");
    const chId  = seedChannel("maxch", owner.id);
    seedInvite(chId, owner.id, { code: "maxused1234", maxUses: 3, usesCount: 3 });

    const res = await request(app).get("/api/invite/maxused1234");
    expect(res.status).toBe(410);
  });

  test("includes member_count in the preview", async () => {
    const owner = seedUser("owner");
    const chId  = seedChannel("memberch", owner.id);
    seedInvite(chId, owner.id, { code: "membercode1" });

    const res = await request(app).get("/api/invite/membercode1");
    expect(typeof res.body.invite.member_count).toBe("number");
  });
});

// ─── POST /api/invite/:code/join ──────────────────────────────────────────────

describe("POST /api/invite/:code/join", () => {
  test("adds the authenticated user to the channel", async () => {
    const owner = seedUser("owner");
    const joiner = seedUser("joiner");
    const chId  = seedChannel("joinch", owner.id);
    seedInvite(chId, owner.id, { code: "validcode12" });

    const res = await request(app).post("/api/invite/validcode12/join")
      .set("Authorization", `Bearer ${signToken(joiner)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const row = db.prepare("SELECT * FROM channel_members WHERE channel_id=? AND user_id=?")
      .get(chId, joiner.id);
    expect(row).toBeDefined();
    expect(row.role).toBe("member");
  });

  test("increments uses_count on join", async () => {
    const owner  = seedUser("owner");
    const joiner = seedUser("joiner");
    const chId   = seedChannel("ucountch", owner.id);
    const invId  = seedInvite(chId, owner.id, { code: "usescount12" });

    await request(app).post("/api/invite/usescount12/join")
      .set("Authorization", `Bearer ${signToken(joiner)}`);
    const inv = db.prepare("SELECT uses_count FROM channel_invites WHERE id=?").get(invId);
    expect(inv.uses_count).toBe(1);
  });

  test("joining twice is idempotent (INSERT OR IGNORE)", async () => {
    const owner  = seedUser("owner");
    const joiner = seedUser("joiner");
    const chId   = seedChannel("idempch", owner.id);
    seedInvite(chId, owner.id, { code: "idempcode12" });

    await request(app).post("/api/invite/idempcode12/join")
      .set("Authorization", `Bearer ${signToken(joiner)}`);
    const res2 = await request(app).post("/api/invite/idempcode12/join")
      .set("Authorization", `Bearer ${signToken(joiner)}`);
    expect(res2.status).toBe(200);
    const rows = db.prepare("SELECT * FROM channel_members WHERE channel_id=? AND user_id=?")
      .all(chId, joiner.id);
    expect(rows.length).toBe(1);
  });

  test("returns 404 for unknown invite code", async () => {
    const user = seedUser("user");
    const res  = await request(app).post("/api/invite/badcode0000/join")
      .set("Authorization", `Bearer ${signToken(user)}`);
    expect(res.status).toBe(404);
  });

  test("returns 410 for expired invite", async () => {
    const owner  = seedUser("owner");
    const joiner = seedUser("joiner");
    const chId   = seedChannel("expjoin", owner.id);
    const past   = new Date(Date.now() - 1000).toISOString();
    seedInvite(chId, owner.id, { code: "expjoin0000", expiresAt: past });

    const res = await request(app).post("/api/invite/expjoin0000/join")
      .set("Authorization", `Bearer ${signToken(joiner)}`);
    expect(res.status).toBe(410);
  });

  test("returns 410 when max uses reached", async () => {
    const owner  = seedUser("owner");
    const joiner = seedUser("joiner");
    const chId   = seedChannel("maxjoin", owner.id);
    seedInvite(chId, owner.id, { code: "maxjoin0000", maxUses: 1, usesCount: 1 });

    const res = await request(app).post("/api/invite/maxjoin0000/join")
      .set("Authorization", `Bearer ${signToken(joiner)}`);
    expect(res.status).toBe(410);
  });

  test("requires authentication", async () => {
    const res = await request(app).post("/api/invite/anything0000/join");
    expect(res.status).toBe(401);
  });
});
