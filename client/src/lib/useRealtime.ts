import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { getSocket } from "../socket.js";
import { notificationPreview, notificationsActive, showNotification } from "./notify.js";

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
  setAllChannels,
  setDms,
  setUsers,
  setCustomEmojis,
  setSavedIds,
  setVipIds,
  setView,
  setActiveChannel,
  refreshChannels,
  refreshDms,
  onAuthInvalid,
}) {
  // Activity badge counts (live). Top-level mentions keyed by channel (cleared
  // when you open the channel); thread mentions keyed by their root (cleared
  // when you open the thread).
  const [activityUnread, setActivityUnread] = useState({});
  const [activityThreadUnread, setActivityThreadUnread] = useState({});
  const [onlineIds, setOnlineIds] = useState(() => new Set()); // ids of users currently connected
  const [connectionStatus, setConnectionStatus] = useState("online");
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);

  // Mirror state into refs so the stable socket listeners read current values.
  const activeRef = useRef(null);
  const channelsRef = useRef([]);
  const dmsRef = useRef([]);
  const vipRef = useRef(new Set());
  useEffect(() => void (activeRef.current = activeChannel), [activeChannel]);
  useEffect(() => void (channelsRef.current = channels), [channels]);
  useEffect(() => void (dmsRef.current = dms), [dms]);
  useEffect(() => void (vipRef.current = vipIds || new Set()), [vipIds]);

  function mergeUser(userList, updated) {
    return userList.map((u) => (u.id === updated.id ? { ...u, ...updated } : u));
  }

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

  // Socket.IO restores the transport after a server restart, but transport
  // recovery alone is not enough: events may have been missed and public
  // channel previews are not among the rooms the server automatically rejoins.
  // Reconcile server-backed state before declaring the app healthy again.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    let cancelled = false;
    let retryTimer = null;
    let retryDelay = 1000;
    let needsRecovery = false;
    let recoveryRun = 0;

    const scheduleReconnect = () => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (!cancelled && !socket.connected) socket.connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 10000);
    };

    const recover = async () => {
      const run = ++recoveryRun;
      setConnectionStatus("recovering");

      // Explicitly rejoin the active room. This is required for previews of
      // public channels and harmless for channels joined during server setup.
      if (activeRef.current?.id) socket.emit("channel:join", activeRef.current.id);

      const results = await Promise.allSettled([
        api.listUsers(),
        api.listChannels(),
        api.listAllChannels(),
        api.listDms(),
        api.listEmojis(),
        api.getActivity(),
        api.getSaved(),
        api.getVips(),
      ]);
      if (cancelled || run !== recoveryRun) return;

      if (results[0].status === "fulfilled") setUsers(results[0].value.users || []);
      if (results[1].status === "fulfilled") setChannels(results[1].value.channels || []);
      if (results[2].status === "fulfilled") setAllChannels?.(results[2].value.channels || []);
      if (results[3].status === "fulfilled") setDms(results[3].value.conversations || []);
      if (results[4].status === "fulfilled") setCustomEmojis(results[4].value.emojis || []);
      if (results[5].status === "fulfilled") syncActivity(results[5].value.items || []);
      if (results[6].status === "fulfilled") {
        setSavedIds?.(new Set((results[6].value.items || []).map((item) => item.id)));
      }
      if (results[7].status === "fulfilled") setVipIds?.(new Set(results[7].value.vipIds || []));

      // Consumers use this to reconcile data local to the active view, such as
      // message history and an open thread.
      setRecoveryEpoch((epoch) => epoch + 1);
      const authFailure = results.some(
        (result) => result.status === "rejected" && result.reason?.status === 401
      );
      if (authFailure) {
        setConnectionStatus("auth-error");
        onAuthInvalid?.();
      } else if (!socket.connected) {
        setConnectionStatus("reconnecting");
      } else if (results.every((result) => result.status === "fulfilled")) {
        setConnectionStatus("online");
      } else {
        // The socket can come up slightly before every HTTP dependency/proxy is
        // ready. Stay in recovery and try the reconciliation again.
        setConnectionStatus("recovering");
        clearTimeout(retryTimer);
        retryTimer = setTimeout(recover, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10000);
      }
    };

    const onConnect = () => {
      clearTimeout(retryTimer);
      retryDelay = 1000;
      if (needsRecovery) {
        needsRecovery = false;
        recover();
      } else {
        setConnectionStatus("online");
      }
    };
    const onDisconnect = () => {
      needsRecovery = true;
      setOnlineIds(new Set());
      setConnectionStatus("reconnecting");
    };
    const onConnectError = (error) => {
      if (error?.data?.code === "AUTH_INVALID") {
        setConnectionStatus("auth-error");
        onAuthInvalid?.();
        return;
      }
      needsRecovery = true;
      setConnectionStatus("reconnecting");
      // Socket.IO does not automatically retry when middleware rejects a
      // handshake, so retry temporary startup/database failures ourselves.
      scheduleReconnect();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    if (socket.connected) setConnectionStatus("online");

    return () => {
      cancelled = true;
      recoveryRun += 1;
      clearTimeout(retryTimer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [user]);

  // Live-append workspace-wide additions: custom emoji and newly registered
  // users (so they're searchable / @mentionable without a refresh).
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onEmoji = (emoji) =>
      setCustomEmojis((prev) => (prev.some((e) => e.id === emoji.id) ? prev : [...prev, emoji]));
    const onNewUser = (u) =>
      setUsers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]));
    const onUserUpdate = ({ user: updated } = {}) => {
      if (!updated?.id) return;
      setUsers((prev) => mergeUser(prev, updated));
      setDms((prev) =>
        prev.map((dm) =>
          dm.withUser?.id === updated.id ? { ...dm, withUser: { ...dm.withUser, ...updated } } : dm
        )
      );
      setActiveChannel((prev) =>
        prev?.type === "dm" && prev.dmUserId === updated.id
          ? { ...prev, dmName: updated.displayName }
          : prev
      );
    };
    const onPresence = ({ online } = {}) => setOnlineIds(new Set(online || []));
    const mergeChannel = (prev, updated) => {
      const exists = prev.some((c) => c.id === updated.id);
      if (updated.type !== "public") {
        return prev.filter((c) => c.id !== updated.id);
      }
      const next = exists
        ? prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        : [...prev, updated];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    };
    const onChannelUpdate = ({ channel: updated } = {}) => {
      if (!updated?.id) return;
      setChannels((prev) => mergeChannel(prev, updated));
      setAllChannels?.((prev) => mergeChannel(prev, updated));
      setActiveChannel((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    };
    const onChannelCatalog = ({ channel: updated } = {}) => {
      if (!updated?.id) return;
      setAllChannels?.((prev) => mergeChannel(prev, updated));
      setActiveChannel((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    };
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
    socket.on("user:update", onUserUpdate);
    socket.on("presence", onPresence);
    socket.on("channel:update", onChannelUpdate);
    socket.on("channel:catalog", onChannelCatalog);
    socket.on("channel:added", onChannelAdded);
    socket.on("channel:removed", onChannelRemoved);
    return () => {
      socket.off("emoji:new", onEmoji);
      socket.off("user:new", onNewUser);
      socket.off("user:update", onUserUpdate);
      socket.off("presence", onPresence);
      socket.off("channel:update", onChannelUpdate);
      socket.off("channel:catalog", onChannelCatalog);
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
          const preview = notificationPreview(msg.body) || "Sent an attachment";
          if (inDms) {
            const dm = dmsRef.current.find((d) => d.id === msg.channelId);
            const vip = dm && vipRef.current.has(dm.withUser.id);
            showNotification(vip ? `⭐ ${sender} · VIP message` : `Message from ${sender}`, {
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
            showNotification(`Mention from ${sender}`, {
              body: `${ch?.name ? `#${ch.name} · ` : ""}${preview}`,
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

    return () => {
      socket.off("message:new", onMessage);
      socket.off("activity:bump", onActivityBump);
    };
  }, [user]);

  const activityBadge =
    Object.values(activityUnread).reduce((s, n) => s + n, 0) +
    Object.values(activityThreadUnread).reduce((s, n) => s + n, 0);

  return {
    activityBadge,
    onlineIds,
    connectionStatus,
    recoveryEpoch,
    syncActivity,
    clearChannelActivity,
    clearThreadActivity,
  };
}
