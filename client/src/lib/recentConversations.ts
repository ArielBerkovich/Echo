export const MAX_RECENT_CONVERSATIONS = 6;

export function normalizeRecents(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const recent of value) {
    if (!recent || !["channel", "dm", "user"].includes(recent.type) || !recent.id) continue;
    const key = `${recent.type}:${recent.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(recent);
  }
  return normalized;
}

export function addRecentConversation(value, item) {
  if (!item?.id || !["channel", "dm", "user"].includes(item.type)) {
    return normalizeRecents(value);
  }
  return normalizeRecents([
    item,
    ...(Array.isArray(value) ? value : []).filter(
      (recent) => !(recent?.type === item.type && recent?.id === item.id)
    ),
  ]).slice(0, MAX_RECENT_CONVERSATIONS);
}

export function recentForConversation(conversation, currentUserId) {
  if (!conversation?.id) return null;
  if (conversation.type !== "dm") {
    return conversation.name
      ? { type: "channel", id: conversation.id, name: conversation.name }
      : null;
  }

  const participants = (conversation.participants || []).filter((person) => person?.id);
  const otherParticipants = participants.filter((person) => person.id !== currentUserId);
  const isGroup = conversation.isGroup || otherParticipants.length > 1;
  const directUserId = isGroup
    ? null
    : conversation.dmUserId
      || (otherParticipants.length === 1 ? otherParticipants[0].id : null)
      || (conversation.isSelf ? currentUserId : null);
  const directUser = participants.find((person) => person.id === directUserId);

  if (directUserId) {
    return {
      type: "user",
      id: directUserId,
      displayName: directUser?.displayName || conversation.dmName || conversation.name || "Direct message",
      username: directUser?.username || conversation.dmUsername,
    };
  }

  const displayName = conversation.dmName
    || (!conversation.name?.startsWith("dm-") ? conversation.name : null)
    || otherParticipants.map((person) => person.displayName || person.username).join(", ")
    || "Group direct message";
  return { type: "dm", id: conversation.id, displayName };
}
