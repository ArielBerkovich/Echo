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

  it("keeps long group DM names within the channel limit", () => {
    const ids = ["a".repeat(24), "b".repeat(24), "c".repeat(24), "d".repeat(24)];
    assert.equal(dmName(ids), dmName([...ids].reverse()));
    assert.equal(dmName(ids).length, 63);
  });

  it("deduplicates members before creating a group DM", async () => {
    const currentUserId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const expectedChannel = { id: "deduplicated-group" };
    const originalFind = Channel.find;
    const originalCreate = Channel.create;
    let createCall;
    Channel.find = async () => [];
    Channel.create = async (...args) => {
      createCall = args;
      return expectedChannel;
    };

    try {
      await ensureGroupDmChannel(currentUserId, [otherUserId, otherUserId]);
      assert.deepEqual(createCall[0].members, [String(currentUserId), String(otherUserId)]);
    } finally {
      Channel.find = originalFind;
      Channel.create = originalCreate;
    }
  });

  it("reuses only an exact member-set match, including renamed conversations", async () => {
    const currentUserId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const thirdUserId = new mongoose.Types.ObjectId();
    const smaller = { _id: new mongoose.Types.ObjectId(), members: [currentUserId, otherUserId] };
    const exact = { _id: new mongoose.Types.ObjectId(), members: [thirdUserId, currentUserId, otherUserId] };
    const originalFind = Channel.find;
    const originalUpdate = Channel.findOneAndUpdate;
    let updateCall;
    Channel.find = async () => [smaller, exact];
    Channel.findOneAndUpdate = async (...args) => {
      updateCall = args;
      return exact;
    };

    try {
      assert.equal(await ensureGroupDmChannel(currentUserId, [otherUserId, thirdUserId]), exact);
      assert.deepEqual(updateCall, [
        { _id: exact._id },
        { $pull: { hiddenFor: currentUserId } },
        { new: true },
      ]);
    } finally {
      Channel.find = originalFind;
      Channel.findOneAndUpdate = originalUpdate;
    }
  });

  it("creates a deterministic group DM for the selected members", async () => {
    const currentUserId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();
    const thirdUserId = new mongoose.Types.ObjectId();
    const expectedChannel = { id: "group-channel" };
    const originalFind = Channel.find;
    const originalCreate = Channel.create;
    let findCall;
    let createCall;
    Channel.find = async (...args) => {
      findCall = args;
      return [];
    };
    Channel.create = async (...args) => {
      createCall = args;
      return expectedChannel;
    };

    try {
      assert.equal(await ensureGroupDmChannel(currentUserId, [thirdUserId, otherUserId]), expectedChannel);
      assert.deepEqual(findCall[0], {
        type: "dm",
        members: { $all: [String(currentUserId), String(thirdUserId), String(otherUserId)] },
      });
      assert.deepEqual(createCall[0], {
        name: dmName([currentUserId, otherUserId, thirdUserId]),
        type: "dm",
        members: [String(currentUserId), String(thirdUserId), String(otherUserId)],
        createdBy: currentUserId,
      });
    } finally {
      Channel.find = originalFind;
      Channel.create = originalCreate;
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
