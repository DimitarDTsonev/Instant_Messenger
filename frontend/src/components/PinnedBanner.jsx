/**
 * @fileoverview PinnedBanner — Pinned-message strip rendered above the chat area
 *
 * Displays the currently pinned message(s) for a channel in a compact horizontal bar.
 * When there are multiple pinned messages, forward/back navigation arrows are shown
 * along with a count badge (e.g. "2/4"). The entire bar can be collapsed to a single
 * line by clicking the toggle arrow on the right edge.
 *
 * Unpin permission is granted to:
 *   - Global admins (user.role === "admin")
 *   - The user who created the channel (user.id === channelCreatedBy)
 *
 * @module components/PinnedBanner
 * @connects AuthContext    — reads the current user for permission check
 * @connects SocketContext  — exposes `deleteMessage` (imported but accessed via `onUnpin` prop)
 */

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

/**
 * Inline style map for the pinned banner.
 *
 * @type {Object}
 * @property {Object} banner     - Horizontal flex bar fixed below the channel header
 * @property {Object} icon       - 📌 pin emoji
 * @property {Object} label      - "Pinned" label in muted grey
 * @property {Object} content    - Truncated message preview (author + text or "[image]")
 * @property {Object} author     - Author name in indigo
 * @property {Object} unpinBtn   - ✕ button to remove the current pin (permission-gated)
 * @property {Object} collapse   - Small arrow button to collapse/expand the banner
 */
const s = {
  banner: {
    background: "#1e1e2e",
    borderBottom: "1px solid #2d2d3f",
    padding: "6px 20px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
    flexShrink: 0,
  },
  icon: { fontSize: "14px", flexShrink: 0 },
  label: { color: "#5c6068", fontWeight: 600, flexShrink: 0 },
  content: {
    flex: 1,
    color: "#949ba4",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  author: { color: "#7289da", fontWeight: 600, marginRight: "4px" },
  unpinBtn: {
    background: "transparent",
    border: "none",
    color: "#5c6068",
    fontSize: "12px",
    cursor: "pointer",
    padding: "3px 8px",
    borderRadius: "4px",
    flexShrink: 0,
  },
  collapse: {
    background: "transparent",
    border: "none",
    color: "#5c6068",
    fontSize: "12px",
    cursor: "pointer",
    padding: "3px 6px",
    flexShrink: 0,
  },
};

/**
 * PinnedBanner component — shows pinned message(s) above the message list.
 *
 * Returns `null` when `pinnedMessages` is empty so no space is consumed.
 * Multi-pin navigation is rendered inline when `pinnedMessages.length > 1`.
 *
 * @component
 * @param {Object}   props
 * @param {Array<{
 *   id: number,
 *   username: string,
 *   content: string,
 *   file_url?: string
 * }>}               props.pinnedMessages    - Ordered array of pinned message objects
 * @param {number}   props.channelCreatedBy  - User ID of the channel's creator; used for unpin permission
 * @param {Function} props.onUnpin           - Called with the message `id` when the user unpins
 * @returns {JSX.Element|null} The banner bar, or null when there are no pins
 *
 * @example
 * <PinnedBanner
 *   pinnedMessages={pinnedMessages}
 *   channelCreatedBy={activeChannel.created_by}
 *   onUnpin={handleUnpin}
 * />
 */
export default function PinnedBanner({ pinnedMessages, channelCreatedBy, onUnpin }) {
  /** @type {{ id: number, role: string }} */
  const { user } = useAuth();
  const { deleteMessage } = useSocket();

  /** @type {[boolean, Function]} Whether the banner is collapsed to just the icon+label */
  const [collapsed, setCollapsed] = useState(false);

  /** @type {[number, Function]} Zero-based index of the currently displayed pin */
  const [idx, setIdx] = useState(0);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  /** The pin currently displayed in the banner */
  const pin = pinnedMessages[idx] || pinnedMessages[0];

  /** Only admins and the channel creator may unpin messages */
  const canUnpin = user?.role === "admin" || user?.id === channelCreatedBy;

  /**
   * Calls the parent `onUnpin` handler with the current pin's message ID.
   */
  function handleUnpin() {
    onUnpin(pin.id);
  }

  return (
    <div style={s.banner}>
      <span style={s.icon}>📌</span>
      <span style={s.label}>Pinned</span>

      {!collapsed && (
        <span style={s.content}>
          <span style={s.author}>{pin.username}:</span>
          {pin.file_url
            ? "[image]"
            : (pin.content || "").slice(0, 120) + (pin.content?.length > 120 ? "…" : "")
          }
        </span>
      )}

      {/* Multi-pin navigation: shows "current/total" + prev/next arrows */}
      {pinnedMessages.length > 1 && !collapsed && (
        <span style={{ ...s.collapse, color: "#7289da" }}>
          {idx + 1}/{pinnedMessages.length}
          {idx < pinnedMessages.length - 1
            ? <button style={s.collapse} onClick={() => setIdx((i) => i + 1)}>▶</button>
            : <button style={s.collapse} onClick={() => setIdx(0)}>◀</button>
          }
        </span>
      )}

      {/* Unpin button — only visible to admins and the channel creator */}
      {canUnpin && !collapsed && (
        <button style={s.unpinBtn} onClick={handleUnpin} title="Unpin">
          ✕
        </button>
      )}

      {/* Collapse / expand toggle */}
      <button style={s.collapse} onClick={() => setCollapsed((v) => !v)}>
        {collapsed ? "▼" : "▲"}
      </button>
    </div>
  );
}
