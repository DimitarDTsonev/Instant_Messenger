// ============================================================
//  components/ChannelSettingsModal.jsx
//  Channel settings: General | Members | Permissions | Invites
// ============================================================

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import {
  useChannelMembers,
  useChannelPermissions,
  useChannelInvites,
} from "../hooks/useApi";

/** Base URL used to construct full invite links shown to the user. */
const INVITE_BASE = `${window.location.origin}${import.meta.env.BASE_URL}invite/`;

/** Inline style map used throughout ChannelSettingsModal and its sub-components. */
const s = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    width: "560px", maxWidth: "95vw", maxHeight: "85vh",
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "16px",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
  },
  header: {
    padding: "20px 24px", borderBottom: "1px solid #2d2d3f",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexShrink: 0,
  },
  title: { fontSize: "16px", fontWeight: 700, color: "#f2f3f5" },
  closeBtn: { background: "transparent", border: "none", color: "#5c6068", fontSize: "20px", cursor: "pointer", padding: "4px" },
  tabs: { display: "flex", borderBottom: "1px solid #2d2d3f", flexShrink: 0, overflowX: "auto" },
  tab: (active) => ({
    padding: "12px 20px", fontSize: "13px", fontWeight: active ? 700 : 400,
    color: active ? "#f2f3f5" : "#5c6068",
    border: "none", borderBottom: active ? "2px solid #5865f2" : "2px solid transparent",
    background: "transparent", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  }),
  body: { flex: 1, overflowY: "auto", padding: "20px 24px" },
  field: { marginBottom: "16px" },
  label: {
    display: "block", fontSize: "11px", fontWeight: 700, color: "#949ba4",
    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px",
  },
  input: {
    width: "100%", boxSizing: "border-box",
    background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "8px",
    padding: "10px 14px", color: "#f2f3f5", fontSize: "14px", outline: "none",
    fontFamily: "inherit",
  },
  textarea: {
    width: "100%", boxSizing: "border-box", minHeight: "80px",
    background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "8px",
    padding: "10px 14px", color: "#f2f3f5", fontSize: "14px", outline: "none",
    fontFamily: "inherit", resize: "vertical",
  },
  saveBtn: {
    padding: "10px 20px", background: "#5865f2", border: "none", borderRadius: "8px",
    color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  dangerBtn: {
    padding: "8px 16px", background: "transparent", border: "1px solid #f23f42",
    borderRadius: "8px", color: "#f23f42", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
  },
  secondaryBtn: {
    padding: "8px 14px", background: "#2d2d3f", border: "none",
    borderRadius: "8px", color: "#f2f3f5", fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
  },
  memberRow: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 0", borderBottom: "1px solid #1e1e2e",
  },
  memberAvatar: { fontSize: "22px", flexShrink: 0 },
  memberName: { flex: 1, fontSize: "14px", color: "#f2f3f5", overflow: "hidden", textOverflow: "ellipsis" },
  roleBadge: (role) => ({
    padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
    background: role === "owner" ? "#5865f220" : role === "manager" ? "#f0a50020" : role === "viewer" ? "#f23f4220" : "#2d2d3f",
    color: role === "owner" ? "#7289da" : role === "manager" ? "#f0a500" : role === "viewer" ? "#f23f42" : "#949ba4",
  }),
  permRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 0", borderBottom: "1px solid #1e1e2e",
  },
  permLabel: { fontSize: "14px", color: "#f2f3f5" },
  permDesc: { fontSize: "12px", color: "#5c6068", marginTop: "2px" },
  toggle: (on) => ({
    width: "40px", height: "22px", borderRadius: "11px",
    background: on ? "#5865f2" : "#3a3a4f", position: "relative",
    cursor: "pointer", border: "none", transition: "background 0.2s", flexShrink: 0,
  }),
  toggleKnob: (on) => ({
    position: "absolute", top: "3px", left: on ? "21px" : "3px",
    width: "16px", height: "16px", borderRadius: "50%",
    background: "#fff", transition: "left 0.2s",
  }),
  inviteRow: {
    background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "8px",
    padding: "12px 14px", marginBottom: "10px",
  },
  inviteCode: { fontFamily: "monospace", fontSize: "14px", color: "#f2f3f5", marginBottom: "4px" },
  inviteMeta: { fontSize: "11px", color: "#5c6068" },
  inviteActions: { display: "flex", gap: "8px", marginTop: "8px" },
  error: { background: "#f23f4215", border: "1px solid #f23f42", borderRadius: "8px", padding: "8px 12px", color: "#f23f42", fontSize: "12px", marginBottom: "10px" },
  success: { background: "#23a55a15", border: "1px solid #23a55a", borderRadius: "8px", padding: "8px 12px", color: "#23a55a", fontSize: "12px", marginBottom: "10px" },
  toggleRow: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 0" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#5865f2", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px", marginTop: "4px" },
};

/**
 * Toggle - Accessible on/off toggle button with a sliding knob.
 *
 * @component
 * @param {Object}   props
 * @param {boolean}  props.value     - Current toggle state.
 * @param {Function} props.onChange  - Called with the new boolean value when clicked.
 * @returns {JSX.Element}
 */
function Toggle({ value, onChange }) {
  return (
    <button style={s.toggle(value)} onClick={() => onChange(!value)}>
      <div style={s.toggleKnob(value)} />
    </button>
  );
}

// ── General Tab ─────────────────────────────────────────────

/**
 * GeneralTab - Allows the channel owner to edit the channel description
 * and toggle its private/public visibility.
 *
 * Only the channel owner can save changes; managers and members see the
 * description field as read-only.
 *
 * @component
 * @param {Object}   props
 * @param {Object}   props.channel           - The channel object being edited.
 * @param {string}   props.myRole            - The current user's channel role.
 * @param {Function} props.onChannelUpdated  - Called with the updated channel object after a save.
 * @returns {JSX.Element}
 */
function GeneralTab({ channel, myRole, onChannelUpdated }) {
  const [desc,    setDesc]    = useState(channel.description || "");
  const [priv,    setPriv]    = useState(!!channel.is_private);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const { authFetch } = useAuth();

  /** Persists description and privacy changes via PATCH /api/channels/:id. */
  async function save() {
    setSaving(true); setMsg("");
    try {
      const res  = await authFetch(`${API}/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description: desc, is_private: priv ? 1 : 0 }),
      });
      onChannelUpdated(res.channel);
      setMsg("Saved!");
    } catch (e) { setMsg("Error: " + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={s.field}>
        <label style={s.label}>Description</label>
        <textarea
          style={s.textarea}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Channel description..."
          disabled={myRole !== "owner"}
        />
      </div>
      {myRole === "owner" && (
        <div style={s.toggleRow}>
          <Toggle value={priv} onChange={setPriv} />
          <div>
            <div style={{ fontSize: "14px", color: "#f2f3f5" }}>🔒 Private channel</div>
            <div style={{ fontSize: "12px", color: "#5c6068" }}>Only invited users can see the channel</div>
          </div>
        </div>
      )}
      {/* Show success or error message after save attempt */}
      {msg && <div style={msg.startsWith("Error") ? s.error : s.success}>{msg}</div>}
      {myRole === "owner" && (
        <button style={s.saveBtn} onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      )}
    </div>
  );
}

// ── Members Tab ─────────────────────────────────────────────

/**
 * MembersTab - Displays the channel member list and provides member management.
 *
 * Owners and managers can add members by username, kick members, and (owners only)
 * change a member's role between "member" and "manager".  The "owner" role is
 * protected: it cannot be changed or kicked through this UI.
 *
 * @component
 * @param {Object} props
 * @param {number} props.channelId      - ID of the channel whose members to manage.
 * @param {string} props.myRole         - The current user's channel role.
 * @param {number} props.currentUserId  - The current user's ID (prevents self-kick).
 * @returns {JSX.Element}
 */
function MembersTab({ channelId, myRole, currentUserId }) {
  const { members, addMember, removeMember, changeRole } = useChannelMembers(channelId);
  const [newUser, setNewUser] = useState("");
  const [busy,    setBusy]   = useState(false);
  const [error,   setError]  = useState("");

  // Only owners and managers can modify the member list
  const canManage = myRole === "owner" || myRole === "manager";

  /** Submits the add-member form. */
  async function handleAdd(e) {
    e.preventDefault();
    if (!newUser.trim()) return;
    setBusy(true); setError("");
    try { await addMember(newUser.trim()); setNewUser(""); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  /**
   * Confirms and kicks a member from the channel.
   *
   * @param {number} userId
   */
  async function handleKick(userId) {
    if (!confirm("Remove this user from the channel?")) return;
    try { await removeMember(userId); }
    catch (e) { alert(e.message); }
  }

  /**
   * Changes a member's role via the role dropdown.
   *
   * @param {number} userId
   * @param {string} newRole
   */
  async function handleRole(userId, newRole) {
    try { await changeRole(userId, newRole); }
    catch (e) { alert(e.message); }
  }

  return (
    <div>
      {canManage && (
        <form style={{ display: "flex", gap: "8px", marginBottom: "16px" }} onSubmit={handleAdd}>
          <input
            style={{ ...s.input, flex: 1 }}
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            placeholder="username..."
          />
          <button type="submit" style={s.saveBtn} disabled={busy}>Add</button>
        </form>
      )}
      {error && <div style={s.error}>{error}</div>}

      {members.map((m) => (
        <div key={m.id} style={s.memberRow}>
          <span style={s.memberAvatar}>{m.avatar || "👤"}</span>
          <div style={s.memberName}>
            {m.username}
            {m.global_role === "admin" && <span title="Global admin" style={{ marginLeft: 4 }}>👑</span>}
          </div>
          <span style={s.roleBadge(m.channel_role)}>{m.channel_role}</span>
          {/* Show role selector and kick button for non-owner members when the viewer can manage */}
          {canManage && m.id !== currentUserId && m.channel_role !== "owner" && (
            <>
              {myRole === "owner" && (
                <select
                  style={{ background: "#0f0f1a", border: "1px solid #2d2d3f", color: "#f2f3f5", borderRadius: "6px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}
                  value={m.channel_role}
                  onChange={(e) => handleRole(m.id, e.target.value)}
                >
                  <option value="viewer">viewer (read-only)</option>
                  <option value="member">member</option>
                  <option value="manager">manager</option>
                </select>
              )}
              <button style={s.dangerBtn} onClick={() => handleKick(m.id)}>Kick</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Permissions Tab ──────────────────────────────────────────

/**
 * Definitions for the per-role permission toggles shown in the Permissions tab.
 * Each entry maps a database permission key to a human-readable label and description.
 *
 * @type {Array<{key: string, label: string, desc: string}>}
 */
const PERM_DEFS = [
  { key: "can_write",           label: "Can write",           desc: "User can send messages" },
  { key: "can_invite",          label: "Can invite",          desc: "Can generate invite links for the channel" },
  { key: "can_manage_members",  label: "Manage members",      desc: "Can add and remove members" },
  { key: "can_delete_messages", label: "Delete messages",     desc: "Can delete other users' messages" },
];

/**
 * PermissionsTab - Allows the channel owner to configure per-role permissions.
 *
 * Renders a toggle grid for the "manager" and "member" roles.  Each toggle
 * persists immediately via PUT /api/channels/:id/permissions/:role.
 * Only visible to the channel owner; other roles see a restricted message.
 *
 * @component
 * @param {Object} props
 * @param {number} props.channelId  - Channel ID.
 * @param {string} props.myRole     - The current user's channel role.
 * @returns {JSX.Element}
 */
function PermissionsTab({ channelId, myRole }) {
  const { permissions, updateRole } = useChannelPermissions(channelId);
  // Track saving state per role to show a spinner or saved indicator
  const [saving, setSaving] = useState({});
  const [saved,  setSaved]  = useState({});

  if (myRole !== "owner") {
    return <div style={{ color: "#5c6068", fontSize: "14px" }}>Only the owner can manage permissions.</div>;
  }

  if (!permissions) return <div style={{ color: "#5c6068" }}>Loading...</div>;

  /**
   * Saves a single permission toggle change for a role.
   *
   * @param {string}  role - "manager" or "member".
   * @param {string}  key  - Permission key (e.g. "can_write").
   * @param {boolean} val  - New value.
   */
  async function toggle(role, key, val) {
    setSaving((p) => ({ ...p, [role]: true }));
    try {
      await updateRole(role, { ...permissions[role], [key]: val ? 1 : 0 });
      // Show a brief "Saved" confirmation then clear it
      setSaved((p) => ({ ...p, [role]: true }));
      setTimeout(() => setSaved((p) => ({ ...p, [role]: false })), 1500);
    } catch (e) { alert(e.message); }
    finally { setSaving((p) => ({ ...p, [role]: false })); }
  }

  return (
    <div>
      {["manager", "member"].map((role) => (
        <div key={role} style={{ marginBottom: "24px" }}>
          <div style={s.sectionTitle}>
            Role: {role} {saved[role] && <span style={{ color: "#23a55a" }}>✓ Saved</span>}
          </div>
          {PERM_DEFS.map(({ key, label, desc }) => (
            <div key={key} style={s.permRow}>
              <div>
                <div style={s.permLabel}>{label}</div>
                <div style={s.permDesc}>{desc}</div>
              </div>
              <Toggle
                value={!!permissions[role]?.[key]}
                onChange={(v) => toggle(role, key, v)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Invites Tab ──────────────────────────────────────────────

/**
 * InvitesTab - Manages invite links for a channel.
 *
 * Lets authorized users create new invite links with optional max-use caps
 * and expiry durations, copy existing link URLs to the clipboard, and revoke
 * (delete) links they no longer want active.
 *
 * @component
 * @param {Object} props
 * @param {number} props.channelId - Channel ID whose invites to manage.
 * @returns {JSX.Element}
 */
function InvitesTab({ channelId }) {
  const { invites, createInvite, deleteInvite } = useChannelInvites(channelId);
  const [maxUses,       setMaxUses]       = useState("");
  const [expiresHours,  setExpiresHours]  = useState("");
  const [creating,      setCreating]      = useState(false);
  // Stores the code of the invite whose link was most recently copied, for visual feedback
  const [copied,        setCopied]        = useState(null);

  /** Creates a new invite with the current form settings. */
  async function handleCreate() {
    setCreating(true);
    try {
      await createInvite({
        maxUses:       maxUses       ? Number(maxUses)       : null,
        expiresInHours: expiresHours ? Number(expiresHours) : null,
      });
      setMaxUses(""); setExpiresHours("");
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  }

  /**
   * Copies the full invite URL for a given code to the clipboard.
   * Shows a brief "Copied!" confirmation then resets.
   *
   * @param {string} code - The invite code.
   */
  function copy(code) {
    navigator.clipboard.writeText(INVITE_BASE + code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div>
      {/* New invite creation form */}
      <div style={{ background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
        <div style={s.sectionTitle}>New invite</div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "120px" }}>
            <label style={s.label}>Max uses</label>
            <input style={s.input} type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" />
          </div>
          <div style={{ flex: 1, minWidth: "120px" }}>
            <label style={s.label}>Expires after (hours)</label>
            <input style={s.input} type="number" min="1" value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} placeholder="never" />
          </div>
        </div>
        <button style={{ ...s.saveBtn, marginTop: "12px" }} onClick={handleCreate} disabled={creating}>
          {creating ? "Generating..." : "Generate invite"}
        </button>
      </div>

      {invites.length === 0 && (
        <div style={{ color: "#5c6068", fontSize: "13px", textAlign: "center", padding: "16px" }}>No active invites</div>
      )}

      {invites.map((inv) => (
        <div key={inv.code} style={s.inviteRow}>
          <div style={s.inviteCode}>{INVITE_BASE}{inv.code}</div>
          <div style={s.inviteMeta}>
            Created by {inv.created_by_username}
            {" · "}{inv.uses_count}{inv.max_uses ? `/${inv.max_uses}` : ""} uses
            {inv.expires_at && ` · Expires ${new Date(inv.expires_at).toLocaleString("en-US")}`}
          </div>
          <div style={s.inviteActions}>
            <button style={s.secondaryBtn} onClick={() => copy(inv.code)}>
              {copied === inv.code ? "✅ Copied!" : "📋 Copy"}
            </button>
            <button style={s.dangerBtn} onClick={() => deleteInvite(inv.code)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────

/**
 * ChannelSettingsModal - Full-featured settings modal for a channel.
 *
 * Renders a tabbed interface with up to four tabs:
 * - General     — description and privacy (always visible).
 * - Members     — member list + add/kick/role (always visible).
 * - Permissions — per-role permission matrix (owner only).
 * - Invites     — invite link management (owners, managers, and members with can_invite).
 *
 * Clicking outside the modal (on the overlay) closes it.
 *
 * @component
 * @param {Object}   props
 * @param {Object}   props.channel           - The channel object to configure.
 * @param {Function} props.onClose           - Called when the modal should be closed.
 * @param {Function} props.onChannelUpdated  - Called with the updated channel object after a General tab save.
 * @returns {JSX.Element}
 */
export default function ChannelSettingsModal({ channel, onClose, onChannelUpdated }) {
  const { user } = useAuth();
  // Fall back to "member" if the role is not set on the channel object
  const myRole   = channel.user_role || "member";
  const [tab, setTab] = useState("general");

  // Build the tab list, hiding tabs the current user is not allowed to see
  const tabs = [
    { id: "general",     label: "⚙️ General" },
    { id: "members",     label: "👥 Members" },
    { id: "permissions", label: "🛡️ Permissions", hidden: myRole !== "owner" },
    { id: "invites",     label: "🔗 Invites",      hidden: myRole === "member" && !channel.can_invite },
  ].filter((t) => !t.hidden);

  /**
   * Forwards the updated channel data up to the ChatPage state.
   *
   * @param {Object} updated - Partial channel fields returned by the server.
   */
  function handleUpdated(updated) {
    onChannelUpdated?.(updated);
  }

  return (
    // Clicking directly on the overlay (not the modal itself) closes the dialog
    <div style={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={s.modal}>
        <div style={s.header}>
          <div style={s.title}>
            {channel.is_private ? "🔒" : "#"}{channel.name} — Settings
            <span style={{ marginLeft: "8px", fontSize: "12px", fontWeight: 400, color: "#5c6068" }}>({myRole})</span>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.tabs}>
          {tabs.map((t) => (
            <button key={t.id} style={s.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        <div style={s.body}>
          {tab === "general"     && <GeneralTab     channel={channel} myRole={myRole} onChannelUpdated={handleUpdated} />}
          {tab === "members"     && <MembersTab     channelId={channel.id} myRole={myRole} currentUserId={user?.id} />}
          {tab === "permissions" && <PermissionsTab channelId={channel.id} myRole={myRole} />}
          {tab === "invites"     && <InvitesTab     channelId={channel.id} />}
        </div>
      </div>
    </div>
  );
}
