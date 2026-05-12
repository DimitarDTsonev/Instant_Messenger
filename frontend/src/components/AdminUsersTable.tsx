import type { ChangeEvent } from "react";
import type { User } from "../types";
import { s } from "../pages/adminStyles";

type Props = {
  users:      User[];
  currentUser: User;
  filter:     string;
  onFilter:   (v: string) => void;
  loading:    boolean;
  onBan:      (u: User) => void;
  onUnban:    (id: number) => void;
};

export default function AdminUsersTable({ users, currentUser, filter, onFilter, loading, onBan, onUnban }: Props) {
  const filtered = users.filter((u) =>
    !filter || u.username.toLowerCase().includes(filter.toLowerCase()) || u.email.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      <div style={s.filterRow}>
        <input style={s.filterInput} placeholder="Filter by username or email..." value={filter} onChange={(e: ChangeEvent<HTMLInputElement>) => onFilter(e.target.value)} data-testid="user-filter" />
        <span style={{ fontSize: "12px", color: "#5c6068" }}>{filtered.length} user{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div style={{ color: "#5c6068" }} data-testid="users-loading">Loading users...</div>
      ) : (
        <table style={s.table} data-testid="users-table">
          <thead>
            <tr>
              {["User", "Email", "Role", "Status", "Joined", "Actions"].map((h) => <th key={h} style={s.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td style={s.td}>
                  <span style={{ marginRight: "6px" }}>{u.avatar || "👤"}</span>
                  <strong>{u.username}</strong>
                  {u.id === currentUser.id && <span style={{ marginLeft: "6px", fontSize: "11px", color: "#5865f2" }}>(you)</span>}
                </td>
                <td style={{ ...s.td, color: "#949ba4" }}>{u.email}</td>
                <td style={s.td}>
                  <span style={{ color: u.role === "admin" ? "#f0a500" : "#dbdee1", fontSize: "12px" }}>
                    {u.role === "admin" ? "👑 " : ""}{u.role}
                  </span>
                </td>
                <td style={s.td}>
                  {u.is_banned ? <span style={s.badge(true)} title={u.ban_reason}>Banned</span> : <span style={s.badge(false)}>Active</span>}
                </td>
                <td style={{ ...s.td, color: "#949ba4", fontSize: "12px" }}>
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "-"}
                </td>
                <td style={s.td}>
                  {u.id !== currentUser.id && u.role !== "admin" && (
                    u.is_banned
                      ? <button style={s.actionBtn(false)} onClick={() => onUnban(u.id)} data-testid={`unban-${u.id}`}>Unban</button>
                      : <button style={s.actionBtn(true)} onClick={() => onBan(u)} data-testid={`ban-${u.id}`}>Ban</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ ...s.td, textAlign: "center", color: "#5c6068" }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}