import { Channel } from "./models/Channel.js";
import { User } from "./models/User.js";

// Ensure a default #general channel exists and that every (non-system) user
// belongs to it. Runs on startup; registration also adds new users to #general.
export async function ensureDefaultChannel() {
  let general = await Channel.findOne({ name: "general" });

  if (!general) {
    let system = await User.findOne({ username: "system" });
    if (!system) {
      system = await User.create({
        username: "system",
        displayName: "Echo",
        // Placeholder hash; the system account cannot log in.
        passwordHash: "x",
      });
    }
    general = await Channel.create({
      name: "general",
      type: "public",
      members: [],
      createdBy: system._id,
    });
    console.log('Seeded default "#general" channel');
  }

  // #general always contains every (non-system) user.
  const userIds = (await User.find({ username: { $ne: "system" } }, { _id: 1 })).map(
    (u) => u._id
  );
  if (userIds.length) {
    await Channel.updateOne(
      { name: "general" },
      { $addToSet: { members: { $each: userIds } } }
    );
  }
}
