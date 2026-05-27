import express from "express";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { BanSchema } from "../schemas/admin.schemas";
import { ForbiddenError } from "../errors";
import * as AdminController from "../controllers/admin.controller";

const router = express.Router();
router.use(authMiddleware);

router.use((req, _res, next) => {
  if (req.user.role !== "admin") throw new ForbiddenError("Admin access required");
  next();
});

router.get( "/users",              AdminController.getUsers);
router.get( "/security-logs",      AdminController.getSecurityLogs);
router.post("/ban/:userId",         validate(BanSchema), AdminController.ban);
router.post("/unban/:userId",       AdminController.unban);

export default router;
