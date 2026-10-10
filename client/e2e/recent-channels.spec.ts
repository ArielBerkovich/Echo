import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("opens a recent channel from the toolbar and closes the list", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/channels/${fixture.generalChannel.name}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.generalChannel.name);
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

  const trigger = page.getByTestId("recent-channels-trigger");
  const menu = page.getByTestId("recent-channels-menu");
  const triggerBounds = await trigger.boundingBox();
  const searchBounds = await page.locator(".workspace-search .search-box").boundingBox();
  expect(triggerBounds).not.toBeNull();
  expect(searchBounds).not.toBeNull();
  expect(
    triggerBounds!.x + triggerBounds!.width <= searchBounds!.x
      || searchBounds!.x + searchBounds!.width <= triggerBounds!.x
  ).toBeTruthy();

  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("recent-channel-item")).toHaveCount(2);

  await menu.getByTestId("recent-channel-item").filter({ hasText: fixture.generalChannel.name }).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.generalChannel.name);
  await expect(menu).toBeHidden();
});

test("moves only rail actions that do not fit into More", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/");

  await expect(page.getByTestId("rail-browse")).toBeVisible();
  await expect(page.getByTestId("rail-groups")).toBeVisible();
  await expect(page.getByTestId("sidebar-more")).toHaveCount(0);

  await page.locator(".rail-account").evaluate((account) => {
    account.style.position = "absolute";
    account.style.top = "370px";
    account.style.marginTop = "0";
  });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  const more = page.getByTestId("sidebar-more");
  await expect(more).toBeVisible();
  let visibleDirectActions = 0;
  for (const testId of ["rail-browse", "rail-groups"]) {
    if (await page.getByTestId(testId).isVisible()) visibleDirectActions += 1;
  }
  expect(visibleDirectActions).toBeLessThan(2);

  await more.click();
  const menuItems = page.locator(".rail-more-menu [role=menuitem]");
  await expect(menuItems).toHaveCount(2 - visibleDirectActions);
});
