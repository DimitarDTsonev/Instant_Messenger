/**
 * Channel member management hook.
 *
 * Fetches the member list for a channel and provides helpers to add, remove,
 * and change the role of members. Local state is updated after each mutation
 * so the settings modal re-renders without a full reload.
 *
 * Used by: ChannelSettingsModal.tsx → ChannelSettingsTabs.tsx (Members tab).
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { ChannelRole, User } from "../types";

type MembersResponse = { members: User[]; user?: User };
/** Roles that can be assigned via the UI ("owner" can only be set at channel creation). */
type EditableChannelRole = Exclude<ChannelRole, "owner">;

/**
 * Manages the member list for a channel.
 *
 * Fetches from `GET /api/channels/:channelId/members` whenever `channelId`
 * changes. All mutation helpers keep local state in sync.
 *
 * @param channelId - Active channel ID, or `null`/`undefined` to clear state.
 * @returns Object containing:
 *  - `members`      — Array of `User` objects with their `channel_role` populated.
 *  - `load`         — Re-fetches the member list.
 *  - `addMember`    — Adds a user by username via `POST /api/channels/:id/members`.
 *  - `removeMember` — Removes a user via `DELETE /api/channels/:id/members/:userId`.
 *  - `changeRole`   — Changes a member's role via `PATCH /api/channels/:id/members/:userId`.
 */
export function useChannelMembers(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [members, setMembers] = useState<User[]>([]);

  const load = useCallback(async () => {
    if (!channelId) { setMembers([]); return; }
    try {
      const { members } = await authFetch<MembersResponse>(`${API}/channels/${channelId}/members`);
      setMembers(members);
    } catch (e) { console.error("Members error:", e); }
  }, [channelId, authFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * Adds a user to the channel by their username.
   * Re-fetches the full member list after a successful add to pick up the
   * server-assigned `channel_role`.
   *
   * @param username - Username of the user to add.
   * @returns        The newly added `User` object.
   * @throws         Error if the user is not found or already a member.
   */
  const addMember = useCallback(async (username: string) => {
    const data = await authFetch<MembersResponse>(`${API}/channels/${channelId}/members`, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    await load(); // Reload to get the server-assigned role
    return data.user;
  }, [channelId, authFetch, load]);

  /**
   * Removes a member from the channel and updates local state immediately.
   *
   * @param userId - ID of the user to remove.
   */
  const removeMember = useCallback(async (userId: number) => {
    await authFetch(`${API}/channels/${channelId}/members/${userId}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  }, [channelId, authFetch]);

  /**
   * Changes a member's channel role (e.g. "member" → "manager").
   * "owner" is excluded because it can only be held by one user and is set at
   * channel creation time.
   *
   * @param userId - ID of the member whose role should change.
   * @param role   - New role to assign.
   */
  const changeRole = useCallback(async (userId: number, role: EditableChannelRole) => {
    await authFetch(`${API}/channels/${channelId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, channel_role: role } : m));
  }, [channelId, authFetch]);

  return { members, load, addMember, removeMember, changeRole };
}
