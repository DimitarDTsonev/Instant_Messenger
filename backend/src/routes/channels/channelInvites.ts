/**
 * Channel invite-link sub-router.
 *
 * Mounted at `/api/channels/:id/invites` by routes/channels/index.ts.
 * `mergeParams: true` makes the parent `:id` param available as `req.params.id`.
 * Authentication is inherited from the parent router.
 *
 * Routes:
 *   POST   /api/channels/:id/invites       — Generate a new invite link.
 *   GET    /api/channels/:id/invites       — List all invite links for the channel.
 *   DELETE /api/channels/:id/invites/:code — Revoke an invite link by its code.
 */

import { Router } from "express";
import { validate } from "../../middleware/validate";
import { CreateInviteSchema } from "../../schemas/channel.schemas";
import * as ChannelsController from "../../controllers/channels.controller";

// mergeParams: true — allows access to the parent router's :id param
const router = Router({ mergeParams: true });

router.post(   "/",       validate(CreateInviteSchema), ChannelsController.createInvite);
router.get(    "/",       ChannelsController.listInvites);
router.delete( "/:code",  ChannelsController.deleteInvite);

export default router;
