import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import Avatar from "./Avatar.js";

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
  { channels, users, recents, myChannelIds, onPickChannel, onPickUser, onSearchMessages },
  ref
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [caret, setCaret] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const highlightRef = useRef(null);

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
      inputRef.current?.focus();
      setOpen(true);
    },
    clear() {
      setOpen(false);
      setQuery("");
      setCaret(0);
      setActiveIdx(0);
    },
  }));

  useEffect(() => {
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const publicChannels = useMemo(() => channels.filter((c) => c.type === "public"), [channels]);
  const q = query.trim().toLowerCase();
  const hasFilterTokens = /(?:^|\s)(in:|from:|has:)/i.test(query);

  const filter = activeFilterAt(query, caret);

  // Suggestions for the active filter token (channels for in:, users for from:).
  const filterSuggestions = useMemo(() => {
    if (!filter) return [];
    const fq = filter.query.toLowerCase();
    if (filter.type === "in") {
      return channels.filter((c) => c.name.toLowerCase().includes(fq)).slice(0, 8);
    }
    if (filter.type === "has") {
      return HAS_OPTIONS.filter((o) => o.key.startsWith(fq));
    }
    return users
      .filter((u) => u.username.toLowerCase().includes(fq) || u.displayName.toLowerCase().includes(fq))
      .slice(0, 8);
  }, [filter, channels, users]);

  // Quick-nav results (only when not building a filtered query).
  const channelHits =
    q && !hasFilterTokens
      ? publicChannels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
      : [];
  const peopleHits =
    q && !hasFilterTokens
      ? users
          .filter(
            (u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q)
          )
          .slice(0, 8)
      : [];

  // A single flat list of everything the arrow keys can move through, in the
  // order the rows are rendered. activeIdx indexes into this. Keeping it flat
  // means Enter/hover/click all share one notion of "the highlighted row".
  const navItems = useMemo(() => {
    if (filter && filterSuggestions.length) {
      return filterSuggestions.map((item) => ({ kind: "filter", item }));
    }
    if (q && !hasFilterTokens) {
      return [
        { kind: "search" },
        ...channelHits.map((item) => ({ kind: "channel", item })),
        ...peopleHits.map((item) => ({ kind: "people", item })),
      ];
    }
    if (!q) {
      return recents.map((r) =>
        r.type === "channel"
          ? { kind: "recent-channel", item: r }
          : { kind: "recent-user", item: r }
      );
    }
    return [];
  }, [filter, filterSuggestions, q, hasFilterTokens, channelHits, peopleHits, recents]);

  // Reset/clamp the highlight whenever the navigable set changes.
  useEffect(() => {
    setActiveIdx((i) => (i < navItems.length ? i : 0));
  }, [navItems.length]);

  function close() {
    setOpen(false);
    setQuery("");
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
    if (!filter || !item) return;
    const value = filter.type === "in" ? item.name : filter.type === "has" ? item.key : item.username;
    const before = query.slice(0, filter.start);
    const after = query.slice(caret);
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
      setOpen(false);
      return;
    }
    // Tab always completes a filter token from the highlighted suggestion.
    if (e.key === "Tab" && filter && filterSuggestions.length) {
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
        className={`search-row ${idx === activeIdx ? "active" : ""}`}
        data-testid={`search-channel-${slug(c.name)}`}
        onMouseEnter={() => setActiveIdx(idx)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (kind === "filter" ? applyFilter(c) : pickChannel(c))}
      >
        <span className="search-hash">#</span>
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
  const peopleStart = 1 + channelHits.length;

  return (
    <div className="search-box" ref={wrapRef} data-testid="search-box">
      <div className="search-box-field">
        <SearchIcon size={15} strokeWidth={1.8} />
        <div className="search-input-wrap">
          <div className="search-highlight" ref={highlightRef} aria-hidden="true" dir="auto">
            {renderHighlighted(query)}
          </div>
          <input
            ref={inputRef}
            className="search-input"
            data-testid="search-input"
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
            placeholder="Search messages, people, and channels"
            dir="auto"
          />
        </div>
      </div>

      {open && (
        <div className="search-dropdown">
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
              {!q && (
                <>
                  <div className="search-hint" data-testid="search-hint">
                    Press <b>Enter</b> to search messages. Filter with <code>in:channel</code>,{" "}
                    <code>from:@user</code>, and <code>has:file</code>.
                  </div>
                  <div className="search-section">Recent</div>
                  {recents.length === 0 && <div className="people-empty">No recent searches.</div>}
                  {recents.map((r, idx) =>
                    r.type === "channel"
                      ? channelRow(r, idx, "recent")
                      : (
                          <button
                            key={`recent-${r.id}`}
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

              {q && (
                <button
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
              )}

              {channelHits.length > 0 && <div className="search-section">Channels</div>}
              {channelHits.map((c, i) => channelRow(c, channelStart + i, "hit"))}

              {peopleHits.length > 0 && <div className="search-section">People</div>}
              {peopleHits.map((u, i) => personRow(u, peopleStart + i, "hit"))}

              {q && !hasFilterTokens && channelHits.length === 0 && peopleHits.length === 0 && (
                <div className="people-empty">No channels or people match — press Enter to search messages.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default SearchBox;
