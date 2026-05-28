/**
 * Password-reset token repository — database access for `password_reset_tokens`.
 *
 * Tokens are stored as SHA-256 hashes of the raw token sent in the email.
 * The raw token is never persisted, so a database breach cannot be used to
 * reset passwords directly.
 *
 * Each user is limited to one active token at a time; `createToken` deletes
 * any previous token for the same user before inserting the new one.
 *
 * Imported by: auth.service.ts (forgotPassword, resetPassword).
 */

import type { Db } from "../types";

/** Minimal row shape returned by token lookups. */
export type ResetTokenRow = { id: number; user_id: number };

/**
 * Looks up a valid (unused, non-expired) reset token by its hash.
 *
 * @param db        - Database instance.
 * @param tokenHash - SHA-256 hex hash of the raw token from the reset link.
 * @param now       - Current datetime string ("YYYY-MM-DD HH:MM:SS") for expiry comparison.
 * @returns         The matching token row, or `undefined` if invalid/expired.
 */
export function findValidToken(db: Db, tokenHash: string, now: string): ResetTokenRow | undefined {
  return db
    .prepare("SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?")
    .get(tokenHash, now) as ResetTokenRow | undefined;
}

/**
 * Deletes any existing token for the user, then inserts a fresh token.
 * Enforces a one-token-per-user constraint at the application level.
 *
 * @param db        - Database instance.
 * @param userId    - ID of the user requesting the reset.
 * @param tokenHash - SHA-256 hex hash of the raw token.
 * @param expiresAt - Token expiry datetime string ("YYYY-MM-DD HH:MM:SS").
 */
export function createToken(db: Db, userId: number, tokenHash: string, expiresAt: string) {
  // Remove the old token first so there is never more than one active per user
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(userId, tokenHash, expiresAt);
}

/**
 * Marks a token as used so it cannot be reused for a second reset.
 *
 * @param db - Database instance.
 * @param id - Primary key of the token row to invalidate.
 */
export function markTokenUsed(db: Db, id: number) {
  db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(id);
}
