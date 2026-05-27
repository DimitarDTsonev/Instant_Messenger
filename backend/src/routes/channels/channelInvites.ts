import { Router } from "express";
import { validate } from "../../middleware/validate";
import { CreateInviteSchema } from "../../schemas/channel.schemas";
import * as ChannelsController from "../../controllers/channels.controller";

const router = Router({ mergeParams: true });

router.post(   "/",       validate(CreateInviteSchema), ChannelsController.createInvite);
router.get(    "/",       ChannelsController.listInvites);
router.delete( "/:code",  ChannelsController.deleteInvite);

export default router;
