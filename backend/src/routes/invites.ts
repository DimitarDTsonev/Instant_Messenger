/**
 * Public invite-link routes.
 *
 * These routes handle the invite flow for channel join links. `getInvite` is
 * intentionally public so unauthenticated users can preview the channel before
 * creating an account. `joinInvite` requires authentication because it adds
 * the user to the channel's member list.
 *
 * Routes:
 *   GET  /api/invites/:code       — Look up invite metadata (channel name, uses, expiry).
 *   POST /api/invites/:code/join  — Join the channel linked to the invite (auth required).
 */

import express from "express";
import { authMiddleware } from "../middleware/auth";
import * as InvitesController from "../controllers/invites.controller";

const router = express.Router();

// Public: no auth required to preview the invite
router.get( "/:code",       InvitesController.getInvite);
// Protected: must be logged in to actually join the channel
router.post("/:code/join",  authMiddleware, InvitesController.joinInvite);

export default router;
