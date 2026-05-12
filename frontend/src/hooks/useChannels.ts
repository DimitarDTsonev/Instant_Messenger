import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Channel } from "../types";

type ChannelResponse  = { channel: Channel };
type ChannelsResponse = { channels: Channel[] };

export function useChannels() {
  const { authFetch } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    try {
      const { channels } = await authFetch<ChannelsResponse>(`${API}/channels`);
      setChannels(channels);
    } catch (e) {
      console.error("Channels error:", e);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  const createChannel = useCallback(async (name: string, description = "", is_private: 0 | 1 | boolean = 0) => {
    const { channel } = await authFetch<ChannelResponse>(`${API}/channels`, {
      method: "POST",
      body: JSON.stringify({ name, description, is_private }),
    });
    setChannels((prev) => [...prev, channel].sort((a, b) => a.name.localeCompare(b.name)));
    return channel;
  }, [authFetch]);

  const updateChannel = useCallback(async (id: number, updates: Partial<Channel>) => {
    const { channel } = await authFetch<ChannelResponse>(`${API}/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setChannels((prev) => prev.map((c) => c.id === id ? { ...c, ...channel } : c));
    return channel;
  }, [authFetch]);

  const deleteChannel = useCallback(async (id: number) => {
    await authFetch(`${API}/channels/${id}`, { method: "DELETE" });
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }, [authFetch]);

  return { channels, loading, reload: load, createChannel, updateChannel, deleteChannel };
}