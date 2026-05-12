import type { MutableRefObject } from "react";
import type { Channel, DirectMessage, Message, User } from "../types";
import { avatarLabel } from "../utils/avatar";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

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

export function useChatHandlers(p: Params) {
  function selectChannel(ch: Channel) {
    p.setActiveChannel(ch);
    p.setActiveDm(null);
    p.setTypingUsers([]);
    p.setDmTypingUsers([]);
    p.setReplyTo(null);
    p.setShowSettings(false);
    p.setSidebarOpen(false);
    p.setUnreadChannels((prev) => { const next = { ...prev }; delete next[ch.id]; return next; });
  }

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

  function handleDmSent(msg: DirectMessage) {
    p.addDmMsg(msg);
    p.setSeenByPartner(false);
    const dm = p.activeDmRef.current;
    if (dm) p.upsertConversation(msg, dm.id, dm.username, avatarLabel(dm), false);
  }

  async function handleCreateChannel(name: string, description: string, is_private: 0 | 1) {
    try { const ch = await p.createChannel(name, description, is_private); selectChannel(ch); }
    catch (err) { alert(err instanceof Error ? err.message : "Error creating channel"); }
  }

  async function handleDeleteChannel(ch: Channel) {
    if (!confirm(`Delete channel #${ch.name}? All messages will be lost.`)) return;
    try {
      await p.deleteChannel(ch.id);
      if (p.activeChannel?.id === ch.id) p.setActiveChannel(p.channels.find((c) => c.id !== ch.id) || null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting channel");
    }
  }

  function handleChannelUpdated(updated: Channel) {
    p.setActiveChannel((prev) => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }

  function handlePin(messageId: number, isCurrentlyPinned: boolean) {
    if (isCurrentlyPinned) {
      p.unpinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Unpin error:", error); });
    } else {
      p.pinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Pin error:", error); });
    }
  }

  function handleUnpinFromBanner(messageId: number) {
    p.unpinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Unpin error:", error); });
  }

  return { selectChannel, selectDm, handleDmSent, handleCreateChannel, handleDeleteChannel, handleChannelUpdated, handlePin, handleUnpinFromBanner };
}
