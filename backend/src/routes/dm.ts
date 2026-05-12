import express from "express";
import { getDb } from "../db/database";
import { authMiddleware } from "../middleware/auth";
import type { MessageRow, ReactionMap } from "../types";

// Express router; all sub-routes require authentication
const router = express.Router();
router.use(authMiddleware);

router.get("/conversations", (req, res) => {
  const db  = getDb();
  const me  = req.user.id; // Authenticated user's ID

  const convos = db.prepare(`
    SELECT
      partner.id          AS partner_id,
      partner.username    AS partner_username,
      partner.avatar      AS partner_avatar,
      last_msg.content    AS last_content,
      last_msg.file_url   AS last_file_url,
      last_msg.file_type  AS last_file_type,
      last_msg.created_at AS last_at,
      last_msg.sender_id  AS last_sender_id,
      (
        SELECT COUNT(*) FROM direct_messages
        WHERE sender_id = partner.id
          AND receiver_id = ?
          AND is_read = 0
      ) AS unread_count
    FROM users partner
    JOIN direct_messages last_msg
      ON last_msg.id = (
        SELECT id FROM direct_messages
        WHERE (sender_id = ? AND receiver_id = partner.id)
           OR (sender_id = partner.id AND receiver_id = ?)
        ORDER BY id DESC LIMIT 1
      )
    WHERE partner.id != ?
    ORDER BY last_msg.created_at DESC
  `).all(me, me, me, me);

  res.json({ conversations: convos });
});

router.get("/:userId", (req, res) => {
  const db       = getDb();
  const me       = req.user.id; // Authenticated user's ID
  const other    = parseInt(req.params.userId); // Conversation partner's ID
  // Cap limit at 100 to prevent excessive payloads
  const limit    = Math.min(parseInt(String(req.query.limit || "50")) || 50, 100);
  const before   = req.query.before ? parseInt(String(req.query.before)) : null;

  const partner = db.prepare("SELECT id, username, avatar FROM users WHERE id = ?").get(other);
  if (!partner) return res.status(404).json({ error: "User not found" });

  // Base SELECT for DMs between the two users (either direction)
  const baseSelect = `
    SELECT
      dm.id, dm.content, dm.created_at, dm.is_read,
      dm.is_edited, dm.edited_at,
      dm.reply_to_id, dm.file_url, dm.file_type, dm.file_name,
      dm.sender_id   AS user_id,
      dm.sender_id, dm.receiver_id,
      u.username, u.avatar, u.role,
      rdm.content    AS reply_content,
      rdm.file_url   AS reply_file_url,
      ru.username    AS reply_username
    FROM direct_messages dm
    JOIN users u ON u.id = dm.sender_id
    LEFT JOIN direct_messages rdm ON rdm.id = dm.reply_to_id
    LEFT JOIN users ru             ON ru.id  = rdm.sender_id
    WHERE ((dm.sender_id = ? AND dm.receiver_id = ?)
        OR (dm.sender_id = ? AND dm.receiver_id = ?))
  `;

  // Fetch DESC then reverse to produce ascending order for the client
  let messages: MessageRow[];
  if (before) {
    messages = (db.prepare(`${baseSelect} AND dm.id < ? ORDER BY dm.id DESC LIMIT ?`)
      .all(me, other, other, me, before, limit) as MessageRow[])
      .reverse();
  } else {
    messages = (db.prepare(`${baseSelect} ORDER BY dm.id DESC LIMIT ?`)
      .all(me, other, other, me, limit) as MessageRow[])
      .reverse();
  }

  // Attach emoji reactions to each message (one query per message - acceptable for DM page sizes)
  for (const msg of messages) {
    const rows = db.prepare("SELECT emoji, user_id FROM dm_reactions WHERE message_id = ?").all(msg.id) as Array<{ emoji: string; user_id: number }>;
    const reactions: ReactionMap = {};
    for (const r of rows) {
      if (!reactions[r.emoji]) reactions[r.emoji] = [];
      reactions[r.emoji].push(r.user_id);
    }
    msg.reactions = reactions;
  }

  const hasMore = messages.length === limit;

  // Side-effect: mark all incoming unread messages from the partner as read
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare("UPDATE direct_messages SET is_read = 1, read_at = ? WHERE sender_id = ? AND receiver_id = ? AND is_read = 0")
    .run(now, other, me);

  res.json({ messages, hasMore, partner });
});

router.post("/:userId/read", (req, res) => {
  const db    = getDb();
  const me    = req.user.id; // Authenticated user receiving the messages
  const other = parseInt(req.params.userId); // Sender whose messages to mark read

  const now2 = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare("UPDATE direct_messages SET is_read = 1, read_at = ? WHERE sender_id = ? AND receiver_id = ? AND is_read = 0")
    .run(now2, other, me);

  res.json({ success: true });
});

export default router;