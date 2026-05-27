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
router.use(authMiddleware);

router.use("/:id/members",     membersRouter);
router.use("/:id/permissions", permissionsRouter);
router.use("/:id/invites",     invitesRouter);

router.get( "/",    ChannelsController.list);
router.post("/",    validate(CreateChannelSchema), ChannelsController.create);
router.patch("/:id", validate(UpdateChannelSchema), ChannelsController.update);
router.delete("/:id", ChannelsController.remove);

export default router;
