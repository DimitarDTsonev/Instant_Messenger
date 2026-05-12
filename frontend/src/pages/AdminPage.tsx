import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../config";
import type { SecurityLog, User } from "../types";
import { navigateHome } from "../utils/navigation";
import AdminUsersTable from "../components/AdminUsersTable";
import AdminLogsTable  from "../components/AdminLogsTable";
import BanModal        from "../components/BanModal";
import { s }           from "./adminStyles";

type AdminTab = "users" | "logs";
type ApiError = { error?: string };

export default function AdminPage() {
  const { user, token } = useAuth();
  const [tab, setTab]             = useState<AdminTab>("users");
  const [users, setUsers]         = useState<User[]>([]);
  const [logs, setLogs]           = useState<SecurityLog[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingLogs, setLoadingLogs]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState("");
  const [logFilter, setLogFilter]   = useState("");
  const [banModal, setBanModal]   = useState<User | null>(null);
  const [banReason, setBanReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true); setError(null);
    try {
      const res  = await fetch(`${API_BASE}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { users: User[] } & ApiError;
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load users"); }
    finally { setLoadingUsers(false); }
  }, [token]);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true); setError(null);
    try {
      const res  = await fetch(`${API_BASE}/admin/security-logs?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { logs: SecurityLog[] } & ApiError;
      if (!res.ok) throw new Error(data.error || "Failed to load logs");
      setLogs(data.logs);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load logs"); }
    finally { setLoadingLogs(false); }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (tab === "logs") fetchLogs(); }, [tab, fetchLogs]);

  async function handleBan() {
    if (!banModal) return;
    setActionError(null);
    try {
      const res  = await fetch(`${API_BASE}/admin/ban/${banModal.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: banReason || "Banned by admin" }),
      });
      const data = await res.json() as ApiError;
      if (!res.ok) throw new Error(data.error || "Ban failed");
      setBanModal(null); setBanReason(""); fetchUsers();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Ban failed"); }
  }

  async function handleUnban(userId: number) {
    setActionError(null);
    try {
      const res  = await fetch(`${API_BASE}/admin/unban/${userId}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as ApiError;
      if (!res.ok) throw new Error(data.error || "Unban failed");
      fetchUsers();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Unban failed"); }
  }

  if (!user || user.role !== "admin") {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
        <span style={{ fontSize: "18px", fontWeight: 700 }}>Admin access required</span>
        <span>Admin access required</span>
        <button style={s.backBtn} onClick={() => window.history.back()}>Go back</button>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigateHome()} data-testid="back-btn">Back</button>
        <span style={s.title}>Admin Dashboard</span>
      </div>

      <div style={s.tabs}>
        <button style={s.tab(tab === "users")} onClick={() => setTab("users")} data-testid="tab-users">Users</button>
        <button style={s.tab(tab === "logs")}  onClick={() => setTab("logs")}  data-testid="tab-logs">Security Logs</button>
      </div>

      <div style={s.content}>
        {error        && <div style={s.error} data-testid="admin-error">{error}</div>}
        {actionError  && <div style={s.error} data-testid="action-error">{actionError}</div>}

        {tab === "users" && <AdminUsersTable users={users} currentUser={user} filter={userFilter} onFilter={setUserFilter} loading={loadingUsers} onBan={(u) => { setBanModal(u); setBanReason(""); setActionError(null); }} onUnban={handleUnban} />}
        {tab === "logs"  && <AdminLogsTable  logs={logs}   filter={logFilter}  onFilter={setLogFilter}  loading={loadingLogs} />}
      </div>

      {banModal && <BanModal user={banModal} banReason={banReason} onReason={setBanReason} onConfirm={handleBan} onCancel={() => setBanModal(null)} error={actionError} />}
    </div>
  );
}
