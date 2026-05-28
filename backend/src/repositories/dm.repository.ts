/**
 * Direct Messages repository — all database access for `direct_messages`
 * and `dm_reactions` tables.
 *
 * The `BASE_SELECT` fragment joins each DM row with sender info and the
 * optional quoted reply, matching the shape used by the socket and REST layers.
 *
 * Imported by: dm.service.ts, socket/dmHandlers.ts (via socketUtils).
 */

import type { Db, MessageRow, ReactionMap } from "../types";

/**
 * Attaches per-message reaction maps to an array of DM rows (one DB query per row).
 * Mutates each row's `.reactions` field in place.
 *
 * @param db       - Database instance.
 * @param messages - DM rows to enrich.
 */
function attachDmReactions(db: Db, messages: MessageRow[]) {
  for (const msg of messages) {
    const rows = db
      .prepare("SELECT emoji, user_id FROM dm_reactions WHERE message_id = ?")
      .all(msg.id) as Array<{ emoji: string; user_id: number }>;
    const reactions: ReactionMap = {};
    for (const r of rows) {
      if (!reactions[r.emoji]) reactions[r.emoji] = [];
      reactions[r.emoji].push(r.user_id);
    }
    msg.reactions = reactions;
  }
}

/**
 * Builds a `ReactionMap` for a single direct message.
 *
 * @param db        - Database instance.
 * @param messageId - DM primary key.
 * @returns         Reaction map object.
 */
export function getDmReactions(db: Db, messageId: number): ReactionMap {
  const rows = db
    .prepare("SELECT emoji, user_id FROM dm_reactions WHERE message_id = ?")
    .all(messageId) as Array<{ emoji: string; user_id: number }>;
  const map: ReactionMap = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return map;
}

/**
 * Returns a list of all DM conversation partners for a user, each with the
 * most-recent message preview and unread count.
 *
 * The correlated subquery finds the latest message in each conversation to
 * use as the join key. Results are sorted by most recent activity first.
 *
 * @param db     - Database instance.
 * @param userId - The current user's ID.
 * @returns      Array of conversation summary objects.
 */
export function findConversations(db: Db, userId: number) {
  return db
    .prepare(
      `SELECT
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
      ORDER BY last_msg.created_at DESC`,
    )
    .all(userId, userId, userId, userId);
}

/**
 * SQL fragment shared by all full DM message queries.
 * Joins sender info and the optional quoted reply.
 */
const BASE_SELECT = `
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

/**
 * Returns a paginated list of DMs between two users in ascending order.
 *
 * Uses the same cursor-based keyset pagination as the channel messages repo:
 * fetch DESC by ID, then reverse for ascending display order.
 *
 * @param db     - Database instance.
 * @param me     - The current user's ID.
 * @param other  - The conversation partner's ID.
 * @param limit  - Maximum number of messages to return.
 * @param before - Cursor: only return messages with ID < before.
 * @returns      Array of DM rows in ascending order, with reactions.
 */
export function findMessages(db: Db, me: number, other: number, limit: number, before: number | null): MessageRow[] {
  const rows = before
    ? (db.prepare(`${BASE_SELECT} AND dm.id < ? ORDER BY dm.id DESC LIMIT ?`).all(me, other, other, me, before, limit) as MessageRow[]).reverse()
    : (db.prepare(`${BASE_SELECT} ORDER BY dm.id DESC LIMIT ?`).all(me, other, other, me, limit) as MessageRow[]).reverse();
  attachDmReactions(db, rows);
  return rows;
}

/**
 * Fetches a single DM by primary key with full sender info and reply context.
 *
 * @param db        - Database instance.
 * @param messageId - DM primary key.
 * @returns         Full DM row with reactions, or `undefined`.
 */
export function findMessageById(db: Db, messageId: number): MessageRow | undefined {
  const msg = db
    .prepare(
      `SELECT
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
       JOIN users u  ON u.id  = dm.sender_id
       LEFT JOIN direct_messages rdm ON rdm.id = dm.reply_to_id
       LEFT JOIN users ru             ON ru.id  = rdm.sender_id
       WHERE dm.id = ?`,
    )
    .get(messageId) as MessageRow | undefined;
  if (msg) msg.reactions = getDmReactions(db, messageId);
  return msg;
}

/**
 * Fetches a raw `direct_messages` row without joins (used for ownership checks).
 *
 * @param db        - Database instance.
 * @param messageId - DM primary key.
 * @returns         Raw row, or `undefined`.
 */
export function findRaw(db: Db, messageId: number) {
  return db.prepare("SELECT * FROM direct_messages WHERE id = ?").get(messageId) as MessageRow | undefined;
}

/**
 * Marks all unread messages from `senderId` to `receiverId` as read,
 * recording the `read_at` timestamp.
 *
 * Called when the recipient opens the DM conversation.
 *
 * @param db         - Database instance.
 * @param senderId   - The user who sent the messages.
 * @param receiverId - The user who is now reading them.
 */
export function markRead(db: Db, senderId: number, receiverId: number) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare("UPDATE direct_messages SET is_read = 1, read_at = ? WHERE sender_id = ? AND receiver_id = ? AND is_read = 0").run(now, senderId, receiverId);
}

/**
 * Toggles an emoji reaction on a direct message (add or remove).
 *
 * @param db        - Database instance.
 * @param messageId - DM to react to.
 * @param userId    - User performing the reaction.
 * @param emoji     - Emoji character string.
 * @returns         `"added"` or `"removed"`.
 */
export function toggleReaction(db: Db, messageId: number, userId: number, emoji: string): "added" | "removed" {
  const existing = db
    .prepare("SELECT id FROM dm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
    .get(messageId, userId, emoji) as { id: number } | undefined;
  if (existing) {
    db.prepare("DELETE FROM dm_reactions WHERE id = ?").run(existing.id);
    return "removed";
  }
  db.prepare("INSERT INTO dm_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, userId, emoji);
  return "added";
}
