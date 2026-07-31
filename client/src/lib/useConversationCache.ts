import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { queryKeys } from "./queryClient.js";
import { readJson, writeJson } from "./storage.js";

const scrollStorageKey = (userId) => `echo.scroll.${userId}`;

export function useConversationCache(userId) {
  const queryClient = useQueryClient();
  const [scrollStates, setScrollStates] = useState({});

  useEffect(() => {
    setScrollStates(userId ? readJson(scrollStorageKey(userId), {}) : {});
  }, [userId]);

  const cacheMessages = useCallback((channelId, messages) => {
    queryClient.setQueryData(queryKeys.messages(channelId), { messages });
  }, [queryClient]);

  const getCachedMessages = useCallback((channelId) =>
    queryClient.getQueryData(queryKeys.messages(channelId))?.messages || null,
  [queryClient]);

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
    if (!channelId) return;
    queryClient.prefetchQuery({
      queryKey: queryKeys.messages(channelId),
      queryFn: () => api.getMessages(channelId),
    });
  }, [queryClient]);

  return {
    scrollStates,
    cacheMessages,
    getCachedMessages,
    rememberScrollState,
    clearScrollState,
    prefetchMessages,
  };
}
