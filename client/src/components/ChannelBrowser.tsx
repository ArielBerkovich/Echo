import { useEffect, useId, useRef, useState } from "react";
import { CompassIcon, HashIcon, PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { api } from "../api.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "available", label: "Not joined" },
  { id: "joined", label: "Joined" },
];
const EMPTY_COUNTS = { all: 0, available: 0, joined: 0 };
const EMPTY_IDS = new Set();
const PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 200;

export default function ChannelBrowser({
  joinedIds = EMPTY_IDS,
  hiddenIds = EMPTY_IDS,
  onOpen,
  onJoin,
  onCreate,
  onCatalog,
  onCounts,
}) {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [channels, setChannels] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [page, setPage] = useState({ cursor: "", number: 1, history: [] });
  const [nextCursor, setNextCursor] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);
  const [membershipEpoch, setMembershipEpoch] = useState(0);
  const [error, setError] = useState("");
  const resultsId = useId();
  const backgroundRefreshRef = useRef(false);
  const contentRef = useRef(null);
  const joinedIdsRef = useRef(joinedIds);
  const pendingScrollTopRef = useRef(null);
  const searchInputRef = useRef(null);
  const requestKeyRef = useRef("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage({ cursor: "", number: 1, history: [] });
      setSearchTerm(query.trim());
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const previous = joinedIdsRef.current;
    joinedIdsRef.current = joinedIds;
    if (
      previous.size === joinedIds.size &&
      [...joinedIds].every((channelId) => previous.has(channelId))
    ) {
      return;
    }
    backgroundRefreshRef.current = true;
    pendingScrollTopRef.current = contentRef.current?.scrollTop ?? null;
    setMembershipEpoch((epoch) => epoch + 1);
  }, [joinedIds]);

  useEffect(() => {
    const preservePage = backgroundRefreshRef.current;
    backgroundRefreshRef.current = false;
    const requestKey = `${searchTerm}\n${filter}\n${page.cursor}\n${membershipEpoch}`;
    requestKeyRef.current = requestKey;
    let cancelled = false;
    if (!preservePage) setLoading(true);
    setError("");
    api
      .browseChannels({
        q: searchTerm,
        membership: filter,
        cursor: page.cursor,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled || requestKeyRef.current !== requestKey) return;
        const nextChannels = result.channels || [];
        const nextCounts = result.counts || EMPTY_COUNTS;
        setChannels(nextChannels);
        setCounts(nextCounts);
        setNextCursor(result.page?.nextCursor || "");
        setHasMore(!!result.page?.hasMore);
        onCatalog?.(nextChannels);
        if (!searchTerm) onCounts?.(nextCounts);
        if (preservePage) {
          requestAnimationFrame(() => {
            if (contentRef.current && pendingScrollTopRef.current !== null) {
              contentRef.current.scrollTop = pendingScrollTopRef.current;
            }
            pendingScrollTopRef.current = null;
          });
        }
      })
      .catch((loadError) => {
        if (!cancelled && requestKeyRef.current === requestKey) {
          if (!preservePage) setChannels([]);
          setError(loadError?.message || "We couldn't load public channels. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled && requestKeyRef.current === requestKey) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchTerm, filter, page.cursor, membershipEpoch, onCatalog, onCounts]);

  const totalForFilter = counts[filter] || 0;
  const firstResult = channels.length > 0 ? (page.number - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = firstResult ? firstResult + channels.length - 1 : 0;
  const resultSummary = totalForFilter > PAGE_SIZE
    ? `${firstResult}–${lastResult} of ${totalForFilter} channels`
    : `${totalForFilter} public ${totalForFilter === 1 ? "channel" : "channels"}`;

  function getEmptyCopy() {
    if ((counts.all || 0) === 0 && !searchTerm) {
      return {
        title: "No public channels yet",
        detail: "Create one to give your workspace a place for open conversations.",
      };
    }
    if (searchTerm) {
      return {
        title: "No matching channels",
        detail: `No public channel matches “${searchTerm}”.`,
      };
    }
    if (filter === "available") {
      return {
        title: "You've joined every public channel",
        detail: "New public channels will appear here when they're created.",
      };
    }
    return {
      title: "You haven't joined a public channel yet",
      detail: "Switch to All to find a channel to join.",
    };
  }
  const emptyCopy = !loading && channels.length === 0 ? getEmptyCopy() : null;

  async function join(channel) {
    setError("");
    setJoiningId(channel.id);
    const scrollTop = contentRef.current?.scrollTop;
    try {
      const joinedChannel = (await onJoin(channel)) || channel;
      const nextChannel = {
        ...channel,
        ...joinedChannel,
        joined: true,
        memberCount: joinedChannel.memberCount ?? (channel.memberCount || 0) + 1,
      };
      setChannels((current) => (
        filter === "available"
          ? current.filter((item) => item.id !== channel.id)
          : current.map((item) => (item.id === channel.id ? nextChannel : item))
      ));
      const updateCounts = (current) => ({
        ...current,
        joined: (current.joined || 0) + 1,
        available: Math.max(0, (current.available || 0) - 1),
      });
      setCounts(updateCounts);
      if (!searchTerm) onCounts?.(updateCounts);
      requestAnimationFrame(() => {
        if (contentRef.current && scrollTop !== undefined) {
          contentRef.current.scrollTop = scrollTop;
        }
      });
    } catch (joinError) {
      setError(joinError?.message || "We couldn't join that channel. Please try again.");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <main id="channel-browser-pane" className="channel-view channel-browser" data-testid="channel-browser">
      <div className="channel-main">
        <header className="channel-header channel-browser-header">
          <span className="channel-browser-title">
            <CompassIcon size={20} strokeWidth={1.8} aria-hidden="true" />
            <span className="ch-name">Browse public channels</span>
          </span>
          <span className="ch-meta">
            {counts.all} {counts.all === 1 ? "channel" : "channels"}
          </span>
          <button type="button" className="btn-primary channel-browser-create" onClick={onCreate}>
            <PlusIcon size={16} strokeWidth={2} aria-hidden="true" />
            Create
          </button>
        </header>

        <div ref={contentRef} className="channel-browser-content">
          <div className="channel-browser-tools">
            <label className="channel-browser-search">
              <SearchIcon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">Search public channels</span>
              <input
                ref={searchInputRef}
                type="search"
                data-testid="channel-browser-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setError("");
                }}
                placeholder="Search by name, topic, or description"
                autoComplete="off"
                enterKeyHint="search"
                aria-controls={resultsId}
              />
              {query ? (
                <button
                  type="button"
                  className="channel-browser-search-clear"
                  data-testid="channel-browser-search-clear"
                  aria-label="Clear channel search"
                  onClick={() => {
                    setQuery("");
                    setError("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <XIcon size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              ) : null}
            </label>
            <div className="channel-browser-filters" role="group" aria-label="Filter public channels">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "active" : ""}
                  aria-pressed={filter === item.id}
                  onClick={() => {
                    setPage({ cursor: "", number: 1, history: [] });
                    setFilter(item.id);
                    setError("");
                  }}
                >
                  <span>{item.label}</span>
                  <span className="channel-browser-filter-count">{counts[item.id] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="error channel-browser-error" role="alert">{error}</div>}
          <div className="channel-browser-results-summary" aria-live="polite">
            {loading ? "Loading public channels…" : resultSummary}
          </div>
          <div
            id={resultsId}
            className="channel-browser-list"
            data-testid="channel-browser-list"
            aria-busy={loading}
            aria-label="Public channels"
            role={channels.length > 0 ? "list" : undefined}
          >
            {loading ? (
              <ChannelSkeleton />
            ) : emptyCopy ? (
              <div className="empty-state channel-browser-empty">
                <CompassIcon className="empty-state-glyph" size={34} strokeWidth={1.4} aria-hidden="true" />
                <h3>{emptyCopy.title}</h3>
                <p>{emptyCopy.detail}</p>
              </div>
            ) : (
              channels.map((channel) => {
                const joined = channel.joined || joinedIds.has(channel.id);
                const hidden = joined && hiddenIds.has(channel.id);
                return (
                  <article
                    key={channel.id}
                    className="channel-browser-row"
                    data-testid={`browse-channel-${channel.name}`}
                    aria-busy={joiningId === channel.id}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="channel-browser-open"
                      aria-label={`${joined ? "View" : "Preview"} #${channel.name}`}
                      onClick={() => onOpen(channel)}
                    >
                      <span className="channel-browser-hash" aria-hidden="true">
                        <HashIcon size={18} strokeWidth={1.8} />
                      </span>
                      <span className="channel-browser-copy">
                        <span className="channel-browser-name">{channel.name}</span>
                        {channel.topic || channel.description ? (
                          <span className="channel-browser-topic">
                            {channel.topic || channel.description}
                          </span>
                        ) : null}
                        <span className="channel-browser-members">
                          <UsersIcon size={14} strokeWidth={1.7} aria-hidden="true" />
                          {channel.memberCount || 0} {(channel.memberCount || 0) === 1 ? "member" : "members"}
                        </span>
                      </span>
                    </button>
                    {joined ? (
                      <button
                        type="button"
                        className="btn-secondary channel-browser-action"
                        aria-label={`${hidden ? "Show" : "Open"} #${channel.name}`}
                        onClick={() => onOpen(channel)}
                      >
                        {hidden ? "Show" : "Open"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary channel-browser-action"
                        disabled={joiningId === channel.id}
                        aria-label={`Join #${channel.name}`}
                        onClick={() => join(channel)}
                      >
                        {joiningId === channel.id ? "Joining…" : "Join"}
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </div>

          {page.number > 1 || hasMore ? (
            <nav className="channel-browser-pagination" aria-label="Channel catalog pages">
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || page.number === 1}
                onClick={() => setPage((current) => ({
                  cursor: current.history.at(-1) || "",
                  number: Math.max(1, current.number - 1),
                  history: current.history.slice(0, -1),
                }))}
              >
                Previous
              </button>
              <span>Page {page.number}</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={loading || !hasMore || !nextCursor}
                onClick={() => setPage((current) => ({
                  cursor: nextCursor,
                  number: current.number + 1,
                  history: [...current.history, current.cursor],
                }))}
              >
                Next
              </button>
            </nav>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ChannelSkeleton() {
  return (
    <div className="channel-browser-skeleton" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="channel-browser-row" key={item}>
          <span className="channel-browser-hash skeleton-block" />
          <span className="channel-browser-copy">
            <span className="skeleton-block skeleton-title" />
            <span className="skeleton-block skeleton-topic" />
            <span className="skeleton-block skeleton-meta" />
          </span>
        </div>
      ))}
    </div>
  );
}
