/**
 * Direct message read routes.
 *
 * All routes require authentication (`authMiddleware` applied at router level).
 * Write operations (send/edit/delete/react) are handled over WebSocket.
 *
 * Routes:
 *   GET  /api/dm/conversations    — List all DM conversations for the current user.
 *   GET  /api/dm/:userId          — Paginated message history with a specific user.
 *   POST /api/dm/:userId/read     — Mark all messages from `:userId` as read.
 *
 * Note: `conversations` is a fixed path and must be listed before `/:userId` to
 * prevent Express from treating "conversations" as a user ID parameter.
 */

import express from "express";
import { authMiddleware } from "../middleware/auth";
import * as DmController from "../controllers/dm.controller";

const router = express.Router();
router.use(authMiddleware);

// Fixed path must come before parameterised route to avoid shadowing
router.get( "/conversations",  DmController.getConversations);
router.get( "/:userId",        DmController.getMessages);
router.post("/:userId/read",   DmController.markRead);

export default router;