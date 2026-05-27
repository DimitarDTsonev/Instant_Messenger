import type { Server, Socket } from "socket.io";
import type { AuthUser } from "../types";
import { getDb } from "../db/database";
import { getUserRole } from "../routes/channels";
import { buildOnlinePayload, onlineUsers, type OnlineUser } from "./socketUtils";

type ChannelPayload = { channelId?: number };
type StatusPayload  = { status?: OnlineUser["status"] };
type AckFn = (data: unknown) => void;

export function registerPresenceHandlers(socket: Socket, io: Server, user: AuthUser) {
  // channel:join - verify access, then switch to the channel room
  socket.on("channel:join", (channelId: number, callback?: AckFn) => {
    try {
      const role = getUserRole(getDb(), user.id, channelId);
      if (role === null) {
        callback?.({ error: "Access denied" });
        return;
      }
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

  // channel:leave - leave all channel rooms without joining another
  socket.on("channel:leave", () => {
    socket.rooms.forEach((room: string) => {
      if (room !== socket.id && !room.startsWith("notifications:")) socket.leave(room);
    });
  });

  // typing:start / typing:stop - channel typing indicators
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

  // status:set - update online/away/dnd status
  socket.on("status:set", ({ status }: StatusPayload = {}) => {
    const valid: Array<OnlineUser["status"]> = ["online", "away", "dnd"];
    if (!valid.includes(status)) return;
    const entry = onlineUsers.get(user.id);
    if (entry) { entry.status = status; onlineUsers.set(user.id, entry); }
    io.emit("users:online", buildOnlinePayload());
  });

  // disconnect - remove user from online map, broadcast update
  socket.on("disconnect", () => {
    console.log(`Disconnected: ${user.username}`);
    onlineUsers.delete(user.id);
    io.emit("users:online", buildOnlinePayload());
  });
}
