/**
 * Users repository — all direct database access for the `users` table.
 *
 * This module is the single source of truth for user read/write operations.
 * Controllers and services must NOT write SQL for users directly; they call
 * functions from this file instead.
 *
 * Imported by: auth.service.ts, admin.service.ts, channels.service.ts.
 */

import type { Db } from "../types";

/** Full row shape for a user record including sensitive fields. */
export type UserRow = {
  id: number;
  username: string;
  email: string;
  password: string;
  avatar?: string | null;
  role: string;
  is_banned?: number;
  ban_reason?: string | null;
  is_guest?: number;
  created_at?: string;
};

/** Data required to create a new user row. */
export type CreateUserData = {
  username: string;
  email: string;
  password: string;
  avatar: string;
  role: string;
  is_guest?: number;
};

/**
 * Retrieves a complete user row (including password hash) by primary key.
 *
 * @param db - Database instance.
 * @param id - User ID to look up.
 * @returns  The user row, or `undefined` if not found.
 */
export function findById(db: Db, id: number | string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

/**
 * Retrieves a public-safe user record by primary key (no password, no ban fields).
 *
 * Used by: auth.service.ts (getMe, getUserById).
 *
 * @param db - Database instance.
 * @param id - User ID.
 * @returns  Public user fields, or `undefined` if not found.
 */
export function findPublicById(db: Db, id: number | string) {
  return db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?")
    .get(id) as Omit<UserRow, "password" | "is_banned" | "ban_reason" | "is_guest"> | undefined;
}

/**
 * Looks up a user by their email address. Returns the full row including the
 * password hash (needed for bcrypt comparison during login).
 *
 * @param db    - Database instance.
 * @param email - The user's email address.
 * @returns     The user row, or `undefined` if not found.
 */
export function findByEmail(db: Db, email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
}

/**
 * Checks whether a user with the given email OR username already exists.
 * Used during registration to enforce uniqueness before attempting an INSERT.
 *
 * @param db       - Database instance.
 * @param email    - Email to check.
 * @param username - Username to check.
 * @returns        A minimal row `{ id }` if a conflict exists, or `undefined`.
 */
export function findByEmailOrUsername(db: Db, email: string, username: string): { id: number } | undefined {
  return db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .get(email, username) as { id: number } | undefined;
}

/**
 * Returns all users ordered alphabetically by username (public fields only).
 * Used by the user-list endpoint and the DM sidebar.
 *
 * @param db - Database instance.
 * @returns  Array of public user objects.
 */
export function findAll(db: Db) {
  return db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users ORDER BY username")
    .all();
}

/**
 * Returns all users including ban status — for admin views.
 *
 * @param db - Database instance.
 * @returns  Array of user objects with is_banned and ban_reason fields.
 */
export function findAllForAdmin(db: Db) {
  return db
    .prepare("SELECT id, username, email, avatar, role, is_banned, ban_reason, created_at FROM users ORDER BY username")
    .all();
}

/**
 * Searches users by username or email using a LIKE pattern.
 *
 * @param db      - Database instance.
 * @param pattern - SQL LIKE pattern, e.g. `%alice%`.
 * @returns       Up to 20 matching public user records.
 */
export function search(db: Db, pattern: string) {
  return db
    .prepare(
      `SELECT id, username, email, avatar, role, created_at
       FROM users
       WHERE LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?)
       ORDER BY username LIMIT 20`,
    )
    .all(pattern, pattern);
}

/**
 * Counts the total number of user records. Used at registration time to
 * determine whether the first user should receive the "admin" role.
 *
 * @param db - Database instance.
 * @returns  Total row count.
 */
export function countAll(db: Db): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

/**
 * Inserts a new user row and returns the new auto-incremented ID.
 *
 * @param db   - Database instance.
 * @param data - Fields for the new user.
 * @returns    The new user's ID.
 */
export function create(db: Db, data: CreateUserData): number {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, email, password, avatar, role, is_guest) VALUES (?, ?, ?, ?, ?, ?)")
    .run(data.username, data.email, data.password, data.avatar, data.role, data.is_guest ?? 0);
  return Number(lastInsertRowid);
}

/**
 * Updates the global role (admin / member) for a user.
 *
 * @param db   - Database instance.
 * @param id   - User ID to update.
 * @param role - New role value.
 */
export function updateRole(db: Db, id: number | string, role: string) {
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

/**
 * Replaces a user's password hash (used after a successful password reset).
 *
 * @param db   - Database instance.
 * @param id   - User ID.
 * @param hash - bcrypt hash of the new password.
 */
export function updatePassword(db: Db, id: number, hash: string) {
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, id);
}

/**
 * Sets or clears the ban flag on a user record.
 *
 * @param db     - Database instance.
 * @param id     - User ID.
 * @param banned - `true` to ban, `false` to unban.
 * @param reason - Optional ban reason (stored for display in the admin panel).
 */
export function updateBan(db: Db, id: number, banned: boolean, reason?: string | null) {
  if (banned) {
    db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?").run(reason ?? null, id);
  } else {
    db.prepare("UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?").run(id);
  }
}
