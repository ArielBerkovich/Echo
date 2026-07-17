import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
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

  async function dismiss(item) {
    await api.deleteActivity(item.id);
    setItems((previous) => {
      const next = previous.filter((candidate) => candidate.id !== item.id);
      onLoaded?.(next);
      return next;
    });
  }

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
            <div
              key={it.id}
              className={`activity-item ${it.unread ? "unread" : ""}`}
              data-testid="activity-item"
              role="button"
              tabIndex={0}
              onClick={() => onJump(it)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onJump(it);
                }
              }}
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
              <button
                type="button"
                className="activity-dismiss"
                title="Delete activity"
                aria-label="Delete activity"
                onClick={(event) => {
                  event.stopPropagation();
                  dismiss(it).catch(() => {});
                }}
              >
                <Trash2Icon size={15} strokeWidth={1.8} />
              </button>
            </div>
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
