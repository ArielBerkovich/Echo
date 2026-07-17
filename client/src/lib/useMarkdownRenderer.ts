import { useMemo } from "react";
import { createRenderer } from "../markdown.js";
import { useAuthUrls } from "./useAuthUrl.js";

export function useMarkdownRenderer(users = [], username, customEmojis = [], channels = []) {
  const knownUsernames = useMemo(
    () => new Set(users.map((u) => u.username.toLowerCase())),
    [users]
  );
  const authUrls = useAuthUrls(customEmojis.map((e) => e.url));
  const authenticatedEmojis = useMemo(
    () => customEmojis
      .map((emoji) => ({ ...emoji, url: authUrls.get(emoji.url) }))
      .filter((emoji) => emoji.url),
    [customEmojis, authUrls]
  );
  return useMemo(
    () => createRenderer(knownUsernames, username, authenticatedEmojis, channels),
    [knownUsernames, username, authenticatedEmojis, channels]
  );
}
