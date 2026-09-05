import { expect, test } from "@playwright/test";
import { messageById, requestAsToken, seedToken, seedWorkspaceFixture } from "./helpers.js";

let fixture;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("jumps to an @everyone activity message on the first click", async ({ browser, page }) => {
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Earlier mention ${fixture.suffix} @${fixture.alice.username}`,
      externalKey: `${fixture.suffix}-earlier-mention`,
    },
  });
  const bobPage = await browser.newPage();
  await seedToken(bobPage, fixture.bob.token);
  await bobPage.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
  const bobComposer = bobPage.getByTestId("composer-editor");
  await expect(bobComposer).toBeVisible();
  await bobComposer.fill(`Broadcast jump target ${fixture.suffix} @e`);
  await bobPage.locator(".mention-item").filter({ hasText: "Notify everyone in this channel" }).click();
  await bobComposer.press("Enter");
  const bobBroadcast = bobPage.locator(".message").filter({ hasText: `Broadcast jump target ${fixture.suffix}` }).last();
  await expect(bobBroadcast).toBeVisible();
  const broadcastId = await bobBroadcast.getAttribute("data-mid");
  expect(broadcastId).toBeTruthy();
  await bobPage.close();

  // Push the target outside the initial latest-message window so the activity
  // click must load the target around its id before scrolling to it.
  for (let index = 0; index < 60; index += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.generalChannel.id,
        body: `After broadcast ${fixture.suffix} ${index}`,
        externalKey: `${fixture.suffix}-after-broadcast-${index}`,
      },
    });
  }

  const threadRoot = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Thread root ${fixture.suffix}`,
      externalKey: `${fixture.suffix}-thread-root`,
    },
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      parentId: threadRoot.message.id,
      body: `Thread reply ${fixture.suffix}`,
      externalKey: `${fixture.suffix}-thread-reply`,
    },
  });

  await page.goto("/");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await page.getByTestId("rail-activity").click();
  await expect(page).toHaveURL(/\/activity$/);
  const target = page.getByTestId("activity-item").filter({ hasText: `Broadcast jump target ${fixture.suffix}` });
  await expect(target).toBeVisible();
  await target.click();

  const message = messageById(page, broadcastId);
  await expect(message).toBeVisible();
  await expect.poll(async () => message.evaluate((element) => {
    const scroller = element.closest(".messages");
    if (!scroller) return false;
    const messageBox = element.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    return messageBox.top >= scrollerBox.top - 4 && messageBox.bottom <= scrollerBox.bottom + 4;
  })).toBe(true);
});
