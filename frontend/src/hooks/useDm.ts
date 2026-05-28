/**
 * Direct message hooks — per-conversation message loading and conversation list management.
 *
 * `useDm`             — loads and manages the message list for a single DM conversation.
 * `useConversations`  — loads the conversation list (sidebar) and keeps unread
 *                       counts up-to-date.
 *
 * Both hooks follow the same pattern as their channel equivalents in useMessages.ts
 * and useChannels.ts: initial HTTP load + local mutators for socket-driven updates.
 *
 * Used by: ChatPage.tsx (conversation list + active DM).
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Conversation, DirectMessage, Message, MessagePatch, User } from "../types";

type MessagePageResponse<T extends Message = Message> = { messages: T[]; hasMore: boolean };
type DmPageResponse     = MessagePageResponse<DirectMessage> & { partner: User };
type ConversationsResponse = { conversations: Conversation[] };

/**
 * Loads and manages the message list for a DM conversation with `partnerId`.
 *
 * Fetches from `GET /api/dm/:partnerId` on mount and on `partnerId` change.
 * Keyset pagination via `?before=<id>` is supported through `loadMore`.
 *
 * @param partnerId - The other user's ID, or `null`/`undefined` to clear state.
 * @returns Object containing:
 *  - `messages`      — Ordered array of `DirectMessage` objects.
 *  - `loading`       — `true` during the initial fetch.
 *  - `hasMore`       — Whether older messages are available.
 *  - `partner`       — The partner `User` object (populated by the initial fetch).
 *  - `loadMore`      — Loads the next older page.
 *  - `addMessage`    — Appends a new DM (called on `dm:new` socket event).
 *  - `updateMessage` — Merges a partial patch (called on `dm:edited`, `dm:reacted`).
 *  - `removeMessage` — Removes a DM by ID (called on `dm:deleted`).
 */
export function useDm(partnerId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(false);
  const [partner, setPartner]   = useState<User | null>(null);

  // Reload when the active DM partner changes
  useEffect(() => {
    if (!partnerId) { setMessages([]); setPartner(null); return; }
    setLoading(true);
    authFetch<DmPageResponse>(`${API}/dm/${partnerId}`)
      .then(({ messages, hasMore, partner }) => {
        setMessages(messages); setHasMore(hasMore); setPartner(partner);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [partnerId, authFetch]);

  /**
   * Loads the page of DMs that precede the current oldest message.
   * Uses keyset pagination (`?before=<id>`) to avoid offset drift.
   */
  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    setMessages((prev) => {
      if (!prev.length) return prev;
      const oldest = prev[0];
      authFetch<MessagePageResponse<DirectMessage>>(`${API}/dm/${partnerId}?before=${oldest.id}`)
        .then(({ messages: older, hasMore: more }) => {
          setMessages((cur) => [...older, ...cur]);
          setHasMore(more);
        })
        .catch(console.error);
      return prev;
    });
  }, [partnerId, hasMore, authFetch]);

  /** Appends a DM from the `dm:new` socket event. */
  const addMessage    = useCallback((msg: DirectMessage) => setMessages((prev) => [...prev, msg]), []);

  /** Merges partial fields from `dm:edited` / `dm:reacted` socket events. */
  const updateMessage = useCallback((partial: MessagePatch) => {
    setMessages((prev) => prev.map((m) => m.id === partial.id ? { ...m, ...partial } : m));
  }, []);

  /** Removes a DM from the `dm:deleted` socket event. */
  const removeMessage = useCallback((messageId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { messages, loading, hasMore, partner, loadMore, addMessage, updateMessage, removeMessage };
}

/**
 * Loads and manages the sidebar conversation list.
 *
 * Fetches from `GET /api/dm/conversations` on mount. The list is updated
 * locally when new DMs arrive (via `upsertConversation`) or when the user
 * opens a conversation (via `markRead`) so the sidebar stays accurate without
 * polling.
 *
 * @returns Object containing:
 *  - `conversations`     — Array of `Conversation` objects sorted by latest message.
 *  - `reload`            — Re-fetches the full conversation list.
 *  - `markRead`          — Resets the unread count for a partner to 0.
 *  - `upsertConversation` — Creates or updates a conversation entry on new DM arrival.
 */
export function useConversations() {
  const { authFetch } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const load = useCallback(async () => {
    try {
      const { conversations } = await authFetch<ConversationsResponse>(`${API}/dm/conversations`);
      setConversations(conversations);
    } catch (e) { console.error("Conversations error:", e); }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * Resets the unread count for `partnerId` to 0.
   * Called when the user opens the DM with that partner.
   */
  const markRead = useCallback((partnerId: number) => {
    setConversations((prev) =>
      prev.map((c) => c.partner_id === partnerId ? { ...c, unread_count: 0 } : c)
    );
  }, []);

  /**
   * Creates a new conversation entry or updates the existing one when a DM arrives.
   *
   * If a conversation with `partnerId` already exists, it is updated in place
   * (last message + optional unread increment). Otherwise a new entry is prepended.
   *
   * @param msg              - The new DM message.
   * @param partnerId        - The other user's ID.
   * @param partnerUsername  - Username for display.
   * @param partnerAvatar    - Avatar label for display.
   * @param incrementUnread  - `true` to bump unread count (false when we sent the message).
   */
  const upsertConversation = useCallback((
    msg: Message, partnerId: number, partnerUsername: string,
    partnerAvatar?: string | null, incrementUnread = true,
  ) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.partner_id === partnerId);
      if (exists) {
        return prev.map((c) =>
          c.partner_id === partnerId
            ? { ...c, last_content: msg.content, last_at: msg.created_at, unread_count: incrementUnread ? c.unread_count + 1 : c.unread_count }
            : c
        );
      }
      // First message from this partner — create a new conversation entry
      return [{ partner_id: partnerId, partner_username: partnerUsername, partner_avatar: partnerAvatar, last_content: msg.content, last_at: msg.created_at, unread_count: incrementUnread ? 1 : 0 }, ...prev];
    });
  }, []);

  return { conversations, reload: load, markRead, upsertConversation };
}
