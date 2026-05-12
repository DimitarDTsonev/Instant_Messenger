import express from "express";
import { getDb } from "../db/database";
import { authMiddleware } from "../middleware/auth";
import { getUserRole } from "./channels";
import type { Db, MessageRow, ReactionMap } from "../types";

type SearchResultRow = MessageRow & {
  type: "channel" | "dm";
  created_at: string;
};

// Express router; all sub-routes require authentication
const router = express.Router();
router.use(authMiddleware);

const MSG_SELECT = `
  SELECT
    m.id, m.content, m.created_at, m.is_edited, m.edited_at,
    m.reply_to_id, m.file_url, m.file_type, m.file_name, m.is_pinned,
    u.id   AS user_id, u.username, u.avatar, u.role,
    rm.content  AS reply_content,
    rm.file_url AS reply_file_url,
    ru.username AS reply_username,
    ru.avatar   AS reply_avatar,
    (SELECT COUNT(*) FROM messages r WHERE r.reply_to_id = m.id) AS reply_count
  FROM messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN messages rm ON rm.id = m.reply_to_id
  LEFT JOIN users ru    ON ru.id = rm.user_id
`;

function attachReactions(db: Db, messages: MessageRow[]) {
  if (!messages.length) return;
  const ids = messages.map((m) => m.id);
  // Build a parameterised IN clause matching the number of IDs
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (${placeholders})`)
    .all(...ids) as Array<{ message_id: number; emoji: string; user_id: number }>;

  // Group reactions by message ID and then by emoji
  const map: Record<number, ReactionMap> = {};
  for (const r of rows) {
    if (!map[r.message_id]) map[r.message_id] = {};
    if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = [];
    map[r.message_id][r.emoji].push(r.user_id);
  }
  // Attach the grouped reactions (or an empty object) to each message
  messages.forEach((m) => { m.reactions = map[m.id] || {}; });
}

router.get("/search", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query must be at least 2 characters" });
  }

  const db      = getDb();
  const userId  = req.user.id; // Used to scope DM results to the current user
  const pattern = `%${q.trim()}%`; // SQL LIKE wildcard pattern

  // Search channel messages; private channels are filtered to members only
  const channelResults = db.prepare(`
    SELECT m.id, m.content, m.created_at,
           u.username, u.avatar,
           c.id   AS channel_id,
           c.name AS channel_name,
           NULL AS dm_partner_id,
           NULL AS dm_partner_username,
           'channel' AS type
    FROM messages m
    JOIN users    u  ON u.id = m.user_id
    JOIN channels c  ON c.id = m.channel_id
    LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    WHERE LOWER(m.content) LIKE LOWER(?)
      AND (c.is_private = 0 OR c.created_by = ? OR cm.user_id IS NOT NULL)
    ORDER BY m.id DESC LIMIT 25
  `).all(userId, pattern, userId) as SearchResultRow[];

  // Search DMs involving the current user
  const dmResults = db.prepare(`
    SELECT dm.id, dm.content, dm.created_at,
           su.username, su.avatar,
           NULL AS channel_id,
           NULL AS channel_name,
           CASE WHEN dm.sender_id = ? THEN dm.receiver_id ELSE dm.sender_id END AS dm_partner_id,
           CASE WHEN dm.sender_id = ? THEN ru.username ELSE su.username END AS dm_partner_username,
           'dm' AS type
    FROM direct_messages dm
    JOIN users su ON su.id = dm.sender_id
    JOIN users ru ON ru.id = dm.receiver_id
    WHERE (dm.sender_id = ? OR dm.receiver_id = ?)
      AND LOWER(dm.content) LIKE LOWER(?)
    ORDER BY dm.id DESC LIMIT 25
  `).all(userId, userId, userId, userId, pattern) as SearchResultRow[];

  // Merge, sort by most recent, and take the top 50
  const all = [...channelResults, ...dmResults]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  return res.json({ results: all, query: q });
});

router.get("/:channelId", (req, res) => {
  const { channelId } = req.params;
  // Cap limit at 100 to prevent excessive payloads
  const limit  = Math.min(parseInt(String(req.query.limit || "50")) || 50, 100);
  const before = req.query.before ? parseInt(String(req.query.before)) : null;

  const db = getDb();

  const role = getUserRole(db, req.user.id, channelId);
  if (role === null) return res.status(403).json({ error: "Access denied" });

  // Fetch DESC then reverse so the array is in ascending order for the client
  const messages = before
    ? (db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
        .all(channelId, before, limit) as MessageRow[]).reverse()
    : (db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT ?`)
        .all(channelId, limit) as MessageRow[]).reverse();

  attachReactions(db, messages);
  return res.json({ messages, hasMore: messages.length === limit });
});

router.get("/:channelId/pinned", (req, res) => {
  const { channelId } = req.params;
  const db = getDb();

  if (getUserRole(db, req.user.id, channelId) === null) return res.status(403).json({ error: "Access denied" });

  const messages = db
    .prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.is_pinned = 1 ORDER BY m.id DESC`)
    .all(channelId) as MessageRow[];

  attachReactions(db, messages);
  return res.json({ messages });
});

router.get("/:channelId/search", (req, res) => {
  const { channelId } = req.params;
  const q = typeof req.query.q === "string" ? req.query.q : "";

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query must be at least 2 characters" });
  }

  const db = getDb();

  if (getUserRole(db, req.user.id, channelId) === null) return res.status(403).json({ error: "Access denied" });

  const results = db
    .prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND LOWER(m.content) LIKE LOWER(?) ORDER BY m.id DESC LIMIT 50`)
    .all(channelId, `%${q.trim()}%`) as MessageRow[];

  attachReactions(db, results);
  return res.json({ results, query: q, count: results.length });
});

export default router;