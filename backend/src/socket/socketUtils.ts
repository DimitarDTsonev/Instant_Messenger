import type { Server } from "socket.io";
import type { AuthUser, Db, MessageRow, ReactionMap } from "../types";

export type OnlineUser = {
  socketId: string;
  username: string;
  status?: "online" | "away" | "dnd";
};

// In-memory map of currently connected users: userId -> OnlineUser
export const onlineUsers = new Map<number, OnlineUser>();

export function buildOnlinePayload(): Array<{ id: number; status: OnlineUser["status"] }> {
  return Array.from(onlineUsers.entries()).map(([id, u]) => ({ id, status: u.status || "online" }));
}

export function ack(fn: unknown, data: unknown) {
  if (typeof fn === "function") (fn as (d: unknown) => void)(data);
}

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

export function getFullMessage(db: Db, messageId: number | bigint): MessageRow | undefined {
  const msg = db.prepare(`
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
    WHERE m.id = ?
  `).get(messageId) as MessageRow | undefined;
  if (msg) msg.reactions = getReactions(db, Number(messageId));
  return msg;
}

export function getFullDmMessage(db: Db, messageId: number | bigint): MessageRow | undefined {
  const msg = db.prepare(`
    SELECT
      dm.id, dm.content, dm.created_at, dm.is_read,
      dm.is_edited, dm.edited_at,
      dm.reply_to_id, dm.file_url, dm.file_type, dm.file_name,
      dm.sender_id   AS user_id,
      dm.sender_id, dm.receiver_id,
      u.username, u.avatar, u.role,
      rdm.content    AS reply_content,
      rdm.file_url   AS reply_file_url,
      ru.username    AS reply_username,
      ru.avatar      AS reply_avatar
    FROM direct_messages dm
    JOIN users u  ON u.id  = dm.sender_id
    LEFT JOIN direct_messages rdm ON rdm.id = dm.reply_to_id
    LEFT JOIN users ru             ON ru.id  = rdm.sender_id
    WHERE dm.id = ?
  `).get(messageId) as MessageRow | undefined;
  if (msg) msg.reactions = getDmReactions(db, Number(messageId));
  return msg;
}

export function emitToDmPair(io: Server, senderId: number, receiverId: number, event: string, data: unknown) {
  io.to(`notifications:${senderId}`).emit(event, data);
  io.to(`notifications:${receiverId}`).emit(event, data);
}

export function notifyMentions(
  io: Server,
  db: Db,
  content: string,
  message: MessageRow,
  senderUser: Pick<AuthUser, "id" | "username">,
) {
  const mentionRegex = /@(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    const username = (match[1] || "").toLowerCase();
    const mentioned = db
      .prepare("SELECT id FROM users WHERE LOWER(username) = ?")
      .get(username) as { id: number } | undefined;
    if (mentioned && mentioned.id !== senderUser.id) {
      io.to(`notifications:${mentioned.id}`).emit("user:mentioned", {
        message,
        mentionedBy: senderUser.username,
        channelId: message.channel_id,
      });
    }
  }
}
