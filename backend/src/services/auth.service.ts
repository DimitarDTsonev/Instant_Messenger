import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getDb } from "../db/database";
import { signToken } from "../middleware/auth";
import { logSecurityEvent, recordLoginFail } from "../middleware/security";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../errors";
import * as UserRepo from "../repositories/users.repository";
import * as PwRepo from "../repositories/password.repository";
import { sendPasswordResetEmail } from "./email.service";

export function validatePassword(password: string): string | null {
  if (password.length < 6)             return "Password must be at least 6 characters";
  if (!/[A-Z]/.test(password))         return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password))         return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password))  return "Password must contain at least one special character";
  return null;
}

export function register(data: { username: string; email: string; password: string }) {
  const pwError = validatePassword(data.password);
  if (pwError) throw new ValidationError(pwError);

  const db = getDb();

  if (UserRepo.findByEmailOrUsername(db, data.email, data.username)) {
    throw new ConflictError("Email or username already exists");
  }

  const hashed = bcrypt.hashSync(data.password, 10);
  const avatar = data.username.slice(0, 2).toUpperCase();
  const role   = UserRepo.countAll(db) === 0 ? "admin" : "member";

  const id   = UserRepo.create(db, { username: data.username, email: data.email, password: hashed, avatar, role });
  const user = { id, username: data.username, email: data.email, avatar, role };
  const token = signToken(user);

  return { user, token };
}

export function guest() {
  const db      = getDb();
  const suffix  = crypto.randomBytes(4).toString("hex");
  const username = `guest_${suffix}`;
  const email    = `${username}@guest.local`;
  const avatar   = "GU";

  const id  = UserRepo.create(db, { username, email, password: "", avatar, role: "member", is_guest: 1 });
  const user = { id, username, email, avatar, role: "member", is_guest: 1 };
  const token = signToken(user);

  return { user, token };
}

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
  const { password: _pw, ...safeUser } = user;
  return { user: safeUser, token };
}

export function getMe(userId: number) {
  const db   = getDb();
  const user = UserRepo.findPublicById(db, userId);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export function listUsers() {
  return UserRepo.findAll(getDb());
}

export function searchUsers(query: string) {
  if (!query || query.trim().length < 1) return [];
  const pattern = `%${query.trim()}%`;
  return UserRepo.search(getDb(), pattern);
}

export function getUserById(id: string) {
  const db   = getDb();
  const user = UserRepo.findPublicById(db, Number(id));
  if (!user) throw new NotFoundError("User not found");
  return user;
}

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

export async function forgotPassword(email: string) {
  const db   = getDb();
  const user = db
    .prepare("SELECT id, username FROM users WHERE LOWER(email) = LOWER(?) AND is_guest = 0")
    .get(email.trim()) as { id: number; username: string } | undefined;

  if (!user) return;

  const rawToken   = crypto.randomBytes(32).toString("hex");
  const tokenHash  = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

  PwRepo.createToken(db, user.id, tokenHash, expiresAt);

  await sendPasswordResetEmail(email.trim(), user.username, rawToken);
}

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
