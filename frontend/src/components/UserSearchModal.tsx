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
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "16px",
    width: "100%", maxWidth: "480px", maxHeight: "70vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  searchBar: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "16px", borderBottom: "1px solid #2d2d3f",
  },
  icon: { color: "#5c6068", flexShrink: 0, display: "inline-flex" },
  input: {
    flex: 1, background: "transparent", border: "none",
    color: "#f2f3f5", fontSize: "16px", outline: "none", fontFamily: "inherit",
  },
  closeBtn: {
    width: "30px", height: "30px", padding: 0, background: "#2d2d3f", borderRadius: "6px",
    color: "#949ba4", fontSize: "12px", border: "none", cursor: "pointer",
    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
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
  adminMark: { color: "#faa61a", display: "inline-flex", alignItems: "center" },
  actionBtns: { display: "flex", gap: "6px", flexShrink: 0 },
  dmBtn: {
    padding: "5px 10px", background: "#5865f2", border: "none",
    borderRadius: "6px", color: "#fff", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
    display: "inline-flex", alignItems: "center", gap: "6px",
  },
  profileBtn: {
    padding: "5px 10px", background: "#2d2d3f", border: "1px solid #3a3a4f",
    borderRadius: "6px", color: "#949ba4", fontSize: "12px",
    cursor: "pointer", fontFamily: "inherit",
    display: "inline-flex", alignItems: "center", gap: "6px",
  },
  empty: { padding: "32px", textAlign: "center", color: "#5c6068", fontSize: "14px" },
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
              onMouseEnter={(e) => e.currentTarget.style.background = "#2d2d3f"}
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
