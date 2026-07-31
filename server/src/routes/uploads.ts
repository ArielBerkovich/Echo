import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { config } from "../config.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { putObject, getObject } from "../storage.js";
import { decodeMultipartFilename } from "../lib/filenames.js";
import { Message } from "../models/Message.js";
import { Channel } from "../models/Channel.js";

export const uploadsRouter = Router();

// Buffer uploads in memory (capped), then hand the bytes to object storage.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: config.maxFilesPerMessage },
});

// Keys are opaque UUIDs; reject anything that isn't, to avoid path tricks.
const KEY_RE = /^[a-z0-9-]+\.[a-z0-9]+$/i;

// SVG can contain scripts — never serve it as an image.
const BLOCKED_MIME = new Set(["image/svg+xml", "text/html", "text/javascript", "application/javascript"]);

function isImage(contentType) {
  return /^image\//.test(contentType || "") && !BLOCKED_MIME.has(contentType);
}

async function safeContentType(buffer, declaredMime) {
  const detected = await fileTypeFromBuffer(buffer);
  const mime = detected?.mime ?? declaredMime ?? "application/octet-stream";
  if (BLOCKED_MIME.has(mime)) return "application/octet-stream";
  return mime;
}

// POST /api/uploads — multipart "files"; stores each and returns metadata.
uploadsRouter.post("/", requireAuth, upload.array("files"), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: "no files provided" });

  try {
    const attachments = await Promise.all(
      files.map(async (f) => {
        const name = decodeMultipartFilename(f.originalname);
        const contentType = await safeContentType(f.buffer, f.mimetype);
        const key = await putObject({ buffer: f.buffer, name, contentType });
        return {
          key,
          name,
          size: f.size,
          contentType,
          isImage: isImage(contentType),
          url: `/api/files/${key}`,
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
    const references = await Message.find({ "attachments.key": key }, { channel: 1 }).lean();
    if (references.length > 0) {
      const channelIds = [...new Set(references.map((message) => String(message.channel)))];
      const channels = await Channel.find(
        { _id: { $in: channelIds }, isArchived: { $ne: true } },
        { type: 1, members: 1 }
      );
      const canAccess = channels.some(
        (channel) => channel.type === "public" || channel.members.some((member) => member.equals(req.user._id))
      );
      if (!canAccess) return res.status(403).json({ error: "access denied" });
    }

    const obj = await getObject(key);
    if (!obj) return res.status(404).json({ error: "not found" });

    if (obj.ContentType) res.setHeader("Content-Type", obj.ContentType);
    if (obj.ContentLength != null) res.setHeader("Content-Length", obj.ContentLength);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      req.query.download ? "attachment" : "inline"
    );
    obj.Body.pipe(res);
  } catch (err) {
    console.error("file stream failed:", err);
    res.status(502).json({ error: "could not read file" });
  }
});
