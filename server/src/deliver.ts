import { Channel } from "./models/Channel.js";
import { Message } from "./models/Message.js";
import { getIO } from "./realtime.js";
import { roomFor, userRoom } from "./lib/rooms.js";
import { buildMessageActivityMetadata } from "./lib/messageActivity.js";
import { dispatchMentionWebhooks } from "./mentionWebhooks.js";
import mongoose from "mongoose";

export const MAX_MESSAGE_ATTACHMENTS = 10;
export const MAX_SURVEY_OPTION_CHARACTERS = 80;
const RETRO_COLUMNS = new Set(["went-well", "to-improve", "backlog", "action-items"]);

export function sanitizeRetro(retro) {
  if (!retro || typeof retro !== "object") return null;
  const title = String(retro.title || "").trim().slice(0, 500);
  return title ? { title, items: [] } : null;
}

export function retroError(retro) {
  if (retro === undefined || retro === null) return null;
  return sanitizeRetro(retro) ? null : "a retrospective needs a title";
}

export async function updateRetro(message, userId, change) {
  if (!message?.retro) throw new Error("retro board not found");
  const action = change?.action;
  const items = message.retro.items || [];
  if (action === "add") {
    const text = String(change.text || "").trim().slice(0, 1000);
    const column = String(change.column || "");
    const link = String(change.link || "").trim().slice(0, 2048);
    if (!text || !RETRO_COLUMNS.has(column)) throw new Error("add an idea and choose a valid column");
    if (link && !["backlog", "action-items"].includes(column)) throw new Error("links are available for backlog and action items");
    items.push({ id: new mongoose.Types.ObjectId().toString(), text, column, author: userId, link: link || null });
  } else if (action === "move") {
    const item = items.find((candidate) => candidate.id === String(change.itemId));
    const column = String(change.column || "");
    if (!item || !RETRO_COLUMNS.has(column)) throw new Error("choose a valid item and column");
    item.column = column;
    if (!["backlog", "action-items"].includes(column)) item.link = null;
  } else if (action === "edit" || action === "delete") {
    const item = items.find((candidate) => candidate.id === String(change.itemId));
    if (!item) throw new Error("idea not found");
    if (String(item.author) !== String(userId) && String(message.author) !== String(userId)) {
      throw new Error("you can only edit your own idea");
    }
    if (action === "delete") message.retro.items = items.filter((candidate) => candidate.id !== item.id);
    else {
      const text = String(change.text || "").trim().slice(0, 1000);
      const link = String(change.link || "").trim().slice(0, 2048);
      if (!text) throw new Error("an idea needs text");
      if (link && !["backlog", "action-items"].includes(item.column)) throw new Error("links are available for backlog and action items");
      item.text = text; item.link = link || null;
    }
  } else throw new Error("invalid retro update");
  message.markModified("retro.items");
  await message.save();
  return message;
}

export function sanitizeSurvey(survey) {
  if (!survey || typeof survey !== "object") return null;
  const question = String(survey.question || "").trim().slice(0, 500);
  const rawOptions = Array.isArray(survey.options) ? survey.options : [];
  const options = rawOptions
    .map((option) => ({ label: String(option?.label || "").trim().slice(0, MAX_SURVEY_OPTION_CHARACTERS) }))
    .filter((option) => option.label)
    .slice(0, 10)
    .map((option) => ({ id: new mongoose.Types.ObjectId().toString(), label: option.label, votes: [] }));
  if (!question || options.length < 2) return null;
  return { question, allowMultiple: !!(survey.allowMultiple ?? survey.multipleChoice), options };
}

export function surveyError(survey) {
  if (survey === undefined || survey === null) return null;
  const rawOptions = Array.isArray(survey.options) ? survey.options : [];
  if (rawOptions.some((option) => String(option?.label || "").trim().length > MAX_SURVEY_OPTION_CHARACTERS)) {
    return `survey options must be ${MAX_SURVEY_OPTION_CHARACTERS} characters or fewer`;
  }
  const labels = rawOptions.map((option) => String(option?.label || "").trim().toLowerCase()).filter(Boolean);
  if (labels.some((label, index) => labels.indexOf(label) !== index)) {
    return "survey options must be unique";
  }
  return sanitizeSurvey(survey) ? null : "a survey needs a question and at least two options";
}

// Apply one user's complete selection atomically. The update removes only
// this user's previous votes, so simultaneous votes by different users cannot
// overwrite one another.
export async function applySurveyVote(message, userId, optionIds) {
  if (!message?.survey) throw new Error("survey not found");
  const ids = [...new Set((Array.isArray(optionIds) ? optionIds : [optionIds]).filter((id) => id != null).map(String))];
  const valid = message.survey.options.filter((option) => ids.includes(option.id));
  if ((ids.length > 0 && !valid.length) || (!message.survey.allowMultiple && valid.length > 1)) {
    throw new Error("choose a valid option");
  }
  const uid = new mongoose.Types.ObjectId(userId);
  // Use one aggregation update pipeline because MongoDB rejects a $pull and
  // $addToSet that target the same nested array in a single update document.
  const selectedIds = valid.map((option) => option.id);
  return Message.findOneAndUpdate(
    { _id: message._id, "survey.options.id": { $exists: true } },
    [{
      $set: {
        "survey.options": {
          $map: {
            input: "$survey.options",
            as: "option",
            in: {
              $mergeObjects: [
                "$$option",
                {
                  votes: {
                    $setUnion: [
                      {
                        $filter: {
                          input: { $ifNull: ["$$option.votes", []] },
                          as: "vote",
                          cond: { $ne: ["$$vote", uid] },
                        },
                      },
                      { $cond: [{ $in: ["$$option.id", selectedIds] }, [uid], []] },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    }],
    { new: true }
  );
}

export function attachmentLimitError(attachments) {
  if (!Array.isArray(attachments) || attachments.length <= MAX_MESSAGE_ATTACHMENTS) return null;
  return `A message can have up to ${MAX_MESSAGE_ATTACHMENTS} attachments`;
}

// Validate and normalise client-supplied attachment descriptors before they're
// persisted on a message: keep at most 10, require a safe storage key, and cap
// the free-text fields. Shared by every message-creation path.
export function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((a) => a && typeof a.key === "string" && /^[a-z0-9-]+\.[a-z0-9]+$/i.test(a.key))
    .slice(0, MAX_MESSAGE_ATTACHMENTS)
    .map((a) => ({
      key: a.key,
      name: String(a.name || "file").slice(0, 255),
      size: Number(a.size) || 0,
      contentType: String(a.contentType || "application/octet-stream").slice(0, 100),
      isImage: !!a.isImage,
      width: Number(a.width) || undefined,
      height: Number(a.height) || undefined,
    }));
}

// Persist a message and fan it out in real time: a `message:new` to the
// channel room, DM room joins so both participants receive it, and
// `activity:bump` to anyone it's "activity" for. Shared by the live socket
// sender and the scheduled-message dispatcher so both behave identically.
export async function deliverMessage({ channel, authorId, body, parentId, attachments, survey, retro, idempotencyKey, passwordHelpRequest }) {
  const io = getIO();
  const cid = channel._id.toString();

  const activityMetadata = await buildMessageActivityMetadata({ body, parentId });
  const doc = {
    channel: channel._id,
    author: authorId,
    body: body || "",
    parentId: parentId || null,
    attachments: attachments || [],
    survey: survey || null,
    retro: retro || null,
    passwordHelpRequest: passwordHelpRequest || null,
    ...activityMetadata,
  };
  const idem = String(idempotencyKey || "").trim().slice(0, 128);
  if (idem) doc.idempotencyKey = idem;
  const message = await Message.create(doc);
  await message.populate("author");

  // A new DM message brings the conversation back for anyone who hid it.
  if (channel.type === "dm" && channel.hiddenFor?.length) {
    await Channel.updateOne({ _id: channel._id }, { $set: { hiddenFor: [] } });
  }

  // For DMs, ensure both participants' sockets are in the room before emitting.
  if (io && channel.type === "dm") {
    for (const memberId of channel.members) {
      io.in(userRoom(memberId.toString())).socketsJoin(roomFor(cid));
    }
  }

  const payload = message.toPublicJSON();
  io?.to(roomFor(cid)).emit("message:new", payload);
  dispatchMentionWebhooks({ message, channel, author: message.author });

  // Activity badge bumps for @mentions / @everyone / thread-root authors, so it
  // updates live even for recipients not in this channel's room.
  if (channel.type !== "dm") {
    const notify = new Set();
    activityMetadata.mentionedUserIds.forEach((id) => notify.add(id.toString()));
    if (activityMetadata.mentionsEveryone) {
      channel.members.forEach((m) => notify.add(m.toString()));
    }
    if (activityMetadata.threadRootAuthor) notify.add(activityMetadata.threadRootAuthor.toString());
    notify.delete(authorId.toString()); // not your own message
    for (const uid of notify) io?.to(userRoom(uid)).emit("activity:bump");
  }

  return payload;
}
