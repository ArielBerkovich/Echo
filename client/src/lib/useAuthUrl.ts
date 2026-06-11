import { useEffect, useState } from "react";
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
