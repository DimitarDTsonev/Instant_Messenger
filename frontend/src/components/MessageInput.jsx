// ============================================================
//  components/MessageInput.jsx
//  Emoji picker · @mention autocomplete · Reply mode · File upload
//  Works identically for channels and DMs.
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";

/**
 * Categorized emoji sets displayed in the emoji picker panel.
 * Keys are category labels; values are arrays of emoji characters.
 */
const EMOJI_CATS = {
  "Smileys": ["😀","😁","😂","🤣","😊","😍","🥰","😘","😎","🤩","🥳","😇","🤗","😏","😒","😢","😭","😤","😠","🤬","😱","😳","🤯","🥺","😴","🤢","🤡","👻","💀"],
  "Gestures": ["👍","👎","👋","🤚","✋","🖐","🤞","🤟","🤘","👌","🤌","✌️","🤙","💪","🙏","👐","🤝","✊","👊","🫶"],
  "Hearts":  ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","🔥","✨"],
  "Symbols": ["🎉","🎊","🎈","🏆","⭐","🌟","💡","🔔","📢","🚀","💯","✅","❌","⚡","💬","📝","🔒","🔓","🎯","🎸"],
};

/**
 * MIME types accepted by the file upload input.
 * Must match the allowlist on the server-side upload handler.
 */
const ACCEPTED_TYPES = [
  "image/jpeg","image/png","image/gif","image/webp","image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain","text/csv",
  "application/zip","application/x-zip-compressed",
  "application/x-rar-compressed","application/x-7z-compressed",
].join(",");

/** Inline style map used throughout MessageInput. */
const s = {
  container: { padding: "0 16px 16px", flexShrink: 0, position: "relative" },
  replyBar: {
    display: "flex", alignItems: "center", gap: "8px",
    background: "#2d2d3f", borderRadius: "8px 8px 0 0",
    padding: "6px 12px", borderBottom: "1px solid #3a3a4f",
    fontSize: "12px", color: "#949ba4",
  },
  replyIcon: { color: "#7289da", flexShrink: 0 },
  replyText: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  replyClose: { background: "transparent", border: "none", color: "#5c6068", cursor: "pointer", fontSize: "14px", padding: "0 4px" },
  filePreview: {
    display: "flex", alignItems: "center", gap: "10px",
    background: "#2d2d3f", padding: "8px 12px",
    borderBottom: "1px solid #3a3a4f", fontSize: "12px", color: "#949ba4",
  },
  fileImg: { width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" },
  fileIcon: { fontSize: "28px" },
  fileRemove: { background: "transparent", border: "none", color: "#f23f42", cursor: "pointer", fontSize: "14px", marginLeft: "auto" },
  wrapper: {
    background: "#2d2d3f", border: "1px solid #3a3a4f", borderRadius: "12px",
    display: "flex", alignItems: "flex-end", gap: "4px", padding: "8px 12px",
  },
  wrapperWithTop: { borderRadius: "0 0 12px 12px" },
  iconBtn: {
    background: "transparent", border: "none", color: "#5c6068",
    fontSize: "18px", cursor: "pointer", padding: "4px 6px",
    borderRadius: "6px", flexShrink: 0, lineHeight: "1",
    transition: "color 0.15s",
  },
  textarea: {
    flex: 1, background: "transparent", border: "none", color: "#f2f3f5",
    fontSize: "14px", lineHeight: "1.5", resize: "none",
    maxHeight: "160px", minHeight: "20px", outline: "none",
    fontFamily: "inherit", overflowY: "auto",
  },
  sendBtn: (active) => ({
    width: "34px", height: "34px", borderRadius: "8px",
    background: active ? "#5865f2" : "#3a3a4f",
    color: active ? "#fff" : "#5c6068",
    fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, cursor: active ? "pointer" : "default",
    border: "none", fontFamily: "inherit", transition: "all 0.15s",
  }),
  hint: { fontSize: "11px", color: "#5c6068", marginTop: "4px", paddingLeft: "4px" },
  emojiPanel: {
    position: "absolute", bottom: "calc(100% + 4px)", left: "0",
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "12px",
    width: "320px", maxHeight: "280px", overflow: "hidden",
    display: "flex", flexDirection: "column",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 100,
  },
  emojiTabs: { display: "flex", borderBottom: "1px solid #2d2d3f", overflow: "hidden" },
  emojiTab: (active) => ({
    flex: 1, padding: "8px 4px", textAlign: "center",
    fontSize: "11px", color: active ? "#f2f3f5" : "#5c6068",
    background: active ? "#2d2d3f" : "transparent",
    border: "none", cursor: "pointer", fontFamily: "inherit",
    borderBottom: active ? "2px solid #5865f2" : "2px solid transparent",
  }),
  emojiGrid: { display: "flex", flexWrap: "wrap", gap: "2px", padding: "8px", overflowY: "auto", flex: 1 },
  emojiItem: { background: "transparent", border: "none", fontSize: "20px", cursor: "pointer", padding: "4px", borderRadius: "6px", lineHeight: "1" },
  mentionDropdown: {
    position: "absolute", bottom: "calc(100% + 4px)", left: "16px",
    background: "#1e1e2e", border: "1px solid #2d2d3f", borderRadius: "8px",
    minWidth: "200px", maxHeight: "200px", overflowY: "auto",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 100,
  },
  mentionItem: (active) => ({
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 12px", cursor: "pointer",
    background: active ? "#2d2d3f" : "transparent", fontSize: "13px",
  }),
};

/**
 * Returns an emoji icon appropriate for a file's extension.
 *
 * @param {string} [filename=""] - The filename including extension.
 * @returns {string} An emoji character.
 */
function fileIcon(filename = "") {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "pdf")                       return "📄";
  if (["doc","docx"].includes(ext))        return "📝";
  if (["xls","xlsx","csv"].includes(ext))  return "📊";
  if (["ppt","pptx"].includes(ext))        return "📑";
  if (["zip","rar","7z"].includes(ext))    return "🗜️";
  if (ext === "txt")                       return "📃";
  return "📎";
}

/**
 * useDebounce - Returns a debounced version of the provided callback.
 *
 * Each call resets the timer; the callback fires only after `delay` ms of
 * inactivity.  Used here to debounce the typing-stop signal.
 *
 * @param {Function} fn    - The function to debounce.
 * @param {number}   delay - Debounce delay in milliseconds.
 * @returns {Function} The debounced function.
 */
function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

/**
 * MessageInput - Composable message input bar used by both channel and DM views.
 *
 * Features:
 * - Auto-growing textarea (up to 160 px) that resets on send.
 * - Emoji picker panel (categorised, click to insert at cursor).
 * - @mention autocomplete dropdown (keyboard-navigable, filters by prefix).
 * - Reply mode — shows a quoted bar above the input; cleared on send.
 * - File attachment — uploads to POST /api/upload, shows an inline preview
 *   before sending.
 * - Typing indicators — emits typing:start on input and typing:stop after
 *   1.5 s of inactivity (channel mode only).
 *
 * @component
 * @param {Object}    props
 * @param {number}    [props.channelId]       - Active channel ID (undefined in DM mode).
 * @param {string}    [props.channelName]     - Active channel name for placeholder text.
 * @param {Object}    [props.dmUser]          - DM partner user object (undefined in channel mode).
 * @param {boolean}   [props.isDm=false]      - Whether the input is in DM mode.
 * @param {boolean}   [props.disabled=false]  - Disables the input entirely (no channel selected).
 * @param {boolean}   [props.canWrite=true]   - Whether the current user has write permission.
 * @param {Function}  [props.onAddMessage]    - Called with the sent message object (DM mode only).
 * @param {Object[]}  [props.users=[]]        - Full user list for @mention autocomplete.
 * @param {Object}    [props.replyTo=null]    - Message being replied to ({ id, username, content }).
 * @param {Function}  [props.onClearReply]    - Called when the reply bar's close button is clicked.
 * @returns {JSX.Element}
 */
export default function MessageInput({
  channelId, channelName, dmUser, isDm, disabled, canWrite = true, onAddMessage,
  users = [], replyTo = null, onClearReply,
}) {
  const { sendMessage, sendDm, emitTypingStart, emitTypingStop } = useSocket();
  const { token } = useAuth();

  const [text, setText]           = useState("");
  const [sending, setSending]     = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat]   = useState(Object.keys(EMOJI_CATS)[0]);
  // fileData holds the uploaded file's server URL, local preview URL, MIME type, and original name
  const [fileData, setFileData]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [mentionQ, setMentionQ]   = useState("");
  const [mentionList, setMentionList] = useState([]);
  // Keyboard-highlighted index in the mention dropdown
  const [mentionIdx, setMentionIdx]   = useState(0);

  const textareaRef  = useRef(null);
  const fileInputRef = useRef(null);
  // Ref for the emoji panel used to detect outside clicks
  const panelRef     = useRef(null);

  // Debounced typing stop — fires 1.5 s after the user stops typing
  const stopTyping = useDebounce(() => {
    if (channelId) emitTypingStop(channelId);
  }, 1500);

  // Close the emoji panel when clicking anywhere outside it
  useEffect(() => {
    if (!showEmoji) return;
    function onDoc(e) { if (panelRef.current && !panelRef.current.contains(e.target)) setShowEmoji(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showEmoji]);

  /**
   * Handles textarea changes: auto-resizes the element, emits typing events,
   * and updates the @mention autocomplete dropdown.
   *
   * @param {React.ChangeEvent<HTMLTextAreaElement>} e
   */
  function handleChange(e) {
    const val = e.target.value;
    setText(val);

    // Auto-resize the textarea up to the 160 px cap
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; }

    if (!isDm && channelId && val.trim()) { emitTypingStart(channelId); stopTyping(); }

    // Detect "@word" immediately before the cursor and populate the mention dropdown
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      const q = atMatch[1].toLowerCase();
      setMentionQ(q);
      setMentionList(users.filter((u) => u.username.toLowerCase().startsWith(q)).slice(0, 8));
      setMentionIdx(0);
    } else {
      setMentionList([]);
      setMentionQ("");
    }
  }

  /**
   * Replaces the current @mention query with the selected username.
   * Restores focus and cursor position after the DOM update.
   *
   * @param {string} username - The username to insert (without the @ prefix).
   */
  function insertMention(username) {
    const ta     = textareaRef.current;
    const cursor = ta?.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after  = text.slice(cursor);
    const newBefore = before.replace(/@(\w*)$/, `@${username} `);
    setText(newBefore + after);
    setMentionList([]);
    // Defer focus so the state update has propagated before we move the cursor
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(newBefore.length, newBefore.length); }, 0);
  }

  /**
   * Inserts an emoji at the current cursor position in the textarea.
   *
   * @param {string} emoji - The emoji character to insert.
   */
  function insertEmoji(emoji) {
    const ta     = textareaRef.current;
    const cursor = ta?.selectionStart ?? text.length;
    const newText = text.slice(0, cursor) + emoji + text.slice(cursor);
    setText(newText);
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(cursor + emoji.length, cursor + emoji.length); }, 0);
  }

  /**
   * Uploads the selected file to POST /api/upload and stores the result in fileData.
   * For image files a local object URL is created for the inline preview.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch(`${API}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Only create an object URL for images so we can show a thumbnail preview
      const previewUrl = data.type === "image" ? URL.createObjectURL(file) : null;
      setFileData({ url: data.url, type: data.type, name: data.name || file.name, previewUrl });
    } catch (err) {
      alert("Upload error: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset file input so the same file can be re-selected
    }
  }

  /**
   * Sends the current message (text + optional file attachment) via the socket.
   * Clears the textarea and file preview on success; restores them on error.
   */
  async function handleSend() {
    const content = text.trim();
    if ((!content && !fileData) || sending || disabled || !canWrite) return;

    setSending(true);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (!isDm && channelId) emitTypingStop(channelId);

    const fileUrl  = fileData?.url  || null;
    const fileType = fileData?.type || null;
    const fileName = fileData?.name || null;
    setFileData(null);

    if (isDm && dmUser) {
      sendDm(dmUser.id, content, fileUrl, fileType, fileName, replyTo?.id || null, ({ error, message } = {}) => {
        if (error) { setText(content); console.error("DM error:", error); }
        else if (message) { onAddMessage?.(message); }
        setSending(false);
      });
    } else {
      sendMessage(channelId, content, replyTo?.id, fileUrl, fileType, fileName, ({ error } = {}) => {
        if (error) { setText(content); console.error("Send error:", error); }
        setSending(false);
      });
    }
    onClearReply?.();
  }

  /**
   * Handles keyboard navigation in the mention dropdown and Enter-to-send.
   *
   * @param {React.KeyboardEvent<HTMLTextAreaElement>} e
   */
  function handleKeyDown(e) {
    if (mentionList.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionList.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionList[mentionIdx].username); return; }
      if (e.key === "Escape") { setMentionList([]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // True when there is something rendered above the main input row (reply bar or file preview)
  const hasTop     = replyTo || fileData || uploading;
  const isBlocked  = disabled || !canWrite;
  const placeholder = disabled
    ? "Select a channel..."
    : !canWrite
    ? "You don't have permission to write in this channel"
    : isDm
    ? `Message ${dmUser?.username || "user"}...`
    : `Send to #${channelName || "channel"}`;

  return (
    <div style={s.container}>
      {/* @mention dropdown — rendered above the input */}
      {mentionList.length > 0 && (
        <div style={s.mentionDropdown}>
          {mentionList.map((u, i) => (
            <div
              key={u.id}
              style={s.mentionItem(i === mentionIdx)}
              // Use onMouseDown instead of onClick to prevent textarea blur before insertion
              onMouseDown={(e) => { e.preventDefault(); insertMention(u.username); }}
            >
              <span style={{ fontSize: "18px" }}>{u.avatar || "👤"}</span>
              <span style={{ color: "#f2f3f5" }}>@{u.username}</span>
              {u.role === "admin" && <span title="Administrator" style={{ fontSize: "12px" }}>👑</span>}
            </div>
          ))}
        </div>
      )}

      {/* Emoji picker panel */}
      {showEmoji && (
        <div style={s.emojiPanel} ref={panelRef}>
          <div style={s.emojiTabs}>
            {Object.keys(EMOJI_CATS).map((cat) => (
              <button key={cat} style={s.emojiTab(emojiCat === cat)} onClick={() => setEmojiCat(cat)}>
                {cat}
              </button>
            ))}
          </div>
          <div style={s.emojiGrid}>
            {EMOJI_CATS[emojiCat].map((emoji) => (
              <button
                key={emoji}
                style={s.emojiItem}
                onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji); }}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reply bar — shown when the user clicks the reply button on a message */}
      {replyTo && (
        <div style={s.replyBar}>
          <span style={s.replyIcon}>↩</span>
          <span>Replying to </span>
          <span style={{ color: "#7289da", fontWeight: 600 }}>{replyTo.username}</span>
          <span style={s.replyText}>: {(replyTo.content || "").slice(0, 60)}</span>
          <button style={s.replyClose} onClick={onClearReply}>✕</button>
        </div>
      )}

      {/* File preview — shown while uploading or when a file is staged for sending */}
      {(fileData || uploading) && (
        <div style={{ ...s.filePreview, borderRadius: replyTo ? "0" : "8px 8px 0 0" }}>
          {uploading ? (
            <span>⏳ Uploading...</span>
          ) : (
            <>
              {fileData.type === "image" && fileData.previewUrl ? (
                <img src={fileData.previewUrl} style={s.fileImg} alt="preview" />
              ) : (
                <span style={s.fileIcon}>{fileIcon(fileData.name)}</span>
              )}
              <span style={{ flex: 1, color: "#f2f3f5", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fileData.name}
              </span>
              <button style={s.fileRemove} onClick={() => setFileData(null)}>✕</button>
            </>
          )}
        </div>
      )}

      {/* Main input row */}
      <div style={{ ...s.wrapper, ...(hasTop ? s.wrapperWithTop : {}) }}>
        <button
          style={{ ...s.iconBtn, color: showEmoji ? "#7289da" : "#5c6068" }}
          title="Emoji"
          onClick={() => setShowEmoji((v) => !v)}
        >
          😊
        </button>

        {/* File attachment button is available in both channel and DM modes */}
        <button
          style={s.iconBtn}
          title="Attach file"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          📎
        </button>
        {/* Hidden file input triggered by the attachment button */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <textarea
          ref={textareaRef}
          style={{ ...s.textarea, cursor: isBlocked ? "not-allowed" : undefined }}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isBlocked || sending}
          rows={1}
        />

        <button
          style={s.sendBtn(!!(text.trim() || fileData) && !sending)}
          onClick={handleSend}
          disabled={!(text.trim() || fileData) || sending}
          title="Send (Enter)"
        >
          ➤
        </button>
      </div>

      <div style={s.hint}>
        Enter — send &nbsp;·&nbsp; Shift+Enter — new line &nbsp;·&nbsp; @ — mention
      </div>
    </div>
  );
}
