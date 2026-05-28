/**
 * Invites controller — Express route handlers for the public invite-link endpoints.
 *
 * These routes are accessible to authenticated users who are not necessarily
 * members of the target channel. They power the invite-link join flow.
 *
 * Imported by: routes/invites.ts.
 */

import type { Request, Response } from "express";
import * as InviteService from "../services/invites.service";

/**
 * GET /api/invite/:code
 * Returns invite details (channel name, description, member count, creator)
 * for the public invite preview page. Validates that the invite is still usable.
 *
 * @param req - Param: `code` — the invite link code.
 * @param res - 200 `{ invite }`.
 */
export function getInvite(req: Request, res: Response) {
  const invite = InviteService.getInvite(req.params.code);
  res.json({ invite });
}

/**
 * POST /api/invite/:code/join
 * Processes the authenticated user joining a channel via an invite link.
 * Increments the invite's use counter on success.
 *
 * @param req - Param: `code`; `req.user.id` from authMiddleware.
 * @param res - 200 `{ success, channel }`.
 */
export function joinInvite(req: Request, res: Response) {
  const channel = InviteService.joinInvite(req.params.code, req.user.id);
  res.json({ success: true, channel });
}
