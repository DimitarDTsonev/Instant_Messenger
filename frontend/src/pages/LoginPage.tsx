/**
 * LoginPage — the unauthenticated entry point, renders a login/register card.
 *
 * Modes: toggled via the "Login" / "Register" tab switch (local `mode` state).
 *
 * Logout reason: on mount, reads `im_logout_reason` from `sessionStorage` and
 * removes it immediately so it only shows once.  Values:
 *  - "inactivity"     → "You were logged out after 1 hour of inactivity."
 *  - "server_restart" → "You were logged out because the server was restarted."
 *
 * Password validation: `validatePassword()` is run before every register
 * submission; the error string is displayed inline without a server round-trip.
 *
 * ForgotPassword: when `showForgot` is true the component renders
 * `ForgotPasswordPage` in place, passing `onBack` to return here.
 *
 * Demo credentials: email `alice@demo.com` and password `Password@123` are
 * pre-filled in the login form inputs as a convenience for reviewers.
 *
 * Used by: App.tsx (rendered on the "/" route when unauthenticated).
 */
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { validatePassword } from "../utils/validatePassword";

const styles = {
  page: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--col-bg-base)",
  },
  card: {
    background: "var(--col-bg-elevated)",
    border: "1px solid var(--col-border)",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "420px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  logo: { textAlign: "center", marginBottom: "32px" },
  logoIcon: { fontSize: "48px", display: "block", marginBottom: "8px" },
  logoTitle: { fontSize: "24px", fontWeight: 700, color: "var(--col-text-primary)", letterSpacing: "-0.5px" },
  logoSub: { fontSize: "13px", color: "var(--col-text-muted)", marginTop: "4px" },
  tabs: {
    display: "flex",
    background: "var(--col-bg-input)",
    borderRadius: "8px",
    padding: "4px",
    marginBottom: "24px",
  },
    tab: (active: boolean) => ({
    flex: 1,
    padding: "8px",
    borderRadius: "6px",
    background: active ? "#5865f2" : "transparent",
    color: active ? "#fff" : "var(--col-text-secondary)",
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
    color: "var(--col-text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    background: "var(--col-bg-input)",
    border: "1px solid var(--col-border)",
    borderRadius: "8px",
    color: "var(--col-text-primary)",
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
    color: "var(--col-danger)",
    fontSize: "13px",
    marginBottom: "16px",
  },
  info: {
    background: "#5865f220",
    border: "1px solid #5865f240",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#5865f2",
    fontSize: "13px",
    marginBottom: "16px",
  },
  hint: {
    textAlign: "center",
    fontSize: "12px",
    color: "var(--col-text-muted)",
    marginTop: "20px",
  },
} satisfies AppStyleMap;

export default function LoginPage() {
    const { login, register } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [showForgot, setShowForgot] = useState(false);

    const [mode, setMode] = useState<"login" | "register">("login");

    const [error, setError] = useState("");

  const [logoutReason] = useState<string | null>(() => {
    const reason = sessionStorage.getItem("im_logout_reason");
    if (reason) sessionStorage.removeItem("im_logout_reason");
    return reason;
  });

    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({ username: "", email: "alice@demo.com", password: "Password@123" });

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
  }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "register") {
      const pwError = validatePassword(form.password);
      if (pwError) { setError(pwError); return; }
    }
    setLoading(true);
    setError("");
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form.username, form.email, form.password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  if (showForgot) return <ForgotPasswordPage onBack={() => setShowForgot(false)} />;

  return (
    <div style={styles.page}>
      <button
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-label="Toggle theme"
        style={{ position: "fixed", top: "16px", right: "16px", background: "var(--col-bg-elevated)", border: "1px solid var(--col-border)", borderRadius: "8px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "18px", zIndex: 100 }}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
      <div style={styles.card} className="login-card">
        {/* Logo / branding */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>IM</span>
          <div style={styles.logoTitle}>Instant Messenger</div>
          <div style={styles.logoSub}>Real-time public channels</div>
        </div>

        {/* Login / Register tab switcher */}
        <div style={styles.tabs}>
          <button style={styles.tab(mode === "login")} onClick={() => setMode("login")}>Login</button>
          <button style={styles.tab(mode === "register")} onClick={() => setMode("register")}>Register</button>
        </div>

        <form onSubmit={handleSubmit}>
          {logoutReason === "inactivity" && (
            <div style={styles.info}>You were logged out after 1 hour of inactivity.</div>
          )}
          {logoutReason === "server_restart" && (
            <div style={styles.info}>You were logged out because the server was restarted.</div>
          )}
          {error && <div style={styles.error}>{error}</div>}

          {/* Username field - only shown in register mode */}
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
            {loading ? " Loading..." : mode === "login" ? "Sign in →" : "Create account →"}
          </button>
        </form>

        {/* Forgot password link - only shown on the login tab */}
        {mode === "login" && (
          <div style={{ ...styles.hint, marginTop: "12px" }}>
            <button
              type="button"
              style={{ background: "transparent", border: "none", color: "#5865f2", 
                       fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}
              onClick={() => setShowForgot(true)}
              data-testid="forgot-password-link"
            >
              Forgot password?
            </button>
          </div>
        )}

        {/* Demo credentials hint - only shown on the login tab */}
        {mode === "login" && (
          <div style={styles.hint}>Demo account: alice@demo.com / Password@123 </div>
        )}
      </div>
    </div>
  );
}