import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import Avatar from "./Avatar.js";
import { formatDateTime } from "../lib/time.js";
import { parseSearchQuery, filterChipLabel } from "../lib/searchQuery.js";

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
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const parsed = useMemo(() => parseSearchQuery(query), [query]);

  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setPage(0);
    setHasMore(false);
    setError(null);
    setLoading(true);
    api
      .searchMessages(query, 0)
      .then(({ results, hasMore }) => {
        if (cancelled) return;
        setResults(results);
        setHasMore(hasMore);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  function loadMore() {
    const next = page + 1;
    setLoadingMore(true);
    api
      .searchMessages(query, next)
      .then(({ results: more, hasMore }) => {
        setResults((prev) => [...prev, ...more]);
        setHasMore(hasMore);
        setPage(next);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMore(false));
  }

  return (
    <main className="channel-view">
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
          <button className="ch-meta ch-meta-btn search-close-btn" data-testid="search-results-clear" onClick={onClose}>
            Clear
          </button>
        </header>

        <div className="messages search-results" data-testid="search-results">
          {loading ? (
            <div className="empty-state"><p>Searching…</p></div>
          ) : error ? (
            <div className="empty-state"><h3>Search failed</h3><p>{error}</p></div>
          ) : results.length === 0 ? (
            <div className="empty-state">
              <h3>No messages found</h3>
              <p>Nothing matched “{query}”. Try different words.</p>
            </div>
          ) : (
            <>
              {results.map((r) => (
                <button key={r.id} className="search-result" data-testid="search-result" onClick={() => onJump(r)}>
                  <Avatar name={r.author?.displayName || "?"} src={r.author?.avatarUrl} size={36} />
                  <div className="content">
                    <div className="meta">
                      <span className="author">{r.author?.displayName || "unknown"}</span>
                      <span className="activity-where">
                        {r.channelType === "dm" ? "in a DM" : `in #${r.channelName}`}
                        {r.parentId ? " · in thread" : ""}
                      </span>
                      <span className="time">{formatDateTime(r.createdAt)}</span>
                    </div>
                    <div
                      className="body markdown"
                      dir="auto"
                      dangerouslySetInnerHTML={{ __html: snippet(r.body, query) }}
                    />
                  </div>
                </button>
              ))}
              {hasMore && (
                <button className="btn-secondary search-more" disabled={loadingMore} onClick={loadMore}>
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
