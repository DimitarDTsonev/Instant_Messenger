import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { User } from "../types";

type UsersResponse = { users: User[] };

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

export function useUserSearch() {
  const { authFetch } = useAuth();
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

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

  const clear = useCallback(() => setResults([]), []);

  return { results, loading, search, clear };
}