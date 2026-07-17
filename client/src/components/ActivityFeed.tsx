import { useEffect, useState } from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { formatDateTime } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import Avatar from "./Avatar.js";

// Feed of messages that @mention the current user. Clicking jumps to the channel.
export default function ActivityFeed({ user, users = [], customEmojis = [], onJump, onLoaded }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Viewing the panel clears reaction unread, so do that before fetching.
      await api.markActivityRead().catch(() => {});
      try {
        const { items } = await api.getActivity();
        if (cancelled) return;
        setItems(items);
        onLoaded?.(items);
      } catch {
        /* keep prior items */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    // Live-refresh while the panel is open (new mentions, replies, reactions).
    const socket = getSocket();
    const onBump = () => load();
    socket.on("activity:bump", onBump);
    return () => {
      cancelled = true;
      socket.off("activity:bump", onBump);
    };
  }, []);

  return (
    <main className="channel-view">
      <div className="channel-main">
      <header className="channel-header" data-testid="activity-header">
        <span className="ch-name">Activity</span>
        <span className="ch-meta">Mentions, replies & broadcasts · last 30 days</span>
      </header>
      <div className="messages activity-list" data-testid="activity-list">
        {loading ? (
          <div className="empty-state"><p>Loading…</p></div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3>No activity yet</h3>
            <p>When someone @mentions you, it'll show up here.</p>
          </div>
        ) : (
          items.map((it) => (
            <button
              key={it.id}
              className={`activity-item ${it.unread ? "unread" : ""}`}
              data-testid="activity-item"
              onClick={() => onJump(it)}
            >
              {it.unread && <span className="activity-unread-dot" aria-label="Unread" />}
              <Avatar name={it.author?.displayName || "?"} src={it.author?.avatarUrl} size={36} />
              <div className="content">
                <div className="meta">
                  <span className="author">{it.author?.displayName || "unknown"}</span>
                  <span className="activity-where">
                    {it.kind === "channel_add"
                      ? `added you to #${it.channelName}`
                      : it.kind === "channel_remove"
                      ? `removed you from #${it.channelName}`
                      : `${kindLabel(it)} ${it.channelType === "dm" ? "in a DM" : `in #${it.channelName}`}`}
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
            </button>
          ))
        )}
      </div>
      </div>
    </main>
  );
}

function kindLabel(it) {
  if (it.kind === "broadcast") return "📣 notified the channel";
  if (it.kind === "reply") return "replied in a thread";
  if (it.kind === "reaction") return `reacted ${it.emoji || ""} to your message`;
  return "mentioned you";
}
