export const channelNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidChannelName(name) {
  return typeof name === "string" && name.length <= 64 && channelNamePattern.test(name);
}
