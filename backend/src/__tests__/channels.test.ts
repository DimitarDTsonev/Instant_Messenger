/**
 * Channels API integration tests — exercises CRUD operations for channels,
 * channel members, and channel permissions using a real in-memory SQLite
 * database.
 *
 * Covers: create/list/update/delete channels, member add/remove/role-change,
 * permission overrides, private channel access control, and role-based
 * authorization gates.
 */
import request from "supertest";
import bcrypt from "bcryptjs";

import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import { createTestApp } from "../test-utils/createTestApp";
import { clearDb, createTestDb } from "../test-utils/createTestDb";
import { getUserRole, getPerms } from "../routes/channels";

jest.mock("../db/database", () => ({ getDb: jest.fn(), initDatabase: jest.fn() }));
const mockedGetDb = getDb as jest.Mock;

let app, db;

beforeAll(() => {
  db = createTestDb();
  mockedGetDb.mockReturnValue(db);
  app = createTestApp();
});

beforeEach(() => clearDb(db));

function seedUser(username: string, role = "member") {
  const hash = bcrypt.hashSync("pw", 1);
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)"
  ).run(username, `${username}@t.com`, hash, role);
  return { id: Number(lastInsertRowid), username, role };
}

function tok(user: { id: number; username: string; role?: string }) {
  return signToken({ ...user, email: `${user.username}@t.com` });
}

function seedChannel(name: string, creatorId: number, isPrivate = 0) {
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO channels (name, description, created_by, is_private) VALUES (?, ?, ?, ?)"
  ).run(name, "desc", creatorId, isPrivate);
  const id = Number(lastInsertRowid);
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')").run(id, creatorId);
  return id;
}

function addMember(channelId: number, userId: number, role = "member") {
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)").run(channelId, userId, role);
}

describe("getUserRole", () => {
  test("returns explicit role from channel_members", () => {
    const u = seedUser("roleuser");
    const cid = seedChannel("role-ch", u.id);
    expect(getUserRole(db, u.id, cid)).toBe("owner");
  });

  test("returns 'owner' when user is created_by but has no membership row", () => {
    const u = seedUser("creator");
    const { lastInsertRowid } = db.prepare(
      "INSERT INTO channels (name, created_by, is_private) VALUES (?, ?, 0)"
    ).run("creator-ch", u.id);
    expect(getUserRole(db, u.id, Number(lastInsertRowid))).toBe("owner");
  });

  test("returns null for non-existent channel", () => {
    const u = seedUser("nobody");
    expect(getUserRole(db, u.id, 9999)).toBeNull();
  });

  test("returns null for private channel with no membership", () => {
    const owner = seedUser("priv-owner");
    const other = seedUser("priv-other");
    const cid = seedChannel("priv-ch", owner.id, 1);
    expect(getUserRole(db, other.id, cid)).toBeNull();
  });

  test("returns 'member' for public channel with no membership row", () => {
    const owner = seedUser("pub-owner");
    const other = seedUser("pub-other");
    const cid = seedChannel("pub-ch", owner.id, 0);
    expect(getUserRole(db, other.id, cid)).toBe("member");
  });
});

describe("getPerms", () => {
  test("returns full perms for 'owner' role", () => {
    const u = seedUser("perm-owner");
    const cid = seedChannel("perm-ch", u.id);
    const p = getPerms(db, cid, "owner");
    expect(p).toMatchObject({ can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 });
  });

  test("returns member defaults when role is null", () => {
    const u = seedUser("perm-null");
    const cid = seedChannel("perm-null-ch", u.id);
    const p = getPerms(db, cid, null);
    expect(p).toMatchObject({ can_write: 1, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 });
  });

  test("returns default manager perms when no custom row", () => {
    const u = seedUser("perm-mgr");
    const cid = seedChannel("perm-mgr-ch", u.id);
    const p = getPerms(db, cid, "manager");
    expect(p).toMatchObject({ can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 });
  });

  test("returns stored row when custom permission exists", () => {
    const u = seedUser("perm-custom");
    const cid = seedChannel("perm-custom-ch", u.id);
    db.prepare(
      "INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages) VALUES (?, 'member', 0, 0, 0, 0)"
    ).run(cid);
    const p = getPerms(db, cid, "member");
    expect(p.can_write).toBe(0);
  });
});

describe("GET /api/channels", () => {
  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/channels");
    expect(res.status).toBe(401);
  });

  test("returns public channels", async () => {
    const u = seedUser("list-user");
    seedChannel("public-ch", u.id, 0);
    const res = await request(app)
      .get("/api/channels")
      .set("Authorization", `Bearer ${tok(u)}`);
    expect(res.status).toBe(200);
    expect(res.body.channels.some((c) => c.name === "public-ch")).toBe(true);
  });

  test("does not return private channels the user has no access to", async () => {
    const owner = seedUser("priv-list-owner");
    const other = seedUser("priv-list-other");
    seedChannel("secret-ch", owner.id, 1);
    const res = await request(app)
      .get("/api/channels")
      .set("Authorization", `Bearer ${tok(other)}`);
    expect(res.status).toBe(200);
    expect(res.body.channels.some((c) => c.name === "secret-ch")).toBe(false);
  });

  test("returns private channel when user is a member", async () => {
    const owner = seedUser("priv-m-owner");
    const member = seedUser("priv-m-member");
    const cid = seedChannel("priv-member-ch", owner.id, 1);
    addMember(cid, member.id);
    const res = await request(app)
      .get("/api/channels")
      .set("Authorization", `Bearer ${tok(member)}`);
    expect(res.status).toBe(200);
    expect(res.body.channels.some((c) => c.name === "priv-member-ch")).toBe(true);
  });
});

describe("POST /api/channels", () => {
  test("returns 401 without token", async () => {
    const res = await request(app).post("/api/channels").send({ name: "new-ch" });
    expect(res.status).toBe(401);
  });

  test("returns 400 when name is too short", async () => {
    const u = seedUser("create-short");
    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ name: "a" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 2/);
  });

  test("returns 400 when name is missing", async () => {
    const u = seedUser("create-missing");
    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("returns 409 when channel name already exists", async () => {
    const u = seedUser("create-dup");
    seedChannel("dup-ch", u.id);
    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ name: "dup-ch" });
    expect(res.status).toBe(409);
  });

  test("creates channel and returns 201", async () => {
    const u = seedUser("create-ok");
    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ name: "brand-new", description: "test desc", is_private: 1 });
    expect(res.status).toBe(201);
    expect(res.body.channel.name).toBe("brand-new");
    expect(res.body.channel.user_role).toBe("owner");
  });

  test("normalises channel name to lowercase with hyphens", async () => {
    const u = seedUser("create-norm");
    const res = await request(app)
      .post("/api/channels")
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ name: "Hello World!" });
    expect(res.status).toBe(201);
    expect(res.body.channel.name).toBe("hello-world-");
  });
});

describe("PATCH /api/channels/:id", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("patch-unauth");
    const cid = seedChannel("patch-unauth-ch", u.id);
    const res = await request(app).patch(`/api/channels/${cid}`).send({ description: "x" });
    expect(res.status).toBe(401);
  });

  test("returns 403 for non-owner", async () => {
    const owner = seedUser("patch-owner");
    const other = seedUser("patch-other");
    const cid = seedChannel("patch-ch", owner.id);
    addMember(cid, other.id);
    const res = await request(app)
      .patch(`/api/channels/${cid}`)
      .set("Authorization", `Bearer ${tok(other)}`)
      .send({ description: "new desc" });
    expect(res.status).toBe(403);
  });

  test("returns 400 when no fields provided", async () => {
    const u = seedUser("patch-empty");
    const cid = seedChannel("patch-empty-ch", u.id);
    const res = await request(app)
      .patch(`/api/channels/${cid}`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("updates description successfully", async () => {
    const u = seedUser("patch-ok");
    const cid = seedChannel("patch-ok-ch", u.id);
    const res = await request(app)
      .patch(`/api/channels/${cid}`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ description: "updated" });
    expect(res.status).toBe(200);
    expect(res.body.channel.description).toBe("updated");
  });

  test("updates is_private successfully", async () => {
    const u = seedUser("patch-priv");
    const cid = seedChannel("patch-priv-ch", u.id);
    const res = await request(app)
      .patch(`/api/channels/${cid}`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ is_private: 1 });
    expect(res.status).toBe(200);
    expect(res.body.channel.is_private).toBe(1);
  });
});

describe("DELETE /api/channels/:id", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("del-unauth");
    const cid = seedChannel("del-unauth-ch", u.id);
    const res = await request(app).delete(`/api/channels/${cid}`);
    expect(res.status).toBe(401);
  });

  test("returns 404 for non-existent channel", async () => {
    const u = seedUser("del-notfound");
    const res = await request(app)
      .delete("/api/channels/9999")
      .set("Authorization", `Bearer ${tok(u)}`);
    expect(res.status).toBe(404);
  });

  test("returns 403 for non-owner non-admin", async () => {
    const owner = seedUser("del-owner");
    const other = seedUser("del-other");
    const cid = seedChannel("del-ch", owner.id);
    addMember(cid, other.id);
    const res = await request(app)
      .delete(`/api/channels/${cid}`)
      .set("Authorization", `Bearer ${tok(other)}`);
    expect(res.status).toBe(403);
  });

  test("owner can delete channel", async () => {
    const u = seedUser("del-ok-owner");
    const cid = seedChannel("del-ok-ch", u.id);
    const res = await request(app)
      .delete(`/api/channels/${cid}`)
      .set("Authorization", `Bearer ${tok(u)}`);
    expect(res.status).toBe(204);
  });

  test("admin can delete any channel", async () => {
    const owner = seedUser("del-admin-owner");
    const admin = seedUser("del-admin", "admin");
    const cid = seedChannel("del-admin-ch", owner.id);
    const res = await request(app)
      .delete(`/api/channels/${cid}`)
      .set("Authorization", `Bearer ${tok(admin)}`);
    expect(res.status).toBe(204);
  });
});

describe("GET /api/channels/:id/members", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("mem-unauth");
    const cid = seedChannel("mem-unauth-ch", u.id);
    const res = await request(app).get(`/api/channels/${cid}/members`);
    expect(res.status).toBe(401);
  });

  test("returns 403 for user with no access to private channel", async () => {
    const owner = seedUser("mem-priv-owner");
    const other = seedUser("mem-priv-other");
    const cid = seedChannel("mem-priv-ch", owner.id, 1);
    const res = await request(app)
      .get(`/api/channels/${cid}/members`)
      .set("Authorization", `Bearer ${tok(other)}`);
    expect(res.status).toBe(403);
  });

  test("returns member list", async () => {
    const owner = seedUser("mem-ok-owner");
    const member = seedUser("mem-ok-member");
    const cid = seedChannel("mem-ok-ch", owner.id);
    addMember(cid, member.id);
    const res = await request(app)
      .get(`/api/channels/${cid}/members`)
      .set("Authorization", `Bearer ${tok(owner)}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members.length).toBeGreaterThanOrEqual(2);
  });
});

describe("POST /api/channels/:id/members", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("addm-unauth");
    const cid = seedChannel("addm-unauth-ch", u.id);
    const res = await request(app).post(`/api/channels/${cid}/members`).send({ username: "x" });
    expect(res.status).toBe(401);
  });

  test("returns 403 for member without manage_members permission", async () => {
    const owner = seedUser("addm-owner");
    const member = seedUser("addm-member");
    const target = seedUser("addm-target");
    const cid = seedChannel("addm-noperm-ch", owner.id);
    addMember(cid, member.id, "member");
    const res = await request(app)
      .post(`/api/channels/${cid}/members`)
      .set("Authorization", `Bearer ${tok(member)}`)
      .send({ username: target.username });
    expect(res.status).toBe(403);
  });

  test("returns 400 when username is missing", async () => {
    const u = seedUser("addm-nousername");
    const cid = seedChannel("addm-nousername-ch", u.id);
    const res = await request(app)
      .post(`/api/channels/${cid}/members`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test("returns 404 when username not found", async () => {
    const u = seedUser("addm-notfound");
    const cid = seedChannel("addm-notfound-ch", u.id);
    const res = await request(app)
      .post(`/api/channels/${cid}/members`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ username: "ghost-user-xyz" });
    expect(res.status).toBe(404);
  });

  test("owner adds member successfully", async () => {
    const owner = seedUser("addm-ok-owner");
    const newMember = seedUser("addm-ok-member");
    const cid = seedChannel("addm-ok-ch", owner.id);
    const res = await request(app)
      .post(`/api/channels/${cid}/members`)
      .set("Authorization", `Bearer ${tok(owner)}`)
      .send({ username: newMember.username });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.username).toBe(newMember.username);
  });
});

describe("PATCH /api/channels/:id/members/:userId", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("role-unauth");
    const cid = seedChannel("role-unauth-ch", u.id);
    const res = await request(app).patch(`/api/channels/${cid}/members/999`).send({ role: "member" });
    expect(res.status).toBe(401);
  });

  test("returns 403 when caller is not owner or manager", async () => {
    const owner = seedUser("role-owner");
    const member = seedUser("role-member");
    const target = seedUser("role-target");
    const cid = seedChannel("role-noperm-ch", owner.id);
    addMember(cid, member.id, "member");
    addMember(cid, target.id, "member");
    const res = await request(app)
      .patch(`/api/channels/${cid}/members/${target.id}`)
      .set("Authorization", `Bearer ${tok(member)}`)
      .send({ role: "member" });
    expect(res.status).toBe(403);
  });

  test("returns 400 for invalid role value", async () => {
    const owner = seedUser("role-invalid-owner");
    const target = seedUser("role-invalid-target");
    const cid = seedChannel("role-invalid-ch", owner.id);
    addMember(cid, target.id, "member");
    const res = await request(app)
      .patch(`/api/channels/${cid}/members/${target.id}`)
      .set("Authorization", `Bearer ${tok(owner)}`)
      .send({ role: "superuser" });
    expect(res.status).toBe(400);
  });

  test("returns 403 when manager tries to assign manager role", async () => {
    const owner = seedUser("role-mgr-owner");
    const manager = seedUser("role-mgr-mgr");
    const target = seedUser("role-mgr-target");
    const cid = seedChannel("role-mgr-ch", owner.id);
    addMember(cid, manager.id, "manager");
    addMember(cid, target.id, "member");
    const res = await request(app)
      .patch(`/api/channels/${cid}/members/${target.id}`)
      .set("Authorization", `Bearer ${tok(manager)}`)
      .send({ role: "manager" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only the owner/i);
  });

  test("returns 403 when trying to change owner role", async () => {
    const owner = seedUser("role-chown-owner");
    const manager = seedUser("role-chown-mgr");
    const cid = seedChannel("role-chown-ch", owner.id);
    addMember(cid, manager.id, "manager");
    const res = await request(app)
      .patch(`/api/channels/${cid}/members/${owner.id}`)
      .set("Authorization", `Bearer ${tok(manager)}`)
      .send({ role: "member" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner role cannot/i);
  });

  test("owner changes member role to manager", async () => {
    const owner = seedUser("role-ok-owner");
    const target = seedUser("role-ok-target");
    const cid = seedChannel("role-ok-ch", owner.id);
    addMember(cid, target.id, "member");
    const res = await request(app)
      .patch(`/api/channels/${cid}/members/${target.id}`)
      .set("Authorization", `Bearer ${tok(owner)}`)
      .send({ role: "manager" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("manager");
  });
});

describe("DELETE /api/channels/:id/members/:userId", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("kick-unauth");
    const cid = seedChannel("kick-unauth-ch", u.id);
    const res = await request(app).delete(`/api/channels/${cid}/members/999`);
    expect(res.status).toBe(401);
  });

  test("returns 403 when caller lacks manage_members permission", async () => {
    const owner = seedUser("kick-owner");
    const member = seedUser("kick-member");
    const target = seedUser("kick-target");
    const cid = seedChannel("kick-noperm-ch", owner.id);
    addMember(cid, member.id, "member");
    addMember(cid, target.id, "member");
    const res = await request(app)
      .delete(`/api/channels/${cid}/members/${target.id}`)
      .set("Authorization", `Bearer ${tok(member)}`);
    expect(res.status).toBe(403);
  });

  test("returns 403 when trying to kick the owner", async () => {
    const owner = seedUser("kick-own-owner");
    const manager = seedUser("kick-own-mgr");
    const cid = seedChannel("kick-own-ch", owner.id);
    addMember(cid, manager.id, "manager");
    const res = await request(app)
      .delete(`/api/channels/${cid}/members/${owner.id}`)
      .set("Authorization", `Bearer ${tok(manager)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner cannot/i);
  });

  test("owner removes member successfully", async () => {
    const owner = seedUser("kick-ok-owner");
    const target = seedUser("kick-ok-target");
    const cid = seedChannel("kick-ok-ch", owner.id);
    addMember(cid, target.id, "member");
    const res = await request(app)
      .delete(`/api/channels/${cid}/members/${target.id}`)
      .set("Authorization", `Bearer ${tok(owner)}`);
    expect(res.status).toBe(204);
  });
});

describe("GET /api/channels/:id/permissions", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("perms-unauth");
    const cid = seedChannel("perms-unauth-ch", u.id);
    const res = await request(app).get(`/api/channels/${cid}/permissions`);
    expect(res.status).toBe(401);
  });

  test("returns 403 for user with no channel access", async () => {
    const owner = seedUser("perms-priv-owner");
    const other = seedUser("perms-priv-other");
    const cid = seedChannel("perms-priv-ch", owner.id, 1);
    const res = await request(app)
      .get(`/api/channels/${cid}/permissions`)
      .set("Authorization", `Bearer ${tok(other)}`);
    expect(res.status).toBe(403);
  });

  test("returns default permissions when no custom rows", async () => {
    const u = seedUser("perms-default");
    const cid = seedChannel("perms-default-ch", u.id);
    const res = await request(app)
      .get(`/api/channels/${cid}/permissions`)
      .set("Authorization", `Bearer ${tok(u)}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.manager).toBeDefined();
    expect(res.body.permissions.member).toBeDefined();
  });

  test("returns stored custom permissions", async () => {
    const u = seedUser("perms-custom");
    const cid = seedChannel("perms-custom-ch", u.id);
    db.prepare(
      "INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages) VALUES (?, 'member', 0, 0, 0, 0)"
    ).run(cid);
    const res = await request(app)
      .get(`/api/channels/${cid}/permissions`)
      .set("Authorization", `Bearer ${tok(u)}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions.member.can_write).toBe(0);
  });
});

describe("PUT /api/channels/:id/permissions/:role", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("putperms-unauth");
    const cid = seedChannel("putperms-unauth-ch", u.id);
    const res = await request(app).put(`/api/channels/${cid}/permissions/member`).send({});
    expect(res.status).toBe(401);
  });

  test("returns 403 for non-owner", async () => {
    const owner = seedUser("putperms-owner");
    const member = seedUser("putperms-member");
    const cid = seedChannel("putperms-noperm-ch", owner.id);
    addMember(cid, member.id);
    const res = await request(app)
      .put(`/api/channels/${cid}/permissions/member`)
      .set("Authorization", `Bearer ${tok(member)}`)
      .send({ can_write: 0 });
    expect(res.status).toBe(403);
  });

  test("returns 400 for invalid role", async () => {
    const u = seedUser("putperms-invalid");
    const cid = seedChannel("putperms-invalid-ch", u.id);
    const res = await request(app)
      .put(`/api/channels/${cid}/permissions/owner`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ can_write: 1 });
    expect(res.status).toBe(400);
  });

  test("owner sets permissions successfully for member role", async () => {
    const u = seedUser("putperms-ok");
    const cid = seedChannel("putperms-ok-ch", u.id);
    const res = await request(app)
      .put(`/api/channels/${cid}/permissions/member`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ can_write: 0, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("owner sets permissions for manager role", async () => {
    const u = seedUser("putperms-mgr");
    const cid = seedChannel("putperms-mgr-ch", u.id);
    const res = await request(app)
      .put(`/api/channels/${cid}/permissions/manager`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/channels/:id/invites", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("inv-create-unauth");
    const cid = seedChannel("inv-create-unauth-ch", u.id);
    const res = await request(app).post(`/api/channels/${cid}/invites`).send({});
    expect(res.status).toBe(401);
  });

  test("returns 403 for member without can_invite", async () => {
    const owner = seedUser("inv-create-owner");
    const member = seedUser("inv-create-member");
    const cid = seedChannel("inv-create-noperm-ch", owner.id);
    addMember(cid, member.id, "member");
    // member role defaults to can_invite = 0
    const res = await request(app)
      .post(`/api/channels/${cid}/invites`)
      .set("Authorization", `Bearer ${tok(member)}`)
      .send({});
    expect(res.status).toBe(403);
  });

  test("owner creates invite successfully", async () => {
    const u = seedUser("inv-create-ok");
    const cid = seedChannel("inv-create-ok-ch", u.id);
    const res = await request(app)
      .post(`/api/channels/${cid}/invites`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.invite.code).toBeDefined();
  });

  test("creates invite with maxUses and expiresInHours", async () => {
    const u = seedUser("inv-create-opts");
    const cid = seedChannel("inv-create-opts-ch", u.id);
    const res = await request(app)
      .post(`/api/channels/${cid}/invites`)
      .set("Authorization", `Bearer ${tok(u)}`)
      .send({ maxUses: 5, expiresInHours: 24 });
    expect(res.status).toBe(201);
    expect(res.body.invite.max_uses).toBe(5);
    expect(res.body.invite.expires_at).not.toBeNull();
  });
});

describe("GET /api/channels/:id/invites", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("inv-list-unauth");
    const cid = seedChannel("inv-list-unauth-ch", u.id);
    const res = await request(app).get(`/api/channels/${cid}/invites`);
    expect(res.status).toBe(401);
  });

  test("returns 403 for member without can_invite", async () => {
    const owner = seedUser("inv-list-owner");
    const member = seedUser("inv-list-member");
    const cid = seedChannel("inv-list-noperm-ch", owner.id);
    addMember(cid, member.id, "member");
    const res = await request(app)
      .get(`/api/channels/${cid}/invites`)
      .set("Authorization", `Bearer ${tok(member)}`);
    expect(res.status).toBe(403);
  });

  test("returns invite list for owner", async () => {
    const u = seedUser("inv-list-ok");
    const cid = seedChannel("inv-list-ok-ch", u.id);
    db.prepare(
      "INSERT INTO channel_invites (channel_id, created_by, code) VALUES (?, ?, ?)"
    ).run(cid, u.id, "testcode01");
    const res = await request(app)
      .get(`/api/channels/${cid}/invites`)
      .set("Authorization", `Bearer ${tok(u)}`);
    expect(res.status).toBe(200);
    expect(res.body.invites.some((i) => i.code === "testcode01")).toBe(true);
  });
});

describe("DELETE /api/channels/:id/invites/:code", () => {
  test("returns 401 without token", async () => {
    const u = seedUser("inv-del-unauth");
    const cid = seedChannel("inv-del-unauth-ch", u.id);
    const res = await request(app).delete(`/api/channels/${cid}/invites/somecode`);
    expect(res.status).toBe(401);
  });

  test("returns 403 for member without can_invite", async () => {
    const owner = seedUser("inv-del-owner");
    const member = seedUser("inv-del-member");
    const cid = seedChannel("inv-del-noperm-ch", owner.id);
    addMember(cid, member.id, "member");
    const res = await request(app)
      .delete(`/api/channels/${cid}/invites/anycode`)
      .set("Authorization", `Bearer ${tok(member)}`);
    expect(res.status).toBe(403);
  });

  test("owner revokes invite successfully", async () => {
    const u = seedUser("inv-del-ok");
    const cid = seedChannel("inv-del-ok-ch", u.id);
    db.prepare(
      "INSERT INTO channel_invites (channel_id, created_by, code) VALUES (?, ?, ?)"
    ).run(cid, u.id, "revokeme01");
    const res = await request(app)
      .delete(`/api/channels/${cid}/invites/revokeme01`)
      .set("Authorization", `Bearer ${tok(u)}`);
    expect(res.status).toBe(204);
  });
});