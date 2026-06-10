export function roomFor(channelId) {
  return `channel:${channelId}`;
}

export function userRoom(userId) {
  return `user:${userId}`;
}
