/**
 * @fileoverview UserProfileModal — User profile viewer with admin role management
 *
 * Displays a read-only profile card for any user in the system, including:
 *   - Avatar emoji, username, online/offline status, and role badge
 *   - Email address and registration date
 *   - "Send DM" button (hidden when viewing your own profile)
 *   - Role management section (visible only to admins, hidden when viewing self)
 *
 * Admin users can change the target user's global role (member ↔ admin) via
 * PATCH /api/auth/users/:id/role. The change is applied optimistically in local
 * state on success.
 *
 * The modal closes on Escape key press or by clicking the backdrop.
 *
 * @module components/UserProfileModal
 * @connects AuthContext — reads current user (`me`) and `authFetch` for API calls
 * @route PATCH /api/auth/users/:id/role — updates the target user's global role
 * @route GET   /api/auth/users/:id      — fetches the target user's profile on mount
 */

import { useState, useEffect } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";

import { API_BASE as API } from "../config";

/**
 * Inline style map for the profile modal.
 *
 * @type {Object}
 * @property {Object}   overlay      - Fixed full-screen backdrop with blur
 * @property {Object}   modal        - 360 px wide card
 * @property {Object}   header       - Gradient header area with avatar and user info
 * @property {Object}   avatar       - Large 48 px emoji avatar
 * @property {Object}   headerInfo   - Flex column: username, status row, email, join date
 * @property {Object}   username     - Bold username with optional crown icon for admins
 * @property {Function} roleBadge    - Returns role pill style; gold for admin, indigo for member
 * @property {Object}   email        - Truncated email in muted text
 * @property {Object}   joinDate     - Registration date in faint text
 * @property {Object}   body         - Padded content area below the header
 * @property {Object}   dmBtn        - Primary "Send DM" button
 * @property {Object}   roleSection  - Dark inset box containing the role management controls
 * @property {Object}   roleTitle    - Section label "Role Management"
 * @property {Object}   roleSelect   - Dropdown for picking member or admin
 * @property {Object}   saveRoleBtn  - Confirm button; only visible when the selection changed
 * @property {Function} onlineDot    - Returns green (online) or grey (offline) indicator dot style
 * @property {Function} onlineLabel  - Returns "Online" / "Offline" text style
 * @property {Object}   closeBtn     - Absolute-positioned ✕ button in the top-right corner
 * @property {Object}   successMsg   - Green success feedback text
 * @property {Object}   errorMsg     - Red error feedback text
 */
const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(4px)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "16px",
    width: "360px", overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  header: {
    background: "linear-gradient(135deg, #2d2d3f 0%, #1a1a2e 100%)",
    padding: "24px", display: "flex", alignItems: "center", gap: "16px",
    borderBottom: "1px solid #2d2d3f",
  },
  avatar: { fontSize: "48px", lineHeight: 1 },
  headerInfo: { flex: 1, minWidth: 0 },
  username: { fontSize: "18px", fontWeight: 700, color: "#f2f3f5", display: "flex", alignItems: "center", gap: "6px" },
  /** @param {"admin"|"member"} role */
  roleBadge: (role: "admin" | "member") => ({
    fontSize: "11px", padding: "2px 8px", borderRadius: "10px", fontWeight: 600,
    background: role === "admin" ? "#faa61a20" : "#5865f220",
    color: role === "admin" ? "#faa61a" : "#7289da",
    border: `1px solid ${role === "admin" ? "#faa61a40" : "#5865f240"}`,
  }),
  email: { fontSize: "12px", color: "#5c6068", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  joinDate: { fontSize: "11px", color: "#3a3a4f", marginTop: "2px" },
  body: { padding: "16px", display: "flex", flexDirection: "column", gap: "10px" },
  dmBtn: {
    width: "100%", padding: "10px", background: "#5865f2", border: "none",
    borderRadius: "8px", color: "#fff", fontSize: "14px", fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  roleSection: {
    background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "8px",
    padding: "12px",
  },
  roleTitle: { fontSize: "11px", color: "#5c6068", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" },
  roleSelect: {
    width: "100%", background: "#2d2d3f", border: "1px solid #3a3a4f",
    borderRadius: "6px", color: "#f2f3f5", fontSize: "13px",
    padding: "6px 10px", outline: "none", fontFamily: "inherit", cursor: "pointer",
  },
  saveRoleBtn: {
    marginTop: "8px", padding: "6px 14px", background: "#5865f2", border: "none",
    borderRadius: "6px", color: "#fff", fontSize: "12px", fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  /** @param {boolean} online */
  onlineDot: (online: boolean) => ({
    width: "10px", height: "10px", borderRadius: "50%",
    background: online ? "#23a55a" : "#5c6068",
    border: "2px solid #1e1e2e", flexShrink: 0,
  }),
  /** @param {boolean} online */
  onlineLabel: (online: boolean) => ({ fontSize: "12px", color: online ? "#23a55a" : "#5c6068" }),
  closeBtn: {
    position: "absolute", top: "12px", right: "12px",
    background: "transparent", border: "none", color: "#5c6068",
    fontSize: "18px", cursor: "pointer", lineHeight: 1, padding: "4px",
  },
  successMsg: { fontSize: "12px", color: "#23a55a", textAlign: "center" },
  errorMsg: { fontSize: "12px", color: "#f23f42", textAlign: "center" },
} satisfies AppStyleMap;

/**
 * Formats an ISO 8601 or SQLite datetime string as a long locale date.
 *
 * @param {string|null} dateStr - Date string to format; returns "—" if falsy
 * @returns {string} Formatted date, e.g. "2 May 2024"
 */
function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * UserProfileModal component — shows a user's public profile.
 *
 * Fetches `GET /api/auth/users/:userId` on mount (and whenever `userId` changes).
 * The "Send DM" button is hidden when viewing your own profile (`isMe === true`).
 * The role management section is shown only to admins viewing another user's profile.
 *
 * @component
 * @param {Object}   props
 * @param {number}   props.userId      - ID of the user whose profile to display
 * @param {boolean}  [props.isOnline=false] - Whether the target user is currently online
 * @param {Function} props.onClose     - Called when the modal should close
 * @param {Function} props.onStartDm   - Called with the profile object to open a DM conversation
 * @returns {JSX.Element} The profile modal overlay
 *
 * @example
 * <UserProfileModal
 *   userId={clickedUserId}
 *   isOnline={onlineUsers.has(clickedUserId)}
 *   onClose={() => setProfileUserId(null)}
 *   onStartDm={handleStartDm}
 * />
 */
type RoleMessage = { type: "ok" | "err"; text: string };

export default function UserProfileModal({
  userId,
  isOnline = false,
  onClose,
  onStartDm,
}: {
  userId: number;
  isOnline?: boolean;
  onClose: () => void;
  onStartDm: (user: User) => void;
}) {
  /** @type {{ id: number, role: string, authFetch: Function }} */
  const { user: me, authFetch } = useAuth();

  /**
   * Fetched profile data for the target user.
   * @type {[Object|null, Function]}
   */
  const [profile, setProfile] = useState<User | null>(null);

  /** @type {[boolean, Function]} True while the profile fetch is in-flight */
  const [loading, setLoading] = useState(true);

  /** @type {[string, Function]} Role value currently selected in the admin dropdown */
  const [selectedRole, setSelectedRole] = useState("");

  /**
   * Feedback message after a role change attempt.
   * @type {[{ type: "ok"|"err", text: string }|null, Function]}
   */
  const [roleMsg, setRoleMsg] = useState<RoleMessage | null>(null);

  /** @type {[boolean, Function]} True while the role PATCH request is in-flight */
  const [saving, setSaving] = useState(false);

  /** True when the logged-in user is viewing their own profile */
  const isMe = me?.id === userId;

  /** True when the logged-in user has the global admin role */
  const isAdmin = me?.role === "admin";

  /** Fetch the target user's profile whenever userId changes */
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    authFetch<{ user: User }>(`${API}/auth/users/${userId}`)
      .then(({ user }) => { setProfile(user); setSelectedRole(user.role); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId, authFetch]);

  /** Close on Escape key */
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Saves the role change via PATCH /api/auth/users/:id/role.
   * Updates local `profile.role` state optimistically on success.
   *
   * @returns {Promise<void>}
   */
  async function handleSaveRole() {
    if (!profile || selectedRole === profile.role) return;
    setSaving(true);
    setRoleMsg(null);
    try {
      await authFetch(`${API}/auth/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: selectedRole }),
      });
      setProfile((p) => ({ ...p, role: selectedRole }));
      setRoleMsg({ type: "ok", text: "Role updated successfully" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update role";
      setRoleMsg({ type: "err", text: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.modal, position: "relative" }}>
        <button style={s.closeBtn} onClick={onClose} title="Close">✕</button>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#5c6068" }}>Loading...</div>
        ) : !profile ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#f23f42" }}>User not found</div>
        ) : (
          <>
            {/* Header: avatar, username, online status, role badge, email, join date */}
            <div style={s.header}>
              <span style={s.avatar}>{profile.avatar || "👤"}</span>
              <div style={s.headerInfo}>
                <div style={s.username}>
                  {profile.username}
                  {profile.role === "admin" && <span title="Admin">👑</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                  <span style={s.onlineDot(isOnline)} />
                  <span style={s.onlineLabel(isOnline)}>{isOnline ? "Online" : "Offline"}</span>
                  <span style={s.roleBadge(profile.role === "admin" ? "admin" : "member")}>
                    {profile.role === "admin" ? "Administrator" : "Member"}
                  </span>
                </div>
                <div style={s.email}>{profile.email}</div>
                <div style={s.joinDate}>Joined: {formatDate(profile.created_at)}</div>
              </div>
            </div>

            <div style={s.body}>
              {/* Send DM button — hidden when viewing your own profile */}
              {!isMe && (
                <button style={s.dmBtn} onClick={() => { onStartDm(profile); onClose(); }}>
                  💬 Send direct message
                </button>
              )}

              {/* Role management — only visible to admins viewing another user */}
              {isAdmin && !isMe && (
                <div style={s.roleSection}>
                  <div style={s.roleTitle}>Role Management</div>
                  <select
                    style={s.roleSelect}
                    value={selectedRole}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => { setSelectedRole(e.target.value); setRoleMsg(null); }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Administrator (admin)</option>
                  </select>
                  {selectedRole !== profile.role && (
                    <button style={s.saveRoleBtn} onClick={handleSaveRole} disabled={saving}>
                      {saving ? "Saving..." : "Save changes"}
                    </button>
                  )}
                  {roleMsg && (
                    <div style={roleMsg.type === "ok" ? s.successMsg : s.errorMsg}>
                      {roleMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}