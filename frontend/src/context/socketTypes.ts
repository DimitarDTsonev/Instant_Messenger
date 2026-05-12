import type { Socket } from "socket.io-client";
import type { ChannelMessage, DirectMessage, Message, MessagePatch, ReactionMap, UserStatus } from "../types";

export type AckCallback = (data?: SocketAck<DirectMessage>) => void;
export type Handler<T> = (payload: T) => void;
export type Unsubscribe = () => void;
export type OnlineUserPayload = number | { id: number; status?: UserStatus };
export type TypingPayload = { username: string; isTyping: boolean };
export type DmTypingPayload = { userId?: number; username: string; isTyping: boolean };
export type DeletedMessagePayload = { messageId: number; channelId?: number };
export type DeletedDmPayload = { messageId: number; senderId: number; receiverId: number };
export type ReactedMessagePayload = { messageId: number; reactions: ReactionMap };
export type ChannelNotificationPayload = { channelId: number };
export type MentionPayload = { message: Message; mentionedBy: string; channelId: number };
export type DmReadPayload = { readBy: number };

export interface SocketContextValue {
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