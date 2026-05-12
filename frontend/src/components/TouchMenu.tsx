import type { Message } from "../types";

const EMOJI_SET = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👎"];

type Props = {
  msg:        Message;
  mode:       "main" | "emoji";
  isOwn:      boolean;
  isPinned:   boolean;
  canPin:     boolean;
  isDm:       boolean;
  reactions:  Record<string, number[]>;
  userId?:    number;
  onClose:    () => void;
  onSetMode:  (m: "main" | "emoji") => void;
  onReply:    () => void;
  onPin:      () => void;
  onEdit:     () => void;
  onDelete:   () => void;
  onReact:    (emoji: string) => void;
};

/**
 * Long-press bottom sheet for touch devices.
 * Shows either the main action list or the emoji reaction picker.
 */
export default function TouchMenu({
  msg, mode, isOwn, isPinned, canPin, isDm, reactions, userId,
  onClose, onSetMode, onReply, onPin, onEdit, onDelete, onReact,
}: Props) {
  return (
    <>
      <div data-testid="touch-overlay" className="touch-overlay" onClick={onClose} />
      <div data-testid="touch-sheet" className="touch-sheet">
        <div className="touch-sheet-handle" />
        {mode === "main" ? (
          <>
            <div className="touch-sheet-title">
              {(msg.content || (msg.file_url ? "📎 Attachment" : "")).slice(0, 60)}
            </div>
            <div className="touch-sheet-actions">
              <button data-testid="touch-react-btn" onClick={() => onSetMode("emoji")}>
                <span>😊</span> React
              </button>
              <button data-testid="touch-reply-btn" onClick={() => { onReply(); onClose(); }}>
                <span>↩</span> Reply
              </button>
              {canPin && !isDm && (
                <button data-testid="touch-pin-btn" onClick={() => { onPin(); onClose(); }}>
                  <span>📌</span> {isPinned ? "Unpin" : "Pin"}
                </button>
              )}
              {isOwn && (
                <button data-testid="touch-edit-btn" onClick={() => { onEdit(); onClose(); }}>
                  <span>✏️</span> Edit
                </button>
              )}
              {isOwn && (
                <button data-testid="touch-delete-btn" className="danger" onClick={() => { onClose(); onDelete(); }}>
                  <span>🗑️</span> Delete
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="touch-sheet-title">React to message</div>
            <div className="touch-sheet-emoji">
              {EMOJI_SET.map((emoji) => {
                const isMine = (reactions[emoji] || []).includes(userId);
                return (
                  <button
                    key={emoji}
                    className={`touch-emoji-btn${isMine ? " active" : ""}`}
                    onClick={() => { onReact(emoji); onClose(); }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            <button data-testid="touch-back-btn" className="touch-sheet-back" onClick={() => onSetMode("main")}>
              ← Back
            </button>
          </>
        )}
      </div>
    </>
  );
}