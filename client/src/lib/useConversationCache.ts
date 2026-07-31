import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { readJson, writeJson } from "./storage.js";

const scrollStorageKey = (userId) => `echo.scroll.${userId}`;

export function useConversationCache(userId) {
  const [messageCache, setMessageCache] = useState({});
  const [scrollStates, setScrollStates] = useState({});

  useEffect(() => {
    setScrollStates(userId ? readJson(scrollStorageKey(userId), {}) : {});
    if (!userId) setMessageCache({});
  }, [userId]);

  const cacheMessages = useCallback((channelId, messages) => {
    setMessageCache((previous) => {
      const current = previous[channelId];
      const unchanged = current === messages || (
        current &&
        current.length === messages.length &&
        current.every((message, index) => message.id === messages[index]?.id)
      );
      return unchanged ? previous : { ...previous, [channelId]: messages };
    });
  }, []);

  const rememberScrollState = useCallback((channelId, state) => {
    setScrollStates((previous) => {
      const next = { ...previous, [channelId]: state };
      if (userId) writeJson(scrollStorageKey(userId), next);
      return next;
    });
  }, [userId]);

  const clearScrollState = useCallback((channelId) => {
    setScrollStates((previous) => {
      if (!previous[channelId]) return previous;
      const next = { ...previous };
      delete next[channelId];
      if (userId) writeJson(scrollStorageKey(userId), next);
      return next;
    });
  }, [userId]);

  const prefetchMessages = useCallback((channelId) => {
    if (!channelId || messageCache[channelId]) return;
    api.getMessages(channelId)
      .then(({ messages }) => cacheMessages(channelId, messages))
      .catch(() => {});
  }, [cacheMessages, messageCache]);

  return {
    messageCache,
    scrollStates,
    cacheMessages,
    rememberScrollState,
    clearScrollState,
    prefetchMessages,
  };
}
