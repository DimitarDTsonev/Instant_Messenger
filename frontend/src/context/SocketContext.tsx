/**
 * Socket.io connection context — manages the WebSocket lifecycle and exposes
 * all real-time emitters and subscriptions to the component tree.
 *
 * Key responsibilities:
 *  1. Lifecycle: creates the socket.io connection when a user is logged in
 *     (token + userId present) and disconnects it on logout or token change.
 *  2. Online presence: receives `users:online` to track which users are online
 *     and their status (`online`, `away`, `busy`, etc.).
 *  3. Handler routing: all inbound socket events are forwarded to mutable refs
 *     (via `socketHandlerRefs.ts`) so hooks can swap handlers without
 *     reconnecting the socket.
 *  4. Emitters: all outbound `socket.emit` calls are exposed as stable
 *     `useCallback` functions (via `socketEmitters.ts`).
 *
 * Architecture note: the socket is created with `reconnectionAttempts: 10` and a
 * 1-second `reconnectionDelay` so transient disconnects heal automatically.
 *
 * Consumed by: every component that needs real-time features, via `useSocket()`.
 * Provided by: App.tsx (wraps the authenticated subtree).
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import type { ChannelMessage, DirectMessage, Message, MessagePatch, UserStatus } from "../types";
import { SOCKET_URL } from "../config";
import type {
  SocketContextValue, OnlineUserPayload,
  TypingPayload, DmTypingPayload, DeletedMessagePayload, DeletedDmPayload,
  ReactedMessagePayload, ChannelNotificationPayload, MentionPayload, DmReadPayload,
} from "./socketTypes";
import { useSocketEmitters } from "./socketEmitters";
import { useSocketHandlerRefs } from "./socketHandlerRefs";

export { useSocket };

const SocketContext = createContext<SocketContextValue | null>(null);

/**
 * Manages the socket.io connection and exposes real-time state + helpers.
 *
 * Re-creates the socket whenever `token` or `userId` changes. If either
 * becomes null (logout) the socket is disconnected immediately.
 *
 * @param children - React subtree that needs real-time access.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  /** Ref holding the live socket.io instance; avoids re-renders on reconnect. */
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected]   = useState(false);
  /** IDs of all users currently online (received from `users:online`). */
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  /** Maps user ID → presence status for users who expose a custom status. */
  const [userStatuses, setUserStatuses]  = useState<Record<number, UserStatus>>({});

  const emitters = useSocketEmitters(socketRef);
  const {
    messageHandlerRef, typingHandlerRef, dmHandlerRef, editHandlerRef,
    deleteHandlerRef, reactHandlerRef, notifyHandlerRef, pinHandlerRef,
    unpinHandlerRef, mentionHandlerRef, dmEditHandlerRef, dmDeleteHandlerRef,
    dmReactHandlerRef, dmReadHandlerRef, dmTypingHandlerRef,
    ...handlers
  } = useSocketHandlerRefs();

  const userId = user?.id ?? null;

  // ─── Socket lifecycle ─────────────────────────────────────────────────────
  // Creates a new socket when (token, userId) become available; destroys it on
  // logout. All event listeners are registered once and delegate to handler refs.
  useEffect(() => {
    if (!token || !userId) {
      // Logged out or session expired — tear down any existing connection
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    // Connect with the JWT in the socket.io auth handshake
    const socket = io(SOCKET_URL, { auth: { token }, reconnectionDelay: 1000, reconnectionAttempts: 10 });
    socketRef.current = socket;

    socket.on("connect",       ()    => setIsConnected(true));
    socket.on("disconnect",    ()    => setIsConnected(false));
    socket.on("connect_error", (err) => console.error("Socket error:", err.message));

    // ── users:online ──────────────────────────────────────────────────────
    // Handles both legacy (number[]) and modern ({ id, status }[]) payloads
    socket.on("users:online", (payload: OnlineUserPayload[]) => {
      if (Array.isArray(payload) && payload.length > 0 && typeof payload[0] === "object") {
        const users = payload as Array<{ id: number; status?: UserStatus }>;
        setOnlineUserIds(users.map((u) => u.id));
        const map: Record<number, UserStatus> = {};
        users.forEach((u) => { map[u.id] = u.status || "online"; });
        setUserStatuses(map);
      } else {
        // Legacy format — no status information available
        setOnlineUserIds(payload as number[]);
        setUserStatuses({});
      }
    });

    // ── Channel message events ────────────────────────────────────────────
    // Each listener delegates to a handler ref so hooks can swap them without reconnecting
    socket.on("message:new",         (msg: ChannelMessage)              => messageHandlerRef.current?.(msg));
    socket.on("typing:update",        (data: TypingPayload)              => typingHandlerRef.current?.(data));
    socket.on("message:edited",       (msg: MessagePatch)                => editHandlerRef.current?.(msg));
    socket.on("message:deleted",      (data: DeletedMessagePayload)      => deleteHandlerRef.current?.(data));
    socket.on("message:reacted",      (data: ReactedMessagePayload)      => reactHandlerRef.current?.(data));
    socket.on("channel:notification", (data: ChannelNotificationPayload) => notifyHandlerRef.current?.(data));
    socket.on("message:pinned",       (msg: Message)                     => pinHandlerRef.current?.(msg));
    socket.on("message:unpinned",     (data: DeletedMessagePayload)      => unpinHandlerRef.current?.(data));
    socket.on("user:mentioned",       (data: MentionPayload)             => mentionHandlerRef.current?.(data));

    // ── DM events ─────────────────────────────────────────────────────────
    socket.on("dm:new",               (msg: DirectMessage)               => dmHandlerRef.current?.(msg));
    socket.on("dm:edited",            (msg: MessagePatch)                => dmEditHandlerRef.current?.(msg));
    socket.on("dm:deleted",           (data: DeletedDmPayload)           => dmDeleteHandlerRef.current?.(data));
    socket.on("dm:reacted",           (data: ReactedMessagePayload)      => dmReactHandlerRef.current?.(data));
    socket.on("dm:read",              (data: DmReadPayload)              => dmReadHandlerRef.current?.(data));
    socket.on("dm:typing:update",     (data: DmTypingPayload)            => dmTypingHandlerRef.current?.(data));

    // Disconnect and release the socket on unmount or when token/userId changes
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      isConnected,
      onlineUserIds,
      userStatuses,
      ...emitters,
      ...handlers,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Consumes the SocketContext.
 * Must be called from a component inside `<SocketProvider>`.
 *
 * @returns The current SocketContextValue (emitters, subscriptions, state).
 * @throws  Error if called outside of a SocketProvider.
 */
function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside SocketProvider");
  return ctx;
}
