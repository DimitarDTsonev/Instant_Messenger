import crypto from "crypto";
import { getDb } from "../db/database";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import * as Repo from "../repositories/channels.repository";
import type { ChannelRole } from "../types";

export function listForUser(userId: number) {
  return Repo.findAllForUser(getDb(), userId);
}

export function create(userId: number, data: { name?: string; description?: string; is_private?: unknown }) {
  if (!data.name || String(data.name).trim().length < 2) {
    throw new ValidationError("Channel name must be at least 2 characters");
  }
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

export function remove(userId: number, userRole: string, channelId: string) {
  const db = getDb();
  const ch = Repo.findById(db, channelId);
  if (!ch) throw new NotFoundError("Channel not found");

  const isAdmin = userRole === "admin";
  const isOwner = Number(ch.created_by) === Number(userId);
  if (!isOwner && !isAdmin) throw new ForbiddenError("You do not have permission to delete this channel");

  Repo.remove(db, channelId);
}

// Members
export function getMembers(userId: number, channelId: string) {
  const db   = getDb();
  const role = Repo.getUserRole(db, userId, channelId);
  if (!role) throw new ForbiddenError("You do not have access to this channel");
  return Repo.getMembers(db, channelId);
}

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

export function updateMemberRole(userId: number, channelId: string, targetUserId: string, newRole: string) {
  const db     = getDb();
  const myRole = Repo.getUserRole(db, userId, channelId);

  if (!["owner", "manager"].includes(myRole as string)) {
    throw new ForbiddenError("You do not have permission to change roles");
  }
  if (!["manager", "member", "viewer"].includes(newRole)) {
    throw new ValidationError("Invalid role (manager | member | viewer)");
  }
  if (newRole === "manager" && myRole !== "owner") {
    throw new ForbiddenError("Only the owner can assign the manager role");
  }

  const targetRole = Repo.getUserRole(db, targetUserId, channelId);
  if (targetRole === "owner") throw new ForbiddenError("The owner role cannot be changed");

  Repo.updateMemberRole(db, channelId, targetUserId, newRole);
  return newRole as ChannelRole;
}

export function removeMember(userId: number, channelId: string, targetUserId: string) {
  const db     = getDb();
  const myRole = Repo.getUserRole(db, userId, channelId);
  const perms  = myRole ? Repo.getPerms(db, channelId, myRole) : null;
  if (!perms?.can_manage_members) throw new ForbiddenError("You do not have permission to remove members");

  const targetRole = Repo.getUserRole(db, targetUserId, channelId);
  if (targetRole === "owner") throw new ForbiddenError("The owner cannot be removed");

  Repo.removeMember(db, channelId, targetUserId);
}

// Permissions
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

// Channel invites
export function createInvite(userId: number, channelId: string, opts: { maxUses?: unknown; expiresInHours?: unknown }) {
  const db    = getDb();
  const role  = Repo.getUserRole(db, userId, channelId);
  const perms = role ? Repo.getPerms(db, channelId, role) : null;
  if (!perms?.can_invite) throw new ForbiddenError("You do not have permission to create invites");

  const code      = crypto.randomBytes(5).toString("hex");
  const maxUses   = opts.maxUses ? Number(opts.maxUses) : null;
  const expiresAt = opts.expiresInHours
    ? new Date(Date.now() + Number(opts.expiresInHours) * 3600 * 1000).toISOString()
    : null;

  return Repo.createInvite(db, { channelId, createdBy: userId, code, maxUses, expiresAt });
}

export function listInvites(userId: number, channelId: string) {
  const db    = getDb();
  const role  = Repo.getUserRole(db, userId, channelId);
  const perms = role ? Repo.getPerms(db, channelId, role) : null;
  if (!perms?.can_invite) throw new ForbiddenError("Access denied");
  return Repo.getInvites(db, channelId);
}

export function deleteInvite(userId: number, channelId: string, code: string) {
  const db    = getDb();
  const role  = Repo.getUserRole(db, userId, channelId);
  const perms = role ? Repo.getPerms(db, channelId, role) : null;
  if (!perms?.can_invite) throw new ForbiddenError("You do not have permission to manage invites");
  Repo.deleteInvite(db, channelId, code);
}
