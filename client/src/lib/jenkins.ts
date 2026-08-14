export function filterJenkinsChannels(channels = [], query = "", selectedId = "") {
  const normalized = String(query).trim().toLowerCase();
  return channels.filter((channel) => channel.id === selectedId || channel.name.toLowerCase().includes(normalized));
}
