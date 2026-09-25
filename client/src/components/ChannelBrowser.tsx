import { useEffect, useId, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CompassIcon, HashIcon, PlusIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { api } from "../api.js";
import { queryKeys } from "../lib/queryClient.js";
import { Input, InputShell } from "./Input.js";
import { Button } from "./Button.js";
import { useI18n } from "../lib/i18n.js";

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
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState({ cursor: "", number: 1, history: [] });
  const [joiningId, setJoiningId] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [membershipEpoch, setMembershipEpoch] = useState(0);
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const resultsId = useId();
  const contentRef = useRef(null);
  const channelRowRefs = useRef([]);
  const joinedIdsRef = useRef(joinedIds);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage({ cursor: "", number: 1, history: [] });
      setSearchTerm(query.trim());
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setActiveIndex(0);
    channelRowRefs.current = [];
  }, [query, filter]);

  useEffect(() => {
    const previous = joinedIdsRef.current;
    joinedIdsRef.current = joinedIds;
    if (
      previous.size === joinedIds.size &&
      [...joinedIds].every((channelId) => previous.has(channelId))
    ) {
      return;
    }
    setMembershipEpoch((epoch) => epoch + 1);
  }, [joinedIds]);

  const catalogKey = queryKeys.channelCatalog(searchTerm, filter, page.cursor, membershipEpoch);
  const { data: catalog, error: loadError, isPending: loading } = useQuery({
    queryKey: catalogKey,
    queryFn: () => api.browseChannels({
        q: searchTerm,
        membership: filter,
        cursor: page.cursor,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const channels = catalog?.channels || [];
  const counts = catalog?.counts || EMPTY_COUNTS;
  const nextCursor = catalog?.page?.nextCursor || "";
  const hasMore = !!catalog?.page?.hasMore;
  const error = actionError || loadError?.message || "";

  useEffect(() => {
    if (!catalog) return;
    onCatalog?.(channels);
    if (!searchTerm) onCounts?.(counts);
  }, [catalog]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    channelRowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, channels.length]);

  const totalForFilter = counts[filter] || 0;
  const firstResult = channels.length > 0 ? (page.number - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = firstResult ? firstResult + channels.length - 1 : 0;
  const resultSummary = totalForFilter > PAGE_SIZE
    ? t("channelResults").replace("{first}", String(firstResult)).replace("{last}", String(lastResult)).replace("{total}", String(totalForFilter))
    : t("publicChannelCount").replace("{total}", String(totalForFilter));

  function onSearchKeyDown(event) {
    if (event.key === "Enter") {
      // Read the row that is visibly active as well as the state value. This
      // avoids selecting the previous result when a debounced search finishes
      // between the Arrow and Enter key events.
      const activeRowIndex = channelRowRefs.current.findIndex((row) => row?.classList.contains("active"));
      const selected = channels[activeRowIndex >= 0 ? activeRowIndex : activeIndex];
      if (!selected || joiningId) return;
      event.preventDefault();
      if (selected.joined || joinedIds.has(selected.id)) onOpen(selected);
      else void join(selected).then(() => onOpen(selected));
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (!channels.length) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    setActiveIndex((index) => (index + delta + channels.length) % channels.length);
  }

  function getEmptyCopy() {
    if ((counts.all || 0) === 0 && !searchTerm) {
      return { title: t("noPublicChannelsYet"), detail: t("createPublicChannelHint") };
    }
    if (searchTerm) {
      return { title: t("noMatchingPublicChannels"), detail: t("noPublicChannelMatches").replace("{query}", searchTerm) };
    }
    if (filter === "available") {
      return { title: t("joinedEveryPublicChannel"), detail: t("newPublicChannelsHint") };
    }
    return { title: t("noPublicChannelJoined"), detail: t("switchToAllToJoin") };
  }
  const emptyCopy = !loading && channels.length === 0 ? getEmptyCopy() : null;

  async function join(channel) {
    setActionError("");
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
      const updateCounts = (current) => ({
        ...current,
        joined: (current.joined || 0) + 1,
        available: Math.max(0, (current.available || 0) - 1),
      });
      queryClient.setQueryData(catalogKey, (current) => current ? ({
        ...current,
        channels: filter === "available"
          ? (current.channels || []).filter((item) => item.id !== channel.id)
          : (current.channels || []).map((item) => item.id === channel.id ? nextChannel : item),
        counts: updateCounts(current.counts || EMPTY_COUNTS),
      }) : current);
      if (!searchTerm) onCounts?.(updateCounts);
      requestAnimationFrame(() => {
        if (contentRef.current && scrollTop !== undefined) {
          contentRef.current.scrollTop = scrollTop;
        }
      });
    } catch (joinError) {
      setActionError(joinError?.message || t("couldNotJoinChannel"));
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
            <span className="ch-name">{t("browsePublicChannels")}</span>
          </span>
          <span className="ch-meta">
            {counts.all} {t("publicChannels")}
          </span>
          <Button variant="primary" className="channel-browser-create" onClick={onCreate}>
            <PlusIcon size={16} strokeWidth={2} aria-hidden="true" />
            {t("create")}
          </Button>
        </header>

        <div ref={contentRef} className="channel-browser-content">
          <div className="channel-browser-tools">
            <InputShell className="channel-browser-search">
              <SearchIcon size={17} strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">{t("searchPublicChannels")}</span>
              <Input
                ref={searchInputRef}
                type="search"
                data-testid="channel-browser-search"
                aria-label={t("searchPublicChannels")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActionError("");
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={t("searchChannelsHint")}
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
                    setActionError("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <XIcon size={15} strokeWidth={2} aria-hidden="true" />
                </button>
              ) : null}
            </InputShell>
            <div className="channel-browser-filters" role="group" aria-label={t("filterPublicChannels")}>
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filter === item.id ? "active" : ""}
                  aria-pressed={filter === item.id}
                  onClick={() => {
                    setPage({ cursor: "", number: 1, history: [] });
                    setFilter(item.id);
                    setActionError("");
                  }}
                >
                  <span>{item.id === "all" ? t("allFiles") : item.id === "available" ? t("notJoined") : t("joined")}</span>
                  <span className="channel-browser-filter-count">{counts[item.id] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <div className="error channel-browser-error" role="alert">{error}</div>}
          <div className="channel-browser-results-summary" aria-live="polite">
            {loading ? t("loadingPublicChannels") : resultSummary}
          </div>
          <div
            id={resultsId}
            className="channel-browser-list"
            data-testid="channel-browser-list"
            aria-busy={loading}
            aria-label={t("publicChannels")}
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
              channels.map((channel, index) => {
                const joined = channel.joined || joinedIds.has(channel.id);
                const hidden = joined && hiddenIds.has(channel.id);
                return (
                  <article
                    key={channel.id}
                    className={`channel-browser-row${index === activeIndex ? " active" : ""}`}
                    data-testid={`browse-channel-${channel.name}`}
                    ref={(element) => { channelRowRefs.current[index] = element; }}
                    aria-busy={joiningId === channel.id}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="channel-browser-open"
                      aria-label={`${joined ? t("view") : t("previewChannel")} #${channel.name}`}
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
                          {channel.memberCount || 0} {(channel.memberCount || 0) === 1 ? t("member") : t("groupMembers")}
                        </span>
                      </span>
                    </button>
                    {joined ? (
                      <button
                        type="button"
                        className="btn-secondary channel-browser-action"
                        aria-label={`${hidden ? t("show") : t("open")} #${channel.name}`}
                        onClick={() => onOpen(channel)}
                      >
                        {hidden ? t("show") : t("open")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary channel-browser-action"
                        disabled={joiningId === channel.id}
                        aria-label={`${t("join")} #${channel.name}`}
                        onClick={() => join(channel)}
                      >
                        {joiningId === channel.id ? t("joining") : t("join")}
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </div>

          {page.number > 1 || hasMore ? (
            <nav className="channel-browser-pagination" aria-label={t("channelCatalogPages")}>
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
                {t("previous")}
              </button>
              <span>{t("pageNumber").replace("{count}", String(page.number))}</span>
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
                {t("next")}
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
