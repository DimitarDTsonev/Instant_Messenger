import type { Db, MessageRow, ReactionMap } from "../types";

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

export function findMessages(db: Db, me: number, other: number, limit: number, before: number | null): MessageRow[] {
  const rows = before
    ? (db.prepare(`${BASE_SELECT} AND dm.id < ? ORDER BY dm.id DESC LIMIT ?`).all(me, other, other, me, before, limit) as MessageRow[]).reverse()
    : (db.prepare(`${BASE_SELECT} ORDER BY dm.id DESC LIMIT ?`).all(me, other, other, me, limit) as MessageRow[]).reverse();
  attachDmReactions(db, rows);
  return rows;
}

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

export function findRaw(db: Db, messageId: number) {
  return db.prepare("SELECT * FROM direct_messages WHERE id = ?").get(messageId) as MessageRow | undefined;
}

export function markRead(db: Db, senderId: number, receiverId: number) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare("UPDATE direct_messages SET is_read = 1, read_at = ? WHERE sender_id = ? AND receiver_id = ? AND is_read = 0").run(now, senderId, receiverId);
}

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
