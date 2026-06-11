import { expect, test } from "@playwright/test";
import { enableClipboardStub, loginAndSeedToken, resetScenario } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await resetScenario(page, "workspace");
  await loginAndSeedToken(page, "alice", "Password1");
  await enableClipboardStub(page);
});

test("restores an authenticated session into the default channel", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Echo").first()).toBeVisible();
  await expect(page.getByText("#general", { exact: true })).toBeVisible();
  await expect(page.getByText("Team updates")).toBeVisible();
});

test("sends a message to the active channel", async ({ page }) => {
  const body = `E2E channel message ${Date.now()}`;

  await page.goto("/");
  await expect(page.locator(".composer-editor")).toBeVisible();

  await page.locator(".composer-editor").fill(body);
  await page.locator(".composer-editor").press("Enter");

  await expect(page.locator(".message").filter({ hasText: body })).toBeVisible();
});

test("sends a file attachment with a message", async ({ page }) => {
  const body = `E2E attachment message ${Date.now()}`;

  await page.goto("/");
  await page.getByTitle("Attach files").click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello from e2e"),
  });

  await expect(page.getByText("e2e-note.txt")).toBeVisible();

  await page.locator(".composer-editor").fill(body);
  await page.locator(".composer-editor").press("Enter");

  const message = page.locator(".message").filter({ hasText: body });
  await expect(message).toBeVisible();
  await expect(message.getByText("e2e-note.txt")).toBeVisible();
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

test("keeps channel header actions inside the header when pinned panel is open", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.goto("/");
  await page.getByText("project-alpha", { exact: true }).click();
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
  const message = page.locator('.message').filter({ hasText: "API formatting test" }).first();
  await expect(message).toBeVisible();

  await message.hover();
  await message.getByTitle("Copy message").click();

  await expect.poll(() => page.evaluate(() => window.__copiedText)).toBe(
    [
      "API formatting test",
      "",
      "# Heading 1",
      "",
      "**Bold text**",
      "_Italic text_",
      "~~Strikethrough text~~",
      "`inline code`",
      "",
      "```js",
      'const message = "formatted via API";',
      "```",
      "",
      "> Quote line",
      "",
      "- Bullet item",
      "1. Numbered item",
      "",
      "[Echo link](https://example.com)",
    ].join("\n")
  );
  await expect(message.getByTitle("Copied message")).toBeVisible();
});

test("replies to a message in a thread", async ({ page }) => {
  const root = `E2E thread root ${Date.now()}`;
  const reply = `E2E thread reply ${Date.now()}`;

  await page.goto("/");
  await page.locator(".composer-editor").fill(root);
  await page.locator(".composer-editor").press("Enter");

  const rootMessage = page.locator(".message").filter({ hasText: root }).first();
  await expect(rootMessage).toBeVisible();

  await rootMessage.hover();
  await rootMessage.getByTitle("Reply in thread").click();

  const threadPanel = page.locator(".thread-panel");
  await expect(threadPanel).toBeVisible();
  await threadPanel.locator(".composer-editor").fill(reply);
  await threadPanel.getByRole("button", { name: "Send" }).click();

  await expect(threadPanel.locator(".message").filter({ hasText: reply })).toBeVisible();
  await expect(page.locator(".thread-indicator").filter({ hasText: "1 reply" })).toBeVisible();
});

test("edits and deletes a message", async ({ page }) => {
  const original = `E2E editable message ${Date.now()}`;
  const updated = `${original} updated`;

  await page.goto("/");
  await page.locator(".composer-editor").fill(original);
  await page.locator(".composer-editor").press("Enter");

  const message = page.locator(".message").filter({ hasText: original }).first();
  await expect(message).toBeVisible();

  await message.hover();
  await message.getByTitle("Edit message").click();
  await expect(message.locator(".msg-edit-input")).toBeVisible();
  await message.locator(".msg-edit-input").fill(updated);
  await message.locator(".msg-edit-actions").getByRole("button", { name: "Save" }).click();

  await expect(page.locator(".message").filter({ hasText: updated }).first()).toBeVisible();

  await message.hover();
  await message.getByTitle("Delete message").click();
  await page.locator(".modal").filter({ hasText: "permanently removed" }).getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.locator(".message").filter({ hasText: updated })).toHaveCount(0);
});

test("pins and unpins a message", async ({ page }) => {
  const body = `E2E pinned message ${Date.now()}`;

  await page.goto("/");
  await page.locator(".composer-editor").fill(body);
  await page.locator(".composer-editor").press("Enter");

  const message = page.locator(".message").filter({ hasText: body }).first();
  await expect(message).toBeVisible();

  await message.hover();
  await message.getByTitle("Pin message").click();
  await expect(message.getByText("Pinned")).toBeVisible();

  await page.getByRole("button", { name: "Pinned messages" }).click();
  const pinnedPanel = page.locator(".pinned-panel");
  await expect(pinnedPanel).toBeVisible();
  await expect(pinnedPanel.getByText(body)).toBeVisible();

  await pinnedPanel.getByTitle("Unpin").click();
  await expect(pinnedPanel.getByText(body)).toHaveCount(0);
});

test("forwards a message to another channel", async ({ page }) => {
  const body = `E2E forwarded message ${Date.now()}`;

  await page.goto("/");
  await page.locator(".composer-editor").fill(body);
  await page.locator(".composer-editor").press("Enter");

  const message = page.locator(".message").filter({ hasText: body }).first();
  await expect(message).toBeVisible();

  await message.hover();
  await message.getByTitle("Forward message").click();

  const forwardModal = page.locator(".modal").filter({ hasText: "Forward message" });
  await expect(forwardModal).toBeVisible();
  await forwardModal.getByPlaceholder("Search channels and people").fill("project-alpha");
  await forwardModal.getByRole("button", { name: "Forward" }).click();

  await expect(page.locator(".ch-name")).toContainText("project-alpha");
  await expect(page.getByText(/Forwarded from .* in #general/)).toBeVisible();
});

test("adds a reaction to a message", async ({ page }) => {
  const body = `E2E reacted message ${Date.now()}`;

  await page.goto("/");
  await page.locator(".composer-editor").fill(body);
  await page.locator(".composer-editor").press("Enter");

  const message = page.locator(".message").filter({ hasText: body }).first();
  await expect(message).toBeVisible();

  await message.hover();
  await message.getByTitle("Add reaction").first().click();

  const picker = page.locator(".reaction-picker");
  await expect(picker).toBeVisible();
  await picker.locator('input[type="search"]').fill("thumbs up");
  await picker.locator('input[type="search"]').press("Enter");

  await expect(message.locator(".reaction-count")).toHaveText("1");
  await expect(message.locator(".reaction-emoji")).toBeVisible();
});

test("creates a channel from the sidebar", async ({ page }) => {
  const channelName = `e2e-${Date.now()}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Create channel" }).click();

  const modal = page.locator(".modal").filter({ hasText: "Create a channel" });
  await expect(modal).toBeVisible();
  await modal.getByPlaceholder("e.g. marketing").fill(channelName);
  await modal.getByRole("button", { name: "Create" }).click();

  await expect(page.locator(".channel-item").filter({ hasText: channelName })).toBeVisible();
  await expect(page.locator(".ch-name")).toContainText(channelName);
});

test("leaves and rejoins a public channel", async ({ page }) => {
  await page.goto("/");
  await page.getByText("project-alpha", { exact: true }).click();
  await expect(page.locator(".ch-name")).toContainText("project-alpha");

  await page.getByRole("button", { name: "Leave channel" }).click();
  const confirm = page.locator(".modal").filter({ hasText: "Leave #project-alpha?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Leave" }).click();

  await page.reload();
  await expect(page.locator(".composer-editor")).toBeVisible();

  await page.locator(".search-input").fill("project-alpha");
  await page
    .locator(".search-dropdown .search-row")
    .filter({ has: page.locator(".search-hash") })
    .filter({ hasText: "project-alpha" })
    .first()
    .click();

  await expect(page.locator(".join-bar")).toBeVisible();
  await page.getByRole("button", { name: "Join channel" }).click();
  await expect(page.locator(".composer-editor")).toBeVisible();
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
  }, [
    "API formatting test",
    "",
    "# Heading 1",
    "",
    "**Bold text**",
    "_Italic text_",
    "~~Strikethrough text~~",
    "`inline code`",
    "",
    "```js",
    'const message = "formatted via API";',
    "```",
    "",
    "> Quote line",
    "",
    "- Bullet item",
    "1. Numbered item",
    "",
    "[Echo link](https://example.com)",
  ].join("\n"));

  const editor = page.locator(".composer-editor");
  await expect(editor.locator("h1")).toHaveText("Heading 1");
  await expect(editor.locator("strong")).toHaveText("Bold text");
  await expect(editor.locator("del")).toHaveText("Strikethrough text");
  await expect(editor.locator("pre code")).toContainText("formatted via API");
  await expect(editor.locator("blockquote")).toContainText("Quote line");
  await expect(editor.locator("li")).toContainText(["Bullet item", "Numbered item"]);
  await expect(editor.locator('a[href="https://example.com"]')).toHaveText("Echo link");
});

test("shows activity items and marks activity as read", async ({ page }) => {
  const markedRead = page.waitForResponse(
    (res) => res.url().includes("/api/activity/read") && res.request().method() === "POST"
  );

  await page.goto("/");
  await page.getByRole("button", { name: /Activity/ }).click();

  await expect(page.locator(".ch-name")).toHaveText("Activity");
  const mentionItem = page.locator(".activity-item").filter({ hasText: "mentioned you" });
  await expect(mentionItem).toBeVisible();
  await expect(mentionItem).toContainText("Bob Builder");
  await expect(page.locator(".activity-item .mention--me")).toHaveText("@alice");
  await markedRead;
});

test("shows saved messages and removes one from saved", async ({ page }) => {
  const unsave = page.waitForResponse(
    (res) => res.url().includes("/api/saved/") && res.request().method() === "POST"
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Saved" }).click();

  await expect(page.getByText("Messages you've saved for later")).toBeVisible();
  await expect(page.locator(".channel-view .ch-name")).toHaveText("Saved");
  await expect(page.getByText("API formatting test")).toBeVisible();
  await expect(page.locator(".activity-item").filter({ hasText: "API formatting test" })).toBeVisible();

  await page.getByTitle("Remove from saved").click();

  await expect(page.getByText("API formatting test")).toBeHidden();
  await unsave;
});

test("opens a profile from an @mention in a message", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('.message').filter({ hasText: "Heads up @alice" })).toBeVisible();

  await page.locator('.message').filter({ hasText: "Heads up @alice" }).locator(".mention--me").click();

  await expect(page.locator(".profile-modal")).toBeVisible();
  await expect(page.locator(".profile-modal")).toContainText("Alice");
  await expect(page.locator(".profile-modal")).toContainText("@alice");
});

test("searches messages with filters and displays results", async ({ page }) => {
  let requestedUrl = "";
  page.on("request", (request) => {
    if (request.url().includes("/api/search/messages")) requestedUrl = request.url();
  });

  await page.goto("/");
  await page.getByPlaceholder("Search messages, people, and channels").fill("Welcome in:general from:@alice has:link");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expect(page.locator(".ch-name")).toHaveText("Search");
  await expect(page.getByText("in: #general")).toBeVisible();
  await expect(page.getByText("from: @alice")).toBeVisible();
  await expect(page.getByText("has: link")).toBeVisible();
  await expect(page.locator(".search-result")).toContainText("Welcome search result");
  await expect(page.locator(".search-result mark")).toContainText("Welcome");
  await expect.poll(() => decodeURIComponent(requestedUrl)).toContain("q=Welcome in:general from:@alice has:link");
});
