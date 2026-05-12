// ============================================================
//  src/socket/handlers.ts — Socket.io entry point
//
//  Authenticates every incoming connection via JWT, registers the
//  user in the online-users map, then delegates event handling to:
//    registerMessageHandlers  — channel message events
//    registerDmHandlers       — direct message events
//    registerPresenceHandlers — channel rooms, typing, status, disconnect
// ============================================================

import type { Server, Socket } from "socket.io";
import type { AuthUser } from "../types";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database";
import { isUserBanned, logSecurityEvent } from "../middleware/security";
import { buildOnlinePayload, onlineUsers } from "./socketUtils";
import { registerMessageHandlers } from "./messageHandlers";
import { registerDmHandlers } from "./dmHandlers";
import { registerPresenceHandlers } from "./presenceHandlers";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-dev-key-change-in-prod";

type AuthedSocket = Socket & { user: AuthUser };

export function registerSocketHandlers(io: Server) {
  // JWT authentication middleware — runs before any connection is accepted
  io.use((socket: Socket & { user?: AuthUser }, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Token required"));
    try {
      socket.user = jwt.verify(token, JWT_SECRET) as AuthUser;
      const db = getDb();
      if (isUserBanned(db, socket.user.id)) {
        logSecurityEvent(db, {
          event: "banned_socket_attempt",
          userId: socket.user.id,
          username: socket.user.username,
          detail: "blocked at socket connect",
        });
        return next(new Error("Account suspended"));
      }
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    const user = socket.user;
    console.log(`Connected: ${user.username} (${socket.id})`);

    // Register as online and join personal notification room
    onlineUsers.set(user.id, { socketId: socket.id, username: user.username, status: "online" });
    io.emit("users:online", buildOnlinePayload());
    socket.join(`notifications:${user.id}`);

    // Delegate to domain-specific handler modules
    registerMessageHandlers(socket as unknown as Parameters<typeof registerMessageHandlers>[0], io, user);
    registerDmHandlers(socket as unknown as Parameters<typeof registerDmHandlers>[0], io, user);
    registerPresenceHandlers(socket, io, user);
  });
}