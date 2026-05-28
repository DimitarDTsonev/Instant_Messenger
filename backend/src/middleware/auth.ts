/**
 * JWT authentication middleware and token utilities.
 *
 * Responsibilities:
 *  - `authMiddleware`: validates the Bearer token on every protected route.
 *  - `signToken`: creates a signed JWT for a user on login / register.
 *
 * The middleware performs a fresh database read on every request so that
 * role changes and bans applied after a token was issued take effect
 * immediately without requiring the user to re-login.
 *
 * Imported by: all protected route files, and auth.service.ts (signToken).
 */

import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../types";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database";
import { ForbiddenError, UnauthorizedError } from "../errors";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-change-in-prod";

/**
 * Express middleware that validates the `Authorization: Bearer <token>` header.
 *
 * On success: attaches the live user record to `req.user` and calls `next()`.
 * On failure: forwards an `UnauthorizedError` or `ForbiddenError` to `next(err)`.
 *
 * Auth flow:
 *  1. Extract token from the Authorization header.
 *  2. Verify the JWT signature using `JWT_SECRET`.
 *  3. Load the user from the database to catch post-issuance bans / role changes.
 *  4. Reject banned accounts before they reach any controller.
 *
 * Used by: all route routers via `router.use(authMiddleware)`.
 *
 * @param req  - Express request; `req.user` is populated on success.
 * @param _res - Not used directly.
 * @param next - Called with an error on failure, or with no args on success.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Authentication required"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;

    // Fresh DB read: picks up role changes and bans that happened after the token was issued.
    const user = getDb()
      .prepare("SELECT id, username, email, role, is_banned FROM users WHERE id = ?")
      .get(payload.id) as (AuthUser & { is_banned: number }) | undefined;

    if (!user) return next(new UnauthorizedError("Authentication required"));
    if (user.is_banned) return next(new ForbiddenError("This account has been suspended"));

    req.user = user;
    next();
  } catch {
    // jwt.verify throws when the token is malformed, expired, or has an invalid signature
    return next(new UnauthorizedError("Invalid or expired token"));
  }
}

/**
 * Creates a signed JWT for the given user.
 *
 * The token encodes: id, username, email, and role.
 * It expires after 7 days and is signed with `JWT_SECRET`.
 *
 * Used by: auth.service.ts (login, register, guest).
 *
 * @param user - User fields needed for the token payload.
 * @returns    A signed JWT string.
 */
export function signToken(user: Pick<AuthUser, "id" | "username" | "email"> &
                Partial<Pick<AuthUser, "role">>) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || "member",
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}
