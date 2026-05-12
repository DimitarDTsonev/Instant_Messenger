import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { ChannelInvite, ChannelPermissions, PermissionSet } from "../types";

type PermissionsResponse = { permissions: ChannelPermissions };
type InvitesResponse     = { invites: ChannelInvite[] };
type InviteResponse      = { invite: ChannelInvite };

export function useChannelPermissions(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [permissions, setPermissions] = useState<ChannelPermissions | null>(null);

  const load = useCallback(async () => {
    if (!channelId) { setPermissions(null); return; }
    try {
      const { permissions } = await authFetch<PermissionsResponse>(`${API}/channels/${channelId}/permissions`);
      setPermissions(permissions);
    } catch { setPermissions(null); }
  }, [channelId, authFetch]);

  useEffect(() => { load(); }, [load]);

  const updateRole = useCallback(async (role: string, perms: Partial<PermissionSet>) => {
    await authFetch(`${API}/channels/${channelId}/permissions/${role}`, {
      method: "PUT",
      body: JSON.stringify(perms),
    });
    setPermissions((prev) => prev ? { ...prev, [role]: { ...prev[role], ...perms } } : prev);
  }, [channelId, authFetch]);

  return { permissions, updateRole };
}

export function useChannelInvites(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [invites, setInvites] = useState<ChannelInvite[]>([]);

  const load = useCallback(async () => {
    if (!channelId) { setInvites([]); return; }
    try {
      const { invites } = await authFetch<InvitesResponse>(`${API}/channels/${channelId}/invites`);
      setInvites(invites);
    } catch { setInvites([]); }
  }, [channelId, authFetch]);

  useEffect(() => { load(); }, [load]);

  const createInvite = useCallback(async (opts: { maxUses?: number | null; expiresInHours?: number | null } = {}) => {
    const { invite } = await authFetch<InviteResponse>(`${API}/channels/${channelId}/invites`, {
      method: "POST",
      body: JSON.stringify(opts),
    });
    setInvites((prev) => [invite, ...prev]);
    return invite;
  }, [channelId, authFetch]);

  const deleteInvite = useCallback(async (code: string) => {
    await authFetch(`${API}/channels/${channelId}/invites/${code}`, { method: "DELETE" });
    setInvites((prev) => prev.filter((i) => i.code !== code));
  }, [channelId, authFetch]);

  return { invites, createInvite, deleteInvite };
}