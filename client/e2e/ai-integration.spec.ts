import { expect, test } from "@playwright/test";
import { apiRequestUrl } from "./helpers.js";

test("admin can configure AI and toggle thread summaries", async ({ request }) => {
  const api = (method, path, options) => request[method](apiRequestUrl(path), options);
  let token = process.env.E2E_ADMIN_TOKEN;
  if (!token) {
    const login = await api("post", "/api/auth/login", { data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || "Password1" } });
    test.skip(!login.ok(), "Set E2E_ADMIN_PASSWORD for admin integration coverage");
    token = (await login.json()).token;
  }
  const headers = { Authorization: `Bearer ${token}` };
  const response = await api("get", "/api/integrations/ai", { headers });
  expect(response.ok()).toBeTruthy();
  const { integration } = await response.json();
  const { hasApiKey, ...initialSettings } = integration;
  expect((await api("put", "/api/integrations/ai", { headers, data: { ...initialSettings, enabled: false } })).ok()).toBeTruthy();
  try {
    for (const enabled of [true, false]) {
      const savedSettings = { ...initialSettings, enabled, prompt: "Use two short sentences." };
      expect((await api("put", "/api/integrations/ai", { headers, data: savedSettings })).ok()).toBeTruthy();
      const config = await api("get", "/api/config");
      expect((await config.json()).threadSummaries).toBe(enabled);
      const saved = await api("get", "/api/integrations/ai", { headers });
      expect((await saved.json()).integration).toEqual({ ...savedSettings, hasApiKey: false });
    }
  } finally {
    const { hasApiKey, ...settings } = integration;
    expect((await api("put", "/api/integrations/ai", { headers, data: settings })).ok()).toBeTruthy();
  }
});

test("AI configuration requires authentication", async ({ request }) => {
  const url = apiRequestUrl("/api/integrations/ai");
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.put(url, { data: { enabled: true } })).status()).toBe(401);
});
