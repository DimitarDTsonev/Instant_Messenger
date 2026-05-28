/**
 * Channel list management hook — fetches and mutates the user's channel list.
 *
 * Fetches all channels the current user can see on mount and provides CRUD
 * helpers. Local state is updated optimistically after each mutation so the UI
 * reflects changes immediately without a full reload.
 *
 * Used by: ChatPage.tsx (primary channel list), ChannelSettingsModal.tsx.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Channel } from "../types";

type ChannelResponse  = { channel: Channel };
type ChannelsResponse = { channels: Channel[] };

/**
 * Manages the list of channels accessible to the authenticated user.
 *
 * Loads channels on mount via `GET /api/channels`. All mutation helpers keep
 * local state in sync so the sidebar re-renders without an extra fetch.
 *
 * @returns Object containing:
 *  - `channels`      — Sorted alphabetical channel list.
 *  - `loading`       — `true` while the initial fetch is in progress.
 *  - `reload`        — Manually re-fetch the channel list.
 *  - `createChannel` — POST to create a new channel; appends and sorts locally.
 *  - `updateChannel` — PATCH a channel; merges updates locally.
 *  - `deleteChannel` — DELETE a channel; removes it from local state.
 */
export function useChannels() {
  const { authFetch } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading]   = useState(true);

  /**
   * Fetches all accessible channels from `GET /api/channels`.
   * Stable reference via `useCallback([authFetch])`.
   */
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

  /**
   * Creates a new channel via `POST /api/channels` and inserts it into the
   * sorted local list.
   *
   * @param name        - Channel name (server normalises to lowercase-kebab).
   * @param description - Optional channel description.
   * @param is_private  - `1` or `true` for a private channel, `0` for public.
   * @returns           The newly created `Channel` object.
   * @throws            Error from the server if the name is taken or invalid.
   */
  const createChannel = useCallback(async (name: string, description = "", is_private: 0 | 1 | boolean = 0) => {
    const { channel } = await authFetch<ChannelResponse>(`${API}/channels`, {
      method: "POST",
      body: JSON.stringify({ name, description, is_private }),
    });
    // Insert and keep the list sorted alphabetically
    setChannels((prev) => [...prev, channel].sort((a, b) => a.name.localeCompare(b.name)));
    return channel;
  }, [authFetch]);

  /**
   * Updates a channel via `PATCH /api/channels/:id`.
   * Merges `updates` into the existing channel in local state.
   *
   * @param id      - ID of the channel to update.
   * @param updates - Partial channel fields to change (name, description, etc.).
   * @returns       The full updated `Channel` object.
   */
  const updateChannel = useCallback(async (id: number, updates: Partial<Channel>) => {
    const { channel } = await authFetch<ChannelResponse>(`${API}/channels/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setChannels((prev) => prev.map((c) => c.id === id ? { ...c, ...channel } : c));
    return channel;
  }, [authFetch]);

  /**
   * Deletes a channel via `DELETE /api/channels/:id` and removes it from
   * local state.
   *
   * @param id - ID of the channel to delete.
   */
  const deleteChannel = useCallback(async (id: number) => {
    await authFetch(`${API}/channels/${id}`, { method: "DELETE" });
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }, [authFetch]);

  return { channels, loading, reload: load, createChannel, updateChannel, deleteChannel };
}
