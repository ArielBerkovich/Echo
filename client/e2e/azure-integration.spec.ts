import { expect, test } from "@playwright/test";
import { requestAsToken, seedToken, seedWorkspaceFixture } from "./helpers.js";

const DEFAULT_ADMIN_PASSWORD = "Password1";

async function loginWorkspaceAdmin(page) {
  const password = process.env.E2E_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const response = await page.request.post("/api/auth/login", {
    data: { username: "admin", password },
  });
  if (!response.ok()) return null;
  return response.json();
}

test.describe("Azure DevOps integration", () => {
  test("admin can inspect the Azure integration settings", async ({ page }) => {
    const admin = await loginWorkspaceAdmin(page);
    test.skip(!admin, "Set E2E_ADMIN_PASSWORD to run admin-only Azure coverage");

    const current = await requestAsToken(page, admin.token, "/integrations/azure-devops");
    test.skip(!current.integrations?.length, "Azure DevOps integration is not configured");

    await seedToken(page, admin.token);
    await page.goto("/");
    await page.getByTestId("rail-settings").click();
    await page.getByRole("button", { name: "Integrations" }).click();

    await expect(page.getByText("Azure DevOps", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "View integration" }).click();
    await expect(page.getByRole("heading", { name: "Azure DevOps" })).toBeVisible();
    await expect(page.locator("#azure-webhook-endpoint")).toHaveValue(/\/api\/integrations\/azure-devops\//);
    await expect(page.getByText("Pull request created", { exact: true })).toBeVisible();
    await expect(page.getByText("Build passed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Close integration settings" })).toBeVisible();
  });

  test("regular users do not see Azure integration administration", async ({ page }) => {
    const fixture = await seedWorkspaceFixture(page);
    await seedToken(page, fixture.alice.token);
    await page.goto("/");
    await page.getByTestId("rail-settings").click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Integrations" })).toHaveCount(0);
  });
});
