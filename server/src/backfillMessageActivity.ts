import mongoose from "mongoose";
import { extractMentionHandles, mentionsEveryone } from "./lib/messageActivity.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";

const mongoUrl = process.env.MONGO_URI || process.env.MONGO_URL || "mongodb://127.0.0.1:27017/echo";
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 1000);

async function main() {
  await mongoose.connect(mongoUrl);

  const users = await User.find({}, { username: 1 }).lean();
  const usersByHandle = new Map(users.map((u) => [u.username.toLowerCase(), u._id]));
  let scanned = 0;
  let updated = 0;
  let cursorId = null;

  for (;;) {
    const filter = {
      ...(cursorId ? { _id: { $gt: cursorId } } : {}),
      $or: [
        { mentionedUserIds: { $exists: false } },
        { mentionsEveryone: { $exists: false } },
        { threadRootAuthor: { $exists: false } },
      ],
    };
    const batch = await Message.find(filter, { _id: 1, body: 1, parentId: 1 })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();
    if (!batch.length) break;

    const parentIds = [...new Set(batch.filter((m) => m.parentId).map((m) => m.parentId.toString()))];
    const roots = parentIds.length
      ? await Message.find({ _id: { $in: parentIds } }, { author: 1 }).lean()
      : [];
    const rootAuthorById = new Map(roots.map((r) => [r._id.toString(), r.author]));

    const ops = batch.map((message) => {
      const mentionedUserIds = extractMentionHandles(message.body)
        .map((handle) => usersByHandle.get(handle))
        .filter(Boolean);
      return {
        updateOne: {
          filter: { _id: message._id },
          update: {
            $set: {
              mentionedUserIds,
              mentionsEveryone: mentionsEveryone(message.body),
              threadRootAuthor: message.parentId
                ? rootAuthorById.get(message.parentId.toString()) || null
                : null,
            },
          },
        },
      };
    });

    if (ops.length) {
      const result = await Message.bulkWrite(ops, { ordered: false });
      updated += result.modifiedCount || 0;
    }
    scanned += batch.length;
    cursorId = batch[batch.length - 1]._id;
    process.stdout.write(".");
  }

  console.log(`\nBackfilled message activity metadata: scanned=${scanned} updated=${updated}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
