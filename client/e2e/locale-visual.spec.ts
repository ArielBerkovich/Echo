import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

test("captures the Hebrew workspace for visual inspection", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await page.getByTestId("rail-settings").click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByTestId("settings-language").selectOption("he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: "test-results/hebrew-settings.png", fullPage: true });

  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.getByTestId("channel-title")).toBeVisible();
  await page.screenshot({ path: "test-results/hebrew-workspace.png", fullPage: true });

  const message = page.locator(".message").first();
  await message.hover();
  const actions = page.locator("[data-message-actions]");
  await expect(actions).toBeVisible();
  const actionsBox = await actions.boundingBox();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.x).toBeGreaterThanOrEqual(8);
  expect(actionsBox!.x + actionsBox!.width).toBeLessThanOrEqual(1272);
  await page.locator('[data-message-actions] [data-testid$="-more"]').click();
  const menu = page.locator(".msg-menu[role=menu]");
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(8);
  expect(menuBox!.y).toBeGreaterThanOrEqual(8);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1272);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(712);
  await page.screenshot({ path: "test-results/hebrew-message-menu.png", fullPage: true });

  await page.locator(".menu-overlay").first().click({ position: { x: 4, y: 4 } });
  await page.getByTestId("sidebar-more").click();
  const railMenu = page.locator(".rail-more-menu");
  await expect(railMenu).toBeVisible();
  const railMenuBox = await railMenu.boundingBox();
  expect(railMenuBox).not.toBeNull();
  expect(railMenuBox!.x).toBeGreaterThanOrEqual(8);
  expect(railMenuBox!.x + railMenuBox!.width).toBeLessThanOrEqual(1272);
  await page.screenshot({ path: "test-results/hebrew-rail-menu.png", fullPage: true });

  await page.locator(".menu-overlay").first().click({ position: { x: 4, y: 4 } });
  await page.locator(".workspace-search-actions").click();
  await expect(page.getByTestId("quick-switcher-commands-section")).toBeVisible();
  await expect(page.locator(".search-action-row").first()).toHaveCSS("text-align", "right");
  await expect(page.locator(".search-section").first()).toHaveCSS("text-align", "right");
  await page.screenshot({ path: "test-results/hebrew-command-palette.png", fullPage: true });

  await page.keyboard.press("Escape");
  await page.locator(".workspace-search-help").click();
  await expect(page.locator(".wt-card")).toBeVisible();
  await page.screenshot({ path: "test-results/hebrew-walkthrough.png", fullPage: true });
});

test("keeps Hebrew mobile menus within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await seedWorkspaceFixture(page);
  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByTestId("sidebar-more").click();
  const railMenu = page.locator(".rail-more-menu");
  await expect(railMenu).toBeVisible();
  const box = await railMenu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(382);
  expect(box!.y).toBeGreaterThanOrEqual(8);
  expect(box!.y + box!.height).toBeLessThanOrEqual(836);
  await page.screenshot({ path: "test-results/hebrew-mobile-rail-menu.png", fullPage: true });
});

test("mirrors settings gutters between English and Hebrew", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await page.getByTestId("rail-settings").click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByTestId("settings-language").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.screenshot({ path: "test-results/settings-english.png", fullPage: true });
  await page.getByTestId("settings-language").selectOption("he");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.screenshot({ path: "test-results/settings-hebrew.png", fullPage: true });
});

test("renders every primary Hebrew workspace page in RTL", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await page.getByTestId("rail-settings").click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByTestId("settings-language").selectOption("he");

  const capture = async (name, locator) => {
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(locator)).toBeVisible();
    await page.screenshot({ path: `test-results/hebrew-${name}.png`, fullPage: true });
  };

  await page.getByTestId("rail-home").click();
  await capture("home", '[data-testid="home-header"]');
  await page.getByTestId("rail-dms").click();
  await capture("dms", '[data-testid="dms-header"]');
  await page.getByTestId("rail-activity").click();
  await capture("activity", '[data-testid="activity-list"]');
  await page.getByTestId("rail-saved").click();
  await capture("saved", '[data-testid="saved-list"]');
  await page.getByTestId("sidebar-more").click();
  await page.getByTestId("more-browse-channels").click();
  await capture("browse", '[data-testid="channel-browser"]');
  await page.getByTestId("sidebar-more").click();
  await page.getByTestId("open-groups").click();
  await capture("groups", '[data-testid="groups-panel"]');
  await page.getByTestId("rail-settings").click();
  await capture("settings-account", '[data-testid="settings-page"]');
  await page.getByRole("button", { name: "העדפות", exact: true }).click();
  await capture("settings-preferences", '[data-testid="preferences-page"]');
  await page.getByRole("button", { name: "קיצורי מקלדת", exact: true }).click();
  await capture("settings-shortcuts", '[data-testid="settings-page"]');
});
