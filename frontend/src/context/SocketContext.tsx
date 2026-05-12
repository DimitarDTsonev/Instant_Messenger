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

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected]   = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
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

  useEffect(() => {
    if (!token || !userId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, { auth: { token }, reconnectionDelay: 1000, reconnectionAttempts: 10 });
    socketRef.current = socket;

    socket.on("connect",       ()    => setIsConnected(true));
    socket.on("disconnect",    ()    => setIsConnected(false));
    socket.on("connect_error", (err) => console.error("Socket error:", err.message));
    socket.on("users:online", (payload: OnlineUserPayload[]) => {
      if (Array.isArray(payload) && payload.length > 0 && typeof payload[0] === "object") {
        const users = payload as Array<{ id: number; status?: UserStatus }>;
        setOnlineUserIds(users.map((u) => u.id));
        const map: Record<number, UserStatus> = {};
        users.forEach((u) => { map[u.id] = u.status || "online"; });
        setUserStatuses(map);
      } else {
        setOnlineUserIds(payload as number[]);
        setUserStatuses({});
      }
    });

    socket.on("message:new",         (msg: ChannelMessage)              => messageHandlerRef.current?.(msg));
    socket.on("typing:update",        (data: TypingPayload)              => typingHandlerRef.current?.(data));
    socket.on("message:edited",       (msg: MessagePatch)                => editHandlerRef.current?.(msg));
    socket.on("message:deleted",      (data: DeletedMessagePayload)      => deleteHandlerRef.current?.(data));
    socket.on("message:reacted",      (data: ReactedMessagePayload)      => reactHandlerRef.current?.(data));
    socket.on("channel:notification", (data: ChannelNotificationPayload) => notifyHandlerRef.current?.(data));
    socket.on("message:pinned",       (msg: Message)                     => pinHandlerRef.current?.(msg));
    socket.on("message:unpinned",     (data: DeletedMessagePayload)      => unpinHandlerRef.current?.(data));
    socket.on("user:mentioned",       (data: MentionPayload)             => mentionHandlerRef.current?.(data));
    socket.on("dm:new",               (msg: DirectMessage)               => dmHandlerRef.current?.(msg));
    socket.on("dm:edited",            (msg: MessagePatch)                => dmEditHandlerRef.current?.(msg));
    socket.on("dm:deleted",           (data: DeletedDmPayload)           => dmDeleteHandlerRef.current?.(data));
    socket.on("dm:reacted",           (data: ReactedMessagePayload)      => dmReactHandlerRef.current?.(data));
    socket.on("dm:read",              (data: DmReadPayload)              => dmReadHandlerRef.current?.(data));
    socket.on("dm:typing:update",     (data: DmTypingPayload)            => dmTypingHandlerRef.current?.(data));

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

function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside SocketProvider");
  return ctx;
}