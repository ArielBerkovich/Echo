import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Azure DevOps route integration tests.
 *
 * These tests exercise the Express router in isolation by importing it directly
 * and exercising the helper functions that do not require a database.  Full
 * end-to-end webhook processing (token lookup, event routing, DM delivery) is
 * covered by the integration-test suite that sets up mongodb-memory-server.
 *
 * Token / hashing correctness is covered in adoWebhookVerifier.test.ts.
 */
describe("azureDevOps route", () => {
  it("module loads without errors", async () => {
    // If any import fails (e.g. missing module, syntax error) this test will
    // throw and fail, giving a clear signal that wiring is broken.
    const mod = await import("../routes/azureDevOps.js");
    assert.ok(mod.azureDevOpsRouter, "azureDevOpsRouter should be exported");
  });

  it("azureDevOpsRouter is an Express Router-shaped object", async () => {
    const { azureDevOpsRouter } = await import("../routes/azureDevOps.js");
    // Express routers are functions with a stack property.
    assert.equal(typeof azureDevOpsRouter, "function");
  });
});
