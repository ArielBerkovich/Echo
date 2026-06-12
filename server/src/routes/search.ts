import { Router } from "express";
import { Channel } from "../models/Channel.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

const PAGE_SIZE = 20;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pull `in:<channel>`, `from:<@user>` and `has:<file|image|link>` filters out
// of the raw query, returning them plus the leftover free text.
function parseQuery(raw) {
  let text = ` ${raw} `;
  let inName = null;
  let fromName = null;
  let has = null;

  // Tolerate an optional space after the colon, e.g. both `from:@ann` and
  // `from: @ann` (and likewise for in:/has:).
  const inMatch = text.match(/(?:^|\s)in:\s*#?(\S+)/i);
  if (inMatch) {
    inName = inMatch[1];
    text = text.replace(inMatch[0], " ");
  }
  const fromMatch = text.match(/(?:^|\s)from:\s*@?(\S+)/i);
  if (fromMatch) {
    fromName = fromMatch[1];
    text = text.replace(fromMatch[0], " ");
  }
  const hasMatch = text.match(/(?:^|\s)has:\s*(\w+)/i);
  if (hasMatch) {
    has = hasMatch[1].toLowerCase();
    text = text.replace(hasMatch[0], " ");
  }
  return { text: text.trim(), inName, fromName, has };
}

// GET /api/search/messages?q=<terms>&page=<n> — substring search over message
// bodies, restricted to conversations the user can see (public channels + the
// channels and DMs they belong to), newest first. Supports `in:<channel>`,
// `from:<@user>` and `has:<file|image|link>` filters.
searchRouter.get("/messages", async (req, res) => {
  const raw = String(req.query.q || "").trim().slice(0, 200);
  const empty = { query: raw, page: 0, hasMore: false, results: [] };
  if (!raw) return res.json(empty);

  const { text, inName, fromName, has } = parseQuery(raw);
  if (!text && !inName && !fromName && !has) return res.json(empty);

  const page = Math.max(0, parseInt(req.query.page, 10) || 0);

  // Channels this user is allowed to search within (public + their own).
  const visible = await Channel.find(
    { $or: [{ type: "public" }, { members: req.user._id }] },
    { _id: 1, name: 1, type: 1 }
  );
  const chanMap = new Map(visible.map((c) => [c._id.toString(), c]));

  const filter = {
    channel: { $in: visible.map((c) => c._id) },
    kind: { $ne: "system" },
  };

  // in:<channel> — restrict to a single channel the user can see.
  if (inName) {
    const ch = visible.find((c) => (c.name || "").toLowerCase() === inName.toLowerCase());
    if (!ch) return res.json(empty); // unknown / inaccessible channel → no results
    filter.channel = ch._id;
  }

  // from:<@user> — restrict to one author.
  if (fromName) {
    const author = await User.findOne({
      username: new RegExp(`^${escapeRegex(fromName)}$`, "i"),
    });
    if (!author) return res.json(empty);
    filter.author = author._id;
  }

  // has:<file|image|link> — restrict to messages carrying attachments / links.
  if (has === "file") filter["attachments.0"] = { $exists: true };
  else if (has === "image") filter.attachments = { $elemMatch: { isImage: true } };
  else if (has === "link") filter.body = { $regex: /https?:\/\//i };

  // Free text: case-insensitive "contains" match. Each whitespace-separated
  // term must appear as a substring of the body (so "heyy" finds "heyyy", and
  // "foo bar" finds messages containing both). This is the intuitive chat-search
  // behaviour — MongoDB's $text only matched whole, stemmed words.
  if (text) {
    filter.$and = text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 10)
      .map((t) => ({ body: { $regex: escapeRegex(t), $options: "i" } }));
  }

  // Fetch one extra to know whether another page exists, without a count query.
  const docs = await Message.find(filter)
    .sort({ createdAt: -1 })
    .skip(page * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .populate("author");

  const hasMore = docs.length > PAGE_SIZE;
  const results = docs.slice(0, PAGE_SIZE).map((m) => {
    const c = chanMap.get(m.channel.toString());
    return {
      id: m._id.toString(),
      channelId: m.channel.toString(),
      channelName: c?.name || null,
      channelType: c?.type || null,
      parentId: m.parentId ? m.parentId.toString() : null,
      author: m.author?.toPublicJSON?.() || null,
      body: m.body,
      createdAt: m.createdAt,
    };
  });

  res.json({ query: raw, page, hasMore, results });
});
