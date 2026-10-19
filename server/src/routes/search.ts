import { Router } from "express";
import { User } from "../models/User.js";
import { Channel } from "../models/Channel.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { escapeSearchRegex, searchMessages } from "../services/messageSearchService.js";

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
  // Display names can contain spaces; stop at the next structured filter.
  const fromMatch = text.match(/(?:^|\s)from:\s*@?(.+?)(?=\s+(?:in:|from:|has:)|\s*$)/i);
  if (fromMatch) {
    fromName = fromMatch[1].trim();
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
  let channelId;
  let authorId;

  // in:<channel> — restrict to a single channel the user can see.
  if (inName) {
    const ch = await Channel.findOne({
      name: new RegExp(`^${escapeSearchRegex(inName)}$`, "i"),
      $or: [{ type: "public" }, { members: req.user._id }],
    }, { _id: 1 });
    if (!ch) return res.json(empty); // unknown / inaccessible channel → no results
    channelId = ch._id;
  }

  // from:<@user> — restrict to one author.
  if (fromName) {
    const escapedName = new RegExp(`^${escapeSearchRegex(fromName)}$`, "i");
    const author = await User.findOne({ $or: [{ username: escapedName }, { displayName: escapedName }] });
    if (!author) return res.json(empty);
    authorId = author._id;
  }

  // has:<file|image|link> — restrict to messages carrying attachments / links.
  // Fetch one extra to know whether another page exists, without a count query.
  const terms = text ? text.split(/\s+/).filter(Boolean) : [];
  const docs = await searchMessages({
    userId: req.user._id,
    channelId,
    terms,
    authorId,
    has,
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE + 1,
  });

  const hasMore = docs.length > PAGE_SIZE;
  const results = docs.slice(0, PAGE_SIZE).map((m) => {
    const author = m.authorInfo;
    return {
      id: m._id.toString(),
      channelId: m.channel.toString(),
      channelName: m.channelName || null,
      channelType: m.channelType || null,
      parentId: m.parentId ? m.parentId.toString() : null,
      author: author ? {
        id: author._id.toString(),
        username: author.username,
        displayName: author.displayName,
        avatarUrl: author.avatarUrlOverride || (author.avatarKey ? `/api/files/${author.avatarKey}` : null),
        isAdmin: !!author.isAdmin,
        deprecated: !!author.deprecated,
        canChangePassword: author.authOrigin !== "rhsso" && !author.rhssoSubject,
        mustResetPassword: !!author.mustResetPassword,
        onboarded: !!author.onboarded,
      } : null,
      body: m.body,
      createdAt: m.createdAt,
    };
  });

  res.json({ query: raw, page, hasMore, results });
});
