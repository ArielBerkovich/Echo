import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import ReactionPicker from "./ReactionPicker.js";
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
  channels = [],
  customEmojis = [],
  canJumpToForward,
  onJumpToMessage,
  onForward,
  onTogglePin,
  canPin = true,
  savedIds,
  onToggleSave,
  onOpenProfile,
  onOpenChannel,
  onAddCustomEmoji,
  onClose,
  onThreadRead,
  onChannelUpdated,
  onOpenLightbox,
  openThreadJumpMessageId = null,
}) {
  const [rootMsg, setRootMsg] = useState(root); // local copy so live edits/reactions apply
  const [replies, setReplies] = useState([]);
  const [reactingTo, setReactingTo] = useState(null); // { id, rect } for the react picker
  const [menuFor, setMenuFor] = useState(null); // message id with the "more" menu open
  const [actionsFor, setActionsFor] = useState(null); // message whose hover toolbar is shown (only one)
  const [editing, setEditing] = useState(null); // { id, draft } being edited
  const [confirmDelete, setConfirmDelete] = useState(null); // message pending delete confirmation
  const [error, setError] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const bottomRef = useRef(null);
  const bodyInnerRef = useRef(null); // content wrapper used to track height changes
  const stickToBottomRef = useRef(true); // should later layout changes keep us pinned?
  const initialScrolledRef = useRef(false); // has the panel been positioned yet?
  const prevReplyCountRef = useRef(0); // reply count last render
  const jumpHandledRef = useRef(null); // last reply id we attempted to reveal
  const jumpTargetRef = useRef(openThreadJumpMessageId);

  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis, channels);
  const emojiMap = useMemo(
    () => new Map(customEmojis.map((e) => [e.name.toLowerCase(), e.url])),
    [customEmojis]
  );
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Reset the local root when a different thread is opened.
  useEffect(() => {
    setRootMsg(root);
    initialScrolledRef.current = false;
    prevReplyCountRef.current = 0;
    stickToBottomRef.current = true;
    jumpHandledRef.current = null;
    jumpTargetRef.current = openThreadJumpMessageId || null;
    setHighlightId(null);
  }, [root.id]);

  useEffect(() => {
    if (openThreadJumpMessageId) jumpTargetRef.current = openThreadJumpMessageId;
  }, [openThreadJumpMessageId]);

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
    const onPin = ({ messageId, pinnedAt, pinnedBy }) => {
      setRootMsg((prev) => (prev.id === messageId ? { ...prev, pinnedAt, pinnedBy } : prev));
      setReplies((prev) =>
        prev.map((r) => (r.id === messageId ? { ...r, pinnedAt, pinnedBy } : r))
      );
    };
    socket.on("message:new", onNew);
    socket.on("message:update", onUpdate);
    socket.on("message:deleted", onDeleted);
    socket.on("message:reaction", onReaction);
    socket.on("message:pin", onPin);

    return () => {
      cancelled = true;
      socket.off("message:new", onNew);
      socket.off("message:update", onUpdate);
      socket.off("message:deleted", onDeleted);
      socket.off("message:reaction", onReaction);
      socket.off("message:pin", onPin);
    };
  }, [channel.id, root.id]);

  useLayoutEffect(() => {
    if (!replies.length) {
      prevReplyCountRef.current = 0;
      return;
    }
    const grew = replies.length > prevReplyCountRef.current;
    prevReplyCountRef.current = replies.length;

    if (!initialScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      initialScrolledRef.current = true;
      stickToBottomRef.current = true;
      return;
    }

    if (grew && stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [replies]);

  useEffect(() => {
    const targetId = openThreadJumpMessageId || jumpTargetRef.current;
    if (!targetId) return;
    if (jumpHandledRef.current === targetId) return;
    const target = document.querySelector(`.thread-body [data-mid="${targetId}"]`);
    if (!target) return;
    jumpHandledRef.current = targetId;
    target.scrollIntoView({ block: "center", behavior: "auto" });
    setHighlightId(targetId);
  }, [openThreadJumpMessageId, replies, rootMsg.id]);

  useEffect(() => {
    if (!highlightId) return undefined;
    const clearHighlight = () => setHighlightId(null);
    document.addEventListener("pointerdown", clearHighlight);
    return () => document.removeEventListener("pointerdown", clearHighlight);
  }, [highlightId]);

  useEffect(() => {
    const el = bodyInnerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
      });
    });

    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  function onBodyScroll(e) {
    const scroller = e.currentTarget;
    stickToBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
  }

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
    setReactingTo({ id: messageId, rect: e.currentTarget.getBoundingClientRect(), expanded: false });
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

      <div className="thread-body" onScroll={onBodyScroll} onMouseLeave={() => { if (!menuFor) setActionsFor(null); }}>
        <div ref={bodyInnerRef}>
          {messages.map((m) => (
            <Message
              key={m.id}
              m={m}
              grouped={false}
              highlighted={highlightId === m.id}
              currentUserId={user.id}
              usersById={usersById}
              renderMarkdown={renderMarkdown}
              emojiMap={emojiMap}
              canJumpToForward={canJumpToForward}
              inThread
              saved={savedIds?.has(m.id)}
              onToggleSave={() => onToggleSave?.(m.id)}
              onOpenProfile={onOpenProfile}
              onOpenChannel={onOpenChannel}
              showActions={actionsFor === m.id}
              onActivate={() => {
                setActionsFor(m.id);
                setMenuFor((openId) => (openId && openId !== m.id ? null : openId));
              }}
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
              onTogglePin={() => onTogglePin?.(m)}
              canPin={canPin}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {reactingTo &&
        (() => {
          const r = reactingTo.rect;
          const PW = Math.min(reactingTo.expanded ? 352 : 252, window.innerWidth - 16);
          const PH = Math.min(reactingTo.expanded ? 435 : 132, window.innerHeight - 24);
          const left = Math.max(8, Math.min(r.left, window.innerWidth - PW - 8));
          let top = r.bottom + 6;
          if (top + PH > window.innerHeight) top = Math.max(8, r.top - PH - 6);
          top = Math.max(8, Math.min(top, window.innerHeight - PH - 8));
          return (
            <div className="reaction-picker" style={{ top, left }}>
              <ReactionPicker
                onPick={(value) => toggleReaction(reactingTo.id, value)}
                onClose={() => setReactingTo(null)}
                onExpand={() => setReactingTo((current) => current && { ...current, expanded: true })}
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
        channels={channels}
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
