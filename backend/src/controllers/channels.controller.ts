/**
 * Channels controller — Express route handlers for channel management endpoints.
 *
 * Each handler extracts validated input from `req` (populated by the auth
 * middleware and Zod validate middleware), delegates to ChannelService,
 * and serialises the result. All error handling is in the service layer.
 *
 * Imported by: routes/channels/index.ts, routes/channels/members.ts,
 *              routes/channels/permissions.ts, routes/channels/channelInvites.ts.
 */

import type { Request, Response } from "express";
import * as ChannelService from "../services/channels.service";

/**
 * GET /api/channels
 * Returns all channels visible to the authenticated user
 * (public + private ones they are a member of).
 *
 * @param req - `req.user.id` from authMiddleware.
 * @param res - 200 `{ channels }`.
 */
export function list(req: Request, res: Response) {
  const channels = ChannelService.listForUser(req.user.id);
  res.json({ channels });
}

/**
 * POST /api/channels
 * Creates a new channel. The creator becomes its owner.
 *
 * @param req - Body: `{ name, description?, is_private? }`.
 * @param res - 201 `{ channel }`.
 */
export function create(req: Request, res: Response) {
  const channel = ChannelService.create(req.user.id, req.body);
  res.status(201).json({ channel });
}

/**
 * PATCH /api/channels/:id
 * Updates channel description and/or privacy flag. Owner only.
 *
 * @param req - Param: `id`; body: `{ description?, is_private? }`.
 * @param res - 200 `{ channel }`.
 */
export function update(req: Request, res: Response) {
  const channel = ChannelService.update(req.user.id, req.params.id, req.body);
  res.json({ channel });
}

/**
 * DELETE /api/channels/:id
 * Permanently deletes a channel and all its messages. Owner or global admin only.
 *
 * @param req - Param: `id`.
 * @param res - 204 No Content.
 */
export function remove(req: Request, res: Response) {
  ChannelService.remove(req.user.id, req.user.role, req.params.id);
  res.status(204).send();
}

// ─── Members ────────────────────────────────────────────────────────────────

/**
 * GET /api/channels/:id/members
 * Returns the member list with per-member channel roles.
 *
 * @param req - Param: `id`.
 * @param res - 200 `{ members }`.
 */
export function getMembers(req: Request, res: Response) {
  const members = ChannelService.getMembers(req.user.id, req.params.id);
  res.json({ members });
}

/**
 * POST /api/channels/:id/members
 * Adds a user to the channel by username.
 *
 * @param req - Param: `id`; body: `{ username }`.
 * @param res - 200 `{ success, user }`.
 */
export function addMember(req: Request, res: Response) {
  const user = ChannelService.addMember(req.user.id, req.params.id, req.body.username);
  res.json({ success: true, user });
}

/**
 * PATCH /api/channels/:id/members/:userId/role
 * Changes a member's channel-level role.
 *
 * @param req - Params: `id`, `userId`; body: `{ role }`.
 * @param res - 200 `{ success, role }`.
 */
export function updateMemberRole(req: Request, res: Response) {
  const role = ChannelService.updateMemberRole(req.user.id, req.params.id, req.params.userId, req.body.role);
  res.json({ success: true, role });
}

/**
 * DELETE /api/channels/:id/members/:userId
 * Removes a member from the channel.
 *
 * @param req - Params: `id`, `userId`.
 * @param res - 204 No Content.
 */
export function removeMember(req: Request, res: Response) {
  ChannelService.removeMember(req.user.id, req.params.id, req.params.userId);
  res.status(204).send();
}

// ─── Permissions ────────────────────────────────────────────────────────────

/**
 * GET /api/channels/:id/permissions
 * Returns the permission sets for the "manager" and "member" roles.
 *
 * @param req - Param: `id`.
 * @param res - 200 `{ permissions }`.
 */
export function getPermissions(req: Request, res: Response) {
  const permissions = ChannelService.getPermissions(req.user.id, req.params.id);
  res.json({ permissions });
}

/**
 * PUT /api/channels/:id/permissions/:role
 * Creates or replaces the permission set for a given role in a channel.
 *
 * @param req - Params: `id`, `role`; body: permission flags.
 * @param res - 200 `{ success }`.
 */
export function updatePermission(req: Request, res: Response) {
  ChannelService.updatePermission(req.user.id, req.params.id, req.params.role, req.body);
  res.json({ success: true });
}

// ─── Invites ─────────────────────────────────────────────────────────────────

/**
 * POST /api/channels/:id/invites
 * Generates a new invite link for the channel.
 *
 * @param req - Param: `id`; body: `{ maxUses?, expiresInHours? }`.
 * @param res - 201 `{ invite }`.
 */
export function createInvite(req: Request, res: Response) {
  const invite = ChannelService.createInvite(req.user.id, req.params.id, req.body);
  res.status(201).json({ invite });
}

/**
 * GET /api/channels/:id/invites
 * Lists all invite links for the channel.
 *
 * @param req - Param: `id`.
 * @param res - 200 `{ invites }`.
 */
export function listInvites(req: Request, res: Response) {
  const invites = ChannelService.listInvites(req.user.id, req.params.id);
  res.json({ invites });
}

/**
 * DELETE /api/channels/:id/invites/:code
 * Deletes a specific invite link by code.
 *
 * @param req - Params: `id`, `code`.
 * @param res - 204 No Content.
 */
export function deleteInvite(req: Request, res: Response) {
  ChannelService.deleteInvite(req.user.id, req.params.id, req.params.code);
  res.status(204).send();
}
