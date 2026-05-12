import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { SearchResult } from "../types";

type SearchResponse = { results: SearchResult[] };

export function useGlobalSearch() {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await authFetch<SearchResponse>(`${API}/messages/search?q=${encodeURIComponent(q)}`);
      setResults(data.results || []);
    } catch (e) {
      console.error("Global search error:", e);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const clearSearch = useCallback(() => { setResults([]); setQuery(""); }, []);

  return { results, loading, query, search, clearSearch };
}

export function useSearch(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q || q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await authFetch<SearchResponse>(`${API}/messages/${channelId}/search?q=${encodeURIComponent(q)}`);
      setResults(data.results);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setLoading(false);
    }
  }, [channelId, authFetch]);

  const clearSearch = useCallback(() => { setResults([]); setQuery(""); }, []);

  return { results, loading, query, search, clearSearch };
}