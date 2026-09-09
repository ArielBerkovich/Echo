import { useMemo } from "react";
import { createRenderer } from "../markdown.js";
import { useAuthUrls } from "./useAuthUrl.js";

const EMPTY = [];
const rendererCache = [];
const MAX_RENDERERS = 8;

export function useMarkdownRenderer(users = EMPTY, username, customEmojis = EMPTY, channels = EMPTY) {
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
  // The hook is remounted when navigating between feeds and conversations.
  // Reuse the renderer (and its bounded HTML cache) for the same workspace
  // inputs. Include resolved URLs so revoked blobs are never reused after
  // authenticated media expires or the account changes.
  const emojiUrls = JSON.stringify(authenticatedEmojis.map(({ name, url }) => [name, url]));
  return useMemo(() => {
    const index = rendererCache.findIndex((entry) =>
      entry.users === users && entry.username === username &&
      entry.channels === channels && entry.emojiUrls === emojiUrls
    );
    if (index !== -1) {
      const [entry] = rendererCache.splice(index, 1);
      rendererCache.push(entry);
      return entry.render;
    }
    const render = createRenderer(knownUsernames, username, authenticatedEmojis, channels);
    rendererCache.push({ users, username, channels, emojiUrls, render });
    if (rendererCache.length > MAX_RENDERERS) rendererCache.shift();
    return render;
  }, [users, knownUsernames, username, emojiUrls, channels]);
}
