/**
 * Express module augmentation — adds the `user` property to the Express
 * `Request` interface so TypeScript knows the authenticated user is available
 * after `authMiddleware` has run.
 *
 * Without this augmentation, accessing `req.user` anywhere in the codebase
 * would require a type assertion or a runtime cast.
 *
 * Used implicitly by every route handler that reads `req.user`.
 */
import type { AuthUser } from "./types";

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export {};