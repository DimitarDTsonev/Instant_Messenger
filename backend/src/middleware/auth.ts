import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "../types";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database";
import { ForbiddenError, UnauthorizedError } from "../errors";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-change-in-prod";

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Authentication required"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    // Fresh DB read: picks up role changes and bans that happened after token was issued
    const user = getDb()
      .prepare("SELECT id, username, email, role, is_banned FROM users WHERE id = ?")
      .get(payload.id) as (AuthUser & { is_banned: number }) | undefined;
    if (!user) return next(new UnauthorizedError("Authentication required"));
    if (user.is_banned) return next(new ForbiddenError("This account has been suspended"));
    req.user = user;
    next();
  } catch {
    return next(new UnauthorizedError("Invalid or expired token"));
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
