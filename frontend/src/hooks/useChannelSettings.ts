/**
 * Channel permission and invite hooks.
 *
 * `useChannelPermissions` — fetches and updates per-role permission overrides
 *                           for a channel (who can send, who can upload, etc.).
 * `useChannelInvites`     — fetches, creates, and deletes invite links for a channel.
 *
 * Used by: ChannelSettingsModal.tsx → ChannelSettingsTabs.tsx
 *          (Permissions tab, Invites tab).
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { ChannelInvite, ChannelPermissions, PermissionSet } from "../types";

type PermissionsResponse = { permissions: ChannelPermissions };
type InvitesResponse     = { invites: ChannelInvite[] };
type InviteResponse      = { invite: ChannelInvite };

/**
 * Fetches and manages per-role channel permissions.
 *
 * Hits `GET /api/channels/:channelId/permissions` and exposes `updateRole`
 * to apply partial permission changes via `PUT /api/channels/:channelId/permissions/:role`.
 * Local state is merged on success so the UI reflects changes immediately.
 *
 * @param channelId - Active channel ID, or `null`/`undefined` to clear state.
 * @returns Object containing:
 *  - `permissions` — `ChannelPermissions` object mapping role → `PermissionSet`, or `null` while loading.
 *  - `updateRole`  — Applies partial permission overrides for a given role.
 */
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

  /**
   * Updates permission overrides for `role` via `PUT /api/channels/:id/permissions/:role`.
   * Merges the new permissions into local state optimistically.
   *
   * @param role  - Role key to update (e.g. `"member"`, `"manager"`).
   * @param perms - Partial `PermissionSet` with the fields to override.
   */
  const updateRole = useCallback(async (role: string, perms: Partial<PermissionSet>) => {
    await authFetch(`${API}/channels/${channelId}/permissions/${role}`, {
      method: "PUT",
      body: JSON.stringify(perms),
    });
    setPermissions((prev) => prev ? { ...prev, [role]: { ...prev[role], ...perms } } : prev);
  }, [channelId, authFetch]);

  return { permissions, updateRole };
}

/**
 * Fetches and manages invite links for a channel.
 *
 * Hits `GET /api/channels/:channelId/invites` on mount. `createInvite` POSTs
 * a new invite and prepends it to the list. `deleteInvite` removes it by code.
 *
 * @param channelId - Active channel ID, or `null`/`undefined` to clear state.
 * @returns Object containing:
 *  - `invites`      — Array of `ChannelInvite` objects.
 *  - `createInvite` — Generates a new invite with optional expiry and use-count limits.
 *  - `deleteInvite` — Revokes an invite link by its `code`.
 */
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

  /**
   * Creates a new invite link via `POST /api/channels/:id/invites`.
   * Prepends the new invite to the list.
   *
   * @param opts.maxUses       - Maximum number of times the link can be used (null = unlimited).
   * @param opts.expiresInHours - Hours until the link expires (null = never).
   * @returns                  The newly created `ChannelInvite` object.
   */
  const createInvite = useCallback(async (opts: { maxUses?: number | null; expiresInHours?: number | null } = {}) => {
    const { invite } = await authFetch<InviteResponse>(`${API}/channels/${channelId}/invites`, {
      method: "POST",
      body: JSON.stringify(opts),
    });
    setInvites((prev) => [invite, ...prev]);
    return invite;
  }, [channelId, authFetch]);

  /**
   * Revokes an invite link via `DELETE /api/channels/:id/invites/:code`.
   *
   * @param code - The invite's unique code string.
   */
  const deleteInvite = useCallback(async (code: string) => {
    await authFetch(`${API}/channels/${channelId}/invites/${code}`, { method: "DELETE" });
    setInvites((prev) => prev.filter((i) => i.code !== code));
  }, [channelId, authFetch]);

  return { invites, createInvite, deleteInvite };
}
