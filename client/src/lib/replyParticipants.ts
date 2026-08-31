export const MAX_REPLY_PARTICIPANTS = 2;

export function appendReplyParticipant(ids = [], participantId, max = MAX_REPLY_PARTICIPANTS) {
  if (!participantId) return ids.slice(-max);
  return [...ids.filter((id) => id !== participantId), participantId].slice(-max);
}

export function visibleReplyParticipants(ids = [], max = MAX_REPLY_PARTICIPANTS) {
  return [...new Set(ids)].slice(0, max);
}

export function replyParticipantNames(ids = [], usersById) {
  const names = ids.map((id) => usersById?.get(id)?.displayName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]}, and others`;
}
