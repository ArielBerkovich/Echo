import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { htmlToMarkdown } from "../htmlToMarkdown.js";
import { markdownTextToComposerHtml } from "../markdownPaste.js";
import { formatSize } from "../lib/format.js";
import { formatDateTime } from "../lib/time.js";
import Avatar from "./Avatar.js";
import EmojiPicker from "./EmojiPicker.js";
import Modal from "./Modal.js";
import { useMentionGate } from "../lib/useMentionGate.js";
import {
  LinkIcon, OrderedListIcon, BulletListIcon, QuoteIcon, CodeIcon, CodeBlockIcon,
  PlusIcon, SmileyIcon, SendIcon, ChevronIcon,
} from "./ComposerIcons.js";

const SCHEDULE_PRESETS = [
  { label: "In 30 min", minutes: 30 },
  { label: "In 1 hour", minutes: 60 },
  { label: "In 3 hours", minutes: 180 },
];

// Rich-text message composer: @mention autocomplete, a formatting toolbar,
// emoji, and file attachments. Owns all of its own editor state — mount it with
// a `key={channel.id}` so switching channels yields a fresh, empty composer.
export default function Composer({ channel, parentId = null, users = [], customEmojis = [], onAddCustomEmoji, onError, onChannelUpdated }) {
  const isThread = !!parentId; // a thread reply composer (hides channel-level scheduling)
  const [empty, setEmpty] = useState(true); // editor blank? (controls placeholder)
  const [canSend, setCanSend] = useState(false); // has real text? (controls send)
  const [mention, setMention] = useState(null); // { query, node, start } or null
  const [activeIdx, setActiveIdx] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showFormatting, setShowFormatting] = useState(true);
  const [active, setActive] = useState({}); // which inline formats are on at the caret
  const [pending, setPending] = useState([]); // uploaded attachments staged for the next send
  const [uploading, setUploading] = useState(false);
  const [linkDraft, setLinkDraft] = useState(null); // { text, url } for the link dialog
  // Guards sends that @-mention non-members of a private channel.
  const { gate, mentionModal } = useMentionGate({ channel, users, onChannelUpdated });
  const [sendMenuOpen, setSendMenuOpen] = useState(false); // "Send options" popover
  const [scheduleAt, setScheduleAt] = useState(null); // datetime-local string while the schedule dialog is open
  const [scheduleError, setScheduleError] = useState(null); // validation/API error for the custom schedule dialog
  const [scheduledMsgs, setScheduledMsgs] = useState([]); // pending scheduled messages for this channel
  const [showScheduled, setShowScheduled] = useState(false); // manage-scheduled modal
  const [editingSched, setEditingSched] = useState(null); // { id, body, at } being edited

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const savedRange = useRef(null); // last caret position inside the editor
  const typingActiveRef = useRef(false); // are we currently flagged as typing?
  const typingStopRef = useRef(null); // timer that clears the typing flag
  const pendingRef = useRef([]); // latest staged attachments, used for cleanup on unmount

  const isDm = channel.type === "dm";

  // Tell others we're typing (throttled), and auto-clear after a short pause.
  function signalTyping() {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      getSocket().emit("typing", { channelId: channel.id, typing: true });
    }
    clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(stopTyping, 2500);
  }
  function stopTyping() {
    clearTimeout(typingStopRef.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      getSocket().emit("typing", { channelId: channel.id, typing: false });
    }
  }
  // Stop signalling when the composer unmounts (e.g. switching channels).
  useEffect(() => stopTyping, []);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => () => {
    pendingRef.current.forEach(revokePreviewUrl);
  }, []);

  // Load pending scheduled messages for this channel (for the banner + manager).
  function refreshScheduled() {
    api
      .listScheduled(channel.id)
      .then(({ scheduled }) => setScheduledMsgs(scheduled))
      .catch(() => {});
  }
  useEffect(() => {
    if (!isThread) refreshScheduled(); // scheduling is a channel-level feature
  }, [channel.id, isThread]);
  useEffect(() => {
    if (isThread) return;
    const socket = getSocket();
    const onNew = (msg) => {
      if (msg.channelId === channel.id) refreshScheduled();
    };
    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [channel.id, isThread]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    // @everyone broadcast option (channels only, not DMs).
    const specials = !isDm
      ? [
          { id: "__everyone", username: "everyone", displayName: "Notify everyone in this channel", broadcast: true },
        ].filter((s) => q === "" || s.username.startsWith(q))
      : [];
    const people = users
      .filter((u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
      .slice(0, 6);
    return [...specials, ...people].slice(0, 8);
  }, [mention, users, isDm]);

  // ---- file attachments ----
  function readImageSize(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve(null);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  function makePendingAttachment(file) {
    const isImage = file.type.startsWith("image/");
    const tempId = crypto.randomUUID();
    return {
      key: tempId,
      tempId,
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
      isImage,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
    };
  }

  function revokePreviewUrl(att) {
    if (att?.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(att.previewUrl);
    }
  }

  async function onPickFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-picking the same file later
    if (files.length === 0) return;
    onError?.(null);
    const staged = files.map(makePendingAttachment);
    setPending((prev) => [...prev, ...staged]);
    setUploading(true);
    try {
      const dims = await Promise.all(files.map(readImageSize));
      const { attachments } = await api.uploadFiles(files);
      const withDims = attachments.map((a, i) => ({ ...a, width: dims[i]?.width, height: dims[i]?.height }));
      const uploadedByTempId = new Map(
        staged.map((a, i) => [
          a.tempId,
          {
            ...(withDims[i] || {}),
            previewUrl: a.previewUrl,
            tempId: a.tempId,
          },
        ])
      );
      setPending((prev) => prev.map((a) => uploadedByTempId.get(a.tempId) || a));
    } catch (err) {
      staged.forEach(revokePreviewUrl);
      setPending((prev) => prev.filter((a) => !staged.some((s) => s.tempId === a.tempId)));
      onError?.(err.message);
    } finally {
      setUploading(false);
    }
  }

  function removePending(key) {
    setPending((prev) => {
      const removed = prev.find((a) => a.key === key);
      revokePreviewUrl(removed);
      return prev.filter((a) => a.key !== key);
    });
  }

  // ---- editor: caret tracking, mentions, formatting ----

  // Remember the caret position so emoji inserts land there even after focus
  // moves to the (focus-stealing) emoji picker.
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      if (editorRef.current?.contains(r.commonAncestorContainer)) {
        savedRange.current = r.cloneRange();
      }
    }
  }

  // Reflect which inline formats are active at the caret (for toolbar highlights).
  function syncActive() {
    saveSelection();
    try {
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        strikethrough: document.queryCommandState("strikeThrough"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      });
    } catch {
      /* queryCommandState unsupported — ignore */
    }
  }

  // Find the "@mention" being typed in the caret's text node, if any.
  function getMentionContext() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const before = node.textContent.slice(0, range.startOffset);
    const m = before.match(/(?:^|\s)@([\w.-]*)$/);
    if (!m) return null;
    return { query: m[1], node, start: range.startOffset - m[1].length - 1 };
  }

  // Blank only when there's no text AND no structural content (lists, code,
  // quotes) — so clicking a list/quote button hides the placeholder.
  function isEditorEmpty(el) {
    if (!el) return true;
    if (el.textContent.trim() !== "") return false;
    return !el.querySelector("li, pre, blockquote, img");
  }

  function handleInput() {
    const el = editorRef.current;
    const hasText = !!el && el.textContent.trim() !== "";
    setEmpty(isEditorEmpty(el));
    setCanSend(hasText);
    if (hasText) signalTyping();
    else stopTyping();
    const ctx = getMentionContext();
    if (ctx) {
      setMention(ctx);
      setActiveIdx(0);
    } else {
      setMention(null);
    }
    syncActive();
  }

  function handlePaste(e) {
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    document.execCommand("insertHTML", false, markdownTextToComposerHtml(text));
    handleInput();
  }

  function applyMention(picked) {
    if (!mention) return;
    const { node, start, query } = mention;
    const full = node.textContent;
    const before = full.slice(0, start);
    const after = full.slice(start + 1 + query.length);
    node.textContent = `${before}@${picked.username} ${after}`;

    const pos = before.length + picked.username.length + 2;
    const range = document.createRange();
    range.setStart(node, Math.min(pos, node.textContent.length));
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    setMention(null);
    setEmpty(false);
    editorRef.current?.focus();
  }

  // True when the caret sits inside any list (ordered or bulleted).
  function caretInList() {
    return !!findListAncestor(window.getSelection()?.anchorNode);
  }

  // ---- toolbar commands (operate on the live selection in the editor) ----
  function exec(cmd, value = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    handleInput();
  }

  // Walk up from a node to the enclosing <code>/<pre>, if any (else null).
  function findCodeAncestor(node) {
    for (; node && node !== editorRef.current; node = node.parentNode) {
      if (node.nodeType === 1 && (node.tagName === "CODE" || node.tagName === "PRE")) return node;
    }
    return null;
  }

  // Walk up from a node to the enclosing <ul>/<ol>, if any (else null).
  function findListAncestor(node) {
    for (; node && node !== editorRef.current; node = node.parentNode) {
      if (node.nodeType === 1 && (node.tagName === "UL" || node.tagName === "OL")) return node;
    }
    return null;
  }

  // Remove a code section, turning it back into plain text (newlines → <br>).
  function unwrapCode(el) {
    const container =
      el.tagName === "CODE" && el.parentNode?.tagName === "PRE" ? el.parentNode : el;
    const text = container.textContent.replace(/​/g, "");
    const frag = document.createDocumentFragment();
    text.split("\n").forEach((line, i) => {
      if (i > 0) frag.appendChild(document.createElement("br"));
      frag.appendChild(document.createTextNode(line));
    });
    if (!frag.childNodes.length) frag.appendChild(document.createTextNode(""));
    const parent = container.parentNode;
    const last = frag.lastChild;
    parent.replaceChild(frag, container);
    const range = document.createRange();
    range.setStartAfter(last);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    handleInput();
  }

  // Drop a single trailing newline from a code element (the blank line the first
  // Enter left behind, removed when a quick second Enter exits the block).
  function trimTrailingNewline(el) {
    let node = el;
    while (node && node.lastChild) node = node.lastChild;
    if (node && node.nodeType === Node.TEXT_NODE && node.textContent.endsWith("\n")) {
      node.textContent = node.textContent.replace(/\n$/, "");
    }
  }

  // Insert a visible line break at the caret (used inside list items).
  function insertLineBreakAtCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const br = document.createElement("br");
    const spacer = document.createTextNode("​");
    range.insertNode(br);
    br.after(spacer);
    const after = document.createRange();
    after.setStartAfter(spacer);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    handleInput();
  }

  // Insert a visible line break inside code without letting contenteditable
  // split the block into a new paragraph/pre wrapper.
  function insertCodeNewlineAtCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) range.deleteContents();

    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      const tail = node.splitText(offset);
      const br = document.createElement("br");
      const spacer = document.createTextNode("​");
      node.parentNode.insertBefore(br, tail);
      node.parentNode.insertBefore(spacer, tail);
      const after = document.createRange();
      after.setStartAfter(spacer);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      handleInput();
      return;
    }

    const br = document.createElement("br");
    const spacer = document.createTextNode("​");
    range.insertNode(br);
    br.after(spacer);
    const after = document.createRange();
    after.setStartAfter(spacer);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    handleInput();
  }

  // Leave a code section: trim the trailing blank line and drop the caret into a
  // fresh normal line right after the block.
  function exitCode(container) {
    trimTrailingNewline(container);
    const line = document.createElement("div");
    line.appendChild(document.createElement("br"));
    container.parentNode.insertBefore(line, container.nextSibling);
    const range = document.createRange();
    range.setStart(line, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    handleInput();
  }

  function wrapCode(block) {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    // Toggle: clicking Code while the caret is already inside a code section
    // removes the formatting (rather than nesting code inside code).
    const existing = findCodeAncestor(sel.anchorNode);
    if (existing) {
      unwrapCode(existing);
      return;
    }

    // With a selection, wrap it. With none, insert an empty code element and
    // drop the caret inside it (using a zero-width space so the element doesn't
    // collapse) — so the user types their own code rather than the word "code".
    if (!sel.isCollapsed) {
      const safe = sel.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = block ? `<pre><code>${safe}</code></pre><p><br></p>` : `<code>${safe}</code>&nbsp;`;
      document.execCommand("insertHTML", false, html);
      handleInput();
      return;
    }

    const range = sel.getRangeAt(0);
    const zwsp = document.createTextNode("​");
    const code = document.createElement("code");
    code.appendChild(zwsp);
    if (block) {
      const pre = document.createElement("pre");
      pre.appendChild(code);
      range.insertNode(pre);
    } else {
      range.insertNode(code);
    }
    const caret = document.createRange();
    caret.setStart(zwsp, 1); // just after the zero-width space, inside the code
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    handleInput();
  }

  // Open a small dialog to add a hyperlink (replaces the clunky window.prompt).
  // Prefills the label from any selected text and remembers the caret position.
  function openLinkDialog() {
    saveSelection();
    const sel = window.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString() : "";
    setLinkDraft({ text, url: "" });
  }

  function escapeHtmlAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function confirmLink() {
    if (!linkDraft) return;
    const url = linkDraft.url.trim();
    if (!url) return;
    const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    const label = (linkDraft.text.trim() || url).trim();
    const el = editorRef.current;
    el?.focus();
    // Restore the caret/selection we had before the dialog stole focus.
    const sel = window.getSelection();
    if (savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    document.execCommand(
      "insertHTML",
      false,
      `<a href="${escapeHtmlAttr(href)}">${escapeHtmlAttr(label)}</a>&nbsp;`
    );
    setLinkDraft(null);
    handleInput();
  }

  // Insert at the saved caret; keep the picker open for picking several.
  function insertEmoji(emoji) {
    const el = editorRef.current;
    el?.focus();
    const sel = window.getSelection();
    if (savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    document.execCommand("insertText", false, emoji);
    saveSelection();
    handleInput();
  }

  function handleKeyDown(e) {
    if (mention && suggestions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(suggestions[activeIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter") {
      const codeEl = findCodeAncestor(window.getSelection()?.anchorNode);
      if (codeEl) {
        e.preventDefault();
        const pre =
          codeEl.tagName === "PRE"
            ? codeEl
            : codeEl.parentNode?.tagName === "PRE"
              ? codeEl.parentNode
              : null;
        // Code blocks keep Shift+Enter for a literal new line; Enter exits.
        if (pre && e.shiftKey) insertCodeNewlineAtCaret();
        else exitCode(pre || codeEl);
        return;
      }
      const listEl = findListAncestor(window.getSelection()?.anchorNode);
      if (listEl) {
        e.preventDefault();
        if (e.shiftKey) insertLineBreakAtCaret();
        else {
          document.execCommand("insertParagraph");
          handleInput();
        }
        return;
      }
      if (e.shiftKey) return; // newline in normal text
      e.preventDefault();
      handleSend();
    }
  }

  // Actually emit the message and reset the composer.
  function doSend(body, attachments) {
    onError?.(null);
    getSocket().emit("message:send", { channelId: channel.id, body, attachments, parentId }, (res) => {
      if (res?.error) onError?.(res.error);
    });
    resetComposer();
  }

  function resetComposer() {
    pending.forEach(revokePreviewUrl);
    if (editorRef.current) editorRef.current.innerHTML = "";
    setEmpty(true);
    setCanSend(false);
    setPending([]);
    setMention(null);
    setEmojiOpen(false);
  }

  // Format a Date as a local "YYYY-MM-DDTHH:MM:SS" string for <input datetime-local>.
  function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // Tomorrow at 9:00 AM (local), used by the quick "Tomorrow" send option.
  function tomorrow9am() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  // Schedule the composed message for a given Date (shared by the quick option
  // and the custom dialog).
  async function scheduleFor(when, inScheduleModal = false) {
    const reportError = (message) => {
      if (inScheduleModal) setScheduleError(message);
      else onError?.(message);
    };
    if (!(when instanceof Date) || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      reportError("Pick a time in the future.");
      return;
    }
    const el = editorRef.current;
    const hasText = !!el && el.textContent.trim() !== "";
    if (!hasText && pending.length === 0) {
      reportError("Write a message before scheduling it.");
      return;
    }
    const body = hasText ? htmlToMarkdown(el.innerHTML || "") : "";
    try {
      if (inScheduleModal) setScheduleError(null);
      else onError?.(null);
      await api.scheduleMessage(channel.id, {
        body,
        attachments: pending,
        scheduledFor: when.toISOString(),
      });
      setScheduleAt(null);
      resetComposer();
      refreshScheduled();
    } catch (err) {
      reportError(err.message);
    }
  }

  // Open the custom schedule dialog (default: one hour from now).
  function openSchedule() {
    onError?.(null);
    setScheduleError(null);
    setSendMenuOpen(false);
    const el = editorRef.current;
    const hasText = !!el && el.textContent.trim() !== "";
    if (!hasText && pending.length === 0) {
      onError?.("Write a message before scheduling it.");
      return;
    }
    setScheduleAt(toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  }

  function scheduleTomorrow9() {
    setSendMenuOpen(false);
    scheduleFor(tomorrow9am());
  }

  function confirmSchedule() {
    scheduleFor(new Date(scheduleAt), true);
  }

  async function cancelScheduled(id) {
    try {
      await api.cancelScheduled(id);
      setScheduledMsgs((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      onError?.(err.message);
    }
  }

  function startSchedEdit(s) {
    setScheduleError(null);
    setEditingSched({ id: s.id, body: s.body, at: toLocalInput(new Date(s.scheduledFor)) });
  }

  async function saveSchedEdit() {
    const { id, body, at } = editingSched;
    const when = new Date(at);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setScheduleError("Pick a time in the future.");
      return;
    }
    const orig = scheduledMsgs.find((s) => s.id === id);
    if (!body.trim() && (orig?.attachments?.length || 0) === 0) {
      setScheduleError("Message can't be empty.");
      return;
    }
    try {
      setScheduleError(null);
      const { scheduled } = await api.updateScheduled(id, {
        body: body.trim(),
        scheduledFor: when.toISOString(),
      });
      setScheduledMsgs((prev) =>
        prev
          .map((s) => (s.id === id ? scheduled : s))
          .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor))
      );
      setEditingSched(null);
    } catch (err) {
      setScheduleError(err.message);
    }
  }

  function handleSend(e) {
    e?.preventDefault();
    const el = editorRef.current;
    const hasText = !!el && el.textContent.trim() !== "";
    if (!hasText && pending.length === 0) return; // nothing to send
    if (uploading) return; // wait for in-flight uploads
    const body = hasText ? htmlToMarkdown(el.innerHTML || "") : "";
    const attachments = pending;
    const proceed = () => {
      stopTyping();
      doSend(body, attachments);
    };
    // Hold the send if it @-mentions non-members of a private channel.
    if (gate(body, proceed)) return;
    proceed();
  }

  const keepFocus = (e) => e.preventDefault();

  return (
    <form className="composer" onSubmit={handleSend}>
      {!isThread && scheduledMsgs.length > 0 && (
        <button
          type="button"
          className="scheduled-banner"
          onClick={() => {
            refreshScheduled();
            setShowScheduled(true);
          }}
        >
          🗓 {scheduledMsgs.length} scheduled message{scheduledMsgs.length === 1 ? "" : "s"} for this channel — view
        </button>
      )}

      {scheduleAt !== null && (
        <Modal
          title="Schedule message"
          className="schedule-modal"
          onClose={() => {
            setScheduleAt(null);
            setScheduleError(null);
          }}
        >
          <p className="settings-hint">Choose when this message should be sent.</p>
          <div className="schedule-presets">
            {SCHEDULE_PRESETS.map(({ label, minutes }) => (
              <button
                type="button"
                key={label}
                onClick={() => {
                  setScheduleError(null);
                  setScheduleAt(toLocalInput(new Date(Date.now() + minutes * 60 * 1000)));
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="settings-input schedule-input"
            type="datetime-local"
            step={1}
            value={scheduleAt}
            min={toLocalInput(new Date(Date.now() + 60 * 1000))}
            onChange={(e) => {
              setScheduleError(null);
              setScheduleAt(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmSchedule();
              }
            }}
          />
          {scheduleError && <div className="error schedule-error" role="alert">{scheduleError}</div>}
          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setScheduleAt(null);
                setScheduleError(null);
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={confirmSchedule}>
              Schedule
            </button>
          </div>
        </Modal>
      )}

      {showScheduled && (
        <Modal
          title="Scheduled messages"
          className="scheduled-modal"
          onClose={() => {
            setShowScheduled(false);
            setEditingSched(null);
            setScheduleError(null);
          }}
        >
          {scheduleError && <div className="error schedule-error" role="alert">{scheduleError}</div>}
          {scheduledMsgs.length === 0 ? (
            <p className="settings-hint">No scheduled messages for this channel.</p>
          ) : (
            <div className="scheduled-list">
              {scheduledMsgs.map((s) =>
                editingSched?.id === s.id ? (
                  <div className="scheduled-item editing" key={s.id}>
                    <div className="scheduled-edit">
                      <textarea
                        className="settings-input"
                        rows={2}
                        dir="auto"
                        value={editingSched.body}
                        onChange={(e) => setEditingSched((d) => ({ ...d, body: e.target.value }))}
                      />
                      <input
                        className="settings-input"
                        type="datetime-local"
                        value={editingSched.at}
                        min={toLocalInput(new Date(Date.now() + 60 * 1000))}
                        onChange={(e) => setEditingSched((d) => ({ ...d, at: e.target.value }))}
                      />
                      <div className="scheduled-edit-actions">
                        <button type="button" className="btn-secondary" onClick={() => setEditingSched(null)}>
                          Cancel
                        </button>
                        <button type="button" className="btn-primary" onClick={saveSchedEdit}>
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="scheduled-item" key={s.id}>
                    <div className="scheduled-body">
                      <div className="scheduled-when">{formatDateTime(s.scheduledFor)}</div>
                      <div className="scheduled-preview" dir="auto">
                        {s.body || `${s.attachments.length} attachment(s)`}
                      </div>
                    </div>
                    <div className="scheduled-actions">
                      <button type="button" className="scheduled-edit-btn" onClick={() => startSchedEdit(s)}>
                        Edit
                      </button>
                      <button type="button" className="link-danger" onClick={() => cancelScheduled(s.id)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </Modal>
      )}

      {linkDraft && (
        <Modal title="Add link" className="link-modal" onClose={() => setLinkDraft(null)}>
          <label className="link-field">
            <span>Text</span>
            <input
              className="settings-input"
              value={linkDraft.text}
              placeholder="Link text (optional)"
              onChange={(e) => setLinkDraft((d) => ({ ...d, text: e.target.value }))}
            />
          </label>
          <label className="link-field">
            <span>URL</span>
            <input
              className="settings-input"
              value={linkDraft.url}
              autoFocus
              placeholder="https://example.com"
              onChange={(e) => setLinkDraft((d) => ({ ...d, url: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmLink();
                }
              }}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setLinkDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={!linkDraft.url.trim()} onClick={confirmLink}>
              Add link
            </button>
          </div>
        </Modal>
      )}

      {mentionModal}

      {mention && suggestions.length > 0 && (
        <div className="mention-popup">
          <div className="mention-popup-head">People</div>
          {suggestions.map((u, idx) => (
            <button
              type="button"
              key={u.id}
              className={`mention-item ${idx === activeIdx ? "active" : ""}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={keepFocus}
              onClick={() => applyMention(u)}
            >
              {u.broadcast ? (
                <span className="mention-mega">📣</span>
              ) : (
                <Avatar name={u.displayName} src={u.avatarUrl} size={26} />
              )}
              <span className="mi-name">{u.broadcast ? `@${u.username}` : u.displayName}</span>
              <span className="mi-handle">{u.broadcast ? u.displayName : `@${u.username}`}</span>
            </button>
          ))}
        </div>
      )}

      {emojiOpen && (
        <EmojiPicker
          onPick={insertEmoji}
          onClose={() => setEmojiOpen(false)}
          customEmojis={customEmojis}
          onAddCustom={() => {
            setEmojiOpen(false);
            onAddCustomEmoji?.();
          }}
        />
      )}

      {(pending.length > 0 || uploading) && (
        <div className="composer-attachments">
          {pending.map((a) => (
            <div className={`pending-att ${a.isImage ? "is-image" : "is-file"}`} key={a.key}>
              {a.isImage ? (
                <img src={a.previewUrl || a.url} alt={a.name} />
              ) : (
                <div className="pending-file">
                  <span className="pending-file-name">{a.name}</span>
                  <span className="pending-file-meta">{formatSize(a.size)}</span>
                </div>
              )}
              <button type="button" className="pending-remove" title="Remove" onClick={() => removePending(a.key)}>
                ✕
              </button>
            </div>
          ))}
          {uploading && <div className="pending-att uploading">Uploading…</div>}
        </div>
      )}

      {showFormatting && (
        <div className="composer-toolbar">
          <button type="button" className={`icon-btn fmt fmt-b ${active.bold ? "active" : ""}`} title="Bold" onMouseDown={keepFocus} onClick={() => exec("bold")}>
            B
          </button>
          <button type="button" className={`icon-btn fmt fmt-i ${active.italic ? "active" : ""}`} title="Italic" onMouseDown={keepFocus} onClick={() => exec("italic")}>
            I
          </button>
          <button type="button" className={`icon-btn fmt fmt-s ${active.strikethrough ? "active" : ""}`} title="Strikethrough" onMouseDown={keepFocus} onClick={() => exec("strikeThrough")}>
            S
          </button>
          <span className="tb-sep" />
          <button type="button" className="icon-btn" title="Link" onMouseDown={keepFocus} onClick={openLinkDialog}>
            <LinkIcon />
          </button>
          <span className="tb-sep" />
          <button type="button" className={`icon-btn ${active.ol ? "active" : ""}`} title="Ordered list" onMouseDown={keepFocus} onClick={() => exec("insertOrderedList")}>
            <OrderedListIcon />
          </button>
          <button type="button" className={`icon-btn ${active.ul ? "active" : ""}`} title="Bulleted list" onMouseDown={keepFocus} onClick={() => exec("insertUnorderedList")}>
            <BulletListIcon />
          </button>
          <button type="button" className="icon-btn" title="Blockquote" onMouseDown={keepFocus} onClick={() => exec("formatBlock", "blockquote")}>
            <QuoteIcon />
          </button>
          <span className="tb-sep" />
          <button type="button" className="icon-btn" title="Code" onMouseDown={keepFocus} onClick={() => wrapCode(false)}>
            <CodeIcon />
          </button>
          <button type="button" className="icon-btn" title="Code block" onMouseDown={keepFocus} onClick={() => wrapCode(true)}>
            <CodeBlockIcon />
          </button>
        </div>
      )}

      <div className="composer-input">
        {empty && (
          <div className="editor-placeholder">
            {isDm ? `Message ${channel.dmName}` : `Message #${channel.name}`}
          </div>
        )}
        <div
          ref={editorRef}
          className="composer-editor"
          data-testid="composer-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          dir="auto"
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onKeyUp={syncActive}
          onMouseUp={syncActive}
        />
        {(active.ul || active.ol) && (
          <div className="list-exit-hint" role="status">
            Press Enter on an empty item to finish the list.
          </div>
        )}
      </div>

      <div className="composer-actions">
        <div className="left">
          <input ref={fileInputRef} type="file" multiple hidden data-testid="composer-attachments" onChange={onPickFiles} />
          <button type="button" className="icon-btn plus" title="Attach files" onMouseDown={keepFocus} onClick={() => fileInputRef.current?.click()}>
            <PlusIcon />
          </button>
          <button type="button" className={`icon-btn aa ${showFormatting ? "active" : ""}`} title="Formatting" onMouseDown={keepFocus} onClick={() => setShowFormatting((v) => !v)}>
            Aa
          </button>
          <button type="button" className={`icon-btn emoji-toggle ${emojiOpen ? "active" : ""}`} data-testid="composer-emoji-toggle" title="Emoji" onMouseDown={keepFocus} onClick={() => setEmojiOpen((v) => !v)}>
            <SmileyIcon />
          </button>
        </div>

        <div className="right">
          <button
            type="submit"
            className={`icon-btn send-btn ${canSend || pending.length ? "ready" : ""}`}
            data-testid="composer-send"
            disabled={(!canSend && pending.length === 0) || uploading}
            aria-label="Send"
          >
            <SendIcon />
          </button>
          {!isThread && <span className="tb-sep" />}
          {!isThread && (
            <button
              type="button"
              className="icon-btn chevron-btn"
              data-testid="composer-send-options"
              title="Send options"
              onMouseDown={keepFocus}
              onClick={() => setSendMenuOpen((v) => !v)}
            >
              <ChevronIcon />
            </button>
          )}
          {!isThread && sendMenuOpen && (
            <>
              <div className="menu-overlay" onClick={() => setSendMenuOpen(false)} />
              <div className="send-menu">
                <div className="send-menu-head">Schedule message</div>
                <button
                  type="button"
                  onClick={scheduleTomorrow9}
                  disabled={!canSend && pending.length === 0}
                  title={!canSend && pending.length === 0 ? "Write a message first" : undefined}
                >
                  <span>Tomorrow, 9:00 AM</span>
                  <span className="send-menu-sub">
                    {tomorrow9am().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={openSchedule}
                  disabled={!canSend && pending.length === 0}
                  title={!canSend && pending.length === 0 ? "Write a message first" : undefined}
                >
                  <span>Custom time…</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
