/**
 * Channels service — business logic for channel CRUD, member management,
 * permission overrides, and invite-link generation.
 *
 * Validates that callers have the necessary channel role before writing to
 * the database (owner > manager > member > viewer). Throws typed AppError
 * subclasses on any rule violation.
 *
 * Imported by: channels.controller.ts.
 */

import crypto from "crypto";
import { getDb } from "../db/database";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import * as Repo from "../repositories/channels.repository";
import type { ChannelRole } from "../types";

/**
 * Returns all channels visible to the given user (public channels + private
 * channels the user is a member of).
 *
 * @param userId - Authenticated user's ID.
 * @returns      Array of channel objects with the user's role attached.
 */
export function listForUser(userId: number) {
  return Repo.findAllForUser(getDb(), userId);
}

/**
 * Creates a new channel.
 *
 * Channel names are normalised to lowercase with non-alphanumeric characters
 * replaced by hyphens. The creator is automatically added as the channel owner.
 *
 * @param userId - ID of the user creating the channel.
 * @param data   - `{ name, description?, is_private? }` from the request body.
 * @returns      The newly created channel record (with user_role = "owner").
 * @throws       ValidationError if the name is shorter than 2 characters.
 * @throws       ConflictError   if a channel with that name already exists.
 */
export function create(userId: number, data: { name?: string; description?: string; is_private?: unknown }) {
  if (!data.name || String(data.name).trim().length < 2) {
    throw new ValidationError("Channel name must be at least 2 characters");
  }
  // Normalise: lowercase, replace anything that isn't a-z, 0-9, or hyphen
  const cleanName = String(data.name).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const db = getDb();

  if (Repo.findByName(db, cleanName)) throw new ConflictError("A channel with that name already exists");

  const id = Repo.create(db, {
    name: cleanName,
    description: String(data.description || ""),
    createdBy: userId,
    isPrivate: !!data.is_private,
  });

  return Repo.findWithOwnerRole(db, id);
}

/**
 * Updates a channel's description and/or privacy setting.
 * Only the channel owner may do this.
 *
 * @param userId    - ID of the requesting user.
 * @param channelId - Channel ID string from the route parameter.
 * @param data      - `{ description?, is_private? }` patch fields.
 * @returns         The updated channel record.
 * @throws          ForbiddenError   if the user is not the channel owner.
 * @throws          ValidationError  if no valid fields are provided.
 */
export function update(userId: number, channelId: string, data: { description?: string; is_private?: unknown }) {
  const db   = getDb();
  const role = Repo.getUserRole(db, userId, channelId);
  if (role !== "owner") throw new ForbiddenError("Only the channel owner can edit settings");

  const fields: { description?: string; is_private?: number } = {};
  if (data.description !== undefined) fields.description = String(data.description);
  if (data.is_private  !== undefined) fields.is_private  = data.is_private ? 1 : 0;
  if (!Object.keys(fields).length) throw new ValidationError("No fields to update");

  Repo.update(db, channelId, fields);
  return db.prepare("SELECT * FROM channels WHERE id = ?").get(channelId);
}

/**
 * Permanently deletes a channel (and all its messages, via CASCADE).
 * Only the channel creator or a global admin may delete.
 *
 * @param userId    - Requesting user's ID.
 * @param userRole  - Requesting user's global role.
 * @param channelId - Channel ID string from the route parameter.
 * @throws          NotFoundError  if the channel doesn't exist.
 * @throws          ForbiddenError if the user is neither owner nor admin.
 */
export function remove(userId: number, userRole: string, channelId: string) {
  const db = getDb();
  const ch = Repo.findById(db, channelId);
  if (!ch) throw new NotFoundError("Channel not found");

  const isAdmin = userRole === "admin";
  const isOwner = Number(ch.created_by) === Number(userId);
  if (!isOwner && !isAdmin) throw new ForbiddenError("You do not have permission to delete this channel");

  Repo.remove(db, channelId);
}

// ─── Members ────────────────────────────────────────────────────────────────

/**
 * Lists all members of a channel with their channel-level roles.
 * Requires the caller to be a member (any role) of the channel.
 *
 * @param userId    - Requesting user's ID (used for access check).
 * @param channelId - Channel ID.
 * @returns         Array of member objects ordered by role then username.
 * @throws          ForbiddenError if the user is not a member.
 */
export function getMembers(userId: number, channelId: string) {
  const db   = getDb();
  const role = Repo.getUserRole(db, userId, channelId);
  if (!role) throw new ForbiddenError("You do not have access to this channel");
  return Repo.getMembers(db, channelId);
}

/**
 * Adds a user (found by username) to a channel as a regular member.
 * Requires the `can_manage_members` permission on the caller's role.
 *
 * @param userId    - ID of the user performing the action.
 * @param channelId - Target channel.
 * @param username  - Username of the user to add.
 * @returns         The added user's public profile.
 * @throws          ForbiddenError  if the caller lacks manage-members permission.
 * @throws          NotFoundError   if no user with that username exists.
 */
export function addMember(userId: number, channelId: string, username: string) {
  const db    = getDb();
  const role  = Repo.getUserRole(db, userId, channelId);
  const perms = role ? Repo.getPerms(db, channelId, role) : null;
  if (!perms?.can_manage_members) throw new ForbiddenError("You do not have permission to add members");

  const target = db.prepare("SELECT id, username, avatar FROM users WHERE username = ?").get(username) as
    | { id: number; username: string; avatar?: string | null }
    | undefined;
  if (!target) throw new NotFoundError("User not found");

  Repo.addMember(db, channelId, target.id);
  return target;
}

/**
 * Changes a member's channel role (manager / member / viewer).
 *
 * Only owners can assign the "manager" role. Owners cannot be demoted.
 *
 * @param userId       - ID of the user making the change.
 * @param channelId    - Target channel.
 * @param targetUserId - ID of the member whose role should change.
 * @param newRole      - New role value: "manager" | "member" | "viewer".
 * @returns            The new role value.
 * @throws             ForbiddenError   if the caller is not owner or manager.
 * @throws             ForbiddenError   if attempting to assign manager without being owner.
 * @throws             ForbiddenError   if trying to demote the owner.
 * @throws             ValidationError  if the role string is invalid.
 */
export function updateMemberRole(userId: number, channelId: string, targetUserId: string, newRole: string) {
  const db     = getDb();
  const myRole = Repo.getUserRole(db, userId, channelId);

  if (!["owner", "manager"].includes(myRole as string)) {
    throw new ForbiddenError("You do not have permission to change roles");
  }
  if (!["manager", "member", "viewer"].includes(newRole)) {
    throw new ValidationError("Invalid role (manager | member | viewer)");
  }
  // Only the owner can promote someone to manager
  if (newRole === "manager" && myRole !== "owner") {
    throw new ForbiddenError("Only the owner can assign the manager role");
  }

  const targetRole = Repo.getUserRole(db, targetUserId, channelId);
  if (targetRole === "owner") throw new ForbiddenError("The owner role cannot be changed");

  Repo.updateMemberRole(db, channelId, targetUserId, newRole);
  return newRole as ChannelRole;
}

/**
 * Removes a member from a channel.
 * Requires `can_manage_members` permission. The channel owner cannot be removed.
 *
 * @param userId       - ID of the user performing the removal.
 * @param channelId    - Target channel.
 * @param targetUserId - ID of the member to remove.
 * @throws             ForbiddenError if the caller lacks manage-members permission.
 * @throws             ForbiddenError if trying to remove the owner.
 */
export function removeMember(userId: number, channelId: string, targetUserId: string) {
  const db     = getDb();
  const myRole = Repo.getUserRole(db, userId, channelId);
  const perms  = myRole ? Repo.getPerms(db, channelId, myRole) : null;
  if (!perms?.can_manage_members) throw new ForbiddenError("You do not have permission to remove members");

  const targetRole = Repo.getUserRole(db, targetUserId, channelId);
  if (targetRole === "owner") throw new ForbiddenError("The owner cannot be removed");

  Repo.removeMember(db, channelId, targetUserId);
}

// ─── Permissions ────────────────────────────────────────────────────────────

/**
 * Returns the permission sets for the "manager" and "member" roles in a channel.
 * Falls back to the default permission sets if no overrides have been stored.
 *
 * @param userId    - Requesting user's ID (must be a channel member).
 * @param channelId - Target channel.
 * @returns         Object keyed by role with permission booleans.
 * @throws          ForbiddenError if the user is not a member.
 */
export function getPermissions(userId: number, channelId: string) {
  const db   = getDb();
  const role = Repo.getUserRole(db, userId, channelId);
  if (!role) throw new ForbiddenError("Access denied");

  const rows = Repo.getPermissions(db, channelId) as Array<{ role: string; channel_id: number; [key: string]: unknown }>;
  const byRole: Record<string, unknown> = {};
  for (const r of ["manager", "member"] as Array<Exclude<ChannelRole, "owner">>) {
    byRole[r] = rows.find((x) => x.role === r) || { ...Repo.DEFAULT_PERMS[r], role: r, channel_id: Number(channelId) };
  }
  return byRole;
}

/**
 * Creates or updates a role's permission set for a channel.
 * Only the channel owner may edit permissions.
 *
 * @param userId      - Requesting user's ID.
 * @param channelId   - Target channel.
 * @param targetRole  - Role to update: "manager" or "member".
 * @param perms       - Object with permission flags (truthy = 1, falsy = 0).
 * @throws            ForbiddenError   if the user is not the owner.
 * @throws            ValidationError  if targetRole is not "manager" or "member".
 */
export function updatePermission(
  userId: number,
  channelId: string,
  targetRole: string,
  perms: { can_write?: unknown; can_invite?: unknown; can_manage_members?: unknown; can_delete_messages?: unknown },
) {
  const db     = getDb();
  const myRole = Repo.getUserRole(db, userId, channelId);
  if (myRole !== "owner") throw new ForbiddenError("Only the channel owner can edit permissions");
  if (!["manager", "member"].includes(targetRole)) throw new ValidationError("Invalid role");

  Repo.upsertPermission(db, channelId, targetRole, {
    can_write:           perms.can_write           ? 1 : 0,
    can_invite:          perms.can_invite          ? 1 : 0,
    can_manage_members:  perms.can_manage_members  ? 1 : 0,
    can_delete_messages: perms.can_delete_messages ? 1 : 0,
  });
}

// ─── Channel invites ─────────────────────────────────────────────────────────

/**
 * Generates a new invite link for a channel.
 * Requires the `can_invite` permission. Supports optional max-use and expiry.
 *
 * @param userId    - Requesting user's ID.
 * @param channelId - Target channel.
 * @param opts      - `{ maxUses?, expiresInHours? }` options.
 * @returns         The newly created invite row.
 * @throws          ForbiddenError if the user lacks `can_invite`.
 */
export function createInvite(userId: number, channelId: string, opts: { maxUses?: unknown; expiresInHours?: unknown }) {
  const db    = getDb();
  const role  = Repo.getUserRole(db, userId, channelId);
  const perms = role ? Repo.getPerms(db, channelId, role) : null;
  if (!perms?.can_invite) throw new ForbiddenError("You do not have permission to create invites");

  const code      = crypto.randomBytes(5).toString("hex"); // 10-character hex code
  const maxUses   = opts.maxUses ? Number(opts.maxUses) : null;
  const expiresAt = opts.expiresInHours
    ? new Date(Date.now() + Number(opts.expiresInHours) * 3600 * 1000).toISOString()
    : null;

  return Repo.createInvite(db, { channelId, createdBy: userId, code, maxUses, expiresAt });
}

/**
 * Lists all active invite links for a channel.
 * Requires the `can_invite` permission.
 *
 * @param userId    - Requesting user's ID.
 * @param channelId - Target channel.
 * @returns         Array of invite rows ordered by creation date descending.
 * @throws          ForbiddenError if the user lacks `can_invite`.
 */
export function listInvites(userId: number, channelId: string) {
  const db    = getDb();
  const role  = Repo.getUserRole(db, userId, channelId);
  const perms = role ? Repo.getPerms(db, channelId, role) : null;
  if (!perms?.can_invite) throw new ForbiddenError("Access denied");
  return Repo.getInvites(db, channelId);
}

/**
 * Deletes an invite link by its code.
 * Requires the `can_invite` permission.
 *
 * @param userId    - Requesting user's ID.
 * @param channelId - Target channel.
 * @param code      - Invite code to delete.
 * @throws          ForbiddenError if the user lacks `can_invite`.
 */
export function deleteInvite(userId: number, channelId: string, code: string) {
  const db    = getDb();
  const role  = Repo.getUserRole(db, userId, channelId);
  const perms = role ? Repo.getPerms(db, channelId, role) : null;
  if (!perms?.can_invite) throw new ForbiddenError("You do not have permission to manage invites");
  Repo.deleteInvite(db, channelId, code);
}
