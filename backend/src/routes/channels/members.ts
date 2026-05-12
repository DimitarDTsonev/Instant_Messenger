// ============================================================
//  src/routes/channels/members.ts — Channel member management
//
//  Mounted at /:id/members on the channels router.
//  Uses mergeParams so req.params.id (the channel ID) is available.
//
//  Routes:
//    GET    /              — list channel members
//    POST   /              — add a member by username
//    PATCH  /:userId       — change a member's channel role
//    DELETE /:userId       — remove (kick) a member
// ============================================================

import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../../db/database";
import { getPerms, getUserRole } from "./helpers";
import type { ChannelRole } from "../../types";

type ChannelTargetUserRow = { id: number; username: string; avatar?: string | null };
type ChannelReq  = Request<{ id: string }>;
type MemberReq   = Request<{ id: string; userId: string }>;

const router = Router({ mergeParams: true });

router.get("/", (req: ChannelReq, res: Response) => {
  const db   = getDb();
  const id   = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  if (!role) return res.status(403).json({ error: "You do not have access to this channel" });

  const members = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.role AS global_role, cm.role AS channel_role, cm.joined_at
    FROM channel_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.channel_id = ?
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.username
  `).all(id);

  return res.json({ members });
});

router.post("/", (req: ChannelReq, res: Response) => {
  const db    = getDb();
  const id    = req.params.id;
  const role  = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;
  if (!perms?.can_manage_members) return res.status(403).json({ error: "You do not have permission to add members" });

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username is required" });

  const target = db.prepare("SELECT id, username, avatar FROM users WHERE username = ?").get(username) as ChannelTargetUserRow | undefined;
  if (!target) return res.status(404).json({ error: "User not found" });

  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')").run(id, target.id);
  return res.json({ success: true, user: target });
});

router.patch("/:userId", (req: MemberReq, res: Response) => {
  const db     = getDb();
  const { id, userId } = req.params;
  const myRole = getUserRole(db, req.user.id, id);

  if (!["owner", "manager"].includes(myRole))
    return res.status(403).json({ error: "You do not have permission to change roles" });

  const { role: newRole } = req.body;
  if (!["manager", "member", "viewer"].includes(newRole))
    return res.status(400).json({ error: "Invalid role (manager | member | viewer)" });

  if (newRole === "manager" && myRole !== "owner")
    return res.status(403).json({ error: "Only the owner can assign the manager role" });

  const targetRole = getUserRole(db, userId, id);
  if (targetRole === "owner") return res.status(403).json({ error: "The owner role cannot be changed" });

  db.prepare("UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?").run(newRole, id, userId);
  return res.json({ success: true, role: newRole as ChannelRole });
});

router.delete("/:userId", (req: MemberReq, res: Response) => {
  const db     = getDb();
  const { id, userId } = req.params;
  const myRole = getUserRole(db, req.user.id, id);
  const perms  = myRole ? getPerms(db, id, myRole) : null;
  if (!perms?.can_manage_members) return res.status(403).json({ error: "You do not have permission to remove members" });

  const targetRole = getUserRole(db, userId, id);
  if (targetRole === "owner") return res.status(403).json({ error: "The owner cannot be removed" });

  db.prepare("DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?").run(id, userId);
  return res.json({ success: true });
});

export default router;
