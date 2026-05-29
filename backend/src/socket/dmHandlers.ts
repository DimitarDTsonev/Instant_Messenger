/**
 * Direct Message Socket.io event handlers.
 *
 * Registers all socket events related to direct messages for one authenticated
 * connection. DMs use the `notifications:<userId>` rooms instead of channel
 * rooms, so events reach both participants regardless of which channel they
 * are currently viewing.
 *
 * Events handled:
 *  - dm:send          — inserts a DM and emits to the receiver's notification room.
 *  - dm:edit          — updates DM content and emits to both participants.
 *  - dm:delete        — removes a DM and emits to both participants.
 *  - dm:react         — toggles a reaction and emits the updated map to both parties.
 *  - dm:read          — marks the sender's messages as read for the current user.
 *  - dm:typing:start  — broadcasts a typing indicator to the partner.
 *  - dm:typing:stop   — clears the typing indicator for the partner.
 *
 * Imported by: socket/handlers.ts.
 */

import type { Server } from "socket.io";
import type { AuthUser, MessageRow } from "../types";
import { getDb } from "../db/database";
import { isSocketRateLimited, logSecurityEvent, RATE_BAN } from "../middleware/security";
import { ack, emitToDmPair, getDmReactions, getFullDmMessage } from "./socketUtils";

type AckFn = (data: unknown) => void;
type AuthedSocket = { 
  emit: (ev: string, d: unknown) => void; 
  disconnect: (c: boolean) => void; 
  to: (room: string) => { emit: (ev: string, d: unknown) => void } };

/** Payload shape for the dm:send event. */
type DmSendPayload = {
  receiverId: number;
  content?: string;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  replyToId?: number | null;
};
type MessageEditPayload     = { messageId: number; content?: string };
type MessageIdPayload       = { messageId: number };
type MessageReactionPayload = MessageIdPayload & { emoji: string };
type PartnerPayload         = { partnerId?: number };

/**
 * Registers all DM-related Socket.io event listeners for one connection.
 *
 * @param socket - The authenticated socket instance.
 * @param io     - The Socket.io Server (used to target notification rooms).
 * @param user   - The authenticated user attached by the auth middleware.
 */
export function registerDmHandlers(
  socket: AuthedSocket & { on: (ev: string, cb: (...a: unknown[]) => void) => void },
  io: Server,
  user: AuthUser,
) {
  // ─── dm:send ───────────────────────────────────────────────────────────────
  socket.on("dm:send", ({ receiverId, content, fileUrl, 
                          fileType, fileName, replyToId }: DmSendPayload, callback?: AckFn) => {
    try {
      const text = (content || "").trim();
      if (!text && !fileUrl) return ack(callback, { error: "Message cannot be empty" });

      const db = getDb();

      // Rate-limit check — mirrors channel message handler
      const { limited, count } = isSocketRateLimited(user.id);
      if (count >= RATE_BAN) {
        db.prepare("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?")
          .run("Auto-banned: message flooding", user.id);
        logSecurityEvent(db, { event: "msg_flood_ban", 
                               userId: user.id, 
                               username: user.username, 
                               detail: `${count} DMs in 10s - auto-banned` });
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
      // Deliver to receiver's notification room; sender gets the ack below
      io.to(`notifications:${receiverId}`).emit("dm:new", { ...message, from_user_id: user.id });
      ack(callback, { success: true, message });
    } catch (err) {
      console.error("[socket:dm:send]", err);
      ack(callback, { error: "An unexpected error occurred" });
    }
  });

  // ─── dm:edit ───────────────────────────────────────────────────────────────
  socket.on("dm:edit", ({ messageId, content }: MessageEditPayload, callback?: AckFn) => {
    try {
      if (!content?.trim()) return ack(callback, { error: "Content cannot be empty" });

      const db  = getDb();
      const msg = db.prepare("SELECT * FROM direct_messages WHERE id = ?").get(messageId) as MessageRow | undefined;
      if (!msg) return ack(callback, { error: "Message not found" });
      if (msg.sender_id !== user.id) return ack(callback, { error: "You can only edit your own messages" });

      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      db.prepare("UPDATE direct_messages SET content = ?, is_edited = 1, edited_at = ? WHERE id = ?")
        .run(content.trim(), now, messageId);

      const updated = getFullDmMessage(db, messageId);
      // Deliver the update to both the sender and receiver
      emitToDmPair(io, msg.sender_id, msg.receiver_id, "dm:edited", updated);
      ack(callback, { success: true, message: updated });
    } catch (err) {
      console.error("[socket:dm:edit]", err);
      ack(callback, { error: "An unexpected error occurred" });
    }
  });

  // ─── dm:delete ─────────────────────────────────────────────────────────────
  socket.on("dm:delete", ({ messageId }: MessageIdPayload, callback?: AckFn) => {
    try {
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
    } catch (err) {
      console.error("[socket:dm:delete]", err);
      ack(callback, { error: "An unexpected error occurred" });
    }
  });

  // ─── dm:react ──────────────────────────────────────────────────────────────
  socket.on("dm:react", ({ messageId, emoji }: MessageReactionPayload, callback?: AckFn) => {
    try {
      const db  = getDb();
      const msg = db.prepare("SELECT sender_id, receiver_id FROM direct_messages WHERE id = ?")
        .get(messageId) as { sender_id: number; receiver_id: number } | undefined;
      if (!msg) return ack(callback, { error: "Message not found" });

      // Toggle: remove if already reacted, add if not
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
    } catch (err) {
      console.error("[socket:dm:react]", err);
      ack(callback, { error: "An unexpected error occurred" });
    }
  });

  // ─── dm:read ───────────────────────────────────────────────────────────────
  // Called when the current user opens a DM conversation and has read the messages
  socket.on("dm:read", ({ partnerId }: PartnerPayload = {}) => {
    if (!partnerId) return;
    try {
      const db  = getDb();
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      db.prepare(
        "UPDATE direct_messages SET is_read = 1, read_at = ? WHERE sender_id = ? AND receiver_id = ? AND is_read = 0",
      ).run(now, partnerId, user.id);
      // Notify the sender that their messages have been read
      io.to(`notifications:${partnerId}`).emit("dm:read", { readBy: user.id });
    } catch (err) {
      console.error("[socket:dm:read]", err);
    }
  });

  // ─── dm:typing:start / dm:typing:stop ──────────────────────────────────────
  // Forward typing indicators to the conversation partner's notification room
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