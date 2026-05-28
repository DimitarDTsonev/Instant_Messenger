/**
 * Message search hooks — full-text search across all channels or a single channel.
 *
 * `useGlobalSearch` — searches across all channels the user can access.
 * `useSearch`       — searches within a specific channel.
 *
 * Both hooks enforce a minimum 2-character query before hitting the network,
 * and clear results locally for empty queries.
 *
 * Used by: SearchModal.tsx (global), ChatArea.tsx (per-channel).
 */

import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { SearchResult } from "../types";

type SearchResponse = { results: SearchResult[] };

/**
 * Searches messages across all channels visible to the user.
 *
 * Hits `GET /api/messages/search?q=<encoded>`. Requires at least 2 non-whitespace
 * characters; returns immediately with an empty result otherwise.
 *
 * Built-ins used: `encodeURIComponent`.
 *
 * @returns Object containing:
 *  - `results`     — Array of `SearchResult` objects from all accessible channels.
 *  - `loading`     — `true` while the request is in-flight.
 *  - `query`       — The last submitted query string.
 *  - `search`      — Trigger a global search for `q`.
 *  - `clearSearch` — Reset results and query to empty.
 */
export function useGlobalSearch() {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");

  /**
   * Executes a global message search for `q`.
   * Short queries (< 2 chars) clear results without a network call.
   */
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

  /** Resets results and query to empty. */
  const clearSearch = useCallback(() => { setResults([]); setQuery(""); }, []);

  return { results, loading, query, search, clearSearch };
}

/**
 * Searches messages within a single channel.
 *
 * Hits `GET /api/messages/:channelId/search?q=<encoded>`. The server applies
 * channel-level access control, so users only see messages they can read.
 *
 * @param channelId - ID of the channel to search within, or `null`/`undefined`.
 * @returns Object containing:
 *  - `results`     — Array of `SearchResult` objects from this channel.
 *  - `loading`     — `true` while the request is in-flight.
 *  - `query`       — The last submitted query string.
 *  - `search`      — Trigger a channel-scoped search for `q`.
 *  - `clearSearch` — Reset results and query to empty.
 */
export function useSearch(channelId: number | null | undefined) {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");

  /** Executes a channel-scoped search for `q`. */
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
