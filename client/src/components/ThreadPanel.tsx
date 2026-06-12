import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import EmojiPicker from "./EmojiPicker.js";
import Message from "./Message.js";
import Composer from "./Composer.js";
import ConfirmDialog from "./ConfirmDialog.js";

// Right-hand thread view: the root message + its replies + a reply composer.
// Reuses the full Message (reactions, forward, edit) and Composer (emoji, bold,
// code, attachments) components so threads have parity with the main timeline.
export default function ThreadPanel({
  channel,
  root,
  user,
  users = [],
  customEmojis = [],
  canJumpToForward,
  onJumpToMessage,
  onForward,
  savedIds,
  onToggleSave,
  onOpenProfile,
  onAddCustomEmoji,
  onClose,
  onThreadRead,
  onChannelUpdated,
  onOpenLightbox,
}) {
  const [rootMsg, setRootMsg] = useState(root); // local copy so live edits/reactions apply
  const [replies, setReplies] = useState([]);
  const [reactingTo, setReactingTo] = useState(null); // { id, rect } for the react picker
  const [menuFor, setMenuFor] = useState(null); // message id with the "more" menu open
  const [actionsFor, setActionsFor] = useState(null); // message whose hover toolbar is shown (only one)
  const [editing, setEditing] = useState(null); // { id, draft } being edited
  const [confirmDelete, setConfirmDelete] = useState(null); // message pending delete confirmation
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis);
  const emojiMap = useMemo(
    () => new Map(customEmojis.map((e) => [e.name.toLowerCase(), e.url])),
    [customEmojis]
  );
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Reset the local root when a different thread is opened.
  useEffect(() => setRootMsg(root), [root.id]);

  useEffect(() => {
    let cancelled = false;
    setReplies([]);
    api.getThread(channel.id, root.id).then(({ replies, parent }) => {
      if (cancelled) return;
      setReplies(replies);
      if (parent) setRootMsg((prev) => ({ ...prev, ...parent }));
    });

    const socket = getSocket();
    const onNew = (msg) => {
      if (msg.parentId === root.id) {
        setReplies((prev) => (prev.some((r) => r.id === msg.id) ? prev : [...prev, msg]));
      }
    };
    // Keep root + replies in sync with edits/deletes/reactions from anywhere.
    const onUpdate = (u) => {
      setRootMsg((prev) => (prev.id === u.id ? { ...prev, body: u.body, editedAt: u.editedAt } : prev));
      setReplies((prev) =>
        prev.map((r) => (r.id === u.id ? { ...r, body: u.body, editedAt: u.editedAt } : r))
      );
    };
    const onDeleted = ({ id }) => setReplies((prev) => prev.filter((r) => r.id !== id));
    const onReaction = ({ messageId, reactions }) => {
      setRootMsg((prev) => (prev.id === messageId ? { ...prev, reactions } : prev));
      setReplies((prev) => prev.map((r) => (r.id === messageId ? { ...r, reactions } : r)));
    };
    socket.on("message:new", onNew);
    socket.on("message:update", onUpdate);
    socket.on("message:deleted", onDeleted);
    socket.on("message:reaction", onReaction);

    return () => {
      cancelled = true;
      socket.off("message:new", onNew);
      socket.off("message:update", onUpdate);
      socket.off("message:deleted", onDeleted);
      socket.off("message:reaction", onReaction);
    };
  }, [channel.id, root.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies]);

  // Opening the thread (and seeing any new reply while it's open) marks it read,
  // so thread mentions clear from Activity once you've actually seen them.
  useEffect(() => {
    api.markRead(channel.id, root.id).catch(() => {});
    onThreadRead?.(root.id);
  }, [channel.id, root.id, replies.length]);

  function toggleReaction(messageId, emoji) {
    getSocket().emit("reaction:toggle", { messageId, emoji }, () => {});
    setReactingTo(null);
  }
  function openReact(messageId, e) {
    setReactingTo({ id: messageId, rect: e.currentTarget.getBoundingClientRect() });
  }
  function startEdit(m) {
    setMenuFor(null);
    setEditing({ id: m.id, draft: m.body });
  }
  function saveEdit() {
    if (!editing) return;
    const body = editing.draft.trim();
    if (!body) return;
    getSocket().emit("message:edit", { messageId: editing.id, body }, (res) => {
      if (res?.error) setError(res.error);
    });
    setEditing(null);
  }
  function deleteMessage(m) {
    setMenuFor(null);
    setConfirmDelete(m);
  }
  function confirmDeleteMessage() {
    const m = confirmDelete;
    setConfirmDelete(null);
    if (!m) return;
    getSocket().emit("message:delete", { messageId: m.id }, (res) => {
      if (res?.error) setError(res.error);
    });
  }

  const messages = [rootMsg, ...replies];

  return (
    <aside className="thread-panel" data-testid="thread-panel">
      <header className="thread-header">
        <span className="thread-title">Thread</span>
        <button className="thread-close" data-testid="thread-close" onClick={onClose} aria-label="Close thread">✕</button>
      </header>

      <div className="thread-body" onMouseLeave={() => { if (!menuFor) setActionsFor(null); }}>
        {messages.map((m) => (
          <Message
            key={m.id}
            m={m}
            grouped={false}
            currentUserId={user.id}
            usersById={usersById}
            renderMarkdown={renderMarkdown}
            emojiMap={emojiMap}
            canJumpToForward={canJumpToForward}
            inThread
            saved={savedIds?.has(m.id)}
            onToggleSave={() => onToggleSave?.(m.id)}
            onOpenProfile={onOpenProfile}
            showActions={actionsFor === m.id}
            onActivate={() => setActionsFor(m.id)}
            editing={editing?.id === m.id ? editing : null}
            menuOpen={menuFor === m.id}
            onReact={(e) => openReact(m.id, e)}
            onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
            onOpenThread={() => {}}
            onForward={() => onForward?.(m)}
            onJump={onJumpToMessage}
            onToggleMenu={() => setMenuFor((id) => (id === m.id ? null : m.id))}
            onCloseMenu={() => setMenuFor(null)}
            onStartEdit={() => startEdit(m)}
            onDelete={() => deleteMessage(m)}
            onEditChange={(draft) => setEditing((e) => ({ ...e, draft }))}
            onEditSave={saveEdit}
            onEditCancel={() => setEditing(null)}
            onOpenLightbox={onOpenLightbox}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {reactingTo &&
        (() => {
          const r = reactingTo.rect;
          const PW = 352;
          const PH = 435;
          const left = Math.max(8, Math.min(r.left, window.innerWidth - PW - 8));
          let top = r.bottom + 6;
          if (top + PH > window.innerHeight) top = Math.max(8, r.top - PH - 6);
          return (
            <div className="reaction-picker" style={{ top, left }}>
              <EmojiPicker
                onPick={(value) => toggleReaction(reactingTo.id, value)}
                onClose={() => setReactingTo(null)}
                customEmojis={customEmojis}
                onAddCustom={() => {
                  setReactingTo(null);
                  onAddCustomEmoji?.();
                }}
              />
            </div>
          );
        })()}

      {error && <div className="error">{error}</div>}

      <Composer
        key={`thread-${root.id}`}
        channel={channel}
        parentId={root.id}
        users={users}
        customEmojis={customEmojis}
        onAddCustomEmoji={onAddCustomEmoji}
        onError={setError}
        onChannelUpdated={onChannelUpdated}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete message?"
          message="This message will be permanently removed. This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteMessage}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </aside>
  );
}
