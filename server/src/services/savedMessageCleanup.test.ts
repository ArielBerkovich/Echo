import assert from "node:assert/strict";
import { test } from "node:test";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { removeSavedMessagesForChannel } from "./savedMessageCleanup.js";

test("saved-message cleanup sends bounded ID batches to Mongo", async () => {
  const originalFind = Message.find;
  const originalUpdateOne = User.updateOne;
  const ids = Array.from({ length: 1001 }, (_, index) => ({ _id: `message-${index}` }));
  const updates = [];
  Message.find = () => ({
    select: () => ({
      lean: () => ({ cursor: () => (async function* () { yield* ids; })() }),
    }),
  });
  User.updateOne = async (...args) => { updates.push(args); };
  try {
    await removeSavedMessagesForChannel("user", "channel");
    assert.deepEqual(updates.map(([filter, update]) => [filter, update.$pull.savedMessages.$in.length]), [
      [{ _id: "user" }, 500],
      [{ _id: "user" }, 500],
      [{ _id: "user" }, 1],
    ]);
  } finally {
    Message.find = originalFind;
    User.updateOne = originalUpdateOne;
  }
});
