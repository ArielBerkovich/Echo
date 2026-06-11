// One-off: create 100 channels (with almog100 as a member) and 100 DMs for
// almog100. Run inside the server container:  node src/seedBulk.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { connectDb } from "./db.js";
import { Channel } from "./models/Channel.js";
import { User } from "./models/User.js";

const pad = (n) => String(n).padStart(3, "0");
const dmName = (a, b) => `dm-${[String(a), String(b)].sort().join("-")}`;

async function main() {
  await connectDb();
  const almog = await User.findOne({ username: "almog100" });
  if (!almog) {
    console.error("User 'almog100' not found.");
    process.exit(1);
  }

  // --- 100 channels, almog100 as a member ---
  let channelsMade = 0;
  for (let i = 1; i <= 100; i++) {
    const name = `load-${pad(i)}`;
    const existing = await Channel.findOne({ name });
    if (existing) {
      if (!existing.members.some((m) => m.equals(almog._id))) {
        existing.members.push(almog._id);
        await existing.save();
      }
      continue;
    }
    await Channel.create({
      name,
      type: "public",
      members: [almog._id],
      createdBy: almog._id,
      topic: `Load-test channel ${i}`,
    });
    channelsMade++;
  }

  // --- 100 DMs: a counterpart user each, plus the dm channel ---
  const pwHash = await bcrypt.hash("Password123", 10);
  let dmsMade = 0;
  for (let i = 1; i <= 100; i++) {
    const username = `dmuser${pad(i)}`;
    let other = await User.findOne({ username });
    if (!other) {
      other = await User.create({
        username,
        displayName: `DM User ${pad(i)}`,
        passwordHash: pwHash,
      });
    }
    const name = dmName(almog._id, other._id);
    if (await Channel.findOne({ name })) continue;
    await Channel.create({
      name,
      type: "dm",
      members: [almog._id, other._id],
      createdBy: almog._id,
    });
    dmsMade++;
  }

  console.log(`Done. Created ${channelsMade} channels and ${dmsMade} DMs for almog100.`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
