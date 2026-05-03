// ============================================================
//  src/routes/dm.js — Direct messages between users
//
//  Provides conversation listing, paginated message history,
//  and read-receipt marking for direct (one-to-one) messages.
//
//  All routes require a valid Bearer token (authMiddleware applied
//  globally via router.use).
//
//  REST routes defined:
//    GET  /api/dm/conversations   — list all active DM conversations
//    GET  /api/dm/:userId         — paginated message history with a user
//    POST /api/dm/:userId/read    — mark incoming messages as read
//
//  Note: Write operations (send, edit, delete, react) are handled
//  over Socket.io in src/socket/handlers.js.
//
//  Connects to:
//    ../db/database     — SQLite via getDb()
//    ../middleware/auth — authMiddleware
// ============================================================

const express = require("express");
const { getDb } = require("../db/database");
const { authMiddleware } = require("../middleware/auth");

// Express router; all sub-routes require authentication
const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/dm/conversations
 * Returns a list of all unique conversation partners the authenticated user
 * has exchanged at least one direct message with.
 *
 * Each entry includes:
 *  - The partner's id, username, and avatar
 *  - A preview of the most recent message (content, file info, timestamp, sender)
 *  - The count of unread messages from that partner
 *
 * Conversations are ordered by most recent message descending.
 *
 * @route   GET /api/dm/conversations
 * @access  Private (requires Bearer token)
 * @returns {200} { conversations: ConversationObject[] }
 */
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

/**
 * GET /api/dm/:userId?limit=50&before=<id>
 * Returns paginated direct-message history between the authenticated user
 * and the specified partner, in ascending chronological order.
 *
 * Also automatically marks all unread incoming messages (from the partner)
 * as read when this endpoint is called.
 *
 * Pagination is cursor-based: pass `before=<messageId>` to load the page
 * that precedes the given message ID.
 *
 * Each message object includes sender info, optional file attachment fields,
 * reply-to preview, and an emoji reactions map.
 *
 * @route   GET /api/dm/:userId
 * @access  Private (requires Bearer token)
 * @param   {string} req.params.userId  - ID of the conversation partner
 * @param   {number} [req.query.limit=50] - Number of messages to return (max 100)
 * @param   {number} [req.query.before]   - Return messages with id < this value
 * @returns {200} { messages: DmMessageObject[], hasMore: boolean, partner: UserObject }
 * @returns {404} { error: string } - Partner user not found
 */
router.get("/:userId", (req, res) => {
  const db       = getDb();
  const me       = req.user.id; // Authenticated user's ID
  const other    = parseInt(req.params.userId); // Conversation partner's ID
  // Cap limit at 100 to prevent excessive payloads
  const limit    = Math.min(parseInt(req.query.limit) || 50, 100);
  const before   = req.query.before ? parseInt(req.query.before) : null;

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
  let messages;
  if (before) {
    messages = db.prepare(`${baseSelect} AND dm.id < ? ORDER BY dm.id DESC LIMIT ?`)
      .all(me, other, other, me, before, limit)
      .reverse();
  } else {
    messages = db.prepare(`${baseSelect} ORDER BY dm.id DESC LIMIT ?`)
      .all(me, other, other, me, limit)
      .reverse();
  }

  // Attach emoji reactions to each message (one query per message — acceptable for DM page sizes)
  for (const msg of messages) {
    const rows = db.prepare("SELECT emoji, user_id FROM dm_reactions WHERE message_id = ?").all(msg.id);
    const reactions = {};
    for (const r of rows) {
      if (!reactions[r.emoji]) reactions[r.emoji] = [];
      reactions[r.emoji].push(r.user_id);
    }
    msg.reactions = reactions;
  }

  const hasMore = messages.length === limit;

  // Side-effect: mark all incoming unread messages from the partner as read
  db.prepare("UPDATE direct_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0")
    .run(other, me);

  res.json({ messages, hasMore, partner });
});

/**
 * POST /api/dm/:userId/read
 * Explicitly marks all unread messages from a given user as read.
 * Useful when the client wants to clear the unread badge without
 * fetching the full conversation history.
 *
 * @route   POST /api/dm/:userId/read
 * @access  Private (requires Bearer token)
 * @param   {string} req.params.userId - ID of the message sender to mark as read
 * @returns {200} { success: true }
 */
router.post("/:userId/read", (req, res) => {
  const db    = getDb();
  const me    = req.user.id; // Authenticated user receiving the messages
  const other = parseInt(req.params.userId); // Sender whose messages to mark read

  db.prepare("UPDATE direct_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0")
    .run(other, me);

  res.json({ success: true });
});

module.exports = router;
