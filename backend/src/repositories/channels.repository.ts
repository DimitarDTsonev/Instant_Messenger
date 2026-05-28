/**
 * Channels repository — all direct database access for the `channels`,
 * `channel_members`, `channel_permissions`, and `channel_invites` tables.
 *
 * Also exports `getUserRole` and `getPerms` which are re-exported by
 * `routes/channels/index.ts` for use in the socket handlers.
 *
 * `DEFAULT_PERMS` defines the fallback permission sets when no explicit
 * override exists in `channel_permissions` for a given channel + role.
 *
 * Imported by: channels.service.ts, invites.service.ts,
 *              socket/messageHandlers.ts, socket/presenceHandlers.ts (via routes/channels).
 */

import type { ChannelRole, Db, PermissionSet } from "../types";

/**
 * Fallback permission sets applied when no custom override exists in the
 * `channel_permissions` table for a given channel+role pair.
 *
 * Owners always have all permissions (hardcoded in `getPerms`).
 */
export const DEFAULT_PERMS: Record<Exclude<ChannelRole, "owner">, PermissionSet> = {
  manager: { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 },
  member:  { can_write: 1, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
  viewer:  { can_write: 0, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
};

/**
 * Determines the effective channel role for a user.
 *
 * Resolution order:
 *  1. Explicit row in `channel_members`.
 *  2. If the user created the channel → "owner".
 *  3. If the channel is public → "member" (implicit public membership).
 *  4. Otherwise → `null` (no access).
 *
 * @param db        - Database instance.
 * @param userId    - User whose role to look up.
 * @param channelId - Target channel.
 * @returns         The effective ChannelRole, or `null` if the user has no access.
 */
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
  // Public channels: any user implicitly has member-level access
  if (ch.is_private) return null;
  return "member";
}

/**
 * Returns the effective permission set for a role in a channel.
 *
 * Checks `channel_permissions` for an explicit override; falls back to
 * `DEFAULT_PERMS` if none is found. Owners always have full permissions.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @param role      - The channel role to look up.
 * @returns         PermissionSet with boolean-like integer flags.
 */
export function getPerms(db: Db, channelId: number | string, role: ChannelRole | null): PermissionSet {
  if (role === "owner") return { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 };
  if (!role) return DEFAULT_PERMS.member;
  const row = db
    .prepare("SELECT * FROM channel_permissions WHERE channel_id = ? AND role = ?")
    .get(channelId, role) as PermissionSet | undefined;
  return row || DEFAULT_PERMS[role as Exclude<ChannelRole, "owner">] || DEFAULT_PERMS.member;
}

/**
 * Returns all channels visible to a user (public + private ones they are a member of),
 * with the user's effective role and message count attached.
 *
 * @param db     - Database instance.
 * @param userId - User whose visible channels to return.
 * @returns      Array of channel objects with `user_role` and `message_count`.
 */
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

/**
 * Fetches a raw channel row by primary key.
 *
 * @param db - Database instance.
 * @param id - Channel primary key.
 * @returns  Raw channel row, or `undefined` if not found.
 */
export function findById(db: Db, id: number | string) {
  return db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as {
    id: number;
    name: string;
    description?: string;
    is_private: number;
    created_by: number;
  } | undefined;
}

/**
 * Looks up a channel by its unique name.
 *
 * @param db   - Database instance.
 * @param name - Normalised channel name (lowercase, hyphens).
 * @returns    `{ id }` if found, or `undefined`.
 */
export function findByName(db: Db, name: string): { id: number } | undefined {
  return db.prepare("SELECT id FROM channels WHERE name = ?").get(name) as { id: number } | undefined;
}

/** Data required to create a new channel row. */
export type CreateChannelData = { name: string; description: string; createdBy: number; isPrivate: boolean };

/**
 * Inserts a new channel and adds the creator as owner in `channel_members`.
 *
 * @param db   - Database instance.
 * @param data - Channel fields.
 * @returns    The new channel's auto-incremented ID.
 */
export function create(db: Db, data: CreateChannelData): number {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO channels (name, description, created_by, is_private) VALUES (?, ?, ?, ?)")
    .run(data.name, data.description, data.createdBy, data.isPrivate ? 1 : 0);

  // Auto-enroll the creator as owner
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, data.createdBy);

  return Number(lastInsertRowid);
}

/**
 * Updates mutable channel fields (description, is_private).
 * Silently skips if no recognised fields are present.
 *
 * @param db     - Database instance.
 * @param id     - Channel to update.
 * @param fields - Object with the fields to change.
 */
export function update(db: Db, id: number | string, fields: { description?: string; is_private?: number }) {
  const updates: string[] = [];
  const vals: unknown[]   = [];
  if (fields.description !== undefined) { updates.push("description = ?"); vals.push(fields.description); }
  if (fields.is_private  !== undefined) { updates.push("is_private = ?");  vals.push(fields.is_private); }
  if (!updates.length) return;
  vals.push(id);
  db.prepare(`UPDATE channels SET ${updates.join(", ")} WHERE id = ?`).run(...(vals as Parameters<ReturnType<Db["prepare"]>["run"]>));
}

/**
 * Permanently deletes a channel (cascades to messages, members, permissions, invites).
 *
 * @param db - Database instance.
 * @param id - Channel to delete.
 */
export function remove(db: Db, id: number | string) {
  db.prepare("DELETE FROM channels WHERE id = ?").run(id);
}

/**
 * Fetches a channel row with `user_role = 'owner'` hard-coded.
 * Used after creating a channel so the response includes the creator's role.
 *
 * @param db - Database instance.
 * @param id - Channel ID (bigint accepted from lastInsertRowid).
 * @returns  Channel row with user_role attached, or `undefined`.
 */
export function findWithOwnerRole(db: Db, id: number | bigint) {
  return db.prepare("SELECT c.*, 'owner' AS user_role FROM channels c WHERE c.id = ?").get(id);
}

/**
 * Fetches a channel row with the requesting user's role attached.
 * Used after a successful invite join to return the full channel context.
 *
 * @param db        - Database instance.
 * @param channelId - Channel ID.
 * @param userId    - User whose role to look up.
 * @returns         Channel row with `user_role`, or `undefined`.
 */
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

// ─── Members ─────────────────────────────────────────────────────────────────

/**
 * Returns all members of a channel ordered by role (owner → manager → member)
 * then alphabetically by username.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @returns         Array of member rows with global_role and channel_role.
 */
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

/**
 * Adds a user to a channel with the specified role (defaults to "member").
 * Uses INSERT OR IGNORE to be idempotent — no error if already a member.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @param userId    - User to add.
 * @param role      - Channel role to assign (default: "member").
 */
export function addMember(db: Db, channelId: number | string, userId: number, role = "member") {
  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)").run(channelId, userId, role);
}

/**
 * Updates an existing member's channel role.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @param userId    - Member whose role to change.
 * @param role      - New channel role value.
 */
export function updateMemberRole(db: Db, channelId: number | string, userId: number | string, role: string) {
  db.prepare("UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?").run(role, channelId, userId);
}

/**
 * Removes a user from a channel's member list.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @param userId    - User to remove.
 */
export function removeMember(db: Db, channelId: number | string, userId: number | string) {
  db.prepare("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?").run(channelId, userId);
}

// ─── Permissions ─────────────────────────────────────────────────────────────

/**
 * Returns all permission overrides stored for a channel.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @returns         Array of channel_permissions rows.
 */
export function getPermissions(db: Db, channelId: number | string) {
  return db.prepare("SELECT * FROM channel_permissions WHERE channel_id = ?").all(channelId);
}

/**
 * Inserts or replaces a permission set for a specific role in a channel.
 * Uses an UPSERT (ON CONFLICT DO UPDATE) for idempotent writes.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @param role      - Role to configure ("manager" or "member").
 * @param perms     - All four permission flags as 0/1 integers.
 */
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

// ─── Invites ──────────────────────────────────────────────────────────────────

/**
 * Looks up a basic invite row by its code (no channel/creator joins).
 * Used to validate the invite before joining.
 *
 * @param db   - Database instance.
 * @param code - The 10-character invite code.
 * @returns    Raw invite row, or `undefined`.
 */
export function findInviteByCode(db: Db, code: string) {
  return db.prepare("SELECT * FROM channel_invites WHERE code = ?").get(code) as {
    id: number; channel_id: number; expires_at?: string | null;
    max_uses?: number | null; uses_count: number; [key: string]: unknown;
  } | undefined;
}

/**
 * Fetches a full invite row joined with channel and creator details.
 * Used by the public invite preview page.
 *
 * @param db   - Database instance.
 * @param code - The invite code.
 * @returns    Enriched invite row, or `undefined`.
 */
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

/**
 * Returns all invite links for a channel ordered by creation date (newest first).
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @returns         Array of invite rows with creator username.
 */
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

/**
 * Inserts a new invite link row and returns the full row.
 *
 * @param db   - Database instance.
 * @param data - Invite fields (channel, creator, code, optional max_uses and expires_at).
 * @returns    The newly created invite row.
 */
export function createInvite(db: Db, data: { channelId: number | string; createdBy: number; code: string; maxUses?: number | null; expiresAt?: string | null }) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO channel_invites (channel_id, created_by, code, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(data.channelId, data.createdBy, data.code, data.maxUses ?? null, data.expiresAt ?? null);
  return db.prepare("SELECT * FROM channel_invites WHERE id = ?").get(lastInsertRowid);
}

/**
 * Deletes a specific invite link by channel + code pair.
 *
 * @param db        - Database instance.
 * @param channelId - Channel the invite belongs to (prevents cross-channel deletion).
 * @param code      - Invite code to delete.
 */
export function deleteInvite(db: Db, channelId: number | string, code: string) {
  db.prepare("DELETE FROM channel_invites WHERE channel_id = ? AND code = ?").run(channelId, code);
}

/**
 * Increments the `uses_count` of an invite by 1 after a successful join.
 *
 * @param db - Database instance.
 * @param id - Invite primary key.
 */
export function incrementInviteUses(db: Db, id: number) {
  db.prepare("UPDATE channel_invites SET uses_count = uses_count + 1 WHERE id = ?").run(id);
}

/**
 * Returns the number of members in a channel.
 *
 * @param db        - Database instance.
 * @param channelId - Target channel.
 * @returns         Member count.
 */
export function getMemberCount(db: Db, channelId: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM channel_members WHERE channel_id = ?").get(channelId) as { n: number }).n;
}
