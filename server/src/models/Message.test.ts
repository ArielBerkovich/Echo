import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { Message } from "./Message.js";

describe("Message.toPublicJSON", () => {
  it("serializes message metadata, attachments, forwarding, pins, and reactions", () => {
    const author = {
      _id: new mongoose.Types.ObjectId(),
      toPublicJSON: () => ({ id: "author-1", username: "alice" }),
    };
    const channel = new mongoose.Types.ObjectId();
    const parentId = new mongoose.Types.ObjectId();
    const pinnedBy = new mongoose.Types.ObjectId();
    const reactedBy = new mongoose.Types.ObjectId();
    const createdAt = new Date("2026-06-04T12:00:00Z");
    const editedAt = new Date("2026-06-04T12:05:00Z");
    const pinnedAt = new Date("2026-06-04T12:10:00Z");

    const message = new Message({
      channel,
      author: author._id,
      body: "hello",
      createdAt,
      editedAt,
      kind: "user",
      parentId,
      attachments: [
        {
          key: "file.png",
          name: "file.png",
          size: 123,
          contentType: "image/png",
          isImage: true,
          width: 640,
          height: 480,
        },
      ],
      forwardedFrom: {
        authorName: "Bob",
        channelName: "#general",
        channelId: "c1",
        messageId: "m1",
        channelType: "public",
      },
      pinnedAt,
      pinnedBy,
      externalKey: "github:run:123",
      automation: {
        source: "webhook",
        status: "failed",
        title: "Deploy failed",
        threadKey: "github:run:123",
        fields: [{ name: "branch", value: "main" }],
      },
      reactions: [{ emoji: "🚀", users: [reactedBy] }],
    });
    Object.defineProperty(message, "author", { value: author });

    const json = message.toPublicJSON();

    assert.equal(json.id, message._id.toString());
    assert.equal(json.channelId, channel.toString());
    assert.equal(json.parentId, parentId.toString());
    assert.deepEqual(json.author, { id: "author-1", username: "alice" });
    assert.deepEqual(json.attachments, [
      {
        key: "file.png",
        name: "file.png",
        size: 123,
        contentType: "image/png",
        isImage: true,
        width: 640,
        height: 480,
        url: "/api/files/file.png",
      },
    ]);
    assert.deepEqual(json.forwardedFrom, {
      authorName: "Bob",
      channelName: "#general",
      channelId: "c1",
      messageId: "m1",
      channelType: "public",
    });
    assert.equal(json.pinnedAt.getTime(), pinnedAt.getTime());
    assert.equal(json.pinnedBy, pinnedBy.toString());
    assert.deepEqual(json.reactions, [{ emoji: "🚀", users: [reactedBy.toString()] }]);
    assert.equal(json.editedAt.getTime(), editedAt.getTime());
    assert.equal(json.externalKey, "github:run:123");
    assert.deepEqual(json.automation, {
      source: "webhook",
      status: "failed",
      title: "Deploy failed",
      threadKey: "github:run:123",
      fields: [{ name: "branch", value: "main" }],
    });
  });

  it("serializes fallback author ids and nullable optional fields", () => {
    const author = new mongoose.Types.ObjectId();
    const message = new Message({
      channel: new mongoose.Types.ObjectId(),
      author,
      body: "",
      attachments: [{ key: "file.bin", name: "file.bin", size: 0, contentType: "application/octet-stream" }],
    });

    const json = message.toPublicJSON();

    assert.deepEqual(json.author, { id: author.toString() });
    assert.equal(json.kind, "user");
    assert.equal(json.parentId, null);
    assert.equal(json.editedAt, null);
    assert.equal(json.forwardedFrom, null);
    assert.equal(json.externalKey, null);
    assert.equal(json.automation, null);
    assert.equal(json.pinnedAt, null);
    assert.equal(json.pinnedBy, null);
    assert.equal(json.attachments[0].width, null);
    assert.equal(json.attachments[0].height, null);
  });
});

describe("Message indexes", () => {
  it("uses partial unique indexes for automation keys", () => {
    const indexes = Message.schema.indexes();
    const idemIndex = indexes.find(([fields]) => fields.idempotencyKey === 1);
    const externalIndex = indexes.find(([fields]) => fields.externalKey === 1);

    assert.deepEqual(idemIndex, [
      { channel: 1, author: 1, idempotencyKey: 1 },
      {
        unique: true,
        background: true,
        partialFilterExpression: {
          idempotencyKey: { $type: "string" },
        },
      },
    ]);
    assert.deepEqual(externalIndex, [
      { channel: 1, author: 1, externalKey: 1 },
      {
        unique: true,
        background: true,
        partialFilterExpression: {
          externalKey: { $type: "string" },
        },
      },
    ]);
  });
});
