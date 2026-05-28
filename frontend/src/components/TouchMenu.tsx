/**
 * Mobile touch action sheet — bottom-sheet contextual menu for long-press on a message.
 *
 * Renders as two layers:
 *  1. `div.touch-overlay` — full-screen backdrop; clicking it calls `onClose`.
 *  2. `div.touch-sheet`   — bottom-anchored panel styled via global CSS classes.
 *
 * Modes:
 *  - `"main"` — shows primary actions: React, Reply, Pin/Unpin, Edit, Delete.
 *               Conditional actions (pin, edit, delete) are shown based on
 *               `canPin`, `isOwn`, and `isDm` flags.
 *  - `"emoji"` — shows a quick-reaction emoji grid and a Back button.
 *
 * Styling is handled entirely by global CSS classes (`touch-sheet`, `touch-sheet-actions`,
 * `touch-sheet-emoji`, etc.) defined in `index.css` so no inline styles are needed.
 *
 * Used by: MessageRow.tsx (rendered on mobile long-press or contextual menu trigger).
 */

import type { Message } from "../types";
import Icon from "./Icons";

/** Quick-reaction emoji choices shown in the emoji panel. */
const EMOJI_SET = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👎"];

type Props = {
  msg:        Message;
  /** Current panel mode — `"main"` shows actions; `"emoji"` shows reactions. */
  mode:       "main" | "emoji";
  /** Whether the message was sent by the current user. */
  isOwn:      boolean;
  /** Whether the message is currently pinned. */
  isPinned:   boolean;
  /** Whether the current user has permission to pin/unpin. */
  canPin:     boolean;
  /** `true` when this is a DM — disables the pin button which only applies to channels. */
  isDm:       boolean;
  /** Current reaction map from the message (emoji → array of user IDs). */
  reactions:  Record<string, number[]>;
  /** Current user's ID — used to highlight already-used reactions. */
  userId?:    number;
  onClose:    () => void;
  /** Switches between `"main"` and `"emoji"` panel modes. */
  onSetMode:  (m: "main" | "emoji") => void;
  onReply:    () => void;
  onPin:      () => void;
  onEdit:     () => void;
  onDelete:   () => void;
  /** Called with the selected emoji string. */
  onReact:    (reaction: string) => void;
};

/**
 * Bottom-sheet contextual action menu for mobile message interactions.
 *
 * @param props - All message context and action callbacks.
 */
export default function TouchMenu({
  msg, mode, isOwn, isPinned, canPin, isDm, reactions, userId,
  onClose, onSetMode, onReply, onPin, onEdit, onDelete, onReact,
}: Props) {
  return (
    <>
      {/* Full-screen backdrop — tap to dismiss */}
      <div data-testid="touch-overlay" className="touch-overlay" onClick={onClose} />
      <div data-testid="touch-sheet" className="touch-sheet">
        {/* Drag handle decoration */}
        <div className="touch-sheet-handle" />
        {mode === "main" ? (
          <>
            {/* Truncated message preview as the sheet title */}
            <div className="touch-sheet-title">
              {(msg.content || (msg.file_url ? "Attachment" : "")).slice(0, 60)}
            </div>
            <div className="touch-sheet-actions">
              {/* Opens the emoji picker mode */}
              <button data-testid="touch-react-btn" onClick={() => onSetMode("emoji")}>
                <Icon name="smile" size={18} /> <span>React</span>
              </button>
              <button data-testid="touch-reply-btn" onClick={() => { onReply(); onClose(); }}>
                <Icon name="reply" size={18} /> <span>Reply</span>
              </button>
              {/* Pin/unpin — only shown if user has permission and this is not a DM */}
              {canPin && !isDm && (
                <button data-testid="touch-pin-btn" onClick={() => { onPin(); onClose(); }}>
                  <Icon name={isPinned ? "pinOff" : "pin"} size={18} /> <span>{isPinned ? "Unpin" : "Pin"}</span>
                </button>
              )}
              {/* Edit/delete — only the message owner can do these */}
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
                // Highlight the button if the current user has already reacted with this emoji
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
