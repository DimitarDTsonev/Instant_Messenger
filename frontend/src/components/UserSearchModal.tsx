/**
 * @fileoverview UserSearchModal — User directory search overlay
 *
 * Renders a keyboard-accessible modal for finding users by username or email.
 * Queries are debounced by the `useUserSearch` hook. Each result row shows
 * the user's avatar, username, role badge, and email address, plus two action
 * buttons: view profile and start a DM conversation.
 *
 * Keyboard: Escape closes the modal.
 * Click-outside: clicking the backdrop closes the modal.
 *
 * @module components/UserSearchModal
 * @connects hooks/useApi — useUserSearch() for debounced user lookup
 */

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { useUserSearch } from "../hooks/useApi";
import type { User } from "../types";

/**
 * Inline style map for the user search modal.
 *
 * @type {Object}
 * @property {Object}   overlay     - Fixed full-screen backdrop with blur
 * @property {Object}   modal       - Floating card, max 480 px wide, 70 vh tall
 * @property {Object}   searchBar   - Top row: icon + input + ESC button
 * @property {Object}   icon        - 👥 users emoji container
 * @property {Object}   input       - Transparent borderless text input
 * @property {Object}   closeBtn    - "ESC" pill button
 * @property {Object}   results     - Scrollable user list area
 * @property {Object}   userRow     - Individual user row with hover highlight
 * @property {Object}   avatar      - 28 px emoji avatar
 * @property {Object}   info        - Flex column: username row + email
 * @property {Object}   username    - Bold username + optional crown + role pill
 * @property {Object}   email       - Truncated email in muted text
 * @property {Function} rolePill    - Returns role badge style; gold for admin, indigo for member
 * @property {Object}   actionBtns  - Flex row containing the profile and DM buttons
 * @property {Object}   dmBtn       - Primary "💬 DM" action button
 * @property {Object}   profileBtn  - Secondary "👤" profile view button
 * @property {Object}   empty       - Centered placeholder for empty/no-query states
 */
const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)", display: "flex",
    alignItems: "flex-start", justifyContent: "center",
    paddingTop: "80px", zIndex: 1000,
  },
  modal: {
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "16px",
    width: "100%", maxWidth: "480px", maxHeight: "70vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  searchBar: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "16px", borderBottom: "1px solid #2d2d3f",
  },
  icon: { fontSize: "18px", color: "#5c6068", flexShrink: 0 },
  input: {
    flex: 1, background: "transparent", border: "none",
    color: "#f2f3f5", fontSize: "16px", outline: "none", fontFamily: "inherit",
  },
  closeBtn: {
    padding: "6px 12px", background: "#2d2d3f", borderRadius: "6px",
    color: "#949ba4", fontSize: "12px", border: "none", cursor: "pointer",
    fontFamily: "inherit",
  },
  results: { overflowY: "auto", flex: 1 },
  userRow: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "12px 16px", borderBottom: "1px solid #2d2d3f",
    cursor: "pointer", transition: "background 0.1s",
  },
  avatar: { fontSize: "28px", flexShrink: 0 },
  info: { flex: 1, minWidth: 0 },
  username: { fontSize: "14px", fontWeight: 600, color: "#f2f3f5", display: "flex", alignItems: "center", gap: "6px" },
  email: { fontSize: "12px", color: "#5c6068", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  /** @param {"admin"|"member"} role */
  rolePill: (role: "admin" | "member") => ({
    fontSize: "10px", padding: "1px 6px", borderRadius: "8px", fontWeight: 600,
    background: role === "admin" ? "#faa61a20" : "#5865f220",
    color: role === "admin" ? "#faa61a" : "#7289da",
  }),
  actionBtns: { display: "flex", gap: "6px", flexShrink: 0 },
  dmBtn: {
    padding: "5px 10px", background: "#5865f2", border: "none",
    borderRadius: "6px", color: "#fff", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
  },
  profileBtn: {
    padding: "5px 10px", background: "#2d2d3f", border: "1px solid #3a3a4f",
    borderRadius: "6px", color: "#949ba4", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit",
  },
  empty: { padding: "32px", textAlign: "center", color: "#5c6068", fontSize: "14px" },
} satisfies AppStyleMap;

/**
 * UserSearchModal component — searchable user directory overlay.
 *
 * Auto-focuses the search input on mount. Each keystroke updates local `query`
 * state and forwards it to the `useUserSearch` hook which debounces the API call.
 *
 * @component
 * @param {Object}   props
 * @param {Function} props.onClose        - Called when the modal should close
 * @param {Function} props.onSelectDm     - Called with a user object to open a DM with that user
 * @param {Function} props.onViewProfile  - Called with a user ID to open the profile modal
 * @returns {JSX.Element} The user search overlay
 *
 * @example
 * <UserSearchModal
 *   onClose={() => setUserSearchOpen(false)}
 *   onSelectDm={handleStartDm}
 *   onViewProfile={(id) => setProfileUserId(id)}
 * />
 */
export default function UserSearchModal({
  onClose,
  onSelectDm,
  onViewProfile,
}: {
  onClose: () => void;
  onSelectDm: (user: User) => void;
  onViewProfile: (userId: number) => void;
}) {
  /**
   * Search hook for user lookups.
   * @type {{ results: Array, loading: boolean, search: Function, clear: Function }}
   */
  const { results, loading, search, clear } = useUserSearch();

  /** Ref to the search input for auto-focus on mount */
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** @type {[string, Function]} Current text in the search input (mirrored to the hook) */
  const [query, setQuery] = useState("");

  useEffect(() => {
    inputRef.current?.focus();

    /** Close on Escape key */
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Updates `query` state and forwards the value to the search hook.
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    search(val);
  }

  /** Clears search results and calls the parent close handler. */
  function handleClose() { clear(); onClose(); }

  return (
    <div style={s.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && handleClose()}>
      <div style={s.modal}>
        {/* Search bar */}
        <div style={s.searchBar}>
          <span style={s.icon}>👥</span>
          <input
            ref={inputRef}
            style={s.input}
            placeholder="Search by username or email..."
            value={query}
            onChange={handleChange}
          />
          <button style={s.closeBtn} onClick={handleClose}>ESC</button>
        </div>

        {/* User result list */}
        <div style={s.results}>
          {loading && <div style={s.empty}>⏳ Searching...</div>}

          {!loading && query && results.length === 0 && (
            <div style={s.empty}>
              <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔎</div>
              No users found for "{query}"
            </div>
          )}

          {!loading && !query && (
            <div style={s.empty}>Enter a username or email to search</div>
          )}

          {!loading && results.map((u) => (
            <div
              key={u.id}
              style={s.userRow}
              onMouseEnter={(e) => e.currentTarget.style.background = "#2d2d3f"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={s.avatar}>{u.avatar || "👤"}</span>
              <div style={s.info}>
                <div style={s.username}>
                  {u.username}
                  {u.role === "admin" && <span title="Admin">👑</span>}
                  <span style={s.rolePill(u.role === "admin" ? "admin" : "member")}>
                    {u.role === "admin" ? "admin" : "member"}
                  </span>
                </div>
                <div style={s.email}>{u.email}</div>
              </div>
              <div style={s.actionBtns}>
                <button
                  style={s.profileBtn}
                  onClick={() => { onViewProfile(u.id); handleClose(); }}
                  title="View profile"
                >
                  👤
                </button>
                <button
                  style={s.dmBtn}
                  onClick={() => { onSelectDm(u); handleClose(); }}
                  title="Send message"
                >
                  💬 DM
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}