// Compare words and punctuation while retaining every character, including whitespace.
export function rephraseDiff(before: string, after: string) {
  const tokenize = (text: string) => text.match(/[\p{L}\p{M}\p{N}_]+|\s+|[^\p{L}\p{M}\p{N}_\s]+/gu) || [];
  const a = tokenize(before);
  const b = tokenize(after);
  // Bound memory for unusually long or punctuation-heavy drafts.
  if (a.length * b.length > 1_000_000) {
    return { before: [{ text: before, changed: before !== after }], after: [{ text: after, changed: before !== after }] };
  }
  const width = b.length + 1;
  const lengths = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i * width + j] = a[i] === b[j]
        ? lengths[(i + 1) * width + j + 1] + 1
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }
  const oldParts: { text: string; changed: boolean }[] = [];
  const newParts: { text: string; changed: boolean }[] = [];
  const append = (parts: typeof oldParts, text: string, changed: boolean) => {
    const last = parts[parts.length - 1];
    if (last?.changed === changed) last.text += text;
    else parts.push({ text, changed });
  };
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      append(oldParts, a[i], false); append(newParts, b[j], false); i++; j++;
    } else if (j < b.length && (i === a.length || lengths[i * width + j + 1] > lengths[(i + 1) * width + j])) {
      append(newParts, b[j++], true);
    } else {
      append(oldParts, a[i++], true);
    }
  }
  return { before: oldParts, after: newParts };
}
