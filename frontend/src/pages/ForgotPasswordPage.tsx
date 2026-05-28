/**
 * ForgotPasswordPage — collects an email address and requests a password-reset link.
 *
 * On submit: POSTs to POST /api/auth/forgot-password with `{ email }`.
 * The response is always 200 regardless of whether the email exists (to prevent
 * user enumeration).  A success banner is shown with a note to check the server
 * console in local development mode.
 *
 * Rendered inline by LoginPage (not a separate route) when the user clicks
 * "Forgot password?".  The `onBack` prop navigates back to the login form.
 *
 * @param onBack - Callback invoked when the user clicks either "Back to sign in"
 *                 link, returning control to LoginPage.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE } from "../config";
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
  error: { color: "var(--col-danger)", fontSize: "13px", marginBottom: "12px" },
  success: { color: "var(--col-success)", fontSize: "13px", marginBottom: "12px" },
} satisfies AppStyleMap;

export default function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [sent, setSent]       = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Request failed");
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
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
        <div style={s.title}>Reset your password</div>
        <div style={s.subtitle}>
          Enter your email and we will send you a reset link (check the server console in local mode).
        </div>

        {sent ? (
          <>
            <div style={s.success} data-testid="sent-message">
              If that email is registered, a reset link has been sent. Check the server console.
            </div>
            <button style={s.link} onClick={onBack} data-testid="back-to-login">
              Back to sign in
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={s.label} htmlFor="fp-email">Email address</label>
            <input
              id="fp-email"
              style={s.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              data-testid="fp-email"
            />
            {error && <div style={s.error} data-testid="fp-error">{error}</div>}
            <button style={s.btn} type="submit" disabled={loading} data-testid="fp-submit">
              {loading ? "Sending..." : "Send reset link"}
            </button>
            <button type="button" style={s.link} onClick={onBack} data-testid="fp-back">
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}