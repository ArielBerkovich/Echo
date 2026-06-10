import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createWebhookToken,
  hashWebhookToken,
  normalizeChannelName,
  normalizeFields,
  renderAutomationBody,
} from "./automation.js";

describe("automation helpers", () => {
  it("normalizes CI-friendly channel names", () => {
    assert.equal(normalizeChannelName("#Deploys "), "deploys");
    assert.equal(normalizeChannelName(" Release_Notes "), "release_notes");
  });

  it("renders structured CI status messages as markdown", () => {
    const body = renderAutomationBody({
      status: "failed",
      title: "Deploy failed",
      body: "The production deploy stopped during tests.",
      fields: { branch: "main", sha: "abc123" },
    });

    assert.match(body, /\*\*\[FAILED\] FAILED Deploy failed\*\*/);
    assert.match(body, /The production deploy stopped during tests\./);
    assert.match(body, /- \*\*branch:\*\* main/);
    assert.match(body, /- \*\*sha:\*\* abc123/);
  });

  it("normalizes array and object fields", () => {
    assert.deepEqual(normalizeFields({ branch: "main" }), [{ name: "branch", value: "main" }]);
    assert.deepEqual(normalizeFields([{ label: "job", value: "test" }]), [{ name: "job", value: "test" }]);
  });

  it("creates opaque webhook tokens and hashes them deterministically", () => {
    const token = createWebhookToken();
    assert.ok(token.length >= 32);
    assert.equal(hashWebhookToken(token), hashWebhookToken(token));
    assert.notEqual(hashWebhookToken(token), token);
  });
});
