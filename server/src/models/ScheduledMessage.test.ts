import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { ScheduledMessage } from "./ScheduledMessage.js";

describe("ScheduledMessage.toPublicJSON", () => {
  it("serializes scheduled message fields and attachments", () => {
    const channel = new mongoose.Types.ObjectId();
    const parentId = new mongoose.Types.ObjectId();
    const scheduledFor = new Date("2026-06-10T09:00:00Z");
    const scheduled = new ScheduledMessage({
      channel,
      author: new mongoose.Types.ObjectId(),
      body: "later",
      parentId,
      scheduledFor,
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
    });

    assert.deepEqual(scheduled.toPublicJSON(), {
      id: scheduled._id.toString(),
      channelId: channel.toString(),
      body: "later",
      parentId: parentId.toString(),
      attachments: [
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
      ],
      scheduledFor,
      status: "pending",
    });
  });

  it("uses null parent and dimensions when omitted", () => {
    const scheduled = new ScheduledMessage({
      channel: new mongoose.Types.ObjectId(),
      author: new mongoose.Types.ObjectId(),
      scheduledFor: new Date("2026-06-10T09:00:00Z"),
      attachments: [{ key: "file.bin", name: "file.bin", size: 0, contentType: "application/octet-stream" }],
    });

    const json = scheduled.toPublicJSON();

    assert.equal(json.parentId, null);
    assert.equal(json.attachments[0].width, null);
    assert.equal(json.attachments[0].height, null);
  });

  it("exposes terminal delivery failures to the message author", () => {
    const scheduled = new ScheduledMessage({
      channel: new mongoose.Types.ObjectId(),
      author: new mongoose.Types.ObjectId(),
      scheduledFor: new Date("2026-06-10T09:00:00Z"),
      status: "failed",
      lastError: "private database detail",
    });
    const json = scheduled.toPublicJSON();
    assert.equal(json.status, "failed");
    assert.match(json.error, /could not send/i);
    assert.equal(JSON.stringify(json).includes("private database detail"), false);
  });
});
