/**
 * Channel settings modal — tabbed settings dialog for managing a channel.
 *
 * Tabs:
 *  - General     — Edit channel name, description, and private flag. Always visible.
 *  - Members     — Add, remove, and change roles of channel members. Always visible.
 *  - Permissions — Per-role permission overrides. Visible only to the channel owner.
 *  - Invites     — Generate and manage invite links. Hidden for members without `can_invite`.
 *
 * The visible tabs are computed from `myRole` and `channel.can_invite` so that
 * lower-privileged users only see what they are allowed to manage.
 *
 * Dismiss: clicking the overlay backdrop or the close (×) button.
 *
 * Used by: ChatPage.tsx (triggered by ChatTopbar settings button or SidebarChannelList gear).
 */

import { useState } from "react";
import type { MouseEvent } from "react";
import { useAuth } from "../context/AuthContext";
import type { Channel, ChannelRole } from "../types";
import { GeneralTab, MembersTab, PermissionsTab, InvitesTab } from "./ChannelSettingsTabs";
import Icon from "./Icons";
import { s } from "./channelSettingsStyles";

type SettingsTab = "general" | "members" | "permissions" | "invites";

export default function ChannelSettingsModal({
  channel, onClose, onChannelUpdated,
}: {
  channel: Channel;
  onClose: () => void;
  onChannelUpdated?: (channel: Channel) => void;
}) {
  const { user } = useAuth();
  const myRole   = channel.user_role || "member";
  const [tab, setTab] = useState<SettingsTab>("general");

  const allTabs: Array<{ id: SettingsTab; label: string; hidden?: boolean }> = [
    { id: "general",     label: "General" },
    { id: "members",     label: "Members" },
    { id: "permissions", label: "Permissions", hidden: myRole !== "owner" },
    { id: "invites",     label: "Invites",      hidden: myRole === "member" && !channel.can_invite },
  ];
  const tabs = allTabs.filter((t) => !t.hidden);

  function handleUpdated(updated: Channel) { onChannelUpdated?.(updated); }

  return (
    <div style={s.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <div style={s.title}>
            <span
              title={channel.is_private ? "Private channel" : "Public channel"}
              style={{ display: "inline-flex", verticalAlign: "middle", marginRight: "6px" }}
            >
              {channel.is_private ? <Icon name="lock" size={15} /> : <Icon name="hash" size={15} />}
            </span>
            {channel.name} settings
            <span style={{ marginLeft: "8px", fontSize: "12px", fontWeight: 400, color: "#5c6068" }}>({myRole})</span>
          </div>
          <button style={s.closeBtn} onClick={onClose} title="Close" aria-label="Close settings">
            <Icon name="x" size={17} />
          </button>
        </div>

        <div style={s.tabs}>
          {tabs.map((t) => (
            <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        <div style={s.body}>
          {tab === "general"     && <GeneralTab     channel={channel} myRole={myRole as ChannelRole} onChannelUpdated={handleUpdated} />}
          {tab === "members"     && <MembersTab     channelId={channel.id} myRole={myRole} currentUserId={user?.id} />}
          {tab === "permissions" && <PermissionsTab channelId={channel.id} myRole={myRole} />}
          {tab === "invites"     && <InvitesTab     channelId={channel.id} />}
        </div>
      </div>
    </div>
  );
}
