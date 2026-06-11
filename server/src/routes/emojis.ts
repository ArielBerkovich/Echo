import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { CustomEmoji } from "../models/CustomEmoji.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { putObject, FILE_CATEGORY } from "../storage.js";
import { emitAll } from "../realtime.js";

export const emojisRouter = Router();
emojisRouter.use(requireAuth);

// Custom emoji are images; keep them small (5 MB) — they're shown inline.
const MAX_EMOJI_BYTES = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EMOJI_BYTES, files: 1 },
});

// GET /api/emojis — every workspace custom emoji.
emojisRouter.get("/", async (_req, res) => {
  const emojis = await CustomEmoji.find().sort({ name: 1 });
  res.json({ emojis: emojis.map((e) => e.toPublicJSON()) });
});

// POST /api/emojis (multipart: name + file) — register a new custom emoji.
emojisRouter.post("/", upload.single("file"), async (req, res) => {
  // Accept ":code:" or "code"; normalize to the bare shortcode.
  const name = String(req.body?.name || "").trim().replace(/^:|:$/g, "").toLowerCase();
  if (!/^[a-z0-9_-]{2,32}$/.test(name)) {
    return res.status(400).json({ error: "name must be 2-32 chars: letters, numbers, _ or -" });
  }
  if (!req.file) return res.status(400).json({ error: "an image file is required" });

  const ALLOWED_EMOJI_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  const detected = await fileTypeFromBuffer(req.file.buffer);
  const contentType = detected?.mime ?? "";
  if (!ALLOWED_EMOJI_MIME.has(contentType)) {
    return res.status(400).json({ error: "custom emoji must be a PNG, JPEG, GIF, or WebP image" });
  }

  const existing = await CustomEmoji.findOne({ name });
  if (existing) return res.status(409).json({ error: `":${name}:" already exists` });

  try {
    const key = await putObject({
      buffer: req.file.buffer,
      name: req.file.originalname,
      contentType,
      category: FILE_CATEGORY.EMOJI,
    });
    const emoji = await CustomEmoji.create({ name, key, contentType, createdBy: req.user._id });
    const payload = emoji.toPublicJSON();
    emitAll("emoji:new", payload); // live-update every open picker
    res.status(201).json({ emoji: payload });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: `":${name}:" already exists` });
    console.error("custom emoji create failed:", err);
    res.status(502).json({ error: "could not save custom emoji" });
  }
});

// Surface multer's size-limit error as a clean 413.
emojisRouter.use((err, _req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "emoji image must be 5 MB or smaller" });
  }
  next(err);
});
