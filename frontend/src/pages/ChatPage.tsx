import { useState, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import type { Channel, DirectMessage, Message, User } from "../types";
import { useChannels, useMessages, useUsers, useDm, useConversations, usePinnedMessages, useChannelPermissions } from "../hooks/useApi";
import Sidebar              from "../components/Sidebar";
import ChatArea             from "../components/ChatArea";
import MessageInput         from "../components/MessageInput";
import SearchModal          from "../components/SearchModal";
import PinnedBanner         from "../components/PinnedBanner";
import UserProfileModal     from "../components/UserProfileModal";
import UserSearchModal      from "../components/UserSearchModal";
import ChannelSettingsModal from "../components/ChannelSettingsModal";
import ChatTopbar           from "../components/ChatTopbar";
import { s }               from "./chatPageStyles";
import { loadSession, saveSession } from "../utils/chatSession";
import { useChatSocket }   from "../hooks/useChatSocket";
import { useChatHandlers } from "../hooks/useChatHandlers";

export default function ChatPage() {
  const { user } = useAuth();
  const { isConnected, onlineUserIds, joinChannel, leaveAllChannels, pinMessage, unpinMessage, sendDmRead, onDmRead } = useSocket();

  const { channels, createChannel, deleteChannel } = useChannels();
  const { users }                                  = useUsers();
  const { conversations, markRead, upsertConversation } = useConversations();

  const [activeChannel, setActiveChannel]     = useState<Channel | null>(null);
  const [activeDm, setActiveDm]               = useState<User | null>(null);
  const [showSearch, setShowSearch]           = useState(false);
  const [showUserSearch, setShowUserSearch]   = useState(false);
  const [profileUserId, setProfileUserId]     = useState<number | null>(null);
  const [typingUsers, setTypingUsers]         = useState<string[]>([]);
  const [dmTypingUsers, setDmTypingUsers]     = useState<string[]>([]);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [unreadChannels, setUnreadChannels]   = useState<Record<number, number>>({});
  const [replyTo, setReplyTo]                 = useState<Message | null>(null);
  const [showSettings, setShowSettings]       = useState(false);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [seenByPartner, setSeenByPartner]     = useState(false);

  const activeChannelRef = useRef<Channel | null>(null);
  const activeDmRef      = useRef<User | null>(null);
  activeChannelRef.current = activeChannel;
  activeDmRef.current      = activeDm;

  const { messages: channelMsgs, loading: channelLoading, hasMore: channelHasMore, loadMore: channelLoadMore, addMessage: addChannelMsg, updateMessage: updateChannelMsg, removeMessage: removeChannelMsg } = useMessages(activeChannel?.id);
  const { messages: dmMsgs, loading: dmLoading, hasMore: dmHasMore, loadMore: dmLoadMore, addMessage: addDmMsg, updateMessage: updateDmMsg, removeMessage: removeDmMsg } = useDm(activeDm?.id);
  const { pinnedMessages, addPinned, removePin } = usePinnedMessages(activeChannel?.id);
  const { permissions: channelPerms }            = useChannelPermissions(activeChannel?.id);

  // Restore last-viewed channel/DM after channels and users are loaded
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
    setActiveChannel(channels[0]);
    setSessionRestored(true);
  }, [channels, users, sessionRestored]);

  useEffect(() => { if (isConnected && activeChannel) joinChannel(activeChannel.id); }, [isConnected, activeChannel, joinChannel]);
  useEffect(() => { if (sessionRestored) saveSession(activeChannel?.id, activeDm?.id); }, [activeChannel, activeDm, sessionRestored]);
  useEffect(() => { function handleKey(e: KeyboardEvent) { if ((e.ctrlKey || e.metaKey) && e.key === "f") { e.preventDefault(); setShowSearch(true); } } window.addEventListener("keydown", handleKey); return () => window.removeEventListener("keydown", handleKey); }, []);

  useChatSocket({ addChannelMsg, updateChannelMsg, removeChannelMsg, addDmMsg, updateDmMsg, removeDmMsg, addPinned, removePin, upsertConversation, setUnreadChannels, setTypingUsers, setDmTypingUsers, setSeenByPartner, users, user, activeChannelRef, activeDmRef });

  const { selectChannel, selectDm, handleDmSent, handleCreateChannel, handleDeleteChannel, handleChannelUpdated, handlePin, handleUnpinFromBanner } = useChatHandlers({ channels, activeChannel, activeDmRef, setActiveChannel, setActiveDm, setTypingUsers, setDmTypingUsers, setReplyTo, setShowSettings, setSidebarOpen, setUnreadChannels, setSeenByPartner, markRead, leaveAllChannels, addDmMsg, upsertConversation, createChannel, deleteChannel, pinMessage, unpinMessage });

  // Mark DM messages as read when switching to a DM conversation
  useEffect(() => { if (!activeDm) return; setSeenByPartner(false); sendDmRead(activeDm.id); }, [activeDm, sendDmRead]);
  useEffect(() => { return onDmRead(({ readBy }) => { if (activeDmRef.current?.id === readBy) setSeenByPartner(true); }); }, [onDmRead]);
  useEffect(() => {
    if (!activeDm || dmLoading) return;
    const last = [...dmMsgs].reverse().find((m) => (m.sender_id ?? m.user_id) === user?.id);
    if (last?.is_read) setSeenByPartner(true);
  }, [dmMsgs, activeDm, dmLoading, user]);

  const isDmMode  = !!activeDm && !activeChannel;
  const messages  = isDmMode ? dmMsgs     : channelMsgs;
  const loading   = isDmMode ? dmLoading  : channelLoading;
  const hasMore   = isDmMode ? dmHasMore  : channelHasMore;
  const loadMore  = isDmMode ? dmLoadMore : channelLoadMore;
  const canPin    = !isDmMode && (user?.role === "admin" || user?.id === activeChannel?.created_by);
  const canWrite  = isDmMode || (() => {
    const role = activeChannel?.user_role;
    if (!role) return !activeChannel?.is_private;
    if (role === "owner") return true;
    if (role === "viewer") return false;
    const p = channelPerms?.[role];
    return p ? !!p.can_write : true;
  })();
  const canOpenSettings = !isDmMode && !!activeChannel && (activeChannel.user_role === "owner" || activeChannel.user_role === "manager" || user?.role === "admin");

  return (
    <div style={s.page}>
      <div data-testid="sidebar-overlay" className={`sidebar-overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <Sidebar
        channels={channels} activeChannel={activeChannel} onSelectChannel={selectChannel}
        onDeleteChannel={handleDeleteChannel} onOpenSettings={(ch) => { setActiveChannel(ch); setShowSettings(true); }}
        users={users} onCreateChannel={handleCreateChannel} conversations={conversations}
        activeDm={activeDm} onSelectDm={selectDm} unreadChannels={unreadChannels}
        onViewProfile={setProfileUserId} onSearchUsers={() => setShowUserSearch(true)}
        open={sidebarOpen} onClose={() => setSidebarOpen(false)}
      />

      <div style={s.main} className="chat-main">
        <ChatTopbar activeChannel={activeChannel} isDmMode={isDmMode} activeDm={activeDm} canOpenSettings={canOpenSettings} onSettings={() => setShowSettings(true)} onSearch={() => setShowSearch(true)} onSidebarOpen={() => setSidebarOpen((v) => !v)} />

        {!isDmMode && activeChannel && <PinnedBanner pinnedMessages={pinnedMessages} channelCreatedBy={activeChannel?.created_by} onUnpin={handleUnpinFromBanner} />}

        {(activeChannel || activeDm) ? (
          <>
            <ChatArea messages={messages} loading={loading} hasMore={hasMore} onLoadMore={loadMore} typingUsers={isDmMode ? dmTypingUsers : typingUsers} onReply={setReplyTo} onPin={handlePin} canPin={canPin} users={users} isDm={isDmMode} seenByPartner={isDmMode ? seenByPartner : false} />
            <MessageInput channelId={activeChannel?.id} channelName={activeChannel?.name} dmUser={activeDm} isDm={isDmMode} canWrite={canWrite} onAddMessage={isDmMode ? handleDmSent : undefined} users={users} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />
          </>
        ) : (
          <div style={s.noChannel}>
            <span style={{ fontSize: "64px" }}>💬</span>
            <span style={{ fontSize: "18px", fontWeight: 600, color: "#f2f3f5" }}>Welcome to Instant Messenger</span>
            <span>Select a channel or user from the left menu</span>
          </div>
        )}
      </div>

      {showSearch && (
        <SearchModal onClose={() => setShowSearch(false)} onNavigate={(result) => {
          if (result.type === "channel") { const ch = channels.find((c) => c.id === result.channel_id); if (ch) selectChannel(ch); }
          else { const u = users.find((u) => u.id === result.dm_partner_id); if (u) selectDm(u); }
        }} />
      )}
      {showUserSearch && <UserSearchModal onClose={() => setShowUserSearch(false)} onSelectDm={selectDm} onViewProfile={(id) => setProfileUserId(id)} />}
      {profileUserId && <UserProfileModal userId={profileUserId} isOnline={onlineUserIds.includes(profileUserId)} onClose={() => setProfileUserId(null)} onStartDm={selectDm} />}
      {showSettings && activeChannel && <ChannelSettingsModal channel={activeChannel} onClose={() => setShowSettings(false)} onChannelUpdated={handleChannelUpdated} />}
    </div>
  );
}
