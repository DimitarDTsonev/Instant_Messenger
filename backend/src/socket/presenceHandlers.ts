/**
 * Presence and channel-room Socket.io event handlers.
 *
 * Manages the socket's channel room membership, typing indicators,
 * user status changes, and disconnection cleanup.
 *
 * Events handled:
 *  - channel:join    — verifies access and switches the socket to a channel room.
 *  - channel:leave   — leaves all channel rooms (used when navigating away).
 *  - typing:start    — broadcasts a typing indicator to the channel room.
 *  - typing:stop     — clears the typing indicator in the channel room.
 *  - status:set      — updates the user's online/away/dnd status.
 *  - disconnect      — removes the user from the online-users map and broadcasts.
 *
 * Imported by: socket/handlers.ts.
 */

import type { Server, Socket } from "socket.io";
import type { AuthUser } from "../types";
import { getDb } from "../db/database";
import { getUserRole } from "../routes/channels";
import { buildOnlinePayload, onlineUsers, type OnlineUser } from "./socketUtils";

type ChannelPayload = { channelId?: number };
type StatusPayload  = { status?: OnlineUser["status"] };
type AckFn = (data: unknown) => void;

/**
 * Registers presence and channel-room event listeners for one socket connection.
 *
 * @param socket - The authenticated Socket.io socket.
 * @param io     - The Socket.io Server (used to broadcast presence changes).
 * @param user   - The authenticated user.
 */
export function registerPresenceHandlers(socket: Socket, io: Server, user: AuthUser) {
  // ─── channel:join ──────────────────────────────────────────────────────────
  // Switches the socket from any previous channel room to the requested one.
  // Access-controlled: private channel members must be in channel_members.
  socket.on("channel:join", (channelId: number, callback?: AckFn) => {
    try {
      const role = getUserRole(getDb(), user.id, channelId);
      if (role === null) {
        callback?.({ error: "Access denied" });
        return;
      }
      // Leave all existing channel rooms before joining the new one
      socket.rooms.forEach((room: string) => {
        if (room !== socket.id && !room.startsWith("notifications:")) socket.leave(room);
      });
      socket.join(`channel:${channelId}`);
      callback?.({ success: true });
    } catch (err) {
      console.error("[socket:channel:join]", err);
      callback?.({ error: "An unexpected error occurred" });
    }
  });

  // ─── channel:leave ─────────────────────────────────────────────────────────
  // Used when the user navigates away from all channels (e.g. to a DM view).
  socket.on("channel:leave", () => {
    socket.rooms.forEach((room: string) => {
      if (room !== socket.id && !room.startsWith("notifications:")) socket.leave(room);
    });
  });

  // ─── typing:start / typing:stop ────────────────────────────────────────────
  // Broadcast typing indicators to others in the channel room (excludes sender).
  socket.on("typing:start", ({ channelId }: ChannelPayload) => {
    socket.to(`channel:${channelId}`).emit("typing:update", {
      userId: user.id, username: user.username, isTyping: true,
    });
  });

  socket.on("typing:stop", ({ channelId }: ChannelPayload) => {
    socket.to(`channel:${channelId}`).emit("typing:update", {
      userId: user.id, username: user.username, isTyping: false,
    });
  });

  // ─── status:set ────────────────────────────────────────────────────────────
  // Updates the user's status in the online-users map and broadcasts to all clients.
  socket.on("status:set", ({ status }: StatusPayload = {}) => {
    const valid: Array<OnlineUser["status"]> = ["online", "away", "dnd"];
    if (!valid.includes(status)) return;
    const entry = onlineUsers.get(user.id);
    if (entry) { entry.status = status; onlineUsers.set(user.id, entry); }
    io.emit("users:online", buildOnlinePayload());
  });

  // ─── disconnect ────────────────────────────────────────────────────────────
  // Remove the user from the presence map and broadcast the updated list.
  socket.on("disconnect", () => {
    console.log(`Disconnected: ${user.username}`);
    onlineUsers.delete(user.id);
    io.emit("users:online", buildOnlinePayload());
  });
}
