import { useEffect, useState } from "react";
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
export default function ActivityFeed({ user, users = [], customEmojis = [], onJump, onLoaded }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const queryClient = useQueryClient();
  const renderMarkdown = useMarkdownRenderer(users, user.username, customEmojis);
  const { data: items = [], isPending: loading } = useQuery({
    queryKey: queryKeys.activity,
    queryFn: async () => (await api.getActivity()).items || [],
  });
  const dismissMutation = useMutation({
    mutationFn: (itemId) => api.deleteActivity(itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.activity });
      const previous = queryClient.getQueryData(queryKeys.activity);
      queryClient.setQueryData(queryKeys.activity, (current = []) =>
        current.filter((item) => item.id !== itemId)
      );
      return { previous };
    },
    onError: (_error, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.activity, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
  });
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
  const markReadMutation = useMutation({
    mutationFn: () => api.markActivityRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.activity });
      const previous = queryClient.getQueryData(queryKeys.activity);
      queryClient.setQueryData(queryKeys.activity, (current = []) =>
        current.map((item) => ({ ...item, unread: false }))
      );
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
        <>
          {items.some((item) => item.unread) ? (
            <button
              type="button"
              className="header-action"
              data-testid="activity-mark-all-read"
              onClick={() => markReadMutation.mutate()}
              disabled={markReadMutation.isPending}
              title="Mark all activity as read"
            >
              <span>{markReadMutation.isPending ? "Marking…" : "Mark all read"}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="header-action activity-clear"
            data-testid="activity-clear-all"
            onClick={() => setConfirmClear(true)}
            disabled={clearMutation.isPending}
            title="Clear all activity"
          >
            <Trash2Icon size={15} strokeWidth={1.8} />
            <span>{clearMutation.isPending ? "Clearing…" : "Clear all"}</span>
          </button>
        </>
      ) : null}
    >
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
                dismissMutation.mutate(it.id);
              }}
            >
              <Trash2Icon size={15} strokeWidth={1.8} />
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
            clearMutation.mutate();
          }}
        />
      ) : null}
    </>
  );
}

function kindLabel(it) {
  if (it.kind === "dm") return "sent you a message";
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
