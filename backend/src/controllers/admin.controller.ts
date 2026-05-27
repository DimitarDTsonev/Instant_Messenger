import type { Request, Response } from "express";
import * as AdminService from "../services/admin.service";

export function getUsers(_req: Request, res: Response) {
  const users = AdminService.getUsers();
  res.json({ users });
}

export function getSecurityLogs(req: Request, res: Response) {
  const limit = Math.min(parseInt(String(req.query.limit || "100")) || 100, 500);
  const event = typeof req.query.event === "string" ? req.query.event : null;
  const logs  = AdminService.getSecurityLogs(limit, event);
  res.json({ logs });
}

export function ban(req: Request, res: Response) {
  const reason = (req.body.reason || "Banned by admin") as string;
  const result = AdminService.ban(req.user.id, req.user.username, Number(req.params.userId), reason);
  res.json({ success: true, ...result });
}

export function unban(req: Request, res: Response) {
  const result = AdminService.unban(req.user.id, req.user.username, Number(req.params.userId));
  res.json({ success: true, ...result });
}
