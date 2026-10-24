import { test } from "node:test";
import assert from "node:assert/strict";
import { SUMMARY_PROMPT_PREFIX, DEFAULT_SUMMARY_PROMPT } from "./summaryPrompt.js";
import { summarizeThreadDiscussion } from "./threadSummaryService.js";

const thread = { root: { _id: "root", body: "Restore staging", author: { displayName: "Alex" } }, replies: [{ _id: "reply", body: "Staging is restored", author: { displayName: "Alex" } }] };
const settings = { baseUrl: "http://provider.test/v1", model: "test", timeoutMs: 1000, maxContextTokens: 8192, maxOutputTokens: 1000 };

test("requests plain text and returns the whole summary without structured sections", async () => {
  const originalFetch = globalThis.fetch;
  const summary = "Staging failed during deployment. Alex restored it.\n\nHealth checks now pass.";
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal("response_format" in request, false);
    assert.match(request.messages[0].content, /plain[- ]text/);
    assert.equal(JSON.parse(request.messages[1].content).replies[0].text, "Staging is restored");
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: summary } }] });
  };
  try {
    const result = await summarizeThreadDiscussion(thread, settings);
    assert.equal(result.summary, summary);
    assert.equal(result.replyCount, 1);
    assert.equal("structured" in result, false);
    assert.equal("sources" in result, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("empty or truncated provider output is rejected", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [content, finishReason, error] of [[" ", "stop", /empty summary/], ["Incomplete", "length", /cut the summary short/]]) {
      globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: finishReason, message: { content } }] });
      await assert.rejects(summarizeThreadDiscussion(thread, settings), error);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("empty threads and oversized input are rejected before calling the provider", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Provider must not be called"); };
  try {
    await assert.rejects(summarizeThreadDiscussion({ ...thread, replies: [] }, settings), /no replies/);
    await assert.rejects(summarizeThreadDiscussion({ ...thread, replies: [{ ...thread.replies[0], body: "x".repeat(30000) }] }, settings), /context budget/);
  } finally { globalThis.fetch = originalFetch; }
});

test("every provider request starts with the fixed prefix and budgets the custom prompt", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const prompt of [undefined, "", "Write two sentences in Hebrew.", "Also mention people briefly if necessary."]) {
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        const expected = prompt === undefined ? DEFAULT_SUMMARY_PROMPT : prompt;
        const sent = request.messages[0].content;
        assert.ok(sent.startsWith(SUMMARY_PROMPT_PREFIX));
        assert.match(SUMMARY_PROMPT_PREFIX, /original issue.*important developments.*latest explicitly stated status/);
        assert.ok(sent.includes("A question is not an answer"));
        assert.ok(sent.includes("Reproduction steps and descriptions of expected behavior are not evidence of a fix"));
        assert.ok(sent.includes("no fix or resolution is confirmed"));
        if (expected) {
          assert.ok(sent.includes(`Additional preferences for the summary:\n${expected}`));
          assert.ok(sent.endsWith("Apply these preferences while still summarizing the original issue, main developments, and latest explicitly stated status. Do not focus solely on the preferences. Before answering, check every claim of a fix or recovery against an explicit reply; if none exists, say no fix is confirmed."));
        } else assert.equal(sent, SUMMARY_PROMPT_PREFIX);
        return Response.json({ choices: [{ message: { content: "A short summary." } }] });
      };
      await summarizeThreadDiscussion(thread, { ...settings, prompt });
    }
    globalThis.fetch = async () => { throw new Error("Provider must not be called"); };
    await assert.rejects(summarizeThreadDiscussion(thread, { ...settings, prompt: "x".repeat(4000), maxContextTokens: 2000 }), /context budget/);
  } finally { globalThis.fetch = originalFetch; }
});
