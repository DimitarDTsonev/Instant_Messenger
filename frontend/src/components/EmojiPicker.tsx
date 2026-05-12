import { useState, useRef, useEffect } from "react";
import type { MouseEvent } from "react";
import { s } from "./messageInputStyles";

const EMOJI_CATS = {
  "Smileys": ["😀","😁","😂","🤣","😊","😍","🥰","😘","😎","🤩","🥳","😇","🤗","😏","😒","😢","😭","😤","😠","🤬","😱","😳","🤯","🥺","😴","🤢","🤡","👻","💀"],
  "Gestures": ["👍","👎","👋","🤚","✋","🖐","🤞","🤟","🤘","👌","🤌","✌️","🤙","💪","🙏","👐","🤝","✊","👊","🫶"],
  "Hearts":  ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","🔥","✨"],
  "Symbols": ["🎉","🎊","🎈","🏆","⭐","🌟","💡","🔔","📢","🚀","💯","✅","❌","⚡","💬","📝","🔒","🔓","🎯","🎸"],
} as const;
type EmojiCategory = keyof typeof EMOJI_CATS;

type Props = { onEmojiSelect: (emoji: string) => void; onClose: () => void };

export default function EmojiPicker({ onEmojiSelect, onClose }: Props) {
  const [emojiCat, setEmojiCat] = useState<EmojiCategory>("Smileys");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: globalThis.MouseEvent) {
      if (panelRef.current && e.target instanceof Node && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  return (
    <div style={s.emojiPanel} ref={panelRef}>
      <div style={s.emojiTabs}>
        {(Object.keys(EMOJI_CATS) as EmojiCategory[]).map((cat) => (
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