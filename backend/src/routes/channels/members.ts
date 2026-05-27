import { Router } from "express";
import { validate } from "../../middleware/validate";
import { AddMemberSchema, UpdateMemberRoleSchema } from "../../schemas/channel.schemas";
import * as ChannelsController from "../../controllers/channels.controller";

const router = Router({ mergeParams: true });

router.get(    "/",         ChannelsController.getMembers);
router.post(   "/",         validate(AddMemberSchema),        ChannelsController.addMember);
router.patch(  "/:userId",  validate(UpdateMemberRoleSchema), ChannelsController.updateMemberRole);
router.delete( "/:userId",  ChannelsController.removeMember);

export default router;
