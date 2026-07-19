import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { ensureDmChannel, dmName } from "./dms.js";
import { Channel } from "../models/Channel.js";

describe("DM helpers", () => {
  it("builds the same channel name regardless of user order", () => {
    assert.equal(dmName("b", "a"), "dm-a-b");
    assert.equal(dmName("a", "b"), "dm-a-b");
  });

  it("creates or unhides the conversation used by the VIP list", async () => {
    const currentUserId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const expectedChannel = { id: "channel" };
    const original = Channel.findOneAndUpdate;
    let call;

    Channel.findOneAndUpdate = async (...args) => {
      call = args;
      return expectedChannel;
    };

    try {
      const channel = await ensureDmChannel(currentUserId, otherUserId);
      const name = dmName(currentUserId, otherUserId);

      assert.equal(channel, expectedChannel);
      assert.deepEqual(call, [
        { name },
        {
          $setOnInsert: {
            name,
            type: "dm",
            members: [currentUserId, otherUserId],
            createdBy: currentUserId,
          },
          $pull: { hiddenFor: currentUserId },
        },
        { new: true, upsert: true, setDefaultsOnInsert: false },
      ]);
    } finally {
      Channel.findOneAndUpdate = original;
    }
  });
});
