/**
 * @fileoverview Integration tests for /api/dm routes
 * Covers: conversation list, paginated DM history, read receipts
 */

const request = require("supertest");
const bcrypt  = require("bcryptjs");
const { signToken } = require("../middleware/auth");
const { createTestDb, clearDb } = require("../test-utils/createTestDb");
const { createTestApp }         = require("../test-utils/createTestApp");

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const { getDb } = require("../db/database");

let db, app;

beforeAll(() => {
  db  = createTestDb();
  getDb.mockReturnValue(db);
  app = createTestApp();
});
beforeEach(() => clearDb(db));
afterAll(() => db.close());

// ─── helpers ─────────────────────────────────────────────────────────────────

function seedUser(username = "alice") {
  const hash = bcrypt.hashSync("pw", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, '👤', 'member')"
  ).run(username, `${username}@t.com`, hash);
  return { id: lastInsertRowid, username, email: `${username}@t.com`, role: "member" };
}

function seedDm(senderId, receiverId, content, isRead = 0) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO direct_messages (content, sender_id, receiver_id, is_read) VALUES (?, ?, ?, ?)"
  ).run(content, senderId, receiverId, isRead);
  return lastInsertRowid;
}

// ─── GET /api/dm/conversations ────────────────────────────────────────────────

describe("GET /api/dm/conversations", () => {
  test("returns conversation summaries for the current user", async () => {
    const alice = seedUser("alice");
    const bob   = seedUser("bob");
    seedDm(alice.id, bob.id, "hi bob");
    seedDm(bob.id, alice.id, "hi alice");

    const res = await request(app).get("/api/dm/conversations")
      .set("Authorization", `Bearer ${signToken(alice)}`);
    expect(res.status).toBe(200);
    expect(res.body.conversations.some((c) => c.partner_username === "bob")).toBe(true);
  });

  test("returns empty array when user has no conversations", async () => {
    const alice = seedUser("alice");
    const res   = await request(app).get("/api/dm/conversations")
      .set("Authorization", `Bearer ${signToken(alice)}`);
    expect(res.status).toBe(200);
    expect(res.body.conversations).toEqual([]);
  });

  test("unread_count reflects unread messages from partner", async () => {
    const alice = seedUser("alice");
    const bob   = seedUser("bob");
    seedDm(bob.id, alice.id, "msg1", 0);
    seedDm(bob.id, alice.id, "msg2", 0);

    const res = await request(app).get("/api/dm/conversations")
      .set("Authorization", `Bearer ${signToken(alice)}`);
    const convo = res.body.conversations.find((c) => c.partner_username === "bob");
    expect(convo.unread_count).toBe(2);
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/api/dm/conversations");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/dm/:userId ──────────────────────────────────────────────────────

describe("GET /api/dm/:userId", () => {
  let alice, bob, aliceToken;

  beforeEach(() => {
    alice      = seedUser("alice");
    bob        = seedUser("bob");
    aliceToken = signToken(alice);
  });

  test("returns messages in ascending order with partner info", async () => {
    seedDm(alice.id, bob.id, "hello");
    seedDm(bob.id, alice.id, "hey");

    const res = await request(app).get(`/api/dm/${bob.id}`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(2);
    expect(res.body.partner.username).toBe("bob");
    const ids = res.body.messages.map((m) => m.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  test("marks unread incoming messages as read on fetch", async () => {
    seedDm(bob.id, alice.id, "unread msg", 0);
    await request(app).get(`/api/dm/${bob.id}`)
      .set("Authorization", `Bearer ${aliceToken}`);
    const row = db.prepare(
      "SELECT is_read FROM direct_messages WHERE sender_id=? AND receiver_id=?"
    ).get(bob.id, alice.id);
    expect(row.is_read).toBe(1);
  });

  test("returns 404 when partner does not exist", async () => {
    const res = await request(app).get("/api/dm/99999")
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(res.status).toBe(404);
  });

  test("supports cursor-based pagination with before= param", async () => {
    for (let i = 0; i < 5; i++) seedDm(alice.id, bob.id, `msg ${i}`);
    const latest = db.prepare(
      "SELECT id FROM direct_messages ORDER BY id DESC LIMIT 1"
    ).get();
    const res = await request(app).get(`/api/dm/${bob.id}?before=${latest.id}`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(res.body.messages.every((m) => m.id < latest.id)).toBe(true);
  });

  test("attaches reactions map to messages", async () => {
    seedDm(alice.id, bob.id, "hi");
    const res = await request(app).get(`/api/dm/${bob.id}`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(typeof res.body.messages[0].reactions).toBe("object");
  });

  test("hasMore is true when more messages exist", async () => {
    for (let i = 0; i < 55; i++) seedDm(alice.id, bob.id, `bulk ${i}`);
    const res = await request(app).get(`/api/dm/${bob.id}`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(res.body.hasMore).toBe(true);
  });
});

// ─── POST /api/dm/:userId/read ────────────────────────────────────────────────

describe("POST /api/dm/:userId/read", () => {
  test("marks all unread messages from the given user as read", async () => {
    const alice = seedUser("alice");
    const bob   = seedUser("bob");
    seedDm(bob.id, alice.id, "msg1", 0);
    seedDm(bob.id, alice.id, "msg2", 0);

    const res = await request(app).post(`/api/dm/${bob.id}/read`)
      .set("Authorization", `Bearer ${signToken(alice)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const unread = db.prepare(
      "SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id=? AND receiver_id=? AND is_read=0"
    ).get(bob.id, alice.id);
    expect(unread.n).toBe(0);
  });
});
