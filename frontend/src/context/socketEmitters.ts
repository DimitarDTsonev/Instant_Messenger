/**
 * Socket.io emit helpers — one `useCallback`-wrapped function per outbound event.
 *
 * All emitters share the same pattern:
 *  1. Guard against a disconnected socket (return early with `{ error }` via the
 *     optional `callback` argument so the caller can show an error toast).
 *  2. Call `socketRef.current.emit(eventName, payload, callback)`.
 *
 * Functions are memoised with `useCallback([socketRef])`. Because `socketRef` is
 * a stable ref object (not the socket value), the dep array never changes and the
 * returned functions are identity-stable for the lifetime of the provider — safe
 * to list in downstream `useEffect` dep arrays.
 *
 * Consumed by: SocketContext.tsx (spread into context value).
 * Used by: hooks/useChatSocket.ts, hooks/useDm.ts.
 */

import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";
import type { UserStatus } from "../types";
import type { AckCallback } from "./socketTypes";

/**
 * Returns all outbound socket emitter functions, each wrapping a single
 * `socket.emit` call with a connection guard.
 *
 * @param socketRef - Mutable ref holding the active `Socket` instance (or `null`).
 * @returns         Object containing all typed emitter functions.
 */
export function useSocketEmitters(socketRef: MutableRefObject<Socket | null>) {
  /**
   * Emits `channel:join` — joins the socket.io room for `channelId`.
   * No connection guard: if the socket is null the emit is a no-op via optional chaining.
   *
   * @param channelId - ID of the channel to join.
   */
  const joinChannel = useCallback((channelId: number) => {
    socketRef.current?.emit("channel:join", channelId);
  }, [socketRef]);

  /**
   * Emits `message:send` — creates a new channel message.
   * Supports file attachments (`fileUrl`, `fileType`, `fileName`) and reply threading (`replyToId`).
   *
   * @param channelId - Target channel.
   * @param content   - Message text body.
   * @param replyToId - Optional parent message ID for threading.
   * @param fileUrl   - Optional uploaded file URL.
   * @param fileType  - MIME type of the attached file.
   * @param fileName  - Display name for the file.
   * @param callback  - Server acknowledgement callback; called with `{ error }` if not connected.
   */
  const sendMessage = useCallback((channelId: number, content: string, replyToId?: number | null, fileUrl?: string | null, fileType?: string | null, fileName?: string | null, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:send", { channelId, content, replyToId, fileUrl, fileType, fileName }, callback);
  }, [socketRef]);

  /**
   * Emits `message:edit` — updates the text of a channel message.
   *
   * @param messageId - ID of the message to edit.
   * @param content   - New text content.
   * @param callback  - Server acknowledgement callback.
   */
  const editMessage = useCallback((messageId: number, content: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:edit", { messageId, content }, callback);
  }, [socketRef]);

  /**
   * Emits `message:delete` — soft-deletes a channel message.
   *
   * @param messageId - ID of the message to delete.
   * @param callback  - Server acknowledgement callback.
   */
  const deleteMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:delete", { messageId }, callback);
  }, [socketRef]);

  /**
   * Emits `message:react` — toggles an emoji reaction on a channel message.
   * If the user already reacted with `emoji`, the reaction is removed; otherwise it is added.
   *
   * @param messageId - Target message.
   * @param emoji     - Unicode emoji string.
   * @param callback  - Server acknowledgement callback.
   */
  const reactToMessage = useCallback((messageId: number, emoji: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:react", { messageId, emoji }, callback);
  }, [socketRef]);

  /**
   * Emits `message:pin` — pins a channel message.
   *
   * @param messageId - ID of the message to pin.
   * @param callback  - Server acknowledgement callback.
   */
  const pinMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:pin", { messageId }, callback);
  }, [socketRef]);

  /**
   * Emits `message:unpin` — unpins a channel message.
   *
   * @param messageId - ID of the message to unpin.
   * @param callback  - Server acknowledgement callback.
   */
  const unpinMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:unpin", { messageId }, callback);
  }, [socketRef]);

  /**
   * Emits `dm:send` — creates a new direct message.
   *
   * @param receiverId - Target user ID.
   * @param content    - Message text body.
   * @param fileUrl    - Optional uploaded file URL.
   * @param fileType   - MIME type of the attached file.
   * @param fileName   - Display name for the file.
   * @param replyToId  - Optional parent DM ID for threading.
   * @param callback   - Server acknowledgement callback.
   */
  const sendDm = useCallback((receiverId: number, content: string, fileUrl?: string | null, fileType?: string | null, fileName?: string | null, replyToId?: number | null, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:send", { receiverId, content, fileUrl, fileType, fileName, replyToId }, callback);
  }, [socketRef]);

  /**
   * Emits `dm:edit` — updates the text of a DM message.
   *
   * @param messageId - ID of the DM to edit.
   * @param content   - New text content.
   * @param callback  - Server acknowledgement callback.
   */
  const editDmMessage = useCallback((messageId: number, content: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:edit", { messageId, content }, callback);
  }, [socketRef]);

  /**
   * Emits `dm:delete` — soft-deletes a DM message.
   *
   * @param messageId - ID of the DM to delete.
   * @param callback  - Server acknowledgement callback.
   */
  const deleteDmMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:delete", { messageId }, callback);
  }, [socketRef]);

  /**
   * Emits `dm:react` — toggles an emoji reaction on a DM.
   *
   * @param messageId - Target DM message.
   * @param emoji     - Unicode emoji string.
   * @param callback  - Server acknowledgement callback.
   */
  const reactToDmMessage = useCallback((messageId: number, emoji: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:react", { messageId, emoji }, callback);
  }, [socketRef]);

  /** Emits `typing:start` for the current user in `channelId`. */
  const emitTypingStart   = useCallback((channelId: number) => { socketRef.current?.emit("typing:start", { channelId }); }, [socketRef]);
  /** Emits `typing:stop` for the current user in `channelId`. */
  const emitTypingStop    = useCallback((channelId: number) => { socketRef.current?.emit("typing:stop",  { channelId }); }, [socketRef]);
  /** Emits `channel:leave` — removes this socket from all channel rooms. */
  const leaveAllChannels  = useCallback(() => { socketRef.current?.emit("channel:leave"); }, [socketRef]);
  /** Emits `dm:typing:start` to notify the DM partner. */
  const emitDmTypingStart = useCallback((partnerId: number) => { socketRef.current?.emit("dm:typing:start", { partnerId }); }, [socketRef]);
  /** Emits `dm:typing:stop` to notify the DM partner. */
  const emitDmTypingStop  = useCallback((partnerId: number) => { socketRef.current?.emit("dm:typing:stop",  { partnerId }); }, [socketRef]);
  /** Emits `dm:read` — marks all messages from `partnerId` as read on the server. */
  const sendDmRead        = useCallback((partnerId: number) => { socketRef.current?.emit("dm:read", { partnerId }); }, [socketRef]);
  /** Emits `status:set` — updates the current user's presence status. */
  const setStatus         = useCallback((status: UserStatus) => { socketRef.current?.emit("status:set", { status }); }, [socketRef]);

  return {
    joinChannel, sendMessage, editMessage, deleteMessage, reactToMessage,
    pinMessage, unpinMessage, sendDm, editDmMessage, deleteDmMessage,
    reactToDmMessage, emitTypingStart, emitTypingStop, leaveAllChannels,
    emitDmTypingStart, emitDmTypingStop, sendDmRead, setStatus,
  };
}
