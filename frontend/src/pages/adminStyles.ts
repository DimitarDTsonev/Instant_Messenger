/* eslint-disable @typescript-eslint/no-explicit-any */
export const s: Record<string, any> = {
  page:        { minHeight: "100vh", background: "#0f0f0f", color: "#f2f3f5", fontFamily: "inherit" },
  header:      { padding: "16px 24px", background: "#1e1e2e", borderBottom: "1px solid #2d2d3f", display: "flex", alignItems: "center", gap: "16px" },
  backBtn:     { background: "transparent", border: "1px solid #2d2d3f", borderRadius: "6px", color: "#949ba4", padding: "6px 12px", cursor: "pointer", fontSize: "13px" },
  title:       { fontSize: "18px", fontWeight: 700, color: "#f2f3f5" },
  tabs:        { display: "flex", gap: "0", borderBottom: "1px solid #2d2d3f", padding: "0 24px", background: "#1e1e2e" },
  tab: (active: boolean) => ({ padding: "10px 16px", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: active ? "#f2f3f5" : "#949ba4", background: "transparent", border: "none", borderBottom: active ? "2px solid #5865f2" : "2px solid transparent" }),
  content:     { padding: "24px", maxWidth: "1100px" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
  th:          { textAlign: "left", padding: "8px 12px", background: "#1e1e2e", color: "#949ba4", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #2d2d3f" },
  td:          { padding: "8px 12px", borderBottom: "1px solid #2d2d3f", verticalAlign: "middle" },
  badge: (banned: boolean | number) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
    background: banned ? "#f23f4220" : "#23a55a20",
    color: banned ? "#f23f42" : "#23a55a",
    border: `1px solid ${banned ? "#f23f42" : "#23a55a"}`,
  }),
  actionBtn: (danger: boolean) => ({
    padding: "4px 10px", borderRadius: "5px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "none",
    background: danger ? "#f23f4220" : "#5865f220",
    color: danger ? "#f23f42" : "#5865f2", transition: "background 0.15s",
  }),
  filterRow:   { display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" },
  filterInput: { background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "6px", padding: "6px 10px", color: "#f2f3f5", fontSize: "13px", outline: "none", flex: 1, maxWidth: "300px" },
  logBadge: (event: string) => {
    const colors: Record<string, string> = { user_banned: "#f23f42", user_unbanned: "#23a55a", banned_socket_attempt: "#f23f42", LOGIN_FAIL: "#f0a500", RATE_LIMIT: "#f0a500" };
    const color = colors[event] || "#5865f2";
    return { display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: color + "20", color, border: `1px solid ${color}` };
  },
  error:       { color: "#f23f42", fontSize: "13px", padding: "8px" },
};
