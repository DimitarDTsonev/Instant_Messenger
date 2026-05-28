/**
 * Channel CRUD router — root sub-routes for `/api/channels`.
 *
 * All routes require authentication (`authMiddleware` applied at router level).
 *
 * Mounted sub-routers:
 *   /api/channels/:id/members     → routes/channels/members.ts
 *   /api/channels/:id/permissions → routes/channels/permissions.ts
 *   /api/channels/:id/invites     → routes/channels/channelInvites.ts
 *
 * Direct routes:
 *   GET    /api/channels      — List all channels accessible to the user.
 *   POST   /api/channels      — Create a new channel.
 *   PATCH  /api/channels/:id  — Update channel name/description/visibility.
 *   DELETE /api/channels/:id  — Delete a channel (owner only).
 *
 * Re-exports `getUserRole` and `getPerms` from the repository layer so that
 * other modules (socket handlers, messages route) can import them from here
 * without a direct repository import.
 */

import express from "express";
import { authMiddleware } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { CreateChannelSchema, UpdateChannelSchema } from "../../schemas/channel.schemas";
import * as ChannelsController from "../../controllers/channels.controller";
import membersRouter     from "./members";
import permissionsRouter from "./permissions";
import invitesRouter     from "./channelInvites";

// Re-export helpers used by other modules (socket handlers, messages route)
export { getUserRole, getPerms } from "../../repositories/channels.repository";

const router = express.Router();
// Apply authentication to all channel routes
router.use(authMiddleware);

// ─── Sub-routers ──────────────────────────────────────────────────────────────
// `mergeParams: true` is set in each sub-router so `:id` is available inside them
router.use("/:id/members",     membersRouter);
router.use("/:id/permissions", permissionsRouter);
router.use("/:id/invites",     invitesRouter);

// ─── Channel CRUD ─────────────────────────────────────────────────────────────
router.get( "/",    ChannelsController.list);
router.post("/",    validate(CreateChannelSchema), ChannelsController.create);
router.patch("/:id", validate(UpdateChannelSchema), ChannelsController.update);
router.delete("/:id", ChannelsController.remove);

export default router;
