/**
 * @fileoverview SearchModal — Global full-text message search overlay
 *
 * Renders a keyboard-accessible modal that searches across both channel messages
 * and direct messages simultaneously. Results are fetched via the `useGlobalSearch`
 * hook which debounces the query before hitting the REST API.
 *
 * Each result card shows the author's avatar, username, source badge (channel name
 * or DM partner), timestamp, and the matched content with the search term highlighted.
 * Clicking a result calls `onNavigate` so the parent can switch to the relevant
 * channel or DM conversation and close this modal.
 *
 * Keyboard: Escape closes the modal.
 * Click-outside: clicking the backdrop closes the modal.
 *
 * @module components/SearchModal
 * @connects hooks/useApi — useGlobalSearch() for debounced search results
 */

import { useEffect, useRef } from "react";
import type { ChangeEvent, MouseEvent, ReactNode } from "react";
import { useGlobalSearch } from "../hooks/useApi";
import type { SearchResult } from "../types";

/**
 * Inline style map for the search modal.
 *
 * @type {Object}
 * @property {Object} overlay      - Fixed full-screen backdrop with blur
 * @property {Object} modal        - Floating card, max 620 px wide, 70 vh tall
 * @property {Object} searchBar    - Top row: search icon + input + result count + ESC button
 * @property {Object} searchIcon   - Magnifier emoji container
 * @property {Object} searchInput  - Transparent, borderless text input
 * @property {Object} closeBtn     - "ESC" pill button in the top-right corner
 * @property {Object} results      - Scrollable result list area
 * @property {Object} resultItem   - Individual message card row
 * @property {Object} resultHeader - Meta row: avatar, username, source badge, timestamp
 * @property {Object} resultAvatar - Author emoji avatar
 * @property {Object} resultUsername - Bold author name
 * @property {Object} resultTime   - Muted relative/absolute timestamp (right-aligned)
 * @property {Object} resultSource - Colored channel or DM badge pill
 * @property {Object} resultContent - Message body preview text
 * @property {Object} highlight    - Amber highlight applied to the matched query substring
 * @property {Object} empty        - Centered placeholder when no results or no query
 * @property {Object} loading      - Centered spinner placeholder while fetching
 */
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
  searchIcon: { fontSize: "18px", color: "#5c6068", flexShrink: 0 },
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
    padding: "6px 12px",
    background: "#2d2d3f",
    borderRadius: "6px",
    color: "#949ba4",
    fontSize: "12px",
    flexShrink: 0,
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
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

/**
 * Wraps occurrences of `query` inside `text` with a highlighted `<mark>` element.
 * The match is case-insensitive. Special regex characters in the query are escaped
 * before building the split pattern.
 *
 * @param {string} text  - The full message content to scan
 * @param {string} query - The search term typed by the user
 * @returns {Array<string|JSX.Element>|string} Mixed array of plain strings and
 *   `<mark>` elements, or the original string if no match exists
 */
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

/**
 * Formats an ISO/SQL timestamp into a short human-readable string.
 *
 * @param {string} dateStr - ISO 8601 or SQLite datetime string
 * @returns {string} Locale-formatted string, e.g. "2 May, 14:30"
 */
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * SearchModal component — global message search overlay.
 *
 * Opens as a fixed overlay. Auto-focuses the search input. Debounced queries
 * are handled by `useGlobalSearch` which searches both channel and DM messages.
 *
 * @component
 * @param {Object}   props
 * @param {Function} props.onClose    - Called when the modal should close (Escape, backdrop, ESC button)
 * @param {Function} [props.onNavigate] - Called with the selected search result object so the
 *   parent can navigate to that channel/DM conversation
 * @returns {JSX.Element} The search overlay modal
 *
 * @example
 * <SearchModal onClose={() => setSearchOpen(false)} onNavigate={handleSearchNavigate} />
 */
export default function SearchModal({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate?: (result: SearchResult) => void;
}) {
  /**
   * Search state from the global search hook.
   * @type {{ results: Array, loading: boolean, query: string, search: Function, clearSearch: Function }}
   */
  const { results, loading, query, search, clearSearch } = useGlobalSearch();

  /** Ref to the search input so it can be focused on mount */
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();

    /** Close on Escape key */
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  /**
   * Forwards the input value to the search hook on every keystroke.
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    search(e.target.value);
  }

  /** Clears the search state then invokes the parent close handler. */
  function handleClose() {
    clearSearch();
    onClose();
  }

  /**
   * Navigates to the selected message's source (channel or DM) and closes the modal.
   * @param {Object} result - A search result object from `useGlobalSearch`
   */
  function handleNavigate(result: SearchResult) {
    onNavigate?.(result);
    handleClose();
  }

  return (
    <div style={s.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && handleClose()}>
      <div style={s.modal}>
        {/* Search bar */}
        <div style={s.searchBar}>
          <span style={s.searchIcon}>🔍</span>
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
          <button style={s.closeBtn} onClick={handleClose}>ESC</button>
        </div>

        {/* Results list */}
        <div style={s.results}>
          {loading && <div style={s.loading}>⏳ Searching...</div>}

          {!loading && query && results.length === 0 && (
            <div style={s.empty}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔎</div>
              No messages found for "{query}"
            </div>
          )}

          {!loading && !query && (
            <div style={s.empty}>
              Search everywhere — channels and direct messages
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
                  <span style={s.resultAvatar}>{msg.avatar || "👤"}</span>
                  <span style={s.resultUsername}>{msg.username}</span>
                  {/* Channel badge (indigo) or DM badge (green) */}
                  <span style={{
                    ...s.resultSource,
                    background: isChannel ? "#5865f215" : "#23a55a15",
                    color: isChannel ? "#7289da" : "#23a55a",
                    border: `1px solid ${isChannel ? "#5865f230" : "#23a55a30"}`,
                  }}>
                    {isChannel ? `#${msg.channel_name}` : `💬 ${msg.dm_partner_username}`}
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