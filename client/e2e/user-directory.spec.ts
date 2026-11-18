import { expect, test } from "@playwright/test";
import { registerUser, seedToken, seedWorkspaceFixture, slug } from "./helpers.js";

test("people beyond the first directory page stay discoverable after reload and reconnect", async ({ page }) => {
  const fixture = await seedWorkspaceFixture(page);
  const target = await registerUser(page, { username: `late.person${Date.now()}`, displayName: "Late Person" });
  // Keep the database small while exercising multiple real API-sized pages.
  const directory = [fixture.alice, fixture.bob, ...Array.from({ length: 200 }, (_, index) => ({
    id: (index + 1).toString(16).padStart(24, "0"), username: `directory.person${index}`, displayName: `Directory Person ${index}`,
  })), target.user, { id: "ffffffffffffffffffffffff", username: "hidden.person", displayName: "Hidden Person", hidden: true }];
  const requestedPages = [];
  await page.route("**/api/users?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const pageNumber = Number(params.get("page") || 0);
    const limit = Number(params.get("limit") || 100);
    requestedPages.push(pageNumber);
    await route.fulfill({ json: { users: directory.slice(pageNumber * limit, (pageNumber + 1) * limit), hasMore: (pageNumber + 1) * limit < directory.length } });
  });
  await seedToken(page, fixture.alice.token);
  await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);
  const composer = page.getByTestId("composer-editor");
  await expect(composer).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible()) await skip.click();
  const mention = page.locator(".mention-item").filter({ hasText: target.user.username });
  async function checkDiscovery() {
    await composer.fill("");
    await composer.fill(`@${target.user.username}`);
    await expect(mention).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("search-input").fill(target.user.username);
    await expect(page.getByTestId(`search-user-${slug(target.user.username)}`)).toBeVisible();
    await page.getByTestId("search-input").fill("");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "New message", exact: true }).first().click();
    const picker = page.getByTestId("new-message-modal");
    await picker.getByTestId("new-message-search-input").fill(target.user.username);
    await expect(picker.getByTestId(`new-message-user-${target.user.username}`)).toBeVisible();
    await picker.getByTestId("new-message-search-input").fill("hidden.person");
    await expect(picker.getByTestId("new-message-user-hidden.person")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await checkDiscovery();
  expect(requestedPages).toContain(1);
  await page.reload();
  await expect(composer).toBeVisible();
  await checkDiscovery();
  const loadedSecondPages = requestedPages.filter((number) => number === 1).length;
  await page.context().setOffline(true);
  try {
    await expect(page.getByTestId("connection-banner")).toContainText("Reconnecting to Echo");
    await page.context().setOffline(false);
    await expect(page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 20_000 });
    await expect.poll(() => requestedPages.filter((number) => number === 1).length).toBeGreaterThan(loadedSecondPages);
    await checkDiscovery();
  } finally {
    await page.context().setOffline(false);
  }
});
