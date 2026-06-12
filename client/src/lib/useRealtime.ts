import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { notificationsActive, showNotification } from "./notify.js";

// Owns the real-time layer: socket listeners (message:new, activity:bump,
// reconnect, emoji:new, user:new, presence), the live Activity-badge counts,
// and the refs that let stable listeners read fresh state.
// App passes in the workspace state it reads plus the setters/helpers it calls.
export function useRealtime({
  user,
  activeChannel,
  channels,
  dms,
  vipIds,
  setChannels,
  setDms,
  setUsers,
  setCustomEmojis,
  setView,
  setActiveChannel,
  refreshChannels,
  refreshDms,
}) {
  // Activity badge counts (live). Top-level mentions keyed by channel (cleared
  // when you open the channel); thread mentions keyed by their root (cleared
  // when you open the thread).
  const [activityUnread, setActivityUnread] = useState({});
  const [activityThreadUnread, setActivityThreadUnread] = useState({});
  const [onlineIds, setOnlineIds] = useState(() => new Set()); // ids of users currently connected

  // Mirror state into refs so the stable socket listeners read current values.
  const activeRef = useRef(null);
  const channelsRef = useRef([]);
  const dmsRef = useRef([]);
  const vipRef = useRef(new Set());
  useEffect(() => void (activeRef.current = activeChannel), [activeChannel]);
  useEffect(() => void (channelsRef.current = channels), [channels]);
  useEffect(() => void (dmsRef.current = dms), [dms]);
  useEffect(() => void (vipRef.current = vipIds || new Set()), [vipIds]);

  // Rebuild the badge counts from a fresh activity feed (server is the truth).
  function syncActivity(items) {
    const byChannel = {};
    const byThread = {};
    for (const it of items) {
      if (!it.unread) continue;
      if (it.threadId) byThread[it.threadId] = (byThread[it.threadId] || 0) + 1;
      else byChannel[it.channelId] = (byChannel[it.channelId] || 0) + 1;
    }
    setActivityUnread(byChannel);
    setActivityThreadUnread(byThread);
  }

  function clearChannelActivity(channelId) {
    setActivityUnread((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  }
  function clearThreadActivity(rootId) {
    setActivityThreadUnread((prev) => {
      if (!prev[rootId]) return prev;
      const next = { ...prev };
      delete next[rootId];
      return next;
    });
  }

  // Live-append workspace-wide additions: custom emoji and newly registered
  // users (so they're searchable / @mentionable without a refresh).
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onEmoji = (emoji) =>
      setCustomEmojis((prev) => (prev.some((e) => e.id === emoji.id) ? prev : [...prev, emoji]));
    const onNewUser = (u) =>
      setUsers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));
    const onPresence = ({ online } = {}) => setOnlineIds(new Set(online || []));
    // Added to a channel by someone else — pull it into the sidebar live.
    const onChannelAdded = () => refreshChannels();
    // Removed from a channel by its creator — drop it from the sidebar, and if
    // we're currently viewing it, navigate back home.
    const onChannelRemoved = ({ channelId } = {}) => {
      if (activeRef.current?.id === channelId) {
        setView("home");
        setActiveChannel(null);
      }
      refreshChannels();
    };
    socket.on("emoji:new", onEmoji);
    socket.on("user:new", onNewUser);
    socket.on("presence", onPresence);
    socket.on("channel:added", onChannelAdded);
    socket.on("channel:removed", onChannelRemoved);
    return () => {
      socket.off("emoji:new", onEmoji);
      socket.off("user:new", onNewUser);
      socket.off("presence", onPresence);
      socket.off("channel:added", onChannelAdded);
      socket.off("channel:removed", onChannelRemoved);
    };
  }, [user]);

  // Incoming messages: sidebar unread, DM reordering, and the activity badge.
  // Plus activity re-sync on bump/reconnect.
  useEffect(() => {
    if (!user) return;
    const escaped = user.username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentionRe = new RegExp(`@${escaped}\\b`, "i");
    const socket = getSocket();

    const onMessage = (msg) => {
      const mine = msg.author?.id === user.id;
      const active = activeRef.current;
      const viewingHere = !!active && msg.channelId === active.id && !document.hidden;
      const inChannels = channelsRef.current.some((c) => c.id === msg.channelId);
      const inDms = dmsRef.current.some((d) => d.id === msg.channelId);

      // Channel sidebar: bump unread locally (no refetch).
      if (inChannels && !mine && !viewingHere) {
        setChannels((prev) =>
          prev.map((c) => (c.id === msg.channelId ? { ...c, unread: (c.unread || 0) + 1 } : c))
        );
      }

      // DM list: update preview, recency, and unread locally; move to the top.
      if (inDms) {
        setDms((prev) => {
          const i = prev.findIndex((d) => d.id === msg.channelId);
          if (i < 0) return prev;
          const d = prev[i];
          const updated = {
            ...d,
            lastAt: msg.createdAt,
            lastBody: msg.body,
            lastFromMe: mine,
            unread: mine || viewingHere ? d.unread || 0 : (d.unread || 0) + 1,
          };
          return [updated, ...prev.filter((_, idx) => idx !== i)];
        });
      }

      // A conversation we don't track yet (new DM, or just added to a channel) —
      // fetch once to pick it up. Rare, so no storm.
      if (!mine && !viewingHere && !inChannels && !inDms) {
        refreshDms();
        refreshChannels();
      }

      const body = msg.body || "";
      const personallyMentioned = mentionRe.test(body);
      const broadcastsAll = inChannels && /@everyone\b/i.test(body);
      const mentionsMe = personallyMentioned || broadcastsAll;

      // Activity badge: count @mentions and @everyone broadcasts you haven't
      // seen yet. Thread replies are tracked by their thread; top-level by channel.
      if (mentionsMe && !mine) {
        if (msg.parentId) {
          setActivityThreadUnread((prev) => ({ ...prev, [msg.parentId]: (prev[msg.parentId] || 0) + 1 }));
        } else if (!viewingHere) {
          setActivityUnread((prev) => ({ ...prev, [msg.channelId]: (prev[msg.channelId] || 0) + 1 }));
        }
      }

      // Desktop notification — DMs (with a VIP badge), and channel @mentions.
      // Skipped if you're already focused on that conversation.
      if (!mine && notificationsActive()) {
        const focusedHere = !!active && msg.channelId === active.id && document.hasFocus();
        if (!focusedHere) {
          const sender = msg.author?.displayName || "Someone";
          const text = msg.body || "";
          const preview = text.replace(/\s+/g, " ").trim().slice(0, 140) || "Sent an attachment";
          if (inDms) {
            const dm = dmsRef.current.find((d) => d.id === msg.channelId);
            const vip = dm && vipRef.current.has(dm.withUser.id);
            showNotification(vip ? `⭐ ${sender} · VIP` : sender, {
              body: preview,
              tag: msg.channelId,
              onClick: () => {
                setView("dms");
                if (dm) {
                  setActiveChannel({
                    id: dm.id,
                    type: "dm",
                    dmName: dm.withUser.displayName,
                    dmUserId: dm.withUser.id,
                  });
                }
              },
            });
          } else if (mentionsMe && inChannels) {
            const ch = channelsRef.current.find((c) => c.id === msg.channelId);
            showNotification(`${sender} in #${ch?.name || "channel"}`, {
              body: preview,
              tag: msg.channelId,
              onClick: () => {
                setView("home");
                if (ch) setActiveChannel(ch);
              },
            });
          }
        }
      }
    };
    socket.on("message:new", onMessage);

    // Server flags a message as "activity" for us — re-sync the badge (works even
    // for mentions in channels we haven't joined, where no message:new arrives).
    const onActivityBump = () => {
      api.getActivity().then(({ items }) => syncActivity(items)).catch(() => {});
    };
    socket.on("activity:bump", onActivityBump);

    // On reconnect, re-fetch the lists so we recover anything missed while down.
    const onReconnect = () => {
      api.listUsers().then(({ users }) => setUsers(users)).catch(() => {});
      refreshChannels();
      refreshDms();
      onActivityBump();
    };
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.off("message:new", onMessage);
      socket.off("activity:bump", onActivityBump);
      socket.io.off("reconnect", onReconnect);
    };
  }, [user]);

  const activityBadge =
    Object.values(activityUnread).reduce((s, n) => s + n, 0) +
    Object.values(activityThreadUnread).reduce((s, n) => s + n, 0);

  return { activityBadge, onlineIds, syncActivity, clearChannelActivity, clearThreadActivity };
}
