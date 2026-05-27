import type { Request, Response } from "express";
import * as ChannelService from "../services/channels.service";

export function list(req: Request, res: Response) {
  const channels = ChannelService.listForUser(req.user.id);
  res.json({ channels });
}

export function create(req: Request, res: Response) {
  const channel = ChannelService.create(req.user.id, req.body);
  res.status(201).json({ channel });
}

export function update(req: Request, res: Response) {
  const channel = ChannelService.update(req.user.id, req.params.id, req.body);
  res.json({ channel });
}

export function remove(req: Request, res: Response) {
  ChannelService.remove(req.user.id, req.user.role, req.params.id);
  res.status(204).send();
}

// Members
export function getMembers(req: Request, res: Response) {
  const members = ChannelService.getMembers(req.user.id, req.params.id);
  res.json({ members });
}

export function addMember(req: Request, res: Response) {
  const user = ChannelService.addMember(req.user.id, req.params.id, req.body.username);
  res.json({ success: true, user });
}

export function updateMemberRole(req: Request, res: Response) {
  const role = ChannelService.updateMemberRole(req.user.id, req.params.id, req.params.userId, req.body.role);
  res.json({ success: true, role });
}

export function removeMember(req: Request, res: Response) {
  ChannelService.removeMember(req.user.id, req.params.id, req.params.userId);
  res.status(204).send();
}

// Permissions
export function getPermissions(req: Request, res: Response) {
  const permissions = ChannelService.getPermissions(req.user.id, req.params.id);
  res.json({ permissions });
}

export function updatePermission(req: Request, res: Response) {
  ChannelService.updatePermission(req.user.id, req.params.id, req.params.role, req.body);
  res.json({ success: true });
}

// Invites
export function createInvite(req: Request, res: Response) {
  const invite = ChannelService.createInvite(req.user.id, req.params.id, req.body);
  res.status(201).json({ invite });
}

export function listInvites(req: Request, res: Response) {
  const invites = ChannelService.listInvites(req.user.id, req.params.id);
  res.json({ invites });
}

export function deleteInvite(req: Request, res: Response) {
  ChannelService.deleteInvite(req.user.id, req.params.id, req.params.code);
  res.status(204).send();
}
