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
import Message from "./Message.js";
import { FeedContent, FeedLayout, FeedMessage } from "./FeedLayout.js";

// Feed of messages that @mention the current user. Clicking jumps to the channel.
export default function ActivityFeed({ user, users = [], customEmojis = [], onJump, onLoaded }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [previewMessages, setPreviewMessages] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRequestRef = useRef(0);
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

  async function selectActivity(item) {
    if (previewId === item.id) {
      setPreviewId(null);
      setPreviewMessages([]);
      return;
    }
    const requestId = ++previewRequestRef.current;
    setPreviewId(item.id);
    setPreviewMessages([]);
    setPreviewLoading(!!item.messageId);
    if (item.messageId) {
      try {
        const result = item.threadId
          ? await api.getThread(item.channelId, item.threadId)
          : await api.getMessages(item.channelId, { around: item.messageId });
        if (requestId === previewRequestRef.current) {
          const messages = item.threadId
            ? [result.parent, ...(result.replies || [])].filter(Boolean)
            : (result.messages || []);
          setPreviewMessages(messages);
          setPreviewLoading(false);
        }
      } catch {
        // Keep the Activity payload as the fallback preview.
        if (requestId === previewRequestRef.current) setPreviewLoading(false);
      }
    } else {
      setPreviewLoading(false);
    }
    if (!item.unread) return;
    queryClient.setQueryData(queryKeys.activity, (current = []) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, unread: false } : entry))
    );
    await api.markActivityItemsRead([item.id]).catch(() => {});
    queryClient.invalidateQueries({ queryKey: queryKeys.activity });
  }

  useEffect(() => {
    // Live-refresh while the panel is open (new mentions, replies, reactions).
    const socket = getSocket();
    const onBump = () => queryClient.invalidateQueries({ queryKey: queryKeys.activity });
    socket.on("activity:bump", onBump);
    return () => socket.off("activity:bump", onBump);
  }, [queryClient]);

  const selectedItem = items.find((item) => item.id === previewId) || null;
  const fallbackMessage = selectedItem && {
    id: selectedItem.messageId || selectedItem.id,
    author: selectedItem.author,
    body: selectedItem.body || "",
    createdAt: selectedItem.createdAt,
    reactions: selectedItem.reactions || [],
    attachments: [],
    parentId: selectedItem.threadId || null,
  };
  const messagesToPreview = previewMessages.length ? previewMessages : (fallbackMessage ? [fallbackMessage] : []);
  const previewPane = selectedItem ? (
    <aside className="activity-preview-pane" data-testid="activity-preview">
      <header className="activity-preview-header">
        <div>
          <span className="activity-preview-kicker">
            {selectedItem.threadId ? "Thread preview" : "Channel preview"}
          </span>
          <strong>#{selectedItem.channelName || "conversation"}</strong>
        </div>
        <button
          type="button"
          className="activity-preview-close"
          aria-label="Close message preview"
          onClick={() => { setPreviewId(null); setPreviewMessages([]); }}
        >
          ×
        </button>
      </header>
      <div
        className="activity-preview-chat"
        role="button"
        tabIndex={0}
        onClick={() => onJump(selectedItem)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onJump(selectedItem);
          }
        }}
        title="Click to jump to message"
      >
        {previewLoading ? <div className="activity-preview-loading">Loading conversation…</div> : null}
        {messagesToPreview.map((message) => (
          <div
            key={message.id}
            className={`activity-preview-message ${message.id === selectedItem.messageId ? "target" : ""}`}
          >
            <Message
              m={message}
              grouped={false}
              highlighted={false}
              currentUserId={user.id}
              usersById={new Map(users.map((entry) => [entry.id, entry]))}
              renderMarkdown={renderMarkdown}
              emojiMap={new Map(customEmojis.map((entry) => [entry.name.toLowerCase(), entry.url]))}
              canJumpToForward={false}
              saved={false}
              showActions={false}
              canPin={false}
              onToggleReaction={() => {}}
              onReact={() => {}}
              onToggleSave={() => {}}
            />
          </div>
        ))}
      </div>
      <button type="button" className="activity-preview-jump" onClick={() => onJump(selectedItem)}>
        Jump to message
      </button>
    </aside>
  ) : null;

  return (
    <>
      <FeedLayout
      title="Activity"
      subtitle="Mentions, replies & broadcasts · last 30 days"
      testId="activity"
      sidePanel={previewPane}
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
            className={`activity-item ${it.unread ? "unread" : ""} ${previewId === it.id ? "selected" : ""}`}
            data-testid="activity-item"
            data-activity-kind={it.kind}
            aria-expanded={previewId === it.id}
            tabIndex={0}
            onClick={() => selectActivity(it)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectActivity(it);
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
              {it.kind === "reaction" && it.reactions?.length ? (
                <div className="activity-reactions" aria-label="Reactions">
                  {it.reactions.map((reaction) => `${reaction.emoji} ${reaction.count}`).join("  ")}
                </div>
              ) : null}
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
  if (it.kind === "reaction") {
    const others = Math.max(0, (it.reactionActorCount || 1) - 1);
    if (!others) return "reacted to your message";
    return `and ${others} other${others === 1 ? "" : "s"} reacted to your message`;
  }
  return "mentioned you";
}

function activityContext(item) {
  if (item.kind === "channel_add") return `added you to #${item.channelName}`;
  if (item.kind === "channel_remove") return `removed you from #${item.channelName}`;
  const location = item.channelType === "dm" ? "in a DM" : `in #${item.channelName}`;
  return `${kindLabel(item)} ${location}`;
}
