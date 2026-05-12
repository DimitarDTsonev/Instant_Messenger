import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { Message, MessagePatch } from "../types";

type MessagePageResponse<T extends Message = Message> = { messages: T[]; hasMore: boolean };
type PinnedMessagesResponse = { messages?: Message[] };

export function useMessages(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(false);

  useEffect(() => {
    if (!channelId) { setMessages([]); return; }
    setLoading(true);
    authFetch<MessagePageResponse>(`${API}/messages/${channelId}`)
      .then(({ messages, hasMore }) => { setMessages(messages); setHasMore(hasMore); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [channelId, authFetch]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;
    setMessages((prev) => {
      if (!prev.length) return prev;
      const oldest = prev[0];
      authFetch<MessagePageResponse>(`${API}/messages/${channelId}?before=${oldest.id}`)
        .then(({ messages: older, hasMore: more }) => {
          setMessages((cur) => [...older, ...cur]);
          setHasMore(more);
        })
        .catch(console.error);
      return prev;
    });
  }, [channelId, hasMore, authFetch]);

  const addMessage    = useCallback((msg: Message) => setMessages((prev) => [...prev, msg]), []);
  const updateMessage = useCallback((partial: MessagePatch) => {
    setMessages((prev) => prev.map((m) => m.id === partial.id ? { ...m, ...partial } : m));
  }, []);
  const removeMessage = useCallback((messageId: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { messages, loading, hasMore, loadMore, addMessage, updateMessage, removeMessage };
}

export function usePinnedMessages(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!channelId) { setPinnedMessages([]); return; }
    authFetch<PinnedMessagesResponse>(`${API}/messages/${channelId}/pinned`)
      .then(({ messages }) => setPinnedMessages(messages || []))
      .catch(console.error);
  }, [channelId, authFetch]);

  const addPinned = useCallback((msg: Message) => {
    setPinnedMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]);
  }, []);

  const removePin = useCallback((messageId: number) => {
    setPinnedMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return { pinnedMessages, addPinned, removePin };
}