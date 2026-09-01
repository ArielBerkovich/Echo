import { Router } from "express";
import { isIP } from "node:net";
import { MentionWebhook } from "../models/MentionWebhook.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { mentionWebhookSigningSecret } from "../mentionWebhooks.js";

export const mentionWebhooksRouter = Router();
mentionWebhooksRouter.use(requireAuth);

function unsafeIpv4(host) {
  const [first, second] = host.split(".").map(Number);
  return first === 0
    || first === 10
    || first === 127
    || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19));
}

function unsafeIpv6(host) {
  const [head = "", tail = ""] = host.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right].map((group) => Number.parseInt(group, 16));
  if (groups.length !== 8 || groups.some(Number.isNaN)) return true;

  const mappedIpv4 = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mappedIpv4) return unsafeIpv4(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);

  return groups.every((group) => group === 0)
    || (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)
    || (groups[0] & 0xfe00) === 0xfc00 // unique local: fc00::/7
    || (groups[0] & 0xffc0) === 0xfe80 // link-local: fe80::/10
    || (groups[0] & 0xff00) === 0xff00; // multicast: ff00::/8
}

export function validWebhookUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const family = isIP(host);
    return !family || !(family === 4 ? unsafeIpv4(host) : unsafeIpv6(host));
  } catch {
    return false;
  }
}

function publicWebhook(webhook) {
  return webhook.toPublicJSON(mentionWebhookSigningSecret(webhook.user.toString()));
}

// GET /api/mention-webhook — the current user's single mention destination.
mentionWebhooksRouter.get("/", async (req, res) => {
  const webhook = await MentionWebhook.findOne({ user: req.user._id });
  res.json({ webhook: webhook ? publicWebhook(webhook) : null });
});

// PUT /api/mention-webhook — create or update the current user's destination.
mentionWebhooksRouter.put("/", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!validWebhookUrl(url)) return res.status(400).json({ error: "a valid public HTTPS webhook URL is required" });
  const webhook = await MentionWebhook.findOneAndUpdate(
    { user: req.user._id },
    { $set: { url, enabled: req.body?.enabled !== false } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ webhook: publicWebhook(webhook) });
});

mentionWebhooksRouter.delete("/", async (req, res) => {
  await MentionWebhook.deleteOne({ user: req.user._id });
  res.json({ ok: true });
});
