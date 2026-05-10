// ============================================================
//  pages/ResetPasswordPage.tsx — Set a new password via reset token
// ============================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { API_BASE } from "../config";
import { navigateHome } from "../utils/navigation";

const s = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    background: "#1e1e2e",
    borderRadius: "12px",
    padding: "32px",
    width: "100%",
    maxWidth: "380px",
    border: "1px solid #2d2d3f",
  },
  title: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#f2f3f5",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "13px",
    color: "#949ba4",
    marginBottom: "24px",
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#949ba4",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  input: {
    width: "100%",
    background: "#0f0f1a",
    border: "1px solid #2d2d3f",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#f2f3f5",
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
  error:   { color: "#f23f42", fontSize: "13px", marginBottom: "12px" },
  success: { color: "#23a55a", fontSize: "13px", marginBottom: "12px" },
} satisfies AppStyleMap;

/**
 * ResetPasswordPage — Allows the user to set a new password using a reset token
 * from the URL query string.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password.trim()) { setError("Password is required"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
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
