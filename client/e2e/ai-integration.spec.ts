import { expect, test } from "@playwright/test";
import { seedToken } from "./helpers.js";

test("admin can configure AI and toggle thread summaries", async ({ page }) => {
  let token = process.env.E2E_ADMIN_TOKEN;
  if (!token) {
    const login = await page.request.post("/api/auth/login", { data: { username: "admin", password: process.env.E2E_ADMIN_PASSWORD || "Password1" } });
    test.skip(!login.ok(), "Set E2E_ADMIN_PASSWORD for admin integration coverage");
    token = (await login.json()).token;
  }
  const headers = { Authorization: `Bearer ${token}` };
  const response = await page.request.get("/api/integrations/ai", { headers });
  expect(response.ok()).toBeTruthy();
  const { integration, promptPrefix } = await response.json();
  const { hasApiKey, ...initialSettings } = integration;
  expect((await page.request.put("/api/integrations/ai", { headers, data: { ...initialSettings, enabled: false } })).ok()).toBeTruthy();
  await seedToken(page, token);
  try {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Integrations", exact: true }).click();
    const card = page.locator(".integration-card").filter({ has: page.getByRole("heading", { name: "AI", exact: true }) });
    const dialog = page.getByRole("dialog", { name: "AI integration" });
    for (const enabled of [true, false]) {
      await card.getByRole("button", { name: "Configure" }).click();
      await expect(dialog.getByLabel("Provider base URL")).toHaveValue(integration.baseUrl);
      await expect(dialog.getByLabel("Fixed summarization prefix")).toHaveValue(promptPrefix);
      await expect(dialog.getByLabel("Fixed summarization prefix")).toHaveAttribute("readonly", "");
      await expect(dialog.getByLabel("Summary prompt", { exact: true })).toHaveValue(enabled ? integration.prompt : "Use two short sentences.");
      await dialog.getByLabel("Summary prompt", { exact: true }).fill("Use two short sentences.");
      await dialog.getByRole("switch", { name: "Enable AI thread summaries" }).setChecked(enabled);
      if (enabled) {
        await page.route("**/api/integrations/ai", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Could not save AI settings" }) }));
        await dialog.getByRole("button", { name: "Save", exact: true }).click();
        await expect(dialog.getByRole("alert")).toHaveText("Could not save AI settings");
        await expect(dialog).toBeVisible();
        await page.unroute("**/api/integrations/ai");
      }
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(card.getByRole("status")).toHaveText(enabled ? "Enabled" : "Disabled");
      const config = await page.request.get("/api/config");
      expect((await config.json()).threadSummaries).toBe(enabled);
      const saved = await page.request.get("/api/integrations/ai", { headers });
      expect((await saved.json()).integration).toEqual({ ...integration, enabled, prompt: "Use two short sentences." });
    }
  } finally {
    const { hasApiKey, ...settings } = integration;
    expect((await page.request.put("/api/integrations/ai", { headers, data: settings })).ok()).toBeTruthy();
  }
});

test("AI configuration requires authentication", async ({ request }) => {
  expect((await request.get("/api/integrations/ai")).status()).toBe(401);
  expect((await request.put("/api/integrations/ai", { data: { enabled: true } })).status()).toBe(401);
});
