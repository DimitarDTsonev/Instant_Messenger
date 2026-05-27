/* eslint-disable @typescript-eslint/no-explicit-any */
export const s: Record<string, any> = {
  page:        { minHeight: "100vh", background: "var(--col-bg-base)", color: "var(--col-text-primary)", fontFamily: "inherit" },
  header:      { padding: "16px 24px", background: "var(--col-bg-elevated)", borderBottom: "1px solid var(--col-border)", display: "flex", alignItems: "center", gap: "16px" },
  backBtn:     { background: "transparent", border: "1px solid var(--col-border)", borderRadius: "6px", color: "var(--col-text-secondary)", padding: "6px 12px", cursor: "pointer", fontSize: "13px" },
  title:       { fontSize: "18px", fontWeight: 700, color: "var(--col-text-primary)" },
  tabs:        { display: "flex", gap: "0", borderBottom: "1px solid var(--col-border)", padding: "0 24px", background: "var(--col-bg-elevated)" },
  tab: (active: boolean) => ({ padding: "10px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: active ? "var(--col-text-primary)" : "var(--col-text-secondary)", background: "transparent", border: "none", borderBottom: active ? "2px solid var(--col-accent)" : "2px solid transparent" }),
  content:     { padding: "24px", maxWidth: "1100px" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th:          { textAlign: "left", padding: "8px 12px", background: "var(--col-bg-elevated)", color: "var(--col-text-secondary)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--col-border)" },
  td:          { padding: "8px 12px", borderBottom: "1px solid var(--col-border)", verticalAlign: "middle" },
  badge: (banned: boolean | number) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
    background: banned ? "rgba(242,63,66,0.13)" : "rgba(35,165,90,0.13)",
    color: banned ? "var(--col-danger)" : "var(--col-success)",
    border: `1px solid ${banned ? "var(--col-danger)" : "var(--col-success)"}`,
  }),
  actionBtn: (danger: boolean) => ({
    padding: "4px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "none",
    background: danger ? "rgba(242,63,66,0.13)" : "rgba(88,101,242,0.13)",
    color: danger ? "var(--col-danger)" : "var(--col-accent)", transition: "background 0.15s",
  }),
  filterRow:   { display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" },
  filterInput: { background: "var(--col-bg-elevated)", border: "1px solid var(--col-border)", borderRadius: "6px", padding: "6px 10px", color: "var(--col-text-primary)", fontSize: "13px", outline: "none", flex: 1, maxWidth: "300px" },
  logBadge: (event: string) => {
    const colors: Record<string, string> = { user_banned: "var(--col-danger)", user_unbanned: "var(--col-success)", banned_socket_attempt: "var(--col-danger)", LOGIN_FAIL: "var(--col-warning)", RATE_LIMIT: "var(--col-warning)" };
    const color = colors[event] || "var(--col-accent)";
    return { display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: color + "20", color, border: `1px solid ${color}` };
  },
  error:       { color: "var(--col-danger)", fontSize: "13px", padding: "8px" },
};
