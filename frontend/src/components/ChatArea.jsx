// ============================================================
//  components/ChatArea.jsx
//  Shared component for channels and DMs.
//  The isDm prop routes socket operations to the correct event type.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import MarkdownRenderer from "./MarkdownRenderer";

/** Quick-reaction emoji set shown in the hover toolbar. */
const EMOJI_SET = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👎"];

import { SOCKET_URL as BASE_URL } from "../config";

/**
 * Returns an emoji icon appropriate for a file's extension.
 *
 * @param {string} [filename=""] - The filename including extension.
 * @returns {string} An emoji character.
 */
function fileIcon(filename = "") {
  const ext = filename.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext))                          return "📄";
  if (["doc","docx"].includes(ext))                   return "📝";
  if (["xls","xlsx","csv"].includes(ext))             return "📊";
  if (["ppt","pptx"].includes(ext))                   return "📑";
  if (["zip","rar","7z"].includes(ext))               return "🗜️";
  if (["txt"].includes(ext))                          return "📃";
  return "📎";
}

/**
 * Formats a byte count as a human-readable string (B / KB / MB).
 *
 * @param {number} [bytes] - Number of bytes.
 * @returns {string} Formatted size string, or empty string if bytes is falsy.
 */
function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Inline style map used throughout ChatArea and its sub-components. */
const s = {
  area: { flex: 1, overflowY: "auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "2px" },
  empty: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#5c6068", gap: "12px" },
  emptyIcon: { fontSize: "48px" },
  loadMore: {
    alignSelf: "center", padding: "8px 20px", background: "#2d2d3f",
    border: "1px solid #3a3a4f", borderRadius: "20px", color: "#949ba4",
    fontSize: "13px", cursor: "pointer", marginBottom: "16px",
  },
  dateDivider: {
    display: "flex", alignItems: "center", gap: "12px", margin: "12px 0",
    color: "#5c6068", fontSize: "11px", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.5px",
  },
  dividerLine: { flex: 1, height: "1px", background: "#2d2d3f" },
  msgGroup: { display: "flex", flexDirection: "column", gap: "1px", marginBottom: "4px" },
  msgRow: {
    display: "flex", alignItems: "flex-start", gap: "12px",
    padding: "3px 8px", borderRadius: "8px", position: "relative",
  },
  avatarCol: { width: "36px", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "2px" },
  avatarEmoji: { fontSize: "22px", lineHeight: "1" },
  msgContent: { flex: 1, minWidth: 0 },
  msgHeader: { display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "2px", flexWrap: "wrap" },
  username: (isOwn) => ({ fontWeight: 600, fontSize: "14px", color: isOwn ? "#7289da" : "#f2f3f5" }),
  adminBadge: { fontSize: "12px", color: "#faa61a" },
  pinnedBadge: { fontSize: "10px", color: "#5c6068", background: "#2d2d3f", padding: "1px 6px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "3px" },
  timestamp: { fontSize: "11px", color: "#5c6068" },
  editedTag: { fontSize: "10px", color: "#5c6068", fontStyle: "italic" },
  replyQuote: {
    background: "#2d2d3f", borderLeft: "3px solid #5865f2", borderRadius: "4px",
    padding: "4px 10px", marginBottom: "6px", fontSize: "12px", color: "#949ba4",
    display: "flex", alignItems: "center", gap: "6px",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  replyAuthor: { color: "#7289da", fontWeight: 600, flexShrink: 0 },
  replyText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  msgImage: {
    maxWidth: "360px", maxHeight: "300px", borderRadius: "8px",
    display: "block", marginTop: "4px", cursor: "pointer",
    border: "1px solid #2d2d3f",
  },
  msgFile: {
    display: "inline-flex", alignItems: "center", gap: "10px",
    background: "#2d2d3f", border: "1px solid #3a3a4f",
    borderRadius: "8px", padding: "10px 14px", marginTop: "4px",
    fontSize: "13px", color: "#949ba4", cursor: "pointer",
    transition: "background 0.15s",
  },
  fileInfo: { display: "flex", flexDirection: "column", gap: "2px" },
  fileName: { color: "#f2f3f5", fontWeight: 500, fontSize: "13px" },
  fileSize: { color: "#5c6068", fontSize: "11px" },
  reactionsRow: { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" },
  reactionPill: (isMine) => ({
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "2px 8px",
    background: isMine ? "#5865f225" : "#2d2d3f",
    border: `1px solid ${isMine ? "#5865f260" : "#3a3a4f"}`,
    borderRadius: "12px", fontSize: "13px", cursor: "pointer",
    color: isMine ? "#7289da" : "#949ba4",
  }),
  actionBar: {
    position: "absolute", top: "-20px", right: "8px",
    display: "flex", gap: "2px", background: "#2d2d3f",
    border: "1px solid #3a3a4f", borderRadius: "8px",
    padding: "3px 4px", zIndex: 10,
    boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
  },
  actionBtn: {
    background: "transparent", border: "none", color: "#949ba4",
    fontSize: "14px", cursor: "pointer", padding: "3px 6px",
    borderRadius: "4px", lineHeight: "1",
  },
  editTextarea: {
    width: "100%", background: "#0f0f1a", border: "1px solid #5865f2",
    borderRadius: "6px", color: "#f2f3f5", fontSize: "14px",
    lineHeight: "1.5", padding: "8px 10px", resize: "none",
    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  },
  editActions: { display: "flex", gap: "8px", marginTop: "6px", fontSize: "12px" },
  editSave: { padding: "4px 12px", background: "#5865f2", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" },
  editCancel: { padding: "4px 8px", background: "transparent", border: "none", color: "#949ba4", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" },
  emojiPicker: {
    position: "absolute", top: "-54px", right: "8px",
    display: "flex", gap: "4px", background: "#2d2d3f",
    border: "1px solid #3a3a4f", borderRadius: "10px",
    padding: "6px 8px", zIndex: 20,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
  },
  emojiBtn: (active) => ({
    background: active ? "#5865f230" : "transparent",
    border: active ? "1px solid #5865f260" : "1px solid transparent",
    borderRadius: "6px", fontSize: "18px", cursor: "pointer",
    padding: "3px 4px", lineHeight: "1",
  }),
  // FilePreviewModal styles
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
    zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
  },
  modalBox: {
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "16px",
    padding: "24px", maxWidth: "90vw", maxHeight: "90vh",
    display: "flex", flexDirection: "column", gap: "16px",
    boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
  },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" },
  modalTitle: { fontWeight: 600, fontSize: "14px", color: "#f2f3f5", wordBreak: "break-all" },
  modalClose: { background: "transparent", border: "none", color: "#5c6068", fontSize: "20px", cursor: "pointer", padding: "2px 6px", flexShrink: 0 },
  modalImg: { maxWidth: "75vw", maxHeight: "70vh", borderRadius: "8px", objectFit: "contain", display: "block" },
  modalFileIcon: { fontSize: "64px", textAlign: "center" },
  modalFileMeta: { color: "#5c6068", fontSize: "13px", textAlign: "center" },
  modalActions: { display: "flex", gap: "10px", justifyContent: "center" },
  downloadBtn: {
    padding: "8px 20px", background: "#5865f2", border: "none",
    borderRadius: "8px", color: "#fff", fontSize: "13px",
    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
    textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px",
  },
};

/**
 * Formats a date string as a human-readable day label for chat dividers.
 *
 * @param {string} dateStr - ISO date string.
 * @returns {string} "Today", "Yesterday", or a localised date string.
 */
function formatDate(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Formats a date string as a short HH:MM time string.
 *
 * @param {string} dateStr - ISO date string.
 * @returns {string} e.g. "14:35"
 */
function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Groups a flat array of messages into a render-ready structure with
 * date dividers and consecutive-author groups.
 *
 * The output alternates between:
 * - `{ type: "divider", label, key }` — shown when the date changes.
 * - `{ type: "group", userId, username, avatar, role, messages[], key }` — consecutive
 *   messages from the same author on the same date share a group so that the
 *   avatar is only rendered for the first message.
 *
 * @param {Object[]} messages - Flat array of message objects.
 * @returns {Array<Object>} Mixed array of divider and group items.
 */
function groupMessages(messages) {
  const result = [];
  let lastDate  = null;
  let lastGroup = null;

  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString();
    if (date !== lastDate) {
      result.push({ type: "divider", label: formatDate(msg.created_at), key: `d-${msg.id}` });
      lastDate  = date;
      lastGroup = null; // Reset group on date boundary
    }
    if (lastGroup && lastGroup.userId === msg.user_id) {
      lastGroup.messages.push(msg);
    } else {
      lastGroup = { type: "group", userId: msg.user_id, username: msg.username, avatar: msg.avatar, role: msg.role, messages: [msg], key: `g-${msg.id}` };
      result.push(lastGroup);
    }
  }
  return result;
}

// -------------------------------------------------------
//  FilePreviewModal
// -------------------------------------------------------

/**
 * FilePreviewModal - Full-screen overlay for viewing or downloading a file attachment.
 *
 * - Images are displayed inline with a constrained max size.
 * - PDF files are rendered via an `<object>` element (browser-dependent).
 * - Other file types show a large file-type icon plus a download link.
 *
 * Pressing Escape or clicking the backdrop closes the modal.
 *
 * @component
 * @param {Object}   props
 * @param {string}   props.fileUrl   - Server-relative URL path (e.g. "/uploads/foo.png").
 * @param {string}   props.fileType  - Server-reported type: "image" or "file".
 * @param {string}   props.fileName  - Original filename for the download attribute.
 * @param {Function} props.onClose   - Called when the modal should be dismissed.
 * @returns {JSX.Element}
 */
function FilePreviewModal({ fileUrl, fileType, fileName, onClose }) {
  const fullUrl = `${BASE_URL}${fileUrl}`;
  const isImage = fileType === "image";
  const isPdf   = (fileName || "").toLowerCase().endsWith(".pdf");

  // Close on Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Downloads the file as a blob to trigger the browser's Save As dialog.
   * Falls back to opening the URL in a new tab if the fetch fails.
   *
   * @param {React.MouseEvent} e
   */
  async function handleDownload(e) {
    e.stopPropagation();
    try {
      const res  = await fetch(fullUrl);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = href;
      a.download = fileName || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
    } catch {
      window.open(fullUrl, "_blank");
    }
  }

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      {/* Stop click propagation so clicking inside the modal does not close it */}
      <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={s.modalHeader}>
          <span style={s.modalTitle}>{fileName}</span>
          <button style={s.modalClose} onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        {isImage ? (
          <img src={fullUrl} alt={fileName} style={s.modalImg} />
        ) : isPdf ? (
          <object
            data={fullUrl}
            type="application/pdf"
            style={{ width: "75vw", height: "68vh", borderRadius: "8px", border: "none" }}
          >
            <div style={{ ...s.modalFileIcon, marginTop: "16px" }}>{fileIcon(fileName)}</div>
            <div style={{ ...s.modalFileMeta, marginTop: "8px" }}>
              Your browser does not support PDF preview. Use the download button.
            </div>
          </object>
        ) : (
          <>
            <div style={s.modalFileIcon}>{fileIcon(fileName)}</div>
            <div style={s.modalFileMeta}>{fileName}</div>
          </>
        )}

        <div style={s.modalActions}>
          <button style={s.downloadBtn} onClick={handleDownload}>
            ⬇ Download
          </button>
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            style={{ ...s.downloadBtn, background: "#2d2d3f", color: "#949ba4" }}
            onClick={(e) => e.stopPropagation()}
          >
            🔗 Open
          </a>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------
//  MessageRow
// -------------------------------------------------------

/**
 * MessageRow - Renders a single message within a group.
 *
 * Displays the avatar and username header only for the first message in a
 * consecutive-author group (`isGroupFirst=true`).  On hover a toolbar
 * appears with reaction, reply, pin, edit, and delete actions.
 *
 * Routing between channel and DM socket operations is controlled by the
 * `isDm` prop; when true the component calls `editDmMessage`, `deleteDmMessage`,
 * and `reactToDmMessage` instead of their channel equivalents.
 *
 * @component
 * @param {Object}   props
 * @param {Object}   props.msg           - The full message object.
 * @param {boolean}  props.isGroupFirst  - True for the first message in a consecutive-author block.
 * @param {string}   props.avatar        - Sender's emoji avatar.
 * @param {string}   props.username      - Sender's display name.
 * @param {string}   props.role          - Sender's global role ("admin" or "user").
 * @param {Function} props.onReply       - Called with the message object to open reply mode.
 * @param {Function} props.onPin         - Called with (messageId, isCurrentlyPinned) to toggle pin.
 * @param {boolean}  props.canPin        - Whether the current user may pin messages.
 * @param {Object[]} props.users         - Full user list for @mention rendering.
 * @param {boolean}  [props.isDm=false]  - Routes socket operations to DM events when true.
 * @returns {JSX.Element}
 */
function MessageRow({ msg, isGroupFirst, avatar, username, role, onReply, onPin, canPin, users, isDm }) {
  const { user } = useAuth();
  const { editMessage, deleteMessage, reactToMessage, editDmMessage, deleteDmMessage, reactToDmMessage } = useSocket();

  const [hovered, setHovered]     = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editText, setEditText]   = useState(msg.content || "");
  // preview holds file props for the FilePreviewModal; null when closed
  const [preview, setPreview]     = useState(null);
  const editRef = useRef(null);
  const rowRef  = useRef(null);

  const isOwn   = msg.user_id === user?.id;
  const isAdmin = role === "admin";
  const isPinned = !!msg.is_pinned;

  // Route to DM or channel socket operations based on the isDm prop
  const doEdit   = isDm ? editDmMessage   : editMessage;
  const doDelete = isDm ? deleteDmMessage : deleteMessage;
  const doReact  = isDm ? reactToDmMessage : reactToMessage;

  // Sync edit textarea when the message content changes (e.g. from a remote edit event)
  useEffect(() => {
    if (!editing) setEditText(msg.content || "");
  }, [msg.content, editing]);

  // Close the emoji picker when clicking outside the message row
  useEffect(() => {
    if (!showEmoji) return;
    function onDoc(e) { if (rowRef.current && !rowRef.current.contains(e.target)) setShowEmoji(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showEmoji]);

  // Focus and move cursor to end of edit textarea when entering edit mode
  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      const len = editText.length;
      editRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  /** Saves the edited content if it changed; exits edit mode. */
  function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === msg.content) { setEditing(false); return; }
    doEdit(msg.id, trimmed, ({ error } = {}) => {
      if (error) console.error("Edit error:", error);
    });
    setEditing(false);
  }

  /** Cancels the edit and restores the original content. */
  function cancelEdit() { setEditText(msg.content || ""); setEditing(false); }

  /** Confirms and deletes the message via socket. */
  function handleDelete() {
    if (!confirm("Delete this message?")) return;
    doDelete(msg.id, ({ error } = {}) => {
      if (error) console.error("Delete error:", error);
    });
  }

  /**
   * Toggles an emoji reaction on the message.
   *
   * @param {string} emoji
   */
  function handleReact(emoji) {
    doReact(msg.id, emoji, ({ error } = {}) => {
      if (error) console.error("React error:", error);
    });
    setShowEmoji(false);
  }

  /**
   * Handles Enter (save) and Escape (cancel) in the edit textarea.
   *
   * @param {React.KeyboardEvent} e
   */
  function onEditKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  }

  const reactions    = msg.reactions || {};
  const hasReactions = Object.keys(reactions).length > 0;
  // file_name is the original user-supplied filename; fall back to the URL slug
  const fileName = msg.file_name || (msg.file_url ? msg.file_url.split("/").pop() : null);
  const isImage  = msg.file_type === "image";

  /** Opens the FilePreviewModal for this message's attachment. */
  function openPreview() {
    setPreview({ fileUrl: msg.file_url, fileType: msg.file_type, fileName });
  }

  return (
    <>
      <div
        ref={rowRef}
        style={{ ...s.msgRow, background: hovered ? "#ffffff08" : "transparent" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setShowEmoji(false); }}
      >
        {/* Avatar column — shows avatar emoji for the group leader, or a faint timestamp for followers */}
        <div style={s.avatarCol}>
          {isGroupFirst ? (
            <span style={s.avatarEmoji} title={username}>{avatar || "👤"}</span>
          ) : (
            // Compact timestamp visible only on hover for non-first rows
            <span style={{ ...s.timestamp, fontSize: "10px", opacity: hovered ? 0.6 : 0, paddingTop: "4px" }}>
              {formatTime(msg.created_at)}
            </span>
          )}
        </div>

        {/* Message content area */}
        <div style={s.msgContent}>
          {isGroupFirst && (
            <div style={s.msgHeader}>
              <span style={s.username(isOwn)}>{username}</span>
              {isAdmin && <span style={s.adminBadge} title="Admin">👑</span>}
              <span style={s.timestamp}>{formatTime(msg.created_at)}</span>
              {!!msg.is_edited && <span style={s.editedTag}>(edited)</span>}
              {isPinned && <span style={s.pinnedBadge}>📌 pinned</span>}
            </div>
          )}

          {/* Reply quote block — shown when this message is a reply */}
          {msg.reply_to_id && (
            <div style={s.replyQuote}>
              <span>↩</span>
              <span style={s.replyAuthor}>{msg.reply_username || "?"}</span>
              <span style={s.replyText}>
                {msg.reply_file_url ? "[file]" : (msg.reply_content || "").slice(0, 100)}
              </span>
            </div>
          )}

          {/* Inline content — edit textarea or rendered markdown */}
          {editing ? (
            <>
              <textarea
                ref={editRef}
                style={s.editTextarea}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={onEditKeyDown}
                rows={Math.min(editText.split("\n").length + 1, 8)}
              />
              <div style={s.editActions}>
                <button style={s.editSave} onClick={saveEdit}>Save</button>
                <button style={s.editCancel} onClick={cancelEdit}>Cancel (Esc)</button>
              </div>
            </>
          ) : (
            <>
              {msg.content && <MarkdownRenderer text={msg.content} users={users} />}
              {msg.file_url && (
                isImage ? (
                  <img
                    src={`${BASE_URL}${msg.file_url}`}
                    alt={fileName}
                    style={s.msgImage}
                    onClick={openPreview}
                    title="Click to preview"
                  />
                ) : (
                  <div style={s.msgFile} onClick={openPreview} title="Click to preview">
                    <span style={{ fontSize: "24px" }}>{fileIcon(fileName)}</span>
                    <div style={s.fileInfo}>
                      <span style={s.fileName}>{fileName}</span>
                      {msg.file_size && <span style={s.fileSize}>{formatBytes(msg.file_size)}</span>}
                    </div>
                  </div>
                )
              )}
            </>
          )}

          {/* Reaction pill buttons — clicking toggles the user's own reaction */}
          {hasReactions && !editing && (
            <div style={s.reactionsRow}>
              {Object.entries(reactions).map(([emoji, userIds]) => {
                const isMine = userIds.includes(user?.id);
                return (
                  <button
                    key={emoji}
                    style={s.reactionPill(isMine)}
                    onClick={() => handleReact(emoji)}
                    title={`${userIds.length} reaction${userIds.length === 1 ? "" : "s"}`}
                  >
                    {emoji} <span style={{ fontSize: "11px" }}>{userIds.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Hover toolbar — appears when the row is hovered and the message is not being edited */}
        {hovered && !editing && (
          <div style={s.actionBar}>
            <button style={s.actionBtn} title="React" onClick={(e) => { e.stopPropagation(); setShowEmoji((v) => !v); }}>
              😊
            </button>
            <button style={s.actionBtn} title="Reply" onClick={() => onReply?.(msg)}>
              ↩
            </button>
            {/* Pin button only shown for channel messages when the user has pin permission */}
            {canPin && !isDm && (
              <button
                style={s.actionBtn}
                title={isPinned ? "Unpin" : "Pin"}
                onClick={() => onPin?.(msg.id, isPinned)}
              >
                📌
              </button>
            )}
            {isOwn && (
              <button style={s.actionBtn} title="Edit" onClick={() => { setEditing(true); setShowEmoji(false); }}>
                ✏️
              </button>
            )}
            {isOwn && (
              <button style={{ ...s.actionBtn, color: "#f23f42" }} title="Delete" onClick={handleDelete}>
                🗑️
              </button>
            )}
          </div>
        )}

        {/* Quick-reaction emoji picker — appears when the reaction button is clicked */}
        {showEmoji && (
          <div style={s.emojiPicker} onClick={(e) => e.stopPropagation()}>
            {EMOJI_SET.map((emoji) => {
              const isMine = (reactions[emoji] || []).includes(user?.id);
              return (
                <button key={emoji} style={s.emojiBtn(isMine)} onClick={() => handleReact(emoji)}>
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline file preview modal — mounted adjacent to the row so z-index stacking works */}
      {preview && (
        <FilePreviewModal
          fileUrl={preview.fileUrl}
          fileType={preview.fileType}
          fileName={preview.fileName}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

// -------------------------------------------------------
//  ChatArea (main export)
// -------------------------------------------------------

/**
 * ChatArea - Scrollable message list used by both channel and DM views.
 *
 * Renders the grouped message list produced by {@link groupMessages}, a
 * "Load more" button when older pages are available, a typing indicator bar
 * when other users are typing, and an empty-state placeholder when there are
 * no messages.
 *
 * Auto-scrolls to the bottom when new messages arrive, but only when the
 * user is already within 200 px of the bottom (so it does not interfere with
 * reading older history).
 *
 * @component
 * @param {Object}    props
 * @param {Object[]}  props.messages          - Flat array of message objects to render.
 * @param {boolean}   props.loading           - When true, shows a loading spinner instead of messages.
 * @param {boolean}   props.hasMore           - Whether older messages can be loaded.
 * @param {Function}  props.onLoadMore        - Called when the "Load more" button is clicked.
 * @param {string[]}  [props.typingUsers=[]]  - Usernames currently typing in this conversation.
 * @param {Function}  props.onReply           - Called with a message object to initiate a reply.
 * @param {Function}  props.onPin             - Called with (messageId, isCurrentlyPinned) to toggle a pin.
 * @param {boolean}   props.canPin            - Whether the current user has pin permission.
 * @param {Object[]}  [props.users=[]]        - Full user list forwarded to MessageRow for mention rendering.
 * @param {boolean}   [props.isDm=false]      - Routes MessageRow socket calls to DM events.
 * @returns {JSX.Element}
 */
export default function ChatArea({ messages, loading, hasMore, onLoadMore, typingUsers = [], onReply, onPin, canPin, users = [], isDm = false }) {
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive, but only if already near the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (isNearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const groups = groupMessages(messages);

  if (loading) {
    return (
      <div style={{ ...s.area, ...s.empty }}>
        <span style={s.emptyIcon}>⏳</span>
        <span>Loading messages...</span>
      </div>
    );
  }

  return (
    <div style={s.area} ref={scrollRef}>
      {/* Load older messages button — pinned at the top of the scroll area */}
      {hasMore && (
        <button style={s.loadMore} onClick={onLoadMore}>
          ↑ Load older messages
        </button>
      )}

      {messages.length === 0 && (
        <div style={s.empty}>
          <span style={s.emptyIcon}>💬</span>
          <span>No messages yet. Be the first!</span>
        </div>
      )}

      {groups.map((item) => {
        if (item.type === "divider") {
          return (
            <div key={item.key} style={s.dateDivider}>
              <div style={s.dividerLine} />
              <span>{item.label}</span>
              <div style={s.dividerLine} />
            </div>
          );
        }
        return (
          <div key={item.key} style={s.msgGroup}>
            {item.messages.map((msg, idx) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                isGroupFirst={idx === 0}
                avatar={item.avatar}
                username={item.username}
                role={item.role}
                onReply={onReply}
                onPin={onPin}
                canPin={canPin}
                users={users}
                isDm={isDm}
              />
            ))}
          </div>
        );
      })}

      {/* Typing indicator — shown at the bottom of the scroll area */}
      {typingUsers.length > 0 && (
        <div style={{ fontSize: "12px", color: "#949ba4", padding: "4px 8px", fontStyle: "italic" }}>
          {typingUsers.join(", ")} {typingUsers.length === 1 ? "is typing..." : "are typing..."}
        </div>
      )}

      {/* Invisible sentinel element used as the scroll target */}
      <div ref={bottomRef} />
    </div>
  );
}
