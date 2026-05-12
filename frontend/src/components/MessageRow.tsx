import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import MarkdownRenderer from "./MarkdownRenderer";
import FilePreviewModal from "./FilePreviewModal";
import Icon from "./Icons";
import TouchMenu from "./TouchMenu";
import { fileIcon, formatBytes } from "../utils/fileUtils";
import { formatTime } from "../utils/messageFormatting";
import { s } from "./chatAreaStyles";
import { SOCKET_URL as BASE_URL } from "../config";
import type { Message, User } from "../types";

const EMOJI_SET = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👎"];

type FilePreview = { fileUrl: string; fileType?: string | null; fileName?: string | null };
type SocketAck   = { error?: string };
type ReactionMap = Record<string, number[]>;

type Props = {
  msg:          Message;
  isGroupFirst: boolean;
  avatar?:      string | null;
  username?:    string;
  role?:        string;
  onReply?:     (message: Message) => void;
  onPin?:       (messageId: number, isCurrentlyPinned: boolean) => void;
  canPin?:      boolean;
  users:        User[];
  isDm:         boolean;
};

export default function MessageRow({ msg, isGroupFirst, avatar, username, role, onReply, onPin, canPin, users, isDm }: Props) {
  const { user }    = useAuth();
  const { editMessage, deleteMessage, reactToMessage, editDmMessage, deleteDmMessage, reactToDmMessage } = useSocket();

  const [hovered,   setHovered]   = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing,   setEditing]   = useState(false);
  const [editText,  setEditText]  = useState(msg.content || "");
  const [preview,   setPreview]   = useState<FilePreview | null>(null);
  const [touchMenu, setTouchMenu] = useState<"main" | "emoji" | null>(null);

  const editRef       = useRef<HTMLTextAreaElement | null>(null);
  const rowRef        = useRef<HTMLDivElement | null>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwn    = (msg.user_id ?? msg.sender_id) === user?.id;
  const isAdmin  = role === "admin";
  const isPinned = !!msg.is_pinned;
  const doEdit   = isDm ? editDmMessage   : editMessage;
  const doDelete = isDm ? deleteDmMessage : deleteMessage;
  const doReact  = isDm ? reactToDmMessage : reactToMessage;

  useEffect(() => { if (!editing) setEditText(msg.content || ""); }, [msg.content, editing]);

  useEffect(() => {
    if (!showEmoji) return;
    function onDoc(e: globalThis.MouseEvent) {
      if (rowRef.current && e.target instanceof Node && !rowRef.current.contains(e.target)) setShowEmoji(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showEmoji]);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
      const len = editText.length;
      editRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  function handleTouchStart() {
    touchTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setTouchMenu("main");
    }, 500);
  }
  function handleTouchEnd()  { if (touchTimerRef.current) clearTimeout(touchTimerRef.current); }
  function handleTouchMove() { if (touchTimerRef.current) clearTimeout(touchTimerRef.current); }

  function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === msg.content) { setEditing(false); return; }
    doEdit(msg.id, trimmed, ({ error }: SocketAck = {}) => { if (error) console.error("Edit error:", error); });
    setEditing(false);
  }
  function cancelEdit() { setEditText(msg.content || ""); setEditing(false); }
  function handleDelete() {
    if (!confirm("Delete this message?")) return;
    doDelete(msg.id, ({ error }: SocketAck = {}) => { if (error) console.error("Delete error:", error); });
  }
  function handleReact(reaction: string) {
    doReact(msg.id, reaction, ({ error }: SocketAck = {}) => { if (error) console.error("React error:", error); });
    setShowEmoji(false);
  }
  function onEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
    if (e.key === "Escape") cancelEdit();
  }

  const reactions: ReactionMap = msg.reactions || {};
  const hasReactions = Object.keys(reactions).length > 0;
  const fileName = msg.file_name || (msg.file_url ? msg.file_url.split("/").pop() : null);
  const isImage  = msg.file_type === "image";

  return (
    <>
      <div
        ref={rowRef}
        style={{ ...s.msgRow, background: hovered ? "#ffffff08" : "transparent" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setShowEmoji(false); }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchMove={handleTouchMove}
      >
        <div style={s.avatarCol}>
          {isGroupFirst ? (
            <span style={s.avatarEmoji} title={username}>{avatar || (username?.slice(0, 2).toUpperCase() || "U")}</span>
          ) : (
            <span style={{ ...s.timestamp, fontSize: "10px", opacity: hovered ? 0.6 : 0, paddingTop: "4px" }}>
              {formatTime(msg.created_at)}
            </span>
          )}
        </div>

        <div style={s.msgContent}>
          {isGroupFirst && (
            <div style={s.msgHeader}>
              <span style={s.username(isOwn)}>{username}</span>
              {isAdmin && (
                <span style={s.adminBadge} title="Admin" aria-label="Admin">
                  <Icon name="shield" size={13} />
                </span>
              )}
              <span style={s.timestamp}>{formatTime(msg.created_at)}</span>
              {!!msg.is_edited && <span style={s.editedTag}>(edited)</span>}
              {isPinned && <span style={s.pinnedBadge}>Pinned</span>}
            </div>
          )}

          {msg.reply_to_id && (
            <div style={s.replyQuote}>
              <Icon name="reply" size={14} />
              <span style={s.replyAuthor}>{msg.reply_username || "?"}</span>
              <span style={s.replyText}>
                {msg.reply_file_url ? "[file]" : (msg.reply_content || "").slice(0, 100)}
              </span>
            </div>
          )}

          {editing ? (
            <>
              <textarea
                ref={editRef} style={s.editTextarea} value={editText}
                onChange={(e) => setEditText(e.target.value)} onKeyDown={onEditKeyDown}
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
                  <img src={`${BASE_URL}${msg.file_url}`} alt={fileName} style={s.msgImage}
                    onClick={() => setPreview({ fileUrl: msg.file_url!, fileType: msg.file_type, fileName })}
                    title="Click to preview"
                  />
                ) : (
                  <div style={s.msgFile}
                    onClick={() => setPreview({ fileUrl: msg.file_url!, fileType: msg.file_type, fileName })}
                    title="Click to preview"
                  >
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

          {hasReactions && !editing && (
            <div style={s.reactionsRow}>
              {Object.entries(reactions).map(([reaction, userIds]) => {
                const isMine = userIds.includes(user?.id);
                return (
                  <button key={reaction} style={s.reactionPill(isMine)} onClick={() => handleReact(reaction)}
                    title={`${userIds.length} reaction${userIds.length === 1 ? "" : "s"}`}>
                    {reaction} <span style={{ fontSize: "11px" }}>{userIds.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {hovered && !editing && (
          <div style={s.actionBar}>
            <button style={s.actionBtn} aria-label="React" title="React" onClick={(e) => { e.stopPropagation(); setShowEmoji((v) => !v); }}><Icon name="smile" size={16} /></button>
            <button style={s.actionBtn} aria-label="Reply" title="Reply" onClick={() => onReply?.(msg)}><Icon name="reply" size={16} /></button>
            {canPin && !isDm && (
              <button style={s.actionBtn} aria-label={isPinned ? "Unpin" : "Pin"} title={isPinned ? "Unpin" : "Pin"} onClick={() => onPin?.(msg.id, isPinned)}><Icon name={isPinned ? "pinOff" : "pin"} size={16} /></button>
            )}
            {isOwn && <button style={s.actionBtn} aria-label="Edit" title="Edit" onClick={() => { setEditing(true); setShowEmoji(false); }}><Icon name="edit" size={16} /></button>}
            {isOwn && <button style={{ ...s.actionBtn, color: "#f23f42" }} aria-label="Delete" title="Delete" onClick={handleDelete}><Icon name="trash" size={16} /></button>}
          </div>
        )}

        {showEmoji && (
          <div style={s.emojiPicker} onClick={(e) => e.stopPropagation()}>
            {EMOJI_SET.map((reaction) => (
              <button key={reaction} style={s.emojiBtn((reactions[reaction] || []).includes(user?.id))} onClick={() => handleReact(reaction)}>
                {reaction}
              </button>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <FilePreviewModal fileUrl={preview.fileUrl} fileType={preview.fileType} fileName={preview.fileName} onClose={() => setPreview(null)} />
      )}

      {touchMenu && (
        <TouchMenu
          msg={msg} mode={touchMenu} isOwn={isOwn} isPinned={isPinned}
          canPin={!!canPin} isDm={isDm} reactions={reactions} userId={user?.id}
          onClose={() => setTouchMenu(null)} onSetMode={setTouchMenu}
          onReply={() => onReply?.(msg)}
          onPin={() => onPin?.(msg.id, isPinned)}
          onEdit={() => setEditing(true)}
          onDelete={handleDelete}
          onReact={handleReact}
        />
      )}
    </>
  );
}
