// ============================================================
//  src/middleware/auth.ts — JWT authentication middleware
//  Validates the Bearer token found in the Authorization header
//  and attaches the decoded user payload to req.user.
//
//  Exports:
//    authMiddleware(req, res, next) — Express middleware
//    signToken(user)               — JWT signing helper
// ============================================================

import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../types";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database";

// Secret key used to sign and verify JWTs.
// Must be overridden via the JWT_SECRET environment variable in production.
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-change-in-prod";

/**
 * Express middleware that authenticates requests via a JWT Bearer token.
 *
 * Reads the `Authorization` header, verifies the token with `JWT_SECRET`,
 * and attaches the decoded payload to `req.user` so downstream handlers
 * can access `{ id, username, email, role }` without querying the database.
 *
 * If the header is missing, malformed, or the token is invalid / expired,
 * the middleware short-circuits and responds with HTTP 401.
 *
 * @param {import('express').Request}  req  - Express request object
 * @param {import('express').Response} res  - Express response object
 * @param {import('express').NextFunction} next - Express next function
 * @returns {void}
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Extract the raw token string after the "Bearer " prefix
  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    // Fresh DB read: picks up role changes and bans that happened after token was issued
    const user = getDb()
      .prepare("SELECT id, username, email, role, is_banned FROM users WHERE id = ?")
      .get(payload.id) as (AuthUser & { is_banned: number }) | undefined;
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (user.is_banned) return res.status(403).json({ error: "This account has been suspended" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Signs a JWT for the given user and returns the token string.
 *
 * The token payload contains `id`, `username`, `email`, and `role`.
 * Tokens are valid for **7 days** from the time of creation.
 *
 * @param {{ id: number, username: string, email: string, role?: string }} user
 *   User object whose fields are embedded in the token payload.
 *   `role` defaults to `"member"` if omitted.
 * @returns {string} Signed JWT token string
 */
export function signToken(user: Pick<AuthUser, "id" | "username" | "email"> & 
                Partial<Pick<AuthUser, "role">>) {
  return jwt.sign(
    { id: user.id, 
      username: user.username, 
      email: user.email, 
      role: user.role || "member" 
    },
      JWT_SECRET,
    { expiresIn: "7d" }
  );
}