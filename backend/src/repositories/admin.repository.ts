/**
 * Admin repository — database queries for the admin panel.
 *
 * Provides read/write operations used only by the admin service:
 *  - Listing all users with ban status.
 *  - Reading security event logs.
 *  - Banning and unbanning individual users.
 *
 * Imported by: admin.service.ts.
 */

import type { Db } from "../types";

/**
 * Returns all user accounts with ban status and reason, ordered by username.
 * Used by the admin users table.
 *
 * @param db - Database instance.
 * @returns  Array of user rows including is_banned and ban_reason.
 */
export function findAllUsers(db: Db) {
  return db
    .prepare("SELECT id, username, email, avatar, role, is_banned, ban_reason, created_at FROM users ORDER BY username")
    .all();
}

/**
 * Retrieves a minimal user record (id, username, role) by primary key.
 * Used to verify the target user exists before performing a ban/unban.
 *
 * @param db - Database instance.
 * @param id - User ID to look up.
 * @returns  Minimal user object, or `undefined` if not found.
 */
export function findUserById(db: Db, id: number): { id: number; username: string; role?: string } | undefined {
  return db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(id) as
    | { id: number; username: string; role?: string }
    | undefined;
}

/**
 * Retrieves security log entries in reverse-chronological order.
 *
 * @param db    - Database instance.
 * @param limit - Maximum number of records to return (capped at 500 by the controller).
 * @param event - Optional event type filter (e.g. "login_fail", "ip_banned").
 *               Pass `null` to return all event types.
 * @returns     Array of security log rows.
 */
export function findSecurityLogs(db: Db, limit: number, event?: string | null) {
  return event
    ? db.prepare("SELECT * FROM security_logs WHERE event = ? ORDER BY created_at DESC LIMIT ?").all(event, limit)
    : db.prepare("SELECT * FROM security_logs ORDER BY created_at DESC LIMIT ?").all(limit);
}

/**
 * Sets `is_banned = 1` and records the ban reason for a user.
 *
 * @param db     - Database instance.
 * @param userId - User to ban.
 * @param reason - Human-readable ban reason (max 255 chars, enforced by the service).
 */
export function ban(db: Db, userId: number, reason: string) {
  db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?").run(reason, userId);
}

/**
 * Clears the ban flag and removes the ban reason for a user.
 *
 * @param db     - Database instance.
 * @param userId - User to unban.
 */
export function unban(db: Db, userId: number) {
  db.prepare("UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?").run(userId);
}
