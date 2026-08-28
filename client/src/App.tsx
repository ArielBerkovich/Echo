import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { api, consumeRhssoCallback, getToken, restoreNativeToken, setToken, subscribeAuthExpired } from "./api.js";
import { disconnectSocket } from "./socket.js";
import { useRealtime } from "./lib/useRealtime.js";
import Login from "./components/Login.js";
import ForcePasswordReset from "./components/ForcePasswordReset.js";
import WorkspaceNavigation from "./components/WorkspaceNavigation.js";
import WorkspaceOverlays from "./components/WorkspaceOverlays.js";
import WorkspaceContent from "./components/WorkspaceContent.js";
import SessionExpiredDialog from "./components/SessionExpiredDialog.js";
import { readJson, readString, writeJson, writeString } from "./lib/storage.js";
import { notifyPermission, notifySupported, requestNotifyPermission, setNotifyPref } from "./lib/notify.js";
import { BUILT_IN_GIT_EMOJIS } from "./lib/gitEmojis.js";
import { THEMES, useThemePreferences } from "./lib/useThemePreferences.js";
import { useConversationCache } from "./lib/useConversationCache.js";
import { useWorkspaceQueries, workspaceKeys } from "./lib/useWorkspaceQueries.js";
import { queryKeys } from "./lib/queryClient.js";
import { currentRoute, workspacePath } from "./lib/workspaceRoutes.js";
import { useHotkeys } from "react-hotkeys-hook";

const HIDDEN_KEY = "echo.hiddenChannels";
function loadHidden() {
  return new Set(readJson(HIDDEN_KEY, []));
}

const RECENTS_KEY = "echo.recentSearches";
const RECENTS_KEY_PREFIX = "echo.recentSearches.user.";
const CONNECTION_BANNER_DELAY_MS = 1000;
const GLOBAL_HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: true,
  enableOnContentEditable: true,
};

function modifierHotkeys(combo) {
  return [`ctrl+${combo}`, `meta+${combo}`];
}

function isEditableTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable
    || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function normalizeRecents(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter((recent) => {
    if (!recent || !["channel", "user"].includes(recent.type) || !recent.id) return false;
    const key = `${recent.type}:${recent.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function recentStorageKey(userId) {
  return `${RECENTS_KEY_PREFIX}${userId}`;
}

function isGroupDmChannel(channel) {
  return channel?.type === "dm"
    && (channel.members?.length > 2 || channel.participants?.length > 2);
}

export default function App() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [rhssoError] = useState(() => consumeRhssoCallback());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startupUnavailable, setStartupUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [allChannels, setAllChannels] = useState([]); // bounded cache of public channel summaries
  const [catalogCounts, setCatalogCounts] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [recents, setRecents] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [showAddEmoji, setShowAddEmoji] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false); // REST API reference page
  const [profileUser, setProfileUser] = useState(null); // user whose profile card is open
  const [hidden, setHidden] = useState(loadHidden); // hidden channel ids
  const [view, setViewState] = useState("home"); // home | browse | dms | activity | saved | settings
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
    workspace,
    setWorkspace,
    workspaceQuery,
    customEmojis,
    setCustomEmojis,
    savedIds,
    setSavedIds,
    starredIds,
    setStarredIds,
    starredChannelIds,
    setStarredChannelIds,
    activityItems,
  } = useWorkspaceQueries(!!user);
  const [navOpen, setNavOpen] = useState(false); // mobile: rail+sidebar drawer open?
  const [showTour, setShowTour] = useState(false); // first-run walkthrough
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);

  useEffect(() => subscribeAuthExpired(() => setSessionExpired(true)), []);
  useEffect(() => {
    // Explicitly close realtime connections before Playwright/browser teardown
    // so a page with an active WebSocket does not keep the context alive.
    window.addEventListener("beforeunload", disconnectSocket);
    return () => window.removeEventListener("beforeunload", disconnectSocket);
  }, []);
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

  useEffect(() => {
    document.title = workspace?.name && workspace.name !== "Echo" ? `Echo · ${workspace.name}` : "Echo";
  }, [workspace?.name]);
  const markReadAtRef = useRef({}); // channelId -> last markRead time (throttle)
  const markReadTimerRef = useRef({}); // channelId -> trailing markRead timer
  const restoredRef = useRef(false); // have we restored the saved location yet?
  const restoredUserRef = useRef(null);
  const navDuringRestoreRef = useRef(false); // user navigated before the initial restore finished
  const viewRef = useRef(view);
  const activeChannelRef = useRef(activeChannel);
  const lastConversationRef = useRef(null);

  const hotkeyOptions = { ...GLOBAL_HOTKEY_OPTIONS, enabled: !!user };
  useHotkeys(modifierHotkeys("f"), () => searchRef.current?.focus(), hotkeyOptions, [user]);
  useHotkeys(modifierHotkeys("shift+m"), () => handleStartConversation(), hotkeyOptions, [user]);
  useHotkeys(modifierHotkeys("shift+o"), () => handleBrowseChannels(), hotkeyOptions, [user]);
  useHotkeys(modifierHotkeys("shift+c"), () => setShowCreate(true), hotkeyOptions, [user]);
  useHotkeys(modifierHotkeys("shift+space"), (event) => {
    if (isEditableTarget(event.target) || !activeChannel) return;
    setComposerFocusRequest((request) => request + 1);
  }, hotkeyOptions, [user, activeChannel]);
  useHotkeys(modifierHotkeys("shift+h"), () => handleViewSelect("home"), hotkeyOptions, [user]);
  useHotkeys(modifierHotkeys("shift+d"), () => handleViewSelect("dms"), hotkeyOptions, [user]);
  useHotkeys(modifierHotkeys("shift+a"), () => handleViewSelect("activity"), hotkeyOptions, [user]);
  useHotkeys(modifierHotkeys("shift+s"), () => handleViewSelect("saved"), hotkeyOptions, [user]);
  useHotkeys(["ctrl+comma", "meta+comma"], () => openSettings(), hotkeyOptions, [user]);

  // Echo's own images should not become native drag sources. This keeps
  // logos, avatars, and message images from being dropped into the composer;
  // files dragged from outside the app still arrive through the file-drop
  // handlers.
  useEffect(() => {
    function preventInternalImageDrag(event) {
      if (event.target instanceof HTMLImageElement) event.preventDefault();
    }

    document.addEventListener("dragstart", preventInternalImageDrag, true);
    return () => document.removeEventListener("dragstart", preventInternalImageDrag, true);
  }, []);

  useEffect(() => void (viewRef.current = view), [view]);
  useEffect(() => void (activeChannelRef.current = activeChannel), [activeChannel]);
  useEffect(() => {
    if (activeChannel && (view === "home" || view === "dms")) {
      lastConversationRef.current = activeChannel;
    }
  }, [view, activeChannel]);

  // Activity is a transient full-page view. Keep the selected conversation's
  // history warm while it is open so returning to Home can render from the
  // React Query cache instead of waiting on the messages request.
  useEffect(() => {
    if (view !== "activity" || !activeChannel?.id) return;
    prefetchMessages(activeChannel.id);
  }, [view, activeChannel?.id, prefetchMessages]);

  // Recents are a client-side cache. Scope them to the signed-in account and
  // reconcile old entries against the current server snapshot so a deployment
  // reset cannot leave deleted users or channels in the search UI.
  useEffect(() => {
    if (!user || !channelsQuery.isSuccess || !dmsQuery.isSuccess || !usersQuery.isSuccess) return;
    const scopedKey = recentStorageKey(user.id);
    const scopedValue = readJson(scopedKey, null);
    const legacyValue = scopedValue === null ? readJson(RECENTS_KEY, []) : scopedValue;
    const knownChannelIds = new Set([...channels, ...allChannels].map((channel) => channel.id));
    const knownUserIds = new Set(users.map((candidate) => candidate.id));
    const next = normalizeRecents(legacyValue).filter((recent) =>
      recent.type === "channel" ? knownChannelIds.has(recent.id) : knownUserIds.has(recent.id)
    );
    setRecents(next);
    writeJson(scopedKey, next);
    if (scopedValue === null && readString(RECENTS_KEY, null) !== null) writeString(RECENTS_KEY, null);
  }, [user, channelsQuery.isSuccess, dmsQuery.isSuccess, usersQuery.isSuccess, channels, allChannels, users]);

  function markNavDuringRestore() {
    if (!restoredRef.current) navDuringRestoreRef.current = true;
  }

  function conversationRouteName(channel) {
    if (!channel) return null;
    if (channel.type !== "dm") return channel.name || null;
    return channel.dmUsername
      || users.find((candidate) => candidate.id === channel.dmUserId)?.username
      || channel.dmName
      || null;
  }

  function dmRouteName(conversation) {
    if (!conversation) return null;
    if (!conversation.isGroup) return conversation.withUser?.username || null;
    const people = (conversation.participants || []).filter((person) => person.id !== user.id);
    return conversation.name?.startsWith("dm-")
      ? people.map((person) => person.displayName).join(", ")
      : conversation.name;
  }

  function activeDmFromConversation(conversation) {
    const participants = conversation.participants || (conversation.withUser ? [conversation.withUser] : []);
    const people = participants.filter((person) => person.id !== user.id);
    const isGroup = conversation.isGroup || people.length > 1;
    return {
      id: conversation.id,
      type: "dm",
      name: conversation.name,
      dmName: isGroup ? (conversation.name?.startsWith("dm-") ? people.map((person) => person.displayName).join(", ") : conversation.name) : conversation.withUser?.displayName,
      dmUsername: isGroup ? undefined : conversation.withUser?.username,
      dmUserId: isGroup ? undefined : conversation.withUser?.id,
      participants,
      members: participants.map((person) => person.id),
      memberCount: conversation.memberCount ?? participants.length,
      createdBy: conversation.createdBy,
      isSelf: conversation.isSelf,
    };
  }

  function setView(nextView, channel = activeChannelRef.current, options = {}) {
    const { messageId, threadId, ...navigationOptions } = options;
    setViewState(nextView);
    const destination = workspacePath({
      view: nextView,
      convId: channel?.id || null,
      convName: conversationRouteName(channel),
      convType: channel?.type || null,
      messageId,
      threadId,
    });
    navigate(destination, navigationOptions);
  }

  // Jump targets belong to the conversation that created them. Clear them
  // before ordinary navigation so a failed/stale target cannot be retried in
  // the next channel.
  function clearNavigationTarget() {
    setJumpMessageId(null);
    setOpenThreadReq(null);
    setScrollToBottomTarget(null);
  }

  function handleActivityReady() {
    api.markActivityRead()
      .then(() => api.getActivity())
      .then(({ items }) => syncActivity(items || []))
      .catch(() => {})
      .finally(() => queryClient.invalidateQueries({ queryKey: queryKeys.activity }));
  }

  function handleViewSelect(nextView) {
    markNavDuringRestore();
    clearNavigationTarget();
    searchRef.current?.clear();
    setSearchQuery(null);
    if (nextView === "dms") {
      setActiveChannel(null);
      setView(nextView, null);
    } else if (nextView === "home") {
      // Keep the last channel selected on desktop while visiting full-page
      // views. On mobile, Home is the channel picker and must reveal the
      // navigation drawer instead of leaving the active conversation open.
      if (isMobileViewport()) {
        setActiveChannel(null);
        setView(nextView, null);
      } else {
        const homeChannel = activeChannelRef.current
          || lastConversationRef.current
          || channels.find((channel) => channel.name.toLowerCase() === "general")
          || channels[0]
          || null;
        // Begin loading the selected conversation before Home mounts it. The
        // ChannelView fetch joins this React Query request instead of creating
        // a sequential navigation → fetch waterfall.
        prefetchMessages(homeChannel?.id);
        setView(nextView, homeChannel);
      }
    } else {
      setView(nextView);
    }
    setNavOpen(false);
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
      starredIds,
      setChannels,
      setAllChannels: updateCatalogCache,
      setDms,
      setUsers,
      setCustomEmojis,
      setSavedIds,
      setStarredIds,
      setStarredChannelIds,
      setView,
      setActiveChannel,
      setProfileUser,
      refreshChannels,
      refreshDms,
      onAuthInvalid: () => setSessionExpired(true),
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
    let cancelled = false;
    let retryTimer = null;
    let retryDelay = 1000;

    const restore = async () => {
      try {
        // Electron localStorage can be reset when its file origin changes
        // (for example after an installed-app update). Recover the session
        // from the native encrypted store before deciding that login is needed.
        await restoreNativeToken();
        if (!getToken()) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { user } = await api.me();
        if (cancelled) return;
        setUser(user);
        setStartupUnavailable(false);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        if (error?.status === 401) {
          // Keep the session visible until the user acknowledges the expiry.
          setSessionExpired(true);
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
    const elapsed = now - (markReadAtRef.current[channelId] || 0);
    if (elapsed < 1500) {
      clearTimeout(markReadTimerRef.current[channelId]);
      markReadTimerRef.current[channelId] = setTimeout(() => {
        markReadTimerRef.current[channelId] = null;
        markReadAtRef.current[channelId] = Date.now();
        api.markRead(channelId).catch(() => {});
      }, 1500 - elapsed);
      return;
    }
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
    const rememberedChannel = activeChannelRef.current;
    let active = isMobileViewport()
      ? null
      : rememberedChannel
        || chs.find((channel) => channel.name.toLowerCase() === "general")
        || chs[0]
        || null;
    if (saved?.view === "browse") {
      nextView = "browse";
      active = chs.find((channel) => channel.id === saved.convId) || active;
    } else if (saved?.view === "activity" || saved?.view === "saved" || saved?.view === "settings") {
      nextView = saved.view; // full-page views, no conversation needed
    } else if (!isMobileViewport() && saved?.convType === "dm" && saved.convId) {
      const dm = conversations.find((d) => d.id === saved.convId);
      if (dm) {
        nextView = "dms";
        active = activeDmFromConversation(dm);
      }
    } else if (!isMobileViewport() && saved?.convId) {
      const ch = chs.find((c) => c.id === saved.convId);
      if (ch) {
        nextView = saved.view === "dms" ? "dms" : "home";
        active = ch;
      }
    } else if (saved?.view === "dms") {
      nextView = "dms";
      active = null;
    }
    setViewState(nextView);
    setActiveChannel(active);
  }

  async function applyRouteLocation(route, chs, conversations) {
    setShowSettings(false);
    setShowApiDocs(route.overlay === "api-docs");
    setSearchQuery(route.searchQuery);
    const applyRouteMessageTarget = (channelId) => {
      if (route.messageId && route.threadId) {
        setJumpMessageId(null);
        setOpenThreadReq({ channelId, rootId: route.threadId, messageId: route.messageId });
      } else {
        setOpenThreadReq(null);
        setJumpMessageId(route.messageId || null);
      }
    };

    const currentChannel = activeChannelRef.current;
    const routeConversation = route.convId?.toLowerCase();
    if (route.convId && currentChannel?.id === route.convId) {
      setViewState(route.view);
      applyRouteMessageTarget(currentChannel.id);
      return;
    }

    if (route.convType === "dm" && route.convId) {
      let dm = conversations.find((conversation) =>
        conversation.id === route.convId
        || dmRouteName(conversation)?.toLowerCase() === routeConversation
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
        if (result?.channel && result.channel.type !== "dm") {
          const convertedChannel = result.channel;
          setViewState("home");
          setActiveChannel(convertedChannel);
          applyRouteMessageTarget(convertedChannel.id);
          navigate(workspacePath({
            view: "home",
            convId: convertedChannel.id,
            convName: convertedChannel.name,
            convType: convertedChannel.type,
            messageId: route.messageId,
            threadId: route.threadId,
          }), { replace: true });
          return;
        }
        const other = result?.members?.find((member) => member.id !== user.id)
          || (result?.channel?.members?.length === 1 ? user : null);
        if (result?.channel?.type === "dm" && other) dm = { id: result.channel.id, withUser: other };
      }
      if (dm) {
        setViewState(route.view === "home" ? "home" : "dms");
        const activeDm = activeDmFromConversation(dm);
        setActiveChannel(activeDm);
        applyRouteMessageTarget(dm.id);
        if (route.convId !== dm.id) {
          navigate(workspacePath({
            view: route.view === "home" ? "home" : "dms",
            convId: dm.id,
            convName: dm.name,
            convType: "dm",
            messageId: route.messageId,
            threadId: route.threadId,
          }), { replace: true });
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
        applyRouteMessageTarget(channel.id);
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
    setSessionExpired(false);
    sessionStorage.setItem("echo.ssoBypass", "true");
    setToken(null);
    disconnectSocket();
    queryClient.clear();
    restoredUserRef.current = null;
    setUser(null);
    setAllChannels([]);
    setCatalogCounts(null);
    setRecents([]);
    setActiveChannel(null);
    setScrollToBottomTarget(null);
    navigate("/", { replace: true });
  }

  function rememberRecent(item) {
    setRecents((prev) => {
      const next = [item, ...prev.filter((r) => !(r.type === item.type && r.id === item.id))].slice(0, 6);
      if (user?.id) writeJson(recentStorageKey(user.id), next);
      return next;
    });
  }

  async function handleCreateChannel(name, type, readOnly = false) {
    const { channel } = await api.createChannel(name, type, readOnly);
    upsertChannel(channel);
    setActiveChannel(channel);
    setView("home", channel);
  }

  function upsertChannel(channel) {
    const active = activeChannelRef.current;
    const existingDm = channel.type === "dm" ? dms.find((conversation) => conversation.id === channel.id) : null;
    const memberIds = channel.type === "dm" && channel.members?.length
      ? channel.members
      : existingDm?.participants?.map((participant) => participant.id) || [];
    const participantById = new Map([
      ...(existingDm?.participants || []).map((participant) => [participant.id, participant]),
      ...users.map((candidate) => [candidate.id, candidate]),
    ]);
    const participants = channel.type === "dm"
      ? memberIds.map((id) => participantById.get(id)).filter(Boolean)
      : null;
    const updatedChannel = channel.type === "dm" && participants.length > 2
      ? {
          ...channel,
          participants,
          dmName: channel.name?.startsWith("dm-")
            ? participants.filter((participant) => participant.id !== user.id).map((participant) => participant.displayName).join(", ")
            : channel.name,
        }
      : channel;
    if (active?.id === updatedChannel.id && active.name !== updatedChannel.name) {
      navigate(workspacePath({
        view: viewRef.current,
        convId: updatedChannel.id,
        convName: updatedChannel.name,
        convType: updatedChannel.type,
      }), { replace: true });
    }
    setChannels((prev) => {
      const exists = prev.some((c) => c.id === updatedChannel.id);
      const next = exists
        ? prev.map((c) => (c.id === updatedChannel.id ? updatedChannel : c))
        : [...prev, updatedChannel];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setAllChannels((prev) => {
      if (updatedChannel.type !== "public") {
        return prev.filter((c) => c.id !== updatedChannel.id);
      }
      const exists = prev.some((c) => c.id === updatedChannel.id);
      const next = exists
        ? prev.map((c) => (c.id === updatedChannel.id ? updatedChannel : c))
        : [...prev, updatedChannel];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setActiveChannel((prev) => (prev && prev.id === updatedChannel.id ? { ...prev, ...updatedChannel } : prev));
    setDms((prev) => updatedChannel.type === "dm"
      ? prev.map((conversation) => conversation.id === updatedChannel.id ? { ...conversation, ...updatedChannel } : conversation)
      : prev.filter((conversation) => conversation.id !== updatedChannel.id));
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

  function channelFallbackAfterRemoval(nextChannels) {
    if (isMobileViewport()) return null;
    return nextChannels.find((candidate) => candidate.name?.toLowerCase() === "general")
      || nextChannels[0]
      || null;
  }

  async function handleLeaveChannel(channel, managerId) {
    // #general is the default channel — leaving it isn't allowed.
    if ((channel.name || "").toLowerCase() === "general") return;
    const { channel: updated } = await api.leaveChannel(channel.id, managerId);
    setStarredChannelIds((prev) => {
      if (!prev.has(channel.id)) return prev;
      const next = new Set(prev);
      next.delete(channel.id);
      return next;
    });
    setHidden((prev) => persistHidden(new Set(prev).add(channel.id)));
    if (channel.type === "private") {
      api.getSaved().then(({ items }) => setSavedIds(new Set(items.map((item) => item.id)))).catch(() => {});
    }
    const { channels } = await api.listChannels();
    setChannels(channels);
    if (activeChannel?.id === channel.id) {
      setActiveChannel(updated);
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
      const fallback = channelFallbackAfterRemoval(channels);
      setActiveChannel(fallback);
      setView("home", fallback);
    }
  }

  // Open (or create) a direct message with another user.
  // Open a user's profile card, resolving by id (avatar/name click) or by
  // username (an @mention click).
  async function openProfile(idOrHandle) {
    const key = String(idOrHandle).toLowerCase();
    const u = users.find(
      (x) =>
        x.id === idOrHandle ||
        x.username.toLowerCase() === key ||
        (x.aliases || []).some((alias) => String(alias).toLowerCase() === key)
    );
    if (u) setProfileUser(u);
    else if (idOrHandle) {
      try {
        const result = await api.getUser(idOrHandle);
        if (result.user) setProfileUser(result.user);
      } catch {
        // The author may have been removed; keep the profile action a no-op.
      }
    }
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
    navigate("/settings/account", { state: { workspacePath: activeWorkspacePath() } });
  }
  function closeSettings() {
    if (location.pathname.startsWith("/settings") && location.state?.workspacePath) navigate(-1);
    else if (location.pathname.startsWith("/settings")) navigate(workspacePath({
      view: activeChannel?.type === "dm" ? "dms" : "home",
      convId: activeChannel?.id || null,
      convName: conversationRouteName(activeChannel),
      convType: activeChannel?.type || null,
    }), { replace: true });
    else setShowSettings(false);
  }
  function changeSettingsTab(tab) {
    navigate(`/settings/${tab}`, { replace: true, state: { workspacePath: location.state?.workspacePath || activeWorkspacePath() } });
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
    const channel = existingChannel || (await api.openDm(
      target.participants?.length > 1 ? target.participants.map((participant) => participant.id) : target.id
    )).channel;
    const existing = dms.find((d) => d.id === channel.id);
    const participants = target.participants || existingChannel?.participants || (target.id ? [target] : []);
    const activeDm = {
      ...channel,
      type: "dm",
      dmName: isSelf ? `${target.displayName} (you)` : (participants.length > 1 ? participants.filter((person) => person.id !== user.id).map((person) => person.displayName).join(", ") : target.displayName),
      dmUsername: participants.length > 1 ? undefined : target.username,
      dmUserId: participants.length > 1 ? undefined : target.id,
      participants,
      isSelf,
    };
    setActiveChannel(activeDm);
    setView(destination, activeDm);
    if (!scrollStates[channel.id] && (!existing || (existing.unread || 0) === 0)) {
      setScrollToBottomTarget((prev) => ({ id: (prev?.id || 0) + 1, channelId: channel.id }));
    }
    refreshDms();
  }

  async function handlePrepareDm(targets) {
    const selected = Array.isArray(targets) ? targets : [targets];
    const { channel } = await api.openDm(selected.map((target) => target.id));
    return {
      ...channel,
      type: "dm",
      dmName: selected.map((target) => target.displayName).join(", "),
      dmUsername: selected.length === 1 ? selected[0].username : undefined,
      dmUserId: selected.length === 1 ? selected[0].id : undefined,
      participants: selected,
      isGroup: selected.length > 1,
    };
  }

  async function handleStartDm(targets, channel) {
    const selected = Array.isArray(targets) ? targets : [targets];
    const target = selected.length === 1
      ? selected[0]
      : { participants: selected, displayName: selected.map((item) => item.displayName).join(", ") };
    await handleOpenDm(target, false, "dms", channel);
  }

  async function handleHideDm(conv) {
    if (starredIds.has(conv.withUser.id) || starredChannelIds.has(conv.id)) return;
    await api.hideDm(conv.id);
    setDms((prev) => prev.filter((d) => d.id !== conv.id));
    if (activeChannel?.id === conv.id) {
      setActiveChannel(null);
      setView("dms", null);
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
      setView("home", channel, { messageId, threadId });
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
        const activeDm = activeDmFromConversation(dm);
        setActiveChannel(activeDm);
        setView("dms", activeDm, { messageId, threadId });
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
          setView("home", channel, { messageId, threadId });
          setScrollToBottomTarget((prev) => ({ id: (prev?.id || 0) + 1, channelId }));
          if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
          return;
        }
        if (dm) {
          const activeDm = activeDmFromConversation(dm);
          setActiveChannel(activeDm);
          setView("dms", activeDm, { messageId, threadId });
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
        const activeDm = activeDmFromConversation(conv);
        setActiveChannel(activeDm);
        setView("dms", activeDm, { messageId, threadId });
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
      setView("home", channel, { messageId, threadId });
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

  // Toggle a user's Starred status, optimistically.
  function handleToggleStarred(userId) {
    const wasStarred = starredIds.has(userId);
    setStarredIds((prev) => {
      const next = new Set(prev);
      wasStarred ? next.delete(userId) : next.add(userId);
      return next;
    });
    api.toggleStarred(userId).then(({ starred }) => {
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (starred) next.add(userId);
        else next.delete(userId);
        return next;
      });
      refreshDms();
    }).catch(() => {
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (wasStarred) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
  }

  function handleToggleChannelStarred(channelId) {
    const wasStarred = starredChannelIds.has(channelId);
    setStarredChannelIds((prev) => {
      const next = new Set(prev);
      wasStarred ? next.delete(channelId) : next.add(channelId);
      return next;
    });
    api.toggleChannelStarred(channelId).then(({ starred }) => {
      setStarredChannelIds((prev) => {
        const next = new Set(prev);
        if (starred) next.add(channelId);
        else next.delete(channelId);
        return next;
      });
    }).catch(() => {
      setStarredChannelIds((prev) => {
        const next = new Set(prev);
        if (wasStarred) next.add(channelId);
        else next.delete(channelId);
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
      <>
        <div className="centered" role="status">
          {startupUnavailable ? "Echo is restarting… reconnecting automatically." : "Loading…"}
        </div>
        {sessionExpired ? <SessionExpiredDialog onSignOut={handleLogout} /> : null}
      </>
    );
  }
  if (!user) {
    return (
      <>
        <Login onAuthed={handleAuthed} initialError={rhssoError} />
        {sessionExpired ? <SessionExpiredDialog onSignOut={handleLogout} /> : null}
      </>
    );
  }
  // Account is on an admin-issued one-time password — force a new one first.
  if (user.mustResetPassword) {
    return (
      <>
        <ForcePasswordReset
          user={user}
          onDone={(updated) => setUser((prev) => ({ ...prev, ...updated }))}
          onCancel={handleLogout}
        />
        {sessionExpired ? <SessionExpiredDialog onSignOut={handleLogout} /> : null}
      </>
    );
  }

  return (
    <div className="app-shell">
      {connectionBannerVisible && hasConnectionIssue && (
        <div
          className={`connection-banner ${connectionStatus === "recovering" ? "is-recovering" : "is-reconnecting"}`}
          data-testid="connection-banner"
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
      <div
        className={`app ${navOpen ? "nav-open" : ""}`}
        data-testid="app-root"
        data-nav-open={navOpen ? "true" : "false"}
        data-mobile-nav={isMobileViewport() && !activeChannel && !searchQuery && view !== "browse" ? "true" : "false"}
      >
        <WorkspaceNavigation
          view={view}
          user={user}
          workspace={workspace}
          workspaceLoading={workspaceQuery.isLoading}
          channels={channels}
          dms={dms}
          customEmojis={emojis}
          activityItems={activityItems}
          hidden={hidden}
          starredIds={starredIds}
          starredChannelIds={starredChannelIds}
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
          onToggleChannelStarred={handleToggleChannelStarred}
          onLogout={handleLogout}
          onUpdated={(updated) => setUser((previous) => ({ ...previous, ...updated }))}
          onOpenSettings={openSettings}
          onOpenApiDocs={openApiDocs}
          onToggleMode={toggleMode}
        />

        {/* Backdrop closes the nav drawer on narrow screens. */}
        <div className="nav-backdrop" data-testid="nav-backdrop" onClick={() => setNavOpen(false)} />

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
            onActivityReady: handleActivityReady,
            onUnsave: (id) => setSavedIds((previous) => {
              const next = new Set(previous);
              next.delete(id);
              return next;
            }),
            settings: {
              user,
              workspace,
              onWorkspaceUpdated: setWorkspace,
              users,
              theme,
              themes: THEMES,
              onSelectTheme: setTheme,
              mode,
              onSelectMode: setMode,
              onUpdated: (updated) => setUser((previous) => ({ ...previous, ...updated })),
              onIntegrationsChanged: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.channels }),
              onClose: closeSettings,
              settingsTab: currentRoute(location).settingsTab || "account",
              onSettingsTabChange: changeSettingsTab,
              onOpenApiDocs: openApiDocs,
            },
          }}
          conversation={{
            channel: activeChannel,
            composerFocusRequest,
            recoveryEpoch,
            cachedMessages: activeChannel ? getCachedMessages(activeChannel.id) : null,
            initialScrollState: activeInitialScrollState,
            hasUnread: activeUnreadCount > 0,
            user,
            users,
            channels: visibleChannels,
            forwardChannels: channels,
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
            onSearchInChannel: (channelName) => searchRef.current?.searchInChannel(channelName),
            onOpenForwardedDm: (target, channel) => handleOpenDm(target, false, "dms", channel),
            onRememberRecent: rememberRecent,
            onToast: setToast,
            onDmsChanged: refreshDms,
            isStarred: activeChannel?.type === "dm" && starredIds.has(activeChannel.dmUserId),
            onToggleStarred: handleToggleStarred,
            isChannelStarred: (activeChannel?.type !== "dm" || isGroupDmChannel(activeChannel))
              && starredChannelIds.has(activeChannel?.id),
            onToggleChannelStarred: handleToggleChannelStarred,
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
        starredIds={starredIds}
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
        onToggleStarred={handleToggleStarred}
        onOpenDm={(target) => {
          setProfileUser(null);
          handleOpenDm(target);
        }}
        onOpenApiDocs={openApiDocs}
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
      {sessionExpired ? <SessionExpiredDialog onSignOut={handleLogout} /> : null}
    </div>
  );
}
