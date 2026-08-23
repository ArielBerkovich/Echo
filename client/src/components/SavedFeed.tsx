import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { queryKeys } from "../lib/queryClient.js";
import { formatDateTime } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import Avatar from "./Avatar.js";
import { BookmarkIcon } from "./Icons.js";
import { FeedContent, FeedLayout, FeedMessage } from "./FeedLayout.js";

// Feed of the current user's saved ("save for later") messages. Clicking a row
// jumps to the message; the bookmark removes it from saved.
export default function SavedFeed({ user, users = [], customEmojis = [], onJump, onUnsave }) {
  const queryClient = useQueryClient();
  const restoreFocusAfterUnsaveRef = useRef(false);
  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis);
  const { data: items = [], isPending: loading } = useQuery({
    queryKey: queryKeys.saved,
    queryFn: async () => (await api.getSaved()).items || [],
  });
  const unsaveMutation = useMutation({
    mutationFn: (messageId) => api.toggleSaved(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.saved });
      const previous = queryClient.getQueryData(queryKeys.saved);
      queryClient.setQueryData(queryKeys.saved, (current = []) =>
        current.filter((message) => message.id !== messageId)
      );
      return { previous };
    },
    onError: (_error, _messageId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.saved, context.previous);
    },
    onSuccess: (_result, messageId) => onUnsave?.(messageId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.saved }),
  });

  useEffect(() => {
    if (!restoreFocusAfterUnsaveRef.current) return;
    restoreFocusAfterUnsaveRef.current = false;
    const target = document.querySelector('[data-testid="saved-item"]')
      || document.querySelector('[data-testid="saved-header"]');
    target?.focus();
  }, [items]);

  function unsave(e, it) {
    e.stopPropagation(); // don't trigger the row's jump
    restoreFocusAfterUnsaveRef.current = true;
    unsaveMutation.mutate(it.id);
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
              if (event.currentTarget !== event.target) return;
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
              className="saved-remove saved-active feed-icon-action"
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
