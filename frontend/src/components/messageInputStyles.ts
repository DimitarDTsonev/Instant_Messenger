/**
 * Inline-style map for MessageInput and its overlay sub-components.
 *
 * Notable entries:
 *  - `wrapper` — the main input row (emoji btn + attach btn + textarea + send btn).
 *  - `wrapperWithTop` — drops the top border-radius when a reply bar or file
 *    preview is shown above, creating a visually joined compound widget.
 *  - `sendBtn` — parameterised: accent background + white icon when active (has
 *    text or file), muted background + icon when the input is empty.
 *  - `emojiPanel` / `mentionDropdown` — both use `position: absolute;
 *    bottom: calc(100% + 4px)` to float above the input container.
 *
 * Used by: MessageInput.tsx.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const s: Record<string, any> = {
  container:    { padding: "0 16px 16px", flexShrink: 0, position: "relative" },
  replyBar:     { display: "flex", alignItems: "center", gap: "8px", background: "var(--col-bg-hover)", borderRadius: "8px 8px 0 0", padding: "6px 12px", borderBottom: "1px solid var(--col-bg-subtle)", fontSize: "12px", color: "var(--col-text-secondary)" },
  replyIcon:    { color: "var(--col-link)", flexShrink: 0, display: "inline-flex" },
  replyText:    { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  replyClose:   { background: "transparent", border: "none", color: "var(--col-text-muted)", cursor: "pointer", padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center" },
  filePreview:  { display: "flex", alignItems: "center", gap: "10px", background: "var(--col-bg-hover)", padding: "8px 12px", borderBottom: "1px solid var(--col-bg-subtle)", fontSize: "12px", color: "var(--col-text-secondary)" },
  fileImg:      { width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" },
  fileIcon:     { fontSize: "28px" },
  fileRemove:   { background: "transparent", border: "none", color: "var(--col-danger)", cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "center" },
  wrapper:      { background: "var(--col-bg-hover)", border: "1px solid var(--col-bg-subtle)", borderRadius: "12px", display: "flex", alignItems: "flex-end", gap: "4px", padding: "8px 12px" },
  wrapperWithTop: { borderRadius: "0 0 12px 12px" },
  iconBtn:      { width: "32px", height: "32px", background: "transparent", border: "none", color: "var(--col-text-muted)", cursor: "pointer", padding: 0, borderRadius: "6px", flexShrink: 0, lineHeight: "1", transition: "color 0.15s, background 0.15s", display: "flex", alignItems: "center", justifyContent: "center" },
  textarea:     { flex: 1, background: "transparent", border: "none", color: "var(--col-text-primary)", fontSize: "14px", lineHeight: "1.5", resize: "none", maxHeight: "160px", minHeight: "20px", outline: "none", fontFamily: "inherit", overflowY: "auto" },
  sendBtn: (active: boolean) => ({
    width: "34px", height: "34px", borderRadius: "8px",
    background: active ? "var(--col-accent)" : "var(--col-bg-subtle)",
    color: active ? "#fff" : "var(--col-text-muted)",
    fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, cursor: active ? "pointer" : "default",
    border: "none", fontFamily: "inherit", transition: "all 0.15s",
  }),
  hint: { fontSize: "11px", color: "var(--col-text-muted)", marginTop: "4px", paddingLeft: "4px" },
  emojiPanel: {
    position: "absolute", bottom: "calc(100% + 4px)", left: "0",
    background: "var(--col-bg-elevated)", border: "1px solid var(--col-border)", borderRadius: "12px",
    width: "320px", maxHeight: "280px", overflow: "hidden",
    display: "flex", flexDirection: "column",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 100,
  },
  emojiTabs: { display: "flex", borderBottom: "1px solid var(--col-border)", overflow: "hidden" },
  emojiTab: (active: boolean) => ({
    flex: 1, padding: "8px 4px", textAlign: "center",
    fontSize: "11px", color: active ? "var(--col-text-primary)" : "var(--col-text-muted)",
    background: active ? "var(--col-bg-hover)" : "transparent",
    border: "none", cursor: "pointer", fontFamily: "inherit",
    borderBottom: active ? "2px solid var(--col-accent)" : "2px solid transparent",
  }),
  emojiGrid:    { display: "flex", flexWrap: "wrap", gap: "2px", padding: "8px", overflowY: "auto", flex: 1 },
  emojiItem:    { background: "transparent", border: "none", fontSize: "20px", cursor: "pointer", padding: "4px", borderRadius: "6px", lineHeight: "1" },
  mentionDropdown: {
    position: "absolute", bottom: "calc(100% + 4px)", left: "16px",
    background: "var(--col-bg-elevated)", border: "1px solid var(--col-border)", borderRadius: "8px",
    minWidth: "200px", maxHeight: "200px", overflowY: "auto",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 100,
  },
  mentionItem: (active: boolean) => ({
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 12px", cursor: "pointer",
    background: active ? "var(--col-bg-hover)" : "transparent", fontSize: "13px",
  }),
};
