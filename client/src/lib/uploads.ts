export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function uploadSizeError(files, maxBytes = MAX_UPLOAD_BYTES, label = "Files") {
  const oversized = Array.from(files || []).find((file) => file.size > maxBytes);
  if (!oversized) return "";
  const maxMb = Math.round(maxBytes / (1024 * 1024));
  return `“${oversized.name}” is too large. ${label} are limited to ${maxMb} MB each.`;
}
