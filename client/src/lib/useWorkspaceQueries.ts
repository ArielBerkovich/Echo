import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api.js";
import { queryKeys } from "./queryClient.js";

const EMPTY_LIST: any[] = [];
const EMPTY_SET = new Set<string>();
const DEFAULT_BRANDING = { enabled: false, name: "Echo", imageUrl: null };

export const workspaceKeys = {
  all: ["workspace"] as const,
  channels: ["workspace", "channels"] as const,
  dms: ["workspace", "dms"] as const,
  users: ["workspace", "users"] as const,
  emojis: ["workspace", "emojis"] as const,
  starred: ["workspace", "starred"] as const,
  branding: ["workspace", "branding"] as const,
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
  const [starredIds, setStarredIds] = useQueryState(
    workspaceKeys.starred,
    async () => new Set((await api.getStarred()).starredIds || []),
    enabled,
    EMPTY_SET,
  );
  const [branding, setBranding] = useQueryState(
    workspaceKeys.branding,
    async () => (await api.getWorkspaceBranding()).branding || DEFAULT_BRANDING,
    enabled,
    DEFAULT_BRANDING,
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
    starredIds,
    setStarredIds,
    branding,
    setBranding,
    activityItems: activityQuery.data || EMPTY_LIST,
  };
}
