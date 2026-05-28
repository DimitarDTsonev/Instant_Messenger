/**
 * Emoji picker panel — a floating panel with tabbed emoji categories.
 *
 * Renders a grid of emoji buttons grouped into four categories: Smileys,
 * Gestures, Hearts, and Symbols. Clicking an emoji calls `onEmojiSelect`.
 *
 * Click-outside detection: a `mousedown` listener on `document` closes the panel
 * when the user clicks outside the panel's `div` ref.
 *
 * `onMouseDown` (not `onClick`) is used on emoji buttons to prevent the parent
 * textarea from losing focus before the selection is registered.
 *
 * Used by: MessageInput.tsx (reaction insert + message compose).
 */

import { useState, useRef, useEffect } from "react";
import type { MouseEvent } from "react";
import { s } from "./messageInputStyles";

/** All available emoji categories and their emoji arrays. */
const EMOJI_CATS = {
  "Smileys": ["😀","😁","😂","🤣","😊","😍","🥰","😘","😎","🤩","🥳","😇","🤗","😏","😒","😢","😭","😤","😠","🤬","😱","😳","🤯","🥺","😴","🤢","🤡","👻","💀"],
  "Gestures": ["👍","👎","👋","🤚","✋","🖐","🤞","🤟","🤘","👌","🤌","✌️","🤙","💪","🙏","👐","🤝","✊","👊","🫶"],
  "Hearts":  ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","🔥","✨"],
  "Symbols": ["🎉","🎊","🎈","🏆","⭐","🌟","💡","🔔","📢","🚀","💯","✅","❌","⚡","💬","📝","🔒","🔓","🎯","🎸"],
} as const;
type EmojiCategory = keyof typeof EMOJI_CATS;

type Props = {
  /** Called when the user selects an emoji. Receives the emoji Unicode string. */
  onEmojiSelect: (emoji: string) => void;
  /** Called when the user clicks outside the panel. Should hide the picker. */
  onClose: () => void;
};

/**
 * Floating emoji picker panel with category tabs and a scrollable emoji grid.
 *
 * @param onEmojiSelect - Callback invoked with the selected emoji string.
 * @param onClose       - Callback invoked when a click outside the panel is detected.
 */
export default function EmojiPicker({ onEmojiSelect, onClose }: Props) {
  const [emojiCat, setEmojiCat] = useState<EmojiCategory>("Smileys");
  /** Ref to the panel `div` — used by the click-outside `mousedown` listener. */
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close the panel when the user clicks anywhere outside it
  useEffect(() => {
    function onDoc(e: globalThis.MouseEvent) {
      if (panelRef.current && e.target instanceof Node && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  return (
    <div style={s.emojiPanel} ref={panelRef}>
      {/* Category tab bar */}
      <div style={s.emojiTabs}>
        {(Object.keys(EMOJI_CATS) as EmojiCategory[]).map((cat) => (
          <button key={cat} style={s.emojiTab(emojiCat === cat)} onClick={() => setEmojiCat(cat)}>
            {cat}
          </button>
        ))}
      </div>
      {/* Emoji grid for the selected category */}
      <div style={s.emojiGrid}>
        {EMOJI_CATS[emojiCat].map((emoji) => (
          <button
            key={emoji}
            style={s.emojiItem}
            // onMouseDown prevents the textarea from losing focus before the emoji is inserted
            onMouseDown={(e: MouseEvent<HTMLButtonElement>) => { e.preventDefault(); onEmojiSelect(emoji); }}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
