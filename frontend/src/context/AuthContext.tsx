/**
 * Authentication context — provides the current user session, login/logout
 * functions, and an authenticated fetch helper to the entire component tree.
 *
 * Key responsibilities:
 *  1. Token persistence: stores the JWT in localStorage (regular users) or
 *     sessionStorage (guest accounts, cleared on tab close).
 *  2. Token validation on mount: calls /api/auth/me to verify the stored
 *     token and detect server restarts via `serverStartupId`.
 *  3. Auto-logout after 1 hour of inactivity (mousemove/keydown/click/touchstart/scroll).
 *  4. Server-restart logout: if the server's startup ID changes the user is
 *     logged out and shown a notification on the login page.
 *
 * Consumed by: every component that needs the current user or token.
 * Provided by: App.tsx (wraps the entire tree).
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { AuthSession, AuthUser } from "../types";

import { API_BASE as API } from "../config";

/** Duration of inactivity (ms) before auto-logout fires. */
const INACTIVE_MS = 60 * 60 * 1000; // 1 hour

/** sessionStorage key used to persist the server startup ID across page refreshes. */
const SERVER_STARTUP_KEY = "im_server_startup";

type ErrorResponse = { error?: string };

/**
 * Authenticated fetch helper type.
 * Makes a JSON request with the current Bearer token attached.
 */
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

/**
 * Reads the JWT from storage on first render.
 * Checks sessionStorage (guest) before localStorage (regular user) so
 * a guest token is found even if a regular token exists from an older session.
 */
function getStoredToken(): string | null {
  return sessionStorage.getItem("im_token") || localStorage.getItem("im_token") || null;
}

/**
 * Provides authentication state and helpers to the component tree.
 *
 * Renders immediately with the stored token (if any), then validates it
 * asynchronously. During validation `loading` is `true` so the app can
 * display a spinner instead of the login page.
 *
 * @param children - The React subtree to wrap.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]     = useState<AuthUser | null>(null);
  const [token, setToken]   = useState<string | null>(getStoredToken);
  const [loading, setLoading] = useState(true);
  /** Tracks the timestamp of the last user interaction for inactivity detection. */
  const lastActivity = useRef(Date.now());

  /**
   * Clears the session from state and storage.
   * Stable reference (empty deps array) so it can safely be used in effects.
   */
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("im_token");
    sessionStorage.removeItem("im_token");
  }, []);

  // ─── Token validation on mount ────────────────────────────────────────────
  // Calls /api/auth/me to verify the stored token. If the server has restarted
  // (different serverStartupId) the user is logged out with an explanation.
  useEffect(() => {
    if (!token) { setLoading(false); return; }

    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json() as Promise<{ user: AuthUser; serverStartupId?: string }>)
      .then(({ user, serverStartupId }) => {
        const storedStartup = sessionStorage.getItem(SERVER_STARTUP_KEY);
        // Detect server restart: stored ID exists but differs from the current one
        if (storedStartup && serverStartupId && storedStartup !== serverStartupId) {
          sessionStorage.removeItem(SERVER_STARTUP_KEY);
          sessionStorage.setItem("im_logout_reason", "server_restart");
          logout();
          return;
        }
        if (serverStartupId) {
          sessionStorage.setItem(SERVER_STARTUP_KEY, serverStartupId);
        }
        setUser(user);
      })
      .catch(() => {
        // Token is expired or invalid — clear it so the login page is shown
        setToken(null);
        localStorage.removeItem("im_token");
        sessionStorage.removeItem("im_token");
      })
      .finally(() => setLoading(false));
  }, [token, logout]);

  // ─── Inactivity auto-logout ───────────────────────────────────────────────
  // Listens to activity events and checks every 30 s whether 1 hour has passed.
  // Only active while a user is logged in.
  useEffect(() => {
    if (!user) return;
    lastActivity.current = Date.now();

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;
    const onActivity = () => { lastActivity.current = Date.now(); };
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const interval = setInterval(() => {
      if (Date.now() - lastActivity.current >= INACTIVE_MS) {
        sessionStorage.setItem("im_logout_reason", "inactivity");
        logout();
      }
    }, 30_000);

    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity));
      clearInterval(interval);
    };
  }, [user, logout]);

  /**
   * Registers a new account and stores the returned token in localStorage.
   *
   * @param username - Desired username.
   * @param email    - User's email address.
   * @param password - Plain-text password (validated by the backend).
   * @returns        `{ user, token }` on success.
   * @throws         Error with the server's error message on failure.
   */
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

  /**
   * Authenticates with email and password and stores the token in localStorage.
   *
   * @param email    - User's email address.
   * @param password - Plain-text password.
   * @returns        `{ user, token }` on success.
   * @throws         Error with the server's error message on failure.
   */
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

  /**
   * Stores a pre-existing token (from invite flow or guest creation) in state
   * and the appropriate storage — sessionStorage for guests, localStorage for others.
   *
   * @param user    - The authenticated user object.
   * @param token   - The JWT to store.
   * @param isGuest - If `true`, token is stored in sessionStorage (cleared on tab close).
   */
  function loginWithToken(user: AuthUser, token: string, isGuest = false) {
    setUser(user);
    setToken(token);
    if (isGuest) {
      sessionStorage.setItem("im_token", token);
    } else {
      localStorage.setItem("im_token", token);
    }
  }

  /**
   * Wrapper around `fetch` that automatically attaches the current Bearer token
   * and parses the JSON response. Throws if the response is not OK.
   *
   * `useCallback` with `[token]` dep ensures the function is re-created when
   * the token changes (e.g. after login).
   *
   * @param url     - Absolute URL to request.
   * @param options - Optional `RequestInit` options (method, body, headers, etc.).
   * @returns       The parsed response body as type `T`.
   * @throws        Error with the server's `error` field if `!res.ok`.
   */
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

/**
 * Consumes the AuthContext.
 * Must be called from a component inside `<AuthProvider>`.
 *
 * @returns The current AuthContextValue.
 * @throws  Error if called outside of an AuthProvider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
