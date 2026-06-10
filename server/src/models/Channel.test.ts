import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { Channel } from "./Channel.js";

describe("Channel.toPublicJSON", () => {
  it("serializes channel metadata and member ids", () => {
    const createdBy = new mongoose.Types.ObjectId();
    const members = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const channel = new Channel({
      name: "general",
      type: "private",
      topic: "Announcements",
      description: "Team-wide updates",
      members,
      createdBy,
      isArchived: true,
    });

    const json = channel.toPublicJSON();

    assert.equal(json.id, channel._id.toString());
    assert.equal(json.name, "general");
    assert.equal(json.type, "private");
    assert.equal(json.topic, "Announcements");
    assert.equal(json.description, "Team-wide updates");
    assert.equal(json.memberCount, 2);
    assert.deepEqual(json.members, members.map((id) => id.toString()));
    assert.equal(json.createdBy, createdBy.toString());
    assert.equal(json.isArchived, true);
  });

  it("normalizes empty topic and description", () => {
    const channel = new Channel({
      name: "random",
      members: [],
      createdBy: new mongoose.Types.ObjectId(),
    });

    const json = channel.toPublicJSON();

    assert.equal(json.topic, "");
    assert.equal(json.description, "");
    assert.equal(json.memberCount, 0);
  });
});
