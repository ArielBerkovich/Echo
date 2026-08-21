// Users @-mentioned in `body` who aren't members of `channel` yet. Only
// relevant for PRIVATE channels — in public channels a non-member still sees
// the mention (Activity feed + can open the channel). @everyone and unknown
// handles are ignored.
// `\w` is ASCII-only in JavaScript, so it cannot detect a mention query while
// the user is typing a non-Latin display name. Usernames remain ASCII handles;
// this pattern is specifically for the composer's autocomplete query.
export const MENTION_QUERY_RE = /(?:^|\s)([@#])([\p{L}\p{N}\p{M}_.-]*)$/u;

export function nonMemberMentions(channel, users, body) {
  if (channel.type !== "private") return [];
  const memberIds = new Set(channel.members || []);
  const byUsername = new Map();
  for (const user of users) {
    byUsername.set(user.username.toLowerCase(), user);
    for (const alias of user.aliases || []) byUsername.set(String(alias).toLowerCase(), user);
  }
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
