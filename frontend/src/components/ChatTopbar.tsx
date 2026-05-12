import type { Channel, User } from "../types";
import { s } from "../pages/chatPageStyles";

type Props = {
  activeChannel:    Channel | null;
  isDmMode:         boolean;
  activeDm:         User | null;
  canOpenSettings:  boolean;
  onSettings:       () => void;
  onSearch:         () => void;
  onSidebarOpen:    () => void;
};

export default function ChatTopbar({ activeChannel, isDmMode, activeDm, canOpenSettings, onSettings, onSearch, onSidebarOpen }: Props) {
  return (
    <div style={s.topbar} className="topbar-mobile">
      <button className="hamburger-btn" onClick={onSidebarOpen} title="Menu">☰</button>

      {activeChannel && !isDmMode ? (
        <>
          <div style={s.topbarTitle}>
            <span style={{ color: "#5c6068" }}>{activeChannel.is_private ? "🔒" : "#"}</span>
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
          <span>{activeDm.avatar || "👤"}</span>
          <span>{activeDm.username}</span>
          <span style={s.dmBadge}>💬 DM</span>
        </div>
      ) : (
        <span style={{ color: "#5c6068", fontSize: "14px" }}>Loading...</span>
      )}

      <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
        {canOpenSettings && (
          <button style={s.settingsBtn} onClick={onSettings} title="Channel settings">⚙️</button>
        )}
        <button style={s.searchBtn} onClick={onSearch} title="Ctrl+F">
          🔍 <span className="search-btn-label">Search</span>
        </button>
      </div>
    </div>
  );
}