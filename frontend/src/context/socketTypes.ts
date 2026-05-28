/**
 * Shared type definitions for the Socket.io client layer.
 *
 * Centralises all payload shapes and the full SocketContextValue interface so
 * that SocketContext.tsx, socketEmitters.ts, socketHandlerRefs.ts, and every
 * consuming hook can import from a single source of truth.
 *
 * Consumed by: SocketContext.tsx, socketEmitters.ts, socketHandlerRefs.ts,
 *              hooks/useChatSocket.ts, hooks/useDm.ts.
 */

import type { Socket } from "socket.io-client";
import type { ChannelMessage, DirectMessage, Message, MessagePatch, ReactionMap, UserStatus } from "../types";

/** Callback passed to emitter functions that confirms server acknowledgement. */
export type AckCallback = (data?: SocketAck<DirectMessage>) => void;

/** Generic typed event-handler function. */
export type Handler<T> = (payload: T) => void;

/** Function returned by `onXxx` subscriptions — call it to unregister the handler. */
export type Unsubscribe = () => void;

/**
 * Shape of the `users:online` socket event payload.
 * Legacy servers emit a plain `number[]`; newer servers emit `{ id, status? }[]`.
 */
export type OnlineUserPayload = number | { id: number; status?: UserStatus };

/** Payload for `typing:update` — identifies who is typing in a channel. */
export type TypingPayload = { username: string; isTyping: boolean };

/** Payload for `dm:typing:update` — identifies who is typing in a DM. */
export type DmTypingPayload = { userId?: number; username: string; isTyping: boolean };

/** Payload for `message:deleted` and `message:unpinned` events. */
export type DeletedMessagePayload = { messageId: number; channelId?: number };

/** Payload for `dm:deleted` event — includes both participants for room routing. */
export type DeletedDmPayload = { messageId: number; senderId: number; receiverId: number };

/** Payload for `message:reacted` and `dm:reacted` — carries the full updated reaction map. */
export type ReactedMessagePayload = { messageId: number; reactions: ReactionMap };

/** Payload for `channel:notification` — tells the client a new message arrived in a channel. */
export type ChannelNotificationPayload = { channelId: number };

/** Payload for `user:mentioned` — full message object plus mention metadata. */
export type MentionPayload = { message: Message; mentionedBy: string; channelId: number };

/** Payload for `dm:read` — the partner who has read up to the current point. */
export type DmReadPayload = { readBy: number };

/**
 * Full shape of the value provided by `SocketContext`.
 *
 * Split into three concerns:
 *  - State: `socket`, `isConnected`, `onlineUserIds`, `userStatuses`
 *  - Emitters (from socketEmitters.ts): `sendMessage`, `sendDm`, etc.
 *  - Subscriptions (from socketHandlerRefs.ts): `onNewMessage`, `onNewDm`, etc.
 */
export interface SocketContextValue {
  /** The underlying socket.io `Socket` instance, or `null` if not connected. */
  socket: Socket | null;
  /** Whether the WebSocket transport is currently established. */
  isConnected: boolean;
  /** IDs of users who are currently online. */
  onlineUserIds: number[];
  /** Map from user ID to their current presence status. */
  userStatuses: Record<number, UserStatus>;

  // ─── Presence emitters ────────────────────────────────────────────────────
  /** Emits `status:set` to update the current user's presence status. */
  setStatus: (status: UserStatus) => void;

  // ─── Channel emitters ─────────────────────────────────────────────────────
  /** Emits `channel:join` so the server adds this socket to the channel room. */
  joinChannel: (channelId: number) => void;
  /** Emits `message:send` with optional file attachment and reply threading. */
  sendMessage: (
    channelId: number,
    content: string,
    replyToId?: number | null,
    fileUrl?: string | null,
    fileType?: string | null,
    fileName?: string | null,
    callback?: AckCallback,
  ) => void;
  /** Emits `message:edit` to update a channel message's content. */
  editMessage: (messageId: number, content: string, callback?: AckCallback) => void;
  /** Emits `message:delete` to soft-delete a channel message. */
  deleteMessage: (messageId: number, callback?: AckCallback) => void;
  /** Emits `message:react` to toggle an emoji reaction on a channel message. */
  reactToMessage: (messageId: number, emoji: string, callback?: AckCallback) => void;
  /** Emits `message:pin` to pin a channel message. */
  pinMessage: (messageId: number, callback?: AckCallback) => void;
  /** Emits `message:unpin` to unpin a channel message. */
  unpinMessage: (messageId: number, callback?: AckCallback) => void;

  // ─── DM emitters ──────────────────────────────────────────────────────────
  /** Emits `dm:send` with optional file and reply threading. */
  sendDm: (
    receiverId: number,
    content: string,
    fileUrl?: string | null,
    fileType?: string | null,
    fileName?: string | null,
    replyToId?: number | null,
    callback?: AckCallback,
  ) => void;
  /** Emits `dm:edit` to update a DM message's content. */
  editDmMessage: (messageId: number, content: string, callback?: AckCallback) => void;
  /** Emits `dm:delete` to soft-delete a DM message. */
  deleteDmMessage: (messageId: number, callback?: AckCallback) => void;
  /** Emits `dm:react` to toggle an emoji reaction on a DM. */
  reactToDmMessage: (messageId: number, emoji: string, callback?: AckCallback) => void;
  /** Emits `dm:read` so the server marks all messages from `partnerId` as read. */
  sendDmRead: (partnerId: number) => void;

  // ─── Typing emitters ──────────────────────────────────────────────────────
  /** Emits `typing:start` for the given channel. */
  emitTypingStart: (channelId: number) => void;
  /** Emits `typing:stop` for the given channel. */
  emitTypingStop: (channelId: number) => void;
  /** Emits `channel:leave` to remove this socket from all channel rooms. */
  leaveAllChannels: () => void;
  /** Emits `dm:typing:start` to notify the partner. */
  emitDmTypingStart: (partnerId: number) => void;
  /** Emits `dm:typing:stop` to notify the partner. */
  emitDmTypingStop: (partnerId: number) => void;

  // ─── Subscriptions ────────────────────────────────────────────────────────
  /** Registers a handler for incoming channel messages; returns an unsubscribe fn. */
  onNewMessage: (handler: Handler<ChannelMessage>) => Unsubscribe;
  /** Registers a handler for channel typing updates; returns an unsubscribe fn. */
  onTypingUpdate: (handler: Handler<TypingPayload>) => Unsubscribe;
  /** Registers a handler for message edits; returns an unsubscribe fn. */
  onMessageEdited: (handler: Handler<MessagePatch>) => Unsubscribe;
  /** Registers a handler for message deletions; returns an unsubscribe fn. */
  onMessageDeleted: (handler: Handler<DeletedMessagePayload>) => Unsubscribe;
  /** Registers a handler for reaction updates on channel messages; returns an unsubscribe fn. */
  onMessageReacted: (handler: Handler<ReactedMessagePayload>) => Unsubscribe;
  /** Registers a handler for channel unread notifications; returns an unsubscribe fn. */
  onChannelNotify: (handler: Handler<ChannelNotificationPayload>) => Unsubscribe;
  /** Registers a handler for pin events; returns an unsubscribe fn. */
  onMessagePinned: (handler: Handler<Message>) => Unsubscribe;
  /** Registers a handler for unpin events; returns an unsubscribe fn. */
  onMessageUnpinned: (handler: Handler<DeletedMessagePayload>) => Unsubscribe;
  /** Registers a handler for @mention notifications; returns an unsubscribe fn. */
  onUserMentioned: (handler: Handler<MentionPayload>) => Unsubscribe;
  /** Registers a handler for incoming DMs; returns an unsubscribe fn. */
  onNewDm: (handler: Handler<DirectMessage>) => Unsubscribe;
  /** Registers a handler for DM edits; returns an unsubscribe fn. */
  onDmEdited: (handler: Handler<MessagePatch>) => Unsubscribe;
  /** Registers a handler for DM deletions; returns an unsubscribe fn. */
  onDmDeleted: (handler: Handler<DeletedDmPayload>) => Unsubscribe;
  /** Registers a handler for DM reaction updates; returns an unsubscribe fn. */
  onDmReacted: (handler: Handler<ReactedMessagePayload>) => Unsubscribe;
  /** Registers a handler for the DM read-receipt event; returns an unsubscribe fn. */
  onDmRead: (handler: Handler<DmReadPayload>) => Unsubscribe;
  /** Registers a handler for DM typing updates; returns an unsubscribe fn. */
  onDmTypingUpdate: (handler: Handler<DmTypingPayload>) => Unsubscribe;
}
