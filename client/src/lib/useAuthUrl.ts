import { useEffect, useMemo, useState } from "react";
import { getToken } from "../api.js";

// Fetches a /api/files/* URL with the Authorization header and returns a
// local blob URL so <img> and <a> elements work without exposing the JWT.
// Returns null while loading, and the original url if it's not an api/files path.
export function useAuthUrl(url) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!url) return;
    if (!url.startsWith("/api/files/")) {
      setBlobUrl(url);
      return;
    }

    let objectUrl;
    const token = getToken();
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => setBlobUrl(null));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return blobUrl;
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
    const objectUrls = [];
    const token = getToken();

    Promise.all(
      sourceUrls.map(async (url) => {
        if (!url.startsWith("/api/files/")) return [url, url];
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error("fetch failed");
        const objectUrl = URL.createObjectURL(await res.blob());
        objectUrls.push(objectUrl);
        return [url, objectUrl];
      })
    )
      .then((entries) => {
        if (!cancelled) setResolved(new Map(entries));
      })
      .catch(() => {
        if (!cancelled) setResolved(new Map());
      });

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [signature]);

  return resolved;
}
