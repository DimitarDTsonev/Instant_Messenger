/**
 * Message composer — the text input bar at the bottom of every channel and DM view.
 *
 * Features:
 *  - Auto-growing textarea: height resets to "auto" then snaps to `scrollHeight`
 *    (capped at 160 px) on every keystroke.
 *  - File attachment: click the paperclip icon → hidden `<input type="file">`.
 *    Uploads go to POST /api/upload (with Bearer token).  An image attachment
 *    shows a thumbnail preview via `URL.createObjectURL`; other files show a
 *    file-type icon from `fileIcon()`.
 *  - Emoji picker: `EmojiPicker` inserts at cursor position via
 *    `setSelectionRange` in a `setTimeout(0)` microtask (so React has
 *    re-rendered the new text value before we move the cursor).
 *  - @-mention autocomplete: scans the text before the cursor for `/@(\w*)$/`
 *    on every change.  `MentionDropdown` pops up with matching users;
 *    ArrowUp/Down navigate it, Enter/Tab commit, Escape dismisses.
 *  - Typing indicators: emits `typing:start` on each keypress with content,
 *    debounced 1500 ms to emit `typing:stop` via `useDebounce`.
 *  - Send: Enter (without Shift) calls `handleSend`.  Shift+Enter inserts a
 *    newline.  The send button is accent-coloured only when there is content.
 *  - Reply: if `replyTo` is set, a dismissible reply bar is shown above the
 *    input wrapper; the message ID is forwarded to `sendMessage` / `sendDm`.
 *
 * Channel vs DM: `isDm` switches between `sendMessage` (channel) and `sendDm`
 * (DM).  DM sends use an ack callback to receive the returned `DirectMessage`
 * object and pass it to `onAddMessage` for immediate optimistic display.
 *
 * ACCEPTED_TYPES: comma-separated MIME types forwarded to the file input's
 * `accept` attribute to filter the OS file picker.
 *
 * Used by: ChatPage.tsx.
 *
 * @param channelId    - Active channel ID (undefined in DM mode).
 * @param channelName  - Channel name shown in the placeholder text.
 * @param dmUser       - DM partner (undefined in channel mode).
 * @param isDm         - Switches between channel and DM send paths.
 * @param disabled     - Disables the entire input (no channel selected).
 * @param canWrite     - False when the user's channel role forbids writing.
 * @param onAddMessage - Optimistic DM message inserter called with the ack payload.
 * @param users        - Full user list for @-mention suggestions.
 * @param replyTo      - Message being replied to; null when no reply is active.
 * @param onClearReply - Callback to clear the active reply context.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import { API_BASE as API } from "../config";
import type { DirectMessage, Message, User } from "../types";
import { fileIcon } from "../utils/fileUtils";
import { useDebounce } from "../hooks/useDebounce";
import EmojiPicker     from "./EmojiPicker";
import Icon            from "./Icons";
import MentionDropdown from "./MentionDropdown";
import { s }           from "./messageInputStyles";

const ACCEPTED_TYPES = [
  "image/jpeg","image/png","image/gif","image/webp","image/svg+xml",
  "application/pdf","application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain","text/csv",
  "application/zip","application/x-zip-compressed",
  "application/x-rar-compressed","application/x-7z-compressed",
].join(",");

type UploadedFile = { url: string; type: string; name: string; previewUrl: string | null };
type UploadResponse = { url: string; type: string; name?: string; error?: string };

export default function MessageInput({
  channelId, channelName, dmUser, isDm = false, disabled = false, canWrite = true, onAddMessage, users = [], replyTo = null, onClearReply,
}: {
  channelId?: number;
  channelName?: string;
  dmUser?: User | null;
  isDm?: boolean;
  disabled?: boolean;
  canWrite?: boolean;
  onAddMessage?: (message: DirectMessage) => void;
  users?: User[];
  replyTo?: Message | null;
  onClearReply?: () => void;
}) {
  const { sendMessage, sendDm, emitTypingStart, emitTypingStop, emitDmTypingStart, emitDmTypingStop } = useSocket();
  const { token } = useAuth();

  const [text, setText]           = useState("");
  const [sending, setSending]     = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [fileData, setFileData]   = useState<UploadedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mentionQ, setMentionQ]   = useState("");
  const [mentionList, setMentionList] = useState<User[]>([]);
  const [mentionIdx, setMentionIdx]   = useState(0);

  const textareaRef  = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Debounced typing-stop emitter: fires 1500 ms after the last keystroke
  const stopTyping = useDebounce(useCallback(() => {
    if (isDm && dmUser) emitDmTypingStop(dmUser.id);
    else if (channelId) emitTypingStop(channelId);
  }, [isDm, dmUser, channelId, emitDmTypingStop, emitTypingStop]), 1500);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    const ta = textareaRef.current;
    if (ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; }
    if (isDm && dmUser && val.trim()) { emitDmTypingStart(dmUser.id); stopTyping(); }
    else if (!isDm && channelId && val.trim()) { emitTypingStart(channelId); stopTyping(); }

    // Detect @mention trigger: match "@word" immediately before the cursor
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      const q = (atMatch[1] || "").toLowerCase();
      setMentionQ(q);
      // Cap at 8 suggestions to keep the dropdown compact
      setMentionList(users.filter((u) => u.username.toLowerCase().startsWith(q)).slice(0, 8));
      setMentionIdx(0);
    } else {
      setMentionList([]); setMentionQ("");
    }
  }

  /**
   * Replace the `@partial` trigger with the selected username and restore cursor
   * focus.  `setTimeout(0)` defers the `setSelectionRange` call until React has
   * committed the new text value to the DOM.
   */
  function insertMention(username: string) {
    const ta     = textareaRef.current;
    const cursor = ta?.selectionStart ?? text.length;
    const newBefore = text.slice(0, cursor).replace(/@(\w*)$/, `@${username} `);
    setText(newBefore + text.slice(cursor));
    setMentionList([]);
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(newBefore.length, newBefore.length); }, 0);
  }

  function insertEmoji(emoji: string) {
    const ta     = textareaRef.current;
    const cursor = ta?.selectionStart ?? text.length;
    const newText = text.slice(0, cursor) + emoji + text.slice(cursor);
    setText(newText);
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(cursor + emoji.length, cursor + emoji.length); }, 0);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch(`${API}/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json() as UploadResponse;
      if (!res.ok) throw new Error(data.error);
      const previewUrl = data.type === "image" ? URL.createObjectURL(file) : null;
      setFileData({ url: data.url, type: data.type, name: data.name || file.name, previewUrl });
    } catch (err) {
      alert("Upload error: " + (err instanceof Error ? err.message : "Upload failed"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSend() {
    const content = text.trim();
    if ((!content && !fileData) || sending || disabled || !canWrite) return;
    setSending(true);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (isDm && dmUser) emitDmTypingStop(dmUser.id);
    else if (!isDm && channelId) emitTypingStop(channelId);

    const fileUrl = fileData?.url || null, fileType = fileData?.type || null, fileName = fileData?.name || null;
    setFileData(null);

    if (isDm && dmUser) {
      sendDm(dmUser.id, content, fileUrl, fileType, fileName, replyTo?.id || null, ({ error, message }: SocketAck<DirectMessage> = {}) => {
        if (error) { setText(content); console.error("DM error:", error); }
        else if (message) { onAddMessage?.(message); }
        setSending(false);
        setTimeout(() => textareaRef.current?.focus(), 0);
      });
    } else {
      sendMessage(channelId, content, replyTo?.id, fileUrl, fileType, fileName, ({ error }: SocketAck = {}) => {
        if (error) { setText(content); console.error("Send error:", error); }
        setSending(false);
        setTimeout(() => textareaRef.current?.focus(), 0);
      });
    }
    onClearReply?.();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionList.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => Math.min(i + 1, mentionList.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionList[mentionIdx].username); return; }
      if (e.key === "Escape") { setMentionList([]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const hasTop    = replyTo || fileData || uploading;
  const isBlocked = disabled || !canWrite;
  const placeholder = disabled ? "Select a channel..." : !canWrite ? "You don't have permission to write in this channel" : isDm ? `Message ${dmUser?.username || "user"}...` : `Send to #${channelName || "channel"}`;

  return (
    <div style={s.container} className="message-input-container">
      {mentionList.length > 0 && <MentionDropdown users={mentionList} activeIdx={mentionIdx} onSelect={insertMention} />}
      {showEmoji && <EmojiPicker onEmojiSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}

      {replyTo && (
        <div style={s.replyBar}>
          <span style={s.replyIcon}><Icon name="reply" size={16} /></span>
          <span>Replying to </span>
          <span style={{ color: "#7289da", fontWeight: 600 }}>{replyTo.username}</span>
          <span style={s.replyText}>: {(replyTo.content || "").slice(0, 60)}</span>
          <button style={s.replyClose} onClick={onClearReply} title="Cancel reply" aria-label="Cancel reply">
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {(fileData || uploading) && (
        <div style={{ ...s.filePreview, borderRadius: replyTo ? "0" : "8px 8px 0 0" }}>
          {uploading ? <span>Uploading...</span> : (
            <>
              {fileData.type === "image" && fileData.previewUrl ? <img src={fileData.previewUrl} style={s.fileImg} alt="preview" /> : <span style={s.fileIcon}>{fileIcon(fileData.name)}</span>}
              <span style={{ flex: 1, color: "#f2f3f5", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileData.name}</span>
              <button style={s.fileRemove} onClick={() => setFileData(null)} title="Remove attachment" aria-label="Remove attachment">
                <Icon name="x" size={14} />
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ ...s.wrapper, ...(hasTop ? s.wrapperWithTop : {}) }}>
        <button style={{ ...s.iconBtn, color: showEmoji ? "#7289da" : "#5c6068", background: showEmoji ? "#5865f215" : "transparent" }} aria-label="Emoji picker" title="Emoji picker" onClick={() => setShowEmoji((v) => !v)}>
          <Icon name="smile" />
        </button>
        <button style={s.iconBtn} aria-label="Attach file" title="Attach file" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Icon name="paperclip" />
        </button>
        <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} style={{ display: "none" }} onChange={handleFileChange} />
        <textarea ref={textareaRef} style={{ ...s.textarea, cursor: isBlocked ? "not-allowed" : undefined }} value={text} onChange={handleChange} onKeyDown={handleKeyDown} placeholder={placeholder} disabled={isBlocked || sending} rows={1} />
        <button style={s.sendBtn(!!(text.trim() || fileData) && !sending)} aria-label="Send" onClick={handleSend} disabled={!(text.trim() || fileData) || sending} title="Send (Enter)">
          <Icon name="send" size={17} />
        </button>
      </div>
      <div style={s.hint}>Enter to send &nbsp;·&nbsp; Shift+Enter for a new line &nbsp;·&nbsp; @ to mention</div>
    </div>
  );
}
