import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  emitAll,
  emitToChannel,
  emitToUser,
  getIO,
  joinUserToChannel,
  removeUserFromChannel,
  syncUserSockets,
  setIO,
} from "./realtime.js";

function createIO() {
  const calls = [];
  return {
    calls,
    to(room) {
      calls.push(["to", room]);
      return {
        emit(event, payload) {
          calls.push(["to.emit", room, event, payload]);
        },
      };
    },
    in(room) {
      calls.push(["in", room]);
      return {
        socketsJoin(target) {
          calls.push(["socketsJoin", room, target]);
        },
        socketsLeave(target) {
          calls.push(["socketsLeave", room, target]);
        },
        async fetchSockets() {
          calls.push(["fetchSockets", room]);
          return [];
        },
      };
    },
    emit(event, payload) {
      calls.push(["emit", event, payload]);
    },
  };
}

describe("realtime helpers", () => {
  afterEach(() => {
    setIO(null);
  });

  it("stores and returns the active io instance", () => {
    const io = createIO();
    setIO(io);

    assert.equal(getIO(), io);
  });

  it("emits to channel and user rooms", () => {
    const io = createIO();
    setIO(io);

    emitToChannel("c1", "message:new", { id: "m1" });
    emitToUser("u1", "activity:bump", { unread: 1 });

    assert.deepEqual(io.calls, [
      ["to", "channel:c1"],
      ["to.emit", "channel:c1", "message:new", { id: "m1" }],
      ["to", "user:u1"],
      ["to.emit", "user:u1", "activity:bump", { unread: 1 }],
    ]);
  });

  it("joins and removes user sockets from channel rooms", () => {
    const io = createIO();
    setIO(io);

    joinUserToChannel("u1", "c1");
    removeUserFromChannel("u1", "c1");

    assert.deepEqual(io.calls, [
      ["in", "user:u1"],
      ["socketsJoin", "user:u1", "channel:c1"],
      ["in", "user:u1"],
      ["socketsLeave", "user:u1", "channel:c1"],
    ]);
  });

  it("syncs cached user data across connected sockets", async () => {
    const socket = { user: { displayName: "Old Name", avatarKey: null, isAdmin: false, mustResetPassword: false, onboarded: false } };
    const calls = [];
    const io = {
      calls,
      in(room) {
        calls.push(["in", room]);
        return {
          async fetchSockets() {
            calls.push(["fetchSockets", room]);
            return [socket];
          },
        };
      },
    };
    setIO(io);

    await syncUserSockets({
      _id: { toString: () => "u1" },
      displayName: "New Name",
      avatarKey: "avatar.png",
      isAdmin: true,
      mustResetPassword: true,
      onboarded: true,
      activitySeenAt: new Date("2026-06-01T00:00:00Z"),
    });

    assert.deepEqual(calls, [
      ["in", "user:u1"],
      ["fetchSockets", "user:u1"],
    ]);
    assert.equal(socket.user.displayName, "New Name");
    assert.equal(socket.user.avatarKey, "avatar.png");
    assert.equal(socket.user.isAdmin, true);
    assert.equal(socket.user.mustResetPassword, true);
    assert.equal(socket.user.onboarded, true);
  });

  it("broadcasts to all sockets", () => {
    const io = createIO();
    setIO(io);

    emitAll("emoji:new", { name: "party" });

    assert.deepEqual(io.calls, [["emit", "emoji:new", { name: "party" }]]);
  });

  it("is a no-op when io is not configured", () => {
    assert.doesNotThrow(() => {
      emitToChannel("c1", "event", {});
      emitToUser("u1", "event", {});
      joinUserToChannel("u1", "c1");
      removeUserFromChannel("u1", "c1");
      emitAll("event", {});
    });
  });
});
