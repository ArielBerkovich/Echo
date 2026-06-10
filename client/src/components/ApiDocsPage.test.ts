import test from "node:test";
import assert from "node:assert/strict";
import { apiEndpointKey } from "../lib/apiDocs.js";

test("apiEndpointKey distinguishes endpoints that share a path", () => {
  assert.equal(apiEndpointKey({ method: "GET", path: "/api/channels" }), "GET /api/channels");
  assert.equal(apiEndpointKey({ method: "POST", path: "/api/channels" }), "POST /api/channels");
  assert.notEqual(
    apiEndpointKey({ method: "GET", path: "/api/channels" }),
    apiEndpointKey({ method: "POST", path: "/api/channels" }),
  );
});

test("apiEndpointKey prefers an explicit id", () => {
  assert.equal(apiEndpointKey({ id: "send-with-attachment", method: "POST", path: "/api/channels/:id/messages" }), "send-with-attachment");
});
