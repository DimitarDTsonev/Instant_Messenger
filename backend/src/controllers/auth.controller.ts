import type { Request, Response } from "express";
import * as AuthService from "../services/auth.service";

export function register(req: Request, res: Response) {
  const result = AuthService.register(req.body);
  res.status(201).json(result);
}

export function guest(_req: Request, res: Response) {
  const result = AuthService.guest();
  res.status(201).json(result);
}

export function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const result = AuthService.login(email, password, req.ip);
  res.json(result);
}

export function me(req: Request, res: Response) {
  const user = AuthService.getMe(req.user.id);
  res.json({ user });
}

export function listUsers(_req: Request, res: Response) {
  const users = AuthService.listUsers();
  res.json({ users });
}

export function searchUsers(req: Request, res: Response) {
  const q     = typeof req.query.q === "string" ? req.query.q : "";
  const users = AuthService.searchUsers(q);
  res.json({ users });
}

export function getUserById(req: Request, res: Response) {
  const user = AuthService.getUserById(req.params.id);
  res.json({ user });
}

export function updateUserRole(req: Request, res: Response) {
  const result = AuthService.updateUserRole(req.user.id, req.user.role, req.params.id, req.body.role);
  res.json({ success: true, ...result });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  if (email?.trim()) await AuthService.forgotPassword(email);
  res.json({ success: true });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body;
  await AuthService.resetPassword(token, password);
  res.json({ success: true });
}
