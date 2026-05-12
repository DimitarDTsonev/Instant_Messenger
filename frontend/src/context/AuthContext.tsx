import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { AuthSession, AuthUser } from "../types";


import { API_BASE as API } from "../config";

type ErrorResponse = { error?: string };
type AuthFetch = <T = Record<string, unknown>>(url: string, options?: RequestInit) => Promise<T>;

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthSession>;
  register: (username: string, email: string, password: string) => Promise<AuthSession>;
  logout: () => void;
  loginWithToken: (user: AuthUser, token: string, isGuest?: boolean) => void;
  authFetch: AuthFetch;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredToken(): string | null {
  // Check sessionStorage (guest) before localStorage (regular user)
  return sessionStorage.getItem("im_token") || localStorage.getItem("im_token") || null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [loading, setLoading] = useState(true);

  // On mount, validate the stored token; clear it if the server rejects it
  useEffect(() => {
    if (!token) { setLoading(false); return; }

    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ user: AuthUser }>)
      .then(({ user }) => setUser(user))
      .catch(() => {
        // Token is expired or invalid - clear it so the user sees the login page
        setToken(null);
        localStorage.removeItem("im_token");
        sessionStorage.removeItem("im_token");
      })
      .finally(() => setLoading(false));
  }, [token]);
  // Registration
    async function register(username: string, email: string, password: string): Promise<AuthSession> {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json() as AuthSession & ErrorResponse;
    if (!res.ok) throw new Error(data.error || "Registration error");

    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("im_token", data.token);
    return { user: data.user, token: data.token };
  }
  // Login
    async function login(email: string, password: string): Promise<AuthSession> {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json() as AuthSession & ErrorResponse;
    if (!res.ok) throw new Error(data.error || "Login error");

    setUser(data.user);
    setToken(data.token);
    localStorage.setItem("im_token", data.token);
    return { user: data.user, token: data.token };
  }
  // Login with a pre-existing token (after invite / guest flow)
    function loginWithToken(user: AuthUser, token: string, isGuest = false) {
    setUser(user);
    setToken(token);
    if (isGuest) {
      sessionStorage.setItem("im_token", token);
    } else {
      localStorage.setItem("im_token", token);
    }
  }
  // Logout
    function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("im_token");
    sessionStorage.removeItem("im_token");
  }
  // Authenticated fetch helper
    const authFetch = useCallback(async <T = Record<string, unknown>,>(url: string, options: RequestInit = {}): Promise<T> => {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    const data = await res.json() as T & ErrorResponse;
    if (!res.ok) throw new Error(data.error || "Error");
    return data;
  }, [token]) as AuthFetch;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, loginWithToken, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}