/**
 * Channel member management sub-router.
 *
 * Mounted at `/api/channels/:id/members` by routes/channels/index.ts.
 * `mergeParams: true` makes the parent `:id` param available as `req.params.id`.
 * Authentication is inherited from the parent router.
 *
 * Routes:
 *   GET    /api/channels/:id/members           — List all members with their roles.
 *   POST   /api/channels/:id/members           — Add a member by username.
 *   PATCH  /api/channels/:id/members/:userId   — Change a member's role.
 *   DELETE /api/channels/:id/members/:userId   — Remove a member.
 */

import { Router } from "express";
import { validate } from "../../middleware/validate";
import { AddMemberSchema, UpdateMemberRoleSchema } from "../../schemas/channel.schemas";
import * as ChannelsController from "../../controllers/channels.controller";

// mergeParams: true — allows access to the parent router's :id param
const router = Router({ mergeParams: true });

router.get(    "/",         ChannelsController.getMembers);
router.post(   "/",         validate(AddMemberSchema),        ChannelsController.addMember);
router.patch(  "/:userId",  validate(UpdateMemberRoleSchema), ChannelsController.updateMemberRole);
router.delete( "/:userId",  ChannelsController.removeMember);

export default router;
