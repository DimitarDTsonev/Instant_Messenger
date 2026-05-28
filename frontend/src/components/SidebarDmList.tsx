/**
 * DM list section in the sidebar — shows all users (excluding self) with their
 * unread count, presence status indicator, and admin badge.
 *
 * The section can be collapsed/expanded via `onToggle`. A total unread counter
 * appears next to the "Direct" heading when collapsed.
 *
 * Presence rendering:
 *  - `dotColor` maps (onlineUserIds + userStatuses) to an RGBA colour string.
 *  - Online users show in primary text colour; offline users are muted.
 *
 * Used by: Sidebar.tsx.
 */

import type { Conversation, User, UserStatus } from "../types";
import { avatarLabel } from "../utils/avatar";
import Icon from "./Icons";
import { s } from "./sidebarStyles";

const STATUS_COLORS = { online: "#23a55a", away: "#f0a500", dnd: "#f23f42", offline: "#5c6068" } as const;
const STATUS_LABELS = { online: "Online", away: "Away", dnd: "Do not disturb" } as const;

type Props = {
  users:          User[];
  currentUserId?: number;
  activeDm?:      User | null;
  onSelectDm:     (u: User) => void;
  conversations?: Conversation[];
  onlineUserIds:  number[];
  userStatuses?:  Record<number, UserStatus>;
  visible:        boolean;
  totalUnread:    number;
  onToggle:       () => void;
};

export default function SidebarDmList({ users, currentUserId, activeDm, onSelectDm, conversations, onlineUserIds, userStatuses = {}, visible, totalUnread, onToggle }: Props) {
  function dotColor(userId: number) {
    if (!onlineUserIds.includes(userId)) return STATUS_COLORS.offline;
    return STATUS_COLORS[userStatuses[userId] || "online"] || STATUS_COLORS.online;
  }

  return (
    <div style={s.section}>
      <div style={s.sectionHeader} onClick={onToggle}>
        <span style={s.sectionTitle}>
          Direct{totalUnread > 0 && <span style={{ ...s.unreadBadge, display: "inline-flex", marginLeft: "6px" }}>{totalUnread}</span>}
        </span>
        <span style={{ color: "var(--col-text-muted)", display: "inline-flex" }}><Icon name={visible ? "chevronUp" : "chevronDown"} size={14} /></span>
      </div>

      {visible && users.filter((u) => u.id !== currentUserId).map((u) => {
        const online     = onlineUserIds.includes(u.id);
        const convo      = conversations?.find((c) => c.partner_id === u.id);
        const unread     = convo?.unread_count || 0;
        const isActive   = activeDm?.id === u.id;
        const statusLabel = online ? STATUS_LABELS[userStatuses[u.id] || "online"] : "Offline";

        return (
          <div key={u.id} style={s.dmItem(isActive)} onClick={() => onSelectDm(u)}>
            <div style={s.avatarWrap}>
              <span style={s.avatar}>{avatarLabel(u)}</span>
              <div style={s.onlineDot(dotColor(u.id))} title={statusLabel} />
            </div>
            <span style={{ color: isActive ? "var(--col-text-primary)" : online ? "var(--col-text-secondary)" : "var(--col-text-muted)", fontSize: "13px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.username}
              {u.role === "admin" && (
                <span title="Admin" style={{ marginLeft: "4px", color: "#faa61a", display: "inline-flex", verticalAlign: "text-bottom" }}>
                  <Icon name="shield" size={12} />
                </span>
              )}
            </span>
            {unread > 0 && <span style={s.unreadBadge}>{unread}</span>}
          </div>
        );
      })}
    </div>
  );
}
