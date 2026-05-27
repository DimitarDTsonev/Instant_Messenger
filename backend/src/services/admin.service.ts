import { getDb } from "../db/database";
import { logSecurityEvent } from "../middleware/security";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import * as Repo from "../repositories/admin.repository";

export function getUsers() {
  return Repo.findAllUsers(getDb());
}

export function getSecurityLogs(limit: number, event?: string | null) {
  return Repo.findSecurityLogs(getDb(), limit, event);
}

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
