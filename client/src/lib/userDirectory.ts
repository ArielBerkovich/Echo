type DirectoryPage<User> = { users: User[]; hasMore?: boolean };
type PageOptions = { page: number; limit: number; signal?: AbortSignal };

// Publish a complete snapshot only after every page succeeds. The server may
// include the signed-in user on page zero as well as their normal sorted page.
export async function loadUserDirectory<User extends { id: string }>(
  fetchPage: (options: PageOptions) => Promise<DirectoryPage<User>>,
  { signal }: { signal?: AbortSignal } = {},
): Promise<User[]> {
  const users = new Map<string, User>();
  for (let page = 0; ; page++) {
    const result = await fetchPage({ page, limit: 200, signal });
    for (const user of result.users) users.set(user.id, user);
    if (!result.hasMore) return [...users.values()];
  }
}
