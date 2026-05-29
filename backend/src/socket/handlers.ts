/**
 * Socket.io connection entry point.
 *
 * `registerSocketHandlers` is called once at server startup with the Socket.io
 * Server instance. It sets up:
 *  1. A JWT authentication middleware that runs before any connection is accepted.
 *  2. A `connection` handler that registers the user as online, joins their
 *     personal notification room, and delegates to the domain-specific handler
 *     modules (messages, DMs, presence).
 *
 * Room naming conventions:
 *  - `channel:<id>`        — channel message room; joined on "channel:join" event.
 *  - `notifications:<id>`  — personal room for DMs, notifications, and typing indicators.
 *
 * Imported by: server.ts.
 */

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

/** Socket extended with an authenticated user after middleware validates the token. */
type AuthedSocket = Socket & { user: AuthUser };

/**
 * Registers all Socket.io middleware and event handlers on the server instance.
 *
 * The JWT middleware verifies the token passed in `socket.handshake.auth.token`
 * and rejects banned users before the `connection` event fires.
 *
 * On successful connection:
 *  - The user is added to the `onlineUsers` map.
 *  - `users:online` is broadcast to all clients.
 *  - The socket joins `notifications:<userId>` for targeted delivery.
 *  - Domain handlers are delegated to separate modules.
 *
 * @param io - The Socket.io Server instance created in server.ts.
 */
export function registerSocketHandlers(io: Server) {
  // ─── Authentication middleware ────────────────────────────────────────────
  // Runs before the `connection` event; rejects invalid or banned users.
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

  // ─── Connection handler ───────────────────────────────────────────────────
  io.on("connection", (socket: AuthedSocket) => {
    const user = socket.user;
    console.log(`Connected: ${user.username} (${socket.id})`);

    // Track as online and broadcast the updated presence list
    onlineUsers.set(user.id, { socketId: socket.id, username: user.username, status: "online" });
    io.emit("users:online", buildOnlinePayload());

    // Join personal notification room so this socket receives targeted events
    socket.join(`notifications:${user.id}`);

    // Delegate to domain-specific handler modules
    registerMessageHandlers(socket as unknown as Parameters<typeof registerMessageHandlers>[0], io, user);
    registerDmHandlers(socket as unknown as Parameters<typeof registerDmHandlers>[0], io, user);
    registerPresenceHandlers(socket, io, user);
  });
}