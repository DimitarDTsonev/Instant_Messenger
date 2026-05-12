import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { ChannelRole, User } from "../types";

type MembersResponse = { members: User[]; user?: User };
type EditableChannelRole = Exclude<ChannelRole, "owner">;

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

  const addMember = useCallback(async (username: string) => {
    const data = await authFetch<MembersResponse>(`${API}/channels/${channelId}/members`, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    await load();
    return data.user;
  }, [channelId, authFetch, load]);

  const removeMember = useCallback(async (userId: number) => {
    await authFetch(`${API}/channels/${channelId}/members/${userId}`, { method: "DELETE" });
    setMembers((prev) => prev.filter((m) => m.id !== userId));
  }, [channelId, authFetch]);

  const changeRole = useCallback(async (userId: number, role: EditableChannelRole) => {
    await authFetch(`${API}/channels/${channelId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, channel_role: role } : m));
  }, [channelId, authFetch]);

  return { members, load, addMember, removeMember, changeRole };
}