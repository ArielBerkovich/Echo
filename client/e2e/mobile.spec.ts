import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
});

test("keeps the workspace usable on a phone and opens the navigation drawer", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("rail-home")).toBeVisible();
  await expect(page.getByTestId("rail-dms")).toBeVisible();
  await expect(page.getByTestId("composer-editor")).toBeVisible();

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.width + 1);

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".app.nav-open .sidebar")).toBeVisible();
  await expect(page.getByText(fixture.generalChannel.name, { exact: true })).toBeVisible();

  await page.locator(".nav-backdrop").click({ position: { x: 360, y: 300 } });
  await expect(page.locator(".app.nav-open")).toHaveCount(0);
});
