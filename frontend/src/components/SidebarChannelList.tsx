/**
 * Channel list section in the sidebar.
 *
 * Renders the "Channels" section header (clicking it toggles the new-channel form),
 * a new-channel creation form (name, description, private toggle), and the list
 * of channel items.
 *
 * Each channel item:
 *  - Lock or hash icon (private vs public).
 *  - Channel name (bold when unread messages exist).
 *  - Unread badge (shown when not hovering).
 *  - On hover: settings and delete buttons (conditionally visible by role).
 *
 * Permission helpers:
 *  - `canManage` — true for admins, channel creators, owners, and managers.
 *  - `isOwnerOrAdmin` — true only for admins, creators, and owners (can delete).
 *
 * Used by: Sidebar.tsx.
 */

import { useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import type { Channel, User } from "../types";
import Icon from "./Icons";
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
        <span style={s.addBtn} title="New channel"><Icon name="plus" size={15} /></span>
      </div>

      {showForm && (
        <form style={s.newChannelForm} onSubmit={handleSubmit}>
          <input style={s.newChannelInput} value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="new-channel" autoFocus />
          <input style={s.newChannelInput} value={desc} onChange={(e: ChangeEvent<HTMLInputElement>) => setDesc(e.target.value)} placeholder="Description (optional)" />
          <label style={s.privateToggle}>
            <input type="checkbox" checked={isPrivate} onChange={(e: ChangeEvent<HTMLInputElement>) => setIsPrivate(e.target.checked)} style={{ accentColor: "#5865f2" }} />
            Private channel
          </label>
          <div style={s.newChannelRow}>
            <button type="submit" style={{ ...s.newChannelSubmit, flex: 1 }}>Add</button>
            <button type="button" aria-label="Cancel new channel" title="Cancel" style={{ ...s.newChannelSubmit, background: "#2d2d3f", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowForm(false)}>
              <Icon name="x" size={16} />
            </button>
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
            <span
              title={ch.is_private ? "Private channel" : "Public channel"}
              style={{ opacity: 0.6, flexShrink: 0, display: "inline-flex" }}
            >
              {ch.is_private ? <Icon name="lock" size={13} /> : <Icon name="hash" size={13} />}
            </span>
            <span style={{ ...s.channelName, fontWeight: unread > 0 ? 700 : undefined, color: unread > 0 ? "var(--col-text-primary)" : undefined }}>{ch.name}</span>
            {unread > 0 && !isHovered && <span style={s.unreadBadge}>{unread > 99 ? "99+" : unread}</span>}
            {isHovered && (
              <div style={{ display: "flex", gap: "2px" }}>
                {canManage(ch) && (
                  <button style={s.iconButton} title="Settings" aria-label="Settings"
                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onOpenSettings?.(ch); }}><Icon name="settings" size={15} /></button>
                )}
                {isOwnerOrAdmin(ch) && (
                  <button style={{ ...s.iconButton, color: "#f23f42" }} title="Delete channel" aria-label="Delete channel"
                    onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDeleteChannel?.(ch); }}><Icon name="trash" size={15} /></button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
