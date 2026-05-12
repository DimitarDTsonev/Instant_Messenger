// ============================================================
//  src/routes/channels/helpers.ts — Shared role and permission helpers
//
//  Exports:
//    getUserRole(db, userId, channelId) — resolves the user's effective role
//    getPerms(db, channelId, role)      — resolves the effective permission set
//    DEFAULT_PERMS                      — fallback permissions per role
// ============================================================

import type { ChannelRole, Db, PermissionSet } from "../../types";

/**
 * Hard-coded fallback permissions used when no channel_permissions row exists.
 * Owners always receive full permissions regardless of this map.
 */
export const DEFAULT_PERMS: Record<Exclude<ChannelRole, "owner">, PermissionSet> = {
  manager: { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 },
  member:  { can_write: 1, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
  viewer:  { can_write: 0, can_invite: 0, can_manage_members: 0, can_delete_messages: 0 },
};

/**
 * Resolves the calling user's effective role in a channel.
 *
 * Resolution order:
 *  1. Explicit channel_members row → stored role.
 *  2. User is the channel's created_by → "owner".
 *  3. Private channel with no membership → null (no access).
 *  4. Public channel with no membership → "member".
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
  if (ch.is_private) return null;
  return "member";
}

/**
 * Resolves the effective permission set for a role in a channel.
 * Owners always receive full permissions. Other roles fall back to DEFAULT_PERMS
 * when no custom channel_permissions row exists.
 */
export function getPerms(db: Db, channelId: number | string, role: ChannelRole | null): PermissionSet {
  if (role === "owner") return { can_write: 1, can_invite: 1, can_manage_members: 1, can_delete_messages: 1 };
  if (!role) return DEFAULT_PERMS.member;
  const row = db
    .prepare("SELECT * FROM channel_permissions WHERE channel_id = ? AND role = ?")
    .get(channelId, role) as PermissionSet | undefined;
  return row || DEFAULT_PERMS[role as Exclude<ChannelRole, "owner">] || DEFAULT_PERMS.member;
}
