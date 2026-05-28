/**
 * Tab content panels for ChannelSettingsModal.
 *
 * Exports four named tab components and one shared Toggle widget:
 *
 *  - `Toggle`          — Animated on/off switch used in GeneralTab and PermissionsTab.
 *  - `GeneralTab`      — Edit channel description and private flag (owner-only PATCH).
 *  - `MembersTab`      — List members, add by username, kick, and reassign roles.
 *  - `PermissionsTab`  — Per-role permission toggles (owner only). Renders one section
 *                        per role ("manager", "member") × four permission keys.
 *  - `InvitesTab`      — Create invite links with optional max-uses / expiry, list
 *                        active invites, copy to clipboard, and delete.
 *
 * INVITE_BASE: constructed from `window.location.origin + BASE_URL + "invite/"` so that
 * the full URL is correct on both local dev and GitHub Pages sub-path deployments.
 *
 * PERM_DEFS: static array that maps PermissionKey → human-readable label + description,
 * used to render the permission toggle rows without repetition.
 *
 * Used by: ChannelSettingsModal.tsx.
 */

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Channel, ChannelRole, PermissionKey } from "../types";
import { useChannelMembers, useChannelPermissions, useChannelInvites } from "../hooks/useApi";
import { avatarLabel } from "../utils/avatar";
import Icon from "./Icons";
import { s } from "./channelSettingsStyles";

const INVITE_BASE = `${window.location.origin}${import.meta.env.BASE_URL}invite/`;

const PERM_DEFS: Array<{ key: PermissionKey; label: string; desc: string }> = [
  { key: "can_write",           label: "Can write",       desc: "User can send messages" },
  { key: "can_invite",          label: "Can invite",      desc: "Can generate invite links for the channel" },
  { key: "can_manage_members",  label: "Manage members",  desc: "Can add and remove members" },
  { key: "can_delete_messages", label: "Delete messages", desc: "Can delete other users' messages" },
];

/**
 * Animated toggle switch (on/off).
 *
 * @param value    - Current boolean state.
 * @param onChange - Called with the new value when the button is clicked.
 */
export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button style={s.toggle(value)} onClick={() => onChange(!value)}>
      <div style={s.toggleKnob(value)} />
    </button>
  );
}

/**
 * General settings tab — edit channel description and private flag.
 *
 * Only the channel owner can modify settings; other roles see the description
 * textarea in read-only mode.  Saving issues a PATCH request and calls
 * `onChannelUpdated` with the server-returned channel object on success.
 *
 * @param channel          - The current channel (name, description, is_private).
 * @param myRole           - Caller's channel role; editing is gated behind "owner".
 * @param onChannelUpdated - Callback invoked with the updated Channel after a
 *                           successful save.
 */
export function GeneralTab({ channel, myRole, onChannelUpdated }: { channel: Channel; myRole: ChannelRole | string; onChannelUpdated: (ch: Channel) => void }) {
  const [desc, setDesc]     = useState(channel.description || "");
  const [priv, setPriv]     = useState(!!channel.is_private);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");
  const { authFetch } = useAuth();

  async function save() {
    setSaving(true); setMsg("");
    try {
      const res = await authFetch<{ channel: Channel }>(`${API}/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description: desc, is_private: priv ? 1 : 0 }),
      });
      onChannelUpdated(res.channel);
      setMsg("Saved!");
    } catch (e) { setMsg("Error: " + (e instanceof Error ? e.message : "Failed to save")); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={s.field}>
        <label style={s.label}>Description</label>
        <textarea style={s.textarea} value={desc} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDesc(e.target.value)} placeholder="Channel description..." disabled={myRole !== "owner"} />
      </div>
      {myRole === "owner" && (
        <div style={s.toggleRow}>
          <Toggle value={priv} onChange={setPriv} />
          <div>
            <div style={{ fontSize: "14px", color: "#f2f3f5" }}>Private channel</div>
            <div style={{ fontSize: "12px", color: "#5c6068" }}>Only invited users can see the channel</div>
          </div>
        </div>
      )}
      {msg && <div style={msg.startsWith("Error") ? s.error : s.success}>{msg}</div>}
      {myRole === "owner" && <button style={s.saveBtn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>}
    </div>
  );
}

/**
 * Members management tab — list all channel members, add new members by
 * username, kick existing members, and change member roles.
 *
 * Management actions (add, kick, role change) are gated behind `canManage`
 * (owner or manager).  Only owners can change roles; managers can only kick.
 * A member cannot be kicked or have their role changed by their own session
 * (`m.id !== currentUserId`), and the owner role is never available in the
 * role selector (to prevent accidental owner transfer via this UI).
 *
 * @param channelId     - ID of the channel whose members are being managed.
 * @param myRole        - Caller's role in this channel.
 * @param currentUserId - The logged-in user's ID, used to hide self-action buttons.
 */
export function MembersTab({ channelId, myRole, currentUserId }: { channelId: number; myRole: ChannelRole | string; currentUserId?: number }) {
  const { members, addMember, removeMember, changeRole } = useChannelMembers(channelId);
  const [newUser, setNewUser] = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const canManage = myRole === "owner" || myRole === "manager";

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newUser.trim()) return;
    setBusy(true); setError("");
    try { await addMember(newUser.trim()); setNewUser(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to add member"); }
    finally { setBusy(false); }
  }

  async function handleKick(userId: number) {
    if (!confirm("Remove this user from the channel?")) return;
    try { await removeMember(userId); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed to remove member"); }
  }

  async function handleRole(userId: number, newRole: Exclude<ChannelRole, "owner">) {
    try { await changeRole(userId, newRole); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed to change role"); }
  }

  return (
    <div>
      {canManage && (
        <form style={{ display: "flex", gap: "8px", marginBottom: "16px" }} onSubmit={handleAdd}>
          <input style={{ ...s.input, flex: 1 }} value={newUser} onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUser(e.target.value)} placeholder="username..." />
          <button type="submit" style={s.saveBtn} disabled={busy}>Add</button>
        </form>
      )}
      {error && <div style={s.error}>{error}</div>}
      {members.map((m) => (
        <div key={m.id} style={s.memberRow}>
          <span style={s.memberAvatar}>{avatarLabel(m)}</span>
          <div style={s.memberName}>
            {m.username}
            {m.global_role === "admin" && (
              <span title="Global admin" style={{ marginLeft: 4, color: "#faa61a", display: "inline-flex", verticalAlign: "text-bottom" }}>
                <Icon name="shield" size={12} />
              </span>
            )}
          </div>
          <span style={s.roleBadge(m.channel_role)}>{m.channel_role}</span>
          {canManage && m.id !== currentUserId && m.channel_role !== "owner" && (
            <>
              {myRole === "owner" && (
                <select style={{ background: "#0f0f1a", border: "1px solid #2d2d3f", color: "#f2f3f5", borderRadius: "6px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}
                  value={m.channel_role} onChange={(e: ChangeEvent<HTMLSelectElement>) => handleRole(m.id, e.target.value as Exclude<ChannelRole, "owner">)}>
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

/**
 * Permissions tab — per-role permission toggles, only accessible to the channel
 * owner.  Renders two sections (manager, member), each showing the four
 * `PERM_DEFS` keys as `Toggle` rows.
 *
 * Per-role saving state is tracked with `Record<string, boolean>` maps so that
 * the "Saved" confirmation appears per-section rather than globally.
 *
 * @param channelId - Channel whose permissions are being configured.
 * @param myRole    - Must be "owner" or the tab renders an access-denied message.
 */
export function PermissionsTab({ channelId, myRole }: { channelId: number; myRole: ChannelRole | string }) {
  const { permissions, updateRole } = useChannelPermissions(channelId);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved,  setSaved]  = useState<Record<string, boolean>>({});

  if (myRole !== "owner") return <div style={{ color: "#5c6068", fontSize: "14px" }}>Only the owner can manage permissions.</div>;
  if (!permissions) return <div style={{ color: "#5c6068" }}>Loading...</div>;

  async function toggle(role: string, key: PermissionKey, val: boolean) {
    setSaving((p) => ({ ...p, [role]: true }));
    try {
      await updateRole(role, { ...permissions[role], [key]: val ? 1 : 0 });
      setSaved((p) => ({ ...p, [role]: true }));
      setTimeout(() => setSaved((p) => ({ ...p, [role]: false })), 1500);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to update permissions"); }
    finally { setSaving((p) => ({ ...p, [role]: false })); }
  }

  return (
    <div>
      {["manager", "member"].map((role) => (
        <div key={role} style={{ marginBottom: "24px" }}>
          <div style={s.sectionTitle}>Role: {role} {saved[role] && <span style={{ color: "#23a55a" }}>Saved</span>}</div>
          {PERM_DEFS.map(({ key, label, desc }) => (
            <div key={key} style={s.permRow}>
              <div><div style={s.permLabel}>{label}</div><div style={s.permDesc}>{desc}</div></div>
              <Toggle value={!!permissions[role]?.[key]} onChange={(v) => toggle(role, key, v)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Invites management tab — create, list, copy, and delete channel invite links.
 *
 * `INVITE_BASE` is the full browser origin + BASE_URL + "invite/" prefix, so
 * the copied URL routes correctly on both dev and production deployments.
 *
 * `copy` writes the full invite URL to the clipboard via `navigator.clipboard.writeText`
 * and shows "Copied" feedback for 2 seconds using a `copied` state + `setTimeout`.
 *
 * @param channelId - Channel for which invites are managed.
 */
export function InvitesTab({ channelId }: { channelId: number }) {
  const { invites, createInvite, deleteInvite } = useChannelInvites(channelId);
  const [maxUses,      setMaxUses]      = useState("");
  const [expiresHours, setExpiresHours] = useState("");
  const [creating,     setCreating]     = useState(false);
  const [copied,       setCopied]       = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    try {
      await createInvite({ maxUses: maxUses ? Number(maxUses) : null, expiresInHours: expiresHours ? Number(expiresHours) : null });
      setMaxUses(""); setExpiresHours("");
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to create invite"); }
    finally { setCreating(false); }
  }

  function copy(code: string) {
    navigator.clipboard.writeText(INVITE_BASE + code).then(() => { setCopied(code); setTimeout(() => setCopied(null), 2000); });
  }

  return (
    <div>
      <div style={{ background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
        <div style={s.sectionTitle}>New invite</div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "120px" }}><label style={s.label}>Max uses</label><input style={s.input} type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="unlimited" /></div>
          <div style={{ flex: 1, minWidth: "120px" }}><label style={s.label}>Expires after (hours)</label><input style={s.input} type="number" min="1" value={expiresHours} onChange={(e) => setExpiresHours(e.target.value)} placeholder="never" /></div>
        </div>
        <button style={{ ...s.saveBtn, marginTop: "12px" }} onClick={handleCreate} disabled={creating}>{creating ? "Generating..." : "Generate invite"}</button>
      </div>
      {invites.length === 0 && <div style={{ color: "#5c6068", fontSize: "13px", textAlign: "center", padding: "16px" }}>No active invites</div>}
      {invites.map((inv) => (
        <div key={inv.code} style={s.inviteRow}>
          <div style={s.inviteCode}>{INVITE_BASE}{inv.code}</div>
          <div style={s.inviteMeta}>
            Created by {inv.created_by_username} · {inv.uses_count}{inv.max_uses ? `/${inv.max_uses}` : ""} uses
            {inv.expires_at && ` · Expires ${new Date(inv.expires_at).toLocaleString("en-US")}`}
          </div>
          <div style={s.inviteActions}>
            <button style={s.secondaryBtn} onClick={() => copy(inv.code)}>{copied === inv.code ? "Copied" : "Copy"}</button>
            <button style={s.dangerBtn} onClick={() => deleteInvite(inv.code)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
