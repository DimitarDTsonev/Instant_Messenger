import express from "express";
import { authMiddleware } from "../middleware/auth";
import * as InvitesController from "../controllers/invites.controller";

const router = express.Router();

router.get( "/:code",       InvitesController.getInvite);
router.post("/:code/join",  authMiddleware, InvitesController.joinInvite);

export default router;
