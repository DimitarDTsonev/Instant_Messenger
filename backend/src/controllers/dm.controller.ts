import type { Request, Response } from "express";
import * as DmService from "../services/dm.service";

export function getConversations(req: Request, res: Response) {
  const conversations = DmService.getConversations(req.user.id);
  res.json({ conversations });
}

export function getMessages(req: Request, res: Response) {
  const limit  = Math.min(parseInt(String(req.query.limit || "50")) || 50, 100);
  const before = req.query.before ? parseInt(String(req.query.before)) : null;
  const result = DmService.getMessages(req.user.id, parseInt(req.params.userId), limit, before);
  res.json(result);
}

export function markRead(req: Request, res: Response) {
  DmService.markRead(req.user.id, parseInt(req.params.userId));
  res.json({ success: true });
}
