import { expect, test } from "@playwright/test";
import { messageById, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("broadcasts a thread reply, resets the option, and reopens its thread", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);

  const root = messageById(page, fixture.messages.threadRoot.id);
  await root.getByTestId(`message-${fixture.messages.threadRoot.id}-reply-count`).click();

  const thread = page.getByTestId("thread-panel");
  const broadcastOption = thread.getByTestId("also-send-to-channel");
  const body = `Broadcast reply ${fixture.suffix}`;
  await broadcastOption.check();
  await thread.getByTestId("composer-editor").fill(body);
  await thread.getByTestId("composer-send").click();

  await expect(broadcastOption).not.toBeChecked();

  let broadcast;
  for (let attempt = 0; attempt < 40 && !broadcast; attempt += 1) {
    const result = await requestAsToken(page, fixture.alice.token, `/channels/${fixture.projectChannel.id}/messages`);
    broadcast = result.messages.find((message) => message.body === body) || null;
    if (!broadcast) await page.waitForTimeout(250);
  }
  expect(broadcast, "the broadcast reply should be persisted").toBeTruthy();
  expect(broadcast.parentId).toBe(fixture.messages.threadRoot.id);
  expect(broadcast.broadcastToChannel).toBe(true);

  for (let index = 0; index < 24; index += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.projectChannel.id,
        parentId: fixture.messages.threadRoot.id,
        body: `Later thread reply ${index} ${fixture.suffix}`,
      },
    });
  }

  await thread.getByTestId("thread-close").click();
  const channelReply = messageById(page, broadcast.id);
  await expect(channelReply).toBeVisible();
  await channelReply.getByTestId(`message-${broadcast.id}-view-thread`).click();

  const reopenedThread = page.getByTestId("thread-panel");
  await expect(messageById(reopenedThread, fixture.messages.threadRoot.id)).toBeVisible();
  const focusedReply = messageById(reopenedThread, broadcast.id);
  await expect(focusedReply).toBeVisible();
  await expect(focusedReply).toHaveClass(/flash/);
  const threadScroller = reopenedThread.getByTestId("thread-body");
  await expect.poll(() => focusedReply.evaluate((element) => {
    const scroller = element.closest(".thread-body");
    return Math.abs(element.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(30);

  await threadScroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect.poll(() => focusedReply.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan((await threadScroller.boundingBox()).y);
  await channelReply.getByTestId(`message-${broadcast.id}-view-thread`).click();
  await expect.poll(() => focusedReply.evaluate((element) => {
    const scroller = element.closest(".thread-body");
    return Math.abs(element.getBoundingClientRect().top - scroller.getBoundingClientRect().top);
  })).toBeLessThanOrEqual(30);

  await focusedReply.getByTestId(`message-${broadcast.id}-view-in-channel`).click();
  await expect(reopenedThread).toBeHidden();
  const channelReplyAgain = messageById(page, broadcast.id);
  await expect(channelReplyAgain).toBeVisible();
  await expect(channelReplyAgain).toHaveClass(/flash/);
});
