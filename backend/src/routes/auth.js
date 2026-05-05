// ============================================================
//  src/routes/auth.js — Authentication and user management routes
//
//  Handles user registration, guest sessions, login, and
//  profile/admin operations.
//
//  REST routes defined:
//    POST   /api/auth/register        — create a new account
//    POST   /api/auth/guest           — create a temporary guest account
//    POST   /api/auth/login           — authenticate and receive a JWT
//    GET    /api/auth/me              — fetch the calling user's profile
//    GET    /api/auth/users           — list all users (authenticated)
//    GET    /api/auth/search?q=       — search users by username/email
//    GET    /api/auth/users/:id       — fetch a specific user's profile
//    PATCH  /api/auth/users/:id/role  — change a user's global role (admin only)
//
//  Connects to:
//    ../db/database     — SQLite via getDb()
//    ../middleware/auth — JWT helpers (authMiddleware, signToken)
// ============================================================

const express = require("express");
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { getDb } = require("../db/database");
const { authMiddleware, signToken } = require("../middleware/auth");
const { logSecurityEvent, recordLoginFail, isUserBanned } = require("../middleware/security");

// Express router for all /api/auth sub-routes
const router = express.Router();

/**
 * POST /api/auth/register
 * Creates a new user account with a hashed password and a random emoji avatar.
 * The very first user registered in the database is automatically assigned
 * the "admin" global role; all subsequent users receive "member".
 *
 * @route   POST /api/auth/register
 * @access  Public
 * @param   {Object} req.body
 * @param   {string} req.body.username - Desired username (must be unique)
 * @param   {string} req.body.email    - User's email address (must be unique)
 * @param   {string} req.body.password - Plain-text password (min 6 characters)
 * @returns {201} { user: UserObject, token: string }
 * @returns {400} { error: string } - Missing fields or password too short
 * @returns {409} { error: string } - Email or username already taken
 */
router.post("/register", (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

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
  // Pool of emoji avatars assigned randomly at registration
  const avatars = ["🧑‍💻", "👨‍🎨", "👩‍🔬", "🧑‍🚀", "🦊", "🐙", "🦁", "🐸"];
  const avatar  = avatars[Math.floor(Math.random() * avatars.length)];

  // The first user in the database automatically becomes admin
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const role  = count === 0 ? "admin" : "member";

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, email, password, avatar, role) VALUES (?, ?, ?, ?, ?)")
    .run(username, email, hashed, avatar, role);

  const user = { id: lastInsertRowid, username, email, avatar, role };
  const token = signToken(user);

  return res.status(201).json({ user, token });
});

/**
 * POST /api/auth/guest
 * Creates a temporary guest account that expires automatically after 24 hours.
 * The account gets a randomly generated username (`guest_<hex>`) and a
 * placeholder email. No password is required or stored.
 *
 * @route   POST /api/auth/guest
 * @access  Public
 * @returns {201} { user: GuestUserObject, token: string }
 */
router.post("/guest", (req, res) => {
  const db      = getDb();
  // Generate a random 8-character hex suffix for the guest username
  const suffix  = crypto.randomBytes(4).toString("hex");
  const username = `guest_${suffix}`;
  const email    = `${username}@guest.local`;
  // Pool of emoji avatars for guest accounts
  const avatars  = ["👻", "🎭", "🤖", "👾", "🦄", "🎪", "🧸", "🎨"];
  const avatar   = avatars[Math.floor(Math.random() * avatars.length)];

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, email, password, avatar, role, is_guest) VALUES (?, ?, '', ?, 'member', 1)")
    .run(username, email, avatar);

  const user  = { id: lastInsertRowid, username, email, avatar, role: "member", is_guest: 1 };
  const token = signToken(user);

  return res.status(201).json({ user, token });
});

/**
 * POST /api/auth/login
 * Authenticates a user with email and password.
 * Returns a JWT token valid for 7 days on success.
 *
 * @route   POST /api/auth/login
 * @access  Public
 * @param   {Object} req.body
 * @param   {string} req.body.email    - User's email address
 * @param   {string} req.body.password - Plain-text password (verified via bcrypt)
 * @returns {200} { user: UserObject (without password), token: string }
 * @returns {400} { error: string } - Missing email or password
 * @returns {401} { error: string } - Invalid credentials
 */
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const db   = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
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

/**
 * GET /api/auth/me
 * Returns the full profile of the currently authenticated user.
 * Reads fresh data from the database rather than relying solely on
 * the JWT payload, so recent role changes are reflected immediately.
 *
 * @route   GET /api/auth/me
 * @access  Private (requires Bearer token)
 * @returns {200} { user: UserObject }
 * @returns {404} { error: string } - User no longer exists in the database
 */
router.get("/me", authMiddleware, (req, res) => {
  const db   = getDb();
  const user = db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?")
    .get(req.user.id);

  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user });
});

/**
 * GET /api/auth/users
 * Returns a list of all registered users ordered alphabetically by username.
 * Sensitive fields (password) are excluded from the response.
 *
 * @route   GET /api/auth/users
 * @access  Private (requires Bearer token)
 * @returns {200} { users: UserObject[] }
 */
router.get("/users", authMiddleware, (req, res) => {
  const db    = getDb();
  const users = db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users ORDER BY username")
    .all();
  return res.json({ users });
});

/**
 * GET /api/auth/search?q=
 * Searches for users whose username or email contains the given query string
 * (case-insensitive). Returns an empty array if the query is shorter than
 * one character.
 *
 * @route   GET /api/auth/search
 * @access  Private (requires Bearer token)
 * @param   {string} req.query.q - Search term (min 1 character)
 * @returns {200} { users: UserObject[] } - Up to 20 matching users
 */
router.get("/search", authMiddleware, (req, res) => {
  const { q } = req.query;
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

/**
 * GET /api/auth/users/:id
 * Returns the public profile of a specific user by their numeric ID.
 *
 * @route   GET /api/auth/users/:id
 * @access  Private (requires Bearer token)
 * @param   {string} req.params.id - Target user's numeric ID
 * @returns {200} { user: UserObject }
 * @returns {404} { error: string } - User not found
 */
router.get("/users/:id", authMiddleware, (req, res) => {
  const db   = getDb();
  const user = db
    .prepare("SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?")
    .get(req.params.id);

  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user });
});

/**
 * PATCH /api/auth/users/:id/role
 * Changes the global application role of a target user.
 * Only users with the "admin" role may call this endpoint.
 * An admin cannot change their own role.
 *
 * @route   PATCH /api/auth/users/:id/role
 * @access  Private — admin only
 * @param   {string} req.params.id - Target user's numeric ID
 * @param   {Object} req.body
 * @param   {string} req.body.role - New role; must be "admin" or "member"
 * @returns {200} { success: true, role: string }
 * @returns {400} { error: string } - Invalid role or self-modification attempt
 * @returns {403} { error: string } - Caller is not an admin
 * @returns {404} { error: string } - Target user not found
 */
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

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Creates a single-use password reset token (valid 1 hour) and logs it.
 * Always returns 200 to avoid user enumeration.
 *
 * In production, this token would be emailed; here it is also logged to the
 * console so local testing works without an email service.
 *
 * @route   POST /api/auth/forgot-password
 * @access  Public
 * @returns {200} { success: true }
 */
router.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.json({ success: true });

  const db   = getDb();
  const user = db.prepare("SELECT id, username FROM users WHERE LOWER(email) = LOWER(?) AND is_guest = 0").get(email.trim());
  if (!user) return res.json({ success: true });

  const token     = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

  // Invalidate any existing tokens for this user
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(user.id);
  db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)").run(user.id, token, expiresAt);

  // In production, send an email. For now, log to console for local testing.
  console.log(`[PASSWORD RESET] token for ${user.username}: ${token}`);

  return res.json({ success: true });
});

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 * Validates the token, updates the password, and marks the token as used.
 *
 * @route   POST /api/auth/reset-password
 * @access  Public
 * @returns {200} { success: true }
 */
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token?.trim() || !password?.trim()) {
    return res.status(400).json({ error: "Token and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const db   = getDb();
  const now  = new Date().toISOString().replace("T", " ").slice(0, 19);
  const row  = db.prepare(
    "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?"
  ).get(token.trim(), now);

  if (!row) return res.status(400).json({ error: "Invalid or expired reset token" });

  const hash = await bcrypt.hash(password, 10);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hash, row.user_id);
  db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?").run(row.id);

  return res.json({ success: true });
});

module.exports = router;
