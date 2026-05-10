// ============================================================
//  context/SocketContext.tsx — Socket.io connection management
// ============================================================

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import type { ChannelMessage, DirectMessage, Message, MessagePatch, ReactionMap, UserStatus } from "../types";

import { SOCKET_URL } from "../config";

type AckCallback = (data?: SocketAck<DirectMessage>) => void;
type Handler<T> = (payload: T) => void;
type Unsubscribe = () => void;
type OnlineUserPayload = number | { id: number; status?: UserStatus };
type TypingPayload = { username: string; isTyping: boolean };
type DmTypingPayload = { userId?: number; username: string; isTyping: boolean };
type DeletedMessagePayload = { messageId: number; channelId?: number };
type DeletedDmPayload = { messageId: number; senderId: number; receiverId: number };
type ReactedMessagePayload = { messageId: number; reactions: ReactionMap };
type ChannelNotificationPayload = { channelId: number };
type MentionPayload = { message: Message; mentionedBy: string; channelId: number };
type DmReadPayload = { readBy: number };

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  onlineUserIds: number[];
  userStatuses: Record<number, UserStatus>;
  setStatus: (status: UserStatus) => void;
  joinChannel: (channelId: number) => void;
  sendMessage: (
    channelId: number,
    content: string,
    replyToId?: number | null,
    fileUrl?: string | null,
    fileType?: string | null,
    fileName?: string | null,
    callback?: AckCallback,
  ) => void;
  editMessage: (messageId: number, content: string, callback?: AckCallback) => void;
  deleteMessage: (messageId: number, callback?: AckCallback) => void;
  reactToMessage: (messageId: number, emoji: string, callback?: AckCallback) => void;
  pinMessage: (messageId: number, callback?: AckCallback) => void;
  unpinMessage: (messageId: number, callback?: AckCallback) => void;
  sendDm: (
    receiverId: number,
    content: string,
    fileUrl?: string | null,
    fileType?: string | null,
    fileName?: string | null,
    replyToId?: number | null,
    callback?: AckCallback,
  ) => void;
  editDmMessage: (messageId: number, content: string, callback?: AckCallback) => void;
  deleteDmMessage: (messageId: number, callback?: AckCallback) => void;
  reactToDmMessage: (messageId: number, emoji: string, callback?: AckCallback) => void;
  sendDmRead: (partnerId: number) => void;
  emitTypingStart: (channelId: number) => void;
  emitTypingStop: (channelId: number) => void;
  leaveAllChannels: () => void;
  emitDmTypingStart: (partnerId: number) => void;
  emitDmTypingStop: (partnerId: number) => void;
  onNewMessage: (handler: Handler<ChannelMessage>) => Unsubscribe;
  onTypingUpdate: (handler: Handler<TypingPayload>) => Unsubscribe;
  onMessageEdited: (handler: Handler<MessagePatch>) => Unsubscribe;
  onMessageDeleted: (handler: Handler<DeletedMessagePayload>) => Unsubscribe;
  onMessageReacted: (handler: Handler<ReactedMessagePayload>) => Unsubscribe;
  onChannelNotify: (handler: Handler<ChannelNotificationPayload>) => Unsubscribe;
  onMessagePinned: (handler: Handler<Message>) => Unsubscribe;
  onMessageUnpinned: (handler: Handler<DeletedMessagePayload>) => Unsubscribe;
  onUserMentioned: (handler: Handler<MentionPayload>) => Unsubscribe;
  onNewDm: (handler: Handler<DirectMessage>) => Unsubscribe;
  onDmEdited: (handler: Handler<MessagePatch>) => Unsubscribe;
  onDmDeleted: (handler: Handler<DeletedDmPayload>) => Unsubscribe;
  onDmReacted: (handler: Handler<ReactedMessagePayload>) => Unsubscribe;
  onDmRead: (handler: Handler<DmReadPayload>) => Unsubscribe;
  onDmTypingUpdate: (handler: Handler<DmTypingPayload>) => Unsubscribe;
}

const SocketContext = createContext<SocketContextValue | null>(null);

/**
 * SocketProvider - React context provider that owns the single Socket.io connection.
 *
 * Creates and tears down a Socket.io socket whenever the authenticated user or
 * their token changes.  All real-time event handlers are stored in stable refs so
 * consuming components can register new callbacks without triggering a full
 * socket reconnection.
 *
 * Provided context values:
 * @context
 * @property {Socket|null}  socket             - The raw socket.io Socket instance (may be null before connect).
 * @property {boolean}      isConnected        - Whether the socket is currently connected.
 * @property {number[]}     onlineUserIds      - Array of user IDs that are currently online.
 *
 * Channel emit helpers:
 * @property {Function}     joinChannel        - (channelId) → void
 * @property {Function}     sendMessage        - (channelId, content, replyToId, fileUrl, fileType, fileName, cb) → void
 * @property {Function}     editMessage        - (messageId, content, cb) → void
 * @property {Function}     deleteMessage      - (messageId, cb) → void
 * @property {Function}     reactToMessage     - (messageId, emoji, cb) → void
 * @property {Function}     pinMessage         - (messageId, cb) → void
 * @property {Function}     unpinMessage       - (messageId, cb) → void
 *
 * DM emit helpers:
 * @property {Function}     sendDm             - (receiverId, content, fileUrl, fileType, fileName, replyToId, cb) → void
 * @property {Function}     editDmMessage      - (messageId, content, cb) → void
 * @property {Function}     deleteDmMessage    - (messageId, cb) → void
 * @property {Function}     reactToDmMessage   - (messageId, emoji, cb) → void
 *
 * Typing helpers:
 * @property {Function}     emitTypingStart    - (channelId) → void
 * @property {Function}     emitTypingStop     - (channelId) → void
 *
 * Channel event subscriptions (each returns an unsubscribe function):
 * @property {Function}     onNewMessage       - (handler) → unsubscribe
 * @property {Function}     onTypingUpdate     - (handler) → unsubscribe
 * @property {Function}     onMessageEdited    - (handler) → unsubscribe
 * @property {Function}     onMessageDeleted   - (handler) → unsubscribe
 * @property {Function}     onMessageReacted   - (handler) → unsubscribe
 * @property {Function}     onChannelNotify    - (handler) → unsubscribe
 * @property {Function}     onMessagePinned    - (handler) → unsubscribe
 * @property {Function}     onMessageUnpinned  - (handler) → unsubscribe
 * @property {Function}     onUserMentioned    - (handler) → unsubscribe
 *
 * DM event subscriptions:
 * @property {Function}     onNewDm            - (handler) → unsubscribe
 * @property {Function}     onDmEdited         - (handler) → unsubscribe
 * @property {Function}     onDmDeleted        - (handler) → unsubscribe
 * @property {Function}     onDmReacted        - (handler) → unsubscribe
 *
 * @param {Object}      props
 * @param {React.ReactNode} props.children
 * @returns {JSX.Element}
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  // Map of userId → "online" | "away" | "dnd"
  const [userStatuses, setUserStatuses] = useState<Record<number, UserStatus>>({});

  // Stable handler refs — updated without re-registering socket listeners.
  // Storing handlers in refs means socket.on() is only called once per connection
  // while consuming components can swap in fresh callbacks on every render.
  const messageHandlerRef  = useRef<Handler<ChannelMessage> | null>(null);
  const typingHandlerRef   = useRef<Handler<TypingPayload> | null>(null);
  const dmHandlerRef       = useRef<Handler<DirectMessage> | null>(null);
  const editHandlerRef     = useRef<Handler<MessagePatch> | null>(null);
  const deleteHandlerRef   = useRef<Handler<DeletedMessagePayload> | null>(null);
  const reactHandlerRef    = useRef<Handler<ReactedMessagePayload> | null>(null);
  const notifyHandlerRef   = useRef<Handler<ChannelNotificationPayload> | null>(null);
  const pinHandlerRef      = useRef<Handler<Message> | null>(null);
  const unpinHandlerRef    = useRef<Handler<DeletedMessagePayload> | null>(null);
  const mentionHandlerRef  = useRef<Handler<MentionPayload> | null>(null);
  // DM-specific handler refs
  const dmEditHandlerRef    = useRef<Handler<MessagePatch> | null>(null);
  const dmDeleteHandlerRef  = useRef<Handler<DeletedDmPayload> | null>(null);
  const dmReactHandlerRef   = useRef<Handler<ReactedMessagePayload> | null>(null);
  const dmReadHandlerRef    = useRef<Handler<DmReadPayload> | null>(null);
  const dmTypingHandlerRef  = useRef<Handler<DmTypingPayload> | null>(null);

  const userId = user?.id ?? null;

  // Connect when the user is authenticated; disconnect on logout or user change
  useEffect(() => {
    if (!token || !userId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on("connect",       ()    => setIsConnected(true));
    socket.on("disconnect",    ()    => setIsConnected(false));
    socket.on("connect_error", (err) => console.error("Socket error:", err.message));
    socket.on("users:online", (payload: OnlineUserPayload[]) => {
      // payload is [{id, status}] (new) or [id, id, ...] (legacy fallback)
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

    // Channel events — delegate to the current handler ref so callers
    // do not need to re-register when their component state changes
    socket.on("message:new",          (msg: ChannelMessage)  => messageHandlerRef.current?.(msg));
    socket.on("typing:update",         (data: TypingPayload) => typingHandlerRef.current?.(data));
    socket.on("message:edited",        (msg: MessagePatch)  => editHandlerRef.current?.(msg));
    socket.on("message:deleted",       (data: DeletedMessagePayload) => deleteHandlerRef.current?.(data));
    socket.on("message:reacted",       (data: ReactedMessagePayload) => reactHandlerRef.current?.(data));
    socket.on("channel:notification",  (data: ChannelNotificationPayload) => notifyHandlerRef.current?.(data));
    socket.on("message:pinned",        (msg: Message)  => pinHandlerRef.current?.(msg));
    socket.on("message:unpinned",      (data: DeletedMessagePayload) => unpinHandlerRef.current?.(data));
    socket.on("user:mentioned",        (data: MentionPayload) => mentionHandlerRef.current?.(data));

    // DM events
    socket.on("dm:new",     (msg: DirectMessage)  => dmHandlerRef.current?.(msg));
    socket.on("dm:edited",  (msg: MessagePatch)  => dmEditHandlerRef.current?.(msg));
    socket.on("dm:deleted", (data: DeletedDmPayload) => dmDeleteHandlerRef.current?.(data));
    socket.on("dm:reacted", (data: ReactedMessagePayload) => dmReactHandlerRef.current?.(data));
    socket.on("dm:read",           (data: DmReadPayload) => dmReadHandlerRef.current?.(data));
    socket.on("dm:typing:update",  (data: DmTypingPayload) => dmTypingHandlerRef.current?.(data));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, userId]);

  // -----------------------------------------------------------
  // Channel emit helpers
  // -----------------------------------------------------------

  /** Emits "channel:join" so the server adds the socket to the channel room. */
  const joinChannel = useCallback((channelId: number) => {
    socketRef.current?.emit("channel:join", channelId);
  }, []);

  /**
   * Sends a channel message with optional file attachment and reply threading.
   *
   * @param {number}   channelId
   * @param {string}   content
   * @param {number}   [replyToId]
   * @param {string}   [fileUrl]
   * @param {string}   [fileType]
   * @param {string}   [fileName]
   * @param {Function} [callback]  - Server acknowledgement callback ({ error? }).
   */
  const sendMessage = useCallback((channelId: number, content: string, replyToId?: number | null, fileUrl?: string | null, fileType?: string | null, fileName?: string | null, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:send", { channelId, content, replyToId, fileUrl, fileType, fileName }, callback);
  }, []);

  /**
   * Edits the text content of an existing channel message.
   *
   * @param {number}   messageId
   * @param {string}   content
   * @param {Function} [callback]
   */
  const editMessage = useCallback((messageId: number, content: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:edit", { messageId, content }, callback);
  }, []);

  /**
   * Deletes a channel message by ID.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const deleteMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:delete", { messageId }, callback);
  }, []);

  /**
   * Adds or removes an emoji reaction on a channel message.
   *
   * @param {number}   messageId
   * @param {string}   emoji
   * @param {Function} [callback]
   */
  const reactToMessage = useCallback((messageId: number, emoji: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:react", { messageId, emoji }, callback);
  }, []);

  /**
   * Pins a channel message.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const pinMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:pin", { messageId }, callback);
  }, []);

  /**
   * Unpins a previously pinned channel message.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const unpinMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:unpin", { messageId }, callback);
  }, []);

  // -----------------------------------------------------------
  // DM emit helpers
  // -----------------------------------------------------------

  /**
   * Sends a direct message to another user with optional file and reply.
   *
   * @param {number}   receiverId
   * @param {string}   content
   * @param {string}   [fileUrl]
   * @param {string}   [fileType]
   * @param {string}   [fileName]
   * @param {number}   [replyToId]
   * @param {Function} [callback]
   */
  const sendDm = useCallback((receiverId: number, content: string, fileUrl?: string | null, fileType?: string | null, fileName?: string | null, replyToId?: number | null, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:send", { receiverId, content, fileUrl, fileType, fileName, replyToId }, callback);
  }, []);

  /**
   * Edits the text content of an existing DM.
   *
   * @param {number}   messageId
   * @param {string}   content
   * @param {Function} [callback]
   */
  const editDmMessage = useCallback((messageId: number, content: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:edit", { messageId, content }, callback);
  }, []);

  /**
   * Deletes a DM by ID.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const deleteDmMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:delete", { messageId }, callback);
  }, []);

  /**
   * Adds or removes an emoji reaction on a DM.
   *
   * @param {number}   messageId
   * @param {string}   emoji
   * @param {Function} [callback]
   */
  const reactToDmMessage = useCallback((messageId: number, emoji: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:react", { messageId, emoji }, callback);
  }, []);

  // -----------------------------------------------------------
  // Typing indicators
  // -----------------------------------------------------------

  /** Notifies other channel members that the current user has started typing. */
  const emitTypingStart = useCallback((channelId: number) => {
    socketRef.current?.emit("typing:start", { channelId });
  }, []);

  /** Notifies other channel members that the current user has stopped typing. */
  const emitTypingStop = useCallback((channelId: number) => {
    socketRef.current?.emit("typing:stop", { channelId });
  }, []);

  /** Leaves all channel rooms so channel typing events stop reaching this socket. */
  const leaveAllChannels = useCallback(() => {
    socketRef.current?.emit("channel:leave");
  }, []);

  /** Notifies a DM partner that the current user has started typing. */
  const emitDmTypingStart = useCallback((partnerId: number) => {
    socketRef.current?.emit("dm:typing:start", { partnerId });
  }, []);

  /** Notifies a DM partner that the current user has stopped typing. */
  const emitDmTypingStop = useCallback((partnerId: number) => {
    socketRef.current?.emit("dm:typing:stop", { partnerId });
  }, []);

  // -----------------------------------------------------------
  // Handler registration (ref-based, stable identity)
  // Each function stores the provided handler in a ref and returns
  // an unsubscribe function that sets the ref back to null.
  // -----------------------------------------------------------

  /** @param {Function} h - Called with the new message object when "message:new" fires. */
  const onNewMessage     = useCallback((h: Handler<ChannelMessage>) => { messageHandlerRef.current  = h; return () => { messageHandlerRef.current  = null; }; }, []);
  /** @param {Function} h - Called with { username, isTyping } when "typing:update" fires. */
  const onTypingUpdate   = useCallback((h: Handler<TypingPayload>) => { typingHandlerRef.current   = h; return () => { typingHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with the new DM object when "dm:new" fires. */
  const onNewDm          = useCallback((h: Handler<DirectMessage>) => { dmHandlerRef.current       = h; return () => { dmHandlerRef.current       = null; }; }, []);
  /** @param {Function} h - Called with the edited message when "message:edited" fires. */
  const onMessageEdited  = useCallback((h: Handler<MessagePatch>) => { editHandlerRef.current     = h; return () => { editHandlerRef.current     = null; }; }, []);
  /** @param {Function} h - Called with { messageId, channelId } when "message:deleted" fires. */
  const onMessageDeleted = useCallback((h: Handler<DeletedMessagePayload>) => { deleteHandlerRef.current   = h; return () => { deleteHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with { messageId, reactions } when "message:reacted" fires. */
  const onMessageReacted = useCallback((h: Handler<ReactedMessagePayload>) => { reactHandlerRef.current    = h; return () => { reactHandlerRef.current    = null; }; }, []);
  /** @param {Function} h - Called with { channelId } when "channel:notification" fires. */
  const onChannelNotify  = useCallback((h: Handler<ChannelNotificationPayload>) => { notifyHandlerRef.current   = h; return () => { notifyHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with the pinned message when "message:pinned" fires. */
  const onMessagePinned  = useCallback((h: Handler<Message>) => { pinHandlerRef.current      = h; return () => { pinHandlerRef.current      = null; }; }, []);
  /** @param {Function} h - Called with { messageId } when "message:unpinned" fires. */
  const onMessageUnpinned= useCallback((h: Handler<DeletedMessagePayload>) => { unpinHandlerRef.current    = h; return () => { unpinHandlerRef.current    = null; }; }, []);
  /** @param {Function} h - Called with { message, mentionedBy, channelId } when "user:mentioned" fires. */
  const onUserMentioned  = useCallback((h: Handler<MentionPayload>) => { mentionHandlerRef.current  = h; return () => { mentionHandlerRef.current  = null; }; }, []);

  /** @param {Function} h - Called with the edited DM when "dm:edited" fires. */
  const onDmEdited  = useCallback((h: Handler<MessagePatch>) => { dmEditHandlerRef.current   = h; return () => { dmEditHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with { messageId, senderId, receiverId } when "dm:deleted" fires. */
  const onDmDeleted = useCallback((h: Handler<DeletedDmPayload>) => { dmDeleteHandlerRef.current = h; return () => { dmDeleteHandlerRef.current = null; }; }, []);
  /** @param {Function} h - Called with { messageId, reactions } when "dm:reacted" fires. */
  const onDmReacted = useCallback((h: Handler<ReactedMessagePayload>) => { dmReactHandlerRef.current  = h; return () => { dmReactHandlerRef.current  = null; }; }, []);
  /** @param {Function} h - Called with { readBy: userId } when "dm:read" fires. */
  const onDmRead       = useCallback((h: Handler<DmReadPayload>) => { dmReadHandlerRef.current    = h; return () => { dmReadHandlerRef.current    = null; }; }, []);
  /** @param {Function} h - Called with { userId, username, isTyping } when "dm:typing:update" fires. */
  const onDmTypingUpdate = useCallback((h: Handler<DmTypingPayload>) => { dmTypingHandlerRef.current  = h; return () => { dmTypingHandlerRef.current  = null; }; }, []);

  const sendDmRead = useCallback((partnerId: number) => {
    socketRef.current?.emit("dm:read", { partnerId });
  }, []);

  const setStatus = useCallback((status: UserStatus) => {
    socketRef.current?.emit("status:set", { status });
  }, []);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      isConnected,
      onlineUserIds,
      userStatuses,
      setStatus,
      // Channel emitters
      joinChannel,
      sendMessage,
      editMessage,
      deleteMessage,
      reactToMessage,
      pinMessage,
      unpinMessage,
      // DM emitters
      sendDm,
      editDmMessage,
      deleteDmMessage,
      reactToDmMessage,
      sendDmRead,
      // Typing
      emitTypingStart,
      emitTypingStop,
      leaveAllChannels,
      emitDmTypingStart,
      emitDmTypingStop,
      // Channel event subscriptions
      onNewMessage,
      onTypingUpdate,
      onMessageEdited,
      onMessageDeleted,
      onMessageReacted,
      onChannelNotify,
      onMessagePinned,
      onMessageUnpinned,
      onUserMentioned,
      // DM event subscriptions
      onNewDm,
      onDmEdited,
      onDmDeleted,
      onDmReacted,
      onDmRead,
      onDmTypingUpdate,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * useSocket - Consumes the SocketContext.
 *
 * Must be used inside a {@link SocketProvider} tree (i.e. after the user is
 * authenticated, since SocketProvider is only mounted by AppInner when a user
 * session exists).
 *
 * @returns {Object} The full socket context value (see SocketProvider docs for the
 *                   complete list of properties).
 * @throws {Error} When used outside of a SocketProvider.
 */
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside SocketProvider");
  return ctx;
}
