// ============================================================
//  pages/ChatPage.tsx
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import type { Channel, DirectMessage, Message, SearchResult, User } from "../types";
import {
  useChannels, useMessages, useUsers, useDm, useConversations, usePinnedMessages,
  useChannelPermissions,
} from "../hooks/useApi";
import Sidebar              from "../components/Sidebar";
import ChatArea             from "../components/ChatArea";
import MessageInput         from "../components/MessageInput";
import SearchModal          from "../components/SearchModal";
import PinnedBanner         from "../components/PinnedBanner";
import UserProfileModal     from "../components/UserProfileModal";
import UserSearchModal      from "../components/UserSearchModal";
import ChannelSettingsModal from "../components/ChannelSettingsModal";
import { playNotificationSound } from "../utils/notificationSound";

/** Inline style map used throughout ChatPage. */
const s = {
  // height: "100%" inherits from #root which uses 100dvh — avoids the iOS address-bar 100vh bug
  page: { height: "100%", display: "flex", overflow: "hidden", background: "#0f0f0f" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
  topbar: {
    height: "48px", background: "#1e1e2e", borderBottom: "1px solid #2d2d3f",
    display: "flex", alignItems: "center", padding: "0 16px", gap: "10px", flexShrink: 0,
  },
  topbarTitle: { fontWeight: 700, fontSize: "15px", color: "#f2f3f5", display: "flex", alignItems: "center", gap: "8px" },
  topbarDesc: { fontSize: "13px", color: "#5c6068", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  searchBtn: { padding: "6px 14px", background: "#2d2d3f", border: "1px solid #3a3a4f", borderRadius: "20px", color: "#949ba4", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", flexShrink: 0 },
  settingsBtn: { padding: "6px 10px", background: "transparent", border: "1px solid #3a3a4f", borderRadius: "8px", color: "#949ba4", fontSize: "14px", cursor: "pointer", flexShrink: 0 },
  dmBadge: { display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", background: "#5865f215", border: "1px solid #5865f230", borderRadius: "12px", fontSize: "12px", color: "#7289da", marginLeft: "8px" },
  noChannel: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#5c6068", gap: "16px" },
} satisfies AppStyleMap;

/**
 * Persists the current channel/DM selection to sessionStorage so the view
 * is restored after a page refresh.
 *
 * @param {number|null} channelId
 * @param {number|null} dmUserId
 */
function saveSession(channelId?: number | null, dmUserId?: number | null) {
  try { sessionStorage.setItem("im_session", JSON.stringify({ channelId: channelId ?? null, dmUserId: dmUserId ?? null })); } catch {}
}

/**
 * Reads the previously saved channel/DM selection from sessionStorage.
 *
 * @returns {{ channelId?: number, dmUserId?: number }}
 */
function loadSession(): { channelId?: number; dmUserId?: number } {
  try { return JSON.parse(sessionStorage.getItem("im_session") || "{}"); } catch { return {}; }
}

/**
 * ChatPage - The main application view shown to authenticated users.
 *
 * Composes the Sidebar, topbar, PinnedBanner, ChatArea, and MessageInput into
 * a full-height layout.  Manages all real-time socket subscriptions and
 * coordinates state between the child components.
 *
 * Key responsibilities:
 * - Restores the last-viewed channel or DM from sessionStorage on mount.
 * - Subscribes to all relevant Socket.io events (messages, typing, DMs, pins,
 *   mentions, reactions) and dispatches updates to the appropriate hooks.
 * - Derives `canWrite` from per-role channel permissions so the input can be
 *   disabled when the user's role forbids writing.
 * - Fires browser Notification API alerts for @mentions.
 * - Intercepts Ctrl+F / Cmd+F to open the in-app search modal.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function ChatPage() {
  const { user } = useAuth();
  const {
    isConnected, onlineUserIds, joinChannel, leaveAllChannels,
    onNewMessage, onTypingUpdate, onNewDm,
    onMessageEdited, onMessageDeleted, onMessageReacted,
    onChannelNotify, onMessagePinned, onMessageUnpinned,
    onUserMentioned, pinMessage, unpinMessage,
    onDmEdited, onDmDeleted, onDmReacted,
    sendDmRead, onDmRead, onDmTypingUpdate,
  } = useSocket();

  const { channels, createChannel, updateChannel, deleteChannel } = useChannels();
  const { users }                                                  = useUsers();
  const { conversations, markRead, upsertConversation }           = useConversations();

  // --- UI state ---
  const [activeChannel, setActiveChannel]     = useState<Channel | null>(null);
  const [activeDm, setActiveDm]               = useState<User | null>(null);
  const [showSearch, setShowSearch]           = useState(false);
  const [showUserSearch, setShowUserSearch]   = useState(false);
  const [profileUserId, setProfileUserId]     = useState<number | null>(null);
  const [typingUsers, setTypingUsers]         = useState<string[]>([]);
  const [dmTypingUsers, setDmTypingUsers]     = useState<string[]>([]);
  const [sessionRestored, setSessionRestored] = useState(false);
  // Map of channelId → unread count for channels not currently active
  const [unreadChannels, setUnreadChannels]   = useState<Record<number, number>>({});
  const [replyTo, setReplyTo]                 = useState<Message | null>(null);
  const [showSettings, setShowSettings]       = useState(false);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  // Tracks whether the active DM partner has seen our last message
  const [seenByPartner, setSeenByPartner]     = useState(false);

  // Stable refs for active channel/DM — used inside socket event handlers
  // to avoid stale closure values without adding them to dependency arrays.
  const activeChannelRef = useRef<Channel | null>(null);
  const activeDmRef      = useRef<User | null>(null);
  activeChannelRef.current = activeChannel;
  activeDmRef.current      = activeDm;

  const {
    messages: channelMsgs, loading: channelLoading, hasMore: channelHasMore,
    loadMore: channelLoadMore, addMessage: addChannelMsg,
    updateMessage: updateChannelMsg, removeMessage: removeChannelMsg,
  } = useMessages(activeChannel?.id);

  const {
    messages: dmMsgs, loading: dmLoading, hasMore: dmHasMore,
    loadMore: dmLoadMore, addMessage: addDmMsg,
    updateMessage: updateDmMsg, removeMessage: removeDmMsg,
  } = useDm(activeDm?.id);

  const { pinnedMessages, addPinned, removePin } = usePinnedMessages(activeChannel?.id);

  // Fetch permissions for the active channel to compute canWrite
  const { permissions: channelPerms } = useChannelPermissions(activeChannel?.id);

  // -----------------------------------------------------------
  // Push notification permission
  // -----------------------------------------------------------
  // Request browser notification permission once on mount so @mention
  // alerts can be shown even when the tab is in the background.
  useEffect(() => {
    if (
      "Notification" in window &&
      Notification.permission === "default" &&
      typeof Notification.requestPermission === "function"
    ) {
      Notification.requestPermission();
    }
  }, []);

  // -----------------------------------------------------------
  // Restore session
  // -----------------------------------------------------------
  // Runs once after channels and users are loaded; restores the last-viewed
  // channel or DM so the user lands in the same place after a page refresh.
  useEffect(() => {
    if (sessionRestored) return;
    if (channels.length === 0) return;
    const { channelId, dmUserId } = loadSession();
    if (dmUserId && users.length > 0) {
      const u = users.find((u) => u.id === dmUserId);
      if (u) { setActiveDm(u); setActiveChannel(null); setSessionRestored(true); return; }
    }
    if (channelId) {
      const ch = channels.find((c) => c.id === channelId);
      if (ch) { setActiveChannel(ch); setActiveDm(null); setSessionRestored(true); return; }
    }
    // Fall back to the first available channel
    setActiveChannel(channels[0]);
    setSessionRestored(true);
  }, [channels, users, sessionRestored]);

  // Join the socket room whenever the active channel changes (or the socket reconnects)
  useEffect(() => {
    if (isConnected && activeChannel) joinChannel(activeChannel.id);
  }, [isConnected, activeChannel, joinChannel]);

  // Persist the current selection to sessionStorage after the initial restore
  useEffect(() => {
    if (sessionRestored) saveSession(activeChannel?.id, activeDm?.id);
  }, [activeChannel, activeDm, sessionRestored]);

  // -----------------------------------------------------------
  // Real-time: channel messages
  // -----------------------------------------------------------

  // Append incoming channel messages only for the currently active channel
  useEffect(() => {
    return onNewMessage((msg) => {
      if (activeChannelRef.current?.id === msg.channel_id) addChannelMsg(msg);
    });
  }, [onNewMessage, addChannelMsg]);

  // Merge edited message data into the active channel's list
  useEffect(() => {
    return onMessageEdited((msg) => {
      if (activeChannelRef.current?.id === msg.channel_id) updateChannelMsg(msg);
    });
  }, [onMessageEdited, updateChannelMsg]);

  // Remove the deleted message and also clear it from the pinned list
  useEffect(() => {
    return onMessageDeleted(({ messageId, channelId }) => {
      if (activeChannelRef.current?.id === channelId) removeChannelMsg(messageId);
      removePin(messageId);
    });
  }, [onMessageDeleted, removeChannelMsg, removePin]);

  // Update reaction counters on the affected message
  useEffect(() => {
    return onMessageReacted(({ messageId, reactions }) => {
      updateChannelMsg({ id: messageId, reactions });
    });
  }, [onMessageReacted, updateChannelMsg]);

  // Update both the pinned list and the channel message's is_pinned flag
  useEffect(() => {
    return onMessagePinned((msg) => {
      addPinned(msg);
      updateChannelMsg({ id: msg.id, is_pinned: 1 });
    });
  }, [onMessagePinned, addPinned, updateChannelMsg]);

  // Remove from pinned list and clear the flag on the message
  useEffect(() => {
    return onMessageUnpinned(({ messageId }) => {
      removePin(messageId);
      updateChannelMsg({ id: messageId, is_pinned: 0 });
    });
  }, [onMessageUnpinned, removePin, updateChannelMsg]);

  // Show a browser notification when the current user is @mentioned
  useEffect(() => {
    return onUserMentioned(({ message, mentionedBy, channelId }) => {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`@${mentionedBy} mentioned you`, {
          body: (message.content || "").slice(0, 100),
          tag: `mention-${message.id}`,
        });
      }
    });
  }, [onUserMentioned, channels]);

  // Increment the unread badge for channels that are not currently active
  useEffect(() => {
    return onChannelNotify(({ channelId }) => {
      if (activeChannelRef.current?.id === channelId) return;
      setUnreadChannels((prev) => ({ ...prev, [channelId]: (prev[channelId] || 0) + 1 }));
      playNotificationSound();
    });
  }, [onChannelNotify]);

  // -----------------------------------------------------------
  // Real-time: DM messages
  // -----------------------------------------------------------

  // Append DMs that come from the currently active DM partner; always update the sidebar summary
  useEffect(() => {
    return onNewDm((msg) => {
      const fromId = msg.from_user_id ?? msg.sender_id ?? msg.user_id;
      const isSelf = fromId === user?.id;
      if (activeDmRef.current?.id === fromId) {
        addDmMsg(msg);
      }
      const sender = users.find((u) => u.id === fromId);
      upsertConversation(msg, fromId, sender?.username || "?", sender?.avatar || "👤", !isSelf);
      if (!isSelf) playNotificationSound();
    });
  }, [onNewDm, addDmMsg, users, upsertConversation, user]);

  // Merge edited DM data — apply when either partner is the current DM view
  useEffect(() => {
    return onDmEdited((msg) => {
      const partnerId = msg.sender_id === user?.id ? msg.receiver_id : msg.sender_id;
      if (activeDmRef.current?.id === partnerId || activeDmRef.current?.id === msg.sender_id) {
        updateDmMsg(msg);
      }
    });
  }, [onDmEdited, updateDmMsg, user]);

  // Remove deleted DMs for the active conversation
  useEffect(() => {
    return onDmDeleted(({ messageId, senderId, receiverId }) => {
      const partnerId = senderId === user?.id ? receiverId : senderId;
      if (activeDmRef.current?.id === partnerId || activeDmRef.current?.id === senderId) {
        removeDmMsg(messageId);
      }
    });
  }, [onDmDeleted, removeDmMsg, user]);

  // Update reaction counters on the affected DM
  useEffect(() => {
    return onDmReacted(({ messageId, reactions }) => {
      updateDmMsg({ id: messageId, reactions });
    });
  }, [onDmReacted, updateDmMsg]);

  // When we open a DM, mark the partner's messages as read and reset seen state
  useEffect(() => {
    if (!activeDm) return;
    setSeenByPartner(false);
    sendDmRead(activeDm.id);
  }, [activeDm, sendDmRead]);

  // When the partner reads our messages, show the "Seen" indicator
  useEffect(() => {
    return onDmRead(({ readBy }) => {
      if (activeDmRef.current?.id === readBy) setSeenByPartner(true);
    });
  }, [onDmRead]);

  // Initialize seenByPartner from loaded history — if the last outgoing message
  // is already marked is_read we know the partner has seen it.
  useEffect(() => {
    if (!activeDm || dmLoading) return;
    const lastOutgoing = [...dmMsgs].reverse().find(
      (m) => (m.sender_id ?? m.user_id) === user?.id
    );
    if (lastOutgoing?.is_read) setSeenByPartner(true);
  }, [dmMsgs, activeDm, dmLoading, user]);

  // -----------------------------------------------------------
  // Typing indicators
  // -----------------------------------------------------------

  // Maintain the list of usernames currently typing in the active channel
  useEffect(() => {
    return onTypingUpdate(({ username, isTyping }) => {
      setTypingUsers((prev) =>
        isTyping
          ? prev.includes(username) ? prev : [...prev, username]
          : prev.filter((u) => u !== username)
      );
    });
  }, [onTypingUpdate]);

  // Maintain the list of usernames currently typing in the active DM
  useEffect(() => {
    return onDmTypingUpdate(({ username, isTyping }) => {
      setDmTypingUsers((prev) =>
        isTyping
          ? prev.includes(username) ? prev : [...prev, username]
          : prev.filter((u) => u !== username)
      );
    });
  }, [onDmTypingUpdate]);

  // -----------------------------------------------------------
  // Ctrl+F / Cmd+F — open in-app search modal
  // -----------------------------------------------------------
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); setShowSearch(true); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // -----------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------

  /**
   * Switches the view to a channel, clearing DM state and any in-flight reply/typing.
   *
   * @param {Object} ch - Channel object to activate.
   */
  function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setActiveDm(null);
    setTypingUsers([]);
    setDmTypingUsers([]);
    setReplyTo(null);
    setShowSettings(false);
    setSidebarOpen(false);
    setUnreadChannels((prev) => { const next = { ...prev }; delete next[ch.id]; return next; });
  }

  /**
   * Switches the view to a DM conversation, clearing channel state.
   *
   * @param {Object} u - User object of the DM partner.
   */
  function selectDm(u: User) {
    setActiveDm(u);
    setActiveChannel(null);
    setTypingUsers([]);
    setDmTypingUsers([]);
    setReplyTo(null);
    setSidebarOpen(false);
    markRead(u.id);
    leaveAllChannels();
  }

  /**
   * Called by MessageInput after a DM is successfully sent.
   * Appends the message and updates the sidebar conversation list.
   *
   * @param {Object} msg - The sent message object returned by the server.
   */
  function handleDmSent(msg: DirectMessage) {
    addDmMsg(msg);
    setSeenByPartner(false);
    if (activeDm) {
      upsertConversation(msg, activeDm.id, activeDm.username, activeDm.avatar || "👤", false);
    }
  }

  /**
   * Creates a new channel and immediately switches to it.
   *
   * @param {string} name
   * @param {string} description
   * @param {0|1}    is_private
   */
  async function handleCreateChannel(name: string, description: string, is_private: 0 | 1) {
    try { const ch = await createChannel(name, description, is_private); selectChannel(ch); }
    catch (err) { alert(err instanceof Error ? err.message : "Error creating channel"); }
  }

  /**
   * Asks for confirmation then deletes a channel.
   * If the deleted channel was active, selects the next available one.
   *
   * @param {Object} ch - Channel object to delete.
   */
  async function handleDeleteChannel(ch: Channel) {
    if (!confirm(`Delete channel #${ch.name}? All messages will be lost.`)) return;
    try {
      await deleteChannel(ch.id);
      if (activeChannel?.id === ch.id) setActiveChannel(channels.find((c) => c.id !== ch.id) || null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting channel");
    }
  }

  /**
   * Merges updated channel fields into the active channel state after a settings save.
   *
   * @param {Object} updated - Partial channel object with new field values.
   */
  function handleChannelUpdated(updated: Channel) {
    setActiveChannel((prev) => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }

  /**
   * Toggles the pinned state of a channel message via socket.
   *
   * @param {number}  messageId         - ID of the message to pin or unpin.
   * @param {boolean} isCurrentlyPinned - Current pinned state of the message.
   */
  function handlePin(messageId: number, isCurrentlyPinned: boolean) {
    if (isCurrentlyPinned) {
      unpinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Unpin error:", error); });
    } else {
      pinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Pin error:", error); });
    }
  }

  /**
   * Unpins a message when the user clicks the remove button in the PinnedBanner.
   *
   * @param {number} messageId
   */
  function handleUnpinFromBanner(messageId: number) {
    unpinMessage(messageId, ({ error }: SocketAck = {}) => { if (error) console.error("Unpin error:", error); });
  }

  // --- Derived state ---

  /** True when the user is in a DM conversation (not a channel). */
  const isDmMode = !!activeDm && !activeChannel;

  // Route message data / loading flags to whichever mode is active
  const messages = isDmMode ? dmMsgs     : channelMsgs;
  const loading  = isDmMode ? dmLoading  : channelLoading;
  const hasMore  = isDmMode ? dmHasMore  : channelHasMore;
  const loadMore = isDmMode ? dmLoadMore : channelLoadMore;

  // Only admins and the channel creator can pin messages
  const canPin = !isDmMode && (
    user?.role === "admin" || user?.id === activeChannel?.created_by
  );

  // Compute write permission: owner always yes; manager/member check custom perms; default true
  const canWrite = isDmMode || (() => {
    const role = activeChannel?.user_role;
    // Public channels grant implicit member access even with no explicit role row
    if (!role) return !activeChannel?.is_private;
    if (role === "owner") return true;
    if (role === "viewer") return false;
    const p = channelPerms?.[role];
    return p ? !!p.can_write : true;
  })();

  // Show settings gear when user is owner or manager of active channel
  const canOpenSettings = !isDmMode && activeChannel && (
    activeChannel.user_role === "owner" || activeChannel.user_role === "manager" ||
    user?.role === "admin"
  );

  return (
    <div style={s.page}>
      {/* Backdrop that closes the sidebar when tapped on mobile */}
      <div
        data-testid="sidebar-overlay"
        className={`sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        channels={channels}
        activeChannel={activeChannel}
        onSelectChannel={selectChannel}
        onDeleteChannel={handleDeleteChannel}
        onOpenSettings={(ch) => { setActiveChannel(ch); setShowSettings(true); }}
        users={users}
        onCreateChannel={handleCreateChannel}
        conversations={conversations}
        activeDm={activeDm}
        onSelectDm={selectDm}
        unreadChannels={unreadChannels}
        onViewProfile={setProfileUserId}
        onSearchUsers={() => setShowUserSearch(true)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div style={s.main} className="chat-main">
        {/* Topbar: shows channel name/description or DM partner name */}
        <div style={s.topbar} className="topbar-mobile">
          {/* Hamburger — only visible on mobile via CSS */}
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen((v) => !v)}
            title="Menu"
          >
            ☰
          </button>

          {activeChannel && !isDmMode ? (
            <>
              <div style={s.topbarTitle}>
                <span style={{ color: "#5c6068" }}>{activeChannel.is_private ? "🔒" : "#"}</span>
                {activeChannel.name}
              </div>
              {activeChannel.description && (
                <><span style={{ color: "#2d2d3f" }}>|</span><span style={s.topbarDesc} className="topbar-desc">{activeChannel.description}</span></>
              )}
            </>
          ) : isDmMode ? (
            <div style={s.topbarTitle}>
              <span>{activeDm.avatar || "👤"}</span>
              <span>{activeDm.username}</span>
              <span style={s.dmBadge}>💬 DM</span>
            </div>
          ) : (
            <span style={{ color: "#5c6068", fontSize: "14px" }}>Loading...</span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            {canOpenSettings && (
              <button style={s.settingsBtn} onClick={() => setShowSettings(true)} title="Channel settings">
                ⚙️
              </button>
            )}
            <button style={s.searchBtn} onClick={() => setShowSearch(true)} title="Ctrl+F">
              🔍 <span className="search-btn-label">Search</span>
            </button>
          </div>
        </div>

        {/* Pinned messages banner (channels only) */}
        {!isDmMode && activeChannel && (
          <PinnedBanner
            pinnedMessages={pinnedMessages}
            channelCreatedBy={activeChannel?.created_by}
            onUnpin={handleUnpinFromBanner}
          />
        )}

        {(activeChannel || activeDm) ? (
          <>
            <ChatArea
              messages={messages}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={loadMore}
              typingUsers={isDmMode ? dmTypingUsers : typingUsers}
              onReply={setReplyTo}
              onPin={handlePin}
              canPin={canPin}
              users={users}
              isDm={isDmMode}
              seenByPartner={isDmMode ? seenByPartner : false}
            />
            <MessageInput
              channelId={activeChannel?.id}
              channelName={activeChannel?.name}
              dmUser={activeDm}
              isDm={isDmMode}
              canWrite={canWrite}
              onAddMessage={isDmMode ? handleDmSent : undefined}
              users={users}
              replyTo={replyTo}
              onClearReply={() => setReplyTo(null)}
            />
          </>
        ) : (
          <div style={s.noChannel}>
            <span style={{ fontSize: "64px" }}>💬</span>
            <span style={{ fontSize: "18px", fontWeight: 600, color: "#f2f3f5" }}>
              Welcome to Instant Messenger
            </span>
            <span>Select a channel or user from the left menu</span>
          </div>
        )}
      </div>

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onNavigate={(result) => {
            if (result.type === "channel") {
              const ch = channels.find((c) => c.id === result.channel_id);
              if (ch) selectChannel(ch);
            } else {
              const u = users.find((u) => u.id === result.dm_partner_id);
              if (u) selectDm(u);
            }
          }}
        />
      )}

      {showUserSearch && (
        <UserSearchModal
          onClose={() => setShowUserSearch(false)}
          onSelectDm={(u) => selectDm(u)}
          onViewProfile={(id) => setProfileUserId(id)}
        />
      )}

      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          isOnline={onlineUserIds.includes(profileUserId)}
          onClose={() => setProfileUserId(null)}
          onStartDm={(u) => selectDm(u)}
        />
      )}

      {showSettings && activeChannel && (
        <ChannelSettingsModal
          channel={activeChannel}
          onClose={() => setShowSettings(false)}
          onChannelUpdated={handleChannelUpdated}
        />
      )}
    </div>
  );
}
