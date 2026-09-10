import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await page.goto(`/channels/${fixture.generalChannel.name}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.generalChannel.name);
});

async function sendCard(page, card, body = "") {
  return requestAsToken(page, fixture.alice.token, `/channels/${fixture.generalChannel.id}/messages`, {
    method: "POST",
    body: { body, card },
  });
}

test("renders a customized API card with a localized Zulu event time", async ({ page }) => {
  const suffix = uniqueSuffix("card");
  const timestamp = "2026-09-10T10:15:00Z";
  const title = `Production deployment ${suffix}`;
  await sendCard(page, {
    eyebrow: "Deployment #1844",
    title,
    description: "All services passed their health checks.",
    url: `https://example.com/deployments/${suffix}`,
    timestamp,
    color: "#0f766e",
    titleColor: "#115e59",
    attributes: [
      { label: "Status", value: "Succeeded" },
      { label: "Type", value: "Feature" },
      { label: "Owner", value: fixture.bob.username, type: "user" },
    ],
  }, "Deployment update");

  const card = page.locator("a.message-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", `https://example.com/deployments/${suffix}`);
  await expect(card).toHaveAttribute("target", "_blank");
  await expect(card).toHaveAttribute("rel", "noopener noreferrer");
  await expect(card).toHaveAttribute("title", "Open card");
  await expect(card.locator(".message-card-description")).toHaveText("All services passed their health checks.");
  await expect(card.locator("time")).toHaveAttribute("datetime", "2026-09-10T10:15:00.000Z");
  const localTime = await page.evaluate((value) => new Date(value).toLocaleString([], {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }), timestamp);
  await expect(card.locator("time")).toHaveText(localTime);
  await expect(card.locator(".message-card-status")).toContainText("Succeeded");
  await expect(card.locator(".message-card-type-icon")).toBeVisible();
  const owner = card.locator(".message-card-person");
  await expect(owner).toContainText(fixture.bob.displayName);
  await expect(owner.locator(".avatar")).toBeVisible();
  await expect(card).toHaveCSS("border-left-color", "rgb(15, 118, 110)");
  await expect(card.locator(".message-card-title")).toHaveCSS("color", "rgb(17, 94, 89)");
});

test("renders a card-only message with all 12 attributes", async ({ page }) => {
  const title = `Full work item ${uniqueSuffix("card")}`;
  const attributes = Array.from({ length: 12 }, (_, index) => ({
    label: `Attribute ${index + 1}`,
    value: `Value ${index + 1}`,
  }));
  const { message } = await sendCard(page, {
    eyebrow: "Work item 7421",
    title,
    url: "https://example.com/work-items/7421",
    color: "purple",
    attributes,
  });

  expect(message.body).toBe("");
  expect(message.card.attributes).toHaveLength(12);
  const card = page.locator("a.message-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.locator(".message-card-field")).toHaveCount(12);
  await expect(card).toContainText("Attribute 1");
  await expect(card).toContainText("Value 12");
});

test("rejects unsafe, non-Zulu, and oversized card payloads", async ({ page }) => {
  const token = fixture.alice.token;
  const post = (card) => page.request.post(`/api/channels/${fixture.generalChannel.id}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { card },
  });

  const unsafe = await post({ title: "Unsafe link", url: "javascript:alert(1)" });
  expect(unsafe.status()).toBe(400);
  await expect(unsafe.json()).resolves.toMatchObject({ error: expect.stringContaining("valid HTTP(S) URL") });

  const localTime = await post({ title: "Local time", url: "https://example.com", timestamp: "2026-09-10T13:15:00+03:00" });
  expect(localTime.status()).toBe(400);
  await expect(localTime.json()).resolves.toEqual({ error: "card timestamp must be an ISO 8601 Zulu time ending in Z" });

  const oversized = await post({
    title: "Too many fields",
    url: "https://example.com",
    attributes: Array.from({ length: 13 }, (_, index) => ({ label: "Field", value: String(index) })),
  });
  expect(oversized.status()).toBe(400);
  await expect(oversized.json()).resolves.toEqual({ error: "a card can have up to 12 attributes" });
});

test("keeps the chat at the bottom after refreshing a channel whose last message is a card", async ({ page }) => {
  const channelName = `card-scroll-${fixture.suffix}`;
  const { channel } = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  for (let index = 0; index < 24; index += 1) {
    await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/messages`, {
      method: "POST",
      body: { body: `Scroll seed ${index}: enough content to fill the conversation viewport.` },
    });
  }
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: {
      card: {
        eyebrow: "Build #1200",
        title: "Last message card",
        description: "The card height is included before initial scroll positioning completes.",
        url: "https://example.com/builds/1200",
        timestamp: "2026-09-10T10:15:00Z",
        color: "green",
        attributes: Array.from({ length: 8 }, (_, index) => ({ label: `Field ${index + 1}`, value: `Value ${index + 1}` })),
      },
    },
  });
  await requestAsToken(page, fixture.alice.token, `/channels/${channel.id}/read`, { method: "POST" });

  await page.goto(`/channels/${channelName}`);
  await expect(page.locator("a.message-card").filter({ hasText: "Last message card" })).toBeVisible();
  await page.reload();
  const scroller = page.getByTestId("messages");
  await expect(page.locator("a.message-card").filter({ hasText: "Last message card" })).toBeVisible();
  await expect.poll(() => scroller.evaluate((element) => Math.round(element.scrollHeight - element.scrollTop - element.clientHeight))).toBeLessThanOrEqual(2);
});
