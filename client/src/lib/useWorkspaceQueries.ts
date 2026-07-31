import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { queryKeys } from "./queryClient.js";

const EMPTY_LIST: any[] = [];
const EMPTY_SET = new Set<string>();

export const workspaceKeys = {
  all: ["workspace"] as const,
  channels: ["workspace", "channels"] as const,
  dms: ["workspace", "dms"] as const,
  users: ["workspace", "users"] as const,
  emojis: ["workspace", "emojis"] as const,
  vips: ["workspace", "vips"] as const,
};

function useQueryState(queryKey, queryFn, enabled, fallback) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn, enabled });
  const setData = useCallback((updater) => {
    queryClient.setQueryData(queryKey, (previous) =>
      typeof updater === "function" ? updater(previous ?? fallback) : updater
    );
  }, [fallback, queryClient, queryKey]);
  return [query.data ?? fallback, setData, query];
}

export function useWorkspaceQueries(enabled) {
  const [channels, setChannels, channelsQuery] = useQueryState(
    workspaceKeys.channels,
    async () => (await api.listChannels()).channels || [],
    enabled,
    EMPTY_LIST,
  );
  const [dms, setDms, dmsQuery] = useQueryState(
    workspaceKeys.dms,
    async () => (await api.listDms()).conversations || [],
    enabled,
    EMPTY_LIST,
  );
  const [users, setUsers, usersQuery] = useQueryState(
    workspaceKeys.users,
    async () => (await api.listUsers()).users || [],
    enabled,
    EMPTY_LIST,
  );
  const [customEmojis, setCustomEmojis] = useQueryState(
    workspaceKeys.emojis,
    async () => (await api.listEmojis()).emojis || [],
    enabled,
    EMPTY_LIST,
  );
  const [savedIds, setSavedIds] = useQueryState(
    queryKeys.savedIds,
    async () => new Set((await api.getSaved()).items?.map((item) => item.id) || []),
    enabled,
    EMPTY_SET,
  );
  const [vipIds, setVipIds] = useQueryState(
    workspaceKeys.vips,
    async () => new Set((await api.getVips()).vipIds || []),
    enabled,
    EMPTY_SET,
  );
  const activityQuery = useQuery({
    queryKey: queryKeys.activity,
    queryFn: async () => (await api.getActivity()).items || [],
    enabled,
  });

  return {
    channels,
    setChannels,
    channelsQuery,
    dms,
    setDms,
    dmsQuery,
    users,
    setUsers,
    usersQuery,
    customEmojis,
    setCustomEmojis,
    savedIds,
    setSavedIds,
    vipIds,
    setVipIds,
    activityItems: activityQuery.data || EMPTY_LIST,
  };
}
