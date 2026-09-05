import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function pressEnter(locator) {
  await locator.focus();
  await locator.press("Enter");
}

async function tabTo(page, locator) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await locator.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Could not reach locator with Tab");
}

test.describe("post-login forms are keyboard operable", () => {
  test("focuses the composer when entering a channel", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);
    await expect(page.getByTestId("composer-editor")).toBeFocused();
  });

  test("creates a channel and submits the display-name dialog with Enter", async ({ page }) => {
    await page.goto("/");

    await pressEnter(page.getByTestId("create-channel"));
    const channelName = `keyboard-form-${fixture.suffix}`.toLowerCase();
    const channelInput = page.getByTestId("create-channel-name");
    await expect(channelInput).toBeFocused();
    await channelInput.pressSequentially(channelName);
    await channelInput.press("Enter");
    await expect(page.getByTestId("channel-title")).toContainText(channelName);

    const originalName = fixture.alice.displayName;
    await pressEnter(page.getByRole("button", { name: "Update display name" }));
    const displayName = page.getByTestId("display-name-dialog-input");
    await displayName.press("ControlOrMeta+A");
    await displayName.pressSequentially(`Keyboard ${fixture.suffix}`);
    await displayName.press("Enter");
    await expect(page.getByTestId("display-name-dialog")).toBeHidden();

    await pressEnter(page.getByRole("button", { name: "Update display name" }));
    await displayName.press("ControlOrMeta+A");
    await displayName.pressSequentially(originalName);
    await displayName.press("Enter");
    await expect(page.getByTestId("display-name-dialog")).toBeHidden();
  });

  test("edits channel details, opens Add People, searches, and cancels with Escape", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);
    await pressEnter(page.getByTestId("channel-title"));

    const details = page.getByTestId("channel-details-dialog");
    await expect(details).toBeVisible();
    await details.getByRole("button", { name: "Edit", exact: true }).first().focus();
    await page.keyboard.press("Space");
    const topic = details.locator("input.settings-input").first();
    await topic.press("ControlOrMeta+A");
    await topic.pressSequentially(`Keyboard topic ${fixture.suffix}`);
    await pressEnter(details.getByRole("button", { name: "Save" }).first());
    await expect(details).toContainText(`Keyboard topic ${fixture.suffix}`);

    await pressEnter(details.getByRole("button", { name: "Add people to this channel" }));
    const addPeople = page.getByTestId("add-people-modal");
    await expect(addPeople).toBeVisible();
    const peopleSearch = page.getByTestId("add-people-search");
    await expect(peopleSearch).toBeFocused();
    await peopleSearch.pressSequentially(fixture.bob.username);
    await expect(addPeople).toContainText(fixture.bob.displayName);
    await peopleSearch.press("Escape");
    await expect(addPeople).toBeHidden();

    // Restore the fixture-owned channel metadata through the API. The UI flow
    // above is what this test covers; reopening the dialog here only adds a
    // race with the details panel's asynchronous refresh.
    await requestAsToken(page, fixture.alice.token, `/channels/${fixture.projectChannel.id}`, {
      method: "PATCH",
      body: {
        topic: "A very long planning topic that should truncate instead of pushing actions away",
      },
    });
  });

  test("fills and sends a survey using only keyboard navigation", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
    await pressEnter(page.getByTestId("composer-survey"));
    const modal = page.getByTestId("survey-modal");
    const question = modal.getByPlaceholder("What should we do?");
    await expect(question).toBeFocused();
    await question.pressSequentially(`Keyboard survey ${fixture.suffix}`);
    await modal.getByPlaceholder("Option 1").pressSequentially("Now");
    await modal.getByPlaceholder("Option 2").pressSequentially("Later");
    await pressEnter(modal.getByLabel("Allow multiple selections"));
    const send = modal.getByRole("button", { name: "Send survey" });
    await tabTo(page, send);
    await page.keyboard.press("Enter");
    await expect(page.locator(".survey-question").filter({ hasText: `Keyboard survey ${fixture.suffix}` })).toBeVisible();
  });

  test("Escape closes a modal before the channel panel behind it", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
    await page.getByRole("button", { name: "Pinned messages" }).click();
    const pinned = page.getByTestId("pinned-panel");
    await expect(pinned).toBeVisible();

    await page.getByTestId("start-dm").click();
    const newMessage = page.getByTestId("new-message-modal");
    await expect(newMessage).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(newMessage).toBeHidden();
    await expect(pinned).toBeVisible();
  });

  test("opens and cancels the schedule form from the composer by keyboard", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
    const editor = page.getByTestId("composer-editor");
    await editor.fill(`Keyboard scheduled ${fixture.suffix}`);
    await pressEnter(page.getByTestId("composer-send-options"));
    await pressEnter(page.getByRole("button", { name: "Custom time…" }));
    await expect(page.getByRole("dialog", { name: "Schedule message" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Schedule message" })).toBeHidden();

  });

  test("opens channel browser, settings, and custom-emoji forms with keyboard focus", async ({ page }) => {
    await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
    await pressEnter(page.getByTestId("browse-channels"));
    const browserSearch = page.getByTestId("channel-browser-search");
    await expect(browserSearch).toBeFocused();
    await browserSearch.pressSequentially("project");
    await browserSearch.press("Escape");

    await page.keyboard.press("Control+," );
    await expect(page).toHaveURL(/\/settings\/account$/);
    const settingsName = page.getByTestId("settings-display-name");
    await settingsName.focus();
    await expect(settingsName).toBeFocused();
    await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
    await pressEnter(page.getByTestId("composer-emoji-toggle"));
    await pressEnter(page.getByRole("button", { name: "Add custom emoji" }));
    await expect(page.getByTestId("add-emoji-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("add-emoji-modal")).toBeHidden();
  });
});
