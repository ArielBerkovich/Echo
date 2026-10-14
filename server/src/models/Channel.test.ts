import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { canParticipateInChannel, canPostToChannel, Channel, isChannelMember, isChannelManager } from "./Channel.js";

describe("Channel posting permissions", () => {
  it("allows everyone in normal channels and only managers in read-only channels", () => {
    const creator = new mongoose.Types.ObjectId();
    const manager = new mongoose.Types.ObjectId();
    const member = new mongoose.Types.ObjectId();
    const channel = new Channel({
      name: "announcements",
      members: [creator, manager, member],
      createdBy: creator,
      managers: [manager],
      readOnly: true,
    });

    assert.equal(isChannelManager(channel, creator), true);
    assert.equal(isChannelManager(channel, manager), true);
    assert.equal(canPostToChannel(channel, creator), true);
    assert.equal(canPostToChannel(channel, manager), true);
    assert.equal(canPostToChannel(channel, member), false);

    channel.readOnly = false;
    assert.equal(canPostToChannel(channel, member), true);
  });
});

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
    assert.equal(json.readOnly, false);
    assert.equal(json.isArchived, true);
  });

  it("separates public visibility from participation", () => {
    const member = new mongoose.Types.ObjectId();
    const visitor = new mongoose.Types.ObjectId();
    const channel = { type: "public", members: [member] };

    assert.equal(isChannelMember(channel, member), true);
    assert.equal(isChannelMember(channel, visitor), false);
    assert.equal(canParticipateInChannel(channel, member), true);
    assert.equal(canParticipateInChannel(channel, visitor), false);
  });

  it("requires DM membership to participate", () => {
    const member = new mongoose.Types.ObjectId();
    const visitor = new mongoose.Types.ObjectId();
    const channel = { type: "dm", members: [member] };

    assert.equal(canParticipateInChannel(channel, member), true);
    assert.equal(canParticipateInChannel(channel, visitor), false);
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
