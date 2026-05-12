import express from "express";
import { getDb } from "../../db/database";
import { authMiddleware } from "../../middleware/auth";
import { getUserRole, getPerms } from "./helpers";
import membersRouter     from "./members";
import permissionsRouter from "./permissions";
import invitesRouter     from "./channelInvites";

export { getUserRole, getPerms };

type ChannelRow = { id: number; created_by: number };

const router = express.Router();
router.use(authMiddleware);

// Mount sub-routers - mergeParams propagates :id to each sub-router
router.use("/:id/members",     membersRouter);
router.use("/:id/permissions", permissionsRouter);
router.use("/:id/invites",     invitesRouter);
// GET / - list all channels visible to the authenticated user
router.get("/", (req, res) => {
  const db = getDb();
  const me = req.user.id;

  const channels = db.prepare(`
    SELECT
      c.id, c.name, c.description, c.is_private, c.created_by, c.created_at,
      u.username AS created_by_username,
      COALESCE(cm.role,
        CASE WHEN c.created_by = ? THEN 'owner'
             WHEN c.is_private = 0 THEN 'member'
             ELSE NULL END
      ) AS user_role,
      (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count
    FROM channels c
    LEFT JOIN users u ON u.id = c.created_by
    LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    WHERE c.is_private = 0
       OR cm.user_id IS NOT NULL
       OR c.created_by = ?
    ORDER BY c.name
  `).all(me, me, me);

  return res.json({ channels });
});
// POST / - create a new channel
router.post("/", (req, res) => {
  const { name, description = "", is_private = 0 } = req.body;
  if (!name || name.trim().length < 2)
    return res.status(400).json({ error: "Channel name must be at least 2 characters" });

  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const db = getDb();

  if (db.prepare("SELECT id FROM channels WHERE name = ?").get(cleanName))
    return res.status(409).json({ error: "A channel with that name already exists" });

  const { lastInsertRowid } = db
    .prepare("INSERT INTO channels (name, description, created_by, is_private) VALUES (?, ?, ?, ?)")
    .run(cleanName, description, req.user.id, is_private ? 1 : 0);

  db.prepare("INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')")
    .run(lastInsertRowid, req.user.id);

  const channel = db.prepare("SELECT c.*, 'owner' AS user_role FROM channels c WHERE c.id = ?").get(lastInsertRowid);
  return res.status(201).json({ channel });
});
// PATCH /:id - update channel description / privacy (owner)
router.patch("/:id", (req, res) => {
  const db   = getDb();
  const id   = req.params.id;
  const role = getUserRole(db, req.user.id, id);
  if (role !== "owner") return res.status(403).json({ error: "Only the channel owner can edit settings" });

  const { description, is_private } = req.body;
  const updates: string[] = [];
  const vals:    unknown[] = [];

  if (description !== undefined) { updates.push("description = ?"); vals.push(description); }
  if (is_private  !== undefined) { updates.push("is_private = ?");  vals.push(is_private ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: "No fields to update" });

  vals.push(id);
  db.prepare(`UPDATE channels SET ${updates.join(", ")} WHERE id = ?`).run(...(vals as Parameters<typeof db.prepare>));
  const channel = db.prepare("SELECT * FROM channels WHERE id = ?").get(id);
  return res.json({ channel });
});
// DELETE /:id - permanently delete a channel (owner or admin)
router.delete("/:id", (req, res) => {
  const db  = getDb();
  const ch  = db.prepare("SELECT * FROM channels WHERE id = ?").get(req.params.id) as ChannelRow | undefined;
  if (!ch) return res.status(404).json({ error: "Channel not found" });

  const isAdmin = req.user.role === "admin";
  const isOwner = Number(ch.created_by) === Number(req.user.id);
  if (!isOwner && !isAdmin)
    return res.status(403).json({ error: "You do not have permission to delete this channel" });

  db.prepare("DELETE FROM channels WHERE id = ?").run(req.params.id);
  return res.json({ success: true });
});

export default router;
