import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatDateTime } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import Avatar from "./Avatar.js";
import { BookmarkIcon } from "./Icons.js";
import { FeedContent, FeedLayout, FeedMessage } from "./FeedLayout.js";

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
    <FeedLayout title="Saved" subtitle="Messages you've saved for later" testId="saved">
      <FeedContent
        loading={loading}
        items={items}
        emptyTitle="Nothing saved yet"
        emptyMessage="Hover a message and hit the bookmark to save it for later."
      >
        {items.map((it) => (
          <div
            key={it.id}
            className="activity-item"
            data-testid="saved-item"
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
            <Avatar name={it.author?.displayName || "?"} src={it.author?.avatarUrl} size={36} />
            <div className="content">
              <FeedMessage
                author={it.author?.displayName || "unknown"}
                context={`${it.channelType === "dm" ? `in your DM with ${it.channelName}` : `in #${it.channelName}`}${it.threadId ? " · thread" : ""}`}
                time={formatDateTime(it.createdAt)}
                body={it.body}
                renderMarkdown={renderMarkdown}
              />
            </div>
            <button
              type="button"
              className="saved-remove saved-active"
              data-testid={`saved-remove-${it.id}`}
              title="Remove from saved"
              aria-label="Remove from saved"
              onClick={(event) => unsave(event, it)}
            >
              <BookmarkIcon />
            </button>
          </div>
        ))}
      </FeedContent>
    </FeedLayout>
  );
}
