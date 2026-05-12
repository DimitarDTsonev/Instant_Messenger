import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getDb } from "../db/database";
import { authMiddleware, signToken } from "../middleware/auth";
import { isUserBanned, logSecurityEvent, recordLoginFail } from "../middleware/security";

type CountRow = { n: number };

function validatePassword(password: string): string | null {
  if (password.length < 6)          return "Password must be at least 6 characters";
  if (!/[A-Z]/.test(password))      return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password))      return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character";
  return null;
}

type UserRow = {
  id: number;
  username: string;
  email: string;
  password: string;
  avatar?: string | null;
  role: string;
  is_banned?: number;
  ban_reason?: string | null;
  is_guest?: number;
};

type ResetUserRow = Pick<UserRow, "id" | "username">;

type ResetTokenRow = {
  id: number;
  user_id: number;
};

// Express router for all /api/auth sub-routes
const router = express.Router();

router.post("/register", (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const db = getDb();

  // Check for duplicate email or username before inserting
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ? OR username = ?")
    .get(email, username);
  if (existing) {
    return res.status(409).json({ error: "Email or username already exists" });
  }

  // Hash password with bcrypt cost factor 10
  const hashed = bcrypt.hashSync(password, 10);
  const avatar = username.slice(0, 2).toUpperCase();

  // The first user in the database automatically becomes admin
  const count = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as CountRow).n;
  const role  = count === 0 ? "admin" : "member";

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, ?, ?)")
    .run(username, email, hashed, avatar, role);

  const user = { id: Number(lastInsertRowid), username, email, avatar, role };
  const token = signToken(user);

  return res.status(201).json({ user, token });
});

router.post("/guest", (req, res) => {
  const db      = getDb();
  // Generate a random 8-character hex suffix for the guest username
  const suffix  = crypto.randomBytes(4).toString("hex");
  const username = `guest_${suffix}`;
  const email    = `${username}@guest.local`;
  const avatar   = "GU";

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, email, password, avatar, role, is_guest) VALUES (?, ?, '', ?, 'member', 1)")
    .run(username, email, avatar);

  const user  = { id: Number(lastInsertRowid), username, email, avatar, role: "member", is_guest: 1 };
  const token = signToken(user);

  return res.status(201).json({ user, token });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const db   = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  const ip   = req.ip;

  // Reject if user not found or password hash does not match
  if (!user || !bcrypt.compareSync(password, user.password)) {
    recordLoginFail(db, ip, email);
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Reject banned accounts
  if (user.is_banned) {
    logSecurityEvent(db, {
      event: "banned_login_attempt",
      ip,
      userId: user.id,
      username: user.username,
      detail: `ban reason: ${user.ban_reason || "none"}`,
    });
    return res.status(403).json({ error: "This account has been suspended." });
  }

  const token = signToken(user);
  // Strip the hashed password from the response for security
  const { password: _pw, ...safeUser } = user;

  return res.json({ user: safeUser, token });
});

router.get("/me", authMiddleware, (req, res) => {
  const db   = getDb();
  const user = db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?")
    .get(req.user.id);

  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user });
});

router.get("/users", authMiddleware, (req, res) => {
  const db    = getDb();
  const users = db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users ORDER BY username")
    .all();
  return res.json({ users });
});

router.get("/search", authMiddleware, (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q || q.trim().length < 1) return res.json({ users: [] });

  const db      = getDb();
  // Wrap the trimmed query with SQL LIKE wildcards for partial matching
  const pattern = `%${q.trim()}%`;
  const users   = db
    .prepare(`
      SELECT id, username, email, avatar, role, created_at
      FROM users
      WHERE LOWER(username) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?)
      ORDER BY username LIMIT 20
    `)
    .all(pattern, pattern);

  return res.json({ users });
});

router.get("/users/:id", authMiddleware, (req, res) => {
  const db   = getDb();
  const user = db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?")
    .get(req.params.id);

  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user });
});

router.patch("/users/:id/role", authMiddleware, (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only admins can change roles" });
  }
  if (req.user.id === Number(req.params.id)) {
    return res.status(400).json({ error: "You cannot change your own role" });
  }

  const { role } = req.body;
  if (!["admin", "member"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const db = getDb();
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });

  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
  return res.json({ success: true, role });
});

router.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.json({ success: true });

  const db   = getDb();
  const user = db.prepare("SELECT id, username FROM users WHERE LOWER(email) = LOWER(?) AND is_guest = 0").get(email.trim()) as ResetUserRow | undefined;
  if (!user) return res.json({ success: true });

  const rawToken  = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

  // Invalidate any existing tokens for this user
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(user.id);
  // Store only the hash - the raw token is what gets sent to the user (via email in production)
  db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(user.id, tokenHash, expiresAt);

  // In production replace this with an email. The raw token is intentionally logged here
  // because there is no email service - the console acts as the delivery mechanism for testing.
  console.log(`[PASSWORD RESET] token for ${user.username}: ${rawToken}`);

  return res.json({ success: true });
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token?.trim() || !password?.trim()) {
    return res.status(400).json({ error: "Token and password are required" });
  }
  const pwError2 = validatePassword(password);
  if (pwError2) return res.status(400).json({ error: pwError2 });

  const db   = getDb();
  const now  = new Date().toISOString().replace("T", " ").slice(0, 19);
  const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");
  const row  = db.prepare(
    "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?"
  ).get(tokenHash, now) as ResetTokenRow | undefined;

  if (!row) return res.status(400).json({ error: "Invalid or expired reset token" });

  const hash = await bcrypt.hash(password, 10);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, row.user_id);
  db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(row.id);

  return res.json({ success: true });
});

export default router;
