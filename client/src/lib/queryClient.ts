import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  activity: ["activity"] as const,
  saved: ["saved"] as const,
  savedIds: ["workspace", "saved-ids"] as const,
  search: (query: string) => ["search", "messages", query] as const,
  channelCatalog: (search: string, membership: string, cursor: string, membershipEpoch: number) =>
    ["channels", "catalog", { search, membership, cursor, membershipEpoch }] as const,
  messages: (channelId: string) => ["channels", channelId, "messages"] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: any) => error?.status !== 401 && failureCount < 2,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
