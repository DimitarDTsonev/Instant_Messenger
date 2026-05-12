// ============================================================
//  src/routes/channels/permissions.ts — Per-role permission settings
//
//  Mounted at /:id/permissions on the channels router.
//
//  Routes:
//    GET  /        — return permission matrix for manager and member roles
//    PUT  /:role   — upsert permissions for a specific role (owner only)
// ============================================================

import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../../db/database";
import { DEFAULT_PERMS, getPerms, getUserRole } from "./helpers";
import type { ChannelRole, PermissionSet } from "../../types";

type ChannelReq = Request<{ id: string }>;
type RoleReq    = Request<{ id: string; role: string }>;

const router = Router({ mergeParams: true });

router.get("/", (req: ChannelReq, res: Response) => {
  const db   = getDb();
  const id   = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  if (!role) return res.status(403).json({ error: "Access denied" });

  const rows = db
    .prepare("SELECT * FROM channel_permissions WHERE channel_id = ?")
    .all(id) as Array<PermissionSet & { role: Exclude<ChannelRole, "owner">; channel_id: number }>;

  const byRole: Record<string, PermissionSet & { role: string; channel_id: number }> = {};
  for (const r of ["manager", "member"] as Array<Exclude<ChannelRole, "owner">>) {
    byRole[r] = rows.find((x) => x.role === r) || { ...DEFAULT_PERMS[r], role: r, channel_id: Number(id) };
  }
  return res.json({ permissions: byRole });
});

router.put("/:role", (req: RoleReq, res: Response) => {
  const db     = getDb();
  const { id, role } = req.params;
  const myRole = getUserRole(db, req.user.id, id);

  if (myRole !== "owner") return res.status(403).json({ error: "Only the channel owner can edit permissions" });
  if (!["manager", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });

  const { can_write = 1, can_invite = 0, can_manage_members = 0, can_delete_messages = 0 } = req.body;
  db.prepare(`
    INSERT INTO channel_permissions (channel_id, role, can_write, can_invite, can_manage_members, can_delete_messages)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id, role) DO UPDATE SET
      can_write           = excluded.can_write,
      can_invite          = excluded.can_invite,
      can_manage_members  = excluded.can_manage_members,
      can_delete_messages = excluded.can_delete_messages
  `).run(id, role, can_write ? 1 : 0, can_invite ? 1 : 0, can_manage_members ? 1 : 0, can_delete_messages ? 1 : 0);

  return res.json({ success: true });
});

export default router;
