// ============================================================
//  pages/AdminPage.tsx — Admin dashboard (user list + security logs)
// ============================================================

import { useState, useEffect, useCallback } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config";
import type { SecurityLog, User } from "../types";
import { navigateHome } from "../utils/navigation";

type AdminTab = "users" | "logs";
type ApiError = { error?: string };

const s = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    color: "#f2f3f5",
    fontFamily: "inherit",
  },
  header: {
    padding: "16px 24px",
    background: "#1e1e2e",
    borderBottom: "1px solid #2d2d3f",
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  backBtn: {
    background: "transparent",
    border: "1px solid #2d2d3f",
    borderRadius: "6px",
    color: "#949ba4",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "13px",
  },
  title: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#f2f3f5",
  },
  tabs: {
    display: "flex",
    gap: "0",
    borderBottom: "1px solid #2d2d3f",
    padding: "0 24px",
    background: "#1e1e2e",
  },
  tab: (active: boolean) => ({
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    color: active ? "#f2f3f5" : "#949ba4",
    background: "transparent",
    border: "none",
    borderBottom: active ? "2px solid #5865f2" : "2px solid transparent",
  }),
  content: {
    padding: "24px",
    maxWidth: "1100px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    background: "#1e1e2e",
    color: "#949ba4",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "1px solid #2d2d3f",
  },
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #2d2d3f",
    verticalAlign: "middle",
  },
  badge: (banned: boolean | number) => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "11px",
    fontWeight: 600,
    background: banned ? "#f23f4220" : "#23a55a20",
    color: banned ? "#f23f42" : "#23a55a",
    border: `1px solid ${banned ? "#f23f42" : "#23a55a"}`,
  }),
  actionBtn: (danger: boolean) => ({
    padding: "4px 10px",
    borderRadius: "5px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    background: danger ? "#f23f4220" : "#5865f220",
    color: danger ? "#f23f42" : "#5865f2",
    transition: "background 0.15s",
  }),
  filterRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
    alignItems: "center",
  },
  filterInput: {
    background: "#1e1e2e",
    border: "1px solid #2d2d3f",
    borderRadius: "6px",
    padding: "6px 10px",
    color: "#f2f3f5",
    fontSize: "13px",
    outline: "none",
    flex: 1,
    maxWidth: "300px",
  },
  logBadge: (event: string) => {
    const colors = {
      user_banned: "#f23f42", user_unbanned: "#23a55a",
      banned_socket_attempt: "#f23f42", LOGIN_FAIL: "#f0a500",
      RATE_LIMIT: "#f0a500",
    };
    const color = colors[event as keyof typeof colors] || "#5865f2";
    return {
      display: "inline-block", padding: "2px 8px", borderRadius: "10px",
      fontSize: "11px", fontWeight: 600,
      background: color + "20", color, border: `1px solid ${color}`,
    };
  },
  error: {
    color: "#f23f42", fontSize: "13px", padding: "8px",
  },
} satisfies AppStyleMap;

/**
 * AdminPage — Admin-only dashboard showing user management and security logs.
 *
 * @component
 * @returns {JSX.Element}
 */
export default function AdminPage() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState("");
  const [logFilter, setLogFilter] = useState("");
  const [banModal, setBanModal] = useState<User | null>(null);
  const [banReason, setBanReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { users: User[] } & ApiError;
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/security-logs?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { logs: SecurityLog[] } & ApiError;
      if (!res.ok) throw new Error(data.error || "Failed to load logs");
      setLogs(data.logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoadingLogs(false);
    }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (tab === "logs") fetchLogs(); }, [tab, fetchLogs]);

  async function handleBan() {
    if (!banModal) return;
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/ban/${banModal.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: banReason || "Banned by admin" }),
      });
      const data = await res.json() as ApiError;
      if (!res.ok) throw new Error(data.error || "Ban failed");
      setBanModal(null);
      setBanReason("");
      fetchUsers();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ban failed");
    }
  }

  async function handleUnban(userId: number) {
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/unban/${userId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as ApiError;
      if (!res.ok) throw new Error(data.error || "Unban failed");
      fetchUsers();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Unban failed");
    }
  }

  if (!user || user.role !== "admin") {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
        <span style={{ fontSize: "48px" }}>🔒</span>
        <span>Admin access required</span>
        <button style={s.backBtn} onClick={() => window.history.back()}>Go back</button>
      </div>
    );
  }

  const filteredUsers = users.filter((u) =>
    !userFilter ||
    u.username.toLowerCase().includes(userFilter.toLowerCase()) ||
    u.email.toLowerCase().includes(userFilter.toLowerCase())
  );

  const filteredLogs = logs.filter((l) =>
    !logFilter ||
    l.event?.toLowerCase().includes(logFilter.toLowerCase()) ||
    l.username?.toLowerCase().includes(logFilter.toLowerCase()) ||
    l.detail?.toLowerCase().includes(logFilter.toLowerCase())
  );

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigateHome()} data-testid="back-btn">
          Back
        </button>
        <span style={s.title}>Admin Dashboard</span>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={s.tab(tab === "users")} onClick={() => setTab("users")} data-testid="tab-users">
          Users
        </button>
        <button style={s.tab(tab === "logs")} onClick={() => setTab("logs")} data-testid="tab-logs">
          Security Logs
        </button>
      </div>

      <div style={s.content}>
        {error && <div style={s.error} data-testid="admin-error">{error}</div>}
        {actionError && <div style={s.error} data-testid="action-error">{actionError}</div>}

        {/* Users tab */}
        {tab === "users" && (
          <>
            <div style={s.filterRow}>
              <input
                style={s.filterInput}
                placeholder="Filter by username or email..."
                value={userFilter}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUserFilter(e.target.value)}
                data-testid="user-filter"
              />
              <span style={{ fontSize: "12px", color: "#5c6068" }}>
                {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
              </span>
            </div>

            {loadingUsers ? (
              <div style={{ color: "#5c6068" }} data-testid="users-loading">Loading users...</div>
            ) : (
              <table style={s.table} data-testid="users-table">
                <thead>
                  <tr>
                    <th style={s.th}>User</th>
                    <th style={s.th}>Email</th>
                    <th style={s.th}>Role</th>
                    <th style={s.th}>Status</th>
                    <th style={s.th}>Joined</th>
                    <th style={s.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={s.td}>
                        <span style={{ marginRight: "6px" }}>{u.avatar || "👤"}</span>
                        <strong>{u.username}</strong>
                        {u.id === user.id && <span style={{ marginLeft: "6px", fontSize: "11px", color: "#5865f2" }}>(you)</span>}
                      </td>
                      <td style={{ ...s.td, color: "#949ba4" }}>{u.email}</td>
                      <td style={s.td}>
                        <span style={{ color: u.role === "admin" ? "#f0a500" : "#dbdee1", fontSize: "12px" }}>
                          {u.role === "admin" ? "👑 " : ""}{u.role}
                        </span>
                      </td>
                      <td style={s.td}>
                        {u.is_banned ? (
                          <span style={s.badge(true)} title={u.ban_reason}>Banned</span>
                        ) : (
                          <span style={s.badge(false)}>Active</span>
                        )}
                      </td>
                      <td style={{ ...s.td, color: "#949ba4", fontSize: "12px" }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td style={s.td}>
                        {u.id !== user.id && u.role !== "admin" && (
                          u.is_banned ? (
                            <button
                              style={s.actionBtn(false)}
                              onClick={() => handleUnban(u.id)}
                              data-testid={`unban-${u.id}`}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              style={s.actionBtn(true)}
                              onClick={() => { setBanModal(u); setBanReason(""); setActionError(null); }}
                              data-testid={`ban-${u.id}`}
                            >
                              Ban
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...s.td, textAlign: "center", color: "#5c6068" }}>
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* Security logs tab */}
        {tab === "logs" && (
          <>
            <div style={s.filterRow}>
              <input
                style={s.filterInput}
                placeholder="Filter by event, user, or detail..."
                value={logFilter}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setLogFilter(e.target.value)}
                data-testid="log-filter"
              />
              <span style={{ fontSize: "12px", color: "#5c6068" }}>
                {filteredLogs.length} event{filteredLogs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {loadingLogs ? (
              <div style={{ color: "#5c6068" }} data-testid="logs-loading">Loading logs...</div>
            ) : (
              <table style={s.table} data-testid="logs-table">
                <thead>
                  <tr>
                    <th style={s.th}>Event</th>
                    <th style={s.th}>User</th>
                    <th style={s.th}>IP</th>
                    <th style={s.th}>Detail</th>
                    <th style={s.th}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l) => (
                    <tr key={l.id}>
                      <td style={s.td}>
                        <span style={s.logBadge(l.event)}>{l.event}</span>
                      </td>
                      <td style={{ ...s.td, color: "#dbdee1" }}>{l.username || "-"}</td>
                      <td style={{ ...s.td, color: "#949ba4", fontSize: "12px" }}>{l.ip || "-"}</td>
                      <td style={{ ...s.td, color: "#949ba4", fontSize: "12px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.detail || "-"}
                      </td>
                      <td style={{ ...s.td, color: "#949ba4", fontSize: "12px" }}>
                        {l.created_at ? new Date(l.created_at).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ ...s.td, textAlign: "center", color: "#5c6068" }}>
                        No logs found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* Ban confirmation modal */}
      {banModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setBanModal(null)}
          data-testid="ban-modal-overlay"
        >
          <div
            style={{ background: "#1e1e2e", borderRadius: "12px", padding: "24px", minWidth: "340px", maxWidth: "90vw", border: "1px solid #2d2d3f" }}
            onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            data-testid="ban-modal"
          >
            <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>
              Ban {banModal.username}?
            </div>
            <div style={{ fontSize: "13px", color: "#949ba4", marginBottom: "16px" }}>
              This user will be immediately disconnected and unable to log in.
            </div>
            <input
              style={{ ...s.filterInput, width: "100%", maxWidth: "none", marginBottom: "12px", boxSizing: "border-box" }}
              placeholder="Ban reason (optional)"
              value={banReason}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBanReason(e.target.value)}
              data-testid="ban-reason-input"
              autoFocus
            />
            {actionError && <div style={{ ...s.error, marginBottom: "8px" }}>{actionError}</div>}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button style={s.backBtn} onClick={() => setBanModal(null)} data-testid="ban-cancel">
                Cancel
              </button>
              <button
                style={{ ...s.actionBtn(true), padding: "6px 16px", fontSize: "13px" }}
                onClick={handleBan}
                data-testid="ban-confirm"
              >
                Ban User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
