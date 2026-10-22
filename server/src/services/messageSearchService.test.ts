import assert from "node:assert/strict";
import { test } from "node:test";
import { Message } from "../models/Message.js";
import { searchMessages } from "./messageSearchService.js";

test("message search applies visibility in a channel lookup without an unbounded ID list", async () => {
  const originalAggregate = Message.aggregate;
  let pipeline;
  Message.aggregate = (value) => { pipeline = value; return Promise.resolve([]); };
  try {
    await searchMessages({ userId: "viewer", terms: ["deploy"], skip: 20, limit: 21 });
    const channelLookup = pipeline.find((stage) => stage.$lookup?.from === "channels").$lookup;
    assert.equal(channelLookup.pipeline[1].$match.$or[0].type, "public");
    assert.deepEqual(channelLookup.pipeline[1].$match.$or[1].members, "viewer");
    assert.equal(pipeline.find((stage) => stage.$skip)?.$skip, 20);
    assert.equal(pipeline.find((stage) => stage.$limit)?.$limit, 21);
    assert.equal(pipeline[0].$match.channel, undefined);
  } finally {
    Message.aggregate = originalAggregate;
  }
});
