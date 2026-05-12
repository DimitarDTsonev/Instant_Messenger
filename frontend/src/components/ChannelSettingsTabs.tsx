import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Channel, ChannelRole, PermissionKey } from "../types";
import { useChannelMembers, useChannelPermissions, useChannelInvites } from "../hooks/useApi";
import { s } from "./channelSettingsStyles";

const INVITE_BASE = `${window.location.origin}${import.meta.env.BASE_URL}invite/`;

const PERM_DEFS: Array<{ key: PermissionKey; label: string; desc: string }> = [
  { key: "can_write",           label: "Can write",       desc: "User can send messages" },
  { key: "can_invite",          label: "Can invite",      desc: "Can generate invite links for the channel" },
  { key: "can_manage_members",  label: "Manage members",  desc: "Can add and remove members" },
  { key: "can_delete_messages", label: "Delete messages", desc: "Can delete other users' messages" },
];

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button style={s.toggle(value)} onClick={() => onChange(!value)}>
      <div style={s.toggleKnob(value)} />
    </button>
  );
}

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
            <div style={{ fontSize: "14px", color: "#f2f3f5" }}>🔒 Private channel</div>
            <div style={{ fontSize: "12px", color: "#5c6068" }}>Only invited users can see the channel</div>
          </div>
        </div>
      )}
      {msg && <div style={msg.startsWith("Error") ? s.error : s.success}>{msg}</div>}
      {myRole === "owner" && <button style={s.saveBtn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>}
    </div>
  );
}

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
          <span style={s.memberAvatar}>{m.avatar || "👤"}</span>
          <div style={s.memberName}>{m.username}{m.global_role === "admin" && <span title="Global admin" style={{ marginLeft: 4 }}>👑</span>}</div>
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
          <div style={s.sectionTitle}>Role: {role} {saved[role] && <span style={{ color: "#23a55a" }}>✓ Saved</span>}</div>
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
          <div style={{ flex: 1, minWidth: "120px" }}><label style={s.label}>Max uses</label><input style={s.input} type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" /></div>
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
            <button style={s.secondaryBtn} onClick={() => copy(inv.code)}>{copied === inv.code ? "✅ Copied!" : "📋 Copy"}</button>
            <button style={s.dangerBtn} onClick={() => deleteInvite(inv.code)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
