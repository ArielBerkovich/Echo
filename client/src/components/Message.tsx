import { memo, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Avatar from "./Avatar.js";
import Attachments from "./Attachments.js";
import { useAuthUrl } from "../lib/useAuthUrl.js";
import { formatTime } from "../lib/time.js";
import {
  ShareIcon, EmojiAddIcon, ReplyIcon, BookmarkIcon, PencilIcon, TrashIcon, PinIcon, CopyIcon, MoreIcon,
} from "./Icons.js";

// A "joined the channel" / "created this channel" log line.
export function SystemMessage({ m }) {
  return (
    <div className="system-msg">
      <span className="system-text">
        <strong>{m.author?.displayName || "Someone"}</strong> {m.body}
      </span>
      <span className="system-time">{formatTime(m.createdAt)}</span>
    </div>
  );
}

// A single channel message: header, forwarded banner, body (or inline editor),
// attachments, reactions, thread indicator, hover actions, and the edit/delete
// menu. All behaviour is delegated to handlers passed by the parent.
function Message({
  m,
  grouped,
  highlighted,
  currentUserId,
  usersById,
  renderMarkdown,
  emojiMap,
  canJumpToForward,
  inThread, // inside a thread: hide the reply-count indicator + "reply in thread" action
  saved, // is this message saved/bookmarked by the current user?
  onToggleSave,
  editing, // the edit draft for this message, or null
  menuOpen,
  onReact,
  onToggleReaction,
  onOpenThread,
  onForward,
  onJump,
  onToggleMenu,
  onCloseMenu,
  onStartEdit,
  onDelete,
  onEditChange,
  onEditSave,
  onEditCancel,
  onOpenProfile, // (idOrUsername) => open a user's profile card
  onOpenChannel, // (channelName) => open a public channel from a #tag
  showActions, // is this message's hover toolbar the active (only) one?
  onActivate, // mark this message as the active one (mouse entered it)
  onDeactivate, // hide the toolbar when leaving both the message and its portal
  onOpenLightbox, // (src, name) => open image in a side panel (when in thread)
  onTogglePin,
  onIssuePasswordHelp,
  canPin = true,
}) {
  const isMine = m.author?.id === currentUserId;
  const actionsVisible = showActions;
  const [copied, setCopied] = useState(false);
  const [issuingPassword, setIssuingPassword] = useState(false);
  const [passwordActionError, setPasswordActionError] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);
  const [actionsPosition, setActionsPosition] = useState(null);
  const messageRef = useRef(null);
  const actionsRef = useRef(null);
  const menuRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const mid = m.id;
  // Messages carry an author snapshot, but profile changes arrive separately
  // over the realtime user:update event. Resolve the latest directory entry so
  // an already-open conversation updates without waiting for a new message.
  const author = usersById?.get(m.author?.id) || m.author;
  const messageBody = editing ? (
    <div className="msg-edit">
      <textarea
        className="msg-edit-input"
        value={editing.draft}
        autoFocus
        rows={Math.min(8, editing.draft.split("\n").length + 1)}
        onChange={(e) => onEditChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEditSave();
          } else if (e.key === "Escape") {
            onEditCancel();
          }
        }}
      />
      <div className="msg-edit-actions">
        <button type="button" className="btn-secondary" onClick={onEditCancel}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!editing.draft.trim()} onClick={onEditSave}>Save</button>
      </div>
    </div>
  ) : (
    <div className="body markdown" dir="auto" onClick={onBodyClick}>
      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} />
      {m.editedAt && <span className="edited-label" title={formatTime(m.editedAt)}> (edited)</span>}
    </div>
  );

  const messageAttachments = m.attachments?.length > 0
    ? <Attachments attachments={m.attachments} onOpenLightbox={onOpenLightbox} />
    : null;

  useLayoutEffect(() => {
    if (!actionsVisible) {
      setActionsPosition(null);
      return undefined;
    }
    const measure = () => {
      const message = messageRef.current;
      if (!message) return;
      const rect = message.getBoundingClientRect();
      setActionsPosition({
        top: rect.top + 2,
        right: window.innerWidth - rect.right + 18,
      });
    };
    const frame = requestAnimationFrame(measure);
    const scrollViewport = messageRef.current?.closest(".messages, .thread-body");
    window.addEventListener("resize", measure);
    scrollViewport?.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      scrollViewport?.removeEventListener("scroll", measure);
    };
  }, [actionsVisible]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return undefined;
    }
    const measure = () => {
      const menu = menuRef.current;
      const trigger = menuTriggerRef.current;
      if (!menu || !trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const padding = 8;
      const gap = 6;
      const left = Math.min(
        Math.max(padding, triggerRect.right - menuRect.width),
        window.innerWidth - menuRect.width - padding
      );
      setMenuPosition({ top: triggerRect.bottom + gap, left });
    };
    const frame = requestAnimationFrame(measure);
    const scrollViewport = menuTriggerRef.current?.closest(".messages, .thread-body");
    window.addEventListener("resize", measure);
    scrollViewport?.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      scrollViewport?.removeEventListener("scroll", measure);
    };
  }, [menuOpen]);

  // Open a profile when an @mention pill in the rendered body is clicked.
  function onBodyClick(e) {
    const channelTag = e.target.closest?.(".channel-tag[data-channel-tag]");
    if (channelTag) {
      e.preventDefault();
      onOpenChannel?.(channelTag.dataset.channelTag);
      return;
    }
    const pill = e.target.closest?.(".mention[data-mention]");
    if (pill) {
      e.preventDefault();
      onOpenProfile?.(pill.dataset.mention);
    }
  }

  async function copyMessage() {
    const text = String(m.body || "");
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  async function issuePasswordAndReply() {
    if (!onIssuePasswordHelp || issuingPassword) return;
    setIssuingPassword(true);
    setPasswordActionError("");
    try {
      await onIssuePasswordHelp();
    } catch (error) {
      setPasswordActionError(error.message);
    } finally {
      setIssuingPassword(false);
    }
  }

  return (
    <div
      className={`message ${grouped ? "grouped" : ""} ${highlighted ? "flash" : ""} ${menuOpen ? "menu-open" : ""}`}
      ref={messageRef}
      data-mid={m.id}
      data-testid={`message-${mid}`}
      onMouseEnter={onActivate}
      onContextMenu={(event) => {
        if (window.matchMedia("(max-width: 760px)").matches) {
          event.preventDefault();
          onForward?.();
        }
      }}
      onMouseLeave={(event) => {
        const related = event.relatedTarget;
        if (!(related instanceof Node) || !actionsRef.current?.contains(related)) {
          onDeactivate?.();
        }
      }}
    >
      <div className="avatar-slot">
        {grouped ? (
          <span className="grouped-time">{formatTime(m.createdAt)}</span>
        ) : (
          <button
            type="button"
            className="avatar-btn"
            data-testid={`message-${mid}-avatar`}
            title={`View ${author?.displayName || "profile"}`}
            onClick={() => m.author?.id && onOpenProfile?.(m.author.id)}
          >
            <Avatar name={author?.displayName || "?"} src={author?.avatarUrl} size={36} />
          </button>
        )}
      </div>

      <div className="content">
        {m.pinnedAt && (
          <div className="pinned-indicator">
            <PinIcon /> Pinned
          </div>
        )}
        {!grouped && (
          <div className="meta">
            <button
              type="button"
              className="author author-btn"
              data-testid={`message-${mid}-author`}
              dir="auto"
              onClick={() => m.author?.id && onOpenProfile?.(m.author.id)}
            >
              {author?.displayName || "unknown"}
            </button>
            <span className="time">{formatTime(m.createdAt)}</span>
          </div>
        )}

        {m.forwardNote && (
          <div className="forward-note markdown" dir="auto">
            {m.forwardNote}
          </div>
        )}

        {m.forwardedFrom ? (
          <>
            {m.forwardNote && <div className="forward-divider" aria-hidden="true" />}
            <div className="forwarded-message-card">
              <div className="forwarded-label">
                <ShareIcon />
                <Avatar name={m.forwardedFrom.authorName || "unknown"} src={m.forwardedFrom.authorAvatarUrl || null} size={28} />
                <span>
                  <span className="forwarded-card-origin">
                    <strong className="forwarded-original-author">{m.forwardedFrom.authorName}</strong> in {m.forwardedFrom.channelName}
                  </span>
                </span>
                {m.forwardedFrom.messageId && (canJumpToForward?.(m.forwardedFrom) ? (
                  <button type="button" className="forwarded-link" onClick={(event) => { event.currentTarget.blur(); onJump?.(m.forwardedFrom); }}>
                    View original →
                  </button>
                ) : m.forwardedFrom.channelType === "public" ? (
                  <span className="forwarded-noaccess" title="You don't have access to the channel this was forwarded from">· original not accessible</span>
                ) : null)}
              </div>
              <div className="forwarded-message-label">Forwarded message</div>
              {messageBody}
              {messageAttachments}
            </div>
          </>
        ) : (
          <>
            {messageBody}
            {messageAttachments}
          </>
        )}

        {m.passwordHelpRequest && usersById?.get(currentUserId)?.isAdmin && (
          <div className="password-help-action">
            {m.passwordHelpRequest.status === "issued" ? (
              <span className="password-help-issued">One-time password issued and posted below ✓</span>
            ) : (
              <button
                type="button"
                className="btn-primary"
                data-testid={`message-${mid}-issue-password`}
                disabled={issuingPassword || m.passwordHelpRequest.status === "issuing"}
                onClick={issuePasswordAndReply}
              >
                {issuingPassword || m.passwordHelpRequest.status === "issuing"
                  ? "Issuing…"
                  : `Issue OTP for @${m.passwordHelpRequest.username} and reply`}
              </button>
            )}
            {passwordActionError && <span className="error small">{passwordActionError}</span>}
          </div>
        )}

        {m.reactions?.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction ${r.users.includes(currentUserId) ? "mine" : ""}`}
                data-testid={`message-${mid}-reaction-${String(r.emoji).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                onClick={() => onToggleReaction(r.emoji)}
                data-tip={reactionTip(r.users, usersById, currentUserId, r.emoji)}
              >
                <span className="reaction-emoji">
                  <EmojiValue value={r.emoji} emojiMap={emojiMap} />
                </span>
                <span className="reaction-count">{r.users.length}</span>
              </button>
            ))}
            <button className="reaction add react-toggle" data-testid={`message-${mid}-add-reaction`} title="Add reaction" onClick={onReact}>
              <EmojiAddIcon />
            </button>
          </div>
        )}

        {!inThread && m.replyCount > 0 && (
          <button className="thread-indicator" data-testid={`message-${mid}-reply-count`} onClick={onOpenThread}>
            <ReplyIcon />
            {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {actionsVisible && createPortal(
        <div
          ref={actionsRef}
          className="msg-actions visible"
          data-message-actions="true"
          data-testid={`message-${mid}-actions`}
          style={actionsPosition ? {
            position: "fixed",
            top: actionsPosition.top,
            right: actionsPosition.right,
          } : { visibility: "hidden" }}
          onMouseEnter={onActivate}
          onMouseLeave={(event) => {
            const related = event.relatedTarget;
            if (!(related instanceof Node) || !messageRef.current?.contains(related)) {
              onDeactivate?.();
            }
          }}
        >
          <button className="react-toggle" data-testid={`message-${mid}-add-reaction-action`} title="Add reaction" onClick={onReact}>
            <EmojiAddIcon />
          </button>
          {!inThread && (
            <button data-testid={`message-${mid}-reply`} title="Reply in thread" onClick={onOpenThread}>
              <ReplyIcon />
            </button>
          )}
          <button data-testid={`message-${mid}-forward`} title="Forward message" onClick={onForward}>
            <ShareIcon />
          </button>
          <button
            type="button"
            data-testid={`message-${mid}-more`}
            title="More message actions"
            aria-label="More message actions"
            aria-expanded={menuOpen}
            className={menuOpen ? "active" : ""}
            onClick={onToggleMenu}
            ref={menuTriggerRef}
          >
            <MoreIcon />
          </button>
        </div>,
        document.body
      )}

      {menuOpen && createPortal(
        <>
          <div className="menu-overlay" onMouseDown={onCloseMenu} />
          <div
            ref={menuRef}
            className="msg-menu menu-fixed"
            style={menuPosition || { visibility: "hidden" }}
            role="menu"
            aria-label="Message actions"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" role="menuitem" data-testid={`message-${mid}-copy`} onClick={() => { copyMessage(); onCloseMenu(); }}>
              <CopyIcon /> Copy message
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid={`message-${mid}-save`}
              className={saved ? "active" : ""}
                onClick={() => { onToggleSave(); onCloseMenu(); }}
            >
              <BookmarkIcon /> {saved ? "Remove from saved" : "Save for later"}
            </button>
            <button type="button" role="menuitem" data-testid={`message-${mid}-forward-menu`} onClick={() => { onForward(); onCloseMenu(); }}>
              <ShareIcon /> Forward message
            </button>
            {canPin && (
              <button
                type="button"
                role="menuitem"
                data-testid={`message-${mid}-pin`}
                className={m.pinnedAt ? "active" : ""}
                onClick={() => { onTogglePin(); onCloseMenu(); }}
              >
                <PinIcon /> {m.pinnedAt ? "Unpin message" : "Pin message"}
              </button>
            )}
            {isMine && (
              <>
                <button type="button" role="menuitem" data-testid={`message-${mid}-edit`} onClick={() => { onStartEdit(); onCloseMenu(); }}>
                  <PencilIcon /> Edit message
                </button>
                <button type="button" role="menuitem" data-testid={`message-${mid}-delete`} className="danger" onClick={() => { onDelete(); onCloseMenu(); }}>
                  <TrashIcon /> Delete message
                </button>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default memo(Message, areMessagePropsEqual);

function areMessagePropsEqual(prev, next) {
  return (
    prev.m === next.m &&
    prev.grouped === next.grouped &&
    prev.highlighted === next.highlighted &&
    prev.currentUserId === next.currentUserId &&
    prev.usersById === next.usersById &&
    prev.renderMarkdown === next.renderMarkdown &&
    prev.emojiMap === next.emojiMap &&
    prev.canJumpToForward === next.canJumpToForward &&
    prev.inThread === next.inThread &&
    prev.saved === next.saved &&
    prev.editing === next.editing &&
    prev.menuOpen === next.menuOpen &&
    prev.showActions === next.showActions
  );
}

// "Who reacted" text, e.g. "Alice, Bob and you reacted with 🎉".
function reactionTip(userIds = [], usersById, currentUserId, emoji) {
  const byId = usersById || new Map();
  const others = [];
  let includesMe = false;
  for (const id of userIds) {
    if (id === currentUserId) includesMe = true;
    else others.push(byId.get(id)?.displayName || "Someone");
  }
  const names = includesMe ? [...others, "you"] : others; // keep "you" last
  let who;
  if (names.length === 0) who = "Someone";
  else if (names.length === 1) who = names[0];
  else if (names.length === 2) who = `${names[0]} and ${names[1]}`;
  else who = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who} reacted with ${emoji}`;
}

// A reaction value: a native emoji char, or a custom-emoji image for a known
// ":shortcode:".
function EmojiValue({ value, emojiMap }) {
  const m = /^:([a-z0-9_+.-]+):$/i.exec(value || "");
  const url = m && emojiMap.get(m[1].toLowerCase());
  const authUrl = useAuthUrl(url);
  if (authUrl) return <img className="custom-emoji" src={authUrl} alt={value} />;
  return value;
}
