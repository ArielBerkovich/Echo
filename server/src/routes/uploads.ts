import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getObject } from "../storage.js";
import { decodeMultipartFilename } from "../lib/filenames.js";
import { canAccessAttachment, isImageContentType, storeAttachment } from "../services/attachmentService.js";
import { streamDownload } from "../lib/downloadStream.js";

export const uploadsRouter = Router();

// Buffer uploads in memory (capped), then hand the bytes to object storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: config.maxFilesPerMessage },
});

// Keys are opaque UUIDs; reject anything that isn't, to avoid path tricks.
const KEY_RE = /^[a-z0-9-]+\.[a-z0-9]+$/i;

// SVG can contain scripts — never serve it as an image.
// POST /api/uploads — multipart "files"; stores each and returns metadata.
uploadsRouter.post("/", requireAuth, upload.array("files"), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: "no files provided" });

  try {
    const attachments = await Promise.all(
      files.map(async (f) => {
        const name = decodeMultipartFilename(f.originalname);
        const stored = await storeAttachment({ buffer: f.buffer, name, declaredContentType: f.mimetype });
        return {
          key: stored.key,
          name,
          size: f.size,
          contentType: stored.contentType,
          isImage: isImageContentType(stored.contentType),
          url: `/api/files/${stored.key}`,
        };
      })
    );
    res.status(201).json({ attachments });
  } catch (err) {
    console.error("upload failed:", err);
    res.status(502).json({ error: "could not store upload" });
  }
});

// Multer raises this when a file exceeds the size/count limits.
uploadsRouter.use((err, _req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    const mb = Math.round(config.maxUploadBytes / (1024 * 1024));
    return res.status(413).json({ error: `File is too large. Files are limited to ${mb} MB each.` });
  }
  if (err?.code === "LIMIT_FILE_COUNT") {
    return res.status(413).json({ error: `at most ${config.maxFilesPerMessage} files per message` });
  }
  next(err);
});

// GET /api/files/:key — stream a stored object back. Requires authentication so
// private channel and DM attachments are not exposed to unauthenticated requests.
// Pass ?download=1 to force a save dialog instead of inline display.
export const filesRouter = Router();
filesRouter.get("/:key", requireAuth, async (req, res) => {
  const { key } = req.params;
  if (!KEY_RE.test(key)) return res.status(404).json({ error: "not found" });

  try {
    // Once a file is attached to a message, conversation access governs the
    // file as well. This prevents a removed private-channel/DM member from
    // continuing to use a previously learned attachment URL.
    if (!(await canAccessAttachment(key, req.user._id))) return res.status(403).json({ error: "access denied" });

    const range = typeof req.headers.range === "string" && /^bytes=\d*-\d*$/.test(req.headers.range)
      ? req.headers.range
      : undefined;
    const obj = await getObject(key, range);
    if (!obj) return res.status(404).json({ error: "not found" });

    if (obj.ContentType) res.setHeader("Content-Type", obj.ContentType);
    if (obj.ContentLength != null) res.setHeader("Content-Length", obj.ContentLength);
    if (obj.ContentRange) res.setHeader("Content-Range", obj.ContentRange);
    if (obj.AcceptRanges) res.setHeader("Accept-Ranges", obj.AcceptRanges);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      req.query.download ? "attachment" : "inline"
    );
    if (range && obj.ContentRange) res.status(206);
    streamDownload(obj.Body, res, (err) => console.error("file stream failed:", err));
  } catch (err) {
    console.error("file stream failed:", err);
    res.status(502).json({ error: "could not read file" });
  }
});
