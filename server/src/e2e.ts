import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { ActivityEvent } from "./models/ActivityEvent.js";
import { Channel } from "./models/Channel.js";
import { CustomEmoji } from "./models/CustomEmoji.js";
import { Message } from "./models/Message.js";
import { Read } from "./models/Read.js";
import { User } from "./models/User.js";
import { ensureDefaultChannel } from "./seed.js";

async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

export async function resetE2EAuthFixture() {
  await clearDatabase();
  await ensureDefaultChannel();
}

export async function resetE2EWorkspaceFixture() {
  await clearDatabase();

  const passwordHash = await bcrypt.hash("Password1", 10);
  const system = await User.create({
    username: "system",
    displayName: "Echo",
    passwordHash: "x",
  });
  const alice = await User.create({
    username: "alice",
    displayName: "Alice",
    passwordHash,
    isAdmin: true,
    onboarded: true,
  });
  const bob = await User.create({
    username: "bob",
    displayName: "Bob Builder",
    passwordHash,
    onboarded: true,
  });

  const general = await Channel.create({
    name: "general",
    type: "public",
    topic: "Team updates",
    members: [alice._id, bob._id],
    createdBy: alice._id,
  });
  const projectAlpha = await Channel.create({
    name: "project-alpha",
    type: "public",
    topic: "A very long planning topic that should truncate instead of pushing actions away",
    members: [alice._id],
    createdBy: alice._id,
  });
  const marketing = await Channel.create({
    name: "marketing",
    type: "public",
    topic: "Launch prep and announcements",
    members: [bob._id],
    createdBy: bob._id,
  });
  const dmAliceBob = await Channel.create({
    name: `dm-${[alice._id.toString(), bob._id.toString()].sort().join("-")}`,
    type: "dm",
    members: [alice._id, bob._id],
    createdBy: alice._id,
  });

  const welcome = await Message.create({
    channel: general._id,
    author: alice._id,
    body: "Welcome to Echo",
    kind: "user",
    idempotencyKey: "e2e-welcome",
    externalKey: "e2e-welcome",
    mentionsEveryone: false,
    mentionedUserIds: [],
    threadRootAuthor: null,
  });

  const formatted = await Message.create({
    channel: general._id,
    author: alice._id,
    body: [
      "API formatting test",
      "",
      "# Heading 1",
      "",
      "**Bold text**",
      "_Italic text_",
      "~~Strikethrough text~~",
      "`inline code`",
      "",
      "```js",
      'const message = "formatted via API";',
      "```",
      "",
      "> Quote line",
      "",
      "- Bullet item",
      "1. Numbered item",
      "",
      "[Echo link](https://example.com)",
    ].join("\n"),
    kind: "user",
    idempotencyKey: "e2e-formatted",
    externalKey: "e2e-formatted",
    mentionsEveryone: false,
    mentionedUserIds: [],
    threadRootAuthor: null,
    reactions: [{ emoji: "👍", users: [bob._id] }],
  });

  const mention = await Message.create({
    channel: general._id,
    author: bob._id,
    body: "Heads up @alice, can you check the deployment notes?",
    kind: "user",
    idempotencyKey: "e2e-mention",
    externalKey: "e2e-mention",
    mentionedUserIds: [alice._id],
    mentionsEveryone: false,
    threadRootAuthor: null,
  });
  const searchHit = await Message.create({
    channel: general._id,
    author: alice._id,
    body: "Welcome search result with a https://example.com link",
    kind: "user",
    idempotencyKey: "e2e-search-hit",
    externalKey: "e2e-search-hit",
    mentionedUserIds: [],
    mentionsEveryone: false,
    threadRootAuthor: null,
  });

  await Read.create({
    user: alice._id,
    channel: general._id,
    thread: null,
    lastReadAt: new Date("2026-06-01T09:00:00.000Z"),
  });

  const threadRoot = await Message.create({
    channel: projectAlpha._id,
    author: alice._id,
    body: "Thread root in project alpha",
    kind: "user",
    idempotencyKey: "e2e-thread-root",
    externalKey: "e2e-thread-root",
    mentionsEveryone: false,
    mentionedUserIds: [],
    threadRootAuthor: null,
  });
  const threadReply = await Message.create({
    channel: projectAlpha._id,
    author: bob._id,
    body: "Thread reply for Alice",
    kind: "user",
    idempotencyKey: "e2e-thread-reply",
    externalKey: "e2e-thread-reply",
    parentId: threadRoot._id,
    threadRootAuthor: alice._id,
    mentionsEveryone: false,
    mentionedUserIds: [],
  });

  const dmMessage = await Message.create({
    channel: dmAliceBob._id,
    author: bob._id,
    body: "Bob's DM hello",
    kind: "user",
    idempotencyKey: "e2e-dm-hello",
    externalKey: "e2e-dm-hello",
    mentionsEveryone: false,
    mentionedUserIds: [],
    threadRootAuthor: null,
  });

  await User.updateOne({ _id: alice._id }, { $set: { savedMessages: [formatted._id] } });

  await ActivityEvent.create({
    recipient: alice._id,
    actor: bob._id,
    type: "reaction",
    channel: general._id,
    message: formatted._id,
    emoji: "👍",
  });

  await CustomEmoji.create({
    name: "party-parrot",
    key: "party-parrot.png",
    contentType: "image/png",
    createdBy: system._id,
  }).catch(() => {});

  return {
    users: {
      alice: alice.toPublicJSON(),
      bob: bob.toPublicJSON(),
    },
    messages: {
      welcome: welcome.toPublicJSON(),
      formatted: formatted.toPublicJSON(),
      mention: mention.toPublicJSON(),
      searchHit: searchHit.toPublicJSON(),
      threadRoot: threadRoot.toPublicJSON(),
      threadReply: threadReply.toPublicJSON(),
      dmMessage: dmMessage.toPublicJSON(),
    },
    channels: {
      general: general.toPublicJSON(),
      projectAlpha: projectAlpha.toPublicJSON(),
      marketing: marketing.toPublicJSON(),
      dmAliceBob: dmAliceBob.toPublicJSON(),
    },
  };
}
