/**
 * Messages controller — Express route handlers for channel message endpoints.
 *
 * Handles message history retrieval, pinned messages, and full-text search.
 * All message mutation (send, edit, delete, react, pin) is handled over
 * Socket.io in the socket/messageHandlers module, not via REST.
 *
 * Imported by: routes/messages.ts.
 */

import type { Request, Response } from "express";
import * as MessageService from "../services/messages.service";

/**
 * GET /api/messages/:channelId
 * Returns a page of channel messages, newest first.
 *
 * Query params:
 *  - `limit`  (optional, max 100, default 50) — page size.
 *  - `before` (optional) — cursor: return only messages with ID < before.
 *
 * @param req - Param: `channelId`; query: `limit?`, `before?`.
 * @param res - 200 `{ messages, hasMore }`.
 */
export function getHistory(req: Request, res: Response) {
  const { channelId } = req.params;
  const limit  = Math.min(parseInt(String(req.query.limit || "50")) || 50, 100);
  const before = req.query.before ? parseInt(String(req.query.before)) : null;
  const result = MessageService.getHistory(req.user.id, channelId, limit, before);
  res.json(result);
}

/**
 * GET /api/messages/:channelId/pinned
 * Returns all pinned messages in the channel, newest pin first.
 *
 * @param req - Param: `channelId`.
 * @param res - 200 `{ messages }`.
 */
export function getPinned(req: Request, res: Response) {
  const messages = MessageService.getPinned(req.user.id, req.params.channelId);
  res.json({ messages });
}

/**
 * GET /api/messages/search?q=<query>
 * Searches across all channel messages and DMs the user can access.
 *
 * @param req - Query: `q` — search term (min 2 characters).
 * @param res - 200 `{ results, query }`.
 */
export function searchAll(req: Request, res: Response) {
  const q      = typeof req.query.q === "string" ? req.query.q : "";
  const result = MessageService.searchAll(req.user.id, q);
  res.json(result);
}

/**
 * GET /api/messages/:channelId/search?q=<query>
 * Searches messages within a specific channel.
 *
 * @param req - Param: `channelId`; query: `q` — search term.
 * @param res - 200 `{ results, query, count }`.
 */
export function searchInChannel(req: Request, res: Response) {
  const q      = typeof req.query.q === "string" ? req.query.q : "";
  const result = MessageService.searchInChannel(req.user.id, req.params.channelId, q);
  res.json(result);
}
