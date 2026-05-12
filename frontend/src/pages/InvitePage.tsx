import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { AuthSession } from "../types";
import { navigateHome } from "../utils/navigation";
import Icon from "../components/Icons";

type InviteTab = "guest" | "login" | "register";
type ButtonVariant = "primary" | "ghost" | "secondary";

interface InviteInfo {
  channel_name: string;
  channel_description?: string;
  member_count: number;
  created_by_username: string;
  max_uses?: number | null;
  uses_count?: number;
  expires_at?: string | null;
  is_private?: boolean | number;
}

type ApiError = { error?: string };

const s = {
  page: {
    minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    background: "#0f0f0f", padding: "20px",
  },
  card: {
    width: "100%", maxWidth: "440px",
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "16px",
    padding: "32px", boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
  },
  logo: { textAlign: "center", fontSize: "40px", marginBottom: "8px" },
  appName: { textAlign: "center", fontSize: "18px", fontWeight: 700, color: "#f2f3f5", marginBottom: "24px" },
  channelCard: {
    background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "12px",
    padding: "16px 20px", marginBottom: "24px",
  },
  channelName: { fontSize: "20px", fontWeight: 700, color: "#f2f3f5", marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" },
  channelMarker: { color: "#949ba4", display: "inline-flex", flexShrink: 0 },
  channelDesc: { fontSize: "13px", color: "#949ba4", marginBottom: "8px" },
  channelMeta: { fontSize: "12px", color: "#5c6068", display: "flex", gap: "12px", flexWrap: "wrap" },
  tabs: { display: "flex", marginBottom: "20px", border: "1px solid #2d2d3f", borderRadius: "8px", overflow: "hidden" },
  tab: (active: boolean) => ({
    flex: 1, padding: "10px", textAlign: "center", fontSize: "13px", fontWeight: active ? 700 : 400,
    color: active ? "#f2f3f5" : "#5c6068",
    background: active ? "#2d2d3f" : "transparent",
    border: "none", cursor: "pointer", fontFamily: "inherit",
  }),
  field: { marginBottom: "14px" },
  label: { display: "block", fontSize: "12px", fontWeight: 600, color: "#949ba4", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" },
  input: {
    width: "100%", boxSizing: "border-box",
    background: "#0f0f1a", border: "1px solid #2d2d3f", borderRadius: "8px",
    padding: "10px 14px", color: "#f2f3f5", fontSize: "14px", outline: "none",
    fontFamily: "inherit",
  },
  btn: (variant: ButtonVariant = "primary") => ({
    width: "100%", padding: "12px", borderRadius: "8px", fontFamily: "inherit",
    fontSize: "14px", fontWeight: 700, cursor: "pointer", border: "none",
    background: variant === "primary" ? "#5865f2" : variant === "ghost" ? "#23a55a" : "#2d2d3f",
    color: "#fff", marginTop: "4px",
  }),
  error: { background: "#f23f4215", border: "1px solid #f23f42", borderRadius: "8px", padding: "10px 14px", color: "#f23f42", fontSize: "13px", marginBottom: "14px" },
  success: { background: "#23a55a15", border: "1px solid #23a55a", borderRadius: "8px", padding: "10px 14px", color: "#23a55a", fontSize: "13px", marginBottom: "14px" },
  alreadyUser: { textAlign: "center", fontSize: "13px", color: "#5c6068", marginTop: "16px" },
} satisfies AppStyleMap;

export default function InvitePage({ code }: { code: string }) {
  const { user, loginWithToken } = useAuth();

  const [invite,  setInvite]  = useState<InviteInfo | null>(null);
  const [invErr,  setInvErr]  = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Active tab: "guest" | "login" | "register"
  const [tab,     setTab]     = useState<InviteTab>("guest");
  const [email,   setEmail]   = useState("");
  const [password,setPassword]= useState("");
  const [username,setUsername]= useState("");
  const [error,   setError]   = useState("");
  const [busy,    setBusy]    = useState(false);

  // Fetch invite info without auth - unauthenticated users need to see channel details
  useEffect(() => {
    fetch(`${API}/invite/${code}`)
      .then((r) => r.json())
      .then((data: { invite?: InviteInfo } & ApiError) => {
        if (data.error) setInvErr(data.error);
        else setInvite(data.invite);
      })
      .catch(() => setInvErr("Error loading invite"))
      .finally(() => setLoading(false));
  }, [code]);

    async function joinWithToken(token: string) {
    const res = await fetch(`${API}/invite/${code}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as ApiError;
    if (!res.ok) throw new Error(data.error || "Error joining channel");
    return data;
  }

    async function handleGuest() {
    setBusy(true); setError("");
    try {
      const res  = await fetch(`${API}/auth/guest`, { method: "POST" });
      const data = await res.json() as AuthSession & ApiError;
      if (!res.ok) throw new Error(data.error);
      await joinWithToken(data.token);
      // isGuest=true stores the token in sessionStorage so it expires with the tab
      loginWithToken(data.user, data.token, true);
      navigateHome("replace");
    } catch (e) { setError(e instanceof Error ? e.message : "Error joining channel"); }
    finally { setBusy(false); }
  }

    async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res  = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as AuthSession & ApiError;
      if (!res.ok) throw new Error(data.error);
      await joinWithToken(data.token);
      loginWithToken(data.user, data.token, false);
      navigateHome("replace");
    } catch (e) { setError(e instanceof Error ? e.message : "Error joining channel"); }
    finally { setBusy(false); }
  }

    async function handleRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res  = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json() as AuthSession & ApiError;
      if (!res.ok) throw new Error(data.error);
      await joinWithToken(data.token);
      loginWithToken(data.user, data.token, false);
      navigateHome("replace");
    } catch (e) { setError(e instanceof Error ? e.message : "Error joining channel"); }
    finally { setBusy(false); }
  }

    async function handleJoinAsUser() {
    setBusy(true); setError("");
    const stored = sessionStorage.getItem("im_token") || localStorage.getItem("im_token");
    try {
      if (!stored) throw new Error("Missing session token");
      await joinWithToken(stored);
      navigateHome("replace");
    } catch (e) { setError(e instanceof Error ? e.message : "Error joining channel"); }
    finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div style={s.page}>
        <div style={{ color: "#5c6068", fontSize: "18px" }}>Loading invite...</div>
      </div>
    );
  }

  if (invErr) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logo}>Invite</div>
          <div style={s.appName}>Invite</div>
          <div style={s.error}>{invErr}</div>
          <button style={s.btn("secondary")} onClick={() => navigateHome("replace")}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>IM</div>
        <div style={s.appName}>Channel invite</div>

        <div style={s.channelCard}>
          <div style={s.channelName}>
            <span style={s.channelMarker} title={invite.is_private ? "Private channel" : "Public channel"}>
              <Icon name={invite.is_private ? "lock" : "hash"} size={18} />
            </span>
            <span>{invite.channel_name}</span>
          </div>
          {invite.channel_description && (
            <div style={s.channelDesc}>{invite.channel_description}</div>
          )}
          <div style={s.channelMeta}>
            <span>{invite.member_count} {invite.member_count === 1 ? "member" : "members"}</span>
            <span>Invited by {invite.created_by_username}</span>
            {invite?.max_uses && (
              <span>{invite.uses_count}/{invite.max_uses} uses</span>
            )}
            {invite.expires_at && (
              <span>Expires: {new Date(invite.expires_at).toLocaleDateString("en-US")}</span>
            )}
          </div>
        </div>

        {error && <div style={s.error}>{error}</div>}

        {/* If the user is already logged in, show a single join button */}
        {user ? (
          <div>
            <div style={{ textAlign: "center", color: "#949ba4", fontSize: "13px", marginBottom: "16px" }}>
              Signed in as <strong style={{ color: "#f2f3f5" }}>{user.username}</strong>
            </div>
            <button style={s.btn("primary")} onClick={handleJoinAsUser} disabled={busy}>
              {busy ? "Joining..." : "Join channel"}
            </button>
            <button
              style={{ ...s.btn("secondary"), marginTop: "10px", background: "transparent", border: "1px solid #2d2d3f" }}
              onClick={() => navigateHome("replace")}
            >
              Back to chat
            </button>
          </div>
        ) : (
          <>
            {/* Join option tabs */}
            <div style={s.tabs}>
              <button style={s.tab(tab === "guest")}    onClick={() => { setTab("guest");    setError(""); }}>Guest</button>
              <button style={s.tab(tab === "login")}    onClick={() => { setTab("login");    setError(""); }}>Login</button>
              <button style={s.tab(tab === "register")} onClick={() => { setTab("register"); setError(""); }}>Register</button>
            </div>

            {/* Guest tab */}
            {tab === "guest" && (
              <div>
                <p style={{ fontSize: "13px", color: "#949ba4", marginBottom: "16px", lineHeight: 1.5 }}>
                  Join as a temporary guest without registering. The account is valid for 24 hours.
                </p>
                <button style={s.btn("ghost")} onClick={handleGuest} disabled={busy}>
                  {busy ? "Joining..." : "Continue as guest"}
                </button>
              </div>
            )}

            {/* Login tab */}
            {tab === "login" && (
              <form onSubmit={handleLogin}>
                <div style={s.field}>
                  <label style={s.label}>Email</label>
                  <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Password</label>
                  <input style={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••" />
                </div>
                <button type="submit" style={s.btn("primary")} disabled={busy}>
                  {busy ? "Signing in..." : "Sign in and join"}
                </button>
              </form>
            )}

            {/* Register tab */}
            {tab === "register" && (
              <form onSubmit={handleRegister}>
                <div style={s.field}>
                  <label style={s.label}>Username</label>
                  <input style={s.input} value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="username" />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Email</label>
                  <input style={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                </div>
                <div style={s.field}>
                  <label style={s.label}>Password</label>
                  <input style={s.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="min. 6 characters" />
                </div>
                <button type="submit" style={s.btn("primary")} disabled={busy}>
                  {busy ? "Registering..." : "Register and join"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
