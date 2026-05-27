import type { Request, Response } from "express";
import * as MessageService from "../services/messages.service";

export function getHistory(req: Request, res: Response) {
  const { channelId } = req.params;
  const limit  = Math.min(parseInt(String(req.query.limit || "50")) || 50, 100);
  const before = req.query.before ? parseInt(String(req.query.before)) : null;
  const result = MessageService.getHistory(req.user.id, channelId, limit, before);
  res.json(result);
}

export function getPinned(req: Request, res: Response) {
  const messages = MessageService.getPinned(req.user.id, req.params.channelId);
  res.json({ messages });
}

export function searchAll(req: Request, res: Response) {
  const q      = typeof req.query.q === "string" ? req.query.q : "";
  const result = MessageService.searchAll(req.user.id, q);
  res.json(result);
}

export function searchInChannel(req: Request, res: Response) {
  const q      = typeof req.query.q === "string" ? req.query.q : "";
  const result = MessageService.searchInChannel(req.user.id, req.params.channelId, q);
  res.json(result);
}
