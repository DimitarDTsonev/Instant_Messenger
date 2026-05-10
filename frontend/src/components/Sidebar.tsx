// ============================================================
//  components/Sidebar.tsx — Left panel with channels and users
// ============================================================

import { useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import type { Channel, Conversation, User, UserStatus } from "../types";
import { navigateTo } from "../utils/navigation";

const STATUS_COLORS = { online: "#23a55a", away: "#f0a500", dnd: "#f23f42", offline: "#5c6068" } as const;
const STATUS_LABELS = { online: "Online", away: "Away", dnd: "Do not disturb" } as const;

function statusColor(userId: number, onlineUserIds: number[], userStatuses: Record<number, UserStatus>) {
  if (!onlineUserIds.includes(userId)) return STATUS_COLORS.offline;
  return STATUS_COLORS[userStatuses[userId] || "online"] || STATUS_COLORS.online;
}

/** Inline style map used throughout Sidebar. */
const s = {
  sidebar: {
    width: "240px",
    flexShrink: 0,
    background: "#1e1e2e",
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #2d2d3f",
    overflow: "hidden",
  },
  header: {
    padding: "16px",
    borderBottom: "1px solid #2d2d3f",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  workspaceName: {
    fontWeight: 700,
    fontSize: "15px",
    color: "#f2f3f5",
  },
  statusDot: (connected: boolean) => ({
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: connected ? "#23a55a" : "#f23f42",
    flexShrink: 0,
  }),
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 0",
  },
  section: {
    marginBottom: "8px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 16px",
    cursor: "pointer",
  },
  sectionTitle: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#949ba4",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  addBtn: {
    width: "16px",
    height: "16px",
    color: "#949ba4",
    fontSize: "16px",
    lineHeight: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    transition: "all 0.15s",
  },
  channelItem: (active: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 16px",
    cursor: "pointer",
    background: active ? "#5865f220" : "transparent",
    borderLeft: active ? "2px solid #5865f2" : "2px solid transparent",
    color: active ? "#f2f3f5" : "#949ba4",
    fontSize: "14px",
    transition: "all 0.1s",
  }),
  channelName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dmItem: (active: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 16px",
    cursor: "pointer",
    background: active ? "#5865f220" : "transparent",
    borderLeft: active ? "2px solid #5865f2" : "2px solid transparent",
    transition: "all 0.1s",
  }),
  unreadBadge: {
    minWidth: "18px",
    height: "18px",
    borderRadius: "9px",
    background: "#f23f42",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
    flexShrink: 0,
  },
  userItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "5px 16px",
    fontSize: "13px",
    color: "#949ba4",
  },
  avatarWrap: (online: boolean) => ({
    position: "relative",
    flexShrink: 0,
  }),
  avatar: {
    fontSize: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: (color: string) => ({
    position: "absolute",
    bottom: -2,
    right: -2,
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: color,
    border: "2px solid #1e1e2e",
  }),
  footer: {
    padding: "12px 16px",
    borderTop: "1px solid #2d2d3f",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  footerUser: {
    flex: 1,
    overflow: "hidden",
  },
  footerUsername: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#f2f3f5",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footerEmail: {
    fontSize: "11px",
    color: "#5c6068",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logoutBtn: {
    padding: "6px",
    borderRadius: "6px",
    color: "#f23f42",
    fontSize: "18px",
    transition: "background 0.15s",
  },
  newChannelForm: {
    padding: "8px 16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  newChannelInput: {
    background: "#0f0f1a",
    border: "1px solid #2d2d3f",
    borderRadius: "6px",
    padding: "6px 10px",
    color: "#f2f3f5",
    fontSize: "13px",
    outline: "none",
  },
  newChannelRow: {
    display: "flex",
    gap: "6px",
  },
  newChannelSubmit: {
    padding: "6px 12px",
    background: "#5865f2",
    borderRadius: "6px",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
  },
  privateToggle: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#949ba4",
    cursor: "pointer",
  },
} satisfies AppStyleMap;

/**
 * Sidebar - Left navigation panel showing channels, DMs, and online users.
 *
 * Renders three collapsible sections:
 * 1. Channels list — each row shows an unread badge and, on hover, settings
 *    (⚙️) and delete (🗑️) action buttons for authorized users.
 * 2. Direct messages list — ordered by the user list; shows per-user online
 *    indicators and unread badges derived from the conversations prop.
 * 3. Online users list — all users with a green/grey presence dot; clicking
 *    a row opens the user profile modal.
 *
 * The "+" button in the channels section header expands an inline form to
 * create a new channel with a name, optional description, and privacy toggle.
 *
 * @component
 * @param {Object}    props
 * @param {Object[]}  props.channels          - List of channel objects the current user can see.
 * @param {Object}    props.activeChannel     - Currently selected channel (null in DM mode).
 * @param {Function}  props.onSelectChannel   - Called with a channel object when a channel row is clicked.
 * @param {Function}  props.onDeleteChannel   - Called with a channel object when the delete button is clicked.
 * @param {Function}  props.onOpenSettings    - Called with a channel object to open the settings modal.
 * @param {Object[]}  props.users             - Full user list fetched from /api/auth/users.
 * @param {Function}  props.onCreateChannel   - (name, description, is_private) → Promise; creates a channel via API.
 * @param {Object[]}  props.conversations     - DM conversation summaries from useConversations().
 * @param {Object}    props.activeDm          - Currently selected DM partner (null in channel mode).
 * @param {Function}  props.onSelectDm        - Called with a user object when a DM row is clicked.
 * @param {Object}    [props.unreadChannels={}] - Map of channelId → unread message count.
 * @param {Function}  props.onViewProfile     - Called with a userId to open the user profile modal.
 * @param {Function}  props.onSearchUsers     - Called (no arguments) to open the user search modal.
 * @returns {JSX.Element}
 */
export default function Sidebar({
  channels, activeChannel, onSelectChannel,
  users, onCreateChannel, onDeleteChannel, onOpenSettings,
  conversations, activeDm, onSelectDm,
  unreadChannels = {},
  onViewProfile, onSearchUsers,
  open, onClose,
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
  const { isConnected, onlineUserIds, userStatuses = {}, setStatus } = useSocket();

  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const myStatus = userStatuses[user?.id] || "online";

  // New-channel form visibility and field state
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);

  // Section collapse state
  const [showUsers, setShowUsers] = useState(true);
  const [showDms, setShowDms]     = useState(true);

  // Track which channel row is hovered to show action buttons
  const [hoveredChannel, setHoveredChannel] = useState<number | null>(null);

  /**
   * Returns true when the current user can access the channel's settings modal.
   * Admins, owners, and managers can manage.
   *
   * @param {Object} ch - Channel object.
   * @returns {boolean}
   */
  const canManageChannel = (ch: Channel) =>
    user?.role === "admin" || ch.created_by === user?.id ||
    ch.user_role === "owner" || ch.user_role === "manager";

  /**
   * Returns true when the current user can delete the channel.
   * Only admins and owners/creators can delete.
   *
   * @param {Object} ch - Channel object.
   * @returns {boolean}
   */
  const isChannelOwnerOrAdmin = (ch: Channel) =>
    user?.role === "admin" || ch.created_by === user?.id || ch.user_role === "owner";

  /**
   * Submits the new-channel form, calls onCreateChannel, and resets the form.
   *
   * @param {React.FormEvent} e
   */
  async function handleCreateChannel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    await onCreateChannel(newChannelName, newChannelDesc, newChannelPrivate ? 1 : 0);
    setNewChannelName("");
    setNewChannelDesc("");
    setNewChannelPrivate(false);
    setShowNewChannel(false);
  }

  // Sum up all DM unread counts to show a total badge on the section header
  const totalUnread = conversations?.reduce((sum, c) => sum + (c.unread_count || 0), 0) || 0;

  return (
    <div style={s.sidebar} className={`sidebar${open ? " open" : ""}`}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.workspaceName}>💬 Messenger</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={onSearchUsers}
            title="Search users"
            style={{ background: "transparent", border: "none", color: "#5c6068", fontSize: "14px", cursor: "pointer", padding: "2px" }}
          >
            👥
          </button>
          {/* Green dot = connected, red dot = disconnected */}
          <div style={s.statusDot(isConnected)} title={isConnected ? "Connected" : "Disconnected"} />
          {/* Close button — only visible on mobile via CSS */}
          <button className="sidebar-close-btn" onClick={onClose} title="Close menu" aria-label="Close menu">
            ✕
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={s.scrollArea}>

        {/* Channels section */}
        <div style={s.section}>
          {/* Clicking the header toggles the new-channel form */}
          <div style={s.sectionHeader} onClick={() => setShowNewChannel((v) => !v)}>
            <span style={s.sectionTitle}>Channels</span>
            <span style={s.addBtn} title="New channel">+</span>
          </div>

          {showNewChannel && (
            <form style={s.newChannelForm} onSubmit={handleCreateChannel}>
              <input
                style={s.newChannelInput}
                value={newChannelName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewChannelName(e.target.value)}
                placeholder="new-channel"
                autoFocus
              />
              <input
                style={s.newChannelInput}
                value={newChannelDesc}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewChannelDesc(e.target.value)}
                placeholder="Description (optional)"
              />
              <label style={s.privateToggle}>
                <input
                  type="checkbox"
                  checked={newChannelPrivate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewChannelPrivate(e.target.checked)}
                  style={{ accentColor: "#5865f2" }}
                />
                🔒 Private channel
              </label>
              <div style={s.newChannelRow}>
                <button type="submit" style={{ ...s.newChannelSubmit, flex: 1 }}>Add</button>
                <button
                  type="button"
                  title="Cancel"
                  style={{ ...s.newChannelSubmit, background: "#2d2d3f" }}
                  onClick={() => setShowNewChannel(false)}
                >✕</button>
              </div>
            </form>
          )}

          {channels.map((ch) => {
            const unread    = unreadChannels[ch.id] || 0;
            const isHovered = hoveredChannel === ch.id;
            const canDel    = isChannelOwnerOrAdmin(ch);
            const canSett   = canManageChannel(ch);
            return (
              <div
                key={ch.id}
                style={s.channelItem(activeChannel?.id === ch.id && !activeDm)}
                onClick={() => onSelectChannel(ch)}
                title={ch.description}
                onMouseEnter={() => setHoveredChannel(ch.id)}
                onMouseLeave={() => setHoveredChannel(null)}
              >
                <span style={{ fontSize: "12px", opacity: 0.6, flexShrink: 0 }}>
                  {ch.is_private ? "🔒" : "#"}
                </span>
                {/* Bold the channel name when there are unread messages */}
                <span style={{
                  ...s.channelName,
                  fontWeight: unread > 0 ? 700 : undefined,
                  color: unread > 0 ? "#f2f3f5" : undefined,
                }}>
                  {ch.name}
                </span>
                {/* Hide the unread badge while hovering to make room for action buttons */}
                {unread > 0 && !isHovered && (
                  <span style={s.unreadBadge}>{unread > 99 ? "99+" : unread}</span>
                )}
                {isHovered && (
                  <div style={{ display: "flex", gap: "2px" }}>
                    {canSett && (
                      <button
                        style={{ background: "transparent", border: "none", color: "#949ba4", fontSize: "13px", cursor: "pointer", padding: "0 3px" }}
                        title="Settings"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onOpenSettings?.(ch); }}
                      >
                        ⚙️
                      </button>
                    )}
                    {canDel && (
                      <button
                        style={{ background: "transparent", border: "none", color: "#f23f42", fontSize: "13px", cursor: "pointer", padding: "0 2px" }}
                        title="Delete channel"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDeleteChannel?.(ch); }}
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Direct messages section */}
        <div style={s.section}>
          <div style={s.sectionHeader} onClick={() => setShowDms((v) => !v)}>
            <span style={s.sectionTitle}>
              {/* Show total DM unread count in the section header */}
              Direct{totalUnread > 0 && <span style={{ ...s.unreadBadge, display: "inline-flex", marginLeft: "6px" }}>{totalUnread}</span>}
            </span>
            <span style={{ fontSize: "11px", color: "#5c6068" }}>{showDms ? "▲" : "▼"}</span>
          </div>

          {showDms && users
            .filter((u) => u.id !== user?.id) // Exclude the current user from the DM list
            .map((u) => {
              const online   = onlineUserIds.includes(u.id);
              const dotColor = statusColor(u.id, onlineUserIds, userStatuses);
              const convo    = conversations?.find((c) => c.partner_id === u.id);
              const unread   = convo?.unread_count || 0;
              const isActive = activeDm?.id === u.id;
              const statusLabel = online ? STATUS_LABELS[userStatuses[u.id] || "online"] : "Offline";

              return (
                <div
                  key={u.id}
                  style={s.dmItem(isActive)}
                  onClick={() => onSelectDm(u)}
                >
                  <div style={s.avatarWrap(online)}>
                    <span style={s.avatar}>{u.avatar || "👤"}</span>
                    <div style={s.onlineDot(dotColor)} title={statusLabel} />
                  </div>
                  <span style={{ color: isActive ? "#f2f3f5" : online ? "#dbdee1" : "#5c6068", fontSize: "13px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.username}{u.role === "admin" && <span title="Admin" style={{ marginLeft: "4px" }}>👑</span>}
                  </span>
                  {unread > 0 && (
                    <span style={s.unreadBadge}>{unread}</span>
                  )}
                </div>
              );
            })
          }
        </div>

        {/* Online users section */}
        <div style={s.section}>
          <div style={s.sectionHeader} onClick={() => setShowUsers((v) => !v)}>
            <span style={s.sectionTitle}>
              Online ({onlineUserIds.length})
            </span>
            <span style={{ fontSize: "11px", color: "#5c6068" }}>{showUsers ? "▲" : "▼"}</span>
          </div>

          {showUsers && users.map((u) => {
            const online   = onlineUserIds.includes(u.id);
            const dotColor = statusColor(u.id, onlineUserIds, userStatuses);
            const statusLabel = online ? STATUS_LABELS[userStatuses[u.id] || "online"] : "Offline";
            return (
              <div
                key={u.id}
                style={{ ...s.userItem, cursor: "pointer" }}
                onClick={() => onViewProfile?.(u.id)}
                title="View profile"
              >
                <div style={s.avatarWrap(online)}>
                  <span style={s.avatar}>{u.avatar || "👤"}</span>
                  <div style={s.onlineDot(dotColor)} title={statusLabel} />
                </div>
                <span style={{ color: online ? "#f2f3f5" : "#5c6068", fontSize: "13px", flex: 1 }}>
                  {u.username}{u.role === "admin" && <span title="Admin" style={{ marginLeft: "4px" }}>👑</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer: current user info and logout button */}
      <div style={{ ...s.footer, flexDirection: "column", alignItems: "stretch", gap: "8px" }}>
        {showStatusPicker && (
          <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
            {(["online", "away", "dnd"] as UserStatus[]).map((st) => (
              <button
                key={st}
                onClick={() => { setStatus(st); setShowStatusPicker(false); }}
                title={STATUS_LABELS[st]}
                style={{
                  flex: 1,
                  padding: "5px 4px",
                  background: myStatus === st ? STATUS_COLORS[st] + "33" : "transparent",
                  border: `1px solid ${myStatus === st ? STATUS_COLORS[st] : "#2d2d3f"}`,
                  borderRadius: "6px",
                  color: STATUS_COLORS[st],
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "4px",
                }}
              >
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: STATUS_COLORS[st], flexShrink: 0, display: "inline-block" }} />
                {STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", position: "relative", flexShrink: 0 }}
            onClick={() => setShowStatusPicker((v) => !v)}
            title={`Status: ${STATUS_LABELS[myStatus]}`}
          >
            <span style={{ fontSize: "24px" }}>{user?.avatar || "👤"}</span>
            <span style={{
              position: "absolute", bottom: -1, right: -1,
              width: "10px", height: "10px", borderRadius: "50%",
              background: STATUS_COLORS[myStatus],
              border: "2px solid #1e1e2e",
              display: "block",
            }} />
          </button>
          <div style={s.footerUser}>
            <div style={s.footerUsername}>
              {user?.username}
              {user?.is_guest && <span style={{ fontSize: "10px", color: "#f0a500", marginLeft: "6px" }}>guest</span>}
            </div>
            <div style={s.footerEmail}>{user?.email?.endsWith("@guest.local") ? "Temporary account" : user?.email}</div>
          </div>
          {user?.role === "admin" && (
            <button
              style={{ ...s.logoutBtn, color: "#f0a500" }}
              onClick={() => navigateTo("/admin")}
              title="Admin dashboard"
              data-testid="admin-link"
            >
              👑
            </button>
          )}
          <button style={s.logoutBtn} onClick={logout} title="Sign out">⏻</button>
        </div>
      </div>
    </div>
  );
}
