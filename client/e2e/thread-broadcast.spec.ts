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

  await thread.getByTestId("thread-close").click();
  const channelReply = messageById(page, broadcast.id);
  await expect(channelReply).toBeVisible();
  await channelReply.getByTestId(`message-${broadcast.id}-view-thread`).click();

  const reopenedThread = page.getByTestId("thread-panel");
  await expect(messageById(reopenedThread, fixture.messages.threadRoot.id)).toBeVisible();
  await expect(messageById(reopenedThread, broadcast.id)).toBeVisible();
});
