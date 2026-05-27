import express from "express";
import { authMiddleware } from "../middleware/auth";
import * as DmController from "../controllers/dm.controller";

const router = express.Router();
router.use(authMiddleware);

router.get( "/conversations",  DmController.getConversations);
router.get( "/:userId",        DmController.getMessages);
router.post("/:userId/read",   DmController.markRead);

export default router;
