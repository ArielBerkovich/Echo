// A suffix is a duplicate only when removing exactly one final 1 or 2
// yields an existing username (programmer11 -> programmer1).
export function findHideCandidates(users, currentUserId) {
  const usernames = new Set(users.map((user) => user.username.toLowerCase()));
  const archived = [];
  const duplicates = [];
  for (const user of users) {
    if (user.hidden || user.isAdmin || user.id === currentUserId || user.username === "system") continue;
    if (user.deprecated) archived.push(user);
    else if (/[12]$/.test(user.username) && usernames.has(user.username.slice(0, -1).toLowerCase())) duplicates.push(user);
  }
  return { archived, duplicates };
}
