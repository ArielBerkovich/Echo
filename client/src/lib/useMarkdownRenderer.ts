import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api.js";
import { createRenderer } from "../markdown.js";
import { useAuthUrls } from "./useAuthUrl.js";

const EMPTY = [];
const rendererCache = [];
const MAX_RENDERERS = 8;

export function useMarkdownRenderer(users = EMPTY, username, customEmojis = EMPTY, channels = EMPTY) {
  const { data: workspaceChannels = EMPTY } = useQuery({
    queryKey: ["workspace", "channels"],
    queryFn: async () => (await api.listChannels()).channels || [],
  });
  const knownChannels = useMemo(() => {
    const byId = new Map();
    for (const channel of [...workspaceChannels, ...channels]) if (channel?.id) byId.set(channel.id, channel);
    return [...byId.values()];
  }, [workspaceChannels, channels]);
  const { data: workspaceData } = useQuery({
    queryKey: ["workspace", "settings"],
    queryFn: async () => (await api.getWorkspace()).workspace || {},
  });
  const workItemProjectUrl = workspaceData?.azureWorkItems?.enabled ? workspaceData.azureWorkItems.projectUrl : "";
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
      entry.channels === knownChannels && entry.emojiUrls === emojiUrls && entry.workItemProjectUrl === workItemProjectUrl
    );
    if (index !== -1) {
      const [entry] = rendererCache.splice(index, 1);
      rendererCache.push(entry);
      return entry.render;
    }
    const render = createRenderer(knownUsernames, username, authenticatedEmojis, knownChannels, workItemProjectUrl);
    rendererCache.push({ users, username, channels: knownChannels, emojiUrls, workItemProjectUrl, render });
    if (rendererCache.length > MAX_RENDERERS) rendererCache.shift();
    return render;
  }, [users, knownUsernames, username, emojiUrls, knownChannels, workItemProjectUrl]);
}
