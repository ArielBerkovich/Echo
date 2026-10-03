import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon, BellOffIcon, ChevronsDownIcon } from "lucide-react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import ReactionPicker from "./ReactionPicker.js";
import Message from "./Message.js";
import Composer from "./Composer.js";
import ConfirmDialog from "./ConfirmDialog.js";
import { hasThreadJumpTarget, scrollThreadMessageIntoView } from "../lib/threadNavigation.js";
import { CloseButton } from "./Button.js";
import { useI18n } from "../lib/i18n.js";
import { languageDirection } from "../lib/languages.js";
import { queryKeys } from "../lib/queryClient.js";

// Right-hand thread view: the root message + its replies + a reply composer.
// Reuses the full Message (reactions, forward, edit) and Composer (emoji, bold,
// code, attachments) components so threads have parity with the main timeline.
export default function ThreadPanel({
  channel,
  recoveryEpoch = 0,
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
  onOpenGroup,
  onOpenChannel,
  onFindChannels,
  onAddCustomEmoji,
  onClose,
  onThreadRead,
  canPost = true,
  onChannelUpdated,
  onOpenLightbox,
  onToast,
  openThreadJumpMessageId = null,
  openThreadJumpRequestId = 0,
  composerFocusRequest = 0,
}) {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const notificationQuery = useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: api.getNotificationSettings,
    staleTime: Infinity,
  });
  const following = (notificationQuery.data?.followedThreads || []).includes(root.id);
  const muted = (notificationQuery.data?.mutedThreads || []).includes(root.id);
  async function toggleThreadFollow() {
    const nextFollowing = !following;
    const previous = queryClient.getQueryData(queryKeys.notificationSettings);
    queryClient.setQueryData(queryKeys.notificationSettings, (settings) => settings ? {
      ...settings,
      followedThreads: nextFollowing
        ? [...new Set([...(settings.followedThreads || []), root.id])]
        : (settings.followedThreads || []).filter((id) => id !== root.id),
      mutedThreads: nextFollowing
        ? (settings.mutedThreads || []).filter((id) => id !== root.id)
        : [...new Set([...(settings.mutedThreads || []), root.id])],
    } : settings);
    try {
      await api.setThreadFollow(channel.id, root.id, nextFollowing);
      onToast?.(t("threadNotificationPreferenceSaved"));
    } catch (followError) {
      queryClient.setQueryData(queryKeys.notificationSettings, previous);
      setError(followError.message || t("threadNotificationSaveFailed"));
    }
  }
  const direction = languageDirection(language);
  const [rootMsg, setRootMsg] = useState(root); // local copy so live edits/reactions apply
  const [rootDeleted, setRootDeleted] = useState(!!root.deleted);
  const [replies, setReplies] = useState([]);
  const [reactingTo, setReactingTo] = useState(null); // { id, rect } for the react picker
  const [menuFor, setMenuFor] = useState(null); // message id with the "more" menu open
  const [actionsFor, setActionsFor] = useState(null); // message whose hover toolbar is shown (only one)
  const [editing, setEditing] = useState(null); // { id, draft } being edited
  const [confirmDelete, setConfirmDelete] = useState(null); // message pending delete confirmation
  const [error, setError] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);
  const bottomRef = useRef(null);
  const scrollerRef = useRef(null);
  const bodyInnerRef = useRef(null); // content wrapper used to track height changes
  const composerRef = useRef(null); // thread reply composer, for quote insertion
  const rootDeletedRef = useRef(!!root.deleted);

  useEffect(() => {
    if (!composerFocusRequest || !canPost) return undefined;
    const focusTimer = window.setTimeout(() => composerRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [composerFocusRequest, canPost]);

  useEffect(() => {
    if (!canPost) return undefined;
    const focusTimer = window.setTimeout(() => composerRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [root.id, canPost]);
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
    rootDeletedRef.current = !!root.deleted;
    setRootDeleted(!!root.deleted);
    initialScrolledRef.current = false;
    prevReplyCountRef.current = 0;
    stickToBottomRef.current = true;
    jumpHandledRef.current = null;
    jumpTargetRef.current = openThreadJumpMessageId || null;
    setHighlightId(null);
    setNewMessageCount(0);
    setAlsoSendToChannel(false);
  }, [root.id]);

  useEffect(() => {
    if (!root.deleted) return;
    rootDeletedRef.current = true;
    setRootDeleted(true);
    setRootMsg((previous) => ({ ...previous, deleted: true }));
  }, [root.id, root.deleted]);

  useEffect(() => {
    if (openThreadJumpMessageId) jumpTargetRef.current = openThreadJumpMessageId;
  }, [openThreadJumpMessageId]);

  useEffect(() => {
    let cancelled = false;
    setReplies([]);
    api
      .getThread(channel.id, root.id)
      .then(({ replies, parent }) => {
        if (cancelled) return;
        setReplies(replies);
        if (parent && !rootDeletedRef.current) setRootMsg((prev) => ({ ...prev, ...parent }));
        setError(null);
      })
      .catch((error) => {
        if (!cancelled && !rootDeletedRef.current) setError(error.message);
      });

    const socket = getSocket();
    const onNew = (msg) => {
      if (msg.parentId === root.id) {
        const authoredByMe = msg.author?.id === user.id;
        const scroller = scrollerRef.current;
        const atBottom = authoredByMe || (scroller
          ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120
          : stickToBottomRef.current);
        if (atBottom) {
          stickToBottomRef.current = true;
          if (authoredByMe) setNewMessageCount(0);
        } else {
          stickToBottomRef.current = false;
          setNewMessageCount((count) => count + 1);
        }
        setReplies((prev) => (prev.some((r) => r.id === msg.id) ? prev : [...prev, msg]));
      }
    };
    // Keep root + replies in sync with edits/deletes/reactions from anywhere.
    const onUpdate = (u) => {
      setRootMsg((prev) => (prev.id === u.id
        ? { ...prev, body: u.body, editedAt: u.editedAt, attachments: u.attachments ?? prev.attachments }
        : prev));
      setReplies((prev) =>
        prev.map((r) => (r.id === u.id
          ? { ...r, body: u.body, editedAt: u.editedAt, attachments: u.attachments ?? r.attachments }
          : r))
      );
    };
    const onDeleted = ({ id }) => {
      if (id === root.id) {
        rootDeletedRef.current = true;
        setRootDeleted(true);
        setRootMsg((previous) => ({ ...previous, deleted: true }));
        return;
      }
      setReplies((prev) => prev.filter((r) => r.id !== id));
    };
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
    const onSurvey = ({ messageId, survey }) => {
      if (!survey) return;
      setRootMsg((prev) => (prev.id === messageId ? { ...prev, survey } : prev));
      setReplies((prev) => prev.map((r) => (r.id === messageId ? { ...r, survey } : r)));
    };
    socket.on("message:survey", onSurvey);
    const onRetro = ({ messageId, retro }) => {
      if (!retro) return;
      setRootMsg((prev) => (prev.id === messageId ? { ...prev, retro } : prev));
      setReplies((prev) => prev.map((r) => (r.id === messageId ? { ...r, retro } : r)));
    };
    socket.on("message:retro", onRetro);
    socket.on("message:pin", onPin);

    return () => {
      cancelled = true;
      socket.off("message:new", onNew);
      socket.off("message:update", onUpdate);
      socket.off("message:deleted", onDeleted);
      socket.off("message:reaction", onReaction);
      socket.off("message:survey", onSurvey);
      socket.off("message:retro", onRetro);
      socket.off("message:pin", onPin);
    };
  }, [channel.id, root.id, user.id, recoveryEpoch]);

  useLayoutEffect(() => {
    if (!replies.length) {
      prevReplyCountRef.current = 0;
      return;
    }
    const grew = replies.length > prevReplyCountRef.current;
    prevReplyCountRef.current = replies.length;

    if (!initialScrolledRef.current) {
      // A permalink to a reply must take over the initial position. The
      // normal initial scroll-to-bottom would otherwise run first and can
      // win again when the thread body resizes after the target is centered.
      const jumpTargetId = openThreadJumpMessageId || jumpTargetRef.current;
      if (hasThreadJumpTarget(jumpTargetId)) {
        initialScrolledRef.current = true;
        stickToBottomRef.current = false;
        return;
      }
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      initialScrolledRef.current = true;
      stickToBottomRef.current = true;
      return;
    }

    if (grew && stickToBottomRef.current) {
      scrollToExactBottom();
    }
  }, [replies]);

  useEffect(() => {
    const targetId = openThreadJumpMessageId || jumpTargetRef.current;
    if (!targetId) return;
    const requestKey = `${openThreadJumpRequestId}:${targetId}`;
    if (jumpHandledRef.current === requestKey) return;
    const target = document.querySelector(`.thread-body [data-mid="${targetId}"]`);
    if (!target) return;
    jumpHandledRef.current = requestKey;
    // Prevent the ResizeObserver and live-reply handling from immediately
    // restoring the thread to its bottom after this permalink scrolls.
    scrollThreadMessageIntoView(target, (stickToBottom) => {
      stickToBottomRef.current = stickToBottom;
    });
    setHighlightId(targetId);
  }, [openThreadJumpMessageId, openThreadJumpRequestId, replies, rootMsg.id]);

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
        // A permalink jump can disable following after this frame was queued.
        if (stickToBottomRef.current) scrollToExactBottom();
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
    // The mobile toolbar is portaled above the scrolling thread, so close it
    // as soon as the user starts scrolling. Desktop keeps hover behavior.
    if (window.matchMedia("(max-width: 760px)").matches) {
      setActionsFor(null);
      setMenuFor(null);
    }
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    stickToBottomRef.current = atBottom;
    if (atBottom) setNewMessageCount(0);
  }

  function scrollToExactBottom() {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  function scrollToNewMessages() {
    setNewMessageCount(0);
    stickToBottomRef.current = true;
    requestAnimationFrame(scrollToExactBottom);
  }

  // Keep conversation read markers separate from per-activity visibility reads.
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
    setEditing({ id: m.id, draft: m.body, attachments: m.attachments || [] });
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
    <aside
      className="thread-panel"
      data-testid="thread-panel"
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || editing) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="thread-header" data-testid="thread-header">
        <div className="thread-heading">
          <span className="thread-title">{t("thread")}</span>
        </div>
        <div className="thread-header-actions">
          {!rootDeleted && <button
            type="button"
            className={`thread-follow-toggle${following || muted ? " is-following" : ""}`}
            data-testid="thread-follow-toggle"
            aria-pressed={following}
            aria-label={following ? t("turnOffThreadNotifications") : t("getThreadNotifications")}
            title={following ? t("turnOffThreadNotifications") : t("getThreadNotifications")}
            disabled={notificationQuery.isLoading}
            onClick={toggleThreadFollow}
          >
            {following ? <BellIcon size={16} strokeWidth={1.8} /> : <BellOffIcon size={16} strokeWidth={1.8} />}
          </button>}
          <CloseButton size="sm" data-testid="thread-close" onClick={onClose} label={t("closeThread")} />
        </div>
      </header>

      <div className="thread-messages-shell">
      <div ref={scrollerRef} className="thread-body" data-testid="thread-body" onScroll={onBodyScroll} onMouseLeave={() => { if (!menuFor) setActionsFor(null); }}>
        <div ref={bodyInnerRef}>
          {messages.map((m, index) => {
            // Threads show complete metadata for every message, including replies.
            return (
            <Fragment key={m.id}>
              {rootDeleted && index === 0 ? (
                <div className="thread-root-deleted" data-testid="thread-root-deleted" role="status">
                  {t("messageDeleted")}
                </div>
              ) : <Message
                m={m}
                channelId={channel.id}
                channelType={channel.type}
                threadRootId={m.parentId ? root.id : null}
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
                onOpenGroup={onOpenGroup}
                onOpenChannel={onOpenChannel}
                showActions={actionsFor === m.id}
                onActivate={() => {
                  setActionsFor(m.id);
                  setMenuFor((openId) => (openId && openId !== m.id ? null : openId));
                }}
                onDeactivate={() => setActionsFor((activeId) => (activeId === m.id ? null : activeId))}
                editing={null}
                menuOpen={menuFor === m.id}
                pickerOpen={reactingTo?.id === m.id}
                onReact={(e) => {
                  setActionsFor(m.id);
                  openReact(m.id, e);
                }}
                onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
                onOpenThread={() => {}}
                onViewInChannel={() => {
                  onClose?.();
                  onJumpToMessage?.({
                    channelId: channel.id,
                    messageId: m.id,
                    channelType: channel.type,
                    channelName: channel.name,
                  });
                }}
                onQuote={() => {
                  setActionsFor(null);
                  setMenuFor(null);
                  composerRef.current?.quoteMessage(m);
                }}
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
                onToast={onToast}
                canPin={canPin}
                canQuote={channel.type === "dm"}
              />}
              {index === 0 && (
                <div className="thread-divider" data-testid="thread-reply-count">
                  <span dir={direction}>{replies.length === 1 ? t("oneReply") : t("replyCount").replace("{count}", String(replies.length))}</span>
                </div>
              )}
            </Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
        {newMessageCount > 0 && (
          <button
            type="button"
            className="new-messages-button timeline-jump-button"
            data-testid="thread-new-messages-button"
            onClick={scrollToNewMessages}
            aria-label={`Scroll to latest, ${newMessageCount} new ${newMessageCount === 1 ? "message" : "messages"}`}
            title="View new messages"
          >
            <span className="new-messages-count" aria-hidden="true">
              {newMessageCount > 99 ? "99+" : newMessageCount}
            </span>
            <ChevronsDownIcon size={17} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
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
                expanded={reactingTo.expanded}
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

      {!rootDeleted && canPost ? <Composer
        ref={composerRef}
        key={`thread-${root.id}`}
        channel={channel}
        parentId={root.id}
        alsoSendToChannel={alsoSendToChannel}
        onAlsoSendToChannelChange={setAlsoSendToChannel}
        onSent={() => {
          setAlsoSendToChannel(false);
          queryClient.setQueryData(queryKeys.notificationSettings, (settings) => settings ? {
            ...settings,
            followedThreads: [...new Set([...(settings.followedThreads || []), root.id])],
            mutedThreads: (settings.mutedThreads || []).filter((id) => id !== root.id),
          } : settings);
        }}
        users={users}
        channels={channels}
        onFindChannels={onFindChannels}
        customEmojis={customEmojis}
        onAddCustomEmoji={onAddCustomEmoji}
        onError={setError}
        onChannelUpdated={onChannelUpdated}
        captureScreenDrops
        editing={editing}
        onEditSave={() => setEditing(null)}
        onEditCancel={() => {
          setEditing(null);
          setError(null);
        }}
      /> : !rootDeleted && (
        <div className="channel-readonly-notice thread-readonly-notice" role="status">
          <strong>{t("managersOnly")}</strong>
          <span>{t("managersOnlyReplyHint")}</span>
        </div>
      )}

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
