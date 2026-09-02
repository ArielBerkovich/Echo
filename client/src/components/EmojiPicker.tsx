import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthUrls } from "../lib/useAuthUrl.js";

// A people/group glyph for the avatar-emoji category tab — distinct from the
// default smiley emoji-mart uses for custom categories.
const PEOPLE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>';

const GIT_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M21.62 10.52 13.48 2.38a2.05 2.05 0 0 0-2.9 0L8.89 4.07l2.14 2.14a2.43 2.43 0 0 1 2.81 3.9l2.06 2.06a2.43 2.43 0 1 1-1.46 1.37l-1.92-1.92v5.05a2.43 2.43 0 1 1-2 0V11.5a2.43 2.43 0 0 1-.8-3.97L7.58 5.39l-5.2 5.19a2.05 2.05 0 0 0 0 2.9l8.14 8.14a2.05 2.05 0 0 0 2.9 0l8.2-8.2a2.05 2.05 0 0 0 0-2.9Z"/></svg>';

const CUSTOM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.25 2 3.5 2 3.5-2 3.5-2M9 9h.01M15 9h.01"/><path d="M19 2v4M17 4h4"/></svg>';

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
export default function EmojiPicker({ onPick, onClose, customEmojis = [], onAddCustom, mode = "light", anchorRef }) {
  const ref = useRef(null);
  const [viewportStyle, setViewportStyle] = useState(null);
  const authUrls = useAuthUrls(customEmojis.map((e) => e.url));

  useLayoutEffect(() => {
    if (!anchorRef) return undefined;

    const VIEWPORT_PADDING = 8;
    const POPOVER_GAP = 8;
    const DESIRED_PICKER_HEIGHT = 390;
    // The optional custom-emoji action sits below the emoji-mart element.
    const FOOTER_HEIGHT = onAddCustom ? 42 : 0;

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const anchorRect = anchor.getBoundingClientRect();
      const composerRect = anchor.closest(".composer")?.getBoundingClientRect() || anchorRect;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const width = Math.min(352, viewportWidth - VIEWPORT_PADDING * 2);
      const left = Math.min(
        Math.max(composerRect.left + 8, VIEWPORT_PADDING),
        viewportWidth - width - VIEWPORT_PADDING
      );
      const aboveSpace = anchorRect.top - POPOVER_GAP - VIEWPORT_PADDING;
      const belowTop = anchorRect.bottom + POPOVER_GAP;
      const belowSpace = viewportHeight - belowTop - VIEWPORT_PADDING;
      const desiredTotalHeight = DESIRED_PICKER_HEIGHT + FOOTER_HEIGHT;
      const placeAbove = aboveSpace >= Math.min(desiredTotalHeight, belowSpace);
      const availableHeight = Math.max(0, placeAbove ? aboveSpace : belowSpace);
      const pickerHeight = Math.max(0, Math.min(
        DESIRED_PICKER_HEIGHT,
        availableHeight - FOOTER_HEIGHT
      ));

      setViewportStyle({
        width,
        left,
        top: placeAbove ? "auto" : belowTop,
        bottom: placeAbove ? viewportHeight - anchorRect.top + POPOVER_GAP : "auto",
        "--emoji-picker-height": `${pickerHeight}px`,
      });
    }

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (anchorRef.current) observer.observe(anchorRef.current.closest(".composer") || anchorRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, onAddCustom]);

  useEffect(() => {
    function onDown(e) {
      // Clicks inside the picker (incl. its shadow DOM, retargeted to the host)
      // and on this picker's own toggle button do not dismiss it. A different
      // emoji toggle should close this picker before opening its own.
      if (ref.current && ref.current.contains(e.target)) return;
      const toggle = e.target.closest?.(".emoji-toggle, .react-toggle");
      if (toggle && (!anchorRef || toggle === anchorRef.current)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anchorRef, onClose]);

  // emoji-mart custom categories: Echo's built-in Git set, workspace uploads,
  // and user-avatar emoji (:username:), each kept distinct in the picker.
  const custom = useMemo(() => {
    const toEmoji = (e) => ({
      id: e.name,
      name: e.name,
      // Split on -/_ so "branch"/"pull"/"merge" find :git-branch: etc.
      keywords: [e.name, ...e.name.split(/[-_]+/)],
      skins: [{ src: authUrls.get(e.url) }],
    });
    const git = customEmojis.filter((e) => e.isBuiltIn && authUrls.get(e.url));
    const uploaded = customEmojis.filter((e) => !e.isBuiltIn && !e.isUser && authUrls.get(e.url));
    const people = customEmojis.filter((e) => e.isUser && authUrls.get(e.url));
    const cats = [];
    if (git.length)
      cats.push({ id: "git-workflow", name: "Git", icon: { svg: GIT_ICON }, emojis: git.map(toEmoji) });
    // Supplying an icon is also what tells emoji-mart this is a standalone
    // category; otherwise it groups it under the preceding custom category.
    if (uploaded.length)
      cats.push({ id: "custom", name: "Custom", icon: { svg: CUSTOM_ICON }, emojis: uploaded.map(toEmoji) });
    // id must NOT be a built-in category id ("people" would inherit the smiley
    // icon) — use a distinct id and give it an explicit people icon.
    if (people.length)
      cats.push({ id: "members", name: "People", icon: { svg: PEOPLE_ICON }, emojis: people.map(toEmoji) });
    return cats.length ? cats : undefined;
  }, [customEmojis, authUrls]);

  const picker = (
    <div
      className={`emoji-popup-wrap${anchorRef ? " is-viewport-positioned" : ""}`}
      ref={ref}
      style={anchorRef ? (viewportStyle || { visibility: "hidden" }) : undefined}
    >
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

  return anchorRef ? createPortal(picker, document.body) : picker;
}
