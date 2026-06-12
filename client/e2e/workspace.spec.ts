import { expect, test } from "@playwright/test";
import {
  channelRow,
  composer,
  enableClipboardStub,
  loginAndSeedToken,
  messageByText,
  railItem,
  resetScenario,
  searchInput,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await resetScenario(page, "workspace");
  await loginAndSeedToken(page, "alice", "Password1");
  await enableClipboardStub(page);
});

test("restores an authenticated session into the default channel", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Echo").first()).toBeVisible();
  await expect(channelRow(page, "general")).toBeVisible();
  await expect(page.getByText("Team updates")).toBeVisible();
});

test("sign out clears the session and returns to login", async ({ page }) => {
  await page.goto("/");
  await expect(channelRow(page, "general")).toBeVisible();

  await page.getByTestId("sidebar-logout").click({ force: true });

  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.evaluate(() => localStorage.getItem("echo.token"))).resolves.toBeNull();
});

test("opens API reference from the sidebar footer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByTestId("sidebar-api-docs").click({ force: true });

  await expect(page.getByText(/REST API/i)).toBeVisible();
});

test("keeps channel header actions inside the header when pinned panel is open", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 760 });
  await page.goto("/");
  await channelRow(page, "project-alpha").click();
  await page.getByTestId("channel-pinned").click();

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
  const message = messageByText(page, "API formatting test").first();
  await expect(message).toBeVisible();

  await message.hover();
  await message.locator('[data-testid$="-copy"]').click();

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
  await expect(message.locator('[data-testid$="-copy"]')).toHaveAttribute("title", "Copied message");
});

test("pastes markdown into the composer as formatted content", async ({ page }) => {
  await page.goto("/");
  await expect(composer(page)).toBeVisible();

  await composer(page).focus();
  await page.evaluate((body) => {
    const editor = document.querySelector('[data-testid="composer-editor"]');
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

  const editor = composer(page);
  await expect(editor.locator("h1")).toHaveText("Heading 1");
  await expect(editor.locator("strong")).toHaveText("Bold text");
  await expect(editor.locator("del")).toHaveText("Strikethrough text");
  await expect(editor.locator("pre code")).toContainText("formatted via API");
  await expect(editor.locator("blockquote")).toContainText("Quote line");
  await expect(editor.locator("li")).toContainText(["Bullet item", "Numbered item"]);
  await expect(editor.locator('a[href="https://example.com"]')).toHaveText("Echo link");
});

test("sends multiple messages from the same composer", async ({ page }) => {
  await page.goto("/");

  await expect(composer(page)).toBeVisible();

  const first = `Multi-send regression 1 ${Date.now()}`;
  const second = `Multi-send regression 2 ${Date.now()}`;

  await composer(page).fill(first);
  await composer(page).press("Enter");
  await expect(messageByText(page, first)).toBeVisible();

  await composer(page).fill(second);
  await composer(page).press("Enter");
  await expect(messageByText(page, second)).toBeVisible();
});

test("shows activity items and marks activity as read", async ({ page }) => {
  const markedRead = page.waitForResponse(
    (res) => res.url().includes("/api/activity/read") && res.request().method() === "POST"
  );

  await page.goto("/");
  await railItem(page, "activity").click();

  await expect(page.getByTestId("activity-header")).toContainText("Activity");
  const mentionItem = page.getByTestId("activity-item").filter({ hasText: "mentioned you" });
  await expect(mentionItem).toBeVisible();
  await expect(mentionItem).toContainText("Bob Builder");
  await expect(page.getByTestId("activity-list").locator(".mention--me")).toHaveText("@alice");
  await markedRead;
});

test("shows saved messages and removes one from saved", async ({ page }) => {
  const unsave = page.waitForResponse(
    (res) => res.url().includes("/api/saved/") && res.request().method() === "POST"
  );

  await page.goto("/");
  await railItem(page, "saved").click();

  await expect(page.getByTestId("saved-header")).toContainText("Saved");
  await expect(page.getByText("API formatting test")).toBeVisible();
  await expect(page.getByTestId("saved-item").filter({ hasText: "API formatting test" })).toBeVisible();

  await page.getByTestId("saved-item").filter({ hasText: "API formatting test" }).locator('[data-testid^="saved-remove-"]').click();

  await expect(page.getByText("API formatting test")).toBeHidden();
  await unsave;
});

test("opens a profile from an @mention in a message", async ({ page }) => {
  await page.goto("/");
  const mentionMessage = messageByText(page, "Heads up @alice").first();
  await expect(mentionMessage).toBeVisible();

  await mentionMessage.locator(".mention--me").click();

  await expect(page.getByTestId("profile-modal")).toBeVisible();
  await expect(page.getByTestId("profile-modal")).toContainText("Alice");
  await expect(page.getByTestId("profile-modal")).toContainText("@alice");
});

test("searches messages with filters and displays results", async ({ page }) => {
  let requestedUrl = "";
  page.on("request", (request) => {
    if (request.url().includes("/api/search/messages")) requestedUrl = request.url();
  });

  await page.goto("/");
  await searchInput(page).fill("Welcome in:general from:@alice has:link");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("search-results-header")).toContainText("Search");
  await expect(page.getByText("in: #general")).toBeVisible();
  await expect(page.getByText("from: @alice")).toBeVisible();
  await expect(page.getByText("has: link")).toBeVisible();
  await expect(page.getByTestId("search-result")).toContainText("Welcome search result");
  await expect(page.getByTestId("search-result").locator("mark")).toContainText("Welcome");
  await expect.poll(() => decodeURIComponent(requestedUrl)).toContain("q=Welcome in:general from:@alice has:link");
});
