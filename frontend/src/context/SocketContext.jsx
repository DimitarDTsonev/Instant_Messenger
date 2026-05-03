// ============================================================
//  context/SocketContext.jsx — Socket.io connection management
// ============================================================

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

import { SOCKET_URL } from "../config";

const SocketContext = createContext(null);

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
export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState([]);

  // Stable handler refs — updated without re-registering socket listeners.
  // Storing handlers in refs means socket.on() is only called once per connection
  // while consuming components can swap in fresh callbacks on every render.
  const messageHandlerRef  = useRef(null);
  const typingHandlerRef   = useRef(null);
  const dmHandlerRef       = useRef(null);
  const editHandlerRef     = useRef(null);
  const deleteHandlerRef   = useRef(null);
  const reactHandlerRef    = useRef(null);
  const notifyHandlerRef   = useRef(null);
  const pinHandlerRef      = useRef(null);
  const unpinHandlerRef    = useRef(null);
  const mentionHandlerRef  = useRef(null);
  // DM-specific handler refs
  const dmEditHandlerRef   = useRef(null);
  const dmDeleteHandlerRef = useRef(null);
  const dmReactHandlerRef  = useRef(null);

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
    socket.on("users:online",  (ids) => setOnlineUserIds(ids));

    // Channel events — delegate to the current handler ref so callers
    // do not need to re-register when their component state changes
    socket.on("message:new",          (msg)  => messageHandlerRef.current?.(msg));
    socket.on("typing:update",         (data) => typingHandlerRef.current?.(data));
    socket.on("message:edited",        (msg)  => editHandlerRef.current?.(msg));
    socket.on("message:deleted",       (data) => deleteHandlerRef.current?.(data));
    socket.on("message:reacted",       (data) => reactHandlerRef.current?.(data));
    socket.on("channel:notification",  (data) => notifyHandlerRef.current?.(data));
    socket.on("message:pinned",        (msg)  => pinHandlerRef.current?.(msg));
    socket.on("message:unpinned",      (data) => unpinHandlerRef.current?.(data));
    socket.on("user:mentioned",        (data) => mentionHandlerRef.current?.(data));

    // DM events
    socket.on("dm:new",     (msg)  => dmHandlerRef.current?.(msg));
    socket.on("dm:edited",  (msg)  => dmEditHandlerRef.current?.(msg));
    socket.on("dm:deleted", (data) => dmDeleteHandlerRef.current?.(data));
    socket.on("dm:reacted", (data) => dmReactHandlerRef.current?.(data));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, userId]);

  // -----------------------------------------------------------
  // Channel emit helpers
  // -----------------------------------------------------------

  /** Emits "channel:join" so the server adds the socket to the channel room. */
  const joinChannel = useCallback((channelId) => {
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
  const sendMessage = useCallback((channelId, content, replyToId, fileUrl, fileType, fileName, callback) => {
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
  const editMessage = useCallback((messageId, content, callback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:edit", { messageId, content }, callback);
  }, []);

  /**
   * Deletes a channel message by ID.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const deleteMessage = useCallback((messageId, callback) => {
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
  const reactToMessage = useCallback((messageId, emoji, callback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:react", { messageId, emoji }, callback);
  }, []);

  /**
   * Pins a channel message.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const pinMessage = useCallback((messageId, callback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:pin", { messageId }, callback);
  }, []);

  /**
   * Unpins a previously pinned channel message.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const unpinMessage = useCallback((messageId, callback) => {
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
  const sendDm = useCallback((receiverId, content, fileUrl, fileType, fileName, replyToId, callback) => {
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
  const editDmMessage = useCallback((messageId, content, callback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:edit", { messageId, content }, callback);
  }, []);

  /**
   * Deletes a DM by ID.
   *
   * @param {number}   messageId
   * @param {Function} [callback]
   */
  const deleteDmMessage = useCallback((messageId, callback) => {
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
  const reactToDmMessage = useCallback((messageId, emoji, callback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:react", { messageId, emoji }, callback);
  }, []);

  // -----------------------------------------------------------
  // Typing indicators
  // -----------------------------------------------------------

  /** Notifies other channel members that the current user has started typing. */
  const emitTypingStart = useCallback((channelId) => {
    socketRef.current?.emit("typing:start", { channelId });
  }, []);

  /** Notifies other channel members that the current user has stopped typing. */
  const emitTypingStop = useCallback((channelId) => {
    socketRef.current?.emit("typing:stop", { channelId });
  }, []);

  // -----------------------------------------------------------
  // Handler registration (ref-based, stable identity)
  // Each function stores the provided handler in a ref and returns
  // an unsubscribe function that sets the ref back to null.
  // -----------------------------------------------------------

  /** @param {Function} h - Called with the new message object when "message:new" fires. */
  const onNewMessage     = useCallback((h) => { messageHandlerRef.current  = h; return () => { messageHandlerRef.current  = null; }; }, []);
  /** @param {Function} h - Called with { username, isTyping } when "typing:update" fires. */
  const onTypingUpdate   = useCallback((h) => { typingHandlerRef.current   = h; return () => { typingHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with the new DM object when "dm:new" fires. */
  const onNewDm          = useCallback((h) => { dmHandlerRef.current       = h; return () => { dmHandlerRef.current       = null; }; }, []);
  /** @param {Function} h - Called with the edited message when "message:edited" fires. */
  const onMessageEdited  = useCallback((h) => { editHandlerRef.current     = h; return () => { editHandlerRef.current     = null; }; }, []);
  /** @param {Function} h - Called with { messageId, channelId } when "message:deleted" fires. */
  const onMessageDeleted = useCallback((h) => { deleteHandlerRef.current   = h; return () => { deleteHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with { messageId, reactions } when "message:reacted" fires. */
  const onMessageReacted = useCallback((h) => { reactHandlerRef.current    = h; return () => { reactHandlerRef.current    = null; }; }, []);
  /** @param {Function} h - Called with { channelId } when "channel:notification" fires. */
  const onChannelNotify  = useCallback((h) => { notifyHandlerRef.current   = h; return () => { notifyHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with the pinned message when "message:pinned" fires. */
  const onMessagePinned  = useCallback((h) => { pinHandlerRef.current      = h; return () => { pinHandlerRef.current      = null; }; }, []);
  /** @param {Function} h - Called with { messageId } when "message:unpinned" fires. */
  const onMessageUnpinned= useCallback((h) => { unpinHandlerRef.current    = h; return () => { unpinHandlerRef.current    = null; }; }, []);
  /** @param {Function} h - Called with { message, mentionedBy, channelId } when "user:mentioned" fires. */
  const onUserMentioned  = useCallback((h) => { mentionHandlerRef.current  = h; return () => { mentionHandlerRef.current  = null; }; }, []);

  /** @param {Function} h - Called with the edited DM when "dm:edited" fires. */
  const onDmEdited  = useCallback((h) => { dmEditHandlerRef.current   = h; return () => { dmEditHandlerRef.current   = null; }; }, []);
  /** @param {Function} h - Called with { messageId, senderId, receiverId } when "dm:deleted" fires. */
  const onDmDeleted = useCallback((h) => { dmDeleteHandlerRef.current = h; return () => { dmDeleteHandlerRef.current = null; }; }, []);
  /** @param {Function} h - Called with { messageId, reactions } when "dm:reacted" fires. */
  const onDmReacted = useCallback((h) => { dmReactHandlerRef.current  = h; return () => { dmReactHandlerRef.current  = null; }; }, []);

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
      isConnected,
      onlineUserIds,
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
      // Typing
      emitTypingStart,
      emitTypingStop,
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
