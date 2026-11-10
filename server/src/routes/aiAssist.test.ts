import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import "express-async-errors";
import { aiAssistRouter } from "./aiAssist.js";
import { signToken } from "../auth.js";
import { User } from "../models/User.js";
import { AISettings } from "../services/aiSettings.js";

test("authenticated rephrase route calls the configured provider", async () => {
  let providerRequest;
  const provider = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    providerRequest = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ canRephrase: true, reason: "", options: [{ key: "professional", text: "Please send the report." }] }) } }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const user = { _id: "0123456789abcdef01234567", tokenVersion: 0, activityReadBaseline: {} };
  const originalUserFind = User.findById;
  const originalSettingsFind = AISettings.findById;
  User.findById = async () => user as any;
  let enabled = true;
  AISettings.findById = () => ({ lean: async () => ({ enabled, baseUrl: `http://127.0.0.1:${(provider.address() as any).port}/v1`, model: "test", timeoutMs: 3000, maxContextTokens: 12000, maxOutputTokens: 700 }) }) as any;
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiAssistRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/ai/rephrase`;
  try {
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signToken(user)}` }, body: JSON.stringify({ text: "send report" }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).options[0].text, "Please send the report.");
    assert.equal(providerRequest.response_format.type, "json_schema");
    assert.equal(JSON.parse(providerRequest.messages[1].content).draft, "send report");
    enabled = false;
    const disabled = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signToken(user)}` }, body: JSON.stringify({ text: "send report" }) });
    assert.equal(disabled.status, 404);
  } finally {
    User.findById = originalUserFind;
    AISettings.findById = originalSettingsFind;
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => provider.close(() => resolve()))]);
  }
});
