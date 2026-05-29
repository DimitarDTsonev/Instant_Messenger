/**
 * Shared inline-style map for ChatArea and MessageRow.
 *
 * Tokens from the global CSS custom properties (`var(--col-*)`) are used
 * throughout so that both light and dark themes are handled automatically.
 *
 * Notable entries:
 *  - `msgRow` — flex row with relative positioning, required by the absolute
 *    `actionBar` overlay that floats above the row on hover.
 *  - `actionBar` — `position: absolute; top: -20px` floats the action buttons
 *    above the message row without disturbing layout.
 *  - `reactionPill` — parameterised: `isMine` applies an accent tint to
 *    reactions the current user has already added.
 *  - `emojiPicker` — `position: absolute; top: -54px` overlaps both the action
 *    bar and the message above; `zIndex: 20` ensures it sits on top.
 *  - `modalOverlay` / `modalBox` — styles for FilePreviewModal's overlay/dialog.
 *
 * Used by: ChatArea.tsx, MessageRow.tsx, FilePreviewModal.tsx.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const s: Record<string, any> = {
  area:       { flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "2px" },
  empty:      { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--col-text-muted)", gap: "12px" },
  emptyIcon:  { fontSize: "48px" },
  loadMore: {
    alignSelf: "center", padding: "8px 20px", background: "var(--col-bg-hover)",
    border: "1px solid var(--col-bg-subtle)", borderRadius: "20px", color: "var(--col-text-secondary)",
    fontSize: "13px", cursor: "pointer", marginBottom: "16px",
  },
  dateDivider: {
    display: "flex", alignItems: "center", gap: "12px", margin: "12px 0",
    color: "var(--col-text-muted)", fontSize: "11px", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
  dividerLine: { flex: 1, height: "1px", background: "var(--col-border)" },
  msgGroup:   { display: "flex", flexDirection: "column", gap: "1px", marginBottom: "4px" },
  msgRow: {
    display: "flex", alignItems: "flex-start", gap: "12px",
    padding: "3px 8px", borderRadius: "8px", position: "relative",
  },
  avatarCol:   { width: "36px", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "2px" },
  avatarEmoji: { fontSize: "22px", lineHeight: "1" },
  msgContent:  { flex: 1, minWidth: 0, overflowWrap: "break-word", wordBreak: "break-word" },
  msgHeader:   { display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "2px", flexWrap: "wrap" },
  username:    (isOwn: boolean) => ({ fontWeight: 600, fontSize: "14px", color: isOwn ? "var(--col-link)" : "var(--col-text-primary)" }),
  adminBadge:  { color: "var(--col-warning-gold)", display: "inline-flex", alignItems: "center" },
  pinnedBadge: { fontSize: "10px", color: "var(--col-text-muted)", background: "var(--col-bg-hover)", padding: "1px 6px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "3px" },
  integrationBadge: { fontSize: "10px", color: "var(--col-int-fg)", background: "var(--col-int-bg)", padding: "1px 6px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "3px", fontWeight: 700 },
  timestamp:   { fontSize: "11px", color: "var(--col-text-muted)" },
  editedTag:   { fontSize: "10px", color: "var(--col-text-muted)", fontStyle: "italic" },
  replyQuote: {
    background: "var(--col-bg-hover)", borderLeft: "3px solid var(--col-accent)", borderRadius: "4px",
    padding: "4px 10px", marginBottom: "6px", fontSize: "12px", color: "var(--col-text-secondary)",
    display: "flex", alignItems: "center", gap: "6px",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  replyAuthor: { color: "var(--col-link)", fontWeight: 600, flexShrink: 0 },
  replyText:   { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  msgImage: {
    maxWidth: "360px", maxHeight: "300px", borderRadius: "8px",
    display: "block", marginTop: "4px", cursor: "pointer", border: "1px solid var(--col-border)",
  },
  msgFile: {
    display: "inline-flex", alignItems: "center", gap: "10px",
    background: "var(--col-bg-hover)", border: "1px solid var(--col-bg-subtle)",
    borderRadius: "8px", padding: "10px 14px", marginTop: "4px",
    fontSize: "13px", color: "var(--col-text-secondary)", cursor: "pointer", transition: "background 0.15s",
  },
  fileInfo:    { display: "flex", flexDirection: "column", gap: "2px" },
  fileName:    { color: "var(--col-text-primary)", fontWeight: 500, fontSize: "13px" },
  fileSize:    { color: "var(--col-text-muted)", fontSize: "11px" },
  reactionsRow: { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" },
  reactionPill: (isMine: boolean) => ({
    display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px",
    background: isMine ? "rgba(88,101,242,0.15)" : "var(--col-bg-hover)",
    border: `1px solid ${isMine ? "rgba(88,101,242,0.38)" : "var(--col-bg-subtle)"}`,
    borderRadius: "12px", fontSize: "13px", cursor: "pointer",
    color: isMine ? "var(--col-link)" : "var(--col-text-secondary)",
  }),
  actionBar: {
    position: "absolute", top: "-20px", right: "8px",
    display: "flex", gap: "2px", background: "var(--col-bg-hover)",
    border: "1px solid var(--col-bg-subtle)", borderRadius: "8px",
    padding: "3px 4px", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  },
  actionBtn: {
    background: "transparent", border: "none", color: "var(--col-text-secondary)",
    cursor: "pointer", padding: 0, width: "26px", height: "26px",
    borderRadius: "4px", lineHeight: "1", display: "flex",
    alignItems: "center", justifyContent: "center",
  },
  editTextarea: {
    width: "100%", background: "var(--col-bg-input)", border: "1px solid var(--col-accent)",
    borderRadius: "6px", color: "var(--col-text-primary)", fontSize: "14px",
    lineHeight: "1.5", padding: "8px 10px", resize: "none",
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  },
  editActions: { display: "flex", gap: "8px", marginTop: "6px", fontSize: "12px" },
  editSave:    { padding: "4px 12px", background: "var(--col-accent)", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" },
  editCancel:  { padding: "4px 8px", background: "transparent", border: "none", color: "var(--col-text-secondary)", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" },
  emojiPicker: {
    position: "absolute", top: "-54px", right: "8px",
    display: "flex", gap: "4px", background: "var(--col-bg-hover)",
    border: "1px solid var(--col-bg-subtle)", borderRadius: "10px",
    padding: "6px 8px", zIndex: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  },
  emojiBtn: (active: boolean) => ({
    background: active ? "rgba(88,101,242,0.19)" : "transparent",
    border: active ? "1px solid rgba(88,101,242,0.38)" : "1px solid transparent",
    borderRadius: "6px", fontSize: "18px", cursor: "pointer", padding: "3px 4px", lineHeight: "1",
  }),
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
    zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
  },
  modalBox: {
    background: "var(--col-bg-elevated)", border: "1px solid var(--col-border)", borderRadius: "16px",
    padding: "24px", maxWidth: "90vw", maxHeight: "90vh",
    display: "flex", flexDirection: "column", gap: "16px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
  },
  modalHeader:   { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" },
  modalTitle:    { fontWeight: 600, fontSize: "14px", color: "var(--col-text-primary)", wordBreak: "break-all" },
  modalClose:    { background: "transparent", border: "none", color: "var(--col-text-muted)", fontSize: "20px", cursor: "pointer", padding: "2px 6px", flexShrink: 0 },
  modalImg:      { maxWidth: "75vw", maxHeight: "70vh", borderRadius: "8px", objectFit: "contain", display: "block" },
  modalFileIcon: { fontSize: "64px", textAlign: "center" },
  modalFileMeta: { color: "var(--col-text-muted)", fontSize: "13px", textAlign: "center" },
  modalActions:  { display: "flex", gap: "10px", justifyContent: "center" },
  downloadBtn: {
    padding: "8px 20px", background: "var(--col-accent)", border: "none",
    borderRadius: "8px", color: "#fff", fontSize: "13px",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
    textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px",
  },
};
