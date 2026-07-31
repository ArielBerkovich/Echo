import { useEffect, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { formatDateTime } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import Avatar from "./Avatar.js";
import { FeedContent, FeedLayout, FeedMessage } from "./FeedLayout.js";

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
    <FeedLayout title="Activity" subtitle="Mentions, replies & broadcasts · last 30 days" testId="activity">
      <FeedContent
        loading={loading}
        items={items}
        emptyTitle="No activity yet"
        emptyMessage="When someone @mentions you, it'll show up here."
      >
        {items.map((it) => (
          <div
            key={it.id}
            className={`activity-item ${it.unread ? "unread" : ""}`}
            data-testid="activity-item"
            data-activity-kind={it.kind}
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
              <FeedMessage
                author={it.author?.displayName || "unknown"}
                context={activityContext(it)}
                time={formatDateTime(it.createdAt)}
                body={it.body}
                renderMarkdown={renderMarkdown}
              />
            </div>
            <button
              type="button"
              className="activity-dismiss"
              data-testid={`activity-delete-${it.id}`}
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
        ))}
      </FeedContent>
    </FeedLayout>
  );
}

function kindLabel(it) {
  if (it.kind === "broadcast") return "📣 notified the channel";
  if (it.kind === "reply") return "replied in a thread";
  if (it.kind === "reaction") return `reacted ${it.emoji || ""} to your message`;
  return "mentioned you";
}

function activityContext(item) {
  if (item.kind === "channel_add") return `added you to #${item.channelName}`;
  if (item.kind === "channel_remove") return `removed you from #${item.channelName}`;
  const location = item.channelType === "dm" ? "in a DM" : `in #${item.channelName}`;
  return `${kindLabel(item)} ${location}`;
}
