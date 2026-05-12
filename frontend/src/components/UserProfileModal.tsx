import { useState, useEffect } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { useAuth } from "../context/AuthContext";
import type { User } from "../types";
import { avatarLabel } from "../utils/avatar";
import Icon from "./Icons";

import { API_BASE as API } from "../config";

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
    cursor: "pointer", fontFamily: "inherit", display: "flex",
    alignItems: "center", justifyContent: "center", gap: "8px",
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
    onlineDot: (online: boolean) => ({
    width: "10px", height: "10px", borderRadius: "50%",
    background: online ? "#23a55a" : "#5c6068",
    border: "2px solid #1e1e2e", flexShrink: 0,
  }),
    onlineLabel: (online: boolean) => ({ fontSize: "12px", color: online ? "#23a55a" : "#5c6068" }),
  closeBtn: {
    position: "absolute", top: "12px", right: "12px",
    background: "transparent", border: "none", color: "#5c6068",
    cursor: "pointer", lineHeight: 1, padding: "4px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  successMsg: { fontSize: "12px", color: "#23a55a", textAlign: "center" },
  errorMsg: { fontSize: "12px", color: "#f23f42", textAlign: "center" },
} satisfies AppStyleMap;

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

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
    const { user: me, authFetch } = useAuth();

    const [profile, setProfile] = useState<User | null>(null);

    const [loading, setLoading] = useState(true);

    const [selectedRole, setSelectedRole] = useState("");

    const [roleMsg, setRoleMsg] = useState<RoleMessage | null>(null);

    const [saving, setSaving] = useState(false);

    const isMe = me?.id === userId;

    const isAdmin = me?.role === "admin";

    useEffect(() => {
    if (!userId) return;
    setLoading(true);
    authFetch<{ user: User }>(`${API}/auth/users/${userId}`)
      .then(({ user }) => { setProfile(user); setSelectedRole(user.role); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId, authFetch]);

    useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
        <button style={s.closeBtn} onClick={onClose} title="Close" aria-label="Close profile">
          <Icon name="x" size={17} />
        </button>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#5c6068" }}>Loading...</div>
        ) : !profile ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#f23f42" }}>User not found</div>
        ) : (
          <>
            {/* Header: avatar, username, online status, role badge, email, join date */}
            <div style={s.header}>
              <span style={s.avatar}>{avatarLabel(profile)}</span>
              <div style={s.headerInfo}>
                <div style={s.username}>
                  {profile.username}
                  {profile.role === "admin" && (
                    <span title="Admin" style={{ color: "#faa61a", display: "inline-flex", alignItems: "center" }}>
                      <Icon name="shield" size={14} />
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                  <span style={s.onlineDot(isOnline)} />
                  <span style={s.onlineLabel(isOnline)}>{isOnline ? "Online" : "Offline"}</span>
                  {profile.role === "admin" && <span style={s.roleBadge("admin")}>Administrator</span>}
                </div>
                <div style={s.email}>{profile.email}</div>
                <div style={s.joinDate}>Joined: {formatDate(profile.created_at)}</div>
              </div>
            </div>

            <div style={s.body}>
              {/* Send DM button - hidden when viewing your own profile */}
              {!isMe && (
                <button style={s.dmBtn} onClick={() => { onStartDm(profile); onClose(); }}>
                  <Icon name="message" size={16} />
                  <span>Send direct message</span>
                </button>
              )}

              {/* Role management - only visible to admins viewing another user */}
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
