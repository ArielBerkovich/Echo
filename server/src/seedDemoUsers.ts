// Seed a small, repeatable workspace dataset for local development.
// Run inside the server container with: node dist/seedDemoUsers.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDb } from "./db.js";
import { Channel } from "./models/Channel.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";

const DEMO_COUNT = 30;
const DEMO_PASSWORD = "DemoPass123!";

const publicChannels = [
  ["town-square", "Workspace updates and everyday conversation."],
  ["product", "Product planning, feedback, and releases."],
  ["design", "Design critiques, research, and visual polish."],
  ["random", "A low-pressure place for anything interesting."],
  ["launch", "Launch planning, checklists, and celebrations."],
];

const privateChannels = [
  ["leadership", "Planning and decisions for the leadership group."],
  ["design-core", "Private design team working space."],
  ["ops-private", "Operations coordination and incident follow-up."],
];

const conversations = {
  "town-square": [
    "Good morning everyone — what is on your plate today?",
    "I shared a short update from yesterday's customer calls.",
    "The new onboarding flow is getting noticeably better feedback.",
    "I can take the first pass on the follow-up notes.",
    "Reminder: the team demo is tomorrow at 10:00.",
    "Nice work this week. The latest build feels much smoother.",
  ],
  product: [
    "The top request this week is a faster way to find older conversations.",
    "I mocked up two options for the search results layout.",
    "Could we keep the first version focused on speed and clarity?",
    "Yes — I will turn the simpler option into a small prototype.",
    "I added the open questions to the planning doc.",
    "Let us review those together before the next planning session.",
  ],
  design: [
    "Posting the latest mobile navigation exploration here.",
    "The second direction makes the hierarchy much easier to scan.",
    "Agreed. I would increase the contrast on the selected state slightly.",
    "I tested that against the darker theme and it holds up well.",
    "Can someone review the empty states before Friday?",
    "I will take the empty-state pass and share screenshots.",
  ],
  random: [
    "What is everyone listening to while working today?",
    "I found a great ambient playlist for long focus sessions.",
    "Sharing a photo from my weekend hike — the weather was perfect.",
    "That view is incredible. Adding it to my weekend ideas list.",
    "We should do a team recipe exchange sometime.",
    "Absolutely. I vote for an asynchronous version first.",
  ],
  launch: [
    "Launch checklist is at 80 percent complete.",
    "The docs are updated and the final screenshots are ready.",
    "I am watching the error dashboard during the rollout window.",
    "The release candidate passed the main regression suite.",
    "Let us keep the first announcement short and useful.",
    "Everything looks good from my side. Ready when you are.",
  ],
  leadership: [
    "The quarterly priorities are ready for a final review.",
    "I would keep the reliability project in the top two.",
    "That aligns with the support trends we have been seeing.",
    "I will prepare the decision summary for tomorrow.",
    "Please add risks and dependencies before the meeting.",
    "Done — the summary now includes owners for each follow-up.",
  ],
  "design-core": [
    "The private critique notes are ready for comments.",
    "I marked the two interaction details that still feel uncertain.",
    "The keyboard behavior should match the desktop pattern here.",
    "I agree. I will update the prototype and add a short rationale.",
    "The revised version is much easier to understand without narration.",
    "Great. Let us use that direction for the next usability test.",
  ],
  "ops-private": [
    "The overnight checks are green and there were no alerts.",
    "I rotated the test credentials and updated the runbook.",
    "The backup restore drill is scheduled for Thursday.",
    "I will coordinate the drill and post the timing here.",
    "The incident template now includes a customer-impact section.",
    "That should make handoffs much clearer during an escalation.",
  ],
};

function demoUsername(index) {
  return `demo${String(index).padStart(2, "0")}`;
}

function demoName(index) {
  const first = ["Avery", "Maya", "Noah", "Lena", "Eli", "Sofia", "Theo", "Nora", "Milo", "Zoe"];
  const last = ["Cohen", "Levy", "Shaw", "Miller", "Foster", "Bennett", "Davis", "Reed", "Stone", "Hart"];
  return `${first[(index - 1) % first.length]} ${last[Math.floor((index - 1) / first.length) % last.length]}`;
}

async function getOrCreateUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [];
  for (let index = 1; index <= DEMO_COUNT; index += 1) {
    const username = demoUsername(index);
    const user = await User.findOneAndUpdate(
      { username },
      {
        $set: { displayName: demoName(index) },
        $setOnInsert: { passwordHash, onboarded: true },
      },
      { new: true, upsert: true }
    );
    users.push(user);
  }
  return users;
}

async function getOrCreateChannel(name, type, description, members, creatorId) {
  return Channel.findOneAndUpdate(
    { name },
    {
      $set: {
        type,
        topic: description,
        description,
        createdBy: creatorId,
        isArchived: false,
      },
      $addToSet: { members: { $each: members } },
    },
    { new: true, upsert: true }
  );
}

async function seedMessages(channel, authors, texts) {
  for (let index = 0; index < texts.length; index += 1) {
    const author = authors[index % authors.length];
    const externalKey = `demo-seed-v1:${channel.name}:${index}`;
    const existing = await Message.findOne({ channel: channel._id, externalKey });
    if (existing) continue;
    await Message.create({
      channel: channel._id,
      author: author._id,
      body: texts[index],
      externalKey,
      createdAt: new Date(Date.now() - (texts.length - index) * 2 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - (texts.length - index) * 2 * 60 * 60 * 1000),
    });
  }
}

async function main() {
  await connectDb();
  const existingUsers = await User.find({ username: { $ne: "system" } }).sort({ createdAt: 1 });
  if (!existingUsers.length) throw new Error("Create at least one regular user before seeding demo data.");

  const demoUsers = await getOrCreateUsers();
  const primaryUser = existingUsers[0];
  const publicMembers = [...existingUsers, ...demoUsers].map((user) => user._id);
  const privateGroups = [
    [primaryUser, ...demoUsers.slice(0, 8)],
    [primaryUser, ...demoUsers.slice(8, 18)],
    [...demoUsers.slice(18, 30)],
  ];

  let channelCount = 0;
  let messageCount = 0;
  const allDefinitions = [
    ...publicChannels.map(([name, description]) => [name, "public", description, publicMembers]),
    ...privateChannels.map(([name, description], index) => [name, "private", description, privateGroups[index]]),
  ];

  for (let index = 0; index < allDefinitions.length; index += 1) {
    const [name, type, description, members] = allDefinitions[index];
    const creator = type === "private" && name === "ops-private" ? demoUsers[18] : primaryUser;
    const channel = await getOrCreateChannel(name, type, description, members, creator._id);
    channelCount += 1;
    const authors = type === "public"
      ? demoUsers.slice(index % 10, (index % 10) + 8)
      : members.filter((member) => demoUsers.some((demo) => demo._id.equals(member)));
    const before = await Message.countDocuments({ channel: channel._id, externalKey: /^demo-seed-v1:/ });
    await seedMessages(channel, authors.length ? authors : [primaryUser], conversations[name]);
    const after = await Message.countDocuments({ channel: channel._id, externalKey: /^demo-seed-v1:/ });
    messageCount += Math.max(0, after - before);
  }

  console.log(`Demo seed complete: ${demoUsers.length} users, ${channelCount} channels, ${messageCount} new messages.`);
  console.log(`Demo password for all demo users: ${DEMO_PASSWORD}`);
  await mongoose.connection.close();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
