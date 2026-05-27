import type { ChannelRole, Db, PermissionSet } from "../types";

export const DEFAULT_PERMS: Record<Exclude<ChannelRole, "owner">, PermissionSet> = {
  manager: { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 },
  member:  { can_write: 1, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
  viewer:  { can_write: 0, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
};

export function getUserRole(db: Db, userId: number | string, channelId: number | string): ChannelRole | null {
  const row = db
    .prepare("SELECT role FROM channel_members WHERE channel_id = ? AND user_id = ?")
    .get(channelId, userId) as { role: ChannelRole } | undefined;
  if (row) return row.role;

  const ch = db
    .prepare("SELECT created_by, is_private FROM channels WHERE id = ?")
    .get(channelId) as { created_by: number; is_private: number } | undefined;
  if (!ch) return null;
  if (Number(ch.created_by) === Number(userId)) return "owner";
  if (ch.is_private) return null;
  return "member";
}

export function getPerms(db: Db, channelId: number | string, role: ChannelRole | null): PermissionSet {
  if (role === "owner") return { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 };
  if (!role) return DEFAULT_PERMS.member;
  const row = db
    .prepare("SELECT * FROM channel_permissions WHERE channel_id = ? AND role = ?")
    .get(channelId, role) as PermissionSet | undefined;
  return row || DEFAULT_PERMS[role as Exclude<ChannelRole, "owner">] || DEFAULT_PERMS.member;
}

export function findAllForUser(db: Db, userId: number) {
  return db
    .prepare(
      `SELECT
        c.id, c.name, c.description, c.is_private, c.created_by, c.created_at,
        u.username AS created_by_username,
        COALESCE(cm.role,
          CASE WHEN c.created_by = ? THEN 'owner'
               WHEN c.is_private = 0 THEN 'member'
               ELSE NULL END
        ) AS user_role,
        (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count
      FROM channels c
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
      WHERE c.is_private = 0
         OR cm.user_id IS NOT NULL
         OR c.created_by = ?
      ORDER BY c.name`,
    )
    .all(userId, userId, userId);
}

export function findById(db: Db, id: number | string) {
  return db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as {
    id: number;
    name: string;
    description?: string;
    is_private: number;
    created_by: number;
  } | undefined;
}

export function findByName(db: Db, name: string): { id: number } | undefined {
  return db.prepare("SELECT id FROM channels WHERE name = ?").get(name) as { id: number } | undefined;
}

export type CreateChannelData = { name: string; description: string; createdBy: number; isPrivate: boolean };

export function create(db: Db, data: CreateChannelData): number {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO channels (name, description, created_by, is_private) VALUES (?, ?, ?, ?)")
    .run(data.name, data.description, data.createdBy, data.isPrivate ? 1 : 0);

  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, data.createdBy);

  return Number(lastInsertRowid);
}

export function update(db: Db, id: number | string, fields: { description?: string; is_private?: number }) {
  const updates: string[] = [];
  const vals: unknown[] = [];
  if (fields.description !== undefined) { updates.push("description = ?"); vals.push(fields.description); }
  if (fields.is_private  !== undefined) { updates.push("is_private = ?");  vals.push(fields.is_private); }
  if (!updates.length) return;
  vals.push(id);
  db.prepare(`UPDATE channels SET ${updates.join(", ")} WHERE id = ?`).run(...(vals as Parameters<ReturnType<Db["prepare"]>["run"]>));
}

export function remove(db: Db, id: number | string) {
  db.prepare("DELETE FROM channels WHERE id = ?").run(id);
}

export function findWithOwnerRole(db: Db, id: number | bigint) {
  return db.prepare("SELECT c.*, 'owner' AS user_role FROM channels c WHERE c.id = ?").get(id);
}

export function findWithUserRole(db: Db, channelId: number, userId: number) {
  return db
    .prepare(
      `SELECT c.*, COALESCE(cm.role, 'member') AS user_role
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
       WHERE c.id = ?`,
    )
    .get(userId, channelId);
}

// Members
export function getMembers(db: Db, channelId: number | string) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.avatar, u.role AS global_role, cm.role AS channel_role, cm.joined_at
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = ?
       ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.username`,
    )
    .all(channelId);
}

export function addMember(db: Db, channelId: number | string, userId: number, role = "member") {
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)").run(channelId, userId, role);
}

export function updateMemberRole(db: Db, channelId: number | string, userId: number | string, role: string) {
  db.prepare("UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?").run(role, channelId, userId);
}

export function removeMember(db: Db, channelId: number | string, userId: number | string) {
  db.prepare("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?").run(channelId, userId);
}

// Permissions
export function getPermissions(db: Db, channelId: number | string) {
  return db.prepare("SELECT * FROM channel_permissions WHERE channel_id = ?").all(channelId);
}

export function upsertPermission(
  db: Db,
  channelId: number | string,
  role: string,
  perms: { can_write: number; can_invite: number; can_manage_members: number; can_delete_messages: number },
) {
  db.prepare(
    `INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel_id, role) DO UPDATE SET
       can_write           = excluded.can_write,
       can_invite          = excluded.can_invite,
       can_manage_members  = excluded.can_manage_members,
       can_delete_messages = excluded.can_delete_messages`,
  ).run(channelId, role, perms.can_write, perms.can_invite, perms.can_manage_members, perms.can_delete_messages);
}

// Channel invites
export function findInviteByCode(db: Db, code: string) {
  return db.prepare("SELECT * FROM channel_invites WHERE code = ?").get(code) as {
    id: number; channel_id: number; expires_at?: string | null;
    max_uses?: number | null; uses_count: number; [key: string]: unknown;
  } | undefined;
}

export function findInviteByCodeWithDetails(db: Db, code: string) {
  return db
    .prepare(
      `SELECT ci.*,
              c.name        AS channel_name,
              c.description AS channel_description,
              c.is_private,
              u.username    AS created_by_username,
              (SELECT COUNT(*) FROM channel_members WHERE channel_id = ci.channel_id) AS member_count
       FROM channel_invites ci
       JOIN channels c ON c.id = ci.channel_id
       JOIN users    u ON u.id = ci.created_by
       WHERE ci.code = ?`,
    )
    .get(code);
}

export function getInvites(db: Db, channelId: number | string) {
  return db
    .prepare(
      `SELECT ci.*, u.username AS created_by_username
       FROM channel_invites ci
       JOIN users u ON u.id = ci.created_by
       WHERE ci.channel_id = ?
       ORDER BY ci.created_at DESC`,
    )
    .all(channelId);
}

export function createInvite(db: Db, data: { channelId: number | string; createdBy: number; code: string; maxUses?: number | null; expiresAt?: string | null }) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO channel_invites (channel_id, created_by, code, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(data.channelId, data.createdBy, data.code, data.maxUses ?? null, data.expiresAt ?? null);
  return db.prepare("SELECT * FROM channel_invites WHERE id = ?").get(lastInsertRowid);
}

export function deleteInvite(db: Db, channelId: number | string, code: string) {
  db.prepare("DELETE FROM channel_invites WHERE channel_id = ? AND code = ?").run(channelId, code);
}

export function incrementInviteUses(db: Db, id: number) {
  db.prepare("UPDATE channel_invites SET uses_count = uses_count + 1 WHERE id = ?").run(id);
}

export function getMemberCount(db: Db, channelId: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM channel_members WHERE channel_id = ?").get(channelId) as { n: number }).n;
}
