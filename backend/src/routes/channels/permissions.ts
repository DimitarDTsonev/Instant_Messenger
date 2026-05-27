import { Router } from "express";
import * as ChannelsController from "../../controllers/channels.controller";

const router = Router({ mergeParams: true });

router.get("/"      , ChannelsController.getPermissions);
router.put("/:role" , ChannelsController.updatePermission);

export default router;
