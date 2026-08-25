import { useEffect, useRef, useState } from "react";
import EmojiPicker from "./EmojiPicker.js";
import { BUILT_IN_GIT_EMOJIS } from "../lib/gitEmojis.js";

const QUICK_REACTIONS = [
  { value: "👍", label: "thumbs up" },
  { value: "❤️", label: "heart" },
  { value: "🎉", label: "party" },
  { value: "🙌", label: "raised hands" },
  { value: "👏", label: "clap" },
  { value: "💪", label: "strong" },
  { value: "🥳", label: "celebration" },
  { value: "🚀", label: "rocket" },
];

const STATUS_REACTIONS = [
  { value: "✅", label: "check mark" },
  { value: ":git-merge:", label: "git merge" },
];

const BUILT_IN_EMOJI_URLS = new Map(BUILT_IN_GIT_EMOJIS.map((emoji) => [emoji.name, emoji.url]));

function ReactionGlyph({ value }) {
  const shortcode = /^:([a-z0-9_+.-]+):$/i.exec(value);
  const url = shortcode && BUILT_IN_EMOJI_URLS.get(shortcode[1].toLowerCase());
  return url ? <img className="custom-emoji" src={url} alt={value} /> : value;
}

// A compact reaction menu that keeps the common choices close to the message.
// The full emoji picker remains available for less common reactions.
export default function ReactionPicker({ onPick, onClose, onExpand, customEmojis = [], onAddCustom, mode = "light" }) {
  const [showAll, setShowAll] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => ref.current?.querySelector("button")?.focus(), 0);
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, showAll]);

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
        {QUICK_REACTIONS.slice(0, 4).map(({ value, label }) => (
          <button
            type="button"
            className="reaction-quick-button"
            key={value}
            onClick={() => onPick(value)}
            aria-label={`React with ${label}`}
          >
            <ReactionGlyph value={value} />
          </button>
        ))}
        <div className="reaction-quick-stack">
          {STATUS_REACTIONS.map(({ value, label }) => (
            <button
              type="button"
              className="reaction-quick-button"
              key={value}
              onClick={() => onPick(value)}
              aria-label={`React with ${label}`}
            >
              <ReactionGlyph value={value} />
            </button>
          ))}
        </div>
        {QUICK_REACTIONS.slice(4).map(({ value, label }) => (
          <button
            type="button"
            className="reaction-quick-button"
            key={value}
            onClick={() => onPick(value)}
            aria-label={`React with ${label}`}
          >
            <ReactionGlyph value={value} />
          </button>
        ))}
      </div>
      <button type="button" className="reaction-more-button" onClick={showFullPicker}>
        More emojis <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
