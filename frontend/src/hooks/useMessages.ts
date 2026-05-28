/**
 * Channel message hooks — paginated message loading and pinned-message management.
 *
 * `useMessages`      — loads the initial page for a channel and supports keyset
 *                      pagination via `loadMore`. Exposes local mutators for
 *                      real-time socket updates (add / update / remove).
 * `usePinnedMessages` — loads pinned messages for a channel and exposes add/remove
 *                       mutators driven by socket pin/unpin events.
 *
 * Used by: ChatPage.tsx, ChatArea.tsx, PinnedBanner.tsx.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Message, MessagePatch } from "../types";

type MessagePageResponse<T extends Message = Message> = { messages: T[]; hasMore: boolean };
type PinnedMessagesResponse = { messages?: Message[] };

/**
 * Loads and manages the message list for a single channel.
 *
 * Fetches the most recent page from `GET /api/messages/:channelId` on mount and
 * whenever `channelId` changes. Older pages are loaded on demand via `loadMore`
 * using keyset pagination (`?before=<oldest id>`).
 *
 * Local mutators (`addMessage`, `updateMessage`, `removeMessage`) are called by
 * `useChatSocket` to apply real-time socket events without a full reload.
 *
 * Built-ins used: `useState`, `useEffect`, `useCallback`.
 *
 * @param channelId - Active channel ID, or `null`/`undefined` to clear state.
 * @returns Object containing:
 *  - `messages`      — Ordered array of `Message` objects (oldest first).
 *  - `loading`       — `true` during the initial fetch.
 *  - `hasMore`       — Whether older messages are available to load.
 *  - `loadMore`      — Loads the next older page prepended to `messages`.
 *  - `addMessage`    — Appends a new message (called on `message:new` socket event).
 *  - `updateMessage` — Merges a partial patch into a matching message.
 *  - `removeMessage` — Removes a message by ID.
 */
export function useMessages(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(false);

  // Reload the first page whenever the active channel changes
  useEffect(() => {
    if (!channelId) { setMessages([]); return; }
    setLoading(true);
    authFetch<MessagePageResponse>(`${API}/messages/${channelId}`)
      .then(({ messages, hasMore }) => { setMessages(messages); setHasMore(hasMore); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [channelId, authFetch]);

  /**
   * Loads the page of messages that precede the current oldest message.
   * Uses keyset pagination (`?before=<id>`) to avoid offset drift.
   * No-ops if `hasMore` is false.
   */
  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    // Read the oldest message ID inside the setter to avoid stale closure
    setMessages((prev) => {
      if (!prev.length) return prev;
      const oldest = prev[0];
      authFetch<MessagePageResponse>(`${API}/messages/${channelId}?before=${oldest.id}`)
        .then(({ messages: older, hasMore: more }) => {
          setMessages((cur) => [...older, ...cur]);
          setHasMore(more);
        })
        .catch(console.error);
      return prev; // Return unchanged — the async response will update state
    });
  }, [channelId, hasMore, authFetch]);

  /** Appends a message received from the `message:new` socket event. */
  const addMessage    = useCallback((msg: Message) => setMessages((prev) => [...prev, msg]), []);

  /**
   * Merges `partial` fields into the matching message.
   * Called for `message:edited` and `message:reacted` socket events.
   */
  const updateMessage = useCallback((partial: MessagePatch) => {
    setMessages((prev) => prev.map((m) => m.id === partial.id ? { ...m, ...partial } : m));
  }, []);

  /** Removes a message by ID, called on `message:deleted` socket events. */
  const removeMessage = useCallback((messageId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { messages, loading, hasMore, loadMore, addMessage, updateMessage, removeMessage };
}

/**
 * Loads and manages the pinned message list for a single channel.
 *
 * Fetches from `GET /api/messages/:channelId/pinned` whenever `channelId`
 * changes. `addPinned` / `removePin` are called by `useChatSocket` when
 * pin/unpin socket events arrive.
 *
 * @param channelId - Active channel ID, or `null`/`undefined` to clear state.
 * @returns Object containing:
 *  - `pinnedMessages` — Array of currently pinned `Message` objects.
 *  - `addPinned`      — Appends a newly pinned message (deduped by ID).
 *  - `removePin`      — Removes a pinned message by ID.
 */
export function usePinnedMessages(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!channelId) { setPinnedMessages([]); return; }
    authFetch<PinnedMessagesResponse>(`${API}/messages/${channelId}/pinned`)
      .then(({ messages }) => setPinnedMessages(messages || []))
      .catch(console.error);
  }, [channelId, authFetch]);

  /**
   * Appends `msg` to the pinned list. Deduplication prevents double-adds
   * if the socket event fires before the HTTP response arrives.
   */
  const addPinned = useCallback((msg: Message) => {
    setPinnedMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]);
  }, []);

  /** Removes the pinned message with `messageId` from the list. */
  const removePin = useCallback((messageId: number) => {
    setPinnedMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { pinnedMessages, addPinned, removePin };
}
