import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { getDb } from "../../db/database";
import { getPerms, getUserRole } from "./helpers";

type ChannelReq = Request<{ id: string }>;
type CodeReq    = Request<{ id: string; code: string }>;

const router = Router({ mergeParams: true });

router.post("/", (req: ChannelReq, res: Response) => {
  const db    = getDb();
  const id    = req.params.id;
  const role  = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;
  if (!perms?.can_invite) return res.status(403).json({ error: "You do not have permission to create invites" });

  const { maxUses = null, expiresInHours = null } = req.body;
  const code      = crypto.randomBytes(5).toString("hex");
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString()
    : null;

  const { lastInsertRowid } = db
    .prepare("INSERT INTO channel_invites (channel_id, created_by, code, max_uses, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, req.user.id, code, maxUses, expiresAt);

  const invite = db.prepare("SELECT * FROM channel_invites WHERE id = ?").get(lastInsertRowid);
  return res.status(201).json({ invite });
});

router.get("/", (req: ChannelReq, res: Response) => {
  const db    = getDb();
  const id    = req.params.id;
  const role  = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;
  if (!perms?.can_invite) return res.status(403).json({ error: "Access denied" });

  const invites = db.prepare(`
    SELECT ci.*, u.username AS created_by_username
    FROM channel_invites ci
    JOIN users u ON u.id = ci.created_by
    WHERE ci.channel_id = ?
    ORDER BY ci.created_at DESC
  `).all(id);

  return res.json({ invites });
});

router.delete("/:code", (req: CodeReq, res: Response) => {
  const db    = getDb();
  const { id, code } = req.params;
  const role  = getUserRole(db, req.user.id, id);
  const perms = role ? getPerms(db, id, role) : null;
  if (!perms?.can_invite) return res.status(403).json({ error: "You do not have permission to manage invites" });

  db.prepare("DELETE FROM channel_invites WHERE channel_id = ? AND code = ?").run(id, code);
  return res.json({ success: true });
});

export default router;
