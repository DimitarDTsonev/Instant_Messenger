/**
 * Admin API integration tests — exercises GET /api/admin/users,
 * GET /api/admin/security-logs, POST /api/admin/ban/:id, and
 * POST /api/admin/unban/:id using a real in-memory SQLite database.
 *
 * Verifies: admin-only access guard, ban/unban state changes, log creation,
 * and error responses for invalid inputs.
 */
import request from "supertest";
import bcrypt from "bcryptjs";

import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import { createTestApp } from "../test-utils/createTestApp";
import { clearDb, createTestDb } from "../test-utils/createTestDb";

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;

let app, db;

beforeAll(() => {
  db  = createTestDb();
  mockedGetDb.mockReturnValue(db);
  app = createTestApp();
});

beforeEach(() => clearDb(db));

function seedUser(username, role = "member") {
  const hash = bcrypt.hashSync("pw", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)"
  ).run(username, `${username}@t.com`, hash, role);
  return { id: lastInsertRowid, username, role };
}

function adminToken() {
  const u = seedUser("admin_user", "admin");
  return { token: signToken(u), adminId: u.id };
}

function memberToken() {
  const u = seedUser("member_user", "member");
  return signToken(u);
}

function seedLog(event, ip = "1.2.3.4") {
  db.prepare("INSERT INTO security_logs (event, ip, username) VALUES (?, ?, 'test')").run(event, ip);
}

describe("GET /api/admin/users", () => {
  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  test("returns 403 for non-admin", async () => {
    const token = memberToken();
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("returns user list with ban info for admin", async () => {
    const member = seedUser("memberx");
    db.prepare("UPDATE users SET is_banned = 1, ban_reason = 'test' WHERE id = ?").run(member.id);
    const { token } = adminToken();
    const res = await request(app)
      .get("/api/admin/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    const found = res.body.users.find((u) => u.id === member.id);
    expect(found).toBeDefined();
    expect(found.is_banned).toBe(1);
    expect(found.ban_reason).toBe("test");
  });
});

describe("GET /api/admin/security-logs", () => {
  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/admin/security-logs");
    expect(res.status).toBe(401);
  });

  test("returns 403 for non-admin", async () => {
    const token = memberToken();
    const res = await request(app)
      .get("/api/admin/security-logs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("returns empty array when no logs", async () => {
    const { token } = adminToken();
    const res = await request(app)
      .get("/api/admin/security-logs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toEqual([]);
  });

  test("returns all logs for admin", async () => {
    seedLog("login_fail");
    seedLog("ip_banned");
    const { token } = adminToken();
    const res = await request(app)
      .get("/api/admin/security-logs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBe(2);
  });

  test("filters by event type when ?event= is provided", async () => {
    seedLog("login_fail");
    seedLog("ip_banned");
    const { token } = adminToken();
    const res = await request(app)
      .get("/api/admin/security-logs?event=login_fail")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.logs.every((l) => l.event === "login_fail")).toBe(true);
  });

  test("respects limit query param", async () => {
    for (let i = 0; i < 5; i++) seedLog("test_event");
    const { token } = adminToken();
    const res = await request(app)
      .get("/api/admin/security-logs?limit=3")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.logs.length).toBe(3);
  });
});

describe("POST /api/admin/ban/:userId", () => {
  test("returns 401 without token", async () => {
    const target = seedUser("victim");
    const res = await request(app).post(`/api/admin/ban/${target.id}`);
    expect(res.status).toBe(401);
  });

  test("returns 403 for non-admin", async () => {
    const target = seedUser("victim2");
    const token  = memberToken();
    const res = await request(app)
      .post(`/api/admin/ban/${target.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("admin can ban a member", async () => {
    const target = seedUser("to_ban");
    const { token } = adminToken();
    const res = await request(app)
      .post(`/api/admin/ban/${target.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "spamming" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const row = db.prepare("SELECT is_banned, ban_reason FROM users WHERE id = ?").get(target.id);
    expect(row.is_banned).toBe(1);
    expect(row.ban_reason).toBe("spamming");
  });

  test("writes a user_banned log entry", async () => {
    const target = seedUser("logged_ban");
    const { token } = adminToken();
    await request(app)
      .post(`/api/admin/ban/${target.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "test" });
    const log = db.prepare("SELECT * FROM security_logs WHERE event = 'user_banned'").get();
    expect(log).toBeTruthy();
    expect(log.username).toBe("logged_ban");
  });

  test("returns 400 when admin tries to ban themselves", async () => {
    const { token, adminId } = adminToken();
    const res = await request(app)
      .post(`/api/admin/ban/${adminId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test("returns 403 when trying to ban another admin", async () => {
    const otherAdmin = seedUser("other_admin", "admin");
    const { token } = adminToken();
    const res = await request(app)
      .post(`/api/admin/ban/${otherAdmin.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("returns 404 for non-existent user", async () => {
    const { token } = adminToken();
    const res = await request(app)
      .post("/api/admin/ban/99999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/unban/:userId", () => {
  test("admin can unban a banned user", async () => {
    const target = seedUser("to_unban");
    db.prepare("UPDATE users SET is_banned = 1, ban_reason = 'test' WHERE id = ?").run(target.id);
    const { token } = adminToken();
    const res = await request(app)
      .post(`/api/admin/unban/${target.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const row = db.prepare("SELECT is_banned FROM users WHERE id = ?").get(target.id);
    expect(row.is_banned).toBe(0);
  });

  test("writes a user_unbanned log entry", async () => {
    const target = seedUser("logged_unban");
    const { token } = adminToken();
    await request(app)
      .post(`/api/admin/unban/${target.id}`)
      .set("Authorization", `Bearer ${token}`);
    const log = db.prepare("SELECT * FROM security_logs WHERE event = 'user_unbanned'").get();
    expect(log).toBeTruthy();
  });

  test("returns 404 for non-existent user", async () => {
    const { token } = adminToken();
    const res = await request(app)
      .post("/api/admin/unban/99999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test("returns 403 for non-admin", async () => {
    const target = seedUser("unban_target");
    const token  = memberToken();
    const res = await request(app)
      .post(`/api/admin/unban/${target.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});