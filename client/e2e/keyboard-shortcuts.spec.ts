import { expect, test, type Locator } from "@playwright/test";
import { channelRow, messageById, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test.describe("documented keyboard shortcuts", () => {
  async function tabTo(locator: Locator) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (await locator.evaluate((element) => element === document.activeElement).catch(() => false)) return;
      await locator.page().keyboard.press("Tab");
    }
    throw new Error(`Could not reach ${await locator.getAttribute("data-testid")} with Tab`);
  }

  test("keeps Ctrl+F focused on workspace search and opens the switcher with Ctrl+K", async ({ page }) => {
    await page.goto("/");
    const search = page.getByTestId("search-input");
    await expect(page.getByTestId("composer-editor")).toBeVisible();

    await page.keyboard.press("Control+f");
    await expect(search).toBeFocused();
    await expect(page.getByTestId("search-action-new-message")).toHaveCount(0);
    await expect(page.getByTestId("search-action-view-files")).toHaveCount(0);

    await page.getByTestId("composer-editor").focus();
    await page.keyboard.press("Control+k");
    await expect(search).toBeFocused();
    await expect(page.getByTestId("search-action-new-message")).toBeVisible();
  });

  test("opens matching quick-switcher actions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("composer-editor")).toBeVisible();
    const search = page.getByTestId("search-input");
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("search-action-new-message")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
    await search.fill("settings");

    await expect(page.getByTestId("search-action-settings")).toBeVisible();
    await expect(page.getByTestId("search-messages-row")).toHaveCount(0);
    await expect(page.getByTestId("search-channel-general")).toHaveCount(0);
    await page.getByTestId("search-action-settings").click();
    await expect(page).toHaveURL(/\/settings\/account$/);
  });

  test("runs every remaining global command from the command palette", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("composer-editor")).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-new-message").click();
    await expect(page.getByTestId("new-message-modal")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-browse-channels").click();
    await expect(page.getByTestId("channel-browser")).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-home").click();
    await expect(page.getByTestId("rail-home")).toHaveClass(/active/);

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-dms").click();
    await expect(page.getByTestId("dms-header")).toBeVisible();
  });

  test("offers current-channel actions only in the command palette", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("composer-editor")).toBeVisible();

    await page.keyboard.press("Control+k");
    await expect(page.getByText("Current channel", { exact: true })).toBeVisible();
    expect(await page.getByTestId("search-action-view-files").evaluate((element) => {
      const commands = document.querySelector(".search-section:last-of-type");
      return element.getBoundingClientRect().top < commands.getBoundingClientRect().top;
    })).toBe(true);
    await page.getByTestId("search-action-view-members").click();
    await expect(page.getByTestId("members-panel")).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-view-files").click();
    await expect(page.getByTestId("files-panel")).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-view-pinned").click();
    await expect(page.getByTestId("pinned-panel")).toBeVisible();
  });

  test("limits channel commands to eligible channel contexts", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);
    await expect(page.getByTestId("composer-editor")).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-add-people").click();
    await expect(page.getByTestId("add-people-modal")).toBeVisible();
    await page.getByTestId("add-people-done").click();

    await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
    await expect(page.getByTestId("composer-editor")).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("search-action-add-people")).toHaveCount(0);

    await page.getByTestId("search-action-new-message").click();
    const recipientSearch = page.getByTestId("new-message-search-input");
    await recipientSearch.pressSequentially(fixture.bob.username);
    await recipientSearch.press("Enter");
    const composer = page.getByTestId("new-message-modal").getByTestId("composer-editor");
    await recipientSearch.press("Tab");
    await expect(composer).toBeFocused();
    await composer.fill(`Open DM ${fixture.suffix}`);
    await composer.press("Enter");
    await expect(page.getByTestId("new-message-modal")).toBeHidden();

    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("quick-switcher-current-section")).toHaveCount(0);
  });

  test("hands command focus to form fields, not feed headers", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("composer-editor")).toBeVisible();

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-create-channel").click();
    await expect(page.getByTestId("create-channel-name")).toBeFocused();
    await page.getByTestId("create-channel-cancel").click();

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-activity").click();
    const activityHeader = page.getByTestId("activity-header");
    await expect(activityHeader).toBeVisible();
    await expect(activityHeader).not.toHaveAttribute("tabindex");
    await expect(activityHeader).not.toBeFocused();

    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("quick-switcher-current-section")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+k");
    await page.getByTestId("search-action-saved").click();
    const savedHeader = page.getByTestId("saved-header");
    await expect(savedHeader).toBeVisible();
    await expect(savedHeader).not.toHaveAttribute("tabindex");
    await expect(savedHeader).not.toBeFocused();
  });

  test("navigates to every primary view and opens a new DM", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("composer-editor")).toBeVisible();
    await page.keyboard.press("Control+Shift+Space");
    await expect(page.getByTestId("composer-editor")).toBeFocused();

    await page.keyboard.press("Control+Shift+o");
    await expect(page.getByTestId("channel-browser")).toBeVisible();

    await page.keyboard.press("Control+Shift+c");
    await expect(page.getByTestId("create-channel-modal")).toBeVisible();
    await page.getByTestId("create-channel-cancel").click();

    await page.keyboard.press("Control+Shift+h");
    await expect(page.getByTestId("rail-home")).toHaveClass(/active/);

    await page.keyboard.press("Control+Shift+d");
    await expect(page.getByTestId("dms-header")).toBeVisible();
    await expect(page.getByTestId("rail-dms")).toHaveClass(/active/);

    await page.keyboard.press("Control+Shift+a");
    await expect(page.getByTestId("activity-header")).toBeVisible();
    await expect(page.getByTestId("rail-activity")).toHaveClass(/active/);
    await expect(page.getByTestId("activity-header")).not.toHaveAttribute("tabindex");
    await expect(page.getByTestId("activity-header")).not.toBeFocused();

    await page.keyboard.press("Control+Shift+s");
    await expect(page.getByTestId("saved-header")).toBeVisible();
    await expect(page.getByTestId("rail-saved")).toHaveClass(/active/);
    await expect(page.getByTestId("saved-header")).not.toHaveAttribute("tabindex");
    await expect(page.getByTestId("saved-header")).not.toBeFocused();
    const savedItem = page.getByTestId("saved-item").first();
    await expect(savedItem).toBeVisible();
    await savedItem.getByRole("button", { name: "Remove from saved" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute("data-testid") !== "saved-header";
    })).toBe(true);

    await page.keyboard.press("Control+Shift+m");
    await expect(page.getByTestId("new-message-modal")).toBeVisible();
    await expect(page.getByTestId("new-message-search-input")).toBeFocused();
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+,");
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(page.getByTestId("settings-page")).toBeVisible();
  });

  test("focuses the thread composer when a thread is open", async ({ page }) => {
    await page.goto("/");
    const source = messageById(page, fixture.messages.searchHit.id);
    const reply = page.getByTestId(`message-${fixture.messages.searchHit.id}-reply`);
    await source.focus();
    await page.keyboard.press("Enter");
    await expect(reply).toBeVisible();
    await reply.focus();
    await page.keyboard.press("Enter");

    const thread = page.getByTestId("thread-panel");
    await expect(thread).toBeVisible();
    const threadComposer = thread.getByTestId("composer-editor");
    await expect(threadComposer).toBeFocused();
    await page.keyboard.press("Control+Shift+Space");
    await expect(threadComposer).toBeFocused();
  });

  test("uses search arrows, Enter, Tab filter completion, and Escape", async ({ page }) => {
    await page.goto("/");
    const search = page.getByTestId("search-input");

    await search.fill(fixture.projectChannel.name);
    await expect(page.getByTestId(`search-channel-${fixture.projectChannel.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)).toBeVisible();
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

    await search.fill("in:gen");
    await expect(page.getByTestId("search-channel-general")).toBeVisible();
    await search.press("Tab");
    await expect(search).toHaveValue("in:general ");
    await search.press("Escape");
    await expect(page.locator(".search-dropdown")).toBeHidden();
  });

  test("uses search result arrows and Enter to open a message", async ({ page }) => {
    const token = fixture.messages.searchHit.body.match(/only-token-[^ ]+/)?.[0];
    expect(token).toBeTruthy();
    await page.goto(`/search?q=${encodeURIComponent(`${token || ""} in:${fixture.generalChannel.name}`)}`);

    const pane = page.getByTestId("search-results-pane");
    await expect(pane).toBeFocused();
    await expect(page.getByTestId("search-result").first()).toBeVisible();
    await pane.press("ArrowDown");
    await pane.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/channels/${fixture.generalChannel.id}\\?message=${fixture.messages.searchHit.id}`)
    );
    await expect(messageById(page, fixture.messages.searchHit.id)).toBeVisible();
  });

  test("uses composer send, newline, mention navigation, and Escape", async ({ page }) => {
    await page.goto("/");
    const editor = page.getByTestId("composer-editor");

    const body = `Shortcut send ${fixture.suffix}`;
    await editor.fill(body);
    await editor.press("Enter");
    await expect(page.locator(".message").filter({ hasText: body })).toBeVisible();

    await editor.fill("first line");
    await editor.press("Shift+Enter");
    await editor.type("second line");
    await expect(editor.locator("br")).toHaveCount(1);

    await editor.fill(`@${fixture.bob.username}`);
    await expect(page.locator(".mention-popup")).toBeVisible();
    await editor.press("ArrowDown");
    await editor.press("Tab");
    await expect(editor).toContainText(`@${fixture.bob.username.slice(0, 5)}`);

    await editor.fill(`@${fixture.bob.username}`);
    await expect(page.locator(".mention-popup")).toBeVisible();
    await editor.press("Escape");
    await expect(page.locator(".mention-popup")).toBeHidden();
  });

  test("cancels message editing with Escape", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}?message=${fixture.messages.searchHit.id}`);
    const message = messageById(page, fixture.messages.searchHit.id);
    await expect(message).toBeVisible();
    await message.hover();
    await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
    await page.getByRole("menuitem", { name: "Edit message" }).click();
    await expect(page.getByTestId("composer-editing")).toBeVisible();
    await page.getByTestId("composer-editor").press("Escape");
    await expect(page.getByTestId("composer-editing")).toBeHidden();
  });

  test("opens a DM and sends a message without pointer input", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("composer-editor")).toBeVisible();
    await page.keyboard.press("Control+Shift+M");

    const recipientSearch = page.getByTestId("new-message-search-input");
    await expect(recipientSearch).toBeFocused();
    await recipientSearch.pressSequentially(fixture.bob.username);
    await recipientSearch.press("Enter");

    const editor = page.getByTestId("new-message-modal").getByTestId("composer-editor");
    await expect(editor).toBeEditable();
    await expect(recipientSearch).toBeFocused();
    await recipientSearch.press("Tab");
    await expect(editor).toBeFocused();
    const body = `Keyboard-only DM ${fixture.suffix}`;
    await page.keyboard.type(body);
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("new-message-modal")).toBeHidden();
    await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
    await expect(page.locator(".message").filter({ hasText: body })).toBeVisible();
  });

  test("searches into a conversation and returns to the composer by keyboard", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+K");
    const search = page.getByTestId("search-input");
    await search.pressSequentially(fixture.projectChannel.name);
    await expect(page.getByTestId(`search-channel-${fixture.projectChannel.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)).toBeVisible();
    await search.press("ArrowDown");
    await search.press("Enter");

    await expect(page).toHaveURL(/\/channels\//);
    await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name, { timeout: 15_000 });
    await tabTo(page.getByTestId("channel-view").getByTestId("composer-editor"));
    const body = `Keyboard-only channel flow ${fixture.suffix}`;
    await page.keyboard.type(body);
    await page.keyboard.press("Enter");
    await expect(page.locator(".message").filter({ hasText: body })).toBeVisible();
  });
});
