import { expect, test } from "@playwright/test";
import { messageById, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("jumps to an @everyone activity message on the first click", async ({ page }) => {
  const broadcast = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Broadcast jump target ${fixture.suffix} @everyone`,
      externalKey: `${fixture.suffix}-broadcast-jump-target`,
    },
  });

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

  await page.goto("/");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await page.getByTestId("rail-activity").click();
  await expect(page).toHaveURL(/\/activity$/);
  const target = page.getByTestId("activity-item").filter({ hasText: `Broadcast jump target ${fixture.suffix}` });
  await expect(target).toBeVisible();
  await target.click();

  const message = messageById(page, broadcast.message.id);
  await expect(message).toBeVisible();
  await expect.poll(async () => message.evaluate((element) => {
    const scroller = element.closest(".messages");
    if (!scroller) return false;
    const messageBox = element.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    return messageBox.top >= scrollerBox.top - 4 && messageBox.bottom <= scrollerBox.bottom + 4;
  })).toBe(true);
});
