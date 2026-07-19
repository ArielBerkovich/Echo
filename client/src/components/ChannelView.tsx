import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import Avatar from "./Avatar.js";
import ReactionPicker from "./ReactionPicker.js";
import ThreadPanel from "./ThreadPanel.js";
import ForwardModal from "./ForwardModal.js";
import ChannelDetailsPanel from "./ChannelDetailsPanel.js";
import MembersPanel from "./MembersPanel.js";
import Message, { SystemMessage } from "./Message.js";
import { LightboxImage } from "./Attachments.js";
import Composer from "./Composer.js";
import ConfirmDialog from "./ConfirmDialog.js";
import Modal from "./Modal.js";
import { LeaveIcon, PinIcon } from "./Icons.js";
import { formatDayDivider, isDifferentDay } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import { StarIcon, UsersRoundIcon } from "lucide-react";

// Shimmering placeholder rows shown while a channel's history loads, so the
// pane has structure immediately instead of flashing an empty "say hello" state.
const SKELETON_WIDTHS = [62, 44, 78, 35, 70, 52, 66];
function MessagesSkeleton() {
  return (
    <div className="msg-skeletons" aria-hidden="true">
      {SKELETON_WIDTHS.map((w, i) => (
        <div className="sk-row" key={i}>
          <div className="sk-avatar skeleton" />
          <div className="sk-lines">
            <div className="sk-line sk-meta skeleton" />
            <div className="sk-line skeleton" style={{ width: `${w}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChannelView({
  channel,
  cachedMessages = null,
  initialScrollState = null,
  user,
  users = [],
  channels = [],
  dms = [],
  customEmojis = [],
  savedIds,
  onToggleSave,
  onCacheMessages,
  onRememberScroll,
  onScrollToBottomTargetConsumed,
  onOpenProfile,
  onOpenChannel,
  isVip = false,
  onToggleVip,
  jumpMessageId = null,
  scrollToBottomTarget = null,
  canJumpToForward,
  onJumpToMessage,
  onJumpConsumed,
  onAddCustomEmoji,
  onAddPeople,
  onRemoveMember,
  onPromoteManager,
  onLeave,
  onDeleteChannel,
  onChangeVisibility,
  onChannelUpdated,
  onToast,
  onDmsChanged,
  onJoin,
  onRead,
  onThreadRead,
  openThreadId = null,
  openThreadJumpMessageId = null,
  onThreadOpened,
  mode = "light",
}) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [thread, setThread] = useState(null); // open thread root message, or null
  const [threadJumpTargetId, setThreadJumpTargetId] = useState(null);
  const [reactingTo, setReactingTo] = useState(null); // message id with the react picker open
  const [menuFor, setMenuFor] = useState(null); // message id with the "more" menu open
  const [actionsFor, setActionsFor] = useState(null); // message whose hover toolbar is shown (only one)
  const [editing, setEditing] = useState(null); // { id, draft } of the message being edited
  const [forwarding, setForwarding] = useState(null); // message being forwarded, or null
  const [confirmDelete, setConfirmDelete] = useState(null); // message pending delete confirmation
  const [confirmLeave, setConfirmLeave] = useState(false); // leave-channel confirmation open?
  const [leaveManagerId, setLeaveManagerId] = useState("");
  const [leaveManagerQuery, setLeaveManagerQuery] = useState("");
  const [showDetails, setShowDetails] = useState(false); // channel details panel open?
  const [showMembers, setShowMembers] = useState(false); // members side panel open?
  const [showPinned, setShowPinned] = useState(false); // pinned messages panel open?
  const [pinnedMessages, setPinnedMessages] = useState([]); // cached pinned list
  const showPinnedRef = useRef(false);
  const [firstUnreadId, setFirstUnreadId] = useState(null); // first message not yet seen
  const [highlightId, setHighlightId] = useState(null); // message highlighted after a jump
  const [historyReady, setHistoryReady] = useState(false); // has the initial message payload resolved?
  const [typingUsers, setTypingUsers] = useState({}); // { userId: displayName } currently typing
  const [threadLightbox, setThreadLightbox] = useState(null); // { src, name } opened from thread
  const [loadingOlder, setLoadingOlder] = useState(false); // fetching older history (scroll-up)
  const [loading, setLoading] = useState(true); // initial history fetch for this channel in flight
  const [newMessageCount, setNewMessageCount] = useState(0);

  const bottomRef = useRef(null);
  const scrollerRef = useRef(null); // the scrollable messages container
  const messagesInnerRef = useRef(null); // content wrapper used for resize-based auto-follow
  const typingTimersRef = useRef({}); // per-user safety timers to clear stale typing
  const firstUnreadRef = useRef(null); // the "New messages" divider, for initial scroll
  const initialScrolledRef = useRef(false); // did we position the initial scroll yet?
  const prevLenRef = useRef(0); // message count last render (to detect appends)
  const hasMoreOlderRef = useRef(true); // is there older history left to load?
  const loadingOlderRef = useRef(false); // guard against overlapping older-history fetches
  const pendingPrependRef = useRef(null); // { prevHeight, prevTop } to restore scroll after a prepend
  const justPrependedRef = useRef(false); // last growth was a prepend (don't follow to bottom)
  const stickToBottomRef = useRef(true); // should later height changes keep us pinned to the bottom?
  const handledBottomScrollRequestRef = useRef(0); // last handled open-at-bottom request id
  const jumpingRef = useRef(false); // a jump scroll is in flight — pause scroll-up pagination
  const jumpSettleRef = useRef(null); // timer that re-enables pagination after a jump lands
  const unreadScrollAppliedRef = useRef(false); // did we already anchor the current unread divider?
  const suppressGrowFollowRef = useRef(false); // while true, don't auto-follow "grew" renders to the bottom

  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis, channels);
  const emojiMap = useMemo(
    () => new Map(customEmojis.map((e) => [e.name.toLowerCase(), e.url])),
    [customEmojis]
  );
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const settleUnreadAnchor = useCallback(() => {
    clearTimeout(jumpSettleRef.current);
    jumpSettleRef.current = setTimeout(() => {
      jumpingRef.current = false;
      suppressGrowFollowRef.current = false;
    }, 500);
  }, []);
  const anchorUnreadDivider = useCallback(() => {
    const scroller = scrollerRef.current;
    const divider = firstUnreadRef.current;
    if (!scroller || !divider) return false;
    const dividerRect = divider.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const delta = dividerRect.top - scrollerRect.top - 24;
    scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
    return true;
  }, []);
  const firstUnreadRefCallback = useCallback(
    (node) => {
      firstUnreadRef.current = node;
      if (
        !node ||
        loading ||
        !historyReady ||
        !firstUnreadId ||
        unreadScrollAppliedRef.current
      ) {
        return;
      }
      unreadScrollAppliedRef.current = true;
      jumpingRef.current = true;
      stickToBottomRef.current = false;
      requestAnimationFrame(() => {
        anchorUnreadDivider();
        settleUnreadAnchor();
      });
    },
    [anchorUnreadDivider, firstUnreadId, historyReady, loading, settleUnreadAnchor]
  );

  // Load history + subscribe to live messages whenever the active channel changes.
  useEffect(() => {
    let cancelled = false;
    const socket = getSocket();
    const myId = user.id;

    setMessages([]);
    setLoading(true);
    setError(null);
    setThread(null);
    setThreadJumpTargetId(null);
    setMenuFor(null);
    setEditing(null);
    setForwarding(null);
    setShowDetails(false);
    setShowMembers(false);
    setShowPinned(false);
    setPinnedMessages([]);
    setFirstUnreadId(null);
    setHighlightId(null);
    setHistoryReady(false);
    setTypingUsers({});
    setNewMessageCount(0);
    initialScrolledRef.current = false;
    prevLenRef.current = 0;
    hasMoreOlderRef.current = true;
    loadingOlderRef.current = false;
    pendingPrependRef.current = null;
    justPrependedRef.current = false;
    unreadScrollAppliedRef.current = false;
    suppressGrowFollowRef.current = true;
    // A fresh channel means any in-flight jump is stale: clear the guards so the
    // pending jump for this channel is handled cleanly (and re-jumping to the
    // same message later isn't silently blocked by a leftover handled-id).
    jumpHandledRef.current = null;
    jumpLoadingRef.current = null;
    jumpingRef.current = false;
    clearTimeout(jumpSettleRef.current);
    setLoadingOlder(false);
    if (cachedMessages?.length) {
      setMessages(cachedMessages);
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }

    api
      .getMessages(channel.id)
      .then(({ messages, lastReadAt }) => {
        if (cancelled) return;
        setMessages(messages);
        onCacheMessages?.(channel.id, messages);
        // First message from someone else that arrived after we last read —
        // the channel will open scrolled to it (where we left off).
        const since = lastReadAt ? new Date(lastReadAt) : null;
        const firstUnread = since
          ? messages.find(
              (m) =>
                m.kind !== "system" &&
                m.author?.id !== user.id &&
                new Date(m.createdAt) > since
            )
          : null;
        setFirstUnreadId(firstUnread ? firstUnread.id : null);
        // Mark read only after we've captured the unread boundary.
        onRead?.(channel.id);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setHistoryReady(true);
      });

    socket.emit("channel:join", channel.id);
    // Members (and DM participants) stay in their conversation rooms for the
    // whole session — they joined them on connect — so unread/notifications
    // keep working after navigating away. Only previews of non-member channels
    // get un-subscribed when closed.
    const isPreview = channel.type !== "dm" && !(channel.members || []).includes(user.id);

    const onNew = (msg) => {
      if (msg.channelId !== channel.id) return;
      if (msg.parentId) {
        // A thread reply: bump the parent's reply count (don't add to main list).
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.parentId
              ? { ...m, replyCount: (m.replyCount || 0) + 1, lastReplyAt: msg.createdAt }
              : m
          )
        );
      } else {
        // The scroll event that updates stickToBottomRef can be delivered a
        // tick after a programmatic scroll (and after a layout change). Read
        // the actual gap here as well so a message arriving at the visible
        // bottom is never treated as an off-screen message.
        const scroller = scrollerRef.current;
        // Your own send should always bring the timeline into view, even when
        // you were reading older messages. Messages from other people still
        // preserve the current viewport and use the new-message counter.
        const authoredByMe = msg.author?.id === user.id;
        const atBottom = authoredByMe || (scroller
          ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120
          : stickToBottomRef.current);
        if (atBottom) stickToBottomRef.current = true;
        else {
          stickToBottomRef.current = false;
          setNewMessageCount((count) => count + 1);
        }
        setMessages((prev) => [...prev, msg]);
      }
      // Stay read while viewing — but only for the main timeline. A thread
      // reply isn't visible here (it's behind the "N replies" link), so it
      // must not mark the channel read; it's read when its thread is opened.
      if (!msg.parentId && msg.author?.id !== user.id) {
        onRead?.(channel.id);
      }
    };
    socket.on("message:new", onNew);

    const onReaction = ({ messageId, reactions }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    };
    socket.on("message:reaction", onReaction);

    const onUpdate = (u) => {
      if (u.channelId !== channel.id || u.parentId) return; // thread edits handled in panel
      setMessages((prev) =>
        prev.map((m) => (m.id === u.id ? { ...m, body: u.body, editedAt: u.editedAt } : m))
      );
    };
    socket.on("message:update", onUpdate);

    const onPin = ({ messageId, channelId, pinnedAt, pinnedBy }) => {
      if (channelId !== channel.id) return;
      if (pinnedAt && showPinnedRef.current) {
        api.getPinned(channel.id).then(({ messages }) => setPinnedMessages(messages)).catch(() => {});
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, pinnedAt, pinnedBy } : m))
      );
      setPinnedMessages((prev) => {
        if (pinnedAt) {
          // Add or update in pinned list
          const exists = prev.some((m) => m.id === messageId);
          if (exists) return prev.map((m) => (m.id === messageId ? { ...m, pinnedAt, pinnedBy } : m));
          return prev;
        } else {
          return prev.filter((m) => m.id !== messageId);
        }
      });
    };
    socket.on("message:pin", onPin);

    const onDeleted = ({ id, channelId, parentId }) => {
      if (channelId !== channel.id) return;
      if (parentId) {
        // A deleted thread reply: drop the parent's reply count.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === parentId ? { ...m, replyCount: Math.max(0, (m.replyCount || 0) - 1) } : m
          )
        );
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      }
    };
    socket.on("message:deleted", onDeleted);

    // Track who's typing — drop them on a "stop", or after a safety timeout in
    // case a stop event is lost.
    const timers = typingTimersRef.current;
    const dropTyping = (id) =>
      setTypingUsers((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    const onTyping = ({ channelId, typing, user }) => {
      if (channelId !== channel.id || !user || user.id === myId) return;
      clearTimeout(timers[user.id]);
      if (typing) {
        setTypingUsers((prev) => ({ ...prev, [user.id]: user.displayName }));
        timers[user.id] = setTimeout(() => dropTyping(user.id), 5000);
      } else {
        dropTyping(user.id);
      }
    };
    socket.on("typing", onTyping);

    return () => {
      cancelled = true;
      if (isPreview) socket.emit("channel:leave", channel.id);
      socket.off("message:new", onNew);
      socket.off("message:reaction", onReaction);
      socket.off("message:update", onUpdate);
      socket.off("message:deleted", onDeleted);
      socket.off("message:pin", onPin);
      socket.off("typing", onTyping);
      Object.values(timers).forEach(clearTimeout);
    };
  }, [channel.id]);

  useEffect(() => {
    showPinnedRef.current = showPinned;
  }, [showPinned]);

  function toggleReaction(messageId, emoji) {
    getSocket().emit("reaction:toggle", { messageId, emoji }, () => {});
    setReactingTo(null);
  }

  // Open the reaction picker anchored to the clicked button.
  function openReact(messageId, e) {
    setReactingTo({ id: messageId, rect: e.currentTarget.getBoundingClientRect(), expanded: false });
  }

  // ---- Edit / delete / forward ----
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
    setConfirmDelete(m); // open the styled confirmation dialog
  }

  function confirmDeleteMessage() {
    const m = confirmDelete;
    setConfirmDelete(null);
    if (!m) return;
    getSocket().emit("message:delete", { messageId: m.id }, (res) => {
      if (res?.error) setError(res.error);
    });
  }

  function togglePin(m) {
    getSocket().emit("message:pin", { messageId: m.id }, (res) => {
      if (res?.error) setError(res.error);
    });
  }

  function openPinnedPanel() {
    setThread(null);
    setThreadJumpTargetId(null);
    setShowDetails(false);
    setShowMembers(false);
    setShowPinned(true);
    api.getPinned(channel.id)
      .then(({ messages }) => setPinnedMessages(messages))
      .catch(() => {});
  }

  // Returns a promise so the ForwardModal can show per-destination progress.
  async function forwardTo(dest, options = {}) {
    let targetId = dest.id;
    let targetType = dest.kind === "dm" || dest.kind === "user" ? "dm" : "public";
    if (dest.kind === "user") {
      const { channel } = await api.openDm(dest.id);
      targetId = channel.id;
    }

    return new Promise((resolve, reject) => {
      getSocket().emit("message:forward", { messageId: forwarding.id, channelId: targetId, note: options.note || "" }, (res) => {
        if (res?.error) return reject(new Error(res.error));
        // Forwarding into a channel should land at the bottom so the new copy
        // is visible in context; a "view original" jump still uses the message
        // centering path elsewhere.
        // A newly-created DM is not in the current sidebar snapshot yet, so
        // let the modal close without trying to navigate to a stale list item.
        if (dest.kind !== "user") {
          onJumpToMessage?.({
            channelId: targetId,
            messageId: res?.message?.id,
            channelType: targetType,
          }, { focus: "bottom" });
        }
        resolve();
      });
    });
  }

  // Load older history when scrolling near the top (the server paginates with
  // ?before=<oldest loaded message's time>). Strictly older, so no overlap.
  function loadOlder() {
    if (loadingOlderRef.current || !hasMoreOlderRef.current || messages.length === 0) return;
    const oldest = messages[0];
    const scroller = scrollerRef.current;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    pendingPrependRef.current = scroller
      ? { prevHeight: scroller.scrollHeight, prevTop: scroller.scrollTop }
      : null;
    api
      .getMessages(channel.id, { before: oldest.createdAt })
      .then(({ messages: older }) => {
        if (!older || older.length === 0) {
          hasMoreOlderRef.current = false;
          pendingPrependRef.current = null;
          return;
        }
        setMessages((prev) => {
          const have = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !have.has(m.id));
          if (fresh.length === 0) hasMoreOlderRef.current = false;
          const next = fresh.length ? [...fresh, ...prev] : prev;
          onCacheMessages?.(channel.id, next);
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      });
  }

  function onMessagesScroll(e) {
    const scroller = e.currentTarget;
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    if (!jumpingRef.current && !(firstUnreadId && unreadScrollAppliedRef.current)) {
      stickToBottomRef.current = atBottom;
      if (atBottom) setNewMessageCount(0);
    } else {
      stickToBottomRef.current = false;
    }
    rememberCurrentScroll();
    if (jumpingRef.current) return; // don't paginate while a jump is settling
    if (scroller.scrollTop < 150) loadOlder();
  }

  function scrollToExactBottom() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }

  function scrollToNewMessages() {
    setNewMessageCount(0);
    stickToBottomRef.current = true;
    requestAnimationFrame(scrollToExactBottom);
  }

  function rememberCurrentScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    onRememberScroll?.(channel.id, {
      scrollTop: scroller.scrollTop,
      atBottom: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120,
    });
  }

  // After prepending older messages, keep the viewport anchored to what the user
  // was looking at (offset by the height we just added above it).
  useLayoutEffect(() => {
    const p = pendingPrependRef.current;
    if (!p) return;
    pendingPrependRef.current = null;
    justPrependedRef.current = true;
    const c = scrollerRef.current;
    if (c) c.scrollTop = c.scrollHeight - p.prevHeight + p.prevTop;
  }, [messages]);

  useEffect(() => {
    const el = messagesInnerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (!stickToBottomRef.current || loading || jumpingRef.current) return;
      if (firstUnreadId && unreadScrollAppliedRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        scrollToExactBottom();
      });
    });

    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [loading]);

  useEffect(() => {
    return () => {
      rememberCurrentScroll();
    };
  }, [channel.id]);

  useEffect(() => {
    // Wait until messages are actually rendered (not the loading skeleton),
    // otherwise bottomRef/firstUnreadRef don't exist yet and the initial scroll
    // is silently lost.
    if (loading || messages.length === 0 || !historyReady) return;
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    const shouldForceBottom =
      scrollToBottomTarget?.channelId === channel.id &&
      scrollToBottomTarget.id > handledBottomScrollRequestRef.current;

    // A prepend (older history) grows the list but must not yank to the bottom.
    if (justPrependedRef.current) {
      justPrependedRef.current = false;
      return;
    }

    if (!initialScrolledRef.current) {
      // First render of this channel: open at the first unread message (where
      // we left off), or at the bottom if everything's already been read.
      // A pending jump (e.g. "view original") takes over the scroll instead.
      initialScrolledRef.current = true;
      const settleInitialScroll = () => {
        clearTimeout(jumpSettleRef.current);
        jumpSettleRef.current = setTimeout(() => {
          jumpingRef.current = false;
          suppressGrowFollowRef.current = false;
        }, 1500);
      };
      if (jumpMessageId) {
        stickToBottomRef.current = false;
        return;
      }
      if (shouldForceBottom) {
        handledBottomScrollRequestRef.current = scrollToBottomTarget.id;
        onScrollToBottomTargetConsumed?.();
        requestAnimationFrame(() => {
          scrollToExactBottom();
          stickToBottomRef.current = true;
          suppressGrowFollowRef.current = false;
        });
        return;
      }
      if (firstUnreadId && firstUnreadRef.current) {
        unreadScrollAppliedRef.current = true;
        jumpingRef.current = true;
        stickToBottomRef.current = false;
        requestAnimationFrame(() => {
          anchorUnreadDivider();
          settleUnreadAnchor();
        });
        return;
      }
      if (initialScrollState) {
        if (!initialScrollState.atBottom) jumpingRef.current = true;
        stickToBottomRef.current = !!initialScrollState.atBottom;
        if (!initialScrollState.atBottom) {
          stickToBottomRef.current = false;
        }
        requestAnimationFrame(() => {
          const scroller = scrollerRef.current;
          if (!scroller) return;
        if (initialScrollState.atBottom) {
          scrollToExactBottom();
          stickToBottomRef.current = true;
          suppressGrowFollowRef.current = false;
        } else {
            scroller.scrollTop = initialScrollState.scrollTop;
            stickToBottomRef.current = false;
            settleInitialScroll();
          }
        });
        return;
      }
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
        stickToBottomRef.current = true;
        suppressGrowFollowRef.current = false;
      });
    } else if (shouldForceBottom && !jumpMessageId) {
      handledBottomScrollRequestRef.current = scrollToBottomTarget.id;
      onScrollToBottomTargetConsumed?.();
      scrollToExactBottom();
      stickToBottomRef.current = true;
      suppressGrowFollowRef.current = false;
    } else if (
      grew &&
      stickToBottomRef.current &&
      !jumpMessageId &&
      !firstUnreadId &&
      !unreadScrollAppliedRef.current
    ) {
      // Follow new messages only when the user was already following the live
      // edge. If they are reading older messages, preserve their viewport.
      scrollToExactBottom();
      stickToBottomRef.current = true;
    }
  }, [messages, firstUnreadId, jumpMessageId, loading, historyReady, initialScrollState, scrollToBottomTarget]);

  // If the unread divider appears after the first initial-scroll pass, retry the
  // anchor once the divider exists. This avoids snapping back to the bottom
  // when unread state resolves a tick later than the message list.
  useEffect(() => {
    if (loading || !historyReady || !firstUnreadId || unreadScrollAppliedRef.current) return;
    if (!firstUnreadRef.current) return;
    unreadScrollAppliedRef.current = true;
    jumpingRef.current = true;
    stickToBottomRef.current = false;
    requestAnimationFrame(() => {
      anchorUnreadDivider();
      settleUnreadAnchor();
    });
  }, [anchorUnreadDivider, firstUnreadId, historyReady, loading, settleUnreadAnchor]);

  // The "New" divider marks where you left off on open; once you've had a few
  // seconds to see it, drop it so it doesn't linger in the conversation.
  useEffect(() => {
    if (!firstUnreadId) return;
    stickToBottomRef.current = false;
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const delta = Math.round(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight);
      if (maxTop > 0 && delta <= 0) {
        scroller.scrollTop = Math.max(0, maxTop - 1);
      }
    });
    const t = setTimeout(() => setFirstUnreadId(null), 6000);
    return () => {
      clearTimeout(t);
      unreadScrollAppliedRef.current = false;
    };
  }, [firstUnreadId]);

  // Keep a jumped-to message highlighted until the user starts another action.
  useEffect(() => {
    if (!highlightId) return undefined;
    const clearHighlight = () => setHighlightId(null);
    document.addEventListener("pointerdown", clearHighlight);
    return () => document.removeEventListener("pointerdown", clearHighlight);
  }, [highlightId]);

  // Scroll to + highlight a jumped-to message (e.g. a forwarded
  // message's original), once it's present in the loaded history.
  const jumpHandledRef = useRef(null); // guards against re-running after the target lands
  const jumpLoadingRef = useRef(null); // guards against duplicate around-message requests
  useEffect(() => {
    if (!jumpMessageId || loading || !historyReady) return;
    if (jumpHandledRef.current === jumpMessageId) return;

    // While a jump is settling, suppress the scroll-up pagination: the pane
    // opens at the top (initial auto-scroll is deferred to us), so an animated
    // scroll would momentarily sit at scrollTop 0 and trigger loadOlder, whose
    // prepend would knock the target back out of view. We re-enable it shortly
    // after the (instant) scroll lands.
    const settleJump = () => {
      clearTimeout(jumpSettleRef.current);
      jumpSettleRef.current = setTimeout(() => {
        jumpingRef.current = false;
      }, 1500);
    };

    const scrollToTarget = () => {
      const el = document.querySelector(`.messages [data-mid="${jumpMessageId}"]`);
      if (!el) return false;
      const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      el.scrollIntoView({ block: "center", behavior });
      setHighlightId(jumpMessageId);
      return true;
    };

    if (!messages.some((message) => message.id === jumpMessageId)) {
      if (jumpLoadingRef.current === jumpMessageId) return;
      jumpLoadingRef.current = jumpMessageId;
      jumpingRef.current = true;
      api
        .getMessages(channel.id, { around: jumpMessageId })
        .then(({ messages: windowed }) => {
          if (!windowed.some((message) => message.id === jumpMessageId)) {
            setError("Couldn't locate that message.");
            onJumpConsumed?.();
            jumpingRef.current = false;
            return;
          }
          setMessages(windowed);
          onCacheMessages?.(channel.id, windowed);
        })
        .catch(() => {
          setError("Couldn't load that message.");
          onJumpConsumed?.();
          jumpingRef.current = false;
        });
      return;
    }

    jumpHandledRef.current = jumpMessageId;
    jumpLoadingRef.current = null;
    jumpingRef.current = true;
    if (scrollToTarget()) {
      onJumpConsumed?.();
      settleJump();
    } else {
      requestAnimationFrame(() => {
        if (scrollToTarget()) {
          onJumpConsumed?.();
          settleJump();
        } else {
          setError("Couldn't locate that message.");
          onJumpConsumed?.();
          jumpingRef.current = false;
        }
      });
    }
  }, [jumpMessageId, messages, channel.id, loading, historyReady]);

  // Open a specific thread on request (e.g. clicking a thread reply in Activity).
  // Mounting ThreadPanel marks the thread read, clearing it from Activity.
  useEffect(() => {
    if (!openThreadId) return;
    if (openThreadJumpMessageId) setThreadJumpTargetId(openThreadJumpMessageId);
    let cancelled = false;
    api
      .getThread(channel.id, openThreadId)
      .then(({ parent }) => {
        if (!cancelled && parent) setThread(parent);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) onThreadOpened?.();
      });
    return () => {
      cancelled = true;
    };
  }, [openThreadId, channel.id]);

  const isDm = channel.type === "dm";
  const dmUser = isDm ? usersById.get(channel.dmUserId) : null;
  const dmAvatarName = dmUser?.displayName || channel.dmName || "?";
  const dmLabel = channel.dmName || dmAvatarName;
  const dmAvatar = dmUser?.avatarUrl || null;
  const isMember = isDm || (channel.members || []).includes(user.id);
  const isCreator = !isDm && channel.createdBy === user.id;
  const remainingMembers = (channel.members || []).filter((memberId) => memberId !== user.id);
  const hasRemainingManager = (channel.managers || []).some(
    (managerId) => managerId !== user.id && remainingMembers.includes(managerId)
  );
  const needsManagerTransfer = isCreator && remainingMembers.length > 0 && !hasRemainingManager;
  const leaveCandidates = users
    .filter((candidate) => remainingMembers.includes(candidate.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const managerQuery = leaveManagerQuery.trim().toLowerCase();
  const visibleLeaveCandidates = leaveCandidates.filter(
    (candidate) =>
      !managerQuery ||
      candidate.displayName.toLowerCase().includes(managerQuery) ||
      candidate.username.toLowerCase().includes(managerQuery)
  );
  const canToggleVip = isDm && !!dmUser?.id && dmUser.id !== user.id;
  // #general is the default channel — everyone stays in it, so no Leave action.
  const isGeneral = (channel.name || "").toLowerCase() === "general";

  const typingNames = Object.values(typingUsers);
  const typingText =
    typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length === 2
      ? `${typingNames[0]} and ${typingNames[1]} are typing…`
      : typingNames.length >= 3
      ? `${typingNames[0]} and ${typingNames.length - 1} others are typing…`
      : "";

  const hasSidePanel = !!thread || showPinned;

  return (
    <main className={`channel-view ${hasSidePanel ? "has-side-panel" : ""}`}>
      <div className="channel-main" style={{ position: "relative" }}>
      {threadLightbox && (
        <LightboxImage
          src={threadLightbox.src}
          name={threadLightbox.name}
          onClose={() => setThreadLightbox(null)}
        />
      )}
      <header className="channel-header" data-testid="channel-header">
        {isDm ? (
          <>
            {canToggleVip && (
              <button
                type="button"
                className={`dm-vip-toggle ${isVip ? "active" : ""}`}
                data-testid="dm-vip-toggle"
                aria-label={isVip ? `Remove ${dmLabel} from VIP` : `Mark ${dmLabel} as VIP`}
                aria-pressed={isVip}
                title={isVip ? "Remove from VIP" : "Mark as VIP"}
                onClick={() => onToggleVip?.(dmUser.id)}
              >
                <StarIcon size={20} strokeWidth={1.9} fill={isVip ? "currentColor" : "none"} />
              </button>
            )}
            <Avatar name={dmAvatarName} src={dmAvatar} size={48} />
            <span className="ch-name" data-testid="channel-title">{dmLabel}</span>
          </>
        ) : (
          <>
            <button
              className="ch-name ch-name-btn"
              data-testid="channel-title"
              title="View channel details"
              onClick={() => { setThread(null); setThreadJumpTargetId(null); setShowMembers(false); setShowDetails(true); }}
            >
              {channel.type === "private" ? "🔒" : "#"} {channel.name}
            </button>
            {channel.topic && (
              <button className="ch-topic" data-testid="channel-topic" title="View channel details" onClick={() => { setThread(null); setThreadJumpTargetId(null); setShowMembers(false); setShowDetails(true); }}>
                {channel.topic}
              </button>
            )}
            <div className="header-actions">
              <button className="header-action header-action-icon" data-testid="channel-pinned" onClick={openPinnedPanel} title="Pinned messages" aria-label="Pinned messages">
                <PinIcon />
              </button>
              <button className="header-action header-action-icon" data-testid="channel-members" title="View members" onClick={() => { setThread(null); setThreadJumpTargetId(null); setShowDetails(false); setShowMembers(true); }}>
                <UsersRoundIcon size={16} strokeWidth={1.8} />
              </button>
              {channel.createdBy === user.id && channel.type === "private" && (
                <button
                  className="header-action header-action-visibility"
                  data-testid="channel-visibility"
                  title="Change who can join"
                  onClick={() => onChangeVisibility(channel, "public")}
                >
                  Make public
                </button>
              )}
              {!isGeneral && isMember && (
                <button
                  className="header-action header-action-icon leave"
                  data-testid="channel-leave"
                  title="Leave channel"
                  aria-label="Leave channel"
                  onClick={() => setConfirmLeave(true)}
                >
                  <LeaveIcon />
                  <span>Leave</span>
                </button>
              )}
            </div>
          </>
        )}
      </header>

      <div
        className="messages"
        ref={scrollerRef}
        onScroll={onMessagesScroll}
        onMouseLeave={(event) => {
          if (!menuFor && !event.relatedTarget?.closest?.("[data-message-actions]")) setActionsFor(null);
        }}
      >
        <div ref={messagesInnerRef}>
          {loadingOlder && <div className="older-loader">Loading earlier messages…</div>}
          {loading ? (
            <MessagesSkeleton />
          ) : messages.length === 0 ? (
            <div className="empty-state">
              {isDm ? (
                <>
                  <Avatar name={dmAvatarName} src={dmAvatar} size={56} />
                  <h3>{dmLabel}</h3>
                  <p>This is the start of your direct message history. Say hello! 👋</p>
                </>
              ) : (
                <>
                  <div className="empty-state-glyph">{channel.type === "private" ? "🔒" : "#"}</div>
                  <h3>{channel.name}</h3>
                  <p>This is the very beginning of the {channel.type === "private" ? "private " : ""}#{channel.name} channel. Say hello! 👋</p>
                </>
              )}
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              // A day divider whenever the calendar day changes (and at the top).
              const isNewDay = !prev || isDifferentDay(prev.createdAt, m.createdAt);
              const dayDivider = isNewDay ? (
                <div className="day-divider">
                  <span className="day-divider-label">{formatDayDivider(m.createdAt)}</span>
                </div>
              ) : null;

              if (m.kind === "system") {
                return (
                  <Fragment key={m.id}>
                    {dayDivider}
                    <SystemMessage m={m} />
                  </Fragment>
                );
              }
              return (
                <Fragment key={m.id}>
                  {dayDivider}
                  {m.id === firstUnreadId && (
                    <div className="new-divider" ref={firstUnreadRefCallback}>
                      <span className="new-divider-label">New</span>
                    </div>
                  )}
                  <Message
                    m={m}
                    grouped={false}
                    highlighted={highlightId === m.id}
                    currentUserId={user.id}
                    usersById={usersById}
                    renderMarkdown={renderMarkdown}
                    emojiMap={emojiMap}
                    canJumpToForward={canJumpToForward}
                    saved={savedIds?.has(m.id)}
                    onToggleSave={() => onToggleSave?.(m.id)}
                    onOpenProfile={onOpenProfile}
                    onOpenChannel={onOpenChannel}
                    showActions={actionsFor === m.id}
                    onActivate={() => {
                      setActionsFor(m.id);
                      setMenuFor((openId) => (openId && openId !== m.id ? null : openId));
                    }}
                    onDeactivate={() => setActionsFor((activeId) => (activeId === m.id ? null : activeId))}
                    editing={editing?.id === m.id ? editing : null}
                    menuOpen={menuFor === m.id}
                    onReact={(e) => openReact(m.id, e)}
                    onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
                    onOpenThread={() => { setShowDetails(false); setThreadJumpTargetId(null); setThread(m); }}
                    onForward={() => setForwarding(m)}
                    onJump={onJumpToMessage}
                    onToggleMenu={() => setMenuFor((id) => (id === m.id ? null : m.id))}
                    onCloseMenu={() => setMenuFor(null)}
                    onStartEdit={() => startEdit(m)}
                    onDelete={() => deleteMessage(m)}
                    onEditChange={(draft) => setEditing((e) => ({ ...e, draft }))}
                    onEditSave={saveEdit}
                    onEditCancel={() => setEditing(null)}
                    onTogglePin={() => togglePin(m)}
                    canPin={!isDm}
                  />
                </Fragment>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
        {newMessageCount > 0 && (
          <button
            type="button"
            className="new-messages-button"
            data-testid="new-messages-button"
            onClick={scrollToNewMessages}
          >
            {newMessageCount === 1 ? "1 new message" : `${newMessageCount} new messages`} ↓
          </button>
        )}
      </div>

      {reactingTo &&
        (() => {
          const r = reactingTo.rect;
          const PW = Math.min(reactingTo.expanded ? 352 : 252, window.innerWidth - 16);
          const PH = Math.min(reactingTo.expanded ? 435 : 132, window.innerHeight - 24);
          let left = Math.max(8, Math.min(r.left, window.innerWidth - PW - 8));
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

      {typingText && (
        <div className="typing-indicator">
          <span className="typing-dots"><i /><i /><i /></span>
          {typingText}
        </div>
      )}

      {!isMember && (
        <div className="join-bar">
          <span className="join-text">
            You're previewing <strong>#{channel.name}</strong>
          </span>
          <button className="join-btn" onClick={() => onJoin(channel)}>
            Join channel
          </button>
        </div>
      )}

      {isMember && (
        <Composer
          key={channel.id}
          channel={channel}
          users={users}
          channels={channels}
          customEmojis={customEmojis}
          mode={mode}
          onAddCustomEmoji={onAddCustomEmoji}
          onError={setError}
          onChannelUpdated={onChannelUpdated}
        />
      )}
      </div>

      {thread ? (
        <>
          <ThreadPanel
            channel={channel}
            root={thread}
            user={user}
            users={users}
            channels={channels}
            customEmojis={customEmojis}
            canJumpToForward={canJumpToForward}
            onJumpToMessage={onJumpToMessage}
            onForward={(m) => setForwarding(m)}
            onTogglePin={togglePin}
            canPin={!isDm}
            savedIds={savedIds}
            onToggleSave={onToggleSave}
            onOpenProfile={onOpenProfile}
            onOpenChannel={onOpenChannel}
            onAddCustomEmoji={onAddCustomEmoji}
            onClose={() => { setThread(null); setThreadJumpTargetId(null); setThreadLightbox(null); }}
            onThreadRead={onThreadRead}
            onChannelUpdated={onChannelUpdated}
            onOpenLightbox={(src, name) => setThreadLightbox({ src, name })}
            openThreadJumpMessageId={threadJumpTargetId || openThreadJumpMessageId}
          />
        </>
      ) : showMembers ? (
        <MembersPanel
          channel={{ ...channel, currentUserId: user.id }}
          users={users}
          onOpenProfile={onOpenProfile}
          onAddPeople={onAddPeople}
          onRemoveMember={onRemoveMember}
          onPromoteManager={onPromoteManager}
          onClose={() => setShowMembers(false)}
        />
      ) : showPinned ? (
        <PinnedPanel
          messages={pinnedMessages}
          renderMarkdown={renderMarkdown}
          emojiMap={emojiMap}
          onUnpin={(m) => togglePin(m)}
          onClose={() => setShowPinned(false)}
        />
      ) : showDetails ? (
        <ChannelDetailsPanel
          channel={channel}
          users={users}
          channels={channels}
          user={user}
          onAddPeople={onAddPeople}
          onPromoteManager={onPromoteManager}
          onUpdated={(updated) => onChannelUpdated?.(updated)}
          onOpenProfile={onOpenProfile}
          onClose={() => setShowDetails(false)}
        />
      ) : null}

      {forwarding && (
        <ForwardModal
          message={forwarding}
          channels={channels}
          dms={dms}
          users={users}
          onForward={forwardTo}
          onSuccess={(destinations) => {
            if (destinations.some((destination) => destination.kind === "user")) {
              onDmsChanged?.();
            }
            const first = destinations[0];
            const firstLabel = first?.kind === "channel" ? `#${first.label}` : first?.label;
            const remainder = destinations.length - 1;
            onToast?.(`Forwarded to ${firstLabel}${remainder > 0 ? ` and ${remainder} other${remainder === 1 ? "" : "s"}` : ""}`);
          }}
          onClose={() => setForwarding(null)}
        />
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

      {confirmLeave && needsManagerTransfer ? (
        <Modal title="Choose a manager before leaving" className="manager-modal" onClose={() => setConfirmLeave(false)}>
          <p className="settings-hint manager-modal-hint">
            Choose someone to manage members after you leave #{channel.name}.
          </p>
          {channel.type === "private" && (
            <p className="settings-hint leave-saved-warning">
              All messages you saved from this private channel will be removed from Saved.
            </p>
          )}
          <label className="manager-select-field">
            <span>New manager</span>
            <input
              className="people-filter"
              data-testid="leave-manager-search"
              value={leaveManagerQuery}
              onChange={(event) => setLeaveManagerQuery(event.target.value)}
              placeholder="Search people"
              autoFocus
            />
          </label>
          <div className="people-list manager-picker-list">
            {visibleLeaveCandidates.length === 0 ? (
              <div className="people-empty">No matching members.</div>
            ) : (
              visibleLeaveCandidates.map((candidate) => {
                const selected = leaveManagerId === candidate.id;
                return (
                  <div
                    className={`person-row manager-candidate ${selected ? "selected" : ""}`}
                    key={candidate.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    onClick={() => setLeaveManagerId(candidate.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setLeaveManagerId(candidate.id);
                      }
                    }}
                  >
                    <Avatar name={candidate.displayName} src={candidate.avatarUrl} size={32} />
                    <div className="person-info">
                      <div className="person-name">{candidate.displayName}</div>
                      <div className="person-handle">@{candidate.username}</div>
                    </div>
                    {selected && (
                      <span className="manager-selected-check" aria-label="Selected manager">✓</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setConfirmLeave(false)}>Cancel</button>
            <button
              type="button"
              className="btn-danger"
              disabled={!leaveManagerId}
              onClick={() => {
                setConfirmLeave(false);
                onLeave(channel, leaveManagerId);
              }}
            >
              Transfer & leave
            </button>
          </div>
        </Modal>
      ) : confirmLeave && isCreator && remainingMembers.length === 0 ? (
        <ConfirmDialog
          title={`Delete #${channel.name}?`}
          message={channel.type === "private"
            ? "This channel has no other members. Deleting it will archive its history and remove all messages you saved from it."
            : "This channel has no other members. Deleting it will archive its history."}
          confirmLabel="Delete channel"
          danger
          onConfirm={() => {
            setConfirmLeave(false);
            onDeleteChannel?.(channel);
          }}
          onCancel={() => setConfirmLeave(false)}
        />
      ) : confirmLeave && (
        <ConfirmDialog
          title={`Leave #${channel.name}?`}
          message={channel.type === "private"
            ? "You'll stop receiving messages from this channel. All messages you saved from it will be removed from Saved."
            : "You'll stop receiving messages from this channel. You can rejoin later if it's public."}
          confirmLabel="Leave"
          danger
          onConfirm={() => {
            setConfirmLeave(false);
            onLeave(channel);
          }}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </main>
  );
}

function PinnedPanel({ messages, renderMarkdown, emojiMap, onUnpin, onClose }) {
  return (
    <aside className="side-panel pinned-panel">
      <div className="panel-header">
        <span className="panel-title">Pinned messages</span>
        <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="panel-body">
        {messages.length === 0 ? (
          <p className="pinned-empty">No pinned messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="pinned-item">
              <div className="pinned-item-meta">
                <strong>{m.author?.displayName || "Unknown"}</strong>
              </div>
              <div
                className="pinned-item-body markdown"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body || "") }}
              />
              <button className="pinned-unpin" data-testid={`pinned-${m.id}-unpin`} onClick={() => onUnpin(m)} title="Unpin">
                Unpin
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
