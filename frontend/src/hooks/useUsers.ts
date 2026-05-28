/**
 * User data hooks — fetches all users and provides a live user search.
 *
 * `useUsers`      — full user list loaded once on mount; used to populate
 *                   member lists and resolve usernames to avatar labels.
 * `useUserSearch` — debounce-friendly search against `GET /api/auth/search?q=`.
 *
 * Used by: ChatPage.tsx (user list), UserSearchModal.tsx, SidebarDmList.tsx.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { User } from "../types";

type UsersResponse = { users: User[] };

/**
 * Loads all registered users on mount via `GET /api/auth/users`.
 *
 * The list is not paginated — suitable for small deployments where all users
 * can be held in memory.
 *
 * @returns `{ users }` — full flat list of all `User` objects.
 */
export function useUsers() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    authFetch<UsersResponse>(`${API}/auth/users`)
      .then(({ users }) => setUsers(users))
      .catch(console.error);
  }, [authFetch]);

  return { users };
}

/**
 * Provides a username search against the server.
 *
 * The `search(q)` function hits `GET /api/auth/search?q=<encoded>`. Callers
 * typically debounce it (via `useDebounce`) before wiring it to an `onChange`
 * handler. Empty or whitespace-only queries clear results locally without a
 * network call.
 *
 * Built-ins used: `encodeURIComponent`.
 *
 * @returns Object containing:
 *  - `results` — Array of matching `User` objects.
 *  - `loading` — `true` while the search request is in-flight.
 *  - `search`  — Trigger a search for query string `q`.
 *  - `clear`   — Reset results to `[]`.
 */
export function useUserSearch() {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  /**
   * Fetches users matching `q` from the server.
   * No-ops (clears results) if `q` is empty or whitespace.
   *
   * @param q - Partial username to search for.
   */
  const search = useCallback(async (q: string) => {
    if (!q || !q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await authFetch<UsersResponse>(`${API}/auth/search?q=${encodeURIComponent(q)}`);
      setResults(data.users || []);
    } catch (e) {
      console.error("User search error:", e);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  /** Resets the results list to empty without a network call. */
  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}
