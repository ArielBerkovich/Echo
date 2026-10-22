import assert from "node:assert/strict";
import { test } from "node:test";
import { User } from "../models/User.js";
import { listDirectoryUsers } from "./userDirectoryService.js";

test("directory search applies bounded pagination and an escaped term filter", async () => {
  const originalFind = User.find;
  let filter;
  let skip;
  let limit;
  User.find = (value) => {
    filter = value;
    return {
      sort() { return this; },
      skip(value) { skip = value; return this; },
      limit(value) { limit = value; return Promise.resolve([]); },
    };
  };
  try {
    await listDirectoryUsers({ skip: 25, limit: 51, query: "ann.+" });
    assert.equal(skip, 25);
    assert.equal(limit, 51);
    assert.equal(filter.username.$ne, "system");
    assert.equal(filter.$or[0].username.source, "ann\\.\\+");
  } finally {
    User.find = originalFind;
  }
});
