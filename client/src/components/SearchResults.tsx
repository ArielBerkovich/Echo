import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import { formatDateTime } from "../lib/time.js";
import { parseSearchQuery, filterChipLabel } from "../lib/searchQuery.js";
import { queryKeys } from "../lib/queryClient.js";

const SNIPPET_MAX = 240;

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a plain-text excerpt centered on the first matching term, with the
// query terms wrapped in <mark>. Chat messages are short, so this stays cheap.
function snippet(body, query) {
  const text = (body || "").replace(/\s+/g, " ").trim();
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let start = 0;
  if (terms.length) {
    const first = terms
      .map((t) => lower.indexOf(t.toLowerCase()))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    if (first > 80) start = first - 60;
  }
  let excerpt = text.slice(start, start + SNIPPET_MAX);
  if (start > 0) excerpt = "…" + excerpt;
  if (start + SNIPPET_MAX < text.length) excerpt = excerpt + "…";

  let html = escapeHtml(excerpt);
  if (terms.length) {
    const re = new RegExp(`(${terms.map(escapeRegex).join("|")})`, "gi");
    html = html.replace(re, "<mark>$1</mark>");
  }
  return html;
}

// Dedicated results pane for full-text message search (triggered on Enter).
export default function SearchResults({ query, onJump, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const paneRef = useRef(null);
  const resultRefs = useRef([]);
  const parsed = useMemo(() => parseSearchQuery(query), [query]);
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage: hasMore,
    isFetchingNextPage: loadingMore,
    isPending: loading,
  } = useInfiniteQuery({
    queryKey: queryKeys.search(query),
    queryFn: ({ pageParam }) => api.searchMessages(query, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length : undefined,
  });
  const results = data?.pages.flatMap((page) => page.results || []) || [];
  const resultIndex = useMemo(
    () => new Map(results.map((result, index) => [result.id, index])),
    [results]
  );
  const groupedResults = useMemo(() => {
    const groups = [];
    const byConversation = new Map();
    results.forEach((result) => {
      const key = result.channelId || "unknown";
      let group = byConversation.get(key);
      if (!group) {
        group = {
          key,
          label: result.channelType === "dm" ? "Direct message" : `#${result.channelName || "unknown"}`,
          results: [],
        };
        byConversation.set(key, group);
        groups.push(group);
      }
      group.results.push(result);
    });
    return groups;
  }, [results]);

  useEffect(() => {
    setActiveIndex(0);
    resultRefs.current = [];
    paneRef.current?.focus();
  }, [query]);

  useEffect(() => {
    resultRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function onResultsKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        return (index + delta + results.length) % results.length;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onJump(results[activeIndex]);
    }
  }

  return (
    <main
      className="channel-view"
      ref={paneRef}
      data-testid="search-results-pane"
      tabIndex={-1}
      onKeyDown={onResultsKeyDown}
      aria-label="Search results"
    >
      <div className="channel-main">
        <header className="channel-header" data-testid="search-results-header">
          <span className="ch-name">Search</span>
          <div className="search-chips">
            {parsed.filters.map((f) => (
              <span key={f.type} className={`search-chip search-chip-${f.type}`}>
                {filterChipLabel(f)}
              </span>
            ))}
            {parsed.text && <span className="search-chip-text">“{parsed.text}”</span>}
          </div>
          {!loading && !error && results.length > 0 && (
            <span className="search-result-count" data-testid="search-result-count">
              {results.length} {results.length === 1 ? "result" : "results"}
            </span>
          )}
          <button className="ch-meta ch-meta-btn search-close-btn" data-testid="search-results-clear" onClick={onClose}>
            Clear
          </button>
        </header>

        <div className="messages search-results" data-testid="search-results">
          {loading ? (
            <div className="empty-state"><p>Searching…</p></div>
          ) : error ? (
            <div className="empty-state"><h3>Search failed</h3><p>{error.message}</p></div>
          ) : results.length === 0 ? (
            <div className="empty-state">
              <h3>No messages found</h3>
              <p>Nothing matched “{query}”. Try a shorter phrase or remove a filter.</p>
              <p className="search-empty-hint">Tip: use <code>in:channel</code>, <code>from:@user</code>, or <code>has:file</code>.</p>
            </div>
          ) : (
            <>
              {groupedResults.map((group) => (
                <section className="search-result-group" key={group.key} aria-label={group.label}>
                  <div className="search-result-group-title">{group.label}</div>
                  {group.results.map((r) => {
                    const index = resultIndex.get(r.id);
                    return (
                      <button
                        key={r.id}
                        ref={(element) => { resultRefs.current[index] = element; }}
                        className={`search-result ${index === activeIndex ? "active" : ""}`}
                        data-testid="search-result"
                        data-search-index={index}
                        aria-current={index === activeIndex ? "true" : undefined}
                        tabIndex={index === activeIndex ? 0 : -1}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => onJump(r)}
                      >
                        <Avatar name={r.author?.displayName || "?"} src={r.author?.avatarUrl} size={36} />
                        <div className="content">
                          <div className="meta">
                            <span className="author">{r.author?.displayName || "unknown"}</span>
                            <span className="activity-where">
                              {r.channelType === "dm" ? "in a DM" : `in #${r.channelName}`}
                              {r.parentId ? " · in thread" : ""}
                            </span>
                            <span className="time">{formatDateTime(r.createdAt, "en-US")}</span>
                          </div>
                          <div
                            className="body markdown"
                            dir="auto"
                            dangerouslySetInnerHTML={{ __html: snippet(r.body, parsed.text) }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </section>
              ))}
              {hasMore && (
                <button className="btn-secondary search-more" data-testid="search-load-more" disabled={loadingMore} onClick={() => fetchNextPage()}>
                  {loadingMore ? "Loading…" : "Load more results"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
