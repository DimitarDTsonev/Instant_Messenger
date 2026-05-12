import { useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import type { Channel, User } from "../types";
import { s } from "./sidebarStyles";

type Props = {
  channels:         Channel[];
  activeChannel?:   Channel | null;
  activeDm?:        User | null;
  onSelectChannel:  (ch: Channel) => void;
  onCreateChannel:  (name: string, desc: string, isPrivate: 0 | 1) => Promise<unknown>;
  onDeleteChannel?: (ch: Channel) => void;
  onOpenSettings?:  (ch: Channel) => void;
  unreadChannels?:  Record<number, number>;
  currentUser?:     User | null;
};

export default function SidebarChannelList({ channels, activeChannel, activeDm, onSelectChannel, onCreateChannel, onDeleteChannel, onOpenSettings, unreadChannels = {}, currentUser }: Props) {
  const [showForm,   setShowForm]   = useState(false);
  const [name,       setName]       = useState("");
  const [desc,       setDesc]       = useState("");
  const [isPrivate,  setIsPrivate]  = useState(false);
  const [hoveredCh,  setHoveredCh]  = useState<number | null>(null);

  const canManage = (ch: Channel) =>
    currentUser?.role === "admin" || ch.created_by === currentUser?.id || ch.user_role === "owner" || ch.user_role === "manager";

  const isOwnerOrAdmin = (ch: Channel) =>
    currentUser?.role === "admin" || ch.created_by === currentUser?.id || ch.user_role === "owner";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreateChannel(name, desc, isPrivate ? 1 : 0);
    setName(""); setDesc(""); setIsPrivate(false); setShowForm(false);
  }

  return (
    <div style={s.section}>
      <div style={s.sectionHeader} onClick={() => setShowForm((v) => !v)}>
        <span style={s.sectionTitle}>Channels</span>
        <span style={s.addBtn} title="New channel">+</span>
      </div>

      {showForm && (
        <form style={s.newChannelForm} onSubmit={handleSubmit}>
          <input style={s.newChannelInput} value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="new-channel" autoFocus />
          <input style={s.newChannelInput} value={desc} onChange={(e: ChangeEvent<HTMLInputElement>) => setDesc(e.target.value)} placeholder="Description (optional)" />
          <label style={s.privateToggle}>
            <input type="checkbox" checked={isPrivate} onChange={(e: ChangeEvent<HTMLInputElement>) => setIsPrivate(e.target.checked)} style={{ accentColor: "#5865f2" }} />
            🔒 Private channel
          </label>
          <div style={s.newChannelRow}>
            <button type="submit" style={{ ...s.newChannelSubmit, flex: 1 }}>Add</button>
            <button type="button" style={{ ...s.newChannelSubmit, background: "#2d2d3f" }} onClick={() => setShowForm(false)}>✕</button>
          </div>
        </form>
      )}

      {channels.map((ch) => {
        const unread    = unreadChannels[ch.id] || 0;
        const isHovered = hoveredCh === ch.id;
        return (
          <div
            key={ch.id}
            style={s.channelItem(activeChannel?.id === ch.id && !activeDm)}
            onClick={() => onSelectChannel(ch)}
            title={ch.description}
            onMouseEnter={() => setHoveredCh(ch.id)}
            onMouseLeave={() => setHoveredCh(null)}
          >
            <span style={{ fontSize: "12px", opacity: 0.6, flexShrink: 0 }}>{ch.is_private ? "🔒" : "#"}</span>
            <span style={{ ...s.channelName, fontWeight: unread > 0 ? 700 : undefined, color: unread > 0 ? "#f2f3f5" : undefined }}>{ch.name}</span>
            {unread > 0 && !isHovered && <span style={s.unreadBadge}>{unread > 99 ? "99+" : unread}</span>}
            {isHovered && (
              <div style={{ display: "flex", gap: "2px" }}>
                {canManage(ch) && (
                  <button style={{ background: "transparent", border: "none", color: "#949ba4", fontSize: "13px", cursor: "pointer", padding: "0 3px" }} title="Settings"
                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onOpenSettings?.(ch); }}>⚙️</button>
                )}
                {isOwnerOrAdmin(ch) && (
                  <button style={{ background: "transparent", border: "none", color: "#f23f42", fontSize: "13px", cursor: "pointer", padding: "0 2px" }} title="Delete channel"
                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDeleteChannel?.(ch); }}>🗑️</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}