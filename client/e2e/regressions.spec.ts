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

test("removes a channel from the sidebar after leaving it", async ({ page }) => {
  const channelName = `leave-sidebar-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/members`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${created.channel.id}/managers`, {
    method: "POST",
    body: { userId: fixture.bob.id },
  });

  await page.goto("/");
  const row = page.getByTestId(`channel-row-${slug(channelName)}`);
  await expect(row).toBeVisible();
  await row.click();
  await page.getByTestId("channel-leave").click();
  await page.getByRole("button", { name: "Leave", exact: true }).click();

  await expect(row).toHaveCount(0);
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

test("scrolls to the bottom after sending while reading older messages", async ({ page }) => {
  const channelName = `own-send-scroll-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  for (let i = 0; i < 28; i += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: created.channel.id,
        body: `Own send seed ${i} ${Date.now()}`,
        externalKey: `own-send-seed-${fixture.suffix}-${i}`,
      },
    });
  }

  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(channelName)}`).click();
  const scroller = page.locator(".channel-main .messages");
  await expect(scroller).toBeVisible();
  await scroller.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 220);
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  const body = `Own send scroll ${Date.now()}`;
  await page.getByTestId("composer-editor").fill(body);
  await page.getByTestId("composer-editor").press("Enter");

  await expect(page.locator(".message").filter({ hasText: body })).toBeVisible();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("new-messages-button")).toHaveCount(0);
});

test("opens a saved message from a hidden DM", async ({ page }) => {
  const dmMessage = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.dmChannel.id,
      body: `Hidden DM saved ${fixture.suffix}`,
      externalKey: `hidden-dm-saved-${fixture.suffix}`,
    },
  });
  await requestAsToken(page, fixture.alice.token, `/saved/${dmMessage.message.id}`, { method: "POST" });
  await requestAsToken(page, fixture.alice.token, `/dms/${fixture.dmChannel.id}`, { method: "DELETE" });

  await page.goto("/");
  await page.getByTestId("rail-saved").click();
  const savedItem = page.getByTestId("saved-item").filter({ hasText: dmMessage.message.body });
  await expect(savedItem).toBeVisible();
  await savedItem.click();

  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await expect(page.getByTestId(`message-${dmMessage.message.id}`)).toBeVisible();
});

test("keeps a hidden DM visible after marking the other user VIP", async ({ page }) => {
  await requestAsToken(page, fixture.alice.token, `/dms/${fixture.dmChannel.id}`, { method: "DELETE" });
  const vips = await requestAsToken(page, fixture.alice.token, "/users/vips");
  if (vips.vipIds.includes(fixture.bob.id)) {
    await requestAsToken(page, fixture.alice.token, `/users/${fixture.bob.id}/vip`, { method: "POST" });
  }
  const vipResult = await requestAsToken(page, fixture.alice.token, `/users/${fixture.bob.id}/vip`, { method: "POST" });
  expect(vipResult.vip).toBeTruthy();

  const visibleDms = await requestAsToken(page, fixture.alice.token, "/dms");
  expect(
    visibleDms.conversations.some((conversation) => conversation.id === fixture.dmChannel.id),
    `expected visible DM ${fixture.dmChannel.id}`
  ).toBeTruthy();
  await page.goto("/");
  const vipDm = page.locator(".dm-item").filter({ hasText: fixture.bob.displayName });
  await expect(vipDm).toBeVisible();
  await expect(page.getByTestId("vip-toggle")).toBeVisible();

  await requestAsToken(page, fixture.alice.token, `/users/${fixture.bob.id}/vip`, { method: "POST" });
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
