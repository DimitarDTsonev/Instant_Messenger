import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";
import type { UserStatus } from "../types";
import type { AckCallback } from "./socketTypes";

export function useSocketEmitters(socketRef: MutableRefObject<Socket | null>) {
  const joinChannel = useCallback((channelId: number) => {
    socketRef.current?.emit("channel:join", channelId);
  }, [socketRef]);

  const sendMessage = useCallback((channelId: number, content: string, replyToId?: number | null, fileUrl?: string | null, fileType?: string | null, fileName?: string | null, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:send", { channelId, content, replyToId, fileUrl, fileType, fileName }, callback);
  }, [socketRef]);

  const editMessage = useCallback((messageId: number, content: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:edit", { messageId, content }, callback);
  }, [socketRef]);

  const deleteMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:delete", { messageId }, callback);
  }, [socketRef]);

  const reactToMessage = useCallback((messageId: number, emoji: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:react", { messageId, emoji }, callback);
  }, [socketRef]);

  const pinMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:pin", { messageId }, callback);
  }, [socketRef]);

  const unpinMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("message:unpin", { messageId }, callback);
  }, [socketRef]);

  const sendDm = useCallback((receiverId: number, content: string, fileUrl?: string | null, fileType?: string | null, fileName?: string | null, replyToId?: number | null, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:send", { receiverId, content, fileUrl, fileType, fileName, replyToId }, callback);
  }, [socketRef]);

  const editDmMessage = useCallback((messageId: number, content: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:edit", { messageId, content }, callback);
  }, [socketRef]);

  const deleteDmMessage = useCallback((messageId: number, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:delete", { messageId }, callback);
  }, [socketRef]);

  const reactToDmMessage = useCallback((messageId: number, emoji: string, callback?: AckCallback) => {
    if (!socketRef.current?.connected) { callback?.({ error: "Not connected" }); return; }
    socketRef.current.emit("dm:react", { messageId, emoji }, callback);
  }, [socketRef]);

  const emitTypingStart   = useCallback((channelId: number) => { socketRef.current?.emit("typing:start", { channelId }); }, [socketRef]);
  const emitTypingStop    = useCallback((channelId: number) => { socketRef.current?.emit("typing:stop",  { channelId }); }, [socketRef]);
  const leaveAllChannels  = useCallback(() => { socketRef.current?.emit("channel:leave"); }, [socketRef]);
  const emitDmTypingStart = useCallback((partnerId: number) => { socketRef.current?.emit("dm:typing:start", { partnerId }); }, [socketRef]);
  const emitDmTypingStop  = useCallback((partnerId: number) => { socketRef.current?.emit("dm:typing:stop",  { partnerId }); }, [socketRef]);
  const sendDmRead        = useCallback((partnerId: number) => { socketRef.current?.emit("dm:read", { partnerId }); }, [socketRef]);
  const setStatus         = useCallback((status: UserStatus) => { socketRef.current?.emit("status:set", { status }); }, [socketRef]);

  return {
    joinChannel, sendMessage, editMessage, deleteMessage, reactToMessage,
    pinMessage, unpinMessage, sendDm, editDmMessage, deleteDmMessage,
    reactToDmMessage, emitTypingStart, emitTypingStop, leaveAllChannels,
    emitDmTypingStart, emitDmTypingStop, sendDmRead, setStatus,
  };
}