/**
 * Authentication service — business logic for user registration, login,
 * guest sessions, profile access, role management, and password resets.
 *
 * This layer sits between the HTTP controller (auth.controller.ts) and the
 * database repositories. It enforces all business rules (validation, uniqueness,
 * role checks) and throws typed `AppError` subclasses on failure so the
 * global error handler can translate them to the correct HTTP response.
 *
 * External dependencies:
 *  - bcryptjs — password hashing and comparison.
 *  - crypto   — random token generation and SHA-256 hashing.
 *  - jsonwebtoken (via signToken) — JWT creation.
 *
 * Imported by: auth.controller.ts.
 */

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import { logSecurityEvent, recordLoginFail } from "../middleware/security";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../errors";
import * as UserRepo from "../repositories/users.repository";
import * as PwRepo from "../repositories/password.repository";
import { sendPasswordResetEmail } from "./email.service";

/**
 * Validates a password against the application's complexity rules.
 *
 * Rules: min 6 characters, at least one uppercase letter, one digit,
 * and one special character.
 *
 * Used by: register() and resetPassword() to reject weak passwords.
 *
 * @param password - Plain-text password to check.
 * @returns        Error message string if invalid, `null` if valid.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 6)             return "Password must be at least 6 characters";
  if (!/[A-Z]/.test(password))         return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password))         return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password))  return "Password must contain at least one special character";
  return null;
}

/**
 * Registers a new user account, hashes the password, and returns a JWT.
 *
 * The first user to register receives the "admin" role; all subsequent users
 * receive "member". Avatar is initialised to the first two uppercase letters
 * of the username.
 *
 * @param data - `{ username, email, password }` from the request body.
 * @returns    `{ user, token }` — the sanitised user object and a signed JWT.
 * @throws     ValidationError if the password fails complexity rules.
 * @throws     ConflictError   if the email or username is already taken.
 */
export function register(data: { username: string; email: string; password: string }) {
  const pwError = validatePassword(data.password);
  if (pwError) throw new ValidationError(pwError);

  const db = getDb();

  if (UserRepo.findByEmailOrUsername(db, data.email, data.username)) {
    throw new ConflictError("Email or username already exists");
  }

  const hashed = bcrypt.hashSync(data.password, 10);
  const avatar = data.username.slice(0, 2).toUpperCase();
  // First user ever becomes admin automatically
  const role   = UserRepo.countAll(db) === 0 ? "admin" : "member";

  const id   = UserRepo.create(db, { username: data.username, email: data.email, password: hashed, avatar, role });
  const user = { id, username: data.username, email: data.email, avatar, role };
  const token = signToken(user);

  return { user, token };
}

/**
 * Creates a temporary guest account with a random username and no password.
 *
 * Guest accounts are cleaned up automatically after 24 hours by `initDatabase`.
 * Guest tokens are stored in `sessionStorage` (not `localStorage`) on the client
 * so they are cleared when the browser tab closes.
 *
 * @returns `{ user, token }` for the new guest account.
 */
export function guest() {
  const db      = getDb();
  const suffix  = crypto.randomBytes(4).toString("hex"); // 8-char hex suffix for uniqueness
  const username = `guest_${suffix}`;
  const email    = `${username}@guest.local`;
  const avatar   = "GU";

  const id  = UserRepo.create(db, { username, email, password: "", avatar, role: "member", is_guest: 1 });
  const user = { id, username, email, avatar, role: "member", is_guest: 1 };
  const token = signToken(user);

  return { user, token };
}

/**
 * Authenticates a user by email and password.
 *
 * Records failed attempts for rate-limiting / IP-ban purposes.
 * Prevents banned accounts from obtaining a token.
 *
 * @param email    - The user's email address.
 * @param password - Plain-text password from the request body.
 * @param ip       - Requester's IP (used for fail logging and rate limiting).
 * @returns        `{ user, token }` on success (password field stripped).
 * @throws         UnauthorizedError if credentials are wrong.
 * @throws         ForbiddenError    if the account is banned.
 */
export function login(email: string, password: string, ip: string | undefined) {
  const db   = getDb();
  const user = UserRepo.findByEmail(db, email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    recordLoginFail(db, ip, email);
    throw new UnauthorizedError("Invalid email or password");
  }

  if (user.is_banned) {
    logSecurityEvent(db, {
      event: "banned_login_attempt",
      ip,
      userId: user.id,
      username: user.username,
      detail: `ban reason: ${user.ban_reason || "none"}`,
    });
    throw new ForbiddenError("This account has been suspended.");
  }

  const token = signToken(user);
  // Strip the password hash before returning the user object
  const { password: _pw, ...safeUser } = user;
  return { user: safeUser, token };
}

/**
 * Returns the current authenticated user's public profile.
 *
 * @param userId - ID taken from the validated JWT payload.
 * @returns      Public user fields (no password, no ban fields).
 * @throws       NotFoundError if the user no longer exists.
 */
export function getMe(userId: number) {
  const db   = getDb();
  const user = UserRepo.findPublicById(db, userId);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

/**
 * Returns all user accounts (public fields only). Used by the user list endpoint.
 *
 * @returns Array of public user objects.
 */
export function listUsers() {
  return UserRepo.findAll(getDb());
}

/**
 * Searches users by partial username or email match.
 * Returns an empty array if the query is blank or too short.
 *
 * @param query - Raw search string from the request.
 * @returns     Up to 20 matching users.
 */
export function searchUsers(query: string) {
  if (!query || query.trim().length < 1) return [];
  const pattern = `%${query.trim()}%`;
  return UserRepo.search(getDb(), pattern);
}

/**
 * Retrieves a single user's public profile by ID.
 *
 * @param id - User ID string from the route parameter.
 * @returns  Public user object.
 * @throws   NotFoundError if no user with that ID exists.
 */
export function getUserById(id: string) {
  const db   = getDb();
  const user = UserRepo.findPublicById(db, Number(id));
  if (!user) throw new NotFoundError("User not found");
  return user;
}

/**
 * Changes a user's global role (admin / member).
 *
 * Only admins may call this. An admin cannot change their own role.
 *
 * @param requesterId   - ID of the admin making the request.
 * @param requesterRole - Role of the requesting user (must be "admin").
 * @param targetId      - String ID of the user whose role should change.
 * @param role          - New role value ("admin" or "member").
 * @returns             `{ role }` confirming the new role.
 * @throws              ForbiddenError   if the requester is not an admin.
 * @throws              ValidationError  if targetId === requesterId or role is invalid.
 * @throws              NotFoundError    if the target user doesn't exist.
 */
export function updateUserRole(requesterId: number, requesterRole: string, targetId: string, role: string) {
  if (requesterRole !== "admin") throw new ForbiddenError("Only admins can change roles");
  if (requesterId === Number(targetId)) throw new ValidationError("You cannot change your own role");
  if (!["admin", "member"].includes(role)) throw new ValidationError("Invalid role");

  const db     = getDb();
  const target = UserRepo.findById(db, Number(targetId));
  if (!target) throw new NotFoundError("User not found");

  UserRepo.updateRole(db, targetId, role);
  return { role };
}

/**
 * Initiates a password reset for the given email address.
 *
 * If no account is found the function returns silently — this prevents
 * email enumeration attacks. The token is hashed (SHA-256) before storage
 * so that a database breach cannot be used to trigger resets directly.
 *
 * The raw token is included in the reset link sent to the user's email.
 *
 * @param email - Email address from the forgot-password form.
 */
export async function forgotPassword(email: string) {
  const db   = getDb();
  const user = db
    .prepare("SELECT id, username FROM users WHERE LOWER(email) = LOWER(?) AND is_guest = 0")
    .get(email.trim()) as { id: number; username: string } | undefined;

  // Silent return on unknown email — prevents enumeration
  if (!user) return;

  const rawToken   = crypto.randomBytes(32).toString("hex");
  const tokenHash  = crypto.createHash("sha256").update(rawToken).digest("hex");
  // 1-hour expiry stored as SQLite-compatible datetime string
  const expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

  PwRepo.createToken(db, user.id, tokenHash, expiresAt);

  await sendPasswordResetEmail(email.trim(), user.username, rawToken);
}

/**
 * Resets a user's password using a valid single-use reset token.
 *
 * The raw token from the URL is hashed and matched against the stored hash.
 * The token is marked used immediately after the password is updated.
 *
 * @param token    - Raw token string from the reset URL query parameter.
 * @param password - New plain-text password.
 * @throws         ValidationError if the new password is weak.
 * @throws         ValidationError if the token is invalid, used, or expired.
 */
export async function resetPassword(token: string, password: string) {
  const pwError = validatePassword(password);
  if (pwError) throw new ValidationError(pwError);

  const db        = getDb();
  const now       = new Date().toISOString().replace("T", " ").slice(0, 19);
  const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");
  const row       = PwRepo.findValidToken(db, tokenHash, now);

  if (!row) throw new ValidationError("Invalid or expired reset token");

  const hash = await bcrypt.hash(password, 10);
  UserRepo.updatePassword(db, row.user_id, hash);
  PwRepo.markTokenUsed(db, row.id);
}
