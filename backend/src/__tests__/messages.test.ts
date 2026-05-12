/**
 * @fileoverview Integration tests for /api/messages routes
 * Covers: global search, channel history, pinned messages, channel search
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

function seedUser(username = "alice") {
  const hash = bcrypt.hashSync("pw", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, '👤', 'member')"
  ).run(username, `${username}@t.com`, hash);
  return { id: lastInsertRowid, username, email: `${username}@t.com`, role: "member" };
}

function seedChannel(name, createdBy) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO channels (name, created_by) VALUES (?, ?)"
  ).run(name, createdBy);
  db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, createdBy);
  return lastInsertRowid;
}

function seedMessage(channelId, userId, content, pinned = 0) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO messages (content, channel_id, user_id, is_pinned) VALUES (?, ?, ?, ?)"
  ).run(content, channelId, userId, pinned);
  return lastInsertRowid;
}

// ─── GET /api/messages/search ────────────────────────────────────────────────

describe("GET /api/messages/search", () => {
  let user, token, chId;

  beforeEach(() => {
    user  = seedUser("alice");
    token = signToken(user);
    chId  = seedChannel("general", user.id);
    seedMessage(chId, user.id, "hello world");
    seedMessage(chId, user.id, "goodbye world");
  });

  test("returns matching messages for a valid query", async () => {
    const res = await request(app).get("/api/messages/search?q=hello")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.results.some((m) => m.content.includes("hello"))).toBe(true);
  });

  test("returns 400 when query is shorter than 2 characters", async () => {
    const res = await request(app).get("/api/messages/search?q=h")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test("returns 400 when query is not a single string", async () => {
    const res = await request(app).get("/api/messages/search?q=hello&q=world")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test("includes DM results in global search", async () => {
    const bob = seedUser("bob");
    db.prepare("INSERT INTO direct_messages (content, sender_id, receiver_id) VALUES (?, ?, ?)")
      .run("secret dm message", user.id, bob.id);
    const res = await request(app).get("/api/messages/search?q=secret")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.results.some((m) => m.type === "dm")).toBe(true);
  });

  test("requires authentication", async () => {
    const res = await request(app).get("/api/messages/search?q=hello");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/messages/:channelId ────────────────────────────────────────────

describe("GET /api/messages/:channelId", () => {
  let user, token, chId;

  beforeEach(() => {
    user  = seedUser("alice");
    token = signToken(user);
    chId  = seedChannel("general", user.id);
    for (let i = 0; i < 5; i++) {
      seedMessage(chId, user.id, `message ${i}`);
    }
  });

  test("returns paginated messages in ascending order", async () => {
    const res = await request(app).get(`/api/messages/${chId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBe(5);
    // Should be in ascending id order
    const ids = res.body.messages.map((m) => m.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  test("returns hasMore=true when more messages exist", async () => {
    for (let i = 0; i < 50; i++) seedMessage(chId, user.id, `extra ${i}`);
    const res = await request(app).get(`/api/messages/${chId}?limit=10`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.hasMore).toBe(true);
  });

  test("supports cursor-based pagination via before= query param", async () => {
    const msgs = db.prepare("SELECT id FROM messages WHERE channel_id=? ORDER BY id DESC LIMIT 1").get(chId);
    const res  = await request(app).get(`/api/messages/${chId}?before=${msgs.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages.every((m) => m.id < msgs.id)).toBe(true);
  });

  test("returns 403 for unknown or inaccessible channel", async () => {
    const res = await request(app).get("/api/messages/99999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("attaches reactions map to each message", async () => {
    const bob = seedUser("bob_react");
    const msg = db.prepare("SELECT id FROM messages WHERE channel_id=? ORDER BY id LIMIT 1").get(chId);
    db.prepare("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)")
      .run(msg.id, user.id, "+1");
    db.prepare("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)")
      .run(msg.id, bob.id, "+1");

    const res = await request(app).get(`/api/messages/${chId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(typeof res.body.messages[0].reactions).toBe("object");
    const reacted = res.body.messages.find((m) => m.id === msg.id);
    expect(reacted.reactions["+1"]).toEqual([user.id, bob.id]);
  });

  test("falls back to default limit when limit is invalid", async () => {
    const res = await request(app).get(`/api/messages/${chId}?limit=abc`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(5);
  });
});

// ─── GET /api/messages/:channelId/pinned ─────────────────────────────────────

describe("GET /api/messages/:channelId/pinned", () => {
  test("returns only pinned messages", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const chId  = seedChannel("pinch", user.id);
    seedMessage(chId, user.id, "normal");
    seedMessage(chId, user.id, "pinned msg", 1);

    const res = await request(app).get(`/api/messages/${chId}/pinned`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages.every((m) => m.is_pinned === 1)).toBe(true);
    expect(res.body.messages.some((m) => m.content === "pinned msg")).toBe(true);
    expect(res.body.messages.some((m) => m.content === "normal")).toBe(false);
  });

  test("returns empty array when nothing is pinned", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const chId  = seedChannel("nopinch", user.id);
    seedMessage(chId, user.id, "regular");
    const res = await request(app).get(`/api/messages/${chId}/pinned`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.messages).toEqual([]);
  });
});

// ─── GET /api/messages/:channelId/search ─────────────────────────────────────

describe("GET /api/messages/:channelId/search", () => {
  let user, token, chId;

  beforeEach(() => {
    user  = seedUser("alice");
    token = signToken(user);
    chId  = seedChannel("sch", user.id);
    seedMessage(chId, user.id, "find me please");
    seedMessage(chId, user.id, "not here");
  });

  test("returns messages matching query within the channel", async () => {
    const res = await request(app).get(`/api/messages/${chId}/search?q=find`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.results.some((m) => m.content.includes("find"))).toBe(true);
    expect(res.body.results.every((m) => !m.content.includes("not here")
      || m.content.includes("find"))).toBe(true);
  });

  test("returns 400 when query is too short", async () => {
    const res = await request(app).get(`/api/messages/${chId}/search?q=f`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test("returns 400 when channel search query is not a single string", async () => {
    const res = await request(app).get(`/api/messages/${chId}/search?q=find&q=me`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test("returns count field", async () => {
    const res = await request(app).get(`/api/messages/${chId}/search?q=find`)
      .set("Authorization", `Bearer ${token}`);
    expect(typeof res.body.count).toBe("number");
  });
});