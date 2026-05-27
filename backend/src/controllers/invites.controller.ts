import type { Request, Response } from "express";
import * as InviteService from "../services/invites.service";

export function getInvite(req: Request, res: Response) {
  const invite = InviteService.getInvite(req.params.code);
  res.json({ invite });
}

export function joinInvite(req: Request, res: Response) {
  const channel = InviteService.joinInvite(req.params.code, req.user.id);
  res.json({ success: true, channel });
}
