import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Conversation, DirectMessage, Message, MessagePatch, User } from "../types";

type MessagePageResponse<T extends Message = Message> = { messages: T[]; hasMore: boolean };
type DmPageResponse     = MessagePageResponse<DirectMessage> & { partner: User };
type ConversationsResponse = { conversations: Conversation[] };

export function useDm(partnerId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(false);
  const [partner, setPartner]   = useState<User | null>(null);

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

  const addMessage    = useCallback((msg: DirectMessage) => setMessages((prev) => [...prev, msg]), []);
  const updateMessage = useCallback((partial: MessagePatch) => {
    setMessages((prev) => prev.map((m) => m.id === partial.id ? { ...m, ...partial } : m));
  }, []);
  const removeMessage = useCallback((messageId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { messages, loading, hasMore, partner, loadMore, addMessage, updateMessage, removeMessage };
}

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

  const markRead = useCallback((partnerId: number) => {
    setConversations((prev) =>
      prev.map((c) => c.partner_id === partnerId ? { ...c, unread_count: 0 } : c)
    );
  }, []);

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
      return [{ partner_id: partnerId, partner_username: partnerUsername, partner_avatar: partnerAvatar, last_content: msg.content, last_at: msg.created_at, unread_count: incrementUnread ? 1 : 0 }, ...prev];
    });
  }, []);

  return { conversations, reload: load, markRead, upsertConversation };
}