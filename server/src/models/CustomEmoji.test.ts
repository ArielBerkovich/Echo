import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import { CustomEmoji } from "./CustomEmoji.js";

describe("CustomEmoji.toPublicJSON", () => {
  it("serializes public emoji fields", () => {
    const createdBy = new mongoose.Types.ObjectId();
    const emoji = new CustomEmoji({
      name: "party",
      key: "party.gif",
      contentType: "image/gif",
      createdBy,
    });

    assert.deepEqual(emoji.toPublicJSON(), {
      id: emoji._id.toString(),
      name: "party",
      url: "/api/files/party.gif",
      createdBy: createdBy.toString(),
    });
  });

  it("handles missing createdBy", () => {
    const emoji = new CustomEmoji({
      name: "party",
      key: "party.gif",
      contentType: "image/gif",
    });

    assert.equal(emoji.toPublicJSON().createdBy, null);
  });
});
