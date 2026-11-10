import { test } from "node:test";
import assert from "node:assert/strict";
import { rephraseMessage } from "./rephraseService.js";

const settings = { baseUrl: "http://provider.test/v1", model: "test", timeoutMs: 1000, maxContextTokens: 8192, maxOutputTokens: 500 };

test("returns one professional, clear and concise rephrase", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.response_format.type, "json_schema");
    assert.deepEqual(request.response_format.json_schema.schema.properties.options.items.required, ["key", "text"]);
    assert.match(request.messages[0].content, /PRESERVATION \(MANDATORY\)/);
    assert.match(request.messages[0].content, /Same language and script as the draft. Never translate/);
    assert.match(request.messages[0].content, /Never merge a list into prose/);
    const userRequest = JSON.parse(request.messages[1].content);
    assert.equal(userRequest.draft, "Please review this by Friday.");
    assert.deepEqual(userRequest.constraints, []);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ options: [
      { key: "professional", text: "Could you please review this by Friday?" },
      { key: "clear", text: "Please review this by Friday." },
      { key: "concise", text: "Review by Friday." },
    ] }) } }] });
  };
  try {
    const result = await rephraseMessage("Please review this by Friday.", settings);
    assert.equal(result.canRephrase, true);
    assert.deepEqual(result.options.map((option) => option.key), ["professional"]);
    assert.equal(result.options[0].text, "Could you please review this by Friday?");
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects blank drafts and incomplete provider output", async () => {
  await assert.rejects(rephraseMessage(" ", settings), /Write a message/);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ options: [{ key: "professional", text: "" }] }) } }] });
  try { await assert.rejects(rephraseMessage("Draft", settings), /incomplete options/); }
  finally { globalThis.fetch = originalFetch; }
});

test("returns an explicit no-rephrase result when the provider cannot understand the draft", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    canRephrase: false,
    reason: "Please provide a clearer message.",
    options: [],
  }) } }] });
  try {
    const result = await rephraseMessage("???", settings);
    assert.deepEqual(result, { canRephrase: false, reason: "Please provide a clearer message.", options: [] });
  } finally { globalThis.fetch = originalFetch; }
});

test("removes accidental blank lines inside generated code blocks", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ options: [
    { key: "professional", text: "```js\nconst a = 1;\n\nconst b = 2;\n```" },
    { key: "concise", text: "```js\nconst a = 1;\n\nconst b = 2;\n```" },
    { key: "warm", text: "```js\nconst a = 1;\n\nconst b = 2;\n```" },
  ] }) } }] });
  try {
    const result = await rephraseMessage("const a = 1;", settings);
    assert.equal(result.options[0].text, "```js\nconst a = 1;\nconst b = 2;\n```");
  } finally { globalThis.fetch = originalFetch; }
});

test("fences clearly code-like output when a provider omits Markdown fences", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ options: [
    { key: "professional", text: "var isPrime=true; for (var i=2; i<candidate; i++) { isPrime=false; }" },
    { key: "concise", text: "var isPrime=true;\nfor (var i=2; i<candidate; i++) {\n  isPrime=false;\n}" },
    { key: "warm", text: "Let's review this code together." },
  ] }) } }] });
  try {
    const result = await rephraseMessage("var isPrime=true;\n\nwhile (i<candidate) {\n}", settings);
    assert.match(result.options[0].text, /^```javascript\n/);
    assert.match(result.options[0].text, /\n```$/);
  } finally { globalThis.fetch = originalFetch; }
});

test("preserves hard formatting when a provider flattens or translates it", async () => {
  const originalFetch = globalThis.fetch;
  const draft = "Agenda:\n- Review open bugs\n- Confirm the release date";
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ options: [
    { key: "professional", text: "Review the bugs and confirm the date." },
    { key: "concise", text: "Review bugs; confirm date." },
    { key: "warm", text: "Let's review the bugs together." },
  ] }) } }] });
  try {
    const result = await rephraseMessage(draft, settings);
    assert.equal(result.options[0].text, draft);
  } finally { globalThis.fetch = originalFetch; }
});


test("falls back to JSON mode when a provider rejects JSON schemas", async () => {
  const originalFetch = globalThis.fetch;
  const formats = [];
  globalThis.fetch = async (_url, options) => {
    formats.push(JSON.parse(options.body).response_format.type);
    return formats.length === 1
      ? Response.json({ error: "unsupported" }, { status: 400 })
      : Response.json({ choices: [{ message: { content: JSON.stringify({ canRephrase: true, options: [{ key: "professional", text: "Please review this." }] }) } }] });
  };
  try {
    const result = await rephraseMessage("Please review this.", settings);
    assert.equal(result.options[0].text, "Please review this.");
    assert.deepEqual(formats, ["json_schema", "json_object"]);
  } finally { globalThis.fetch = originalFetch; }
});


test("rejects missing option text even when the draft contains a list", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ canRephrase: true, options: [{ key: "professional" }] }) } }] });
  try { await assert.rejects(rephraseMessage("- First\n- Second", settings), /incomplete options/); }
  finally { globalThis.fetch = originalFetch; }
});

test("accepts ordinary messages requesting information", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ canRephrase: true, options: [{ key: "professional", text: "Please send me the message." }] }) } }] });
  try { assert.equal((await rephraseMessage("send me the message", settings)).options[0].text, "Please send me the message."); }
  finally { globalThis.fetch = originalFetch; }
});
