import { expect, test } from "@playwright/test";
import { requestAsToken, seedToken, seedWorkspaceFixture } from "./helpers.js";

const DEFAULT_ADMIN_PASSWORD = "Password1";

async function loginWorkspaceAdmin(page) {
  const password = process.env.E2E_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  let response = await page.request.post("/api/auth/login", {
    data: { username: "admin", password },
  });

  if (!response.ok()) {
    const setupStatus = await page.request.get("/api/auth/setup-status");
    const { needsSetup } = await setupStatus.json();
    if (!needsSetup && !process.env.E2E_ADMIN_PASSWORD) return null;
    if (needsSetup) {
      await page.request.post("/api/auth/register", {
        data: { username: "admin", password },
      });
      response = await page.request.post("/api/auth/login", {
        data: { username: "admin", password },
      });
    }
  }

  expect(response.ok(), "workspace admin credentials are unavailable").toBeTruthy();
  return response.json();
}

test.describe("workspace branding", () => {
  test.describe.configure({ mode: "serial" });

  test("admin can update and clear the organization name", async ({ page }) => {
    const admin = await loginWorkspaceAdmin(page);
    test.skip(!admin, "Set E2E_ADMIN_PASSWORD to run admin-only branding coverage against an existing workspace");
    const current = await requestAsToken(page, admin.token, "/workspace");
    const originalName = current.workspace.name;
    const nextName = `E2E Workspace ${Date.now()}`;

    await seedToken(page, admin.token);
    try {
      await page.goto("/");
      await page.getByTestId("rail-settings").click();
      await expect(page.getByTestId("settings-page")).toBeVisible();
      await page.getByRole("button", { name: "Workspace" }).click();

      const nameInput = page.getByLabel("Organization name");
      await nameInput.fill(nextName);
      await page.getByRole("button", { name: "Save branding" }).click();

      await expect(page.locator(".workspace-save-status")).toHaveText("Saved ✓");
      await page.getByTestId("rail-brand").getByText(nextName).waitFor();
      await expect(page).toHaveTitle(`Echo · ${nextName}`);

      await nameInput.fill("");
      await page.getByRole("button", { name: "Save branding" }).click();
      await expect(page.locator(".workspace-save-status")).toHaveText("Saved ✓");
      await expect(page.getByTestId("rail-brand").locator(".rail-brand-name")).toHaveCount(0);
      await expect(page).toHaveTitle("Echo");
    } finally {
      await requestAsToken(page, admin.token, "/workspace", {
        method: "PATCH",
        body: { name: originalName },
      });
    }
  });

  test("non-admin users do not see workspace branding settings", async ({ page }) => {
    const fixture = await seedWorkspaceFixture(page);
    await seedToken(page, fixture.alice.token);
    await page.goto("/");
    await expect(page.getByTestId("composer-editor")).toBeVisible();
    await page.getByTestId("rail-settings").click();
    await expect(page).toHaveURL(/\/settings(?:\/[^/?]+)?(?:\?|$)/);
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Workspace" })).toHaveCount(0);
  });
});
