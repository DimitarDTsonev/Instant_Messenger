import request from "supertest";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import { createTestApp } from "../test-utils/createTestApp";
import { clearDb, createTestDb } from "../test-utils/createTestDb";

// Mock the db module; route handlers call getDb() at request-time
jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;

let db;
let app;

beforeAll(() => {
  db  = createTestDb();
  mockedGetDb.mockReturnValue(db);
  app = createTestApp();
});
beforeEach(() => clearDb(db));
afterAll(() => db.close());

function seedUser(username = "alice", role = "member") {
  const hash = bcrypt.hashSync("password123", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, 'AL', ?)"
  ).run(username, `${username}@test.com`, hash, role);
  return { id: lastInsertRowid, username, email: `${username}@test.com`, role };
}

describe("POST /api/auth/register", () => {
  test("creates a user and returns user + token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "alice", email: "alice@test.com", password: "Password1!" });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("alice");
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test("first registered user becomes admin", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "first", email: "first@test.com", password: "Password1!" });
    expect(res.body.user.role).toBe("admin");
  });

  test("subsequent users get member role", async () => {
    await request(app).post("/api/auth/register")
      .send({ username: "first", email: "first@test.com", password: "Password1!" });
    const res = await request(app).post("/api/auth/register")
      .send({ username: "second", email: "second@test.com", password: "Password1!" });
    expect(res.body.user.role).toBe("member");
  });

  test("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/register")
      .send({ username: "alice" });
    expect(res.status).toBe(400);
  });

  test("returns 400 when password is too short", async () => {
    const res = await request(app).post("/api/auth/register")
      .send({ username: "alice", email: "alice@test.com", password: "123" });
    expect(res.status).toBe(400);
  });

  test("returns 409 on duplicate email", async () => {
    await request(app).post("/api/auth/register")
      .send({ username: "alice", email: "alice@test.com", password: "Password1!" });
    const res = await request(app).post("/api/auth/register")
      .send({ username: "alice2", email: "alice@test.com", password: "Password1!" });
    expect(res.status).toBe(409);
  });

  test("returns 409 on duplicate username", async () => {
    await request(app).post("/api/auth/register")
      .send({ username: "alice", email: "alice@test.com", password: "Password1!" });
    const res = await request(app).post("/api/auth/register")
      .send({ username: "alice", email: "alice2@test.com", password: "Password1!" });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/guest", () => {
  test("creates a guest account with is_guest=1", async () => {
    const res = await request(app).post("/api/auth/guest");
    expect(res.status).toBe(201);
    expect(res.body.user.username).toMatch(/^guest_/);
    expect(res.body.user.is_guest).toBe(1);
    expect(res.body.token).toBeDefined();
  });

  test("each call produces a different username", async () => {
    const r1 = await request(app).post("/api/auth/guest");
    const r2 = await request(app).post("/api/auth/guest");
    expect(r1.body.user.username).not.toBe(r2.body.user.username);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => seedUser("alice"));

  test("returns token on valid credentials", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "alice@test.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test("returns 401 on wrong password", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "alice@test.com", password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  test("returns 401 on unknown email", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "nobody@test.com", password: "password123" });
    expect(res.status).toBe(401);
  });

  test("returns 400 when email is missing", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ password: "password123" });
    expect(res.status).toBe(400);
  });

  test("returns 403 when account is banned", async () => {
    db.prepare("UPDATE users SET is_banned = 1, ban_reason = 'spam' WHERE username = 'alice'").run();
    const res = await request(app).post("/api/auth/login")
      .send({ email: "alice@test.com", password: "password123" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });
});

describe("GET /api/auth/me", () => {
  test("returns current user profile with valid token", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const res   = await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("alice");
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("returns 401 if user was deleted after token was issued", async () => {
    const user  = seedUser("ghost");
    const token = signToken(user);
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    const res   = await request(app).get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/users", () => {
  test("returns array of users", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const res   = await request(app).get("/api/auth/users")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
    // Password must not be exposed
    expect(res.body.users[0].password).toBeUndefined();
  });

  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/users");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/search", () => {
  let token;
  beforeEach(() => {
    const user = seedUser("alice");
    seedUser("bob");
    token = signToken(user);
  });

  test("returns matching users", async () => {
    const res = await request(app).get("/api/auth/search?q=ali")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.users.some((u) => u.username === "alice")).toBe(true);
  });

  test("does not return non-matching users", async () => {
    const res = await request(app).get("/api/auth/search?q=ali")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.users.some((u) => u.username === "bob")).toBe(false);
  });

  test("returns empty array for blank query", async () => {
    const res = await request(app).get("/api/auth/search?q=")
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.users).toEqual([]);
  });
});

describe("GET /api/auth/users/:id", () => {
  test("returns the target user", async () => {
    const me     = seedUser("alice");
    const target = seedUser("bob");
    const token  = signToken(me);
    const res    = await request(app).get(`/api/auth/users/${target.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("bob");
  });

  test("returns 404 for unknown id", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const res   = await request(app).get("/api/auth/users/99999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/auth/users/:id/role", () => {
  let adminToken, memberId;

  beforeEach(() => {
    const admin  = seedUser("admin", "admin");
    const member = seedUser("member", "member");
    adminToken = signToken(admin);
    memberId   = member.id;
  });

  test("admin can promote a member to admin", async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${memberId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  test("admin can demote admin to member", async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${memberId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "member" });
    expect(res.status).toBe(200);
  });

  test("non-admin cannot change roles (403)", async () => {
    const member = seedUser("other");
    const token  = signToken(member);
    const res    = await request(app)
      .patch(`/api/auth/users/${memberId}/role`)
      .set("Authorization", `Bearer ${token}`)
      .send({ role: "admin" });
    expect(res.status).toBe(403);
  });

  test("admin cannot change own role (400)", async () => {
    const adminRow = db.prepare("SELECT id FROM users WHERE username='admin'").get();
    const res = await request(app)
      .patch(`/api/auth/users/${adminRow.id}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "member" });
    expect(res.status).toBe(400);
  });

  test("returns 400 for invalid role value", async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${memberId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "superadmin" });
    expect(res.status).toBe(400);
  });

  test("returns 404 when target user does not exist", async () => {
    const res = await request(app)
      .patch("/api/auth/users/99999/role")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "member" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/auth/forgot-password", () => {
  test("returns 200 even for unknown email (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("creates a reset token for a known email", async () => {
    const user = seedUser("resetuser");
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });
    expect(res.status).toBe(200);
    const token = db.prepare("SELECT * FROM password_reset_tokens WHERE user_id = ?").get(user.id);
    expect(token).toBeDefined();
    expect(token.used).toBe(0);
  });

  test("returns 200 with no body when email is missing", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({});
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/reset-password", () => {
  function seedResetToken(userId, opts: { expired?: boolean; used?: boolean } = {}) {
    const rawToken  = "testtoken123";
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = opts.expired
      ? "2000-01-01 00:00:00"
      : new Date(Date.now() + 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at, used) VALUES (?, ?, ?, ?)")
      .run(userId, tokenHash, expiresAt, opts.used ? 1 : 0);
    return rawToken;
  }

  test("resets the password with a valid token", async () => {
    const user  = seedUser("pwreset");
    const token = seedResetToken(user.id);
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "Newpass1!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Token should be marked as used (DB stores the hash, not the raw token)
    const storedHash = crypto.createHash("sha256").update(token).digest("hex");
    const row = db.prepare("SELECT used FROM password_reset_tokens WHERE token = ?").get(storedHash);
    expect(row.used).toBe(1);
  });

  test("returns 400 for an expired token", async () => {
    const user  = seedUser("pwexpired");
    const token = seedResetToken(user.id, { expired: true });
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "Newpass1!" });
    expect(res.status).toBe(400);
  });

  test("returns 400 for an already-used token", async () => {
    const user  = seedUser("pwused");
    const token = seedResetToken(user.id, { used: true });
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "Newpass1!" });
    expect(res.status).toBe(400);
  });

  test("returns 400 when password is too short", async () => {
    const user  = seedUser("pwshort");
    const token = seedResetToken(user.id);
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "abc" });
    expect(res.status).toBe(400);
  });

  test("returns 400 when token is missing", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ password: "Newpass1!" });
    expect(res.status).toBe(400);
  });
});