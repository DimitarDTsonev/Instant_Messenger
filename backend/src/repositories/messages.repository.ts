import type { Db, MessageRow, ReactionMap } from "../types";

const MSG_SELECT = `
  SELECT
    m.id, m.content, m.created_at, m.is_edited, m.edited_at,
    m.reply_to_id, m.file_url, m.file_type, m.file_name, m.is_pinned, m.channel_id,
    m.source, m.metadata,
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

export function getReactions(db: Db, messageId: number): ReactionMap {
  const rows = db
    .prepare("SELECT emoji, user_id FROM message_reactions WHERE message_id = ?")
    .all(messageId) as Array<{ emoji: string; user_id: number }>;
  const map: ReactionMap = {};
  for (const r of rows) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.user_id);
  }
  return map;
}

export function attachReactions(db: Db, messages: MessageRow[]) {
  if (!messages.length) return;
  const ids = messages.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (${placeholders})`)
    .all(...ids) as Array<{ message_id: number; emoji: string; user_id: number }>;
  const map: Record<number, ReactionMap> = {};
  for (const r of rows) {
    if (!map[r.message_id]) map[r.message_id] = {};
    if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = [];
    map[r.message_id][r.emoji].push(r.user_id);
  }
  messages.forEach((m) => { m.reactions = map[m.id] || {}; });
}

export function findById(db: Db, messageId: number | bigint): MessageRow | undefined {
  const msg = db.prepare(`${MSG_SELECT} WHERE m.id = ?`).get(messageId) as MessageRow | undefined;
  if (msg) msg.reactions = getReactions(db, Number(messageId));
  return msg;
}

export function findRaw(db: Db, messageId: number): MessageRow | undefined {
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
}

export function findByChannel(db: Db, channelId: number | string, limit: number, before: number | null): MessageRow[] {
  const rows = before
    ? (db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`).all(channelId, before, limit) as MessageRow[]).reverse()
    : (db.prepare(`${MSG_SELECT} WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT ?`).all(channelId, limit) as MessageRow[]).reverse();
  attachReactions(db, rows);
  return rows;
}

export function findPinned(db: Db, channelId: number | string): MessageRow[] {
  const rows = db
    .prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND m.is_pinned = 1 ORDER BY m.id DESC`)
    .all(channelId) as MessageRow[];
  attachReactions(db, rows);
  return rows;
}

export type SearchRow = MessageRow & { type: "channel" | "dm"; created_at: string };

export function searchAll(db: Db, userId: number, pattern: string) {
  const channelResults = db
    .prepare(
      `SELECT m.id, m.content, m.created_at, m.source, m.metadata,
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
       ORDER BY m.id DESC LIMIT 25`,
    )
    .all(userId, pattern, userId) as SearchRow[];

  const dmResults = db
    .prepare(
      `SELECT dm.id, dm.content, dm.created_at,
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
       ORDER BY dm.id DESC LIMIT 25`,
    )
    .all(userId, userId, userId, userId, pattern) as SearchRow[];

  return [...channelResults, ...dmResults]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);
}

export function searchInChannel(db: Db, channelId: number | string, pattern: string): MessageRow[] {
  const rows = db
    .prepare(`${MSG_SELECT} WHERE m.channel_id = ? AND LOWER(m.content) LIKE LOWER(?) ORDER BY m.id DESC LIMIT 50`)
    .all(channelId, `%${pattern}%`) as MessageRow[];
  attachReactions(db, rows);
  return rows;
}

export type CreateMessageData = {
  content: string;
  channelId: number;
  userId: number;
  replyToId?: number | null;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  source?: string | null;
  metadata?: string | null;
};

export function create(db: Db, data: CreateMessageData): MessageRow | undefined {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO messages (content, channel_id, user_id, reply_to_id, file_url, file_type, file_name, source, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(data.content, data.channelId, data.userId, data.replyToId ?? null, data.fileUrl ?? null, data.fileType ?? null, data.fileName ?? null, data.source ?? null, data.metadata ?? null);
  return findById(db, lastInsertRowid);
}

export function update(db: Db, messageId: number, content: string) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare("UPDATE messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?").run(content, now, messageId);
  return findById(db, messageId);
}

export function remove(db: Db, messageId: number) {
  db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
}

export function setPin(db: Db, messageId: number, pinned: boolean) {
  db.prepare("UPDATE messages SET is_pinned = ? WHERE id = ?").run(pinned ? 1 : 0, messageId);
  return findById(db, messageId);
}

export function getChannelInfo(db: Db, channelId: number): { is_private: number } | undefined {
  return db.prepare("SELECT is_private FROM channels WHERE id = ?").get(channelId) as { is_private: number } | undefined;
}

export function getChannelMembers(db: Db, channelId: number): Array<{ user_id: number }> {
  return db.prepare("SELECT user_id FROM channel_members WHERE channel_id = ?").all(channelId) as Array<{ user_id: number }>;
}

export function toggleReaction(db: Db, messageId: number, userId: number, emoji: string): "added" | "removed" {
  const existing = db
    .prepare("SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
    .get(messageId, userId, emoji) as { id: number } | undefined;
  if (existing) {
    db.prepare("DELETE FROM message_reactions WHERE id = ?").run(existing.id);
    return "removed";
  }
  db.prepare("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, userId, emoji);
  return "added";
}
