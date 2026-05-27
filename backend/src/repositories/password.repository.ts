import type { Db } from "../types";

export type ResetTokenRow = { id: number; user_id: number };

export function findValidToken(db: Db, tokenHash: string, now: string): ResetTokenRow | undefined {
  return db
    .prepare("SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?")
    .get(tokenHash, now) as ResetTokenRow | undefined;
}

export function createToken(db: Db, userId: number, tokenHash: string, expiresAt: string) {
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(userId, tokenHash, expiresAt);
}

export function markTokenUsed(db: Db, id: number) {
  db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(id);
}
