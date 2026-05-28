/**
 * Direct Messages controller — Express route handlers for DM REST endpoints.
 *
 * Handles conversation list retrieval, paginated DM history, and read-marking.
 * DM message creation, editing, deletion, and reactions are handled via Socket.io
 * in the socket/dmHandlers module.
 *
 * Imported by: routes/dm.ts.
 */

import type { Request, Response } from "express";
import * as DmService from "../services/dm.service";

/**
 * GET /api/dm/conversations
 * Returns all DM conversation partners for the current user with last-message
 * preview and unread count.
 *
 * @param req - `req.user.id` from authMiddleware.
 * @param res - 200 `{ conversations }`.
 */
export function getConversations(req: Request, res: Response) {
  const conversations = DmService.getConversations(req.user.id);
  res.json({ conversations });
}

/**
 * GET /api/dm/:userId
 * Returns a paginated page of DMs between the current user and the specified partner.
 * Also marks the partner's messages as read.
 *
 * Query params:
 *  - `limit`  (optional, max 100, default 50) — page size.
 *  - `before` (optional) — cursor: return only messages with ID < before.
 *
 * @param req - Param: `userId` (partner ID); query: `limit?`, `before?`.
 * @param res - 200 `{ messages, hasMore, partner }`.
 */
export function getMessages(req: Request, res: Response) {
  const limit  = Math.min(parseInt(String(req.query.limit || "50")) || 50, 100);
  const before = req.query.before ? parseInt(String(req.query.before)) : null;
  const result = DmService.getMessages(req.user.id, parseInt(req.params.userId), limit, before);
  res.json(result);
}

/**
 * POST /api/dm/:userId/read
 * Marks all unread messages from the specified user as read.
 * Called when the client opens a DM conversation.
 *
 * @param req - Param: `userId` (the sender whose messages to mark as read).
 * @param res - 200 `{ success: true }`.
 */
export function markRead(req: Request, res: Response) {
  DmService.markRead(req.user.id, parseInt(req.params.userId));
  res.json({ success: true });
}
