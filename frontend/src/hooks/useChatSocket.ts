import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useSocket } from "../context/SocketContext";
import { playNotificationSound } from "../utils/notificationSound";
import type { Channel, DirectMessage, Message, MessagePatch, User } from "../types";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

type Params = {
  addChannelMsg:      (msg: Message) => void;
  updateChannelMsg:   (patch: Partial<Message> & { id: number }) => void;
  removeChannelMsg:   (id: number) => void;
  addDmMsg:           (msg: DirectMessage) => void;
  updateDmMsg:        (patch: Partial<DirectMessage> & { id: number }) => void;
  removeDmMsg:        (id: number) => void;
  addPinned:          (msg: Message) => void;
  removePin:          (id: number) => void;
  upsertConversation: (msg: DirectMessage, partnerId: number, username: string, avatar: string, unread: boolean) => void;
  setUnreadChannels:  Setter<Record<number, number>>;
  setTypingUsers:     Setter<string[]>;
  setDmTypingUsers:   Setter<string[]>;
  setSeenByPartner:   Setter<boolean>;
  users:              User[];
  user:               { id: number } | null | undefined;
  activeChannelRef:   MutableRefObject<Channel | null>;
  activeDmRef:        MutableRefObject<User | null>;
};

export function useChatSocket(p: Params) {
  // Keep a stable ref so effects only run once per connection, not on every render
  const r = useRef(p);
  r.current = p;

  const {
    onNewMessage, onMessageEdited, onMessageDeleted, onMessageReacted,
    onMessagePinned, onMessageUnpinned, onUserMentioned, onChannelNotify,
    onNewDm, onDmEdited, onDmDeleted, onDmReacted, onDmRead, onDmTypingUpdate, onTypingUpdate,
  } = useSocket();

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default" && typeof Notification.requestPermission === "function") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => onNewMessage((msg) => {
    if (r.current.activeChannelRef.current?.id === msg.channel_id) r.current.addChannelMsg(msg);
  }), [onNewMessage]);

  useEffect(() => onMessageEdited((msg) => {
    if (r.current.activeChannelRef.current?.id === msg.channel_id) r.current.updateChannelMsg(msg);
  }), [onMessageEdited]);

  useEffect(() => onMessageDeleted(({ messageId, channelId }) => {
    if (r.current.activeChannelRef.current?.id === channelId) r.current.removeChannelMsg(messageId);
    r.current.removePin(messageId);
  }), [onMessageDeleted]);

  useEffect(() => onMessageReacted(({ messageId, reactions }) => {
    r.current.updateChannelMsg({ id: messageId, reactions } as Partial<Message> & { id: number });
  }), [onMessageReacted]);

  useEffect(() => onMessagePinned((msg) => {
    r.current.addPinned(msg);
    r.current.updateChannelMsg({ id: msg.id, is_pinned: 1 } as Partial<Message> & { id: number });
  }), [onMessagePinned]);

  useEffect(() => onMessageUnpinned(({ messageId }) => {
    r.current.removePin(messageId);
    r.current.updateChannelMsg({ id: messageId, is_pinned: 0 } as Partial<Message> & { id: number });
  }), [onMessageUnpinned]);

  useEffect(() => onUserMentioned(({ message, mentionedBy }) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`@${mentionedBy} mentioned you`, { body: (message.content || "").slice(0, 100), tag: `mention-${message.id}` });
    }
  }), [onUserMentioned]);

  useEffect(() => onChannelNotify(({ channelId }) => {
    if (r.current.activeChannelRef.current?.id === channelId) return;
    r.current.setUnreadChannels((prev) => ({ ...prev, [channelId]: (prev[channelId] || 0) + 1 }));
    playNotificationSound();
  }), [onChannelNotify]);

  useEffect(() => onNewDm((msg) => {
    const fromId = msg.from_user_id ?? msg.sender_id ?? msg.user_id;
    const isSelf = fromId === r.current.user?.id;
    if (r.current.activeDmRef.current?.id === fromId) r.current.addDmMsg(msg);
    const sender = r.current.users.find((u) => u.id === fromId);
    r.current.upsertConversation(msg, fromId, sender?.username || "?", sender?.avatar || "👤", !isSelf);
    if (!isSelf) playNotificationSound();
  }), [onNewDm]);

  useEffect(() => onDmEdited((msg: MessagePatch) => {
    const partnerId = msg.sender_id === r.current.user?.id ? msg.receiver_id : msg.sender_id;
    if (r.current.activeDmRef.current?.id === partnerId || r.current.activeDmRef.current?.id === msg.sender_id) {
      r.current.updateDmMsg(msg as Partial<DirectMessage> & { id: number });
    }
  }), [onDmEdited]);

  useEffect(() => onDmDeleted(({ messageId, senderId, receiverId }) => {
    const partnerId = senderId === r.current.user?.id ? receiverId : senderId;
    if (r.current.activeDmRef.current?.id === partnerId || r.current.activeDmRef.current?.id === senderId) {
      r.current.removeDmMsg(messageId);
    }
  }), [onDmDeleted]);

  useEffect(() => onDmReacted(({ messageId, reactions }) => {
    r.current.updateDmMsg({ id: messageId, reactions } as Partial<DirectMessage> & { id: number });
  }), [onDmReacted]);

  useEffect(() => onDmRead(({ readBy }) => {
    if (r.current.activeDmRef.current?.id === readBy) r.current.setSeenByPartner(true);
  }), [onDmRead]);

  useEffect(() => onTypingUpdate(({ username, isTyping }) => {
    r.current.setTypingUsers((prev) => isTyping ? (prev.includes(username) ? prev : [...prev, username]) : prev.filter((u) => u !== username));
  }), [onTypingUpdate]);

  useEffect(() => onDmTypingUpdate(({ username, isTyping }) => {
    r.current.setDmTypingUsers((prev) => isTyping ? (prev.includes(username) ? prev : [...prev, username]) : prev.filter((u) => u !== username));
  }), [onDmTypingUpdate]);
}