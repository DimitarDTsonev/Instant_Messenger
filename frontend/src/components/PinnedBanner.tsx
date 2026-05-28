/**
 * Pinned message banner — displayed between the channel topbar and the message
 * list when one or more messages are pinned.
 *
 * Features:
 *  - Shows the most recently pinned message's author and text (truncated at 120 chars).
 *  - Supports multiple pinned messages with a counter and prev/next navigation.
 *  - Collapse/expand toggle to reduce visual clutter.
 *  - Unpin button visible only to admins and the channel creator.
 *
 * Used by: ChatPage.tsx (rendered above ChatArea when `pinnedMessages.length > 0`).
 */

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { Message } from "../types";
import Icon from "./Icons";

const s = {
  banner: {
    background: "var(--col-bg-elevated)",
    borderBottom: "1px solid var(--col-border)",
    padding: "6px 20px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
    flexShrink: 0,
  },
  icon: { fontSize: "14px", flexShrink: 0 },
  label: { color: "var(--col-text-muted)", fontWeight: 600, flexShrink: 0 },
  content: {
    flex: 1,
    color: "var(--col-text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  author: { color: "var(--col-link)", fontWeight: 600, marginRight: "4px" },
  unpinBtn: {
    background: "transparent",
    border: "none",
    color: "var(--col-text-muted)",
    fontSize: "12px",
    cursor: "pointer",
    width: "26px",
    height: "26px",
    padding: 0,
    borderRadius: "4px",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  collapse: {
    background: "transparent",
    border: "none",
    color: "var(--col-text-muted)",
    fontSize: "12px",
    cursor: "pointer",
    padding: "3px 6px",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
} satisfies AppStyleMap;

/**
 * Renders the pinned message banner.
 * Returns `null` when there are no pinned messages.
 *
 * @param pinnedMessages   - Array of pinned `Message` objects (newest first).
 * @param channelCreatedBy - User ID of the channel creator (used for unpin permission check).
 * @param onUnpin          - Called with the message ID when the unpin button is clicked.
 */
export default function PinnedBanner({
  pinnedMessages,
  channelCreatedBy,
  onUnpin,
}: {
  pinnedMessages: Message[];
  channelCreatedBy?: number;
  onUnpin: (messageId: number) => void;
}) {
  const { user } = useAuth();
  /** Whether the banner content is hidden (only the "Pinned" label remains). */
  const [collapsed, setCollapsed] = useState(false);
  /** Index into `pinnedMessages` of the currently displayed pin. */
  const [idx, setIdx] = useState(0);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  const pin = pinnedMessages[idx] || pinnedMessages[0];
  /** Only admins and the channel creator can unpin messages. */
  const canUnpin = user?.role === "admin" || user?.id === channelCreatedBy;

  function handleUnpin() {
    onUnpin(pin.id);
  }

  return (
    <div style={s.banner}>
      <span style={s.label}>Pinned</span>

      {!collapsed && (
        <span style={s.content}>
          <span style={s.author}>{pin.username}:</span>
          {/* Show "[image]" placeholder for file-only messages */}
          {pin.file_url
            ? "[image]"
            : (pin.content || "").slice(0, 120) + (pin.content?.length > 120 ? "..." : "")
          }
        </span>
      )}

      {/* Multi-pin navigation: shows "current/total" + prev/next arrows */}
      {pinnedMessages.length > 1 && !collapsed && (
        <span style={{ ...s.collapse, color: "var(--col-link)" }}>
          {idx + 1}/{pinnedMessages.length}
          {idx < pinnedMessages.length - 1
            ? <button style={s.collapse} onClick={() => setIdx((i) => i + 1)} title="Next pinned message" aria-label="Next pinned message"><Icon name="chevronRight" size={15} /></button>
            : <button style={s.collapse} onClick={() => setIdx(0)} title="First pinned message" aria-label="First pinned message"><Icon name="chevronLeft" size={15} /></button>
          }
        </span>
      )}

      {/* Unpin button — only visible to admins and the channel creator */}
      {canUnpin && !collapsed && (
        <button style={s.unpinBtn} onClick={handleUnpin} title="Unpin">
          <Icon name="x" size={15} />
        </button>
      )}

      {/* Collapse / expand toggle */}
      <button
        style={s.collapse}
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "Expand pinned message" : "Collapse pinned message"}
        aria-label={collapsed ? "Expand pinned message" : "Collapse pinned message"}
      >
        <Icon name={collapsed ? "chevronDown" : "chevronUp"} size={15} />
      </button>
    </div>
  );
}
