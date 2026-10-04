import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import { Message } from "../models/Message.js";
import { Channel } from "../models/Channel.js";
import { canAccessAttachment } from "./attachmentService.js";

function channel(type, members = [], archived = false) {
  return {
    type,
    members: members.map((id) => new mongoose.Types.ObjectId(id)),
    isArchived: archived,
  };
}

describe("attachment access", () => {
  it("allows an attachment that is not yet attached to a message", async () => {
    const originalFind = Message.find;
    Message.find = () => ({ lean: async () => [] });
    try {
      assert.equal(await canAccessAttachment("orphan-key.txt", new mongoose.Types.ObjectId()), true);
    } finally {
      Message.find = originalFind;
    }
  });

  it("allows public attachments and members of active private conversations", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherId = new mongoose.Types.ObjectId();
    const originalMessageFind = Message.find;
    const originalChannelFind = Channel.find;
    Message.find = () => ({ lean: async () => [{ channel: "public-channel" }, { channel: "private-channel" }] });
    Channel.find = async () => [channel("public"), channel("private", [userId, otherId])];
    try {
      assert.equal(await canAccessAttachment("shared-key.txt", userId), true);
    } finally {
      Message.find = originalMessageFind;
      Channel.find = originalChannelFind;
    }
  });

  it("denies removed members and attachments whose conversations are archived", async () => {
    const userId = new mongoose.Types.ObjectId();
    const memberId = new mongoose.Types.ObjectId();
    const originalMessageFind = Message.find;
    const originalChannelFind = Channel.find;
    Message.find = () => ({ lean: async () => [{ channel: "private-channel" }] });
    Channel.find = async () => [channel("private", [memberId])];
    try {
      assert.equal(await canAccessAttachment("private-key.txt", userId), false);
      Channel.find = async () => [];
      assert.equal(await canAccessAttachment("archived-key.txt", userId), false);
    } finally {
      Message.find = originalMessageFind;
      Channel.find = originalChannelFind;
    }
  });
});
