import { expect, test } from "@playwright/test";
import {
  enableClipboardStub,
  messageById,
  messageByText,
  railItem,
  requestAsToken,
  seedWorkspaceFixture,
} from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await enableClipboardStub(page);
});

test("restores an authenticated session into the default channel", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Echo").first()).toBeVisible();
  await expect(page.getByText("#general", { exact: true })).toBeVisible();
  await expect(page.getByText(fixture.messages.searchHit.body, { exact: false })).toBeVisible();
});

test("sign out clears the session and returns to login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click({ force: true });

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem("echo.token"))).resolves.toBeNull();
});

test("opens API reference from the sidebar footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByLabel("API reference").click({ force: true });

  await expect(page.getByText(/REST API/i)).toBeVisible();
});

test("keeps channel header actions inside the header when pinned panel is open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.goto("/");
  await page.getByText(fixture.projectChannel.name, { exact: true }).click();
  await page.getByRole("button", { name: "Pinned messages" }).click();

  await expect(page.locator(".pinned-panel")).toBeVisible();
  const bounds = await page.evaluate(() => {
    const header = document.querySelector(".channel-header").getBoundingClientRect();
    const leave = document.querySelector(".header-action.leave").getBoundingClientRect();
    return {
      headerRight: header.right,
      leaveRight: leave.right,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(bounds.leaveRight).toBeLessThanOrEqual(bounds.headerRight + 1);
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
});

test("copies the raw markdown body from a message", async ({ page }) => {
  await page.goto("/");
  const message = page
    .locator(".message")
    .filter({ hasText: `API formatting test ${fixture.suffix}` })
    .first();
  await expect(message).toBeVisible();

  await message.hover();
  await message.getByTitle("Copy message").click();

  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe(fixture.messages.formatted.body);
  await expect(message.getByTitle("Copied message")).toBeVisible();
});

test("pastes markdown into the composer as formatted content", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".composer-editor")).toBeVisible();

  await page.locator(".composer-editor").focus();
  await page.evaluate((body) => {
    const editor = document.querySelector(".composer-editor");
    const data = new DataTransfer();
    data.setData("text/plain", body);
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      })
    );
  }, fixture.messages.formatted.body);

  const editor = page.locator(".composer-editor");
  await expect(editor.locator("h1")).toHaveText("Heading 1");
  await expect(editor.locator("strong")).toHaveText("Bold text");
  await expect(editor.locator("del")).toHaveText("Strikethrough text");
  await expect(editor.locator("pre code")).toContainText("formatted via API");
  await expect(editor.locator("blockquote")).toContainText("Quote line");
  await expect(editor.locator("li")).toContainText(["Bullet item", "Numbered item"]);
  await expect(editor.locator('a[href="https://example.com"]')).toHaveText("Echo link");
});

test("uses Enter for new list items and Shift+Enter for list line breaks", async ({ page }) => {
  await page.goto("/");

  const editor = page.locator(".composer-editor");
  await expect(editor).toBeVisible();

  await editor.click();
  await page.getByTitle("Bulleted list").click();
  await page.keyboard.type("List item one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("List item two");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("After list");

  const html = await editor.evaluate((el) => el.innerHTML);
  expect(html).toMatch(/<ul><li>List item one<\/li><li>List item two<br>\u200b?After list<\/li><\/ul>/);
});

test("uses Shift+Enter for code newlines and Enter to exit the block", async ({ page }) => {
  await page.goto("/");

  const editor = page.locator(".composer-editor");
  await expect(editor).toBeVisible();

  await editor.click();
  await page.getByTitle("Code block").click();
  await page.keyboard.type("const value = 1;");
  await page.keyboard.down("Shift");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Shift");
  await page.keyboard.type("console.log(value);");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After code");

  const html = await editor.evaluate((el) => el.innerHTML);
  expect(html).toMatch(/<pre><code>[\s\S]*const value = 1;<br>\u200b?console\.log\(value\);[\s\S]*<\/code><\/pre>/);
  expect(html).toMatch(/<\/pre><div[^>]*>After code<\/div>/);
});

test("sends multiple messages from the same composer", async ({ page }) => {
  await page.goto("/");

  const composer = page.locator(".composer-editor");
  await expect(composer).toBeVisible();

  const first = `Multi-send regression 1 ${Date.now()}`;
  const second = `Multi-send regression 2 ${Date.now()}`;

  await composer.fill(first);
  await composer.press("Enter");
  await expect(page.locator(".message").filter({ hasText: first })).toBeVisible();

  await composer.fill(second);
  await composer.press("Enter");
  await expect(page.locator(".message").filter({ hasText: second })).toBeVisible();
});

test("shows activity items and marks activity as read", async ({ page }) => {
  const markedRead = page.waitForResponse(
    (res) => res.url().includes("/api/activity/read") && res.request().method() === "POST"
  );

  await page.goto("/");
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Activity ping ${Date.now()}`,
      externalKey: `activity-${Date.now()}`,
    },
  });
  await railItem(page, "activity").click();

  await expect(page.getByTestId("activity-header")).toContainText("Activity");
  const activityItem = page.getByTestId("activity-item").first();
  await expect(activityItem).toBeVisible();
  await markedRead;
});

test("opens the exact message from Activity", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "activity", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();

  await expect(page.getByTestId("activity-header")).toBeVisible();
  const mentionText = page.getByText(fixture.messages.mention.body, { exact: false }).first();
  await expect(mentionText).toBeVisible();
  await mentionText.click();

  await expect(page.getByTestId("channel-title")).toContainText("general");
  await expect(messageById(page, fixture.messages.mention.id)).toBeInViewport();
});

test("opens a public-channel mention even when the channel list is stale", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  const stamp = Date.now();
  const channelName = `public-activity-${stamp}`;
  const publicChannel = await requestAsToken(page, fixture.bob.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  const mentionBody = `Public activity mention ${stamp} @${fixture.alice.username}`;
  const mention = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: publicChannel.channel.id,
      body: mentionBody,
      externalKey: `public-activity-mention-${stamp}`,
    },
  });

  await railItem(page, "activity").click();
  const activityEntry = page.getByText(mentionBody, { exact: false }).first();
  await expect(activityEntry).toBeVisible();
  await activityEntry.click();

  await expect(page.getByTestId("channel-title")).toContainText(channelName);
  await expect(messageById(page, mention.message.id)).toBeInViewport();
});

test("opens a thread activity item at the exact reply", async ({ page }) => {
  const stamp = Date.now();
  const threadMentionText = `Thread mention ${stamp}`;
  const reply = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      parentId: fixture.messages.threadRoot.id,
      body: `${threadMentionText} @${fixture.alice.username}`,
      externalKey: `thread-mention-${stamp}`,
    },
  });

  await page.goto("/");
  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "activity", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();

  await expect(page.getByTestId("activity-header")).toBeVisible();
  const activityItem = page.getByText(threadMentionText, { exact: false }).first();
  await expect(activityItem).toBeVisible();
  await activityItem.click();

  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await expect(messageById(page, reply.message.id)).toBeInViewport();
});

test("shows saved messages and removes one from saved", async ({ page }) => {
  const unsave = page.waitForResponse(
    (res) => res.url().includes("/api/saved/") && res.request().method() === "POST"
  );

  await page.goto("/");
  const savedBefore = await requestAsToken(page, fixture.alice.token, "/saved");
  if ((savedBefore.items || []).some((item) => item.id === fixture.messages.searchHit.id)) {
    await requestAsToken(page, fixture.alice.token, `/saved/${fixture.messages.searchHit.id}`, {
      method: "POST",
    });
  }
  await requestAsToken(page, fixture.alice.token, `/saved/${fixture.messages.searchHit.id}`, {
    method: "POST",
  });
  await page.evaluate((userId) => {
    localStorage.setItem(`echo.loc.${userId}`, JSON.stringify({ view: "saved", convId: null, convType: null }));
  }, fixture.alice.id);
  await page.reload();

  await expect(page.getByTestId("saved-header")).toBeVisible();
  const savedItem = page.getByTestId("saved-item").filter({ hasText: fixture.messages.searchHit.body });
  await expect(savedItem).toBeVisible();
  await savedItem.click();
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await expect(messageById(page, fixture.messages.searchHit.id)).toBeInViewport();
  await page.goBack();
  await expect(page.getByTestId("saved-header")).toBeVisible();

  await page.getByTestId("saved-item").filter({ hasText: fixture.messages.searchHit.body }).locator('[data-testid^="saved-remove-"]').click();

  await expect(savedItem).toHaveCount(0);
  await unsave;
});

test("opens a profile from an @mention in a message", async ({ page }) => {
  await page.goto("/");
  const mention = messageByText(page, `Heads up @${fixture.alice.username}`).first();
  await expect(mention).toBeVisible();

  await mention.locator(".mention--me").click();

  await expect(page.getByTestId("profile-modal")).toBeVisible();
  await expect(page.getByTestId("profile-modal")).toContainText(fixture.alice.displayName);
  await expect(page.getByTestId("profile-modal")).toContainText(`@${fixture.alice.username}`);
});

test("opens a DM at the latest message when there is no unread history", async ({ page }) => {
  const selfDm = await requestAsToken(page, fixture.alice.token, "/dms", {
    method: "POST",
    body: { userId: fixture.alice.id },
  });
  const selfChannelId = selfDm.channel.id;

  for (let i = 0; i < 6; i += 1) {
    await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: selfChannelId,
        body: `DM scroll seed ${i} ${Date.now()}`,
        externalKey: `dm-scroll-${i}-${Date.now()}`,
      },
    });
  }
  await requestAsToken(page, fixture.alice.token, `/channels/${selfChannelId}/read`, {
    method: "POST",
  });

  await page.goto("/");
  await page.getByRole("button", { name: "DMs" }).click();
  await page.getByTestId("dm-self-open").click();

  const scroller = page.locator(".channel-main .messages");
  await expect.poll(async () => {
    return scroller.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  }).toBeLessThanOrEqual(2);
});

test("searches messages with filters and displays results", async ({ page }) => {
  let requestedUrl = "";
  page.on("request", (request) => {
    if (request.url().includes("/api/search/messages")) requestedUrl = request.url();
  });

  await page.goto("/");
  await page.getByTestId("search-input").fill(`Welcome in:general from:@${fixture.alice.username} has:link`);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("search-results-header")).toContainText("Search");
  await expect(page.getByText("in: #general")).toBeVisible();
  await expect(page.getByText(`from: @${fixture.alice.username}`)).toBeVisible();
  await expect(page.getByText("has: link")).toBeVisible();
  await expect(page.getByTestId("search-result")).toContainText(fixture.messages.searchHit.body);
  await expect(page.getByTestId("search-result").locator("mark")).toContainText("Welcome");
  await expect.poll(() => decodeURIComponent(requestedUrl)).toContain(
    `q=Welcome in:general from:@${fixture.alice.username} has:link`
  );
});
