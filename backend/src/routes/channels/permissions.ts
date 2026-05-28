/**
 * Channel permissions sub-router.
 *
 * Mounted at `/api/channels/:id/permissions` by routes/channels/index.ts.
 * `mergeParams: true` makes the parent `:id` param available as `req.params.id`.
 * Authentication is inherited from the parent router.
 *
 * Routes:
 *   GET /api/channels/:id/permissions       — Return all per-role permission sets.
 *   PUT /api/channels/:id/permissions/:role — Update permissions for one role.
 */

import { Router } from "express";
import * as ChannelsController from "../../controllers/channels.controller";

// mergeParams: true — allows access to the parent router's :id param
const router = Router({ mergeParams: true });

router.get("/"      , ChannelsController.getPermissions);
router.put("/:role" , ChannelsController.updatePermission);

export default router;
