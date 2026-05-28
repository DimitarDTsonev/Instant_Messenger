/**
 * Global message search modal — searches messages across all accessible channels
 * and DMs in real time as the user types.
 *
 * Uses `useGlobalSearch` which hits `GET /api/messages/search?q=` on each change.
 * Results are rendered as a list with:
 *  - Author avatar, username, channel/DM source badge, and timestamp.
 *  - Message content with the search query highlighted using `highlightText`.
 *
 * Dismiss: clicking the backdrop or pressing `Escape`.
 * Navigation: clicking a result calls `onNavigate` (e.g. to jump to the message's channel).
 *
 * Used by: ChatPage.tsx.
 */

import { useEffect, useRef } from "react";
import type { ChangeEvent, MouseEvent, ReactNode } from "react";
import { useGlobalSearch } from "../hooks/useApi";
import type { SearchResult } from "../types";
import { avatarLabel } from "../utils/avatar";
import Icon from "./Icons";

const s = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "80px",
    zIndex: 1000,
  },
  modal: {
    background: "#1e1e2e",
    border: "1px solid #2d2d3f",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "620px",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "16px",
    borderBottom: "1px solid #2d2d3f",
  },
  searchIcon: { color: "#5c6068", flexShrink: 0, display: "inline-flex" },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    color: "#f2f3f5",
    fontSize: "16px",
    outline: "none",
    fontFamily: "inherit",
  },
  closeBtn: {
    width: "30px",
    height: "30px",
    padding: 0,
    background: "#2d2d3f",
    borderRadius: "6px",
    color: "#949ba4",
    fontSize: "12px",
    flexShrink: 0,
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  results: {
    overflowY: "auto",
    flex: 1,
  },
  resultItem: {
    padding: "12px 16px",
    borderBottom: "1px solid #2d2d3f",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  },
  resultAvatar: { fontSize: "18px" },
  resultUsername: { fontSize: "13px", fontWeight: 600, color: "#f2f3f5" },
  resultTime: { fontSize: "11px", color: "#5c6068", marginLeft: "auto" },
  resultSource: {
    fontSize: "11px",
    padding: "1px 7px",
    borderRadius: "10px",
    fontWeight: 600,
    flexShrink: 0,
  },
  resultContent: { fontSize: "13px", color: "#949ba4", lineHeight: "1.5" },
  highlight: {
    background: "#f0b23230",
    color: "#f0b232",
    borderRadius: "2px",
    padding: "0 2px",
  },
  empty: {
    padding: "40px",
    textAlign: "center",
    color: "#5c6068",
    fontSize: "14px",
  },
  loading: {
    padding: "24px",
    textAlign: "center",
    color: "#5c6068",
  },
} satisfies AppStyleMap;

function highlightText(text: string | undefined, query: string): ReactNode {
  if (!query || !text) return text || "";
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={s.highlight}>{part}</mark>
      : part
  );
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function SearchModal({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate?: (result: SearchResult) => void;
}) {
    const { results, loading, query, search, clearSearch } = useGlobalSearch();

    const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();

        function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
    search(e.target.value);
  }

    function handleClose() {
    clearSearch();
    onClose();
  }

    function handleNavigate(result: SearchResult) {
    onNavigate?.(result);
    handleClose();
  }

  return (
    <div style={s.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && handleClose()}>
      <div style={s.modal}>
        {/* Search bar */}
        <div style={s.searchBar}>
          <span style={s.searchIcon}><Icon name="search" size={18} /></span>
          <input
            ref={inputRef}
            style={s.searchInput}
            placeholder="Search channels and direct messages..."
            onChange={handleChange}
          />
          {query && (
            <span style={{ fontSize: "12px", color: "#5c6068" }}>
              {results.length} results
            </span>
          )}
          <button style={s.closeBtn} onClick={handleClose} title="Close" aria-label="Close search">
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Results list */}
        <div style={s.results}>
          {loading && <div style={s.loading}>Searching...</div>}

          {!loading && query && results.length === 0 && (
            <div style={s.empty}>
              <div style={{ fontSize: "13px", marginBottom: "8px" }}>No results</div>
              No messages found for "{query}"
            </div>
          )}

          {!loading && !query && (
            <div style={s.empty}>
              Search everywhere - channels and direct messages
            </div>
          )}

          {!loading && results.map((msg) => {
            const isChannel = msg.type === "channel";
            return (
              <div
                key={`${msg.type}-${msg.id}`}
                style={s.resultItem}
                onMouseEnter={(e) => e.currentTarget.style.background = "#2d2d3f"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                onClick={() => handleNavigate(msg)}
              >
                <div style={s.resultHeader}>
                  <span style={s.resultAvatar}>{avatarLabel(msg)}</span>
                  <span style={s.resultUsername}>{msg.username}</span>
                  {/* Channel badge (indigo) or DM badge (green) */}
                  <span style={{
                    ...s.resultSource,
                    background: isChannel ? "#5865f215" : "#23a55a15",
                    color: isChannel ? "#7289da" : "#23a55a",
                    border: `1px solid ${isChannel ? "#5865f230" : "#23a55a30"}`,
                  }}>
                    {isChannel ? `#${msg.channel_name}` : `DM ${msg.dm_partner_username}`}
                  </span>
                  <span style={s.resultTime}>{formatTime(msg.created_at)}</span>
                </div>
                <div style={s.resultContent}>
                  {highlightText(msg.content, query)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
