/**
 * Message read/search routes.
 *
 * All routes require authentication (`authMiddleware` applied at router level).
 * Write operations (create/edit/delete/react/pin) are handled over WebSocket
 * via the socket handlers — this router is read-only.
 *
 * Routes:
 *   GET /api/messages/search                    — Full-text search across all accessible channels.
 *   GET /api/messages/:channelId                — Paginated message history (keyset, newest first).
 *   GET /api/messages/:channelId/pinned         — All pinned messages in a channel.
 *   GET /api/messages/:channelId/search?q=      — Full-text search within a specific channel.
 *
 * Note: the `/search` global route must be defined before `/:channelId` to
 * prevent Express from interpreting "search" as a channel ID.
 */

import express from "express";
import { authMiddleware } from "../middleware/auth";
import * as MessagesController from "../controllers/messages.controller";

const router = express.Router();
router.use(authMiddleware);

// Global search must come before /:channelId to avoid route shadowing
router.get("/search",              MessagesController.searchAll);
router.get("/:channelId",          MessagesController.getHistory);
router.get("/:channelId/pinned",   MessagesController.getPinned);
router.get("/:channelId/search",   MessagesController.searchInChannel);

export default router;
