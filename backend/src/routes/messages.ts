import express from "express";
import { authMiddleware } from "../middleware/auth";
import * as MessagesController from "../controllers/messages.controller";

const router = express.Router();
router.use(authMiddleware);

router.get("/search",              MessagesController.searchAll);
router.get("/:channelId",          MessagesController.getHistory);
router.get("/:channelId/pinned",   MessagesController.getPinned);
router.get("/:channelId/search",   MessagesController.searchInChannel);

export default router;
