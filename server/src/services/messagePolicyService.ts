import { canParticipateInChannel, canPostToChannel } from "../models/Channel.js";
import { sanitizeAttachments, sanitizeRetro, sanitizeSurvey } from "../deliver.js";
import { sanitizeCard } from "../lib/messageCard.js";

export type MessagePermission = "join" | "manager" | null;

export function messagePermission(channel, userId, { requirePost = true } = {}): MessagePermission {
  if (!canParticipateInChannel(channel, userId)) return "join";
  if (requirePost && !canPostToChannel(channel, userId)) return "manager";
  return null;
}

export function normalizeMessageContent({ body, attachments, survey, retro, card }) {
  return {
    body: String(body || "").trim(),
    attachments: sanitizeAttachments(attachments),
    survey: sanitizeSurvey(survey),
    retro: sanitizeRetro(retro),
    card: sanitizeCard(card),
  };
}
