/**
 * Admin management routes.
 *
 * All routes require:
 *  1. Authentication (`authMiddleware`).
 *  2. `role === "admin"` (enforced by the inline middleware below).
 *
 * Non-admin authenticated requests receive `403 Forbidden`.
 *
 * Routes:
 *   GET  /api/admin/users              — List all users with ban/role info.
 *   GET  /api/admin/security-logs      — Return the security event log.
 *   POST /api/admin/ban/:userId        — Ban a user with an optional reason.
 *   POST /api/admin/unban/:userId      — Remove a ban from a user.
 */

import express from "express";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { BanSchema } from "../schemas/admin.schemas";
import { ForbiddenError } from "../errors";
import * as AdminController from "../controllers/admin.controller";

const router = express.Router();
// Step 1: verify JWT and attach req.user
router.use(authMiddleware);

// Step 2: require admin role — throws ForbiddenError for non-admins
router.use((req, _res, next) => {
  if (req.user.role !== "admin") throw new ForbiddenError("Admin access required");
  next();
});

router.get( "/users",              AdminController.getUsers);
router.get( "/security-logs",      AdminController.getSecurityLogs);
router.post("/ban/:userId",         validate(BanSchema), AdminController.ban);
router.post("/unban/:userId",       AdminController.unban);

export default router;
