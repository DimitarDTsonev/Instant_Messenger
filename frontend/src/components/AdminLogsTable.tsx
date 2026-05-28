/**
 * Security logs table — renders the admin's event log with a live text filter.
 *
 * Filters `logs` client-side against `filter` (checks `event`, `username`, and `detail`
 * fields case-insensitively). The filter count is displayed next to the input.
 *
 * Used by: AdminPage.tsx (Security Logs tab).
 */

import type { ChangeEvent } from "react";
import type { SecurityLog } from "../types";
import { s } from "../pages/adminStyles";

type Props = { logs: SecurityLog[]; filter: string; onFilter: (v: string) => void; loading: boolean };

export default function AdminLogsTable({ logs, filter, onFilter, loading }: Props) {
  const filtered = logs.filter((l) =>
    !filter ||
    l.event?.toLowerCase().includes(filter.toLowerCase()) ||
    l.username?.toLowerCase().includes(filter.toLowerCase()) ||
    l.detail?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      <div style={s.filterRow}>
        <input style={s.filterInput} placeholder="Filter by event, user, or detail..." value={filter} onChange={(e: ChangeEvent<HTMLInputElement>) => onFilter(e.target.value)} data-testid="log-filter" />
        <span style={{ fontSize: "12px", color: "#5c6068" }}>{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div style={{ color: "#5c6068" }} data-testid="logs-loading">Loading logs...</div>
      ) : (
        <table style={s.table} data-testid="logs-table">
          <thead>
            <tr>
              {["Event", "User", "IP", "Detail", "Time"].map((h) => <th key={h} style={s.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td style={s.td}><span style={s.logBadge(l.event)}>{l.event}</span></td>
                <td style={{ ...s.td, color: "#dbdee1" }}>{l.username || "-"}</td>
                <td style={{ ...s.td, color: "#949ba4", fontSize: "12px" }}>{l.ip || "-"}</td>
                <td style={{ ...s.td, color: "#949ba4", fontSize: "12px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.detail || "-"}</td>
                <td style={{ ...s.td, color: "#949ba4", fontSize: "12px" }}>{l.created_at ? new Date(l.created_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ ...s.td, textAlign: "center", color: "#5c6068" }}>No logs found</td></tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}