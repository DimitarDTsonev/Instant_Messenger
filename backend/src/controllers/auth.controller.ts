/**
 * Authentication controller — Express route handlers for authentication endpoints.
 *
 * Each function extracts validated input from `req`, delegates to the
 * corresponding AuthService function, and serialises the result to JSON.
 * All error handling is done in the service layer via thrown AppError subclasses
 * which are caught by the global errorHandler middleware.
 *
 * SERVER_STARTUP_ID is a UUID generated once when this module is first loaded.
 * It is included in the `/me` response so the frontend can detect server restarts
 * and force a logout (clearing stale session state).
 *
 * Imported by: routes/auth.ts.
 */

import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import * as AuthService from "../services/auth.service";

/**
 * Unique identifier generated at server startup. Returned by the `/me` endpoint
 * so the client can detect when the server has restarted and force a fresh login.
 * Uses `crypto.randomUUID()` which is always available in Node ≥ 14.
 */
export const SERVER_STARTUP_ID = randomUUID();

/**
 * POST /api/auth/register
 * Creates a new user account and returns a JWT.
 *
 * @param req - Body: `{ username, email, password }`.
 * @param res - 201 `{ user, token }`.
 */
export function register(req: Request, res: Response) {
  const result = AuthService.register(req.body);
  res.status(201).json(result);
}

/**
 * POST /api/auth/guest
 * Creates a temporary guest account (no email, no password) and returns a JWT.
 *
 * @param _req - No body required.
 * @param res  - 201 `{ user, token }`.
 */
export function guest(_req: Request, res: Response) {
  const result = AuthService.guest();
  res.status(201).json(result);
}

/**
 * POST /api/auth/login
 * Validates credentials and returns a JWT on success.
 *
 * @param req - Body: `{ email, password }`.
 * @param res - 200 `{ user, token }`.
 */
export function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const result = AuthService.login(email, password, req.ip);
  res.json(result);
}

/**
 * GET /api/auth/me
 * Returns the current user's profile along with the server startup ID.
 *
 * The `serverStartupId` field lets the client detect server restarts and
 * force a logout when the cached startup ID differs from the returned one.
 *
 * @param req - `req.user` populated by `authMiddleware`.
 * @param res - 200 `{ user, serverStartupId }`.
 */
export function me(req: Request, res: Response) {
  const user = AuthService.getMe(req.user.id);
  res.json({ user, serverStartupId: SERVER_STARTUP_ID });
}

/**
 * GET /api/auth/users
 * Returns all user accounts (public fields).
 *
 * @param _req - No parameters required.
 * @param res  - 200 `{ users }`.
 */
export function listUsers(_req: Request, res: Response) {
  const users = AuthService.listUsers();
  res.json({ users });
}

/**
 * GET /api/auth/users/search?q=<query>
 * Searches users by partial username or email match.
 *
 * @param req - Query: `q` — the search string.
 * @param res - 200 `{ users }`.
 */
export function searchUsers(req: Request, res: Response) {
  const q     = typeof req.query.q === "string" ? req.query.q : "";
  const users = AuthService.searchUsers(q);
  res.json({ users });
}

/**
 * GET /api/auth/users/:id
 * Returns a single user's public profile by ID.
 *
 * @param req - Param: `id`.
 * @param res - 200 `{ user }`.
 */
export function getUserById(req: Request, res: Response) {
  const user = AuthService.getUserById(req.params.id);
  res.json({ user });
}

/**
 * PATCH /api/auth/users/:id/role
 * Changes a user's global role. Requires the calling user to be an admin.
 *
 * @param req - Param: `id`; body: `{ role }`.
 * @param res - 200 `{ success, role }`.
 */
export function updateUserRole(req: Request, res: Response) {
  const result = AuthService.updateUserRole(req.user.id, req.user.role, req.params.id, req.body.role);
  res.json({ success: true, ...result });
}

/**
 * POST /api/auth/forgot-password
 * Sends a password-reset email (or logs the reset link in dev mode).
 * Always returns success to prevent email enumeration.
 *
 * @param req - Body: `{ email }`.
 * @param res - 200 `{ success: true }`.
 */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  if (email?.trim()) await AuthService.forgotPassword(email);
  res.json({ success: true });
}

/**
 * POST /api/auth/reset-password
 * Validates a reset token and sets a new password.
 *
 * @param req - Body: `{ token, password }`.
 * @param res - 200 `{ success: true }`.
 */
export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body;
  await AuthService.resetPassword(token, password);
  res.json({ success: true });
}
