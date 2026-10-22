import assert from "node:assert/strict";
import { test } from "node:test";
import { acknowledgeSocket, safeSocketHandler } from "./safeSocketHandler.js";

test("safe socket handlers reject malformed payloads and continue handling later events", async () => {
  const failures = [];
  const responses = [];
  let processed = 0;
  const handler = safeSocketHandler("message:edit", async (payload, ack) => {
    if (payload.fail) throw new Error("service failure");
    processed += 1;
    acknowledgeSocket(ack, { ok: true });
  }, {
    objectPayload: true,
    onFailure: (eventName, error) => failures.push([eventName, error.message]),
  });

  assert.doesNotThrow(() => handler(null, { not: "a callback" }));
  assert.deepEqual(failures[0], ["message:edit", "socket event payload must be an object"]);
  assert.equal(await handler({ fail: true }, (response) => responses.push(response)), undefined);
  assert.deepEqual(responses, [{ error: "could not process event" }]);
  await handler({ fail: false }, { not: "a callback" });
  assert.equal(processed, 0);
  assert.deepEqual(failures[2], ["message:edit", "socket acknowledgement must be a function"]);
  await handler({ fail: false }, (response) => responses.push(response));
  assert.equal(processed, 1);
  assert.deepEqual(responses[1], { ok: true });
});

test("socket acknowledgements that are not functions are ignored safely", () => {
  assert.equal(acknowledgeSocket({ value: true }, { ok: true }), false);
  assert.equal(acknowledgeSocket(undefined, { ok: true }), false);
  assert.equal(acknowledgeSocket(() => { throw new Error("closed socket"); }, { ok: true }), false);
});
