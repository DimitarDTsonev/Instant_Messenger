import type { Server } from "socket.io";
import type { AuthUser, Db, MessageRow } from "../types";
import { getDb } from "../db/database";
import { getPerms, getUserRole } from "../routes/channels";
import { isSocketRateLimited, logSecurityEvent, RATE_BAN } from "../middleware/security";
import { ack, getFullMessage, getReactions, notifyMentions, onlineUsers } from "./socketUtils";

type AckFn = (data: unknown) => void;
type AuthedSocket = { id: string; emit: (ev: string, d: unknown) => void; disconnect: (c: boolean) => void };

type MessageSendPayload = {
  channelId: number;
  content?: string;
  replyToId?: number | null;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
};

type MessageEditPayload   = { messageId: number; content?: string };
type MessageIdPayload     = { messageId: number };
type MessageReactionPayload = MessageIdPayload & { emoji: string };

export function registerMessageHandlers(
  socket: AuthedSocket & { on: (ev: string, cb: (...a: unknown[]) => void) => void },
  io: Server,
  user: AuthUser,
) {
  // message:send
  socket.on("message:send", ({ channelId, content, replyToId, fileUrl, fileType, fileName }: MessageSendPayload, callback?: AckFn) => {
    const text = (content || "").trim();
    if (!text && !fileUrl) return ack(callback, { error: "Message cannot be empty" });
    if (text.length > 2000) return ack(callback, { error: "Message is too long (max 2000 characters)" });

    const db = getDb();
    const { limited, count } = isSocketRateLimited(user.id);

    if (count >= RATE_BAN) {
      db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?")
        .run("Auto-banned: message flooding", user.id);
      logSecurityEvent(db, { event: "msg_flood_ban", userId: user.id, username: user.username, detail: `${count} messages in 10s - auto-banned` });
      socket.emit("error", { message: "You have been banned for flooding." });
      socket.disconnect(true);
      return;
    }
    if (limited) {
      logSecurityEvent(db, { event: "msg_flood_warn", userId: user.id, username: user.username, detail: `${count} messages in 10s` });
      return ack(callback, { error: "You are sending messages too fast. Please slow down." });
    }

    const role  = getUserRole(db, user.id, channelId);
    const perms = role ? getPerms(db, channelId, role) : null;
    if (!perms?.can_write) return ack(callback, { error: "You do not have permission to write in this channel" });

    const { lastInsertRowid } = db
      .prepare("INSERT INTO messages (content, channel_id, user_id, reply_to_id, file_url, file_type, file_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(text, channelId, user.id, replyToId || null, fileUrl || null, fileType || null, fileName || null);

    const message = getFullMessage(db, lastInsertRowid);
    io.to(`channel:${channelId}`).emit("message:new", message);

    // Private channels: notify only members. Public channels: notify all online users.
    const ch = db.prepare("SELECT is_private FROM channels WHERE id = ?").get(channelId) as { is_private: number } | undefined;
    if (ch?.is_private) {
      const members = db.prepare("SELECT user_id FROM channel_members WHERE channel_id = ?")
        .all(channelId) as Array<{ user_id: number }>;
      for (const { user_id } of members) {
        if (user_id !== user.id) {
          io.to(`notifications:${user_id}`).emit("channel:notification", { channelId: Number(channelId), messageId: message?.id });
        }
      }
    } else {
      onlineUsers.forEach((_, uid) => {
        if (uid !== user.id) {
          io.to(`notifications:${uid}`).emit("channel:notification", { channelId: Number(channelId), messageId: message?.id });
        }
      });
    }

    if (text && message) notifyMentions(io, db, text, message, user);
    ack(callback, { success: true, message });
  });
  // message:edit
  socket.on("message:edit", ({ messageId, content }: MessageEditPayload, callback?: AckFn) => {
    if (!content?.trim()) return ack(callback, { error: "Content cannot be empty" });

    const db  = getDb();
    const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });
    if (msg.user_id !== user.id) return ack(callback, { error: "You can only edit your own messages" });

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    db.prepare("UPDATE messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?")
      .run(content.trim(), now, messageId);

    const updated = getFullMessage(db, messageId);
    io.to(`channel:${msg.channel_id}`).emit("message:edited", updated);
    ack(callback, { success: true, message: updated });
  });
  // message:delete
  socket.on("message:delete", ({ messageId }: MessageIdPayload, callback?: AckFn) => {
    const db  = getDb();
    const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });

    const isAdmin = user.role === "admin" ||
      (db.prepare("SELECT role FROM users WHERE id = ?").get(user.id) as { role?: string } | undefined)?.role === "admin";

    if (msg.user_id !== user.id && !isAdmin) return ack(callback, { error: "You do not have permission to delete this message" });

    db.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
    io.to(`channel:${msg.channel_id}`).emit("message:deleted", { messageId, channelId: msg.channel_id });
    ack(callback, { success: true });
  });
  // message:react
  socket.on("message:react", ({ messageId, emoji }: MessageReactionPayload, callback?: AckFn) => {
    const db  = getDb();
    const msg = db.prepare("SELECT channel_id FROM messages WHERE id = ?").get(messageId) as { channel_id: number } | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });

    const existing = db
      .prepare("SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
      .get(messageId, user.id, emoji) as { id: number } | undefined;

    if (existing) {
      db.prepare("DELETE FROM message_reactions WHERE id = ?").run(existing.id);
    } else {
      db.prepare("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, user.id, emoji);
    }

    const reactions = getReactions(db, messageId);
    io.to(`channel:${msg.channel_id}`).emit("message:reacted", { messageId, reactions });
    ack(callback, { success: true, reactions });
  });
  // message:pin
  socket.on("message:pin", ({ messageId }: MessageIdPayload, callback?: AckFn) => {
    const db     = getDb();
    const msg    = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });

    const channel = db.prepare("SELECT created_by FROM channels WHERE id = ?").get(msg.channel_id) as { created_by: number } | undefined;
    const isAdmin = user.role === "admin" ||
      (db.prepare("SELECT role FROM users WHERE id = ?").get(user.id) as { role?: string } | undefined)?.role === "admin";
    const isCreator = channel?.created_by === user.id;

    if (!isAdmin && !isCreator) return ack(callback, { error: "You do not have permission to pin messages" });

    db.prepare("UPDATE messages SET is_pinned = 1 WHERE id = ?").run(messageId);
    const pinned = getFullMessage(db, messageId);
    io.to(`channel:${msg.channel_id}`).emit("message:pinned", pinned);
    ack(callback, { success: true, message: pinned });
  });
  // message:unpin
  socket.on("message:unpin", ({ messageId }: MessageIdPayload, callback?: AckFn) => {
    const db  = getDb();
    const msg = db.prepare("SELECT channel_id FROM messages WHERE id = ?").get(messageId) as { channel_id: number } | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });

    db.prepare("UPDATE messages SET is_pinned = 0 WHERE id = ?").run(messageId);
    io.to(`channel:${msg.channel_id}`).emit("message:unpinned", { messageId, channelId: msg.channel_id });
    ack(callback, { success: true });
  });
}