// ============================================================
//  context/AuthContext.tsx — Global authentication state
//  Provides: user, token, login(), register(), logout(), loginWithToken(), authFetch()
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { AuthSession, AuthUser } from "../types";

/**
 * @typedef {Object} AuthUser
 * @property {number} id           - Unique user ID.
 * @property {string} username     - Display name.
 * @property {string} email        - Email address (guests use a "@guest.local" address).
 * @property {string} [avatar]     - Emoji avatar character.
 * @property {string} [role]       - Global role: "admin" or "user".
 * @property {boolean} [is_guest]  - True when the account is a temporary guest.
 */

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

/**
 * Reads the stored JWT from session/local storage.
 * Checks sessionStorage first (used for guest sessions) before localStorage.
 *
 * @returns {string|null} The stored token, or null if none exists.
 */
function getStoredToken(): string | null {
  // Check sessionStorage (guest) before localStorage (regular user)
  return sessionStorage.getItem("im_token") || localStorage.getItem("im_token") || null;
}

/**
 * AuthProvider - React context provider that manages the current user session.
 *
 * On mount it validates any stored token against GET /api/auth/me.
 * If the token is invalid or missing, the user is treated as logged-out.
 * Persists regular-user tokens in localStorage and guest tokens in sessionStorage
 * so that guest sessions are discarded when the tab is closed.
 *
 * Provided context values:
 * @context
 * @property {AuthUser|null} user              - The authenticated user object, or null when logged out.
 * @property {string|null}   token             - The raw JWT string, or null when logged out.
 * @property {boolean}       loading           - True while the initial /api/auth/me validation is in flight.
 * @property {Function}      login             - (email, password) → Promise<{user, token}>
 * @property {Function}      register          - (username, email, password) → Promise<{user, token}>
 * @property {Function}      logout            - () → void; clears state and both storages.
 * @property {Function}      loginWithToken    - (user, token, isGuest?) → void; sets session from an existing token.
 * @property {Function}      authFetch         - (url, options?) → Promise<any>; authenticated fetch wrapper.
 *
 * @param {Object}      props
 * @param {React.ReactNode} props.children - Child components that will consume the context.
 * @returns {JSX.Element}
 */
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
        // Token is expired or invalid — clear it so the user sees the login page
        setToken(null);
        localStorage.removeItem("im_token");
        sessionStorage.removeItem("im_token");
      })
      .finally(() => setLoading(false));
  }, [token]);

  // -----------------------------------------------------------
  // Registration
  // -----------------------------------------------------------
  /**
   * Registers a new account and immediately signs in.
   *
   * @param {string} username
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{user: AuthUser, token: string}>}
   * @throws {Error} When the server returns a non-2xx status.
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

  // -----------------------------------------------------------
  // Login
  // -----------------------------------------------------------
  /**
   * Authenticates an existing account with email and password.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{user: AuthUser, token: string}>}
   * @throws {Error} When credentials are invalid or the server returns an error.
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

  // -----------------------------------------------------------
  // Login with a pre-existing token (after invite / guest flow)
  // -----------------------------------------------------------
  /**
   * Signs in directly using a token that was obtained outside the normal
   * login flow (e.g. after accepting a channel invite or creating a guest account).
   *
   * @param {AuthUser} user     - The user object returned by the invite/guest endpoint.
   * @param {string}   token    - The JWT to store.
   * @param {boolean}  [isGuest=false] - When true the token is stored in sessionStorage only,
   *                                     so it is discarded when the tab closes.
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

  // -----------------------------------------------------------
  // Logout
  // -----------------------------------------------------------
  /**
   * Signs the current user out by clearing in-memory state and both storages.
   */
  function logout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem("im_token");
    sessionStorage.removeItem("im_token");
  }

  // -----------------------------------------------------------
  // Authenticated fetch helper
  // -----------------------------------------------------------
  /**
   * Wraps the native `fetch` API with automatic JSON headers and the
   * current Bearer token.  Throws on non-2xx responses.
   *
   * @type {Function}
   * @param {string}  url              - Absolute URL to request.
   * @param {Object}  [options={}]     - Standard fetch init options (method, body, …).
   * @returns {Promise<any>}           - The parsed JSON response body.
   * @throws {Error}                   - When the server returns a non-2xx status.
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
 * useAuth - Consumes the AuthContext.
 *
 * Must be called inside an {@link AuthProvider} tree.
 *
 * @returns {{
 *   user: AuthUser|null,
 *   token: string|null,
 *   loading: boolean,
 *   login: Function,
 *   register: Function,
 *   logout: Function,
 *   loginWithToken: Function,
 *   authFetch: Function,
 * }}
 * @throws {Error} When used outside of an AuthProvider.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
