/**
 * ResetPasswordPage — allows users to set a new password using a token from a
 * password-reset email link.
 *
 * Token extraction: reads the `?token=` query parameter from `window.location.search`
 * via `URLSearchParams` on render.  If absent, an error is shown immediately and
 * the submit button is disabled.
 *
 * Validation (client-side, before the API call):
 *  1. Password must not be blank.
 *  2. `validatePassword(password)` — enforces minimum strength rules.
 *  3. `password === confirm` — prevents mismatched entries.
 *  4. Token must be present.
 *
 * On submit: POSTs to POST /api/auth/reset-password with `{ token, password }`.
 * On success, shows a confirmation message and a "Go to sign in" link that calls
 * `navigateHome()` to redirect to the login page.
 *
 * Used by: App.tsx (rendered on the "/reset-password" route).
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE } from "../config";
import { navigateHome } from "../utils/navigation";
import { validatePassword } from "../utils/validatePassword";
import { useTheme } from "../context/ThemeContext";

const s = {
  page: {
    minHeight: "100vh",
    background: "var(--col-bg-base)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    background: "var(--col-bg-elevated)",
    borderRadius: "12px",
    padding: "32px",
    width: "100%",
    maxWidth: "380px",
    border: "1px solid var(--col-border)",
  },
  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--col-text-primary)",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "13px",
    color: "var(--col-text-secondary)",
    marginBottom: "24px",
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--col-text-secondary)",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  input: {
    width: "100%",
    background: "var(--col-bg-input)",
    border: "1px solid var(--col-border)",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "var(--col-text-primary)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: "16px",
  },
  btn: {
    width: "100%",
    padding: "10px",
    background: "#5865f2",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    marginBottom: "12px",
  },
  link: {
    background: "transparent",
    border: "none",
    color: "#5865f2",
    fontSize: "13px",
    cursor: "pointer",
    textDecoration: "underline",
  },
  error:   { color: "var(--col-danger)", fontSize: "13px", marginBottom: "12px" },
  success: { color: "var(--col-success)", fontSize: "13px", marginBottom: "12px" },
} satisfies AppStyleMap;

export default function ResetPasswordPage() {
  const { theme, toggleTheme } = useTheme();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password.trim()) { setError("Password is required"); return; }
    const pwError = validatePassword(password);
    if (pwError) { setError(pwError); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (!token) { setError("Missing reset token. Use the link from the email."); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  function goToLogin() {
    navigateHome();
  }

  return (
    <div style={s.page}>
      <button
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-label="Toggle theme"
        style={{ position: "fixed", top: "16px", right: "16px", background: "var(--col-bg-elevated)", border: "1px solid var(--col-border)", borderRadius: "8px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "18px", zIndex: 100 }}
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
      <div style={s.card}>
        <div style={s.title}>Set new password</div>
        <div style={s.subtitle}>Enter your new password below.</div>

        {!token && (
          <div style={s.error} data-testid="no-token-error">
            Invalid reset link. Please request a new one.
          </div>
        )}

        {success ? (
          <>
            <div style={s.success} data-testid="reset-success">
              Password updated! You can now sign in with your new password.
            </div>
            <button style={s.link} onClick={goToLogin} data-testid="go-to-login">
              Go to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={s.label} htmlFor="rp-password">New password</label>
            <input
              id="rp-password"
              style={s.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoFocus
              data-testid="rp-password"
            />
            <label style={s.label} htmlFor="rp-confirm">Confirm password</label>
            <input
              id="rp-confirm"
              style={s.input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              data-testid="rp-confirm"
            />
            {error && <div style={s.error} data-testid="rp-error">{error}</div>}
            <button style={s.btn} type="submit" disabled={loading || !token} data-testid="rp-submit">
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}