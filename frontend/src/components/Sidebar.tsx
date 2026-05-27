import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSocket } from "../context/SocketContext";
import type { Channel, Conversation, User, UserStatus } from "../types";
import { avatarLabel } from "../utils/avatar";
import { navigateTo } from "../utils/navigation";
import SidebarChannelList from "./SidebarChannelList";
import SidebarDmList      from "./SidebarDmList";
import Icon               from "./Icons";
import { s }              from "./sidebarStyles";

const STATUS_COLORS = { online: "#23a55a", away: "#f0a500", dnd: "#f23f42", offline: "#5c6068" } as const;
const STATUS_LABELS = { online: "Online", away: "Away", dnd: "Do not disturb" } as const;

export default function Sidebar({
  channels, activeChannel, onSelectChannel, users, onCreateChannel, onDeleteChannel, onOpenSettings,
  conversations, activeDm, onSelectDm, unreadChannels = {}, onViewProfile, onSearchUsers, open, onClose,
}: {
  channels: Channel[];
  activeChannel?: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  users: User[];
  onCreateChannel: (name: string, description: string, isPrivate: 0 | 1) => Promise<unknown>;
  onDeleteChannel?: (channel: Channel) => void;
  onOpenSettings?: (channel: Channel) => void;
  conversations?: Conversation[];
  activeDm?: User | null;
  onSelectDm: (user: User) => void;
  unreadChannels?: Record<number, number>;
  onViewProfile?: (userId: number) => void;
  onSearchUsers?: () => void;
  open?: boolean;
  onClose?: () => void;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isConnected, onlineUserIds, userStatuses = {}, setStatus } = useSocket();

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showUsers, setShowUsers]               = useState(true);
  const [showDms, setShowDms]                   = useState(true);

  const myStatus    = userStatuses[user?.id] || "online";
  const totalUnread = conversations?.reduce((sum, c) => sum + (c.unread_count || 0), 0) || 0;

  return (
    <div style={s.sidebar} className={`sidebar${open ? " open" : ""}`}>
      <div style={s.header}>
        <span style={s.workspaceName}>Messenger</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button onClick={onSearchUsers} title="Search users" aria-label="Search users" style={s.iconButton}>
            <Icon name="users" size={17} />
          </button>
          <div style={s.statusDot(isConnected)} title={isConnected ? "Connected" : "Disconnected"} />
          <button className="sidebar-close-btn" onClick={onClose} title="Close menu" aria-label="Close menu">
            <Icon name="x" size={17} />
          </button>
        </div>
      </div>

      <div style={s.scrollArea}>
        <SidebarChannelList
          channels={channels} activeChannel={activeChannel} activeDm={activeDm}
          onSelectChannel={onSelectChannel} onCreateChannel={onCreateChannel}
          onDeleteChannel={onDeleteChannel} onOpenSettings={onOpenSettings}
          unreadChannels={unreadChannels} currentUser={user}
        />

        <SidebarDmList
          users={users} currentUserId={user?.id} activeDm={activeDm} onSelectDm={onSelectDm}
          conversations={conversations} onlineUserIds={onlineUserIds} userStatuses={userStatuses}
          visible={showDms} totalUnread={totalUnread} onToggle={() => setShowDms((v) => !v)}
        />

        <div style={s.section}>
          <div style={s.sectionHeader} onClick={() => setShowUsers((v) => !v)}>
            <span style={s.sectionTitle}>Online ({onlineUserIds.length})</span>
            <span style={{ color: "#5c6068", display: "inline-flex" }}><Icon name={showUsers ? "chevronUp" : "chevronDown"} size={14} /></span>
          </div>
          {showUsers && users.map((u) => {
            const online      = onlineUserIds.includes(u.id);
            const dotColor    = !online ? STATUS_COLORS.offline : STATUS_COLORS[userStatuses[u.id] || "online"] || STATUS_COLORS.online;
            const statusLabel = online ? STATUS_LABELS[userStatuses[u.id] || "online"] : "Offline";
            return (
              <div key={u.id} style={{ ...s.userItem, cursor: "pointer" }} onClick={() => onViewProfile?.(u.id)} title="View profile">
                <div style={s.avatarWrap}>
                  <span style={s.avatar}>{avatarLabel(u)}</span>
                  <div style={s.onlineDot(dotColor)} title={statusLabel} />
                </div>
                <span style={{ color: online ? "#f2f3f5" : "#5c6068", fontSize: "13px", flex: 1 }}>
                  {u.username}
                  {u.role === "admin" && (
                    <span title="Admin" style={{ marginLeft: "4px", color: "#faa61a", display: "inline-flex", verticalAlign: "text-bottom" }}>
                      <Icon name="shield" size={12} />
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...s.footer, flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
        {showStatusPicker && (
          <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
            {(["online", "away", "dnd"] as UserStatus[]).map((st) => (
              <button key={st} onClick={() => { setStatus(st); setShowStatusPicker(false); }} title={STATUS_LABELS[st]}
                style={{ flex: 1, padding: "5px 4px", background: myStatus === st ? STATUS_COLORS[st] + "33" : "transparent", border: `1px solid ${myStatus === st ? STATUS_COLORS[st] : "#2d2d3f"}`, borderRadius: "6px", color: STATUS_COLORS[st], fontSize: "11px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: STATUS_COLORS[st], flexShrink: 0, display: "inline-block" }} />
                {STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", position: "relative", flexShrink: 0 }} onClick={() => setShowStatusPicker((v) => !v)} title={`Status: ${STATUS_LABELS[myStatus]}`}>
            <span style={{ fontSize: "14px", fontWeight: 700 }}>{avatarLabel(user)}</span>
            <span style={{ position: "absolute", bottom: -1, right: -1, width: "10px", height: "10px", borderRadius: "50%", background: STATUS_COLORS[myStatus], border: "2px solid var(--col-bg-elevated)", display: "block" }} />
          </button>
          <div style={s.footerUser}>
            <div style={s.footerUsername}>{user?.username}{user?.is_guest && <span style={{ fontSize: "10px", color: "var(--col-warning-gold)", marginLeft: "6px" }}>guest</span>}</div>
            <div style={s.footerEmail}>{user?.email?.endsWith("@guest.local") ? "Temporary account" : user?.email}</div>
          </div>
          {user?.role === "admin" && (
            <button style={{ ...s.logoutBtn, color: "var(--col-warning-gold)" }} onClick={() => navigateTo("/admin")} title="Admin dashboard" aria-label="Admin dashboard" data-testid="admin-link">
              <Icon name="shield" size={17} />
            </button>
          )}
          <button style={s.themeBtn} onClick={toggleTheme} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} aria-label="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button style={s.logoutBtn} onClick={logout} title="Sign out" aria-label="Sign out">
            <Icon name="logOut" size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
