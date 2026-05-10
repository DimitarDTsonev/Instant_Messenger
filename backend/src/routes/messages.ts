// ============================================================
//  src/routes/messages.ts — Channel message read routes
//
//  Provides paginated message history, per-channel search,
//  pinned-message listing, and a cross-channel/DM global search.
//
//  All routes require a valid Bearer token (authMiddleware applied
//  globally via router.use).
//
//  REST routes defined:
//    GET /api/messages/search?q=          — global full-text search (channels + DMs)
//    GET /api/messages/:channelId         — paginated channel history
//    GET /api/messages/:channelId/pinned  — list pinned messages in a channel
//    GET /api/messages/:channelId/search  — search within a specific channel
//
//  Note: Write operations (send, edit, delete, react, pin) are handled
//  over Socket.io in src/socket/handlers.ts.
//
//  Connects to:
//    ../db/database     — SQLite via getDb()
//    ../middleware/auth — authMiddleware
// ============================================================

import express from "express";
import { getDb } from "../db/database";
import { authMiddleware } from "../middleware/auth";
import type { Db, MessageRow, ReactionMap } from "../types";

type SearchResultRow = MessageRow & {
  type: "channel" | "dm";
  created_at: string;
};

// Express router; all sub-routes require authentication
const router = express.Router();
router.use(authMiddleware);

/**
 * Reusable SQL fragment that selects a full message row with author info,
 * reply-to preview fields, and a reply count.
 * Append a WHERE clause and ORDER/LIMIT before passing to `.prepare()`.
 *
 * Columns returned:
 *   id, content, created_at, is_edited, edited_at, reply_to_id,
 *   file_url, file_type, file_name, is_pinned,
 *   user_id, username, avatar, role (author),
 *   reply_content, reply_file_url, reply_username, reply_avatar,
 *   reply_count
 */
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

/**
 * Mutates each message object in the array by attaching a `reactions` map.
 *
 * The reactions map has the shape `{ [emoji]: userId[] }`.
 * A single bulk query is used for all message IDs to avoid N+1 queries.
 * If the array is empty the function returns early without a database call.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {Object[]} messages - Array of message objects to enrich in-place
 * @returns {void}
 */
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

/**
 * GET /api/messages/search?q=
 * Performs a global full-text search across both channel messages and
 * direct messages that involve the authenticated user.
 *
 * NOTE: This route MUST be registered before `/:channelId` to prevent
 * Express from interpreting "search" as a channel ID.
 *
 * Results from both sources are merged, sorted by most recent, and
 * capped at 50. Each result includes a `type` field ("channel" or "dm")
 * and contextual fields (channel_id / dm_partner_id, etc.).
 *
 * @route   GET /api/messages/search
 * @access  Private (requires Bearer token)
 * @param   {string} req.query.q - Search term (min 2 characters)
 * @returns {200} { results: SearchResultObject[], query: string }
 * @returns {400} { error: string } - Query too short
 */
router.get("/search", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query must be at least 2 characters" });
  }

  const db      = getDb();
  const userId  = req.user.id; // Used to scope DM results to the current user
  const pattern = `%${q.trim()}%`; // SQL LIKE wildcard pattern

  // Search channel messages (no access filtering — public channels only here)
  const channelResults = db.prepare(`
    SELECT m.id, m.content, m.created_at,
           u.username, u.avatar,
           c.id   AS channel_id,
           c.name AS channel_name,
           NULL AS dm_partner_id,
           NULL AS dm_partner_username,
           'channel' AS type
    FROM messages m
    JOIN users    u ON u.id = m.user_id
    JOIN channels c ON c.id = m.channel_id
    WHERE LOWER(m.content) LIKE LOWER(?)
    ORDER BY m.id DESC LIMIT 25
  `).all(pattern) as SearchResultRow[];

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

/**
 * GET /api/messages/:channelId?limit=50&before=<id>
 * Returns paginated messages for a channel in ascending chronological order.
 *
 * Pagination is cursor-based: pass `before=<messageId>` to load the page
 * that precedes the given message ID. `hasMore` is `true` when there are
 * additional older messages available.
 *
 * @route   GET /api/messages/:channelId
 * @access  Private (requires Bearer token)
 * @param   {string} req.params.channelId - Target channel ID
 * @param   {number} [req.query.limit=50] - Number of messages to return (max 100)
 * @param   {number} [req.query.before]   - Return messages with id < this value
 * @returns {200} { messages: MessageObject[], hasMore: boolean }
 * @returns {404} { error: string } - Channel not found
 */
router.get("/:channelId", (req, res) => {
  const { channelId } = req.params;
  // Cap limit at 100 to prevent excessive payloads
  const limit  = Math.min(parseInt(String(req.query.limit || "50")) || 50, 100);
  const before = req.query.before ? parseInt(String(req.query.before)) : null;

  const db = getDb();

  const channel = db.prepare("SELECT id FROM channels WHERE id = ?").get(channelId);
  if (!channel) return res.status(404).json({ error: "Channel not found" });

  // Fetch DESC then reverse so the array is in ascending order for the client
  const messages = before
    ? (db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
        .all(channelId, before, limit) as MessageRow[]).reverse()
    : (db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT ?`)
        .all(channelId, limit) as MessageRow[]).reverse();

  attachReactions(db, messages);
  return res.json({ messages, hasMore: messages.length === limit });
});

/**
 * GET /api/messages/:channelId/pinned
 * Returns all pinned messages in a channel, most recently pinned first.
 * Emoji reactions are attached to each message.
 *
 * @route   GET /api/messages/:channelId/pinned
 * @access  Private (requires Bearer token)
 * @param   {string} req.params.channelId - Target channel ID
 * @returns {200} { messages: MessageObject[] }
 */
router.get("/:channelId/pinned", (req, res) => {
  const { channelId } = req.params;
  const db = getDb();

  const messages = db
    .prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.is_pinned = 1 ORDER BY m.id DESC`)
    .all(channelId) as MessageRow[];

  attachReactions(db, messages);
  return res.json({ messages });
});

/**
 * GET /api/messages/:channelId/search?q=
 * Searches for messages within a specific channel whose content matches
 * the given query string (case-insensitive). Returns up to 50 results.
 *
 * @route   GET /api/messages/:channelId/search
 * @access  Private (requires Bearer token)
 * @param   {string} req.params.channelId - Target channel ID
 * @param   {string} req.query.q          - Search term (min 2 characters)
 * @returns {200} { results: MessageObject[], query: string, count: number }
 * @returns {400} { error: string } - Query too short
 */
router.get("/:channelId/search", (req, res) => {
  const { channelId } = req.params;
  const q = typeof req.query.q === "string" ? req.query.q : "";

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query must be at least 2 characters" });
  }

  const db = getDb();

  const results = db
    .prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND LOWER(m.content) LIKE LOWER(?) ORDER BY m.id DESC LIMIT 50`)
    .all(channelId, `%${q.trim()}%`) as MessageRow[];

  attachReactions(db, results);
  return res.json({ results, query: q, count: results.length });
});

export default router;
