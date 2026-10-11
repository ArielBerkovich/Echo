import { DEFAULT_SUMMARY_PROMPT } from "./summaryPrompt.js";
import { z } from "zod";
import mongoose from "mongoose";
import { encryptAllureSecret, decryptAllureSecret } from "../allure.js";

export const aiDefaults = { enabled: false, baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", timeoutMs: 30000, maxContextTokens: 12000, maxOutputTokens: 700, prompt: DEFAULT_SUMMARY_PROMPT };
const schema = new mongoose.Schema({
  _id: { type: String, default: "ai" },
  enabled: { type: Boolean, default: false },
  baseUrl: { type: String, default: aiDefaults.baseUrl },
  model: { type: String, default: aiDefaults.model },
  timeoutMs: { type: Number, default: aiDefaults.timeoutMs },
  maxContextTokens: { type: Number, default: aiDefaults.maxContextTokens },
  maxOutputTokens: { type: Number, default: aiDefaults.maxOutputTokens },
  prompt: { type: String, default: DEFAULT_SUMMARY_PROMPT, maxlength: 4000 },
  apiKeyCiphertext: { type: String, default: null },
}, { timestamps: true });
export const AISettings = mongoose.model("AISettings", schema);
export const aiSettingsInput = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().max(500).url().refine(value => { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; }, "Use an HTTP or HTTPS base URL without credentials, query parameters, or a fragment").transform(value => value.replace(/\/+$/, "")),
  model: z.string().trim().min(1).max(200),
  timeoutMs: z.number().int().min(1000).max(300000),
  maxContextTokens: z.number().int().min(1000).max(2000000),
  maxOutputTokens: z.number().int().min(100).max(100000),
  prompt: z.string().trim().max(4000).optional(),
  apiKey: z.string().trim().max(10000).optional(),
}).refine(value => value.maxOutputTokens < value.maxContextTokens, "Output token limit must be smaller than the context token limit");
export function publicAISettings(doc) {
  return { ...Object.fromEntries(Object.keys(aiDefaults).map(key => [key, doc?.[key] ?? aiDefaults[key]])), hasApiKey: !!doc?.apiKeyCiphertext };
}
export async function getAISettings() {
  const doc = await AISettings.findById("ai").lean();
  const { hasApiKey, ...settings } = publicAISettings(doc);
  const apiKey = decryptAllureSecret(doc?.apiKeyCiphertext);
  if (settings.enabled && hasApiKey && !apiKey) throw new Error("Cannot decrypt AI API key");
  return { ...settings, apiKey: apiKey || "" };
}
export function aiSettingsUpdate(input) {
  const { apiKey, ...settings } = aiSettingsInput.parse(input);
  return { ...settings, ...(apiKey !== undefined ? { apiKeyCiphertext: encryptAllureSecret(apiKey) } : {}) };
}
