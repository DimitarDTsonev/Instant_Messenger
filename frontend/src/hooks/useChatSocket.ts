/**
 * Real-time socket event wiring for the main chat page.
 *
 * This hook subscribes to every inbound socket event that affects channel
 * messages, DMs, pins, typing indicators, and reactions. It delegates to the
 * action functions passed in via `Params` so the actual state lives in the
 * calling component and is not duplicated here.
 *
 * Architecture: uses a single mutable ref (`r`) that always points to the
 * latest `Params` object. Each `useEffect` closes over only the stable
 * `onXxx` subscription function from `useSocket()`, so effects never re-run
 * when message lists or other props change — only when the socket reconnects.
 *
 * Used by: ChatPage.tsx.
 */

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { useSocket } from "../context/SocketContext";
import { avatarLabel } from "../utils/avatar";
import { playNotificationSound } from "../utils/notificationSound";
import type { Channel, DirectMessage, Message, MessagePatch, User } from "../types";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/** All external state and action functions this hook needs. Passed as a single object. */
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
  /** Ref pointing to the currently open channel (read inside event handlers). */
  activeChannelRef:   MutableRefObject<Channel | null>;
  /** Ref pointing to the currently open DM partner (read inside event handlers). */
  activeDmRef:        MutableRefObject<User | null>;
};

/**
 * Wires all inbound socket events to state update functions.
 *
 * Each event is handled in its own `useEffect` that depends only on the
 * stable `onXxx` subscription function. The latest `Params` are always
 * accessed through `r.current` so the effects never become stale.
 *
 * @param p - Object containing all state and action functions from the caller.
 */
export function useChatSocket(p: Params) {
  // Single stable ref keeps event handlers up-to-date without retriggering effects
  const r = useRef(p);
  r.current = p;

  const {
    onNewMessage, onMessageEdited, onMessageDeleted, onMessageReacted,
    onMessagePinned, onMessageUnpinned, onUserMentioned, onChannelNotify,
    onNewDm, onDmEdited, onDmDeleted, onDmReacted, onDmRead, onDmTypingUpdate, onTypingUpdate,
  } = useSocket();

  // Request browser notification permission once on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default" && typeof Notification.requestPermission === "function") {
      Notification.requestPermission();
    }
  }, []);

  // ── message:new ──────────────────────────────────────────────────────────
  // Only append to the message list if the active channel matches
  useEffect(() => onNewMessage((msg) => {
    if (r.current.activeChannelRef.current?.id === msg.channel_id) r.current.addChannelMsg(msg);
  }), [onNewMessage]);

  // ── message:edited ────────────────────────────────────────────────────────
  useEffect(() => onMessageEdited((msg) => {
    if (r.current.activeChannelRef.current?.id === msg.channel_id) r.current.updateChannelMsg(msg);
  }), [onMessageEdited]);

  // ── message:deleted ───────────────────────────────────────────────────────
  // Also removes the message from the pinned list regardless of active channel
  useEffect(() => onMessageDeleted(({ messageId, channelId }) => {
    if (r.current.activeChannelRef.current?.id === channelId) r.current.removeChannelMsg(messageId);
    r.current.removePin(messageId);
  }), [onMessageDeleted]);

  // ── message:reacted ───────────────────────────────────────────────────────
  useEffect(() => onMessageReacted(({ messageId, reactions }) => {
    r.current.updateChannelMsg({ id: messageId, reactions } as Partial<Message> & { id: number });
  }), [onMessageReacted]);

  // ── message:pinned ────────────────────────────────────────────────────────
  // Adds to pinned list AND updates `is_pinned` flag in the message list
  useEffect(() => onMessagePinned((msg) => {
    r.current.addPinned(msg);
    r.current.updateChannelMsg({ id: msg.id, is_pinned: 1 } as Partial<Message> & { id: number });
  }), [onMessagePinned]);

  // ── message:unpinned ──────────────────────────────────────────────────────
  useEffect(() => onMessageUnpinned(({ messageId }) => {
    r.current.removePin(messageId);
    r.current.updateChannelMsg({ id: messageId, is_pinned: 0 } as Partial<Message> & { id: number });
  }), [onMessageUnpinned]);

  // ── user:mentioned ────────────────────────────────────────────────────────
  // Fires a browser push notification for @mention alerts
  useEffect(() => onUserMentioned(({ message, mentionedBy }) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`@${mentionedBy} mentioned you`, { body: (message.content || "").slice(0, 100), tag: `mention-${message.id}` });
    }
  }), [onUserMentioned]);

  // ── channel:notification ──────────────────────────────────────────────────
  // Increments unread badge and plays a sound for channels the user is NOT currently viewing
  useEffect(() => onChannelNotify(({ channelId }) => {
    if (r.current.activeChannelRef.current?.id === channelId) return;
    r.current.setUnreadChannels((prev) => ({ ...prev, [channelId]: (prev[channelId] || 0) + 1 }));
    playNotificationSound();
  }), [onChannelNotify]);

  // ── dm:new ────────────────────────────────────────────────────────────────
  // Appends to the DM list if the sender is the active partner, upserts the
  // conversation list entry, and plays a sound for messages from others
  useEffect(() => onNewDm((msg) => {
    const fromId = msg.from_user_id ?? msg.sender_id ?? msg.user_id;
    const isSelf = fromId === r.current.user?.id;
    if (r.current.activeDmRef.current?.id === fromId) r.current.addDmMsg(msg);
    const sender = r.current.users.find((u) => u.id === fromId);
    r.current.upsertConversation(msg, fromId, sender?.username || "?", avatarLabel(sender), !isSelf);
    if (!isSelf) playNotificationSound();
  }), [onNewDm]);

  // ── dm:edited ─────────────────────────────────────────────────────────────
  useEffect(() => onDmEdited((msg: MessagePatch) => {
    const partnerId = msg.sender_id === r.current.user?.id ? msg.receiver_id : msg.sender_id;
    if (r.current.activeDmRef.current?.id === partnerId || r.current.activeDmRef.current?.id === msg.sender_id) {
      r.current.updateDmMsg(msg as Partial<DirectMessage> & { id: number });
    }
  }), [onDmEdited]);

  // ── dm:deleted ────────────────────────────────────────────────────────────
  useEffect(() => onDmDeleted(({ messageId, senderId, receiverId }) => {
    // Identify the partner regardless of whether the current user sent or received
    const partnerId = senderId === r.current.user?.id ? receiverId : senderId;
    if (r.current.activeDmRef.current?.id === partnerId || r.current.activeDmRef.current?.id === senderId) {
      r.current.removeDmMsg(messageId);
    }
  }), [onDmDeleted]);

  // ── dm:reacted ────────────────────────────────────────────────────────────
  useEffect(() => onDmReacted(({ messageId, reactions }) => {
    r.current.updateDmMsg({ id: messageId, reactions } as Partial<DirectMessage> & { id: number });
  }), [onDmReacted]);

  // ── dm:read ───────────────────────────────────────────────────────────────
  // Shows the "seen" indicator when the partner reads our messages
  useEffect(() => onDmRead(({ readBy }) => {
    if (r.current.activeDmRef.current?.id === readBy) r.current.setSeenByPartner(true);
  }), [onDmRead]);

  // ── typing:update (channel) ───────────────────────────────────────────────
  useEffect(() => onTypingUpdate(({ username, isTyping }) => {
    r.current.setTypingUsers((prev) => isTyping ? (prev.includes(username) ? prev : [...prev, username]) : prev.filter((u) => u !== username));
  }), [onTypingUpdate]);

  // ── dm:typing:update ──────────────────────────────────────────────────────
  useEffect(() => onDmTypingUpdate(({ username, isTyping }) => {
    r.current.setDmTypingUsers((prev) => isTyping ? (prev.includes(username) ? prev : [...prev, username]) : prev.filter((u) => u !== username));
  }), [onDmTypingUpdate]);
}
