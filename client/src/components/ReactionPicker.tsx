import { useEffect, useRef, useState } from "react";
import EmojiPicker from "./EmojiPicker.js";

const QUICK_REACTIONS = ["👍", "❤️", "🎉", "🙌", "👏", "💪", "😊", "😂", "🥳", "🚀"];

// A compact reaction menu that keeps the common choices close to the message.
// The full emoji picker remains available for less common reactions.
export default function ReactionPicker({ onPick, onClose, onExpand, customEmojis = [], onAddCustom, mode = "light" }) {
  const [showAll, setShowAll] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current?.contains(e.target)) return;
      if (e.target.closest?.(".emoji-toggle, .react-toggle")) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  function showFullPicker() {
    setShowAll(true);
    onExpand?.();
  }

  if (showAll) {
    return (
      <div className="reaction-picker-full" ref={ref}>
        <EmojiPicker
          onPick={onPick}
          onClose={onClose}
          customEmojis={customEmojis}
          onAddCustom={onAddCustom}
          mode={mode}
        />
      </div>
    );
  }

  return (
    <div className="reaction-picker-quick" ref={ref} role="dialog" aria-label="Choose a reaction">
      <div className="reaction-quick-grid">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            type="button"
            className="reaction-quick-button"
            key={emoji}
            onClick={() => onPick(emoji)}
            aria-label={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <button type="button" className="reaction-more-button" onClick={showFullPicker}>
        More emojis <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
