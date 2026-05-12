import type { Server } from "socket.io";
import type { AuthUser, MessageRow } from "../types";
import { getDb } from "../db/database";
import { isSocketRateLimited, logSecurityEvent, RATE_BAN } from "../middleware/security";
import { ack, emitToDmPair, getDmReactions, getFullDmMessage } from "./socketUtils";

type AckFn = (data: unknown) => void;
type AuthedSocket = { emit: (ev: string, d: unknown) => void; disconnect: (c: boolean) => void; to: (room: string) => { emit: (ev: string, d: unknown) => void } };

type DmSendPayload = {
  receiverId: number;
  content?: string;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  replyToId?: number | null;
};
type MessageEditPayload = { messageId: number; content?: string };
type MessageIdPayload   = { messageId: number };
type MessageReactionPayload = MessageIdPayload & { emoji: string };
type PartnerPayload     = { partnerId?: number };

export function registerDmHandlers(
  socket: AuthedSocket & { on: (ev: string, cb: (...a: unknown[]) => void) => void },
  io: Server,
  user: AuthUser,
) {
  // dm:send
  socket.on("dm:send", ({ receiverId, content, fileUrl, fileType, fileName, replyToId }: DmSendPayload, callback?: AckFn) => {
    const text = (content || "").trim();
    if (!text && !fileUrl) return ack(callback, { error: "Message cannot be empty" });

    const db = getDb();
    const { limited, count } = isSocketRateLimited(user.id);

    if (count >= RATE_BAN) {
      db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?")
        .run("Auto-banned: message flooding", user.id);
      logSecurityEvent(db, { event: "msg_flood_ban", userId: user.id, username: user.username, detail: `${count} DMs in 10s - auto-banned` });
      socket.emit("error", { message: "You have been banned for flooding." });
      socket.disconnect(true);
      return;
    }
    if (limited) return ack(callback, { error: "You are sending messages too fast. Please slow down." });

    const receiver = db.prepare("SELECT id FROM users WHERE id = ?").get(receiverId) as { id: number } | undefined;
    if (!receiver) return ack(callback, { error: "Recipient not found" });

    const { lastInsertRowid } = db
      .prepare("INSERT INTO direct_messages (content, sender_id, receiver_id, file_url, file_type, file_name, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(text, user.id, receiverId, fileUrl || null, fileType || null, fileName || null, replyToId || null);

    const message = getFullDmMessage(db, lastInsertRowid);
    io.to(`notifications:${receiverId}`).emit("dm:new", { ...message, from_user_id: user.id });
    ack(callback, { success: true, message });
  });
  // dm:edit
  socket.on("dm:edit", ({ messageId, content }: MessageEditPayload, callback?: AckFn) => {
    if (!content?.trim()) return ack(callback, { error: "Content cannot be empty" });

    const db  = getDb();
    const msg = db.prepare("SELECT * FROM direct_messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });
    if (msg.sender_id !== user.id) return ack(callback, { error: "You can only edit your own messages" });

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    db.prepare("UPDATE direct_messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?")
      .run(content.trim(), now, messageId);

    const updated = getFullDmMessage(db, messageId);
    emitToDmPair(io, msg.sender_id, msg.receiver_id, "dm:edited", updated);
    ack(callback, { success: true, message: updated });
  });
  // dm:delete
  socket.on("dm:delete", ({ messageId }: MessageIdPayload, callback?: AckFn) => {
    const db  = getDb();
    const msg = db.prepare("SELECT * FROM direct_messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });
    if (msg.sender_id !== user.id) return ack(callback, { error: "You can only delete your own messages" });

    db.prepare("DELETE FROM direct_messages WHERE id = ?").run(messageId);
    emitToDmPair(io, msg.sender_id, msg.receiver_id, "dm:deleted", {
      messageId,
      senderId: msg.sender_id,
      receiverId: msg.receiver_id,
    });
    ack(callback, { success: true });
  });
  // dm:react
  socket.on("dm:react", ({ messageId, emoji }: MessageReactionPayload, callback?: AckFn) => {
    const db  = getDb();
    const msg = db.prepare("SELECT sender_id, receiver_id FROM direct_messages WHERE id = ?")
      .get(messageId) as { sender_id: number; receiver_id: number } | undefined;
    if (!msg) return ack(callback, { error: "Message not found" });

    const existing = db
      .prepare("SELECT id FROM dm_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?")
      .get(messageId, user.id, emoji) as { id: number } | undefined;

    if (existing) {
      db.prepare("DELETE FROM dm_reactions WHERE id = ?").run(existing.id);
    } else {
      db.prepare("INSERT INTO dm_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, user.id, emoji);
    }

    const reactions = getDmReactions(db, messageId);
    emitToDmPair(io, msg.sender_id, msg.receiver_id, "dm:reacted", { messageId, reactions });
    ack(callback, { success: true, reactions });
  });
  // dm:read
  socket.on("dm:read", ({ partnerId }: PartnerPayload = {}) => {
    if (!partnerId) return;
    const db  = getDb();
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    db.prepare(
      "UPDATE direct_messages SET is_read = 1, read_at = ? WHERE sender_id = ? AND receiver_id = ? AND is_read = 0"
    ).run(now, partnerId, user.id);
    io.to(`notifications:${partnerId}`).emit("dm:read", { readBy: user.id });
  });
  // dm:typing:start / dm:typing:stop
  socket.on("dm:typing:start", ({ partnerId }: PartnerPayload = {}) => {
    if (!partnerId) return;
    socket.to(`notifications:${partnerId}`).emit("dm:typing:update", {
      userId: user.id, username: user.username, isTyping: true,
    });
  });

  socket.on("dm:typing:stop", ({ partnerId }: PartnerPayload = {}) => {
    if (!partnerId) return;
    socket.to(`notifications:${partnerId}`).emit("dm:typing:update", {
      userId: user.id, username: user.username, isTyping: false,
    });
  });
}