import { expect, test } from "@playwright/test";
import { messageById, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function createMessage(page, body, parentId = undefined) {
  return requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body,
      parentId,
    },
  });
}

test("shows sender details only on the first quick message in a channel", async ({ page }) => {
  const suffix = `grouped-channel-${Date.now()}`;
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `${suffix} boundary` },
  });
  const first = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `${suffix} first` },
  });
  const second = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.generalChannel.id, body: `${suffix} second` },
  });

  await page.goto("/channels/general");
  const firstMessage = messageById(page, first.message.id);
  const secondMessage = messageById(page, second.message.id);
  await expect(firstMessage).toBeVisible();
  await expect(secondMessage).toBeVisible();
  await expect(firstMessage).not.toHaveClass(/grouped/);
  await expect(firstMessage.getByTestId(`message-${first.message.id}-avatar`)).toBeVisible();
  await expect(firstMessage.getByTestId(`message-${first.message.id}-author`)).toBeVisible();
  await expect(secondMessage).toHaveClass(/grouped/);
  await expect(secondMessage.getByTestId(`message-${second.message.id}-avatar`)).toHaveCount(0);
  await expect(secondMessage.getByTestId(`message-${second.message.id}-author`)).toHaveCount(0);
});

test("keeps sender details on the first reply after a thread root", async ({ page }) => {
  const suffix = `grouped-thread-${Date.now()}`;
  const root = await createMessage(page, `${suffix} root`);
  const firstReply = await createMessage(page, `${suffix} first reply`, root.message.id);
  const secondReply = await createMessage(page, `${suffix} second reply`, root.message.id);

  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await messageById(page, root.message.id).getByTestId(`message-${root.message.id}-reply-count`).click();
  const thread = page.getByTestId("thread-panel");
  const firstReplyMessage = messageById(thread, firstReply.message.id);
  const secondReplyMessage = messageById(thread, secondReply.message.id);
  await expect(firstReplyMessage).toBeVisible();
  await expect(secondReplyMessage).toBeVisible();
  await expect(firstReplyMessage).not.toHaveClass(/grouped/);
  await expect(firstReplyMessage.getByTestId(`message-${firstReply.message.id}-avatar`)).toBeVisible();
  await expect(firstReplyMessage.getByTestId(`message-${firstReply.message.id}-author`)).toBeVisible();
  await expect(secondReplyMessage).toHaveClass(/grouped/);
  await expect(secondReplyMessage.getByTestId(`message-${secondReply.message.id}-avatar`)).toHaveCount(0);
  await expect(secondReplyMessage.getByTestId(`message-${secondReply.message.id}-author`)).toHaveCount(0);
});
