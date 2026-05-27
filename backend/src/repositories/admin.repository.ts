import type { Db } from "../types";

export function findAllUsers(db: Db) {
  return db
    .prepare("SELECT id, username, email, avatar, role, is_banned, ban_reason, created_at FROM users ORDER BY username")
    .all();
}

export function findUserById(db: Db, id: number): { id: number; username: string; role?: string } | undefined {
  return db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(id) as
    | { id: number; username: string; role?: string }
    | undefined;
}

export function findSecurityLogs(db: Db, limit: number, event?: string | null) {
  return event
    ? db.prepare("SELECT * FROM security_logs WHERE event = ? ORDER BY created_at DESC LIMIT ?").all(event, limit)
    : db.prepare("SELECT * FROM security_logs ORDER BY created_at DESC LIMIT ?").all(limit);
}

export function ban(db: Db, userId: number, reason: string) {
  db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?").run(reason, userId);
}

export function unban(db: Db, userId: number) {
  db.prepare("UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?").run(userId);
}
