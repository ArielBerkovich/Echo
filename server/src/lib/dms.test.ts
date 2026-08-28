import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { ensureDmChannel, ensureGroupDmChannel, dmName } from "./dms.js";
import { Channel } from "../models/Channel.js";

describe("DM helpers", () => {
  it("builds the same channel name regardless of user order", () => {
    assert.equal(dmName("b", "a"), "dm-a-b");
    assert.equal(dmName("a", "b"), "dm-a-b");
    assert.equal(dmName(["c", "a", "b"]), "dm-a-b-c");
  });

  it("creates a deterministic group DM for the selected members", async () => {
    const currentUserId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const thirdUserId = new mongoose.Types.ObjectId();
    const expectedChannel = { id: "group-channel" };
    const original = Channel.findOneAndUpdate;
    let call;
    Channel.findOneAndUpdate = async (...args) => {
      call = args;
      return expectedChannel;
    };

    try {
      assert.equal(await ensureGroupDmChannel(currentUserId, [thirdUserId, otherUserId]), expectedChannel);
      assert.equal(call[0].type, "dm");
      assert.deepEqual(call[0].members, { $all: [String(currentUserId), String(thirdUserId), String(otherUserId)] });
      assert.deepEqual(call[0].$expr, { $eq: [{ $size: "$members" }, 3] });
      assert.equal(call[1].$setOnInsert.name, dmName([currentUserId, otherUserId, thirdUserId]));
      assert.deepEqual(call[1].$setOnInsert.members, [String(currentUserId), String(thirdUserId), String(otherUserId)]);
    } finally {
      Channel.findOneAndUpdate = original;
    }
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
