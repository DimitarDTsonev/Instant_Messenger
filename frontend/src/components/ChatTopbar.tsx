/**
 * Chat top bar — the header strip displayed above the message area.
 *
 * Shows context-sensitive content based on the current view:
 *  - Channel mode: lock/hash icon + channel name + optional description.
 *  - DM mode: partner avatar + username + "DM" badge.
 *  - Loading: muted "Loading..." placeholder.
 *
 * Right-side controls:
 *  - Settings button (gear icon) — only shown when `canOpenSettings` is true.
 *  - Search button — always visible.
 * Left side:
 *  - Hamburger button — visible on mobile only (CSS class `hamburger-btn`);
 *    triggers `onSidebarOpen` to reveal the sidebar drawer.
 *
 * Used by: ChatPage.tsx.
 */

import type { Channel, User } from "../types";
import { s } from "../pages/chatPageStyles";
import Icon from "./Icons";

type Props = {
  activeChannel:    Channel | null;
  isDmMode:         boolean;
  activeDm:         User | null;
  canOpenSettings:  boolean;
  onSettings:       () => void;
  onSearch:         () => void;
  onSidebarOpen:    () => void;
};

/**
 * @param activeChannel   - Currently active channel, or `null` in DM mode.
 * @param isDmMode        - `true` when the user has a DM conversation open.
 * @param activeDm        - The DM partner user, or `null` when in channel mode.
 * @param canOpenSettings - Whether to show the channel settings button.
 * @param onSettings      - Opens the channel settings modal.
 * @param onSearch        - Opens the search modal.
 * @param onSidebarOpen   - Reveals the mobile sidebar drawer.
 */
export default function ChatTopbar({ activeChannel, isDmMode, activeDm, canOpenSettings, onSettings, onSearch, onSidebarOpen }: Props) {
  return (
    <div style={s.topbar} className="topbar-mobile">
      <button className="hamburger-btn" onClick={onSidebarOpen} title="Menu" aria-label="Open menu">
        <Icon name="menu" size={18} />
      </button>

      {activeChannel && !isDmMode ? (
        <>
          <div style={s.topbarTitle}>
            <span style={{ color: "#5c6068", display: "inline-flex" }}>
              {activeChannel.is_private ? <Icon name="lock" size={15} /> : <Icon name="hash" size={15} />}
            </span>
            {activeChannel.name}
          </div>
          {activeChannel.description && (
            <>
              <span style={{ color: "#2d2d3f" }}>|</span>
              <span style={s.topbarDesc} className="topbar-desc">{activeChannel.description}</span>
            </>
          )}
        </>
      ) : isDmMode && activeDm ? (
        <div style={s.topbarTitle}>
          <span>{activeDm.avatar || activeDm.username.slice(0, 2).toUpperCase()}</span>
          <span>{activeDm.username}</span>
          <span style={s.dmBadge}>DM</span>
        </div>
      ) : (
        <span style={{ color: "#5c6068", fontSize: "14px" }}>Loading...</span>
      )}

      <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
        {canOpenSettings && (
          <button style={s.settingsBtn} onClick={onSettings} title="Channel settings" aria-label="Channel settings">
            <Icon name="settings" size={16} />
          </button>
        )}
        <button style={s.searchBtn} onClick={onSearch} title="Search" aria-label="Search">
          <Icon name="search" size={16} />
          <span className="search-btn-label">Search</span>
        </button>
      </div>
    </div>
  );
}
