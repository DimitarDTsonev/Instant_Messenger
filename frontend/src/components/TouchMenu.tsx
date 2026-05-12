import type { Message } from "../types";
import Icon from "./Icons";

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
  onReact:    (reaction: string) => void;
};

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
              {(msg.content || (msg.file_url ? "Attachment" : "")).slice(0, 60)}
            </div>
            <div className="touch-sheet-actions">
              <button data-testid="touch-react-btn" onClick={() => onSetMode("emoji")}>
                <Icon name="smile" size={18} /> <span>React</span>
              </button>
              <button data-testid="touch-reply-btn" onClick={() => { onReply(); onClose(); }}>
                <Icon name="reply" size={18} /> <span>Reply</span>
              </button>
              {canPin && !isDm && (
                <button data-testid="touch-pin-btn" onClick={() => { onPin(); onClose(); }}>
                  <Icon name={isPinned ? "pinOff" : "pin"} size={18} /> <span>{isPinned ? "Unpin" : "Pin"}</span>
                </button>
              )}
              {isOwn && (
                <button data-testid="touch-edit-btn" onClick={() => { onEdit(); onClose(); }}>
                  <Icon name="edit" size={18} /> <span>Edit</span>
                </button>
              )}
              {isOwn && (
                <button data-testid="touch-delete-btn" className="danger" onClick={() => { onClose(); onDelete(); }}>
                  <Icon name="trash" size={18} /> <span>Delete</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="touch-sheet-title">React to message</div>
            <div className="touch-sheet-emoji">
              {EMOJI_SET.map((reaction) => {
                const isMine = (reactions[reaction] || []).includes(userId);
                return (
                  <button
                    key={reaction}
                    className={`touch-emoji-btn${isMine ? " active" : ""}`}
                    onClick={() => { onReact(reaction); onClose(); }}
                  >
                    {reaction}
                  </button>
                );
              })}
            </div>
            <button data-testid="touch-back-btn" className="touch-sheet-back" onClick={() => onSetMode("main")}>
              Back
            </button>
          </>
        )}
      </div>
    </>
  );
}
