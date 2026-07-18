import { expect, test } from "@playwright/test";
import { dmRow, railItem, requestAsToken, seedWorkspaceFixture, slug } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("shows a dot instead of a Home notification count", async ({ page }) => {
  await page.goto("/");

  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Home dot notification ${Date.now()}`,
      externalKey: `home-dot-${Date.now()}`,
    },
  });

  const badge = railItem(page, "home").locator(".rail-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveClass(/dot/);
  await expect(badge).toHaveText("");
});

test("does not offer DM removal in the dedicated DMs view", async ({ page }) => {
  await page.goto("/");
  await railItem(page, "dms").click();

  const row = dmRow(page, fixture.bob.displayName);
  await expect(row).toBeVisible();
  await expect(row.locator(".dm-remove")).toHaveCount(0);
});

test("keeps the DM preview width stable when toggling VIP", async ({ page }) => {
  await page.goto("/");
  await railItem(page, "dms").click();

  const row = dmRow(page, fixture.bob.displayName);
  const preview = row.locator(".dm-preview");
  const before = await preview.boundingBox();
  expect(before).not.toBeNull();

  await row.locator(".dm-open").click();
  const vipToggle = page.getByTestId("dm-vip-toggle");
  const wasVip = (await vipToggle.getAttribute("aria-pressed")) === "true";
  await vipToggle.click();
  await expect(vipToggle).toHaveAttribute("aria-pressed", String(!wasVip));
  await railItem(page, "dms").click();

  const after = await dmRow(page, fixture.bob.displayName).locator(".dm-preview").boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);

  // Leave the fixture in its normal state for subsequent tests.
  await dmRow(page, fixture.bob.displayName).locator(".dm-open").click();
  const cleanupToggle = page.getByTestId("dm-vip-toggle");
  if (((await cleanupToggle.getAttribute("aria-pressed")) === "true") !== wasVip) {
    await cleanupToggle.click();
  }
});

test("opens people and channels searched from Activity and Saved", async ({ page }) => {
  await page.goto("/");

  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "activity", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();
  await expect(page.getByTestId("activity-header")).toBeVisible();

  await page.getByTestId("search-input").fill(fixture.bob.username);
  await page.getByTestId(`search-user-${slug(fixture.bob.username)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);

  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "saved", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();
  await expect(page.getByTestId("saved-header")).toBeVisible();

  await page.getByTestId("search-input").fill(fixture.projectChannel.name);
  await page.getByTestId(`search-channel-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
});

test("creates the channel creator as a manager and lets them promote a member", async ({ page }) => {
  const channelName = `manager-regression-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "private" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });

  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(channelName)}`).click();
  await page.locator(".ch-name-btn").click();

  const details = page.getByTestId("channel-details-dialog");
  await expect(details.locator(".channel-details-managers")).toContainText(fixture.alice.displayName);
  const bobRow = details.locator(".channel-details-person").filter({ hasText: fixture.bob.displayName });
  await bobRow.getByRole("button", { name: "Make manager" }).click();

  await expect(details.locator(".channel-details-managers")).toContainText(fixture.bob.displayName);
  await expect(bobRow).toContainText("Manager");
});

test("preserves the reading position and offers new messages when scrolled up", async ({ page }) => {
  const channelName = `scroll-regression-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  for (let i = 0; i < 28; i += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: created.channel.id,
        body: `Scroll seed ${i} ${Date.now()}`,
        externalKey: `scroll-seed-${fixture.suffix}-${i}`,
      },
    });
  }
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/read`, { method: "POST" });

  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(channelName)}`).click();
  const scroller = page.locator(".channel-main .messages");
  await expect(scroller).toBeVisible();
  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 220);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const position = await scroller.evaluate((el) => el.scrollTop);

  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: created.channel.id,
      body: `Message while reading ${Date.now()}`,
      externalKey: `scroll-live-${fixture.suffix}`,
    },
  });

  await expect(page.getByTestId("new-messages-button")).toBeVisible();
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThanOrEqual(position - 2);
  await page.getByTestId("new-messages-button").click();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
});

test("shows a friendly message when login returns a server error", async ({ page }) => {
  const loginPage = await page.context().newPage();
  await loginPage.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal details" }) })
  );
  await loginPage.goto("/");

  await loginPage.getByLabel("Username").fill("someone");
  await loginPage.locator('input[name="password"]').fill("Password1");
  await loginPage.getByRole("button", { name: "Sign in" }).click();

  await expect(loginPage.locator(".error")).toContainText("We couldn't sign you in right now. Please try again in a moment.");
  await expect(loginPage.locator(".error")).not.toContainText("internal details");
  await loginPage.close();
});
