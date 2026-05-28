/**
 * Admin service — business logic for the admin panel operations.
 *
 * Exposes user listing, security log retrieval, and user ban/unban management.
 * All write operations log a security event for auditability.
 *
 * Imported by: admin.controller.ts.
 */

import { getDb } from "../db/database";
import { logSecurityEvent } from "../middleware/security";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import * as Repo from "../repositories/admin.repository";

/**
 * Returns all user accounts with ban status fields for the admin users table.
 *
 * @returns Array of user rows (includes is_banned, ban_reason).
 */
export function getUsers() {
  return Repo.findAllUsers(getDb());
}

/**
 * Returns security log entries in reverse-chronological order.
 *
 * @param limit - Maximum number of records to return (capped at 500 by the controller).
 * @param event - Optional event-type filter (e.g. "login_fail"). Pass `null` to return all.
 * @returns     Array of security log rows.
 */
export function getSecurityLogs(limit: number, event?: string | null) {
  return Repo.findSecurityLogs(getDb(), limit, event);
}

/**
 * Bans a user account, preventing future logins and socket connections.
 *
 * An admin cannot ban themselves or another admin. The ban reason is
 * truncated to 255 characters and logged as a security event.
 *
 * @param requesterId      - ID of the admin performing the ban.
 * @param requesterUsername - Username of the admin (for the audit log).
 * @param targetId         - ID of the user to ban.
 * @param reason           - Human-readable ban reason.
 * @returns                `{ username, reason }` confirming the ban.
 * @throws                 ValidationError  if the admin tries to ban themselves.
 * @throws                 NotFoundError    if the target user doesn't exist.
 * @throws                 ForbiddenError   if the target is another admin.
 */
export function ban(requesterId: number, requesterUsername: string, targetId: number, reason: string) {
  if (targetId === requesterId) throw new ValidationError("You cannot ban yourself");

  const db     = getDb();
  const target = Repo.findUserById(db, targetId);
  if (!target) throw new NotFoundError("User not found");
  if (target.role === "admin") throw new ForbiddenError("Cannot ban another admin");

  const safeReason = reason.slice(0, 255);
  Repo.ban(db, targetId, safeReason);

  logSecurityEvent(db, {
    event: "user_banned",
    userId: targetId,
    username: target.username,
    detail: `banned by admin ${requesterUsername}: ${safeReason}`,
  });

  return { username: target.username, reason: safeReason };
}

/**
 * Removes the ban from a user account, re-enabling login and socket access.
 *
 * @param requesterId       - ID of the admin performing the unban (for the audit log).
 * @param requesterUsername - Username of the admin (for the audit log).
 * @param targetId          - ID of the user to unban.
 * @returns                 `{ username }` confirming who was unbanned.
 * @throws                  NotFoundError if the target user doesn't exist.
 */
export function unban(requesterId: number, requesterUsername: string, targetId: number) {
  const db     = getDb();
  const target = Repo.findUserById(db, targetId);
  if (!target) throw new NotFoundError("User not found");

  Repo.unban(db, targetId);

  logSecurityEvent(db, {
    event: "user_unbanned",
    userId: targetId,
    username: target.username,
    detail: `unbanned by admin ${requesterUsername}`,
  });

  return { username: target.username };
}
