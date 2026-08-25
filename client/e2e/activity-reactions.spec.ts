import { expect, test } from "@playwright/test";
import {
  messageById,
  requestAsToken,
  seedToken,
  seedWorkspaceFixture,
  uniqueSuffix,
} from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function addReaction(page, messageId: string, emoji: string) {
  const message = messageById(page, messageId);
  await expect(message).toBeVisible();
  await message.hover();
  await page.getByTestId(/-actions$/).getByTitle("Add reaction").click();
  await page.getByRole("button", { name: `React with ${emoji}` }).click();
}

async function openBobInGeneral(browser, messageIds: string[]) {
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await seedToken(bobPage, fixture.bob.token);
  for (const messageId of messageIds) {
    await bobPage.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}?message=${messageId}`);
    await expect(messageById(bobPage, messageId)).toBeVisible();
  }
  return { bobContext, bobPage };
}

test("groups reactions by message, keeps messages separate, and dismisses the whole group", async ({ browser, page }) => {
  const stamp = uniqueSuffix("reaction-group");
  const groupedBody = `Grouped reaction ${stamp}`;
  const separateBody = `Separate reaction ${stamp}`;
  const grouped = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: groupedBody },
  });
  const separate = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: separateBody },
  });

  // Start from a read feed so this test only exercises the reactions it creates.
  await requestAsToken(page, fixture.alice.token, "/activity/read", { method: "POST" });
  const { bobContext, bobPage } = await openBobInGeneral(browser, [grouped.message.id, separate.message.id]);
  try {
    await addReaction(bobPage, grouped.message.id, "👍");
    await addReaction(bobPage, grouped.message.id, "❤️");
    await addReaction(bobPage, separate.message.id, "🚀");
  } finally {
    await bobPage.close({ runBeforeUnload: true }).catch(() => {});
    await bobContext.close();
  }

  await page.goto("/activity");
  await expect(page.getByTestId("activity-header")).toBeVisible();
  await expect(page.getByTestId("activity-item").filter({ hasText: groupedBody })).toHaveCount(1);
  await expect(page.getByTestId("activity-item").filter({ hasText: separateBody })).toHaveCount(1);

  const groupedItem = page.getByTestId("activity-item").filter({ hasText: groupedBody });
  await expect(groupedItem).toHaveAttribute("data-activity-kind", "reaction_group");
  await expect(groupedItem).toContainText("Bob Builder");
  await expect(groupedItem).toContainText("reacted with");
  await expect(groupedItem).toContainText("👍");
  await expect(groupedItem).toContainText("❤️");
  await expect(groupedItem).toContainText("#general");

  const separateItem = page.getByTestId("activity-item").filter({ hasText: separateBody });
  await expect(separateItem).toHaveAttribute("data-activity-kind", "reaction_group");
  await expect(separateItem).toContainText("🚀");
  await expect(page.getByTestId("activity-item").filter({ hasText: groupedBody })).toHaveCount(1);
  await expect(page.getByTestId("activity-item").filter({ hasText: separateBody })).toHaveCount(1);

  // The single grouped row must remove both underlying reaction activities.
  await groupedItem.getByRole("button", { name: "Delete activity" }).click();
  await expect(page.getByTestId("activity-item").filter({ hasText: groupedBody })).toHaveCount(0);
  await expect(page.getByTestId("activity-item").filter({ hasText: separateBody })).toHaveCount(1);
  await expect.poll(async () => {
    const activity = await requestAsToken(page, fixture.alice.token, "/activity");
    return activity.items.filter((item) => item.messageId === grouped.message.id).length;
  }).toBe(0);
});

test("shows the newest unread reaction on the rail and clears it after the feed is read", async ({ browser, page }) => {
  const stamp = uniqueSuffix("reaction-badge");
  const body = `Latest reaction ${stamp}`;
  const message = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body },
  });
  await requestAsToken(page, fixture.alice.token, "/activity/read", { method: "POST" });

  const { bobContext, bobPage } = await openBobInGeneral(browser, [message.message.id]);
  try {
    await addReaction(bobPage, message.message.id, "👍");
    await addReaction(bobPage, message.message.id, "❤️");
  } finally {
    await bobPage.close({ runBeforeUnload: true }).catch(() => {});
    await bobContext.close();
  }

  await page.goto("/");
  const activityRail = page.getByTestId("rail-activity");
  const emojiBadge = page.getByTestId("rail-badge-activity");
  await expect(activityRail).toHaveAttribute("aria-label", /❤️/);
  await expect(emojiBadge).toHaveText("❤️");
  await expect(emojiBadge).toHaveClass(/rail-badge-emoji/);

  await activityRail.click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByTestId("activity-item").filter({ hasText: body })).toHaveCount(1);
  await expect.poll(async () => page.locator("[data-testid=rail-badge-activity].rail-badge-emoji").count()).toBe(0);
  await expect(activityRail).toHaveAttribute("aria-label", "Activity");

  const activity = await requestAsToken(page, fixture.alice.token, "/activity");
  const reactions = activity.items.filter((item) => item.messageId === message.message.id);
  expect(reactions).toHaveLength(2);
  expect(reactions.every((item) => item.unread === false)).toBeTruthy();
});
