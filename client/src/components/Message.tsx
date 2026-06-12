import { useState } from "react";
import Avatar from "./Avatar.js";
import Attachments from "./Attachments.js";
import { formatTime } from "../lib/time.js";
import {
  ShareIcon, EmojiAddIcon, ReplyIcon, BookmarkIcon, PencilIcon, TrashIcon, PinIcon, CopyIcon,
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
export default function Message({
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
  showActions, // is this message's hover toolbar the active (only) one?
  onActivate, // mark this message as the active one (mouse entered it)
  onOpenLightbox, // (src, name) => open image in a side panel (when in thread)
  onTogglePin,
}) {
  const isMine = m.author?.id === currentUserId;
  const actionsVisible = showActions;
  const [copied, setCopied] = useState(false);

  // Open a profile when an @mention pill in the rendered body is clicked.
  function onBodyClick(e) {
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

  return (
    <div
      className={`message ${grouped ? "grouped" : ""} ${highlighted ? "flash" : ""}`}
      data-mid={m.id}
      onMouseEnter={onActivate}
    >
      <div className="avatar-slot">
        {grouped ? (
          <span className="grouped-time">{formatTime(m.createdAt)}</span>
        ) : (
          <button
            type="button"
            className="avatar-btn"
            title={`View ${m.author?.displayName || "profile"}`}
            onClick={() => m.author?.id && onOpenProfile?.(m.author.id)}
          >
            <Avatar name={m.author?.displayName || "?"} src={m.author?.avatarUrl} size={36} />
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
              dir="auto"
              onClick={() => m.author?.id && onOpenProfile?.(m.author.id)}
            >
              {m.author?.displayName || "unknown"}
            </button>
            <span className="time">{formatTime(m.createdAt)}</span>
          </div>
        )}

        {m.forwardedFrom && (
          <div className="forwarded-label">
            <ShareIcon />
            <span>
              Forwarded from {m.forwardedFrom.authorName} in {m.forwardedFrom.channelName}
            </span>
            {m.forwardedFrom.messageId &&
              (canJumpToForward?.(m.forwardedFrom) ? (
                <button type="button" className="forwarded-link" onClick={() => onJump?.(m.forwardedFrom)}>
                  View original →
                </button>
              ) : m.forwardedFrom.channelType === "public" ? (
                // A public original we can't reach (e.g. left/archived).
                <span
                  className="forwarded-noaccess"
                  title="You don't have access to the channel this was forwarded from"
                >
                  · original not accessible
                </span>
              ) : null)}
            {/* DM / private originals are snapshot-only — no link back. */}
          </div>
        )}

        {editing ? (
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
              <button type="button" className="btn-primary" disabled={!editing.draft.trim()} onClick={onEditSave}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="body markdown" dir="auto" onClick={onBodyClick}>
            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(m.body) }} />
            {m.editedAt && <span className="edited-label" title={formatTime(m.editedAt)}> (edited)</span>}
          </div>
        )}

        {m.attachments?.length > 0 && <Attachments attachments={m.attachments} onOpenLightbox={onOpenLightbox} />}

        {m.reactions?.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction ${r.users.includes(currentUserId) ? "mine" : ""}`}
                onClick={() => onToggleReaction(r.emoji)}
                data-tip={reactionTip(r.users, usersById, currentUserId, r.emoji)}
              >
                <span className="reaction-emoji">
                  <EmojiValue value={r.emoji} emojiMap={emojiMap} />
                </span>
                <span className="reaction-count">{r.users.length}</span>
              </button>
            ))}
            <button className="reaction add react-toggle" title="Add reaction" onClick={onReact}>
              <EmojiAddIcon />
            </button>
          </div>
        )}

        {!inThread && m.replyCount > 0 && (
          <button className="thread-indicator" onClick={onOpenThread}>
            <ReplyIcon />
            {m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      <div className={`msg-actions ${actionsVisible ? "visible" : ""}`}>
        <button className="react-toggle" title="Add reaction" onClick={onReact}>
          <EmojiAddIcon />
        </button>
        {!inThread && (
          <button title="Reply in thread" onClick={onOpenThread}>
            <ReplyIcon />
          </button>
        )}
        <button title="Forward message" onClick={onForward}>
          <ShareIcon />
        </button>
        <button
          title={copied ? "Copied message" : "Copy message"}
          className={copied ? "copied-active" : ""}
          onClick={copyMessage}
        >
          <CopyIcon />
        </button>
        <button
          title={m.pinnedAt ? "Unpin message" : "Pin message"}
          className={m.pinnedAt ? "pin-active" : ""}
          onClick={onTogglePin}
        >
          <PinIcon />
        </button>
        <button
          title={saved ? "Remove from saved" : "Save for later"}
          className={saved ? "saved-active" : ""}
          onClick={onToggleSave}
        >
          <BookmarkIcon />
        </button>
        {isMine && (
          <>
            <button title="Edit message" onClick={onStartEdit}>
              <PencilIcon />
            </button>
            <button title="Delete message" className="act-danger" onClick={onDelete}>
              <TrashIcon />
            </button>
          </>
        )}
      </div>
    </div>
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
  if (url) return <img className="custom-emoji" src={url} alt={value} />;
  return value;
}
