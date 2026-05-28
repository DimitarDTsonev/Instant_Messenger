/**
 * Admin controller — Express route handlers for the admin panel endpoints.
 *
 * All routes require the global admin role, enforced by the
 * `requireAdmin` middleware in routes/admin.ts.
 *
 * Imported by: routes/admin.ts.
 */

import type { Request, Response } from "express";
import * as AdminService from "../services/admin.service";

/**
 * GET /api/admin/users
 * Returns all user accounts with ban status for the admin users table.
 *
 * @param _req - No parameters required.
 * @param res  - 200 `{ users }`.
 */
export function getUsers(_req: Request, res: Response) {
  const users = AdminService.getUsers();
  res.json({ users });
}

/**
 * GET /api/admin/security-logs
 * Returns security event log entries in reverse-chronological order.
 *
 * Query params:
 *  - `limit` (optional, max 500, default 100) — number of records.
 *  - `event` (optional) — filter by event type (e.g. "login_fail").
 *
 * @param req - Query: `limit?`, `event?`.
 * @param res - 200 `{ logs }`.
 */
export function getSecurityLogs(req: Request, res: Response) {
  const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 500);
  const event = typeof req.query.event === "string" ? req.query.event : null;
  const logs  = AdminService.getSecurityLogs(limit, event);
  res.json({ logs });
}

/**
 * POST /api/admin/users/:userId/ban
 * Bans a user account, preventing future logins.
 *
 * @param req - Param: `userId`; body: `{ reason? }`.
 * @param res - 200 `{ success, username, reason }`.
 */
export function ban(req: Request, res: Response) {
  const reason = (req.body.reason || "Banned by admin") as string;
  const result = AdminService.ban(req.user.id, req.user.username, Number(req.params.userId), reason);
  res.json({ success: true, ...result });
}

/**
 * POST /api/admin/users/:userId/unban
 * Removes the ban from a user account.
 *
 * @param req - Param: `userId`.
 * @param res - 200 `{ success, username }`.
 */
export function unban(req: Request, res: Response) {
  const result = AdminService.unban(req.user.id, req.user.username, Number(req.params.userId));
  res.json({ success: true, ...result });
}
