/**
 * User search modal — allows searching all registered users by username or email.
 *
 * Uses `useUserSearch` which hits `GET /api/auth/search?q=` on every keystroke.
 * Each result row shows the user's avatar, username (with admin shield), email,
 * and two action buttons: "Profile" (opens UserProfileModal) and "DM" (opens DM).
 *
 * Dismiss: clicking the backdrop or pressing `Escape`.
 *
 * Used by: SidebarDmList.tsx (new DM button), ChatPage.tsx.
 */

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { useUserSearch } from "../hooks/useApi";
import type { User } from "../types";
import { avatarLabel } from "../utils/avatar";
import Icon from "./Icons";

const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)", display: "flex",
    alignItems: "flex-start", justifyContent: "center",
    paddingTop: "80px", zIndex: 1000,
  },
  modal: {
    background: "var(--col-bg-elevated)", border: "1px solid var(--col-border)", borderRadius: "16px",
    width: "100%", maxWidth: "480px", maxHeight: "70vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  searchBar: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "16px", borderBottom: "1px solid var(--col-border)",
  },
  icon: { color: "var(--col-text-muted)", flexShrink: 0, display: "inline-flex" },
  input: {
    flex: 1, background: "transparent", border: "none",
    color: "var(--col-text-primary)", fontSize: "16px", outline: "none", fontFamily: "inherit",
  },
  closeBtn: {
    width: "30px", height: "30px", padding: 0, background: "var(--col-bg-hover)", borderRadius: "6px",
    color: "var(--col-text-secondary)", fontSize: "12px", border: "none", cursor: "pointer",
    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
  },
  results: { overflowY: "auto", flex: 1 },
  userRow: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "12px 16px", borderBottom: "1px solid var(--col-border)",
    cursor: "pointer", transition: "background 0.1s",
  },
  avatar: { fontSize: "28px", flexShrink: 0 },
  info: { flex: 1, minWidth: 0 },
  username: { fontSize: "14px", fontWeight: 600, color: "var(--col-text-primary)", display: "flex", alignItems: "center", gap: "6px" },
  email: { fontSize: "12px", color: "var(--col-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  adminMark: { color: "var(--col-warning-gold)", display: "inline-flex", alignItems: "center" },
  actionBtns: { display: "flex", gap: "6px", flexShrink: 0 },
  dmBtn: {
    padding: "5px 10px", background: "#5865f2", border: "none",
    borderRadius: "6px", color: "#fff", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
    display: "inline-flex", alignItems: "center", gap: "6px",
  },
  profileBtn: {
    padding: "5px 10px", background: "var(--col-bg-hover)", border: "1px solid var(--col-bg-subtle)",
    borderRadius: "6px", color: "var(--col-text-secondary)", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", gap: "6px",
  },
  empty: { padding: "32px", textAlign: "center", color: "var(--col-text-muted)", fontSize: "14px" },
} satisfies AppStyleMap;

export default function UserSearchModal({
  onClose,
  onSelectDm,
  onViewProfile,
}: {
  onClose: () => void;
  onSelectDm: (user: User) => void;
  onViewProfile: (userId: number) => void;
}) {
    const { results, loading, search, clear } = useUserSearch();

    const inputRef = useRef<HTMLInputElement | null>(null);

    const [query, setQuery] = useState("");

  useEffect(() => {
    inputRef.current?.focus();

        function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    search(val);
  }

    function handleClose() { clear(); onClose(); }

  return (
    <div style={s.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && handleClose()}>
      <div style={s.modal}>
        {/* Search bar */}
        <div style={s.searchBar}>
          <span style={s.icon}><Icon name="users" size={18} /></span>
          <input
            ref={inputRef}
            style={s.input}
            placeholder="Search by username or email..."
            value={query}
            onChange={handleChange}
          />
          <button style={s.closeBtn} onClick={handleClose} title="Close" aria-label="Close user search">
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* User result list */}
        <div style={s.results}>
          {loading && <div style={s.empty}>Searching...</div>}

          {!loading && query && results.length === 0 && (
            <div style={s.empty}>
              <div style={{ fontSize: "13px", marginBottom: "8px" }}>No results</div>
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
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--col-bg-hover)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={s.avatar}>{avatarLabel(u)}</span>
              <div style={s.info}>
                <div style={s.username}>
                  {u.username}
                  {u.role === "admin" && (
                    <span title="Admin" style={s.adminMark}>
                      <Icon name="shield" size={13} />
                    </span>
                  )}
                </div>
                <div style={s.email}>{u.email}</div>
              </div>
              <div style={s.actionBtns}>
                <button
                  style={s.profileBtn}
                  onClick={() => { onViewProfile(u.id); handleClose(); }}
                  title="View profile"
                >
                  <Icon name="user" size={15} />
                  <span>Profile</span>
                </button>
                <button
                  style={s.dmBtn}
                  onClick={() => { onSelectDm(u); handleClose(); }}
                  title="Send message"
                >
                  <Icon name="message" size={15} />
                  <span>DM</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
