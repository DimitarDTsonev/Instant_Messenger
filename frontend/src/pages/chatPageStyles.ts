/**
 * Inline-style map for ChatPage and ChatTopbar.
 *
 * Layout overview:
 *  - `page` — full-height flex row containing the sidebar and `main`.
 *  - `main` — flex column: topbar (fixed height 48 px) + ChatArea (flex 1,
 *    overflows internally) + MessageInput (fixed bottom).
 *  - `topbar` — horizontal bar with channel/DM title, description, action buttons.
 *  - `noChannel` — centred placeholder shown when no channel or DM is selected.
 *
 * Used by: ChatPage.tsx, ChatTopbar.tsx.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const s: Record<string, any> = {
  page:        { height: "100%", display: "flex", overflow: "hidden", background: "var(--col-bg-base)" },
  main:        { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
  topbar: {
    height: "48px", background: "var(--col-bg-elevated)", borderBottom: "1px solid var(--col-border)",
    display: "flex", alignItems: "center", padding: "0 16px", gap: "10px", flexShrink: 0,
  },
  topbarTitle:  { fontWeight: 700, fontSize: "15px", color: "var(--col-text-primary)", display: "flex", alignItems: "center", gap: "8px" },
  topbarDesc:   { fontSize: "13px", color: "var(--col-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  searchBtn:    { padding: "6px 12px", background: "var(--col-bg-hover)", border: "1px solid var(--col-bg-subtle)", borderRadius: "20px", color: "var(--col-text-secondary)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", flexShrink: 0 },
  settingsBtn:  { width: "32px", height: "32px", padding: 0, background: "transparent", border: "1px solid var(--col-bg-subtle)", borderRadius: "8px", color: "var(--col-text-secondary)", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  dmBadge:      { display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.19)", borderRadius: "12px", fontSize: "12px", color: "var(--col-link)", marginLeft: "8px" },
  noChannel:    { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--col-text-muted)", gap: "16px" },
};
