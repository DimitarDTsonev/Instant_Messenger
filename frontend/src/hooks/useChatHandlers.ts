/**
 * Pure UI action handlers for the chat page.
 *
 * Groups all user-initiated actions (channel selection, DM selection, pin/unpin,
 * channel CRUD) into a single hook so ChatPage.tsx stays lean. None of these
 * handlers manage their own state — they dispatch to setters provided by the caller.
 *
 * Used by: ChatPage.tsx.
 */

import type { MutableRefObject } from "react";
import type { Channel, DirectMessage, Message, User } from "../types";
import { avatarLabel } from "../utils/avatar";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/** All external state setters and action functions this hook requires. */
type Params = {
  channels:           Channel[];
  activeChannel:      Channel | null;
  activeDmRef:        MutableRefObject<User | null>;
  setActiveChannel:   Setter<Channel | null>;
  setActiveDm:        Setter<User | null>;
  setTypingUsers:     Setter<string[]>;
  setDmTypingUsers:   Setter<string[]>;
  setReplyTo:         Setter<Message | null>;
  setShowSettings:    Setter<boolean>;
  setSidebarOpen:     Setter<boolean>;
  setUnreadChannels:  Setter<Record<number, number>>;
  setSeenByPartner:   Setter<boolean>;
  markRead:           (partnerId: number) => void;
  leaveAllChannels:   () => void;
  addDmMsg:           (msg: DirectMessage) => void;
  upsertConversation: (msg: DirectMessage, partnerId: number, username: string, avatar: string, unread: boolean) => void;
  createChannel:      (name: string, description: string, is_private: 0 | 1) => Promise<Channel>;
  deleteChannel:      (id: number) => Promise<void>;
  pinMessage:         (id: number, cb?: (ack: SocketAck) => void) => void;
  unpinMessage:       (id: number, cb?: (ack: SocketAck) => void) => void;
};

/**
 * Returns all UI action handlers for the chat page.
 * Functions are plain (not memoised) since `p` is reconstructed each render;
 * the caller is responsible for memoising if needed.
 *
 * @param p - All external state setters and action functions.
 * @returns  Named handler functions.
 */
export function useChatHandlers(p: Params) {
  /**
   * Opens a channel: sets the active channel, clears DM, typing, reply, and
   * sidebar state, and removes the channel's unread badge.
   *
   * @param ch - The channel the user clicked.
   */
  function selectChannel(ch: Channel) {
    p.setActiveChannel(ch);
    p.setActiveDm(null);
    p.setTypingUsers([]);
    p.setDmTypingUsers([]);
    p.setReplyTo(null);
    p.setShowSettings(false);
    p.setSidebarOpen(false);
    // Delete the unread count for this channel from the map
    p.setUnreadChannels((prev) => { const next = { ...prev }; delete next[ch.id]; return next; });
  }

  /**
   * Opens a DM conversation: sets the active DM user, clears channel/typing/reply/
   * sidebar state, sends a read receipt, and emits `channel:leave`.
   *
   * @param u - The user to open a DM with.
   */
  function selectDm(u: User) {
    p.setActiveDm(u);
    p.setActiveChannel(null);
    p.setTypingUsers([]);
    p.setDmTypingUsers([]);
    p.setReplyTo(null);
    p.setSidebarOpen(false);
    p.markRead(u.id);
    p.leaveAllChannels();
  }

  /**
   * Called when the current user sends a DM. Appends the message locally,
   * resets the "seen by partner" indicator, and upserts the conversation entry.
   *
   * @param msg - The outbound `DirectMessage` (returned by the `dm:send` ack).
   */
  function handleDmSent(msg: DirectMessage) {
    p.addDmMsg(msg);
    p.setSeenByPartner(false);
    const dm = p.activeDmRef.current;
    if (dm) p.upsertConversation(msg, dm.id, dm.username, avatarLabel(dm), false);
  }

  /**
   * Creates a new channel and immediately navigates into it.
   * Shows an alert if the server returns an error.
   */
  async function handleCreateChannel(name: string, description: string, is_private: 0 | 1) {
    try { const ch = await p.createChannel(name, description, is_private); selectChannel(ch); }
    catch (err) { alert(err instanceof Error ? err.message : "Error creating channel"); }
  }

  /**
   * Prompts for confirmation and deletes a channel.
   * If the deleted channel was active, falls back to the first remaining channel.
   */
  async function handleDeleteChannel(ch: Channel) {
    if (!confirm(`Delete channel #${ch.name}? All messages will be lost.`)) return;
    try {
      await p.deleteChannel(ch.id);
      // If the deleted channel was active, switch to the first remaining one
      if (p.activeChannel?.id === ch.id) p.setActiveChannel(p.channels.find((c) => c.id !== ch.id) || null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting channel");
    }
  }

  /**
   * Merges `updated` fields into the active channel state.
   * Called when the channel settings modal saves changes.
   *
   * @param updated - Partial channel object with the changed fields.
   */
  function handleChannelUpdated(updated: Channel) {
    p.setActiveChannel((prev) => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }

  /**
   * Toggles the pin state of a message by emitting the appropriate socket event.
   *
   * @param messageId         - ID of the message to pin or unpin.
   * @param isCurrentlyPinned - `true` if the message is already pinned.
   */
  function handlePin(messageId: number, isCurrentlyPinned: boolean) {
    if (isCurrentlyPinned) {
      p.unpinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Unpin error:", error); });
    } else {
      p.pinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Pin error:", error); });
    }
  }

  /**
   * Unpins a message from the pinned banner's "remove" button.
   *
   * @param messageId - ID of the pinned message to unpin.
   */
  function handleUnpinFromBanner(messageId: number) {
    p.unpinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Unpin error:", error); });
  }

  return { selectChannel, selectDm, handleDmSent, handleCreateChannel, handleDeleteChannel, handleChannelUpdated, handlePin, handleUnpinFromBanner };
}
