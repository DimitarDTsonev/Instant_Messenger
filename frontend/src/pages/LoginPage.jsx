/**
 * @fileoverview LoginPage — Entry authentication page
 *
 * Renders a centered card with two modes:
 *   - Login  (default): email + password → calls `useAuth().login()`
 *   - Register: username + email + password → calls `useAuth().register()`
 *
 * Pre-fills the demo credentials (alice@demo.com / password123) for easy first-run access.
 * On successful auth, `AuthContext` updates `user` and the app re-renders to `ChatPage`.
 *
 * @module pages/LoginPage
 * @connects AuthContext — consumes login() and register()
 */

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import ForgotPasswordPage from "./ForgotPasswordPage";

/**
 * Inline style map for the login/register card UI.
 * All styles are defined statically to avoid re-allocation on every render.
 *
 * @type {Object}
 * @property {Object} page         - Full-viewport flex container with gradient background
 * @property {Object} card         - Centered content card with rounded corners
 * @property {Object} logo         - Logo area at the top of the card
 * @property {Object} logoIcon     - Large emoji icon block
 * @property {Object} logoTitle    - App name headline
 * @property {Object} logoSub      - Subtitle / tagline beneath the title
 * @property {Object} tabs         - Pill-shaped tab row for switching login/register
 * @property {Function} tab        - Returns tab button style; active tab is highlighted in indigo
 * @property {Object} fieldGroup   - Wrapper for each label+input pair
 * @property {Object} label        - Uppercase small-caps field label
 * @property {Object} input        - Dark-themed text input
 * @property {Object} submit       - Full-width submit button
 * @property {Object} error        - Red-tinted error message box
 * @property {Object} hint         - Muted footer hint text (demo credentials)
 */
const styles = {
  page: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)",
  },
  card: {
    background: "#1e1e2e",
    border: "1px solid #2d2d3f",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  logo: { textAlign: "center", marginBottom: "32px" },
  logoIcon: { fontSize: "48px", display: "block", marginBottom: "8px" },
  logoTitle: { fontSize: "24px", fontWeight: 700, color: "#f2f3f5", letterSpacing: "-0.5px" },
  logoSub: { fontSize: "13px", color: "#5c6068", marginTop: "4px" },
  tabs: {
    display: "flex",
    background: "#0f0f1a",
    borderRadius: "8px",
    padding: "4px",
    marginBottom: "24px",
  },
  /** @param {boolean} active - Whether this tab is the selected one */
  tab: (active) => ({
    flex: 1,
    padding: "8px",
    borderRadius: "6px",
    background: active ? "#5865f2" : "transparent",
    color: active ? "#fff" : "#949ba4",
    fontSize: "13px",
    fontWeight: active ? 600 : 400,
    transition: "all 0.2s",
    fontFamily: "inherit",
    border: "none",
    cursor: "pointer",
  }),
  fieldGroup: { marginBottom: "16px" },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#949ba4",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    background: "#0f0f1a",
    border: "1px solid #2d2d3f",
    borderRadius: "8px",
    color: "#f2f3f5",
    fontSize: "15px",
  },
  submit: {
    width: "100%",
    padding: "12px",
    background: "#5865f2",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "8px",
  },
  error: {
    background: "#f23f4220",
    border: "1px solid #f23f4240",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#f23f42",
    fontSize: "13px",
    marginBottom: "16px",
  },
  hint: {
    textAlign: "center",
    fontSize: "12px",
    color: "#5c6068",
    marginTop: "20px",
  },
};

/**
 * LoginPage component — full-page auth entry point.
 *
 * Manages a single form that switches between login and register modes.
 * On success, AuthContext sets the authenticated user and the app navigates
 * to ChatPage automatically (no explicit redirect needed).
 *
 * @component
 * @returns {JSX.Element} The centered login/register card
 *
 * @example
 * // Rendered by App.jsx when no authenticated user is present
 * <LoginPage />
 */
export default function LoginPage() {
  /** @type {{ login: Function, register: Function }} */
  const { login, register } = useAuth();

  const [showForgot, setShowForgot] = useState(false);

  /** @type {["login"|"register", Function]} Current tab mode */
  const [mode, setMode] = useState("login");

  /** @type {[string, Function]} Server-side or network error message to display */
  const [error, setError] = useState("");

  /** @type {[boolean, Function]} True while the auth request is in-flight */
  const [loading, setLoading] = useState(false);

  /**
   * Controlled form state.
   * `email` and `password` are pre-filled with demo credentials so new visitors
   * can log in immediately without typing.
   *
   * @type {[{ username: string, email: string, password: string }, Function]}
   */
  const [form, setForm] = useState({ username: "", email: "alice@demo.com", password: "password123" });

  /**
   * Syncs a changed input field into `form` and clears any visible error.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event
   */
  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
  }

  /**
   * Submits the form by calling the appropriate AuthContext action.
   * Displays server error messages inline if the request fails.
   *
   * @param {React.FormEvent<HTMLFormElement>} e - The form submit event
   * @returns {Promise<void>}
   */
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form.username, form.email, form.password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (showForgot) return <ForgotPasswordPage onBack={() => setShowForgot(false)} />;

  return (
    <div style={styles.page}>
      <div style={styles.card} className="login-card">
        {/* Logo / branding */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>💬</span>
          <div style={styles.logoTitle}>Instant Messenger</div>
          <div style={styles.logoSub}>Real-time public channels</div>
        </div>

        {/* Login / Register tab switcher */}
        <div style={styles.tabs}>
          <button style={styles.tab(mode === "login")} onClick={() => setMode("login")}>Login</button>
          <button style={styles.tab(mode === "register")} onClick={() => setMode("register")}>Register</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={styles.error}>⚠️ {error}</div>}

          {/* Username field — only shown in register mode */}
          {mode === "register" && (
            <div style={styles.fieldGroup}>
              <label htmlFor="reg-username" style={styles.label}>Username</label>
              <input
                id="reg-username"
                name="username"
                style={styles.input}
                value={form.username}
                onChange={handleChange}
                placeholder="alice"
                autoComplete="username"
                required
              />
            </div>
          )}

          <div style={styles.fieldGroup}>
            <label htmlFor="field-email" style={styles.label}>Email</label>
            <input
              id="field-email"
              name="email"
              type="email"
              style={styles.input}
              value={form.email}
              onChange={handleChange}
              placeholder="alice@demo.com"
              autoComplete="email"
              required
            />
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="field-password" style={styles.label}>Password</label>
            <input
              id="field-password"
              name="password"
              type="password"
              style={styles.input}
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>

          <button
            type="submit"
            style={{ ...styles.submit, opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? "⏳ Loading..." : mode === "login" ? "Sign in →" : "Create account →"}
          </button>
        </form>

        {/* Forgot password link — only shown on the login tab */}
        {mode === "login" && (
          <div style={{ ...styles.hint, marginTop: "12px" }}>
            <button
              type="button"
              style={{ background: "transparent", border: "none", color: "#5865f2", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
              onClick={() => setShowForgot(true)}
              data-testid="forgot-password-link"
            >
              Forgot password?
            </button>
          </div>
        )}

        {/* Demo credentials hint — only shown on the login tab */}
        {mode === "login" && (
          <div style={styles.hint}>Demo account: alice@demo.com / password123</div>
        )}
      </div>
    </div>
  );
}
