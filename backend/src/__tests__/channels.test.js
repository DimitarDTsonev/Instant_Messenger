/**
 * @fileoverview Integration tests for /api/channels routes
 * Also unit-tests the exported getUserRole and getPerms helpers.
 * Covers: channel CRUD, members, permissions, invites
 */

const request = require("supertest");
const bcrypt  = require("bcryptjs");
const { signToken } = require("../middleware/auth");
const { createTestDb, clearDb } = require("../test-utils/createTestDb");
const { createTestApp }         = require("../test-utils/createTestApp");

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const { getDb } = require("../db/database");
const { getUserRole, getPerms } = require("../routes/channels");

let db, app;

beforeAll(() => {
  db  = createTestDb();
  getDb.mockReturnValue(db);
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

function seedChannel(name, createdBy, isPrivate = 0) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO channels (name, description, created_by, is_private) VALUES (?, 'desc', ?, ?)"
  ).run(name, createdBy, isPrivate);
  db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, createdBy);
  return lastInsertRowid;
}

// ─── getUserRole helper ───────────────────────────────────────────────────────

describe("getUserRole()", () => {
  test("returns stored role from channel_members", () => {
    const u = seedUser("u1");
    const chId = seedChannel("ch", u.id);
    expect(getUserRole(db, u.id, chId)).toBe("owner");
  });

  test("returns 'owner' for channel creator without a members row", () => {
    const u = seedUser("u2");
    const { lastInsertRowid: chId } = db.prepare(
      "INSERT INTO channels (name, created_by) VALUES ('norme', ?)"
    ).run(u.id);
    // No channel_members row — falls through to created_by check
    expect(getUserRole(db, u.id, chId)).toBe("owner");
  });

  test("returns null for private channel with no membership", () => {
    const owner = seedUser("owner");
    const other = seedUser("other");
    const chId  = seedChannel("priv", owner.id, 1);
    expect(getUserRole(db, other.id, chId)).toBeNull();
  });

  test("returns 'member' for public channel with no explicit membership row", () => {
    const owner = seedUser("owner2");
    const other = seedUser("other2");
    const chId  = seedChannel("pub", owner.id, 0);
    expect(getUserRole(db, other.id, chId)).toBe("member");
  });

  test("returns null when channel does not exist", () => {
    const u = seedUser("u3");
    expect(getUserRole(db, u.id, 99999)).toBeNull();
  });
});

// ─── getPerms helper ──────────────────────────────────────────────────────────

describe("getPerms()", () => {
  test("owner always has all permissions", () => {
    const p = getPerms(db, 1, "owner");
    expect(p.can_write).toBe(1);
    expect(p.can_invite).toBe(1);
    expect(p.can_manage_members).toBe(1);
    expect(p.can_delete_messages).toBe(1);
  });

  test("falls back to DEFAULT_PERMS for manager", () => {
    const u   = seedUser("u");
    const chId = seedChannel("ch2", u.id);
    const p = getPerms(db, chId, "manager");
    expect(p.can_write).toBe(1);
    expect(p.can_invite).toBe(1);
    expect(p.can_manage_members).toBe(1);
  });

  test("falls back to DEFAULT_PERMS for member", () => {
    const u   = seedUser("u2");
    const chId = seedChannel("ch3", u.id);
    const p = getPerms(db, chId, "member");
    expect(p.can_write).toBe(1);
    expect(p.can_invite).toBe(0);
    expect(p.can_manage_members).toBe(0);
  });

  test("viewer role has can_write=0 by default", () => {
    const u   = seedUser("u2v");
    const chId = seedChannel("ch3v", u.id);
    const p = getPerms(db, chId, "viewer");
    expect(p.can_write).toBe(0);
    expect(p.can_invite).toBe(0);
    expect(p.can_manage_members).toBe(0);
  });

  test("uses stored override when present", () => {
    const u    = seedUser("u3");
    const chId = seedChannel("ch4", u.id);
    db.prepare(`
      INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
      VALUES (?, 'member', 0, 0, 0, 0)
    `).run(chId);
    const p = getPerms(db, chId, "member");
    expect(p.can_write).toBe(0);
  });
});

// ─── GET /api/channels ────────────────────────────────────────────────────────

describe("GET /api/channels", () => {
  test("lists channels visible to the user", async () => {
    const user  = seedUser("alice");
    seedChannel("general", user.id);
    const token = signToken(user);
    const res   = await request(app).get("/api/channels")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.channels.some((c) => c.name === "general")).toBe(true);
  });

  test("does not expose private channels the user has no access to", async () => {
    const owner = seedUser("owner");
    const other = seedUser("other");
    seedChannel("secret", owner.id, 1);
    const res = await request(app).get("/api/channels")
      .set("Authorization", `Bearer ${signToken(other)}`);
    expect(res.body.channels.some((c) => c.name === "secret")).toBe(false);
  });

  test("non-member gets user_role=member on a public channel", async () => {
    const owner = seedUser("ch_owner");
    const other = seedUser("ch_other");
    seedChannel("public-ch", owner.id, 0);
    const res = await request(app).get("/api/channels")
      .set("Authorization", `Bearer ${signToken(other)}`);
    expect(res.status).toBe(200);
    const ch = res.body.channels.find((c) => c.name === "public-ch");
    expect(ch).toBeDefined();
    expect(ch.user_role).toBe("member");
  });

  test("viewer gets user_role=viewer on a public channel they are restricted on", async () => {
    const owner = seedUser("ch_owner2");
    const viewer = seedUser("ch_viewer");
    const chId = seedChannel("public-ch2", owner.id, 0);
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'viewer')").run(chId, viewer.id);
    const res = await request(app).get("/api/channels")
      .set("Authorization", `Bearer ${signToken(viewer)}`);
    const ch = res.body.channels.find((c) => c.name === "public-ch2");
    expect(ch.user_role).toBe("viewer");
  });
});

// ─── POST /api/channels ───────────────────────────────────────────────────────

describe("POST /api/channels", () => {
  test("creates a channel and returns it with user_role=owner", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const res   = await request(app).post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "new-channel", description: "test" });
    expect(res.status).toBe(201);
    expect(res.body.channel.name).toBe("new-channel");
    expect(res.body.channel.user_role).toBe("owner");
  });

  test("normalises channel name to lowercase with hyphens", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const res   = await request(app).post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "My Cool Channel!" });
    expect(res.body.channel.name).toBe("my-cool-channel-");
  });

  test("returns 400 when name is too short", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const res   = await request(app).post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "a" });
    expect(res.status).toBe(400);
  });

  test("returns 409 on duplicate channel name", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    await request(app).post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "dup-channel" });
    const res = await request(app).post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "dup-channel" });
    expect(res.status).toBe(409);
  });

  test("can create a private channel (is_private=1)", async () => {
    const user  = seedUser("alice");
    const token = signToken(user);
    const res   = await request(app).post("/api/channels")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "private-ch", is_private: 1 });
    expect(res.status).toBe(201);
  });
});

// ─── PATCH /api/channels/:id ─────────────────────────────────────────────────

describe("PATCH /api/channels/:id", () => {
  test("owner can update description", async () => {
    const user  = seedUser("alice");
    const chId  = seedChannel("testch", user.id);
    const token = signToken(user);
    const res   = await request(app).patch(`/api/channels/${chId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "new desc" });
    expect(res.status).toBe(200);
    expect(res.body.channel.description).toBe("new desc");
  });

  test("non-owner gets 403", async () => {
    const owner = seedUser("owner");
    const other = seedUser("other");
    const chId  = seedChannel("testch2", owner.id);
    const res   = await request(app).patch(`/api/channels/${chId}`)
      .set("Authorization", `Bearer ${signToken(other)}`)
      .send({ description: "hack" });
    expect(res.status).toBe(403);
  });

  test("returns 400 when no fields are supplied", async () => {
    const user  = seedUser("alice");
    const chId  = seedChannel("testch3", user.id);
    const res   = await request(app).patch(`/api/channels/${chId}`)
      .set("Authorization", `Bearer ${signToken(user)}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/channels/:id ────────────────────────────────────────────────

describe("DELETE /api/channels/:id", () => {
  test("owner can delete the channel", async () => {
    const user  = seedUser("alice");
    const chId  = seedChannel("todel", user.id);
    const res   = await request(app).delete(`/api/channels/${chId}`)
      .set("Authorization", `Bearer ${signToken(user)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("admin can delete any channel", async () => {
    const owner = seedUser("owner");
    const admin = seedUser("admin", "admin");
    const chId  = seedChannel("admindel", owner.id);
    const res   = await request(app).delete(`/api/channels/${chId}`)
      .set("Authorization", `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
  });

  test("non-owner/non-admin gets 403", async () => {
    const owner = seedUser("owner2");
    const other = seedUser("other2");
    const chId  = seedChannel("nodeldel", owner.id, 0);
    const res   = await request(app).delete(`/api/channels/${chId}`)
      .set("Authorization", `Bearer ${signToken(other)}`);
    expect(res.status).toBe(403);
  });

  test("returns 404 for unknown channel", async () => {
    const user = seedUser("alice");
    const res  = await request(app).delete("/api/channels/99999")
      .set("Authorization", `Bearer ${signToken(user)}`);
    expect(res.status).toBe(404);
  });
});

// ─── Channel Members ─────────────────────────────────────────────────────────

describe("Channel member management", () => {
  let owner, member, chId, ownerToken;

  beforeEach(() => {
    owner      = seedUser("owner");
    member     = seedUser("member");
    chId       = seedChannel("testch", owner.id);
    ownerToken = signToken(owner);
    // Give owner manage_members permission via default (owner role)
  });

  test("GET /:id/members returns member list", async () => {
    const res = await request(app).get(`/api/channels/${chId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
  });

  test("POST /:id/members adds a user by username", async () => {
    const res = await request(app).post(`/api/channels/${chId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ username: "member" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.username).toBe("member");
  });

  test("POST /:id/members returns 404 for unknown username", async () => {
    const res = await request(app).post(`/api/channels/${chId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ username: "nobody" });
    expect(res.status).toBe(404);
  });

  test("PATCH /:id/members/:userId changes role", async () => {
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, member.id);
    const res = await request(app).patch(`/api/channels/${chId}/members/${member.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "manager" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("manager");
  });

  test("PATCH /:id/members/:userId can set role to viewer", async () => {
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, member.id);
    const res = await request(app).patch(`/api/channels/${chId}/members/${member.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "viewer" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("viewer");
  });

  test("PATCH /:id/members/:userId returns 400 for invalid role", async () => {
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, member.id);
    const res = await request(app).patch(`/api/channels/${chId}/members/${member.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "superuser" });
    expect(res.status).toBe(400);
  });

  test("DELETE /:id/members/:userId kicks a member", async () => {
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, member.id);
    const res = await request(app).delete(`/api/channels/${chId}/members/${member.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT * FROM channel_members WHERE channel_id=? AND user_id=?").get(chId, member.id);
    expect(row).toBeUndefined();
  });

  test("DELETE /:id/members/:userId cannot kick the owner", async () => {
    const res = await request(app).delete(`/api/channels/${chId}/members/${owner.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── Permissions ─────────────────────────────────────────────────────────────

describe("Channel permissions", () => {
  let user, chId, token;

  beforeEach(() => {
    user  = seedUser("owner");
    chId  = seedChannel("permch", user.id);
    token = signToken(user);
  });

  test("GET /:id/permissions returns manager and member rows", async () => {
    const res = await request(app).get(`/api/channels/${chId}/permissions`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.manager).toBeDefined();
    expect(res.body.permissions.member).toBeDefined();
  });

  test("PUT /:id/permissions/:role upserts custom settings", async () => {
    const res = await request(app).put(`/api/channels/${chId}/permissions/member`)
      .set("Authorization", `Bearer ${token}`)
      .send({ can_write: 0, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const row = db.prepare("SELECT * FROM channel_permissions WHERE channel_id=? AND role='member'").get(chId);
    expect(row.can_write).toBe(0);
  });

  test("PUT /:id/permissions/:role returns 400 for invalid role", async () => {
    const res = await request(app).put(`/api/channels/${chId}/permissions/god`)
      .set("Authorization", `Bearer ${token}`)
      .send({ can_write: 1 });
    expect(res.status).toBe(400);
  });

  test("PUT /:id/permissions/:role returns 403 for non-owner", async () => {
    const other = seedUser("other");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, other.id);
    const res = await request(app).put(`/api/channels/${chId}/permissions/member`)
      .set("Authorization", `Bearer ${signToken(other)}`)
      .send({ can_write: 0 });
    expect(res.status).toBe(403);
  });
});

// ─── Invite links ─────────────────────────────────────────────────────────────

describe("Channel invite CRUD", () => {
  let owner, chId, token;

  beforeEach(() => {
    owner = seedUser("owner");
    chId  = seedChannel("invch", owner.id);
    token = signToken(owner);
    // Owner has full permissions by default
  });

  test("POST /:id/invites creates an invite", async () => {
    const res = await request(app).post(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.invite.code).toHaveLength(10);
  });

  test("POST /:id/invites stores maxUses and expiry", async () => {
    const res = await request(app).post(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${token}`)
      .send({ maxUses: 5, expiresInHours: 24 });
    expect(res.body.invite.max_uses).toBe(5);
    expect(res.body.invite.expires_at).not.toBeNull();
  });

  test("GET /:id/invites lists existing invites", async () => {
    await request(app).post(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${token}`).send({});
    const res = await request(app).get(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.invites.length).toBeGreaterThan(0);
  });

  test("DELETE /:id/invites/:code deletes invite", async () => {
    const created = await request(app).post(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${token}`).send({});
    const code = created.body.invite.code;
    const res  = await request(app).delete(`/api/channels/${chId}/invites/${code}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT * FROM channel_invites WHERE code = ?").get(code);
    expect(row).toBeUndefined();
  });

  test("member without can_invite permission gets 403 on POST invites", async () => {
    const member = seedUser("member");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, member.id);
    // Explicitly disable can_invite for members
    db.prepare(`
      INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
      VALUES (?, 'member', 1, 0, 0, 0)
    `).run(chId);
    const res = await request(app).post(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${signToken(member)}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test("member without can_invite gets 403 on GET invites", async () => {
    const member = seedUser("nolist");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, member.id);
    db.prepare(`
      INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
      VALUES (?, 'member', 1, 0, 0, 0)
    `).run(chId);
    const res = await request(app).get(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${signToken(member)}`);
    expect(res.status).toBe(403);
  });

  test("member without can_invite gets 403 on DELETE invite", async () => {
    // Create the invite as owner first
    const created = await request(app).post(`/api/channels/${chId}/invites`)
      .set("Authorization", `Bearer ${token}`).send({});
    const code = created.body.invite.code;

    const member = seedUser("nodel");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, member.id);
    db.prepare(`
      INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
      VALUES (?, 'member', 1, 0, 0, 0)
    `).run(chId);
    const res = await request(app).delete(`/api/channels/${chId}/invites/${code}`)
      .set("Authorization", `Bearer ${signToken(member)}`);
    expect(res.status).toBe(403);
  });
});

// ─── Missing branch coverage ──────────────────────────────────────────────────

describe("Channel member management — additional branch coverage", () => {
  let owner, chId, ownerToken;

  beforeEach(() => {
    owner      = seedUser("bowner");
    chId       = seedChannel("bch", owner.id);
    ownerToken = signToken(owner);
  });

  test("POST /:id/members returns 403 when user has no manage_members permission", async () => {
    const other = seedUser("bnoperm");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')")
      .run(chId, other.id);
    db.prepare(`
      INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
      VALUES (?, 'member', 1, 0, 0, 0)
    `).run(chId);
    const target = seedUser("btarget");
    const res = await request(app).post(`/api/channels/${chId}/members`)
      .set("Authorization", `Bearer ${signToken(other)}`)
      .send({ username: target.username });
    expect(res.status).toBe(403);
  });

  test("DELETE /:id/members/:userId returns 403 when user has no manage_members permission", async () => {
    const other  = seedUser("bdelperm");
    const target = seedUser("bdeltarget");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(chId, other.id);
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(chId, target.id);
    db.prepare(`
      INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
      VALUES (?, 'member', 1, 0, 0, 0)
    `).run(chId);
    const res = await request(app).delete(`/api/channels/${chId}/members/${target.id}`)
      .set("Authorization", `Bearer ${signToken(other)}`);
    expect(res.status).toBe(403);
  });

  test("PATCH /:id/members/:userId returns 403 when manager tries to assign manager role", async () => {
    const mgr    = seedUser("bmgr");
    const target = seedUser("bmgrtarget");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'manager')").run(chId, mgr.id);
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(chId, target.id);
    const res = await request(app).patch(`/api/channels/${chId}/members/${target.id}`)
      .set("Authorization", `Bearer ${signToken(mgr)}`)
      .send({ role: "manager" });
    expect(res.status).toBe(403);
  });

  test("PATCH /:id/members/:userId returns 403 when trying to change owner's role", async () => {
    const mgr = seedUser("bmgr2");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'manager')").run(chId, mgr.id);
    const res = await request(app).patch(`/api/channels/${chId}/members/${owner.id}`)
      .set("Authorization", `Bearer ${signToken(mgr)}`)
      .send({ role: "member" });
    expect(res.status).toBe(403);
  });

  test("PATCH /:id/members/:userId returns 403 when caller is plain member", async () => {
    const member = seedUser("bplainmember");
    const target = seedUser("bplaintarget");
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(chId, member.id);
    db.prepare("INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(chId, target.id);
    const res = await request(app).patch(`/api/channels/${chId}/members/${target.id}`)
      .set("Authorization", `Bearer ${signToken(member)}`)
      .send({ role: "member" });
    expect(res.status).toBe(403);
  });
});
