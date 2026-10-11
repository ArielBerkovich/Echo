import { test } from "node:test";
import assert from "node:assert/strict";
import { aiDefaults, aiSettingsUpdate, publicAISettings } from "./aiSettings.js";
import { decryptAllureSecret } from "../allure.js";

test("AI defaults to disabled and public settings never expose credentials", () => {
  assert.equal(publicAISettings(null).enabled, false);
  const result = publicAISettings({ ...aiDefaults, apiKeyCiphertext: "secret", apiKey: "plain" });
  assert.equal(result.hasApiKey, true);
  assert.equal("apiKey" in result, false);
  assert.equal("apiKeyCiphertext" in result, false);
});
test("AI key updates encrypt, preserve omitted keys, and allow removal", () => {
  const update = aiSettingsUpdate({ ...aiDefaults, apiKey: "provider-key" });
  assert.notEqual(update.apiKeyCiphertext, "provider-key");
  assert.equal(decryptAllureSecret(update.apiKeyCiphertext), "provider-key");
  assert.equal("apiKeyCiphertext" in aiSettingsUpdate(aiDefaults), false);
  assert.equal(aiSettingsUpdate({ ...aiDefaults, apiKey: "" }).apiKeyCiphertext, null);
});
test("AI settings validate provider URLs, flags, and token budgets", () => {
  for (const invalid of [{ enabled: "false" }, { baseUrl: "file:///tmp/test" }, { baseUrl: "https://user:key@example.com" }, { timeoutMs: 0 }, { maxOutputTokens: 12000 }, { model: " " }]) {
    assert.throws(() => aiSettingsUpdate({ ...aiDefaults, ...invalid }));
  }
  assert.equal(aiSettingsUpdate({ ...aiDefaults, baseUrl: "http://localhost:8080/v1/" }).baseUrl, "http://localhost:8080/v1");
});

test("custom prompts are validated and omitted updates preserve saved prompts", () => {
  assert.equal(aiSettingsUpdate({ ...aiDefaults, prompt: "  Write in Hebrew.  " }).prompt, "Write in Hebrew.");
  assert.equal(aiSettingsUpdate({ ...aiDefaults, prompt: "" }).prompt, "");
  assert.throws(() => aiSettingsUpdate({ ...aiDefaults, prompt: "x".repeat(4001) }));
  const { prompt, ...legacySettings } = aiDefaults;
  assert.equal("prompt" in aiSettingsUpdate(legacySettings), false);
  assert.equal(publicAISettings(legacySettings).prompt, aiDefaults.prompt);
  assert.equal("promptPrefix" in aiSettingsUpdate({ ...aiDefaults, promptPrefix: "Replace the prefix" }), false);
});
