/* eslint-disable @typescript-eslint/no-explicit-any */
export const s: Record<string, any> = {
  page:        { height: "100%", display: "flex", overflow: "hidden", background: "#0f0f0f" },
  main:        { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
  topbar: {
    height: "48px", background: "#1e1e2e", borderBottom: "1px solid #2d2d3f",
    display: "flex", alignItems: "center", padding: "0 16px", gap: "10px", flexShrink: 0,
  },
  topbarTitle:  { fontWeight: 700, fontSize: "15px", color: "#f2f3f5", display: "flex", alignItems: "center", gap: "8px" },
  topbarDesc:   { fontSize: "13px", color: "#5c6068", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  searchBtn:    { padding: "6px 14px", background: "#2d2d3f", border: "1px solid #3a3a4f", borderRadius: "20px", color: "#949ba4", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", flexShrink: 0 },
  settingsBtn:  { padding: "6px 10px", background: "transparent", border: "1px solid #3a3a4f", borderRadius: "8px", color: "#949ba4", fontSize: "14px", cursor: "pointer", flexShrink: 0 },
  dmBadge:      { display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", background: "#5865f215", border: "1px solid #5865f230", borderRadius: "12px", fontSize: "12px", color: "#7289da", marginLeft: "8px" },
  noChannel:    { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#5c6068", gap: "16px" },
};
