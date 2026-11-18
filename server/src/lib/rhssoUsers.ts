// Match Echo's case-insensitive usernames without rewriting distinct RHSSO
// usernames into the same account or falling back to an RHSSO internal ID.
export function rhssoUsername(value) {
  const username = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z0-9_.-]{2,32}$/.test(username)) {
    throw Object.assign(new Error("RHSSO must provide a username of 2-32 letters, numbers, ., _ or -."), { status: 400 });
  }
  return username;
}

export function rhssoUserQuery(username) {
  return {
    username: rhssoUsername(username),
    $or: [{ authOrigin: "rhsso" }, { rhssoSubject: { $exists: true } }],
  };
}
