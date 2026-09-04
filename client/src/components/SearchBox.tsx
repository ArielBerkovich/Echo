import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ActivityIcon,
  BookmarkIcon,
  HashIcon,
  HomeIcon,
  InfoIcon,
  LockKeyholeIcon,
  MessageSquarePlusIcon,
  MessageSquareTextIcon,
  SearchIcon,
  SettingsIcon,
  PaperclipIcon,
  PinIcon,
  SearchCheckIcon,
  StarIcon,
  UserPlusIcon,
  UsersRoundIcon,
} from "lucide-react";
import Avatar from "./Avatar.js";

const QUICK_ACTIONS = [
  { id: "new-message", label: "New message", keywords: ["new", "message", "dm"], shortcut: "⌘/Ctrl+⇧M", Icon: MessageSquarePlusIcon },
  { id: "create-channel", label: "Create channel", keywords: ["create", "new", "channel"], shortcut: "⌘/Ctrl+⇧C", Icon: HashIcon },
  { id: "browse-channels", label: "Browse channels", keywords: ["browse", "channels"], shortcut: "⌘/Ctrl+⇧O", Icon: HashIcon },
  { id: "home", label: "Go to Home", keywords: ["home"], shortcut: "⌘/Ctrl+⇧H", Icon: HomeIcon },
  { id: "dms", label: "Go to Direct messages", keywords: ["dm", "dms", "direct", "messages"], shortcut: "⌘/Ctrl+⇧D", Icon: MessageSquareTextIcon },
  { id: "activity", label: "Go to Activity", keywords: ["activity", "notifications"], shortcut: "⌘/Ctrl+⇧A", Icon: ActivityIcon },
  { id: "saved", label: "Go to Saved", keywords: ["saved", "bookmarks"], shortcut: "⌘/Ctrl+⇧S", Icon: BookmarkIcon },
  { id: "settings", label: "Open Settings", keywords: ["settings", "preferences"], shortcut: "⌘/Ctrl+,", Icon: SettingsIcon },
];

// Things "has:" can filter on, suggested as you type the token.
const HAS_OPTIONS = [
  { key: "file", label: "Has a file" },
  { key: "image", label: "Has an image" },
  { key: "link", label: "Has a link" },
];

// Render the query with in:/from:/has: filter tokens wrapped in colored,
// bold spans. Used by the mirror layer behind the (transparent-text) input.
function renderHighlighted(q) {
  const nodes = [];
  // Colour the keyword plus any value after it, allowing an optional space
  // after the colon (so `from: @ann` highlights the same as `from:@ann`).
  const re = /(in:|from:|has:)\s*[@#]?\S*/gi;
  let last = 0;
  let m;
  while ((m = re.exec(q))) {
    const idx = m.index;
    // Only a real token if at the start or preceded by whitespace.
    if (idx !== 0 && q[idx - 1] !== " ") continue;
    if (idx > last) nodes.push(q.slice(last, idx));
    const op = m[1].slice(0, -1).toLowerCase(); // in | from | has
    nodes.push(
      <span key={idx} className={`kw kw-${op}`}>
        {m[0]}
      </span>
    );
    last = idx + m[0].length;
  }
  if (last < q.length) nodes.push(q.slice(last));
  return nodes;
}

// Detect a filter token at the caret so we can autocomplete it:
//   in:<channel>          → channel picker
//   from:@<user>          → user (mention) picker — triggered by the "@"
//   has:<file|image|link> → attachment/link picker
function activeFilterAt(value, caret) {
  const before = value.slice(0, caret);
  // An optional space after the colon is allowed: `in: #gen`, `from: @ann`, `has: file`.
  let m = before.match(/(?:^|\s)in:\s*#?(\S*)$/i);
  if (m) return { type: "in", query: m[1], start: caret - m[1].length };
  m = before.match(/(?:^|\s)from:\s*@(\S*)$/i);
  if (m) return { type: "from", query: m[1], start: caret - m[1].length };
  m = before.match(/(?:^|\s)has:\s*(\w*)$/i);
  if (m) return { type: "has", query: m[1], start: caret - m[1].length };
  return null;
}

// Inline search: an input in the top bar with a results dropdown directly
// beneath it. Plain text navigates to channels/people; pressing Enter runs a
// full-text message search. Typing `in:` or `from:@` opens an autocomplete for
// scoping the search to a channel or sender. The whole dropdown is
// arrow-key navigable, and channels you haven't joined are marked.
function slug(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const SearchBox = forwardRef(function SearchBox(
  {
    channels,
    users,
    recents,
    myChannelIds,
    currentChannelActions = [],
    onPickChannel,
    onFindChannels,
    onPickUser,
    onQuickAction,
    onSearchMessages,
    variant = "default",
  },
  ref
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caret, setCaret] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [remoteChannels, setRemoteChannels] = useState([]);
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const highlightRef = useRef(null);
  const navItemRefs = useRef([]);

  const memberOf = useMemo(
    () => (myChannelIds instanceof Set ? myChannelIds : new Set(myChannelIds || [])),
    [myChannelIds]
  );

  // Keep the highlight mirror aligned with the input when its text scrolls.
  function syncScroll() {
    if (highlightRef.current && inputRef.current) {
      highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }
  useEffect(syncScroll, [query]);

  useImperativeHandle(ref, () => ({
    focus() {
      setConversationPickerOpen(false);
      setQuickSwitcherOpen(false);
      inputRef.current?.focus();
      setOpen(true);
    },
    openSwitcher() {
      setConversationPickerOpen(false);
      setQuickSwitcherOpen(true);
      setQuery("");
      setCaret(0);
      setActiveIdx(0);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    searchInChannel(channelName) {
      const next = `in:${channelName} `;
      setConversationPickerOpen(false);
      setQuickSwitcherOpen(false);
      setQuery(next);
      setCaret(next.length);
      setActiveIdx(0);
      setOpen(true);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(next.length, next.length);
      });
    },
    startConversation() {
      setQuery("");
      setCaret(0);
      setActiveIdx(0);
      setConversationPickerOpen(true);
      setQuickSwitcherOpen(false);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    clear() {
      setOpen(false);
      setQuery("");
      setCaret(0);
      setActiveIdx(0);
      setConversationPickerOpen(false);
      setQuickSwitcherOpen(false);
    },
  }));

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setConversationPickerOpen(false);
        setQuickSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const searchableChannels = useMemo(
    () => channels.filter((c) =>
      (c.type === "public" || (c.type === "private" && memberOf.has(c.id))) &&
      !c.isArchived && c.id && c.name
    ),
    [channels, memberOf]
  );
  const searchableUsers = useMemo(
    () => [
      ...new Map(
        users
          .filter((user) => user?.id && user?.username && user.displayName)
          .map((user) => [user.username.toLowerCase(), user])
      ).values(),
    ],
    [users]
  );
  const q = query.trim().toLowerCase();
  const hasFilterTokens = /(?:^|\s)(in:|from:|has:)/i.test(query);
  const peoplePicker = variant === "people-picker" || conversationPickerOpen;
  const matchingQuickActions = useMemo(
    () => {
      if (!quickSwitcherOpen || peoplePicker || hasFilterTokens) return [];
      const matches = [...QUICK_ACTIONS, ...currentChannelActions].filter((action) => !q || [action.label, ...action.keywords]
        .some((value) => value.toLowerCase().includes(q)));
      return [...matches.filter((action) => action.group === "Current channel"), ...matches.filter((action) => !action.group)];
    },
    [currentChannelActions, hasFilterTokens, peoplePicker, q, quickSwitcherOpen]
  );
  const recentItems = useMemo(
    () => [...new Map(
      (Array.isArray(recents) ? recents : [])
        .filter((recent) => recent?.type && recent?.id)
        .map((recent) => [`${recent.type}:${recent.id}`, recent])
    ).values()],
    [recents]
  );

  const filter = activeFilterAt(query, caret);
  const shouldFindChannels =
    filter?.type === "in" || (!!q && !hasFilterTokens && !peoplePicker && !quickSwitcherOpen);
  const channelLookup = filter?.type === "in" ? filter.query : q;

  useEffect(() => {
    if (!shouldFindChannels || !onFindChannels) {
      setRemoteChannels([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      onFindChannels(channelLookup)
        .then((found) => {
          if (!cancelled) setRemoteChannels(found || []);
        })
        .catch(() => {
          if (!cancelled) setRemoteChannels([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [channelLookup, onFindChannels, shouldFindChannels]);

  const channelCandidates = useMemo(
    () => [
      ...new Map(
        [...searchableChannels, ...remoteChannels]
          .filter((channel) => channel && channel.id && channel.name && !channel.isArchived)
          .map((channel) => [channel.id, channel])
      ).values(),
    ],
    [searchableChannels, remoteChannels]
  );

  // Suggestions for the active filter token (channels for in:, users for from:).
  const filterSuggestions = useMemo(() => {
    if (!filter) return [];
    const fq = filter.query.toLowerCase();
    if (filter.type === "in") {
      return channelCandidates.filter((c) => c.name.toLowerCase().includes(fq)).slice(0, 8);
    }
    if (filter.type === "has") {
      return HAS_OPTIONS.filter((o) => o.key.startsWith(fq));
    }
    return searchableUsers
      .filter((u) => u.username.toLowerCase().includes(fq) || u.displayName.toLowerCase().includes(fq))
      .slice(0, 8);
  }, [filter, channelCandidates, searchableUsers]);

  // Quick-nav results (only when not building a filtered query).
  const channelHits =
    q && !hasFilterTokens && !quickSwitcherOpen
      ? channelCandidates.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
      : [];
  const peopleHits =
    (q || peoplePicker) && !hasFilterTokens && !quickSwitcherOpen
      ? searchableUsers
          .filter(
            (u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
          )
          .slice(0, 8)
      : [];

  // A single flat list of everything the arrow keys can move through, in the
  // order the rows are rendered. activeIdx indexes into this. Keeping it flat
  // means Enter/hover/click all share one notion of "the highlighted row".
  const navItems = useMemo(() => {
    if (quickSwitcherOpen) {
      return matchingQuickActions.map((item) => ({ kind: "action", item }));
    }
    if (filter && filterSuggestions.length) {
      return filterSuggestions.map((item) => ({ kind: "filter", item }));
    }
    if (peoplePicker) {
      return peopleHits.map((item) => ({ kind: "people", item }));
    }
    if (q && !hasFilterTokens) {
      return [
        { kind: "search" },
        ...matchingQuickActions.map((item) => ({ kind: "action", item })),
        ...channelHits.map((item) => ({ kind: "channel", item })),
        ...peopleHits.map((item) => ({ kind: "people", item })),
      ];
    }
    if (!q) {
      return [
        ...matchingQuickActions.map((item) => ({ kind: "action", item })),
        ...recentItems.map((r) =>
        r.type === "channel"
          ? { kind: "recent-channel", item: r }
          : { kind: "recent-user", item: r }
        ),
      ];
    }
    return [];
  }, [filter, filterSuggestions, q, hasFilterTokens, matchingQuickActions, channelHits, peopleHits, recentItems, peoplePicker, quickSwitcherOpen]);

  // Reset/clamp the highlight whenever the navigable set changes.
  useEffect(() => {
    setActiveIdx((i) => (i < navItems.length ? i : 0));
  }, [navItems.length]);

  useEffect(() => {
    navItemRefs.current[activeIdx]?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, navItems.length]);

  function close() {
    setOpen(false);
    setQuery("");
    setConversationPickerOpen(false);
    setQuickSwitcherOpen(false);
  }
  function pickChannel(c) {
    onPickChannel(c);
    close();
  }
  function pickUser(u) {
    onPickUser(u);
    close();
  }
  function submitMessageSearch() {
    const term = query.trim();
    if (!term) return;
    onSearchMessages?.(term);
    setOpen(false);
  }

  // Replace the active filter token's query part with the chosen value.
  function applyFilter(item) {
    if (!item) return;
    // Keyboard input can arrive before the controlled caret state has flushed
    // (notably after programmatic fills in E2E tests). Read the live selection
    // so replacement always targets the current filter token.
    const currentCaret = inputRef.current?.selectionStart ?? caret;
    const currentFilter = activeFilterAt(query, currentCaret);
    if (!currentFilter) return;
    const value = currentFilter.type === "in" ? item.name : currentFilter.type === "has" ? item.key : item.username;
    const before = query.slice(0, currentFilter.start);
    const after = query.slice(currentCaret);
    const next = `${before}${value} ${after}`;
    const pos = before.length + value.length + 1;
    setQuery(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
        setCaret(pos);
      }
    });
  }

  // Act on a highlighted (or clicked) row, dispatching by its kind.
  function activate(it) {
    if (!it) return;
    switch (it.kind) {
      case "filter":
        return applyFilter(it.item);
      case "search":
        return submitMessageSearch();
      case "channel":
      case "recent-channel":
        return pickChannel(it.item);
      case "people":
      case "recent-user":
        return pickUser(it.item);
      case "action":
        close();
        return onQuickAction?.(it.item.id);
      default:
        return undefined;
    }
  }

  function syncCaret(e) {
    setCaret(e.target.selectionStart ?? e.target.value.length);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (navItems.length ? (i + 1) % navItems.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (navItems.length ? (i - 1 + navItems.length) % navItems.length : 0));
      return;
    }
    if (e.key === "Escape") {
      close();
      return;
    }
    // Tab always completes a filter token from the highlighted suggestion.
    if (e.key === "Tab" && !quickSwitcherOpen && filter && filterSuggestions.length) {
      e.preventDefault();
      applyFilter(filterSuggestions[activeIdx] || filterSuggestions[0]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const it = navItems[activeIdx];
      if (it) activate(it);
      else submitMessageSearch();
    }
  }

  // Render a "#channel" row, badged "Not in channel" when unjoined.
  const channelRow = (c, idx, kind) => {
    const joined = memberOf.has(c.id);
    return (
      <button
        key={`${kind}-${c.id}`}
        ref={(element) => { navItemRefs.current[idx] = element; }}
        className={`search-row ${idx === activeIdx ? "active" : ""}`}
        data-testid={`search-channel-${slug(c.name)}`}
        onMouseEnter={() => setActiveIdx(idx)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (kind === "filter" ? applyFilter(c) : pickChannel(c))}
      >
        <span className="search-hash">
          {c.type === "private" ? <LockKeyholeIcon size={12} strokeWidth={2} aria-hidden="true" /> : "#"}
        </span>
        <span className="search-name">{c.name}</span>
        {joined ? (
          kind !== "filter" && <span className="search-kind">channel</span>
        ) : (
          <span className="search-notin">Not in channel</span>
        )}
      </button>
    );
  };

  const personRow = (u, idx, kind) => (
    <button
      key={`${kind}-${u.id}`}
      ref={(element) => { navItemRefs.current[idx] = element; }}
      className={`search-row ${idx === activeIdx ? "active" : ""}`}
      data-testid={`search-user-${slug(u.username)}`}
      onMouseEnter={() => setActiveIdx(idx)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (kind === "filter" ? applyFilter(u) : pickUser(u))}
    >
      <Avatar name={u.displayName} src={u.avatarUrl} size={24} />
      <span className="search-name">{u.displayName}</span>
      <span className="search-handle">@{u.username}</span>
    </button>
  );

  // Flat-index offsets for the quick-nav layout (search row is index 0).
  const channelStart = 1;
  const peopleStart = peoplePicker ? 0 : 1 + channelHits.length;

  function actionRow(action, idx) {
    const Icon = action.Icon || (
      action.id === "add-people" ? UserPlusIcon
        : action.id === "search-channel" ? SearchCheckIcon
          : action.id === "view-channel-details" ? InfoIcon
            : action.id === "view-members" ? UsersRoundIcon
              : action.id === "view-files" ? PaperclipIcon
                : action.id === "toggle-channel-starred" ? StarIcon
                  : PinIcon
    );
    return (
      <button
        key={action.id}
        type="button"
        ref={(element) => { navItemRefs.current[idx] = element; }}
        className={`search-row search-action-row ${idx === activeIdx ? "active" : ""}`}
        data-testid={`search-action-${action.id}`}
        onMouseEnter={() => setActiveIdx(idx)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => activate({ kind: "action", item: action })}
      >
        <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
        <span className="search-name">{action.label}</span>
        {action.shortcut && <span className="search-kind">{action.shortcut}</span>}
      </button>
    );
  }

  return (
    <div className="search-box" ref={wrapRef} data-testid="search-box">
      <div className="search-box-field" data-testid="search-box-field">
        <span className="search-icon-badge" aria-hidden="true">
          <SearchIcon size={15} strokeWidth={2.1} />
        </span>
          <div className="search-input-wrap">
          {!query && (
            <span className="search-placeholder" aria-hidden="true">
              {quickSwitcherOpen ? "Search commands" : peoplePicker ? "Find someone to message" : "Search messages, people, and channels"}
            </span>
          )}
          <div className="search-highlight" ref={highlightRef} aria-hidden="true" dir="auto">
            {renderHighlighted(query)}
          </div>
          <input
            ref={inputRef}
            className="search-input"
            data-testid="search-input"
            aria-label={quickSwitcherOpen ? "Search commands" : "Search messages, people, and channels"}
            value={query}
            onFocus={() => setOpen(true)}
            onClick={syncCaret}
            onKeyUp={syncCaret}
            onScroll={syncScroll}
            onChange={(e) => {
              setQuery(e.target.value);
              setCaret(e.target.selectionStart ?? e.target.value.length);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            placeholder=""
            dir="auto"
            />
          </div>
        </div>

      {open && (
        <div className="search-dropdown" role={quickSwitcherOpen ? "dialog" : undefined} aria-label={quickSwitcherOpen ? "Commands" : undefined}>
          {quickSwitcherOpen ? (
            <>
              {matchingQuickActions.length > 0
                ? <>
                    {matchingQuickActions.some((action) => action.group === "Current channel") && <div className="search-section" data-testid="quick-switcher-current-section">Current channel</div>}
                    {matchingQuickActions.filter((action) => action.group === "Current channel").map((action, idx) => actionRow(action, idx))}
                    {matchingQuickActions.some((action) => !action.group) && <div className="search-section" data-testid="quick-switcher-commands-section">Commands</div>}
                    {matchingQuickActions.filter((action) => !action.group).map((action, idx) => actionRow(action, matchingQuickActions.filter((item) => item.group === "Current channel").length + idx))}
                  </>
                : <div className="people-empty">No commands match.</div>}
            </>
          ) : (
            <>
          {/* Filter autocomplete (in:/from:/has:) — takes over the dropdown */}
          {filter ? (
            <>
              <div className="search-section">
                {filter.type === "in" ? "Channels" : filter.type === "has" ? "Has" : "People"}
              </div>
              {filterSuggestions.length === 0 && (
                <div className="people-empty">
                  No {filter.type === "in" ? "channels" : filter.type === "has" ? "options" : "people"} match.
                </div>
              )}
              {filterSuggestions.map((item, idx) =>
                filter.type === "in" ? (
                  channelRow(item, idx, "filter")
                ) : filter.type === "has" ? (
                <button
                  key={item.key}
                  ref={(element) => { navItemRefs.current[idx] = element; }}
                  className={`search-row ${idx === activeIdx ? "active" : ""}`}
                  data-testid={`search-has-${item.key}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFilter(item)}
                  >
                    <span className="search-hash">📎</span>
                    <span className="search-name">{item.label}</span>
                    <span className="search-kind">has:{item.key}</span>
                  </button>
                ) : (
                  personRow(item, idx, "filter")
                )
              )}
            </>
          ) : (
            <>
              {!q && !peoplePicker && (
                <>
                  <div className="search-hint" data-testid="search-hint">
                    Press <b>Enter</b> to search messages. Filter with <code>in:channel</code>,{" "}
                    <code>from:@user</code>, and <code>has:file</code>.
                  </div>
                  {matchingQuickActions.length > 0 && (
                    <>
                      <div className="search-section">Actions</div>
                      {matchingQuickActions.map((action, idx) => actionRow(action, idx))}
                    </>
                  )}
                  <div className="search-section">Recent</div>
                  {recentItems.length === 0 && <div className="people-empty">No recent searches.</div>}
                  {recentItems.map((r, idx) =>
                    r.type === "channel"
                      ? channelRow(r, idx, "recent")
                      : (
                          <button
                            key={`recent-${r.id}`}
                            ref={(element) => { navItemRefs.current[idx] = element; }}
                            className={`search-row ${idx === activeIdx ? "active" : ""}`}
                            data-testid={`search-user-${slug(r.displayName)}`}
                            onMouseEnter={() => setActiveIdx(idx)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickUser(r)}
                          >
                            <Avatar
                              name={r.displayName}
                              src={users.find((x) => x.id === r.id)?.avatarUrl}
                              size={24}
                            />
                            <span className="search-name">{r.displayName}</span>
                            <span className="search-kind">DM</span>
                          </button>
                        )
                  )}
                </>
              )}

              {q && !peoplePicker && (
                <>
                  <button
                    ref={(element) => { navItemRefs.current[0] = element; }}
                    className={`search-row search-messages-row ${activeIdx === 0 ? "active" : ""}`}
                    data-testid="search-messages-row"
                    onMouseEnter={() => setActiveIdx(0)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={submitMessageSearch}
                  >
                    <SearchIcon size={15} strokeWidth={1.8} />
                    <span className="search-name">Search messages for “{query.trim()}”</span>
                    <span className="search-kind">Enter ↵</span>
                  </button>
                  {matchingQuickActions.length > 0 && (
                    <>
                      <div className="search-section">Actions</div>
                      {matchingQuickActions.map((action, idx) => actionRow(action, idx + 1))}
                    </>
                  )}
                </>
              )}

              {!peoplePicker && channelHits.length > 0 && <div className="search-section">Channels</div>}
              {!peoplePicker && channelHits.map((c, i) => channelRow(c, channelStart + matchingQuickActions.length + i, "hit"))}

              {peopleHits.length > 0 && <div className="search-section">People</div>}
              {peopleHits.map((u, i) => personRow(u, peopleStart + matchingQuickActions.length + i, "hit"))}

              {(q || peoplePicker) && !hasFilterTokens && matchingQuickActions.length === 0 && channelHits.length === 0 && peopleHits.length === 0 && (
                <div className="people-empty">No people match.</div>
              )}
            </>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default SearchBox;
