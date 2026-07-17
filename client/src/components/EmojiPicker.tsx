import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { useAuthUrls } from "../lib/useAuthUrl.js";

// A people/group glyph for the avatar-emoji category tab — distinct from the
// default smiley emoji-mart uses for custom categories.
const PEOPLE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';

const EmojiMartPicker = lazy(async () => {
  const [{ default: data }, { default: Picker }] = await Promise.all([
    import("@emoji-mart/data/sets/15/all.json"),
    import("@emoji-mart/react"),
  ]);
  return {
    default: function EmojiMartLoaded(props) {
      return <Picker data={data} {...props} />;
    },
  };
});

// Full emoji picker (all emojis + search) via emoji-mart, plus a "Custom"
// category fed by workspace-uploaded emoji/GIFs. Closes on the toggle button or
// any outside click — never on hover-out.
export default function EmojiPicker({ onPick, onClose, customEmojis = [], onAddCustom, mode = "light" }) {
  const ref = useRef(null);
  const authUrls = useAuthUrls(customEmojis.map((e) => e.url));

  useEffect(() => {
    function onDown(e) {
      // Clicks inside the picker (incl. its shadow DOM, retargeted to the host)
      // and on the emoji toggle button do not dismiss it.
      if (ref.current && ref.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".emoji-toggle, .react-toggle")) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  // emoji-mart "custom" categories: uploaded emoji, plus a "People" category of
  // user-avatar emoji (:username:) so they're browsable like any other emoji.
  const custom = useMemo(() => {
    const toEmoji = (e) => ({
      id: e.name,
      name: e.name,
      // Split on -/_ so "branch"/"pull"/"merge" find :git-branch: etc.
      keywords: [e.name, ...e.name.split(/[-_]+/)],
      skins: [{ src: authUrls.get(e.url) }],
    });
    const uploaded = customEmojis.filter((e) => !e.isUser && authUrls.get(e.url));
    const people = customEmojis.filter((e) => e.isUser && authUrls.get(e.url));
    const cats = [];
    if (uploaded.length) cats.push({ id: "custom", name: "Custom", emojis: uploaded.map(toEmoji) });
    // id must NOT be a built-in category id ("people" would inherit the smiley
    // icon) — use a distinct id and give it an explicit people icon.
    if (people.length)
      cats.push({ id: "members", name: "People", icon: { svg: PEOPLE_ICON }, emojis: people.map(toEmoji) });
    return cats.length ? cats : undefined;
  }, [customEmojis, authUrls]);

  return (
    <div className="emoji-popup-wrap" ref={ref}>
      <Suspense fallback={<div className="emoji-picker-loading" aria-hidden="true" />}>
        <EmojiMartPicker
          // Remount when the custom set changes so new emoji appear immediately.
          key={`${customEmojis.length}:${[...authUrls.values()].join(",")}`}
          custom={custom}
          theme={mode === "dark" ? "dark" : "light"}
          previewPosition="none"
          skinTonePosition="search"
          navPosition="top"
          dynamicWidth
          // Native emoji return `.native`; custom ones return a `:shortcode:`.
          onEmojiSelect={(emoji) => onPick(emoji.native || `:${emoji.id}:`)}
        />
      </Suspense>
      {onAddCustom && (
        <button
          type="button"
          className="emoji-add-custom"
          // Keep the composer focused while the picker is open. Otherwise the
          // contenteditable blur/focus cycle can swallow the modal-opening click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAddCustom}
        >
          <span className="eac-plus">＋</span> Add custom emoji
        </button>
      )}
    </div>
  );
}
