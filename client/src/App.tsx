import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { api, consumeRhssoCallback, getToken, setToken } from "./api.js";
import { disconnectSocket } from "./socket.js";
import { useRealtime } from "./lib/useRealtime.js";
import Login from "./components/Login.js";
import ForcePasswordReset from "./components/ForcePasswordReset.js";
import WorkspaceNavigation from "./components/WorkspaceNavigation.js";
import WorkspaceOverlays from "./components/WorkspaceOverlays.js";
import WorkspaceContent from "./components/WorkspaceContent.js";
import { readJson, writeJson } from "./lib/storage.js";
import { notifyPermission, notifySupported, requestNotifyPermission, setNotifyPref } from "./lib/notify.js";
import { BUILT_IN_GIT_EMOJIS } from "./lib/gitEmojis.js";
import { THEMES, useThemePreferences } from "./lib/useThemePreferences.js";
import { useConversationCache } from "./lib/useConversationCache.js";
import { useWorkspaceQueries, workspaceKeys } from "./lib/useWorkspaceQueries.js";
import { queryKeys } from "./lib/queryClient.js";
import { currentRoute, workspacePath } from "./lib/workspaceRoutes.js";

const HIDDEN_KEY = "echo.hiddenChannels";
function loadHidden() {
  return new Set(readJson(HIDDEN_KEY, []));
}

const RECENTS_KEY = "echo.recentSearches";
const CONNECTION_BANNER_DELAY_MS = 1000;

function loadRecents() {
  return readJson(RECENTS_KEY, []);
}

export default function App() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [rhssoError] = useState(() => consumeRhssoCallback());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startupUnavailable, setStartupUnavailable] = useState(false);
  const [allChannels, setAllChannels] = useState([]); // bounded cache of public channel summaries
  const [catalogCounts, setCatalogCounts] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [recents, setRecents] = useState(loadRecents);
  const [showCreate, setShowCreate] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [showAddEmoji, setShowAddEmoji] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false); // REST API reference page
  const [profileUser, setProfileUser] = useState(null); // user whose profile card is open
  const [hidden, setHidden] = useState(loadHidden); // hidden channel ids
  const [view, setViewState] = useState("home"); // home | browse | dms | activity | saved
  const {
    channels,
    setChannels,
    channelsQuery,
    dms,
    setDms,
    dmsQuery,
    users,
    setUsers,
    usersQuery,
    customEmojis,
    setCustomEmojis,
    savedIds,
    setSavedIds,
    vipIds,
    setVipIds,
    activityItems,
  } = useWorkspaceQueries(!!user);
  const [navOpen, setNavOpen] = useState(false); // mobile: rail+sidebar drawer open?
  const [showTour, setShowTour] = useState(false); // first-run walkthrough
  const { theme, setTheme, mode, setMode, toggleMode } = useThemePreferences();
  const {
    scrollStates,
    cacheMessages,
    getCachedMessages,
    rememberScrollState,
    clearScrollState,
    prefetchMessages,
  } = useConversationCache(user?.id);
  const [jumpMessageId, setJumpMessageId] = useState(null); // message to scroll to + highlight
  const [searchQuery, setSearchQuery] = useState(null); // active message-search query (results pane)
  const [openThreadReq, setOpenThreadReq] = useState(null); // { channelId, rootId, messageId } — thread to open after a jump
  const [scrollToBottomTarget, setScrollToBottomTarget] = useState(null); // { id, channelId } pinned-open request
  const [toast, setToast] = useState(null); // transient notice (e.g. no access)
  const [connectionBannerVisible, setConnectionBannerVisible] = useState(false);
  const searchRef = useRef(null);
  const markReadAtRef = useRef({}); // channelId -> last markRead time (throttle)
  const restoredRef = useRef(false); // have we restored the saved location yet?
  const restoredUserRef = useRef(null);
  const navDuringRestoreRef = useRef(false); // user navigated before the initial restore finished
  const viewRef = useRef(view);
  const activeChannelRef = useRef(activeChannel);

  useEffect(() => void (viewRef.current = view), [view]);
  useEffect(() => void (activeChannelRef.current = activeChannel), [activeChannel]);

  function markNavDuringRestore() {
    if (!restoredRef.current) navDuringRestoreRef.current = true;
  }

  function conversationRouteName(channel) {
    if (!channel) return null;
    if (channel.type !== "dm") return channel.name || null;
    return channel.dmUsername
      || users.find((candidate) => candidate.id === channel.dmUserId)?.username
      || null;
  }

  function setView(nextView, channel = activeChannelRef.current, options = {}) {
    setViewState(nextView);
    navigate(
      workspacePath({
        view: nextView,
        convId: channel?.id || null,
        convName: conversationRouteName(channel),
        convType: channel?.type || null,
      }),
      options
    );
  }

  // Jump targets belong to the conversation that created them. Clear them
  // before ordinary navigation so a failed/stale target cannot be retried in
  // the next channel.
  function clearNavigationTarget() {
    setJumpMessageId(null);
    setOpenThreadReq(null);
    setScrollToBottomTarget(null);
  }

  function handleViewSelect(nextView) {
    markNavDuringRestore();
    clearNavigationTarget();
    searchRef.current?.clear();
    setSearchQuery(null);
    if (nextView === "activity") {
      api.markActivityRead()
        .catch(() => {})
        .finally(() => queryClient.invalidateQueries({ queryKey: queryKeys.activity }));
    }
    setView(nextView);
    setNavOpen(window.matchMedia("(max-width: 760px)").matches);
  }

  function handleSidebarSelect(channel) {
    markNavDuringRestore();
    clearNavigationTarget();
    setSearchQuery(null);
    setActiveChannel(channel);
    setView("home", channel);
    setNavOpen(false);
  }

  function handleBrowseChannels() {
    markNavDuringRestore();
    clearNavigationTarget();
    setSearchQuery(null);
    setView("browse");
    setNavOpen(false);
  }

  function handleStartConversation() {
    markNavDuringRestore();
    clearNavigationTarget();
    setSearchQuery(null);
    setNavOpen(false);
    setShowNewMessage(true);
  }

  function handleSidebarOpenDm(target, isSelf) {
    markNavDuringRestore();
    handleOpenDm(target, isSelf, view === "home" ? "home" : "dms");
    setNavOpen(false);
  }

  const visibleChannels = useMemo(
    () => [...new Map([...allChannels, ...channels].map((c) => [c.id, c])).values()],
    [channels, allChannels]
  );
  const myChannelIds = useMemo(() => channels.map((c) => c.id), [channels]);
  const myPublicChannelIdSet = useMemo(
    () => new Set(channels.filter((channel) => channel.type === "public").map((channel) => channel.id)),
    [channels]
  );
  const cacheCatalogChannels = useCallback((found) => {
    if (!found?.length) return;
    setAllChannels((previous) => {
      const merged = new Map(previous.map((channel) => [channel.id, channel]));
      for (const channel of found) merged.set(channel.id, { ...merged.get(channel.id), ...channel });
      // This cache supports quick navigation and message channel tags; Browse
      // owns its paged results, so retaining its entire history is unnecessary.
      return [...merged.values()].slice(-500);
    });
  }, []);
  const updateCatalogCache = useCallback((updater) => {
    setAllChannels((previous) => {
      const next = typeof updater === "function" ? updater(previous) : updater;
      return (next || []).slice(-500);
    });
  }, []);
  const findPublicChannels = useCallback(async (q) => {
    const result = await api.browseChannels({ q, membership: "all", limit: 8 });
    cacheCatalogChannels(result.channels || []);
    return result.channels || [];
  }, [cacheCatalogChannels]);

  // Real-time layer: socket listeners + live Activity-badge counts.
  // (refreshChannels/refreshDms are hoisted declarations below.)
  const {
    activityBadge,
    onlineIds,
    connectionStatus,
    recoveryEpoch,
    syncActivity,
    clearChannelActivity,
    clearThreadActivity,
  } =
    useRealtime({
      user,
      activeChannel,
      channels,
      dms,
      vipIds,
      setChannels,
      setAllChannels: updateCatalogCache,
      setDms,
      setUsers,
      setCustomEmojis,
      setSavedIds,
      setVipIds,
      setView,
      setActiveChannel,
      setProfileUser,
      refreshChannels,
      refreshDms,
      onAuthInvalid: handleLogout,
    });

  const hasConnectionIssue =
    connectionStatus !== "online" &&
    connectionStatus !== "connecting" &&
    connectionStatus !== "auth-error";

  // Only surface an established connection dropping if it lasts long enough
  // to be actionable, avoiding transient banner flashes and layout shifts.
  useEffect(() => {
    if (!hasConnectionIssue) {
      setConnectionBannerVisible(false);
      return;
    }
    const timer = setTimeout(() => setConnectionBannerVisible(true), CONNECTION_BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasConnectionIssue]);

  // Restore the session on load if a token is present.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let retryTimer = null;
    let retryDelay = 1000;

    const restore = async () => {
      try {
        const { user } = await api.me();
        if (cancelled) return;
        setUser(user);
        setStartupUnavailable(false);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) {
          // Only a confirmed authentication rejection should destroy a stored
          // session. Network/server failures are temporary and retried below.
          setToken(null);
          setStartupUnavailable(false);
          setLoading(false);
          return;
        }
        setStartupUnavailable(true);
        retryTimer = setTimeout(restore, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 10000);
      }
    };

    restore();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  function refreshDms() {
    queryClient.invalidateQueries({ queryKey: workspaceKeys.dms });
  }
  function refreshChannels() {
    queryClient.invalidateQueries({ queryKey: workspaceKeys.channels });
  }

  function clearScrollToBottomTarget() {
    setScrollToBottomTarget(null);
  }

  // Mark a conversation read: clear its unread locally (no refetch) and persist
  // the read marker, throttled so a busy channel doesn't write on every message.
  async function handleRead(channelId) {
    setChannels((prev) => prev.map((c) => (c.id === channelId && c.unread ? { ...c, unread: 0 } : c)));
    setDms((prev) => prev.map((d) => (d.id === channelId && d.unread ? { ...d, unread: 0 } : d)));
    // Opening the conversation clears its activity items (server marks them read).
    clearChannelActivity(channelId);
    const now = Date.now();
    if (now - (markReadAtRef.current[channelId] || 0) < 1500) return;
    markReadAtRef.current[channelId] = now;
    try {
      await api.markRead(channelId);
    } catch {
      /* ignore */
    }
  }

  // Restore the user's last view + conversation (or fall back to the first
  // channel) once channels & DMs are loaded.
  function applyLocation(saved, chs, conversations) {
    let nextView = "home";
    let active = chs.find((channel) => channel.name.toLowerCase() === "general") || chs[0] || null;
    if (saved?.view === "browse") {
      nextView = "browse";
      active = chs.find((channel) => channel.id === saved.convId) || active;
    } else if (saved?.view === "activity" || saved?.view === "saved") {
      nextView = saved.view; // full-page views, no conversation needed
    } else if (saved?.convType === "dm" && saved.convId) {
      const dm = conversations.find((d) => d.id === saved.convId);
      if (dm) {
        nextView = "dms";
        active = { id: dm.id, type: "dm", dmName: dm.withUser.displayName, dmUserId: dm.withUser.id };
      }
    } else if (saved?.convId) {
      const ch = chs.find((c) => c.id === saved.convId);
      if (ch) {
        nextView = saved.view === "dms" ? "dms" : "home";
        active = ch;
      }
    } else if (saved?.view === "dms") {
      nextView = "dms";
    }
    setViewState(nextView);
    setActiveChannel(active);
  }

  async function applyRouteLocation(route, chs, conversations) {
    setShowSettings(route.overlay === "settings");
    setShowApiDocs(route.overlay === "api-docs");
    setSearchQuery(route.searchQuery);

    const currentChannel = activeChannelRef.current;
    const routeConversation = route.convId?.toLowerCase();
    const currentRouteName = conversationRouteName(currentChannel)?.toLowerCase();
    if (route.convId && (currentChannel?.id === route.convId || currentRouteName === routeConversation)) {
      setViewState(route.view);
      if (currentChannel?.id === route.convId && currentRouteName) {
        navigate(workspacePath({
          view: route.view,
          convId: currentChannel.id,
          convName: conversationRouteName(currentChannel),
          convType: currentChannel.type,
        }), { replace: true });
      }
      return;
    }

    if (route.convType === "dm" && route.convId) {
      let dm = conversations.find((conversation) =>
        conversation.id === route.convId
        || conversation.withUser.username?.toLowerCase() === routeConversation
      );
      if (!dm) {
        const person = users.find((candidate) => candidate.username.toLowerCase() === routeConversation);
        if (person) {
          const result = await api.openDm(person.id).catch(() => null);
          if (result?.channel) dm = { id: result.channel.id, withUser: person };
        }
      }
      if (!dm) {
        const result = await api.getChannel(route.convId).catch(() => null);
        const other = result?.members?.find((member) => member.id !== user.id)
          || (result?.channel?.members?.length === 1 ? user : null);
        if (result?.channel?.type === "dm" && other) dm = { id: result.channel.id, withUser: other };
      }
      if (dm) {
        setViewState(route.view === "home" ? "home" : "dms");
        const activeDm = {
          id: dm.id,
          type: "dm",
          dmName: dm.withUser.displayName,
          dmUsername: dm.withUser.username,
          dmUserId: dm.withUser.id,
        };
        setActiveChannel(activeDm);
        if (route.convId === dm.id) {
          navigate(workspacePath({ view: route.view, convId: dm.id, convName: dm.withUser.username, convType: "dm" }), { replace: true });
        }
        return;
      }
    }

    if (route.convType === "channel" && route.convId) {
      let channel = chs.find((candidate) => candidate.id === route.convId || candidate.name.toLowerCase() === routeConversation)
        || allChannels.find((candidate) => candidate.id === route.convId || candidate.name.toLowerCase() === routeConversation);
      if (!channel) {
        channel = await api.getChannelByName(route.convId).then(({ channel }) => channel).catch(() => null)
          || await api.getChannel(route.convId).then(({ channel }) => channel).catch(() => null);
        if (channel?.type === "public") cacheCatalogChannels([channel]);
      }
      if (channel && channel.type !== "dm") {
        setViewState("home");
        setActiveChannel(channel);
        if (route.convId === channel.id) {
          navigate(workspacePath({ view: "home", convId: channel.id, convName: channel.name, convType: channel.type }), { replace: true });
        }
        return;
      }
    }

    applyLocation(route, chs, conversations);
  }

  // Restore navigation once the independently fetched channel and DM queries
  // have both resolved. The other workspace queries continue in parallel.
  useEffect(() => {
    if (!user || !channelsQuery.isSuccess || !dmsQuery.isSuccess || !usersQuery.isSuccess) return;
    if (restoredUserRef.current === user.id) return;
    restoredUserRef.current = user.id;
    restoredRef.current = false; // restore again for this (possibly new) account
    navDuringRestoreRef.current = false;
    let cancelled = false;
    Promise.resolve()
      .then(async () => {
        const chs = channels;
        const conversations = dms;
        const inviteId = new URLSearchParams(window.location.search).get("invite");
        let invitedChannel = inviteId && chs.find((channel) => channel.id === inviteId);
        if (inviteId && !invitedChannel) {
          invitedChannel = await api.getChannel(inviteId).then(({ channel }) => channel).catch(() => null);
          if (cancelled) return;
          if (invitedChannel?.type === "public") cacheCatalogChannels([invitedChannel]);
        }
        const route = currentRoute(location);
        const hasExplicitRoute = location.pathname !== "/" || !!route.searchQuery || !!route.overlay;
        if (invitedChannel) {
          setActiveChannel(invitedChannel);
          setViewState("home");
          navigate(workspacePath({ view: "home", convId: invitedChannel.id, convName: invitedChannel.name, convType: invitedChannel.type }), { replace: true });
        } else if (hasExplicitRoute) {
          await applyRouteLocation(route, chs, conversations);
        } else if (!navDuringRestoreRef.current) {
          const saved = readJson(`echo.loc.${user.id}`, null);
          applyLocation(saved, chs, conversations);
          const savedConversation = saved?.convType === "dm"
            ? conversations.find((conversation) => conversation.id === saved.convId)
            : chs.find((channel) => channel.id === saved?.convId);
          navigate(workspacePath({
            ...(saved || {}),
            convName: saved?.convType === "dm"
              ? savedConversation?.withUser.username
              : savedConversation?.name,
          }), { replace: true });
        } else {
          writeCurrentLocation(user.id);
        }
        restoredRef.current = true;
      })
      .catch(() => {
        restoredRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [user, channelsQuery.isSuccess, dmsQuery.isSuccess, usersQuery.isSuccess, cacheCatalogChannels, location.key]);

  useEffect(() => {
    if (user) syncActivity(activityItems);
  }, [user, activityItems]);

  // Persist the current location as a backward-compatible fallback for users
  // upgrading from versions that did not expose routes in the URL.
  useEffect(() => {
    if (!user || !restoredRef.current) return;
    writeCurrentLocation(user.id);
  }, [user, view, activeChannel]);

  function writeCurrentLocation(userId) {
    const loc = {
      view: viewRef.current,
      convId: activeChannelRef.current?.id || null,
      convType: activeChannelRef.current?.type || null,
    };
    writeJson(`echo.loc.${userId}`, loc);
  }

  // React Router owns browser history. Apply URL changes (including Back and
  // Forward) to the existing workspace state once startup restoration is done.
  useEffect(() => {
    if (!restoredRef.current) return;
    let cancelled = false;
    setProfileUser(null);
    applyRouteLocation(currentRoute(location), channels, dms).catch(() => {
      if (!cancelled) setToast("That Echo location is no longer available.");
    });
    return () => void (cancelled = true);
  }, [location.key]);

  function handleEmojiCreated(emoji) {
    setCustomEmojis((prev) => (prev.some((e) => e.id === emoji.id) ? prev : [...prev, emoji]));
  }

  function handleAuthed({ token, user }) {
    sessionStorage.removeItem("echo.ssoBypass");
    queryClient.clear();
    setToken(token);
    setUser(user);
  }

  function handleLogout() {
    sessionStorage.setItem("echo.ssoBypass", "true");
    setToken(null);
    disconnectSocket();
    queryClient.clear();
    restoredUserRef.current = null;
    setUser(null);
    setAllChannels([]);
    setCatalogCounts(null);
    setActiveChannel(null);
    setScrollToBottomTarget(null);
    navigate("/", { replace: true });
  }

  function rememberRecent(item) {
    setRecents((prev) => {
      const next = [item, ...prev.filter((r) => !(r.type === item.type && r.id === item.id))].slice(0, 6);
      writeJson(RECENTS_KEY, next);
      return next;
    });
  }

  async function handleCreateChannel(name, type) {
    const { channel } = await api.createChannel(name, type);
    upsertChannel(channel);
    setActiveChannel(channel);
    setView("home", channel);
  }

  function upsertChannel(channel) {
    const active = activeChannelRef.current;
    if (active?.id === channel.id && active.name !== channel.name) {
      navigate(workspacePath({
        view: viewRef.current,
        convId: channel.id,
        convName: channel.name,
        convType: channel.type,
      }), { replace: true });
    }
    setChannels((prev) => {
      const exists = prev.some((c) => c.id === channel.id);
      const next = exists
        ? prev.map((c) => (c.id === channel.id ? channel : c))
        : [...prev, channel];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setAllChannels((prev) => {
      if (channel.type !== "public") {
        return prev.filter((c) => c.id !== channel.id);
      }
      const exists = prev.some((c) => c.id === channel.id);
      const next = exists
        ? prev.map((c) => (c.id === channel.id ? channel : c))
        : [...prev, channel];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setActiveChannel((prev) => (prev && prev.id === channel.id ? { ...prev, ...channel } : prev));
  }

  async function handleAddMember(userId) {
    const { channel } = await api.addChannelMember(activeChannel.id, userId);
    upsertChannel(channel);
  }

  async function handleRemoveMember(userId) {
    if (!activeChannel) return;
    const { channel } = await api.removeChannelMember(activeChannel.id, userId);
    upsertChannel(channel);
  }

  async function handlePromoteManager(userId) {
    if (!activeChannel) return;
    const { channel } = await api.promoteChannelManager(activeChannel.id, userId);
    upsertChannel(channel);
  }

  async function handleChangeVisibility(channel, type) {
    const { channel: updated } = await api.setChannelVisibility(channel.id, type);
    upsertChannel(updated);
  }

  async function handleLeaveChannel(channel, managerId) {
    // #general is the default channel — leaving it isn't allowed.
    if ((channel.name || "").toLowerCase() === "general") return;
    await api.leaveChannel(channel.id, managerId);
    setHidden((prev) => persistHidden(new Set(prev).add(channel.id)));
    if (channel.type === "private") {
      api.getSaved().then(({ items }) => setSavedIds(new Set(items.map((item) => item.id)))).catch(() => {});
    }
    const { channels } = await api.listChannels();
    setChannels(channels);
    if (activeChannel?.id === channel.id) {
      const fallback = channels[0] || null;
      setActiveChannel(fallback);
      setView("home", fallback);
    }
  }

  async function handleDeleteChannel(channel) {
    await api.deleteChannel(channel.id);
    if (channel.type === "private") {
      api.getSaved().then(({ items }) => setSavedIds(new Set(items.map((item) => item.id)))).catch(() => {});
    }
    const { channels } = await api.listChannels();
    setChannels(channels);
    setAllChannels((prev) => prev.filter((candidate) => candidate.id !== channel.id));
    if (activeChannel?.id === channel.id) {
      const fallback = channels[0] || null;
      setActiveChannel(fallback);
      setView("home", fallback);
    }
  }

  // Open (or create) a direct message with another user.
  // Open a user's profile card, resolving by id (avatar/name click) or by
  // username (an @mention click).
  function openProfile(idOrHandle) {
    const key = String(idOrHandle).toLowerCase();
    const u = users.find(
      (x) =>
        x.id === idOrHandle ||
        x.username.toLowerCase() === key ||
        (x.aliases || []).some((alias) => String(alias).toLowerCase() === key)
    );
    if (u) setProfileUser(u);
  }

  function activeWorkspacePath() {
    return workspacePath({
      view,
      convId: activeChannel?.id || null,
      convName: conversationRouteName(activeChannel),
      convType: activeChannel?.type || null,
      searchQuery,
    });
  }

  // Route-backed overlays retain the workspace path underneath, so Back closes
  // them and a refresh still has a deterministic fallback.
  function openSettings() {
    navigate("/settings", { state: { workspacePath: activeWorkspacePath() } });
  }
  function closeSettings() {
    if (location.pathname === "/settings" && location.state?.workspacePath) navigate(-1);
    else if (location.pathname === "/settings") navigate(activeWorkspacePath(), { replace: true });
    else setShowSettings(false);
  }
  function openApiDocs() {
    navigate("/api-docs", { state: { workspacePath: activeWorkspacePath() } });
  }
  function closeApiDocs() {
    if (location.pathname === "/api-docs" && location.state?.workspacePath) navigate(-1);
    else if (location.pathname === "/api-docs") navigate(activeWorkspacePath(), { replace: true });
    else setShowApiDocs(false);
  }

  async function handleOpenDm(target, isSelf = false, destination = "dms", existingChannel = null) {
    markNavDuringRestore();
    clearNavigationTarget();
    setSearchQuery(null);
    const channel = existingChannel || (await api.openDm(target.id)).channel;
    const existing = dms.find((d) => d.id === channel.id);
    const activeDm = {
      ...channel,
      type: "dm",
      dmName: isSelf ? `${target.displayName} (you)` : target.displayName,
      dmUsername: target.username,
      dmUserId: target.id,
      isSelf,
    };
    setActiveChannel(activeDm);
    setView(destination, activeDm);
    if (!scrollStates[channel.id] && (!existing || (existing.unread || 0) === 0)) {
      setScrollToBottomTarget((prev) => ({ id: (prev?.id || 0) + 1, channelId: channel.id }));
    }
    refreshDms();
  }

  async function handlePrepareDm(target) {
    const { channel } = await api.openDm(target.id);
    return {
      ...channel,
      type: "dm",
      dmName: target.displayName,
      dmUsername: target.username,
      dmUserId: target.id,
    };
  }

  async function handleStartDm(target, channel) {
    await handleOpenDm(target, false, "dms", channel);
  }

  async function handleHideDm(conv) {
    if (vipIds.has(conv.withUser.id)) return;
    await api.hideDm(conv.id);
    setDms((prev) => prev.filter((d) => d.id !== conv.id));
    if (activeChannel?.id === conv.id) {
      const fallback = channels[0] || null;
      setActiveChannel(fallback);
      setView("home", fallback);
    }
  }

  function persistHidden(set) {
    writeJson(HIDDEN_KEY, [...set]);
    return set;
  }
  function handleHideChannel(id) {
    setHidden((prev) => persistHidden(new Set(prev).add(id)));
    if (activeChannel?.id === id) {
      setActiveChannel(null);
      setView("home", null);
    }
  }
  function unhideChannel(id) {
    setHidden((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return persistHidden(n);
    });
  }

  function handlePickChannel(picked) {
    markNavDuringRestore();
    clearNavigationTarget();
    setSearchQuery(null);
    unhideChannel(picked.id); // re-show if it was hidden
    // Open it (preview if you're not a member — a Join button will appear).
    const full = channels.find((c) => c.id === picked.id) || allChannels.find((c) => c.id === picked.id) || picked;
    setActiveChannel(full);
    setView("home", full);
    rememberRecent({ type: "channel", id: picked.id, name: picked.name });
  }

  async function handleOpenChannelTag(name) {
    let picked = visibleChannels.find((channel) => channel.type === "public" && channel.name === name);
    if (!picked) {
      picked = await api.getChannelByName(name).then(({ channel }) => channel).catch(() => null);
      if (picked?.type === "public") cacheCatalogChannels([picked]);
    }
    if (picked) handlePickChannel(picked);
  }

  async function handleJoinChannel(channel) {
    await api.joinChannel(channel.id);
    const { channels: fresh } = await api.listChannels();
    setChannels(fresh);
    const joined = fresh.find((c) => c.id === channel.id) || channel;
    setActiveChannel(joined);
    cacheCatalogChannels([{ ...joined, joined: true }]);
    return joined;
  }

  function handlePickUser(picked) {
    markNavDuringRestore();
    handleOpenDm(picked);
    rememberRecent({ type: "user", id: picked.id, displayName: picked.displayName, username: picked.username });
  }

  function resolveJumpChannel({ channelId, channelType, channelName }) {
    const knownChannel =
      channels.find((c) => c.id === channelId) || allChannels.find((c) => c.id === channelId);
    if (knownChannel) return knownChannel;
    if (channelType === "public") {
      return {
        id: channelId,
        type: "public",
        name: channelName || "",
        members: [],
      };
    }
    return null;
  }

  // Jump from the Activity feed to the conversation. The item may be a channel
  // you're in, a DM, or a public channel you haven't joined — handle all three
  // (previously only member channels opened, so DM activity did nothing). If the
  // item is a thread reply, also open its thread so it gets marked read (a
  // thread mention stays unread until the thread itself is opened).
  async function handleJump(item) {
    markNavDuringRestore();
    const channelId = typeof item === "string" ? item : item.channelId;
    // Channel add/remove activity entries are navigation events, not
    // messages. Their `id` is a synthetic activity-event id and must not be
    // sent to the message-centering endpoint.
    const messageId =
      typeof item === "string"
        ? null
        : item.kind === "channel_add" || item.kind === "channel_remove"
        ? null
        : item.messageId || item.id;
    const threadId = typeof item === "string" ? null : item.threadId;
    const channelType = typeof item === "string" ? null : item.channelType;
    const channelName = typeof item === "string" ? null : item.channelName;
    clearNavigationTarget();
    setSearchQuery(null);
    if (messageId || threadId) clearScrollState(channelId);

    let opened = false;
    const channel = resolveJumpChannel({ channelId, channelType, channelName });
    if (channel) {
      setActiveChannel(channel);
      setView("home", channel);
      opened = true;
    } else {
      let dm = dms.find((d) => d.id === channelId);
      // Hidden DMs are omitted from /dms, but the current user remains a
      // member and can still access the conversation and its messages.
      if (!dm && channelType === "dm") {
        try {
          const result = await api.getChannel(channelId);
          const other = (result.members || []).find((member) => member.id !== user.id)
            || (result.channel?.members?.length === 1 ? user : null);
          if (result.channel?.type === "dm" && other) {
            dm = { id: result.channel.id, withUser: other };
          }
        } catch {
          /* fall through to the access error below */
        }
      }
      if (dm) {
        const activeDm = { id: dm.id, type: "dm", dmName: dm.withUser.displayName, dmUserId: dm.withUser.id };
        setActiveChannel(activeDm);
        setView("dms", activeDm);
        opened = true;
      }
    }
    if (!opened) setToast("You don't have access to that conversation.");

    if (opened && threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
    if (opened && messageId && !threadId) setJumpMessageId(messageId);
  }

  // Run a full-text message search (from the search bar, on Enter).
  function handleSearchMessages(q) {
    markNavDuringRestore();
    setViewState("home");
    setSearchQuery(q);
    navigate(workspacePath({ searchQuery: q }));
  }

  // Jump from a search result to the message in its conversation. Thread
  // replies aren't in the main timeline, so we jump to their thread root.
  function handleSearchJump(result) {
    markNavDuringRestore();
    searchRef.current?.clear();
    handleJumpToMessage({
      channelId: result.channelId,
      messageId: result.parentId || result.id,
      channelType: result.channelType,
      channelName: result.channelName,
    });
  }

  // Whether the user can open a forwarded message's source channel.
  const canJumpToForward = useCallback(
    (ref) => {
      if (!ref?.channelId || !ref?.messageId) return false;
      // If the original lives in the currently open channel, we can always jump
      // back to it, including thread replies inside private channels.
      if (activeChannel?.id === ref.channelId) return true;
      // Otherwise, only originals in public channels are linkable. A message
      // forwarded out of a DM or a private channel is shared as a snapshot only.
      if (ref.channelType !== "public") return false;
      return true;
    },
    [activeChannel]
  );

  // Open the original of a forwarded message. If the user can't access its
  // channel, let them know instead of silently failing.
  const handleJumpToMessage = useCallback(
    (ref, options = {}) => {
      if (!ref?.channelId || !ref?.messageId) return;
      const { channelId, messageId, channelType, channelName, threadId } = ref;
      setSearchQuery(null);
      if (options.focus !== "bottom") clearScrollState(channelId);

      if (options.focus === "bottom") {
        const channel = resolveJumpChannel({ channelId, channelType, channelName });
        const dm = dms.find((d) => d.id === channelId);
        if (channel) {
          setActiveChannel(channel);
          setView("home", channel);
          setScrollToBottomTarget((prev) => ({ id: (prev?.id || 0) + 1, channelId }));
          if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
          return;
        }
        if (dm) {
          const activeDm = {
            id: dm.id,
            type: "dm",
            dmName: dm.withUser.displayName,
            dmUserId: dm.withUser.id,
          };
          setActiveChannel(activeDm);
          setView("dms", activeDm);
          setScrollToBottomTarget((prev) => ({ id: (prev?.id || 0) + 1, channelId }));
          if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
          return;
        }
        setToast("You don't have access to that conversation.");
        return;
      }

      if (channelType === "dm") {
        const conv = dms.find((d) => d.id === channelId);
        if (!conv) return setToast("This was forwarded from a direct message you're not part of.");
        const activeDm = {
          id: conv.id,
          type: "dm",
          dmName: conv.withUser.displayName,
          dmUserId: conv.withUser.id,
        };
        setActiveChannel(activeDm);
        setView("dms", activeDm);
        if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
        else setJumpMessageId(messageId);
        return;
      }

      // Public channels are browsable; private channels only if you're a member.
      const channel = resolveJumpChannel({ channelId, channelType, channelName });
      if (!channel) {
        return setToast("You don't have access to the channel this message was forwarded from.");
      }
      setActiveChannel(channel);
      setView("home", channel);
      if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
      else setJumpMessageId(messageId);
    },
    [activeChannel, channels, dms, allChannels]
  );

  // Toggle a message's saved ("save for later") state, optimistically.
  function handleToggleSave(messageId) {
    const wasSaved = savedIds.has(messageId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    if (wasSaved) {
      queryClient.setQueryData(queryKeys.saved, (items = []) =>
        items.filter((item) => item.id !== messageId)
      );
    }
    api.toggleSaved(messageId)
      .catch(() => {
        // Roll back on failure.
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (next.has(messageId)) next.delete(messageId);
          else next.add(messageId);
          return next;
        });
      })
      .finally(() => queryClient.invalidateQueries({ queryKey: queryKeys.saved }));
  }

  // Toggle a user's VIP status, optimistically.
  function handleToggleVip(userId) {
    const wasVip = vipIds.has(userId);
    setVipIds((prev) => {
      const next = new Set(prev);
      wasVip ? next.delete(userId) : next.add(userId);
      return next;
    });
    api.toggleVip(userId).then(({ vip }) => {
      setVipIds((prev) => {
        const next = new Set(prev);
        if (vip) next.add(userId);
        else next.delete(userId);
        return next;
      });
      refreshDms();
    }).catch(() => {
      setVipIds((prev) => {
        const next = new Set(prev);
        if (wasVip) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
  }

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  // First-run walkthrough: shown once per account (tracked server-side so it
  // follows the user across browsers), after the workspace has had a moment to
  // render so the tour can spotlight real elements.
  useEffect(() => {
    if (loading || !user || user.onboarded) return;
    const t = setTimeout(() => setShowTour(true), 700);
    return () => clearTimeout(t);
  }, [loading, user]);

  function finishTour() {
    setShowTour(false);
    setUser((prev) => (prev ? { ...prev, onboarded: true } : prev));
    api.markOnboarded().catch(() => {});

    // The tour's final/skip button is a user gesture, so request permission
    // here while browsers still allow the prompt. A grant also opts the user
    // into notifications by default; blocked or unsupported browsers stay
    // unchanged and can be revisited from Settings.
    if (!notifySupported()) return;
    if (notifyPermission() === "granted") {
      setNotifyPref(true);
    } else if (notifyPermission() === "default") {
      requestNotifyPermission()
        .then((permission) => permission === "granted" && setNotifyPref(true))
        .catch(() => {});
    }
  }

  // Emoji set used everywhere: built-in Git workflow emoji, avatar emoji for
  // users with profile pictures, and workspace uploads. Uploads come last so
  // an intentional workspace customization wins on any name clash.
  const emojis = useMemo(() => {
    const userEmojis = users
      .filter((u) => u.avatarUrl)
      .map((u) => ({ id: `user:${u.id}`, name: u.username, url: u.avatarUrl, isUser: true }));
    return [...BUILT_IN_GIT_EMOJIS, ...userEmojis, ...customEmojis];
  }, [users, customEmojis]);
  const activeUnreadCount = activeChannel
    ? (activeChannel.type === "dm"
        ? dms.find((d) => d.id === activeChannel.id)?.unread || 0
        : channels.find((c) => c.id === activeChannel.id)?.unread || 0)
    : 0;
  const activeInitialScrollState =
    activeChannel && activeUnreadCount === 0 ? scrollStates[activeChannel.id] || null : null;

  if (loading) {
    return (
      <div className="centered" role="status">
        {startupUnavailable ? "Echo is restarting… reconnecting automatically." : "Loading…"}
      </div>
    );
  }
  if (!user) return <Login onAuthed={handleAuthed} initialError={rhssoError} />;
  // Account is on an admin-issued one-time password — force a new one first.
  if (user.mustResetPassword) {
    return (
      <ForcePasswordReset
        user={user}
        onDone={(updated) => setUser((prev) => ({ ...prev, ...updated }))}
        onCancel={handleLogout}
      />
    );
  }

  return (
    <div className="app-shell">
      {connectionBannerVisible && hasConnectionIssue && (
        <div
          className={`connection-banner ${connectionStatus === "recovering" ? "is-recovering" : "is-reconnecting"}`}
          role="status"
          aria-live="polite"
        >
          <span className="connection-banner-dot" aria-hidden="true" />
          <span className="connection-banner-title">
            {connectionStatus === "recovering" ? "Connection restored" : "Reconnecting to Echo"}
          </span>
          <span className="connection-banner-detail">
            {connectionStatus === "recovering"
              ? "Syncing recent messages…"
              : "Messages will sync automatically."}
          </span>
        </div>
      )}
      <div className={`app ${navOpen ? "nav-open" : ""}`}>
        <WorkspaceNavigation
          view={view}
          user={user}
          channels={channels}
          dms={dms}
          hidden={hidden}
          vipIds={vipIds}
          onlineIds={onlineIds}
          activeChannel={activeChannel}
          activityBadge={activityBadge}
          forceSidebar={!!searchQuery}
          publicChannelCount={catalogCounts?.all}
          mode={mode}
          onSelectView={handleViewSelect}
          onSelectChannel={handleSidebarSelect}
          onPrefetchChannel={prefetchMessages}
          onCreateChannel={() => setShowCreate(true)}
          onBrowseChannels={handleBrowseChannels}
          onStartConversation={handleStartConversation}
          onOpenDm={handleSidebarOpenDm}
          onHideDm={handleHideDm}
          onHideChannel={handleHideChannel}
          onLogout={handleLogout}
          onOpenSettings={openSettings}
          onOpenApiDocs={openApiDocs}
          onToggleMode={toggleMode}
        />

        {/* Backdrop closes the nav drawer on narrow screens. */}
        <div className="nav-backdrop" onClick={() => setNavOpen(false)} />

        <WorkspaceContent
          view={view}
          onOpenNavigation={() => setNavOpen(true)}
          search={{
            inputRef: searchRef,
            query: searchQuery,
            channels: visibleChannels,
            myChannelIds,
            recents,
            onPickChannel: handlePickChannel,
            onFindChannels: findPublicChannels,
            onPickUser: handlePickUser,
            onAddPeople: () => setShowAddPeople(true),
            onSearchMessages: handleSearchMessages,
            onJump: handleSearchJump,
            onClose: () => {
              searchRef.current?.clear();
              setSearchQuery(null);
              navigate(workspacePath({
                view,
                convId: activeChannel?.id || null,
                convName: conversationRouteName(activeChannel),
                convType: activeChannel?.type || null,
              }));
            },
          }}
          browse={{
            joinedIds: myPublicChannelIdSet,
            hiddenIds: hidden,
            onOpen: (channel) => {
              handlePickChannel(channel);
              setNavOpen(false);
            },
            onJoin: handleJoinChannel,
            onCreate: () => setShowCreate(true),
            onCatalog: cacheCatalogChannels,
            onCounts: setCatalogCounts,
          }}
          feeds={{
            user,
            users,
            emojis,
            onJump: handleJump,
            onActivityLoaded: syncActivity,
            onUnsave: (id) => setSavedIds((previous) => {
              const next = new Set(previous);
              next.delete(id);
              return next;
            }),
          }}
          conversation={{
            channel: activeChannel,
            recoveryEpoch,
            cachedMessages: activeChannel ? getCachedMessages(activeChannel.id) : null,
            initialScrollState: activeInitialScrollState,
            hasUnread: activeUnreadCount > 0,
            user,
            users,
            channels: visibleChannels,
            dms,
            customEmojis: emojis,
            mode,
            savedIds,
            onToggleSave: handleToggleSave,
            onCacheMessages: cacheMessages,
            onRememberScroll: rememberScrollState,
            onScrollToBottomTargetConsumed: clearScrollToBottomTarget,
            onOpenProfile: openProfile,
            onOpenChannel: handleOpenChannelTag,
            onOpenForwardedDm: (target, channel) => handleOpenDm(target, false, "dms", channel),
            onToast: setToast,
            onDmsChanged: refreshDms,
            isVip: activeChannel?.type === "dm" && vipIds.has(activeChannel.dmUserId),
            onToggleVip: handleToggleVip,
            jumpMessageId,
            scrollToBottomTarget,
            canJumpToForward,
            onJumpToMessage: handleJumpToMessage,
            onJumpConsumed: () => setJumpMessageId(null),
            onAddCustomEmoji: () => setShowAddEmoji(true),
            onAddPeople: () => setShowAddPeople(true),
            onPromoteManager: handlePromoteManager,
            onRemoveMember: handleRemoveMember,
            onLeave: handleLeaveChannel,
            onDeleteChannel: handleDeleteChannel,
            onChangeVisibility: handleChangeVisibility,
            onChannelUpdated: upsertChannel,
            onJoin: handleJoinChannel,
            onRead: handleRead,
            onThreadRead: clearThreadActivity,
            openThreadId: activeChannel && openThreadReq?.channelId === activeChannel.id ? openThreadReq.rootId : null,
            openThreadJumpMessageId: activeChannel && openThreadReq?.channelId === activeChannel.id ? openThreadReq.messageId : null,
            onThreadOpened: () => setOpenThreadReq(null),
          }}
        />
      </div>
      <WorkspaceOverlays
        user={user}
        users={users}
        activeChannel={activeChannel}
        customEmojis={customEmojis}
        onlineIds={onlineIds}
        vipIds={vipIds}
        theme={theme}
        themes={THEMES}
        mode={mode}
        showCreate={showCreate}
        showNewMessage={showNewMessage}
        showAddPeople={showAddPeople}
        showAddEmoji={showAddEmoji}
        showSettings={showSettings}
        showApiDocs={showApiDocs}
        profileUser={profileUser}
        showTour={showTour}
        toast={toast}
        onCreateChannel={handleCreateChannel}
        onStartDm={handleStartDm}
        onPrepareDm={handlePrepareDm}
        onAddMember={handleAddMember}
        onEmojiCreated={handleEmojiCreated}
        onSelectTheme={setTheme}
        onSelectMode={setMode}
        onUserUpdated={(updated) => setUser((previous) => ({ ...previous, ...updated }))}
        onToggleVip={handleToggleVip}
        onOpenDm={(target) => {
          setProfileUser(null);
          handleOpenDm(target);
        }}
        onReplayTour={() => {
          closeSettings();
          setNavOpen(false);
          setShowTour(true);
        }}
        onFinishTour={finishTour}
        onClose={{
          create: () => setShowCreate(false),
          newMessage: () => setShowNewMessage(false),
          addPeople: () => setShowAddPeople(false),
          addEmoji: () => setShowAddEmoji(false),
          settings: closeSettings,
          apiDocs: closeApiDocs,
          profile: () => setProfileUser(null),
          toast: () => setToast(null),
        }}
      />
    </div>
  );
}
