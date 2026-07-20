// Multer 1.x uses Busboy's Latin-1 default for multipart parameter values.
// Browsers send UTF-8 filenames, so non-ASCII names can arrive as mojibake
// (for example, Hebrew bytes rendered as ×... characters). Decode that case
// while preserving genuinely Latin-1 or already-correct Unicode names.
export function decodeMultipartFilename(name) {
  const original = String(name || "file");
  const decoded = Buffer.from(original, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? original : decoded;
}
