// Users @-mentioned in `body` who aren't members of `channel` yet. Only
// relevant for PRIVATE channels — in public channels a non-member still sees
// the mention (Activity feed + can open the channel). @everyone and unknown
// handles are ignored.
export function nonMemberMentions(channel, users, body) {
  if (channel.type !== "private") return [];
  const memberIds = new Set(channel.members || []);
  const byUsername = new Map(users.map((u) => [u.username.toLowerCase(), u]));
  const found = new Map();
  const re = /(?:^|\s)@([\w.-]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const uname = m[1].toLowerCase();
    if (uname === "everyone") continue;
    const u = byUsername.get(uname);
    if (u && !memberIds.has(u.id) && !found.has(u.id)) found.set(u.id, u);
  }
  return [...found.values()];
}
