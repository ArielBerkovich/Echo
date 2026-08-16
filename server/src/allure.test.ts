import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

process.env.JWT_SECRET ||= "test-secret";

import {
  allureApiBase,
  allureFetch,
  decryptAllureSecret,
  encryptAllureSecret,
  listAllureProjects,
  createAllureReportToken,
  allureReportStatus,
  summarizeAllureReport,
  verifyAllureReportToken,
} from "./allure.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Allure integration adapter", () => {
  it("normalizes browser URLs for the Docker-hosted Allure service", () => {
    assert.equal(allureApiBase("http://localhost:5050"), "http://172.17.0.1:5050/allure-docker-service");
    assert.equal(allureApiBase("http://127.0.0.1:5050/allure-docker-service/"), "http://172.17.0.1:5050/allure-docker-service");
    assert.equal(allureApiBase("https://allure.example.test/"), "https://allure.example.test/allure-docker-service");
    assert.throws(() => allureApiBase("allure.example.test"), /http or https/);
  });

  it("round-trips encrypted credentials without storing the plaintext", () => {
    const ciphertext = encryptAllureSecret("correct horse battery staple");

    assert.ok(ciphertext);
    assert.notEqual(ciphertext, "correct horse battery staple");
    assert.equal(decryptAllureSecret(ciphertext), "correct horse battery staple");
    assert.equal(decryptAllureSecret("not-a-ciphertext"), null);
  });

  it("calls an unsecured service directly without attempting login", async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ data: { projects: { "echo-ui": {}, default: {} } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const projects = await listAllureProjects({ allure: { url: "http://localhost:5050" } });

    assert.deepEqual(projects, ["echo-ui"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://172.17.0.1:5050/allure-docker-service/projects");
    assert.equal(calls[0].options.headers.get("cookie"), null);
  });

  it("logs in to a secured service and forwards the session cookie", async () => {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/login")) {
        return {
          ok: true,
          headers: { getSetCookie: () => ["session=secret; Path=/; HttpOnly"] },
        };
      }
      return new Response(JSON.stringify({ data: { projects: { "echo-api": {} } } }), { status: 200 });
    };

    const passwordCiphertext = encryptAllureSecret("admin-password");
    const response = await allureFetch(
      { allure: { url: "http://allure.example.test", username: "admin", passwordCiphertext } },
      "/projects"
    );

    assert.equal(response.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "http://allure.example.test/allure-docker-service/login");
    assert.equal(calls[0].options.body, JSON.stringify({ username: "admin", password: "admin-password" }));
    assert.equal(calls[1].options.headers.get("cookie"), "session=secret");
  });

  it("creates short-lived report tokens scoped to one project", () => {
    const token = createAllureReportToken("echo-ui");

    assert.equal(verifyAllureReportToken(token, "echo-ui"), true);
    assert.equal(verifyAllureReportToken(token, "echo-api"), false);
    assert.equal(verifyAllureReportToken("invalid", "echo-ui"), false);
  });

  it("summarizes Allure widget results", () => {
    assert.equal(
      summarizeAllureReport({
        statistic: { total: 12, passed: 9, failed: 2, skipped: 1 },
        time: { duration: 12500, stop: 1760000000000 },
      }),
      "**12 tests**\n\n**Results**\n- Passed: **9** (75%)\n- Failed: **2** (17%)\n- Skipped: **1** (8%)\n- Completed: **⟦datetime:2025-10-09T08:53:20.000Z⟧**\n- Duration: **13s**"
    );
  });

  it("shows only nonzero result statuses", () => {
    const summary = summarizeAllureReport({
      statistic: { total: 100, passed: 90, skipped: 10, failed: 0, broken: 0, unknown: 0 },
    });

    assert.equal(summary, "**100 tests**\n\n**Results**\n- Passed: **90** (90%)\n- Skipped: **10** (10%)");
    assert.doesNotMatch(summary, /Failed|Broken|Unknown/);
    assert.doesNotMatch(summary, /\*\*0\*\*/);
  });

  it("classifies report status for notification indicators", () => {
    assert.deepEqual(allureReportStatus({ statistic: { passed: 3, failed: 0, broken: 0, unknown: 0 } }), { emoji: "✅", label: "Passed" });
    assert.deepEqual(allureReportStatus({ statistic: { passed: 0, failed: 0, broken: 0, skipped: 10, unknown: 0 } }), { emoji: "✅", label: "Passed" });
    assert.deepEqual(allureReportStatus({ statistic: { passed: 2, failed: 1, broken: 0, unknown: 0 } }), { emoji: "❌", label: "Failed" });
    assert.deepEqual(allureReportStatus({ statistic: { passed: 2, failed: 0, broken: 1, unknown: 0 } }), { emoji: "❌", label: "Failed" });
    assert.deepEqual(allureReportStatus({ statistic: { passed: 2, failed: 0, broken: 0, unknown: 1 } }), { emoji: "⚠️", label: "Warning" });
  });
});
