import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatDateTime } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import Avatar from "./Avatar.js";
import { BookmarkIcon } from "./Icons.js";

// Feed of the current user's saved ("save for later") messages. Clicking a row
// jumps to the message; the bookmark removes it from saved.
export default function SavedFeed({ user, users = [], customEmojis = [], onJump, onUnsave }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis);

  useEffect(() => {
    let cancelled = false;
    api
      .getSaved()
      .then(({ items }) => !cancelled && setItems(items))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
  }, []);

  async function unsave(e, it) {
    e.stopPropagation(); // don't trigger the row's jump
    setItems((prev) => prev.filter((m) => m.id !== it.id));
    try {
      await api.toggleSaved(it.id);
      onUnsave?.(it.id);
    } catch {
      /* leave the optimistic removal; a reload will re-sync */
    }
  }

  return (
    <main className="channel-view">
      <div className="channel-main">
        <header className="channel-header" data-testid="saved-header">
          <span className="ch-name">Saved</span>
          <span className="ch-meta">Messages you've saved for later</span>
        </header>
        <div className="messages activity-list" data-testid="saved-list">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing saved yet</h3>
              <p>Hover a message and hit the bookmark to save it for later.</p>
            </div>
          ) : (
            items.map((it) => (
              <button key={it.id} className="activity-item" data-testid="saved-item" onClick={() => onJump(it)}>
                <Avatar name={it.author?.displayName || "?"} src={it.author?.avatarUrl} size={36} />
                <div className="content">
                  <div className="meta">
                    <span className="author">{it.author?.displayName || "unknown"}</span>
                    <span className="activity-where">
                      {it.channelType === "dm" ? `in your DM with ${it.channelName}` : `in #${it.channelName}`}
                      {it.threadId ? " · thread" : ""}
                    </span>
                    <span className="time">{formatDateTime(it.createdAt)}</span>
                  </div>
                  {it.body && (
                    <div
                      className="body markdown"
                      dir="auto"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(it.body) }}
                    />
                  )}
                </div>
                <span
                  className="saved-remove saved-active"
                  data-testid={`saved-remove-${it.id}`}
                  title="Remove from saved"
                  role="button"
                  onClick={(e) => unsave(e, it)}
                >
                  <BookmarkIcon />
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
