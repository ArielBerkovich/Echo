import { useMemo } from "react";
import { createRenderer } from "../markdown.js";
import { useAuthUrls } from "./useAuthUrl.js";

export function useMarkdownRenderer(users = [], username, customEmojis = [], channels = []) {
  const knownUsernames = useMemo(() => {
    const map = new Map();
    for (const user of users) {
      const canonical = user.username.toLowerCase();
      const mentionUser = {
        username: canonical,
        displayName: user.displayName || user.username,
      };
      map.set(canonical, mentionUser);
      for (const alias of user.aliases || []) map.set(String(alias).toLowerCase(), mentionUser);
    }
    return map;
  }, [users]);
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
