import type { Db } from "../types";

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

export type CreateUserData = {
  username: string;
  email: string;
  password: string;
  avatar: string;
  role: string;
  is_guest?: number;
};

export function findById(db: Db, id: number | string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function findPublicById(db: Db, id: number | string) {
  return db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?")
    .get(id) as Omit<UserRow, "password" | "is_banned" | "ban_reason" | "is_guest"> | undefined;
}

export function findByEmail(db: Db, email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
}

export function findByEmailOrUsername(db: Db, email: string, username: string): { id: number } | undefined {
  return db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .get(email, username) as { id: number } | undefined;
}

export function findAll(db: Db) {
  return db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users ORDER BY username")
    .all();
}

export function findAllForAdmin(db: Db) {
  return db
    .prepare("SELECT id, username, email, avatar, role, is_banned, ban_reason, created_at FROM users ORDER BY username")
    .all();
}

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

export function countAll(db: Db): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export function create(db: Db, data: CreateUserData): number {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, email, password, avatar, role, is_guest) VALUES (?, ?, ?, ?, ?, ?)")
    .run(data.username, data.email, data.password, data.avatar, data.role, data.is_guest ?? 0);
  return Number(lastInsertRowid);
}

export function updateRole(db: Db, id: number | string, role: string) {
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

export function updatePassword(db: Db, id: number, hash: string) {
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, id);
}

export function updateBan(db: Db, id: number, banned: boolean, reason?: string | null) {
  if (banned) {
    db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?").run(reason ?? null, id);
  } else {
    db.prepare("UPDATE users SET is_banned = 0, ban_reason = NULL WHERE id = ?").run(id);
  }
}
