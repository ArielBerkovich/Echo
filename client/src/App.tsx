import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, getToken, setToken } from "./api.js";
import { disconnectSocket } from "./socket.js";
import { useRealtime } from "./lib/useRealtime.js";
import Login from "./components/Login.js";
import Sidebar from "./components/Sidebar.js";
import ChannelView from "./components/ChannelView.js";
import CreateChannelModal from "./components/CreateChannelModal.js";
import AddPeopleModal from "./components/AddPeopleModal.js";
import SearchBox from "./components/SearchBox.js";
import LeftRail from "./components/LeftRail.js";
import ActivityFeed from "./components/ActivityFeed.js";
import SavedFeed from "./components/SavedFeed.js";
import UserProfileModal from "./components/UserProfileModal.js";
import ApiDocsPage from "./components/ApiDocsPage.js";
import SearchResults from "./components/SearchResults.js";
import AddEmojiModal from "./components/AddEmojiModal.js";
import SettingsModal from "./components/SettingsModal.js";
import Walkthrough from "./components/Walkthrough.js";
import ForcePasswordReset from "./components/ForcePasswordReset.js";
import EmojiEffects from "./components/EmojiEffects.js";
import { readJson, readString, writeJson, writeString } from "./lib/storage.js";
import { notifyPermission, notifySupported, requestNotifyPermission, setNotifyPref } from "./lib/notify.js";

// Colour themes — each is an *identity* (accent + sidebar/rail) that works in
// both light and dark mode. The light/dark mode is chosen independently, so the
// quick toggle darkens/lightens whatever theme you're on. `swatch` = [sidebar,
// surface, accent] preview for the picker.
const THEMES = [
  { id: "nord", label: "Nord", swatch: ["#3b4252", "#2b303b", "#81a1c1"] },
  { id: "aubergine", label: "Aubergine", swatch: ["#4a154b", "#ffffff", "#7a3e83"] },
  { id: "azure", label: "Azure", swatch: ["#0d2444", "#08182e", "#2f81f7"] },
  { id: "midnight", label: "Midnight", swatch: ["#1a1640", "#15132e", "#8b5cf6"] },
  { id: "dracula", label: "Dracula", swatch: ["#343746", "#282a36", "#bd93f9"] },
  { id: "sand", label: "Sand", swatch: ["#5a4632", "#fffdf8", "#c2682a"] },
];
const THEME_IDS = new Set(THEMES.map((t) => t.id));
const DEFAULT_THEME = "nord";

// Resolve the stored theme + mode, defaulting to Nord and migrating any older /
// removed theme id (e.g. "default", "forest", "dark") to the default.
function readThemeMode() {
  const storedMode = readString("echo.mode");
  const storedTheme = readString("echo.theme");
  const theme = THEME_IDS.has(storedTheme) ? storedTheme : DEFAULT_THEME;
  if (storedMode === "light" || storedMode === "dark") {
    return { theme, mode: storedMode };
  }
  // Legacy single-value migration.
  if (!storedTheme || storedTheme === "dark") return { theme: DEFAULT_THEME, mode: "dark" };
  if (storedTheme === "light") return { theme: DEFAULT_THEME, mode: "light" };
  const LEGACY_DARK = new Set(["azure", "midnight", "nord", "dracula"]);
  return { theme, mode: LEGACY_DARK.has(storedTheme) ? "dark" : "light" };
}

const HIDDEN_KEY = "echo.hiddenChannels";
function loadHidden() {
  return new Set(readJson(HIDDEN_KEY, []));
}

function loadScrollStates(userId) {
  return readJson(`echo.scroll.${userId}`, {});
}

const RECENTS_KEY = "echo.recentSearches";

function loadRecents() {
  return readJson(RECENTS_KEY, []);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState([]); // channels you belong to (sidebar)
  const [allChannels, setAllChannels] = useState([]); // public channels (search/browse)
  const [activeChannel, setActiveChannel] = useState(null);
  const [users, setUsers] = useState([]);
  const [dms, setDms] = useState([]);
  const [recents, setRecents] = useState(loadRecents);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [customEmojis, setCustomEmojis] = useState([]);
  const [showAddEmoji, setShowAddEmoji] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false); // REST API reference page
  const [profileUser, setProfileUser] = useState(null); // user whose profile card is open
  const [hidden, setHidden] = useState(loadHidden); // hidden channel ids
  const [view, setView] = useState("home"); // home | dms | activity | saved
  const [savedIds, setSavedIds] = useState(() => new Set()); // saved/bookmarked message ids
  const [vipIds, setVipIds] = useState(() => new Set()); // user ids marked VIP
  const [navOpen, setNavOpen] = useState(false); // mobile: rail+sidebar drawer open?
  const [showTour, setShowTour] = useState(false); // first-run walkthrough
  const [theme, setTheme] = useState(() => readThemeMode().theme); // colour identity
  const [mode, setMode] = useState(() => readThemeMode().mode); // "light" | "dark"
  const [messageCache, setMessageCache] = useState({}); // channel/DM history snapshots for instant revisits
  const [scrollStates, setScrollStates] = useState({}); // channel/DM scroll anchors for revisits
  const [jumpMessageId, setJumpMessageId] = useState(null); // message to scroll to + highlight
  const [searchQuery, setSearchQuery] = useState(null); // active message-search query (results pane)
  const [openThreadReq, setOpenThreadReq] = useState(null); // { channelId, rootId, messageId } — thread to open after a jump
  const [scrollToBottomTarget, setScrollToBottomTarget] = useState(null); // { id, channelId } pinned-open request
  const [toast, setToast] = useState(null); // transient notice (e.g. no access)
  const searchRef = useRef(null);
  const markReadAtRef = useRef({}); // channelId -> last markRead time (throttle)
  const restoredRef = useRef(false); // have we restored the saved location yet?
  const navDuringRestoreRef = useRef(false); // user navigated before the initial restore finished
  const viewRef = useRef(view);
  const activeChannelRef = useRef(activeChannel);
  const poppingRef = useRef(false); // applying a browser back/forward — don't re-push history

  useEffect(() => void (viewRef.current = view), [view]);
  useEffect(() => void (activeChannelRef.current = activeChannel), [activeChannel]);

  function markNavDuringRestore() {
    if (!restoredRef.current) navDuringRestoreRef.current = true;
  }

  // Jump targets belong to the conversation that created them. Clear them
  // before ordinary navigation so a failed/stale target cannot be retried in
  // the next channel.
  function clearNavigationTarget() {
    setJumpMessageId(null);
    setOpenThreadReq(null);
    setScrollToBottomTarget(null);
  }

  const visibleChannels = useMemo(
    () => [...new Map([...channels, ...allChannels].map((c) => [c.id, c])).values()],
    [channels, allChannels]
  );
  const myChannelIds = useMemo(() => channels.map((c) => c.id), [channels]);

  // Real-time layer: socket listeners + live Activity-badge counts.
  // (refreshChannels/refreshDms are hoisted declarations below.)
  const { activityBadge, onlineIds, syncActivity, clearChannelActivity, clearThreadActivity } =
    useRealtime({
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
      setView,
      setActiveChannel,
      refreshChannels,
      refreshDms,
    });

  // Apply + persist theme (colour identity) and mode (light/dark) independently.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    writeString("echo.theme", theme);
    writeString("echo.mode", mode);
  }, [theme, mode]);

  // Quick switch between light and dark — keeps the current colour theme.
  function toggleMode() {
    setMode((m) => (m === "dark" ? "light" : "dark"));
  }

  // Restore the session on load if a token is present.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  function refreshDms() {
    api.listDms().then(({ conversations }) => setDms(conversations)).catch(() => {});
  }
  function refreshChannels() {
    api.listChannels().then(({ channels }) => setChannels(channels)).catch(() => {});
    api.listAllChannels().then(({ channels }) => setAllChannels(channels)).catch(() => {});
  }

  function cacheMessages(channelId, messages) {
    setMessageCache((prev) => {
      const current = prev[channelId];
      if (current === messages) return prev;
      if (current && current.length === messages.length && current.every((m, i) => m.id === messages[i]?.id)) {
        return prev;
      }
      return { ...prev, [channelId]: messages };
    });
  }

  function rememberScrollState(channelId, state) {
    setScrollStates((prev) => {
      const next = { ...prev, [channelId]: state };
      if (user?.id) writeJson(`echo.scroll.${user.id}`, next);
      return next;
    });
  }

  function clearScrollState(channelId) {
    setScrollStates((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      if (user?.id) writeJson(`echo.scroll.${user.id}`, next);
      return next;
    });
  }

  function clearScrollToBottomTarget() {
    setScrollToBottomTarget(null);
  }

  function prefetchMessages(channelId) {
    if (!channelId || messageCache[channelId]) return;
    api
      .getMessages(channelId)
      .then(({ messages }) => cacheMessages(channelId, messages))
      .catch(() => {});
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
    let active = chs[0] || null;
    if (saved?.view === "activity" || saved?.view === "saved") {
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
    setView(nextView);
    setActiveChannel(active);
  }

  // Load workspace data once authenticated.
  useEffect(() => {
    if (!user) return;
    restoredRef.current = false; // restore again for this (possibly new) account
    navDuringRestoreRef.current = false;
    setScrollStates(loadScrollStates(user.id));
    let cancelled = false;
    Promise.all([api.listChannels(), api.listDms()])
      .then(([chRes, dmRes]) => {
        if (cancelled) return;
        const chs = chRes.channels || [];
        const conversations = dmRes.conversations || [];
        setChannels(chs);
        setDms(conversations);
        if (!navDuringRestoreRef.current) {
          applyLocation(readJson(`echo.loc.${user.id}`, null), chs, conversations);
        } else {
          writeCurrentLocation(user.id);
        }
        restoredRef.current = true;
      })
      .catch(() => {
        restoredRef.current = true;
      });
    api.listAllChannels().then(({ channels }) => setAllChannels(channels)).catch(() => {});
    api.listUsers().then(({ users }) => setUsers(users)).catch(() => {});
    api.listEmojis().then(({ emojis }) => setCustomEmojis(emojis)).catch(() => {});
    api.getActivity().then(({ items }) => syncActivity(items)).catch(() => {});
    api.getSaved().then(({ items }) => setSavedIds(new Set(items.map((i) => i.id)))).catch(() => {});
    api.getVips().then(({ vipIds }) => setVipIds(new Set(vipIds))).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persist the current location (after the initial restore) so a refresh lands
  // the user back where they were — and mirror it into the browser history so
  // the back/forward buttons move through the in-app navigation.
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

    // Don't push a new entry when we're applying a back/forward navigation.
    if (poppingRef.current) {
      poppingRef.current = false;
      return;
    }
    const cur = window.history.state;
    const same =
      cur && cur.__echo && cur.view === loc.view && cur.convId === loc.convId && cur.convType === loc.convType;
    if (same) return; // same place (e.g. channel object refreshed) — no new entry
    if (cur && cur.__echo) {
      window.history.pushState({ __echo: true, ...loc }, "");
    } else {
      window.history.replaceState({ __echo: true, ...loc }, ""); // seed the first entry
    }
  }

  // Browser back/forward: restore the in-app location from the history entry.
  useEffect(() => {
    function onPop(e) {
      const st = e.state;
      if (!st || !st.__echo) return;
      // The history "same place" dedup in the push effect prevents a re-push,
      // so we just apply the popped state (location + any Settings layer).
      setSearchQuery(null);
      setProfileUser(null);
      setShowSettings(!!st.settings);
      setShowApiDocs(!!st.apiDocs);
      applyLocation(st, channels, dms);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [channels, dms]);

  function handleEmojiCreated(emoji) {
    setCustomEmojis((prev) => (prev.some((e) => e.id === emoji.id) ? prev : [...prev, emoji]));
  }

  function handleAuthed({ token, user }) {
    setToken(token);
    setUser(user);
  }

  function handleLogout() {
    setToken(null);
    disconnectSocket();
    setUser(null);
    setChannels([]);
    setActiveChannel(null);
    setDms([]);
    setScrollStates({});
    setScrollToBottomTarget(null);
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
  }

  function upsertChannel(channel) {
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

  async function handleChangeVisibility(channel, type) {
    const { channel: updated } = await api.setChannelVisibility(channel.id, type);
    upsertChannel(updated);
  }

  async function handleLeaveChannel(channel) {
    // #general is the default channel — leaving it isn't allowed.
    if ((channel.name || "").toLowerCase() === "general") return;
    await api.leaveChannel(channel.id);
    const { channels } = await api.listChannels();
    setChannels(channels);
    setActiveChannel((prev) => (prev?.id === channel.id ? channels[0] || null : prev));
  }

  // Open (or create) a direct message with another user.
  // Open a user's profile card, resolving by id (avatar/name click) or by
  // username (an @mention click).
  function openProfile(idOrHandle) {
    const key = String(idOrHandle).toLowerCase();
    const u = users.find((x) => x.id === idOrHandle || x.username.toLowerCase() === key);
    if (u) setProfileUser(u);
  }

  // Settings opens as a history entry so the browser Back button (and the
  // in-app "Back to Echo") both close it.
  function openSettings() {
    const loc = { view, convId: activeChannel?.id || null, convType: activeChannel?.type || null };
    window.history.pushState({ __echo: true, ...loc, settings: true }, "");
    setShowSettings(true);
  }
  function closeSettings() {
    if (window.history.state?.settings) window.history.back();
    else setShowSettings(false);
  }
  // API reference — same history-backed overlay pattern as Settings.
  function openApiDocs() {
    const loc = { view, convId: activeChannel?.id || null, convType: activeChannel?.type || null };
    window.history.pushState({ __echo: true, ...loc, apiDocs: true }, "");
    setShowApiDocs(true);
  }
  function closeApiDocs() {
    if (window.history.state?.apiDocs) window.history.back();
    else setShowApiDocs(false);
  }

  async function handleOpenDm(target, isSelf = false) {
    markNavDuringRestore();
    clearNavigationTarget();
    setSearchQuery(null);
    const { channel } = await api.openDm(target.id);
    const existing = dms.find((d) => d.id === channel.id);
    setActiveChannel({
      ...channel,
      type: "dm",
      dmName: isSelf ? `${target.displayName} (you)` : target.displayName,
      dmUserId: target.id,
      isSelf,
    });
    if (!scrollStates[channel.id] && (!existing || (existing.unread || 0) === 0)) {
      setScrollToBottomTarget((prev) => ({ id: (prev?.id || 0) + 1, channelId: channel.id }));
    }
    refreshDms();
  }

  async function handleHideDm(conv) {
    if (vipIds.has(conv.withUser.id)) return;
    await api.hideDm(conv.id);
    setDms((prev) => prev.filter((d) => d.id !== conv.id));
    setActiveChannel((prev) => (prev?.id === conv.id ? channels[0] || null : prev));
  }

  function persistHidden(set) {
    writeJson(HIDDEN_KEY, [...set]);
    return set;
  }
  function handleHideChannel(id) {
    setHidden((prev) => persistHidden(new Set(prev).add(id)));
    setActiveChannel((prev) => (prev?.id === id ? null : prev));
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
    rememberRecent({ type: "channel", id: picked.id, name: picked.name });
  }

  async function handleJoinChannel(channel) {
    await api.joinChannel(channel.id);
    const { channels: fresh } = await api.listChannels();
    setChannels(fresh);
    setActiveChannel(fresh.find((c) => c.id === channel.id) || channel);
    refreshChannels();
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
  function handleJump(item) {
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

    const opened = (() => {
      const channel = resolveJumpChannel({ channelId, channelType, channelName });
      if (channel) {
        setActiveChannel(channel);
        setView("home");
        return true;
      }
      const dm = dms.find((d) => d.id === channelId);
      if (dm) {
        setView("dms");
        setActiveChannel({ id: dm.id, type: "dm", dmName: dm.withUser.displayName, dmUserId: dm.withUser.id });
        return true;
      }
      setToast("You don't have access to that conversation.");
      return false;
    })();

    if (opened && threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
    if (opened && messageId && !threadId) setJumpMessageId(messageId);
  }

  // Run a full-text message search (from the search bar, on Enter).
  function handleSearchMessages(q) {
    markNavDuringRestore();
    setView("home");
    setSearchQuery(q);
  }

  // Jump from a search result to the message in its conversation. Thread
  // replies aren't in the main timeline, so we jump to their thread root.
  function handleSearchJump(result) {
    markNavDuringRestore();
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
          setView("home");
          setActiveChannel(channel);
          setScrollToBottomTarget((prev) => ({ id: (prev?.id || 0) + 1, channelId }));
          if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
          return;
        }
        if (dm) {
          setView("dms");
          setActiveChannel({
            id: dm.id,
            type: "dm",
            dmName: dm.withUser.displayName,
            dmUserId: dm.withUser.id,
          });
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
        setView("dms");
        setActiveChannel({
          id: conv.id,
          type: "dm",
          dmName: conv.withUser.displayName,
          dmUserId: conv.withUser.id,
        });
        if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
        else setJumpMessageId(messageId);
        return;
      }

      // Public channels are browsable; private channels only if you're a member.
      const channel = resolveJumpChannel({ channelId, channelType, channelName });
      if (!channel) {
        return setToast("You don't have access to the channel this message was forwarded from.");
      }
      setView("home");
      setActiveChannel(channel);
      if (threadId) setOpenThreadReq({ channelId, rootId: threadId, messageId });
      else setJumpMessageId(messageId);
    },
    [activeChannel, channels, dms, allChannels]
  );

  // Toggle a message's saved ("save for later") state, optimistically.
  function handleToggleSave(messageId) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    api.toggleSaved(messageId).catch(() => {
      // Roll back on failure.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
    });
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

  // Emoji set used everywhere: workspace-uploaded emoji plus an avatar emoji
  // (:username:) for every user who has a profile picture. Uploaded emoji come
  // last so they win on any name clash.
  const emojis = useMemo(() => {
    const userEmojis = users
      .filter((u) => u.avatarUrl)
      .map((u) => ({ id: `user:${u.id}`, name: u.username, url: u.avatarUrl, isUser: true }));
    return [...userEmojis, ...customEmojis];
  }, [users, customEmojis]);
  const activeUnreadCount = activeChannel
    ? (activeChannel.type === "dm"
        ? dms.find((d) => d.id === activeChannel.id)?.unread || 0
        : channels.find((c) => c.id === activeChannel.id)?.unread || 0)
    : 0;
  const activeInitialScrollState =
    activeChannel && activeUnreadCount === 0 ? scrollStates[activeChannel.id] || null : null;

  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <Login onAuthed={handleAuthed} />;
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
      <div className={`app ${navOpen ? "nav-open" : ""}`}>
        <div className="app-nav">
          <LeftRail
            view={view}
            onSelect={(v) => {
                markNavDuringRestore();
                clearNavigationTarget();
                setSearchQuery(null);
                setView(v);
                // Keep the complete navigation unit open after every rail
                // selection on mobile. Home and DMs expose their sidebar;
                // Activity and Saved still intentionally render rail-only
                // content inside the drawer.
                setNavOpen(window.matchMedia("(max-width: 760px)").matches);
            }}
            user={user}
            badges={{
              home: channels.reduce((s, c) => s + (c.unread || 0), 0),
              dms: dms.reduce((s, d) => s + (d.unread || 0), 0),
              activity: activityBadge,
            }}
          />

          {((view !== "activity" && view !== "saved") || searchQuery) && (
            <Sidebar
              user={user}
              channels={channels}
              dms={dms}
              hidden={hidden}
              vipIds={vipIds}
              onlineIds={onlineIds}
              activeChannel={activeChannel}
              mode={view === "dms" ? "dms" : "home"}
              onSelect={(c) => {
                markNavDuringRestore();
                clearNavigationTarget();
                setSearchQuery(null);
                setActiveChannel(c);
                setNavOpen(false);
              }}
              onPrefetchChannel={prefetchMessages}
              onNewChannel={() => setShowCreate(true)}
              onNewMessage={() => searchRef.current?.focus()}
              onOpenDm={(u, isSelf) => {
                markNavDuringRestore();
                handleOpenDm(u, isSelf);
                setNavOpen(false);
              }}
              onPrefetchDm={prefetchMessages}
              onHideDm={handleHideDm}
              onHideChannel={handleHideChannel}
              onLogout={handleLogout}
              onOpenSettings={openSettings}
              onOpenApiDocs={openApiDocs}
              themeMode={mode}
              onToggleTheme={toggleMode}
            />
          )}
        </div>

        {/* Backdrop closes the nav drawer on narrow screens. */}
        <div className="nav-backdrop" onClick={() => setNavOpen(false)} />

        <div className="chat-pane">
          <div className="pane-search">
            <button
              className="nav-toggle"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              title="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 5h14M3 10h14M3 15h14" />
              </svg>
            </button>
            <SearchBox
              ref={searchRef}
              channels={visibleChannels}
              myChannelIds={myChannelIds}
              users={users}
              recents={recents}
              onPickChannel={handlePickChannel}
              onPickUser={handlePickUser}
              onSearchMessages={handleSearchMessages}
            />
          </div>

          {searchQuery ? (
            <SearchResults
              query={searchQuery}
              onJump={handleSearchJump}
              onClose={() => setSearchQuery(null)}
            />
          ) : view === "activity" ? (
            <ActivityFeed
              user={user}
              users={users}
              customEmojis={emojis}
              onJump={handleJump}
              onLoaded={syncActivity}
            />
          ) : view === "saved" ? (
            <SavedFeed
              user={user}
              users={users}
              customEmojis={emojis}
              onJump={handleJump}
              onUnsave={(id) => setSavedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              })}
            />
          ) : activeChannel && (view === "home" || activeChannel.type === "dm") ? (
            <ChannelView
              channel={activeChannel}
              cachedMessages={messageCache[activeChannel.id] || null}
              initialScrollState={activeInitialScrollState}
              user={user}
              users={users}
              channels={channels}
              dms={dms}
              customEmojis={emojis}
              savedIds={savedIds}
              onToggleSave={handleToggleSave}
              onCacheMessages={cacheMessages}
              onRememberScroll={rememberScrollState}
              onScrollToBottomTargetConsumed={clearScrollToBottomTarget}
              onOpenProfile={openProfile}
              isVip={activeChannel.type === "dm" && vipIds.has(activeChannel.dmUserId)}
              onToggleVip={handleToggleVip}
              jumpMessageId={jumpMessageId}
              scrollToBottomTarget={scrollToBottomTarget}
              canJumpToForward={canJumpToForward}
              onJumpToMessage={handleJumpToMessage}
              onJumpConsumed={() => setJumpMessageId(null)}
              onAddCustomEmoji={() => setShowAddEmoji(true)}
              onAddPeople={() => setShowAddPeople(true)}
              onLeave={handleLeaveChannel}
              onChangeVisibility={handleChangeVisibility}
              onChannelUpdated={upsertChannel}
              onJoin={handleJoinChannel}
              onRead={handleRead}
              onThreadRead={clearThreadActivity}
              openThreadId={
                openThreadReq && openThreadReq.channelId === activeChannel.id ? openThreadReq.rootId : null
              }
              openThreadJumpMessageId={
                openThreadReq && openThreadReq.channelId === activeChannel.id ? openThreadReq.messageId : null
              }
              onThreadOpened={() => setOpenThreadReq(null)}
            />
          ) : (
            <div className="empty-pane">
              {view === "dms" ? "Select a conversation, or start a new one." : "Search to start a conversation."}
            </div>
          )}
        </div>
      </div>
      {showCreate && (
        <CreateChannelModal onCreate={handleCreateChannel} onClose={() => setShowCreate(false)} />
      )}
      {showAddPeople && activeChannel && activeChannel.type !== "dm" &&
        (activeChannel.name || "").toLowerCase() !== "general" && (
        <AddPeopleModal
          channel={activeChannel}
          users={users}
          onAdd={handleAddMember}
          onClose={() => setShowAddPeople(false)}
        />
      )}
      {showAddEmoji && (
        <AddEmojiModal
          existing={customEmojis}
          onCreated={handleEmojiCreated}
          onClose={() => setShowAddEmoji(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          user={user}
          users={users}
          theme={theme}
          themes={THEMES}
          onSelectTheme={setTheme}
          mode={mode}
          onSelectMode={setMode}
          onUpdated={(updated) => setUser((prev) => ({ ...prev, ...updated }))}
          onClose={closeSettings}
          onReplayTour={() => {
            closeSettings();
            setNavOpen(false);
            setShowTour(true);
          }}
        />
      )}
      {showApiDocs && <ApiDocsPage onClose={closeApiDocs} />}
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          currentUserId={user.id}
          online={onlineIds.has(profileUser.id)}
          isVip={vipIds.has(profileUser.id)}
          onToggleVip={() => handleToggleVip(profileUser.id)}
          onMessage={(u) => {
            setProfileUser(null);
            handleOpenDm(u);
          }}
          onClose={() => setProfileUser(null)}
        />
      )}
      {showTour && <Walkthrough onClose={finishTour} />}
      <EmojiEffects />
      {toast && (
        <div className="toast" role="status" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
}
