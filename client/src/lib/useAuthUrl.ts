import { useEffect, useMemo, useState } from "react";
import { getBackendUrl, getToken } from "../api.js";

const FILE_CACHE_TTL_MS = 2 * 60 * 1000;
const FILE_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const fileCache = new Map();
let cacheToken = null;
let cachedBytes = 0;

function isProtectedFileUrl(url) {
  return !!url?.startsWith("/api/files/");
}

function discardEntry(url, entry) {
  if (fileCache.get(url) !== entry) return;
  fileCache.delete(url);
  entry.invalidated = true;
  clearTimeout(entry.expiryTimer);
  if (entry.src) URL.revokeObjectURL(entry.src);
  cachedBytes -= entry.bytes;
}

function resetCacheForToken(token) {
  if (cacheToken === token) return;
  for (const [url, entry] of fileCache) discardEntry(url, entry);
  cacheToken = token;
}

function pruneFileCache() {
  if (cachedBytes <= FILE_CACHE_MAX_BYTES) return;
  const unused = [...fileCache.entries()]
    .filter(([, entry]) => entry.refs === 0)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [url, entry] of unused) {
    discardEntry(url, entry);
    if (cachedBytes <= FILE_CACHE_MAX_BYTES) break;
  }
}

// Share protected-file work across components and channel remounts. Keeping the
// same blob URL briefly also lets the browser reuse its decoded image instead
// of downloading and decoding an attachment on every channel visit.
function acquireAuthUrl(url) {
  if (!isProtectedFileUrl(url)) {
    return { promise: Promise.resolve(url || null), release() {} };
  }

  const token = getToken();
  resetCacheForToken(token);
  let entry = fileCache.get(url);
  if (!entry) {
    entry = {
      src: null,
      bytes: 0,
      refs: 0,
      lastUsed: Date.now(),
      expiryTimer: 0,
      invalidated: false,
      promise: null,
    };
    entry.promise = fetch(`${getBackendUrl()}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.blob();
      })
      .then((blob) => {
        if (entry.invalidated) return null;
        entry.bytes = blob.size;
        entry.src = URL.createObjectURL(blob);
        cachedBytes += blob.size;
        pruneFileCache();
        return entry.src;
      })
      .catch(() => {
        discardEntry(url, entry);
        return null;
      });
    fileCache.set(url, entry);
  }

  entry.refs += 1;
  entry.lastUsed = Date.now();
  clearTimeout(entry.expiryTimer);
  return {
    promise: entry.promise,
    release() {
      entry.refs = Math.max(0, entry.refs - 1);
      entry.lastUsed = Date.now();
      if (entry.refs > 0 || entry.invalidated) return;
      entry.expiryTimer = window.setTimeout(() => discardEntry(url, entry), FILE_CACHE_TTL_MS);
      pruneFileCache();
    },
  };
}

// Fetches a /api/files/* URL with the Authorization header and returns a
// local blob URL so <img> and <a> elements work without exposing the JWT.
// Returns null while loading, and the original url if it's not an api/files path.
export function useAuthUrl(url) {
  const [resolved, setResolved] = useState(() => ({ source: url, src: isProtectedFileUrl(url) ? null : url }));

  useEffect(() => {
    let cancelled = false;
    const handle = acquireAuthUrl(url);
    handle.promise.then((src) => {
      if (!cancelled) setResolved({ source: url, src });
    });

    return () => {
      cancelled = true;
      handle.release();
    };
  }, [url]);

  return resolved.source === url ? resolved.src : (isProtectedFileUrl(url) ? null : url);
}

// Resolve several protected file URLs together (used by custom emoji lists).
// Keeping this here makes all authenticated media follow the same lifecycle
// and ensures blob URLs are revoked when the source set changes.
export function useAuthUrls(urls = []) {
  const sourceUrls = useMemo(() => urls.filter(Boolean), [urls]);
  const signature = sourceUrls.join("\u0000");
  const [resolved, setResolved] = useState(() => new Map());

  useEffect(() => {
    let cancelled = false;
    const handles = sourceUrls.map((url) => [url, acquireAuthUrl(url)]);
    Promise.all(handles.map(async ([url, handle]) => [url, await handle.promise]))
      .then((entries) => {
        if (!cancelled) setResolved(new Map(entries.filter(([, src]) => src)));
      });

    return () => {
      cancelled = true;
      handles.forEach(([, handle]) => handle.release());
    };
  }, [signature]);

  return resolved;
}
