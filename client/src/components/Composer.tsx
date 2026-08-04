import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { htmlToMarkdown } from "../htmlToMarkdown.js";
import { markdownTextToComposerHtml } from "../markdownPaste.js";
import { formatSize } from "../lib/format.js";
import { formatDateTime } from "../lib/time.js";
import { readString, writeString } from "../lib/storage.js";
import { useAttachments } from "../lib/useAttachments.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";
import Avatar from "./Avatar.js";
import EmojiPicker from "./EmojiPicker.js";
import Modal, { ModalActions } from "./Modal.js";
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

function draftStorageKey(channelId, isThread) {
  return isThread ? null : `echo.composer-draft.v1.${channelId}`;
}

function composerContent(body) {
  const html = markdownTextToComposerHtml(body || "");
  if (!html) return "<p></p>";
  return /^<(p|ul|ol|blockquote|pre|h[1-3]|hr)\b/i.test(html.trim())
    ? html
    : `<p>${html}</p>`;
}

// Rich-text message composer: @mention autocomplete, a formatting toolbar,
// emoji, and file attachments. Owns all of its own editor state — mount it with
// a `key={channel.id}` so switching channels yields a fresh, empty composer.
export default function Composer({ channel, parentId = null, users = [], channels = [], customEmojis = [], onAddCustomEmoji, onError, onChannelUpdated, onSent, onDraftChange, onEditSave, onEditCancel, editing = null, placeholder: customPlaceholder, mode = "light", captureScreenDrops = false, showSchedule = true, showSend = true, showAttachments = true, disabled = false }) {
  const isThread = !!parentId; // a thread reply composer (hides channel-level scheduling)
  const [mention, setMention] = useState(null); // { trigger, query, from, to } or null
  const [activeIdx, setActiveIdx] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showFormatting, setShowFormatting] = useState(true);
  const [linkDraft, setLinkDraft] = useState(null); // { text, url } for the link dialog
  // Guards sends that @-mention non-members of a private channel.
  const { gate, mentionModal } = useMentionGate({ channel, users, onChannelUpdated });
  const [sendMenuOpen, setSendMenuOpen] = useState(false); // "Send options" popover
  const [scheduleAt, setScheduleAt] = useState(null); // datetime-local string while the schedule dialog is open
  const [scheduleError, setScheduleError] = useState(null); // validation/API error for the custom schedule dialog
  const [scheduledMsgs, setScheduledMsgs] = useState([]); // pending scheduled messages for this channel
  const [showScheduled, setShowScheduled] = useState(false); // manage-scheduled modal
  const [editingSched, setEditingSched] = useState(null); // { id, body, at } being edited
  const [editorState, setEditorState] = useState({
    canSend: false,
    bold: false,
    italic: false,
    strikethrough: false,
    ul: false,
    ol: false,
  });

  const keyDownHandlerRef = useRef(null);
  const pasteHandlerRef = useRef(null);
  const draftReadyRef = useRef(false);
  const typingActiveRef = useRef(false); // are we currently flagged as typing?
  const typingStopRef = useRef(null); // timer that clears the typing flag
  const {
    pending,
    uploading,
    draggingFiles,
    fileInputRef,
    stageFiles,
    onPickFiles,
    removePending,
    clearAttachments,
    replacePending,
  } = useAttachments({ captureScreenDrops, onError });

  const isDm = channel.type === "dm";
  const scheduledTargetLabel = isDm ? "this conversation" : "this channel";
  const placeholder = customPlaceholder || (isThread
    ? "Reply to thread…"
    : isDm
      ? `Message ${channel.dmName}`
      : `Message #${channel.name}`);
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, trailingNode: false }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        class: "composer-editor",
        "data-testid": "composer-editor",
        "data-placeholder": placeholder,
        role: "textbox",
        "aria-multiline": "true",
        dir: "auto",
      },
      handleKeyDown: (_view, event) => {
        keyDownHandlerRef.current?.(event);
        return event.defaultPrevented;
      },
      handlePaste: (_view, event) => {
        pasteHandlerRef.current?.(event);
        return event.defaultPrevented;
      },
    },
    onCreate: ({ editor: currentEditor }) => syncEditorState(currentEditor),
    onUpdate: ({ editor: currentEditor }) => syncEditorState(currentEditor),
    onSelectionUpdate: ({ editor: currentEditor }) => {
      syncMentionContext(currentEditor);
      setEditorState(readEditorState(currentEditor));
    },
  }, [channel.id, parentId, placeholder, disabled]);
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);
  useEffect(() => {
    if (!editor) return;
    if (!editing) {
      const key = draftStorageKey(channel.id, isThread);
      const draft = key ? readString(key, "") : "";
      editor.commands.setContent(draft ? composerContent(draft) : "<p></p>", false);
      replacePending([]);
      draftReadyRef.current = true;
      return;
    }

    draftReadyRef.current = false;
    editor.commands.setContent(composerContent(editing.draft), false);
    replacePending(editing.attachments || []);
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus("end");
    });
  }, [channel.id, editor, editing?.id, isThread, replacePending]);
  const { canSend = false, ...active } = editorState;

  // Tell others we're typing (throttled), and auto-clear after a short pause.
  function signalTyping() {
    if (!showSend) return;
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
  // Load pending scheduled messages for this channel (for the banner + manager).
  function refreshScheduled() {
    api
      .listScheduled(channel.id)
      .then(({ scheduled }) => setScheduledMsgs(scheduled))
      .catch(() => {});
  }
  useEffect(() => {
    if (!isThread && showSchedule && !disabled) refreshScheduled(); // scheduling is a channel-level feature
  }, [channel.id, isThread, showSchedule, disabled]);
  useEffect(() => {
    if (isThread || !showSchedule || disabled) return;
    const socket = getSocket();
    const onNew = (msg) => {
      if (msg.channelId === channel.id) refreshScheduled();
    };
    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [channel.id, isThread, showSchedule, disabled]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    if (mention.trigger === "#") {
      return channels
        .filter((item) => item.type === "public")
        .filter((item) => item.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((item) => ({ ...item, channelTag: true }));
    }
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
  }, [mention, users, channels, isDm]);

  // ---- Tiptap editor integration ----

  function syncEditorState(currentEditor) {
    setEditorState(readEditorState(currentEditor));
    const hasText = currentEditor.getText().trim().length > 0;
    hasText ? signalTyping() : stopTyping();
    syncMentionContext(currentEditor);
    const draft = htmlToMarkdown(currentEditor.getHTML());
    onDraftChange?.(draft);
    const key = draftStorageKey(channel.id, isThread);
    if (draftReadyRef.current && !editing && key) writeString(key, draft.trim() ? draft : null);
  }

  function readEditorState(currentEditor) {
    if (!currentEditor?.isInitialized || !currentEditor?.state?.doc) {
      return { canSend: false, bold: false, italic: false, strikethrough: false, ul: false, ol: false };
    }
    return {
      canSend: currentEditor.getText().trim().length > 0,
      bold: currentEditor.isActive("bold"),
      italic: currentEditor.isActive("italic"),
      strikethrough: currentEditor.isActive("strike"),
      ul: currentEditor.isActive("bulletList"),
      ol: currentEditor.isActive("orderedList"),
    };
  }

  function syncMentionContext(currentEditor) {
    const { selection } = currentEditor.state;
    if (!selection.empty) return setMention(null);
    const { $from, from } = selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
    const match = before.match(/(?:^|\s)([@#])([\w.-]*)$/);
    if (!match) return setMention(null);
    setMention({
      trigger: match[1],
      query: match[2],
      from: from - match[2].length - 1,
      to: from,
    });
    setActiveIdx(0);
  }

  function handlePaste(e) {
    const images = Array.from(e.clipboardData?.items || [])
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (images.length > 0) {
      e.preventDefault();
      stageFiles(images);
      return;
    }

    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    editor?.commands.insertContent(markdownTextToComposerHtml(text));
  }

  function applyMention(picked) {
    if (!mention || !editor) return;
    const value = mention.trigger === "#" ? `#${picked.name}` : `@${picked.username}`;
    editor.chain().focus().insertContentAt({ from: mention.from, to: mention.to }, `${value} `).run();
    setMention(null);
  }

  // Open a small dialog to add a hyperlink (replaces the clunky window.prompt).
  // Prefills the label from any selected text and remembers the caret position.
  function openLinkDialog() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setLinkDraft({ text: editor.state.doc.textBetween(from, to), url: "", from, to });
  }

  function confirmLink() {
    if (!linkDraft) return;
    const url = linkDraft.url.trim();
    if (!url) return;
    const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    const label = (linkDraft.text.trim() || url).trim();
    editor?.chain()
      .focus()
      .insertContentAt(
        { from: linkDraft.from, to: linkDraft.to },
        { type: "text", text: `${label} `, marks: [{ type: "link", attrs: { href } }] }
      )
      .run();
    setLinkDraft(null);
  }

  // Insert at the saved caret; keep the picker open for picking several.
  function insertEmoji(emoji) {
    editor?.chain().focus().insertContent(emoji).run();
  }

  function handleKeyDown(e) {
    if (editing && e.key === "Escape") {
      e.preventDefault();
      onEditCancel?.();
      return;
    }
    // Once the user starts typing, get the picker out of the way. The picker
    // keeps the editor focused when it opens, so printable keys arrive here;
    // keys pressed inside the picker itself do not.
    if (emojiOpen && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setEmojiOpen(false);
    }
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
    if (e.key === "Enter" && editor) {
      if (editor.isActive("codeBlock")) {
        e.preventDefault();
        if (e.shiftKey) editor.chain().focus().insertContent("\n").run();
        else editor.chain().focus().exitCode().run();
        return;
      }
      if (editor.isActive("code")) {
        e.preventDefault();
        editor.chain().focus().toggleCode().splitBlock().run();
        return;
      }
      if (
        e.shiftKey
        || editor.isActive("bulletList")
        || editor.isActive("orderedList")
        || editor.isActive("blockquote")
      ) return;
      if (!showSend) return;
      e.preventDefault();
      handleSend();
    }
  }

  // Actually emit the message and reset the composer.
  function doSend(body, attachments) {
    onError?.(null);
    const socket = getSocket();
    if (!socket.connected) {
      onError?.("Echo is reconnecting. Your draft is still here — send it when the connection returns.");
      return false;
    }
    socket.emit("message:send", { channelId: channel.id, body, attachments, parentId }, (res) => {
      if (res?.error) onError?.(res.error);
      else onSent?.();
    });
    resetComposer();
    return true;
  }

  // On phones, keeping focus after sending leaves the virtual keyboard open and
  // hides the newly sent message. Desktop users keep the normal focused editor.
  function dismissMobileKeyboard() {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    requestAnimationFrame(() => {
      editor?.commands.blur();
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
  }

  function resetComposer() {
    editor?.commands.clearContent(true);
    clearAttachments();
    setMention(null);
    setEmojiOpen(false);
    const key = draftStorageKey(channel.id, isThread);
    if (key) writeString(key, null);
  }

  // Format a Date as a local "YYYY-MM-DDTHH:MM:SS" string for <input datetime-local>.
  function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // Tomorrow at 21:00 (local), used by the quick "Tomorrow" send option.
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
    const hasText = !!editor && editor.getText().trim() !== "";
    if (!hasText && pending.length === 0) {
      reportError("Write a message before scheduling it.");
      return;
    }
    const body = hasText ? htmlToMarkdown(editor.getHTML()) : "";
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
    const hasText = !!editor && editor.getText().trim() !== "";
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
    if (!showSend) return;
    const hasText = !!editor && editor.getText().trim() !== "";
    if (!hasText && pending.length === 0) return; // nothing to send
    if (uploading) return; // wait for in-flight uploads
    const body = hasText ? htmlToMarkdown(editor.getHTML()) : "";
    if (editing) {
      if (!body.trim() && pending.length === 0) return;
      onError?.(null);
      getSocket().emit("message:edit", {
        messageId: editing.id,
        body: body.trim(),
        attachments: pending,
      }, (res) => {
        if (res?.error) {
          onError?.(res.error);
          return;
        }
        resetComposer();
        onEditSave?.();
      });
      return;
    }
    const attachments = pending;
    const proceed = () => {
      stopTyping();
      if (doSend(body, attachments)) dismissMobileKeyboard();
    };
    // Hold the send if it @-mentions non-members of a private channel.
    if (gate(body, proceed)) return;
    proceed();
  }

  keyDownHandlerRef.current = handleKeyDown;
  pasteHandlerRef.current = handlePaste;

  const keepFocus = (e) => e.preventDefault();

  function toggleList(kind) {
    if (!editor) return;

    const { selection } = editor.state;
    const currentBlock = selection.$from.parent;
    const shouldStartNewList = !selection.empty
      ? false
      : !editor.isActive("bulletList")
        && !editor.isActive("orderedList")
        && currentBlock.isTextblock
        && currentBlock.textContent.trim().length > 0
        && selection.$from.parentOffset > 0;

    const chain = editor.chain().focus();
    if (shouldStartNewList && editor.can().splitBlock()) chain.splitBlock();
    (kind === "ordered" ? chain.toggleOrderedList() : chain.toggleBulletList()).run();
  }

  return (
    <form
      className={`composer${draggingFiles ? " dragging-files" : ""}${disabled ? " is-disabled" : ""}`}
      data-testid="composer"
      onSubmit={handleSend}
    >
      {draggingFiles && (
        <div className="composer-drop-overlay screen-drop-overlay" data-testid="composer-drop-overlay" aria-hidden="true">
          Drop files to attach
        </div>
      )}
      {editing && (
        <div className="composer-editing" data-testid="composer-editing">
          <div>
            <strong>Editing message</strong>
            <span>Press Enter to save · Shift+Enter for a new line</span>
          </div>
          <button type="button" className="composer-edit-cancel" onClick={onEditCancel}>
            Cancel
          </button>
        </div>
      )}
      {!editing && !isThread && scheduledMsgs.length > 0 && (
        <button
          type="button"
          className="scheduled-banner"
          onClick={() => {
            refreshScheduled();
            setShowScheduled(true);
          }}
        >
          🗓 {scheduledMsgs.length} scheduled message{scheduledMsgs.length === 1 ? "" : "s"} for {scheduledTargetLabel} — view
        </button>
      )}

      {!editing && scheduleAt !== null && (
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
      if (!showSend) return;
                e.preventDefault();
                confirmSchedule();
              }
            }}
          />
          {scheduleError && <div className="error schedule-error" role="alert">{scheduleError}</div>}
          <ModalActions>
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
          </ModalActions>
        </Modal>
      )}

      {!editing && showScheduled && (
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
            <p className="settings-hint">No scheduled messages for {scheduledTargetLabel}.</p>
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
          <ModalActions>
            <button type="button" className="btn-secondary" onClick={() => setLinkDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={!linkDraft.url.trim()} onClick={confirmLink}>
              Add link
            </button>
          </ModalActions>
        </Modal>
      )}

      {mentionModal}

      {mention && suggestions.length > 0 && (
        <div className="mention-popup">
          <div className="mention-popup-head">{mention.trigger === "#" ? "Public channels" : "People"}</div>
          {suggestions.map((u, idx) => (
            <button
              type="button"
              key={u.id}
              className={`mention-item ${idx === activeIdx ? "active" : ""}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseDown={keepFocus}
              onClick={() => applyMention(u)}
            >
              {u.channelTag ? (
                <span className="mention-channel-mark">#</span>
              ) : u.broadcast ? (
                <span className="mention-mega">📣</span>
              ) : (
                <Avatar name={u.displayName} src={u.avatarUrl} size={26} />
              )}
              <span className="mi-name">{u.channelTag ? `#${u.name}` : u.broadcast ? `@${u.username}` : u.displayName}</span>
              <span className="mi-handle">{u.channelTag ? "Public channel" : u.broadcast ? u.displayName : `@${u.username}`}</span>
            </button>
          ))}
        </div>
      )}

      {emojiOpen && (
        <EmojiPicker
          onPick={insertEmoji}
          onClose={() => setEmojiOpen(false)}
          customEmojis={customEmojis}
          mode={mode}
          onAddCustom={() => {
            setEmojiOpen(false);
            onAddCustomEmoji?.();
          }}
        />
      )}

      {showAttachments && (pending.length > 0 || uploading) && (
        <div className="composer-attachments">
          {pending.map((a) => (
            <div className={`pending-att ${a.isImage ? "is-image" : "is-file"}`} key={a.key}>
              {a.isImage ? (
                <PendingImage attachment={a} />
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
          <button type="button" className={`icon-btn fmt fmt-b ${active.bold ? "active" : ""}`} title="Bold" onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleBold().run()}>
            B
          </button>
          <button type="button" className={`icon-btn fmt fmt-i ${active.italic ? "active" : ""}`} title="Italic" onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            I
          </button>
          <button type="button" className={`icon-btn fmt fmt-s ${active.strikethrough ? "active" : ""}`} title="Strikethrough" onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            S
          </button>
          <span className="tb-sep" />
          <button type="button" className="icon-btn" title="Link" onMouseDown={keepFocus} onClick={openLinkDialog}>
            <LinkIcon />
          </button>
          <span className="tb-sep" />
          <button type="button" className={`icon-btn ${active.ol ? "active" : ""}`} title="Ordered list" onMouseDown={keepFocus} onClick={() => toggleList("ordered")}>
            <OrderedListIcon />
          </button>
          <button type="button" className={`icon-btn ${active.ul ? "active" : ""}`} title="Bulleted list" onMouseDown={keepFocus} onClick={() => toggleList("bullet")}>
            <BulletListIcon />
          </button>
          <button type="button" className="icon-btn" title="Blockquote" onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            <QuoteIcon />
          </button>
          <span className="tb-sep" />
          <button type="button" className="icon-btn" title="Code" onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleCode().run()}>
            <CodeIcon />
          </button>
          <button type="button" className="icon-btn" title="Code block" onMouseDown={keepFocus} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            <CodeBlockIcon />
          </button>
        </div>
      )}

      <div className="composer-input">
        <EditorContent editor={editor} />
      </div>

      <div className="composer-actions">
        <div className="left">
          {showAttachments && <input ref={fileInputRef} type="file" multiple hidden data-testid="composer-attachments" onChange={onPickFiles} />}
          {showAttachments && <button type="button" className="icon-btn plus" title="Attach files" onMouseDown={keepFocus} onClick={() => fileInputRef.current?.click()}>
            <PlusIcon />
          </button>}
          <button type="button" className={`icon-btn aa ${showFormatting ? "active" : ""}`} title="Formatting" onMouseDown={keepFocus} onClick={() => setShowFormatting((v) => !v)}>
            Aa
          </button>
          <button type="button" className={`icon-btn emoji-toggle ${emojiOpen ? "active" : ""}`} data-testid="composer-emoji-toggle" title="Emoji" onMouseDown={keepFocus} onClick={() => setEmojiOpen((v) => !v)}>
            <SmileyIcon />
          </button>
          {showSend && !editing && <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>}
        </div>

        <div className="right">
          {showSend && <button
            type="submit"
            className={`icon-btn send-btn ${canSend || pending.length ? "ready" : ""}`}
            data-testid="composer-send"
            disabled={(!canSend && pending.length === 0) || uploading}
            aria-label={editing ? "Save edit" : "Send"}
            title={editing ? "Save edit" : "Send message"}
          >
            <SendIcon />
          </button>}
          {!editing && !isThread && showSchedule && showSend && <span className="tb-sep" />}
          {!editing && !isThread && showSchedule && showSend && (
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
          {!editing && !isThread && showSchedule && showSend && sendMenuOpen && (
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
                  <span>Tomorrow, 21:00</span>
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

function PendingImage({ attachment }) {
  const src = useAuthUrl(attachment.previewUrl || attachment.url);
  return <img src={src || undefined} alt={attachment.name} />;
}
