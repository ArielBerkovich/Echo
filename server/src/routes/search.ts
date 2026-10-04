import { Router } from "express";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { escapeSearchRegex, findSearchableChannels, searchMessages } from "../services/messageSearchService.js";

export const searchRouter = Router();
searchRouter.use(requireAuth);

const PAGE_SIZE = 20;

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
  const visible = await findSearchableChannels({ userId: req.user._id });
  const chanMap = new Map(visible.map((c) => [c._id.toString(), c]));
  let channelIds = visible.map((c) => c._id);
  let authorId;

  // in:<channel> — restrict to a single channel the user can see.
  if (inName) {
    const ch = visible.find((c) => (c.name || "").toLowerCase() === inName.toLowerCase());
    if (!ch) return res.json(empty); // unknown / inaccessible channel → no results
    channelIds = [ch._id];
  }

  // from:<@user> — restrict to one author.
  if (fromName) {
    const author = await User.findOne({
      username: new RegExp(`^${escapeSearchRegex(fromName)}$`, "i"),
    });
    if (!author) return res.json(empty);
    authorId = author._id;
  }

  // has:<file|image|link> — restrict to messages carrying attachments / links.
  // Fetch one extra to know whether another page exists, without a count query.
  const terms = text ? text.split(/\s+/).filter(Boolean) : [];
  const docs = await searchMessages({
    channelIds,
    terms,
    authorId,
    has,
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE + 1,
  });

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
