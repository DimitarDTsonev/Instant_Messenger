import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../types";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database";

// Secret key used to sign and verify JWTs.
// Must be overridden via the JWT_SECRET environment variable in production.
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-change-in-prod";

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