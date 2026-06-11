// Split a raw search string into its free-text portion and the structured
// filter tokens (in:/from:/has:). Mirrors the server-side parser so the
// results header can render the active filters as chips.
export function parseSearchQuery(raw) {
  let text = ` ${raw} `;
  const filters = [];

  const inM = text.match(/(?:^|\s)in:#?(\S+)/i);
  if (inM) {
    filters.push({ type: "in", value: inM[1] });
    text = text.replace(inM[0], " ");
  }
  const fromM = text.match(/(?:^|\s)from:@?(\S+)/i);
  if (fromM) {
    filters.push({ type: "from", value: fromM[1] });
    text = text.replace(fromM[0], " ");
  }
  const hasM = text.match(/(?:^|\s)has:(\w+)/i);
  if (hasM) {
    filters.push({ type: "has", value: hasM[1].toLowerCase() });
    text = text.replace(hasM[0], " ");
  }
  return { text: text.trim(), filters };
}

// Human-readable label for a filter chip.
export function filterChipLabel({ type, value }) {
  if (type === "in") return `in: #${value}`;
  if (type === "from") return `from: @${value.replace(/^@/, "")}`;
  return `has: ${value}`;
}
