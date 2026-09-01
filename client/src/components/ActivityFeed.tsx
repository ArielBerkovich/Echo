import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { formatDateTime } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import { queryKeys } from "../lib/queryClient.js";
import Avatar from "./Avatar.js";
import ConfirmDialog from "./ConfirmDialog.js";
import { FeedContent, FeedLayout, FeedMessage } from "./FeedLayout.js";

// Feed of messages that @mention the current user. Clicking jumps to the channel.
export default function ActivityFeed({ user, users = [], customEmojis = [], onJump, onLoaded, onReady }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const restoreFocusAfterDismissRef = useRef(false);
  const readyRef = useRef(false);
  const queryClient = useQueryClient();
  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis);
  const { data: items = [], isPending: loading, isSuccess } = useQuery({
    queryKey: queryKeys.activity,
    queryFn: async () => (await api.getActivity()).items || [],
  });
  const dismissMutation = useMutation({
    mutationFn: (itemIds) => Promise.all(itemIds.map((itemId) => api.deleteActivity(itemId))),
    onMutate: async (itemIds) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.activity });
      const previous = queryClient.getQueryData(queryKeys.activity);
      queryClient.setQueryData(queryKeys.activity, (current = []) =>
        current.filter((item) => !itemIds.includes(item.id))
      );
      return { previous };
    },
    onError: (_error, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.activity, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
  });
  const displayItems = groupReactionActivities(items);
  const clearMutation = useMutation({
    mutationFn: () => api.clearActivity(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.activity });
      const previous = queryClient.getQueryData(queryKeys.activity);
      queryClient.setQueryData(queryKeys.activity, []);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.activity, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
  });

  useEffect(() => {
    onLoaded?.(items);
  }, [items]);

  useEffect(() => {
    if (!isSuccess || readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  }, [isSuccess]);

  useEffect(() => {
    if (!restoreFocusAfterDismissRef.current) return;
    restoreFocusAfterDismissRef.current = false;
    const target = document.querySelector('[data-testid="activity-item"]')
      || document.querySelector('[data-testid="activity-header"]');
    target?.focus();
  }, [items]);

  useEffect(() => {
    // Live-refresh while the panel is open (new mentions, replies, reactions).
    const socket = getSocket();
    const onBump = () => queryClient.invalidateQueries({ queryKey: queryKeys.activity });
    socket.on("activity:bump", onBump);
    return () => socket.off("activity:bump", onBump);
  }, [queryClient]);

  return (
    <>
      <FeedLayout
      title="Activity"
      subtitle="Mentions, replies & broadcasts · last 30 days"
      testId="activity"
      actions={items.length ? (
        <button
          type="button"
          className="header-action activity-clear feed-icon-action"
          data-testid="activity-clear-all"
          onClick={() => setConfirmClear(true)}
          disabled={clearMutation.isPending}
          title="Clear all activity"
        >
          <Trash2Icon size={15} strokeWidth={1.8} />
          <span>{clearMutation.isPending ? "Clearing…" : "Clear all"}</span>
        </button>
      ) : null}
    >
      <FeedContent
        loading={loading}
        items={displayItems}
        emptyTitle="No activity yet"
        emptyMessage="When someone mentions you or reacts to your messages, it'll show up here."
      >
        {displayItems.map((it) => (
          <div
            key={it.id}
            className={`activity-item ${it.kind === "channel_add" || it.kind === "channel_remove" ? "activity-notification" : ""} ${it.unread ? "unread" : ""}`}
            data-testid="activity-item"
            data-activity-kind={it.kind}
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
            {it.unread && <span className="activity-unread-dot" aria-label="Unread" />}
            <Avatar
              name={activityAuthor(it)}
              src={it.kind === "reaction_group" && it.reactionItems.length > 1 ? null : it.author?.avatarUrl}
              size={36}
            />
            <div className="content">
              <FeedMessage
                author={activityAuthor(it)}
                context={activityContext(it)}
                time={formatDateTime(it.createdAt)}
                body={it.body}
                renderMarkdown={renderMarkdown}
              />
            </div>
            <button
              type="button"
              className="activity-dismiss feed-icon-action"
              data-testid={`activity-delete-${it.id}`}
              title="Delete activity"
              aria-label="Delete activity"
              onClick={(event) => {
                event.stopPropagation();
                restoreFocusAfterDismissRef.current = true;
                dismissMutation.mutate(it.ids || [it.id]);
              }}
            >
              <Trash2Icon size={17} strokeWidth={1.8} />
            </button>
          </div>
        ))}
      </FeedContent>
      </FeedLayout>
      {confirmClear ? (
        <ConfirmDialog
          title="Clear all activity?"
          message="This will remove all current activity from your feed. The original messages will not be deleted."
          confirmLabel="Clear all"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            restoreFocusAfterDismissRef.current = true;
            clearMutation.mutate();
          }}
        />
      ) : null}
    </>
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
  if (item.kind === "reaction_group") {
    const { emojis } = reactionGroupSummary(item);
    const location = item.channelType === "dm" ? "in a DM" : `in #${item.channelName}`;
    return `reacted with ${emojis} to your message ${location}`;
  }
  const location = item.channelType === "dm" ? "in a DM" : `in #${item.channelName}`;
  return `${kindLabel(item)} ${location}`;
}

function activityAuthor(item) {
  if (item.kind === "reaction_group") return reactionGroupSummary(item).actors;
  return item.author?.displayName || "unknown";
}

function reactionGroupSummary(item) {
  const actors = [...new Set(item.reactionItems.map((reaction) => reaction.author?.displayName || "Someone"))];
  const emojis = [...new Set(item.reactionItems.map((reaction) => reaction.emoji).filter(Boolean))];
  const actorLabel = actors.length <= 2
    ? actors.join(" and ")
    : `${actors.slice(0, 2).join(", ")}, and ${actors.length - 2} other${actors.length - 2 === 1 ? "" : "s"}`;
  const emojiLabel = emojis.length <= 2
    ? emojis.join(" and ")
    : `${emojis.slice(0, 2).join(", ")}, and ${emojis.length - 2} more`;
  return { actors: actorLabel || "Someone", emojis: emojiLabel || "an emoji" };
}

function groupReactionActivities(items) {
  const grouped = [];
  const byMessage = new Map();

  for (const item of items) {
    if (item.kind !== "reaction") {
      grouped.push(item);
      continue;
    }

    const existing = byMessage.get(item.messageId);
    if (existing) {
      existing.reactionItems.push(item);
      existing.ids.push(item.id);
      existing.unread = existing.unread || item.unread;
      continue;
    }

    const group = {
      ...item,
      kind: "reaction_group",
      ids: [item.id],
      reactionItems: [item],
    };
    byMessage.set(item.messageId, group);
    grouped.push(group);
  }

  return grouped;
}
