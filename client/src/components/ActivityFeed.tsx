import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { formatDateTime } from "../lib/time.js";
import { useMarkdownRenderer } from "../lib/useMarkdownRenderer.js";
import { decorateGroupMentions, displayGroupMentions } from "../lib/groupMentions.js";
import { queryKeys } from "../lib/queryClient.js";
import Avatar from "./Avatar.js";
import ConfirmDialog from "./ConfirmDialog.js";
import { FeedContent, FeedLayout, FeedMessage } from "./FeedLayout.js";
import { useI18n } from "../lib/i18n.js";

// Feed of messages that @mention the current user. Clicking jumps to the channel.
export default function ActivityFeed({ user, users = [], customEmojis = [], onJump, onLoaded, onReady }) {
  const { t } = useI18n();
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
    const target = document.querySelector('[data-testid="activity-item"]');
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
      title={t("activity")}
      subtitle={t("activitySubtitle")}
      testId="activity"
      actions={items.length ? (
        <button
          type="button"
          className="header-action activity-clear feed-icon-action"
          data-testid="activity-clear-all"
          onClick={() => setConfirmClear(true)}
          disabled={clearMutation.isPending}
          title={t("clearAllActivity")}
        >
          <Trash2Icon size={15} strokeWidth={1.8} />
          <span>{clearMutation.isPending ? t("clearing") : t("clearAll")}</span>
        </button>
      ) : null}
    >
      <FeedContent
        loading={loading}
        items={displayItems}
        loadingLabel={t("loading")}
        emptyTitle={t("noActivityYet")}
        emptyMessage={t("activityEmpty")}
      >
        {displayItems.map((it) => (
          <div
            key={it.id}
            className={`activity-item ${it.kind === "channel_add" || it.kind === "channel_remove" ? "activity-notification" : ""} ${it.unread ? "unread" : ""}`}
            data-testid="activity-item"
            data-activity-kind={it.kind}
            data-activity-notice-id={!it.messageId ? it.id : undefined}
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
            {it.unread && <span className="activity-unread-dot" aria-label={t("unread")} />}
            <Avatar
              name={activityAuthor(it, t)}
              src={it.kind === "reaction_group" && it.reactionItems.length > 1 ? null : it.author?.avatarUrl}
              size={36}
            />
            <div className="content">
              <FeedMessage
                author={activityAuthor(it, t)}
                context={activityContext(it, t)}
                time={formatDateTime(it.createdAt)}
                body={it.body}
                renderMarkdown={(body) => decorateGroupMentions(
                  renderMarkdown(displayGroupMentions(body, it.mentionedGroups), { mentionedChannels: it.mentionedChannels }),
                  it.mentionedGroups,
                )}
                mentionedChannels={it.mentionedChannels}
              />
            </div>
            <button
              type="button"
              className="activity-dismiss feed-icon-action"
              data-testid={`activity-delete-${it.id}`}
              title={t("deleteActivity")}
              aria-label={t("deleteActivity")}
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
          title={t("clearActivityTitle")}
          message={t("clearActivityMessage")}
          confirmLabel={t("clearAll")}
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

function kindLabel(it, t) {
  if (it.kind === "broadcast") return t("notifiedChannel");
  if (it.kind === "reply") return t("repliedInThread");
  if (it.kind === "reaction") return t("reactedToMessage").replace("{emoji}", it.emoji || "");
  return t("mentionedYou");
}

function activityContext(item, t) {
  const location = item.channelType === "dm" ? t("inDirectMessage") : t("inChannel").replace("{channel}", item.channelName);
  if (item.kind === "broadcast") return t("notifiedChannel").replace("{location}", location);
  if (item.kind === "channel_add") return t("addedYouToChannel").replace("{channel}", item.channelName);
  if (item.kind === "channel_remove") return t("removedYouFromChannel").replace("{channel}", item.channelName);
  if (item.kind === "reaction_group") {
    const { emojis } = reactionGroupSummary(item, t);
    return t("reactedWith").replace("{emojis}", emojis).replace("{location}", location);
  }
  return `${kindLabel(item, t)} ${location}`;
}

function activityAuthor(item, t) {
  if (item.kind === "reaction_group") return reactionGroupSummary(item, t).actors;
  return item.author?.displayName || "unknown";
}

function reactionGroupSummary(item, t) {
  const actors = [...new Set(item.reactionItems.map((reaction) => reaction.author?.displayName || t("someone")))];
  const emojis = [...new Set(item.reactionItems.map((reaction) => reaction.emoji).filter(Boolean))];
  const actorLabel = actors.length <= 2
    ? actors.join(` ${t("and")} `)
    : `${actors.slice(0, 2).join(", ")}, ${t("and")} ${actors.length - 2} ${actors.length - 2 === 1 ? t("other") : t("others")}`;
  const emojiLabel = emojis.length <= 2
    ? emojis.join(` ${t("and")} `)
    : `${emojis.slice(0, 2).join(", ")}, ${t("and")} ${emojis.length - 2} ${t("more")}`;
  return { actors: actorLabel || t("someone"), emojis: emojiLabel || t("anEmoji") };
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
