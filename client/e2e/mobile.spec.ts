import { expect, test } from "@playwright/test";
import { dmRow, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;
const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8/5+hHgAHggJ/PFvdcQAAAABJRU5ErkJggg==",
  "base64"
);

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
});

test("keeps the workspace full-screen and usable on a phone", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("rail-home")).toBeVisible();
  await expect(page.getByTestId("rail-dms")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveCount(0);
  const settingsBox = await page.getByTestId("rail-settings").boundingBox();
  const signOutBox = await page.getByTestId("rail-logout").boundingBox();
  expect(settingsBox).not.toBeNull();
  expect(signOutBox).not.toBeNull();
  expect(settingsBox.y).toBeLessThan(signOutBox.y);
  await page.getByTestId("rail-account").click();
  await expect(page.getByTestId("profile-picture-dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use this picture" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.width + 1);

  await expect(page.getByTestId("app-root")).toHaveAttribute("data-nav-open", "false");
  await expect(page.getByTestId("pane-search")).toBeVisible();
  await expect(page.getByTestId("sidebar")).toBeVisible();

  await page.getByTestId("browse-channels").click();
  await expect(page.getByTestId("channel-browser")).toBeVisible();
  await page.getByTestId("rail-home").click();
  await expect(page.getByTestId("sidebar")).toBeVisible();

  await page.getByTestId(`channel-row-${fixture.projectChannel.name}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
  const composerToolbar = page.getByTestId("composer").locator(".composer-toolbar");
  const toolbarWidth = await composerToolbar.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(toolbarWidth.scroll).toBeLessThanOrEqual(toolbarWidth.client + 1);
  await page.getByTitle("Attach files").click();
  await page.getByTestId("composer-attachments").setInputFiles({
    name: "mobile-attachment.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("mobile attachment"),
  });
  await expect(page.getByText("mobile-attachment.txt")).toBeVisible();

  await page.getByTestId("channel-title").click();
  const channelDetails = page.getByTestId("channel-details-dialog");
  await expect(channelDetails).toBeVisible();
  await expect(channelDetails.getByRole("button", { name: "Close channel details" })).toBeVisible();
  await page.getByRole("button", { name: "Close channel details" }).click();

  await page.getByTestId("channel-pinned").click();
  const pinnedPanel = page.getByTestId("pinned-panel");
  await expect(pinnedPanel).toBeVisible();
  await expect(pinnedPanel.getByRole("button", { name: "Close" })).toBeVisible();
  await pinnedPanel.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("channel-members").click();
  const membersPanel = page.getByTestId("members-panel");
  await expect(membersPanel).toBeVisible();
  const addPeople = membersPanel.getByRole("button", { name: "+ Add people" });
  if (await addPeople.isVisible().catch(() => false)) {
    await expect(addPeople).toBeFocused();
  } else {
    await expect(membersPanel.getByRole("textbox", { name: "Search members" })).toBeFocused();
  }
  await membersPanel.getByRole("button", { name: "Close members" }).click();

  await page.getByTestId(`message-${fixture.messages.threadRoot.id}-reply-count`).click();
  const threadPanel = page.getByTestId("thread-panel");
  await expect(threadPanel).toBeVisible();
  await expect(threadPanel.getByTestId("composer")).toBeVisible();
  await expect(page.getByTestId("rail-home")).toBeVisible();
  const threadBox = await threadPanel.boundingBox();
  expect(threadBox).not.toBeNull();
  await page.mouse.move(1, 1);
  await threadPanel.getByTestId("message-body").first().click();
  await expect(page.getByTestId(`message-${fixture.messages.threadRoot.id}-actions`)).toBeVisible();
  await page.getByTestId("thread-close").click();
  await expect(threadPanel).toHaveCount(0);

  await page.goBack();
  await expect(page.getByTestId("sidebar")).toBeVisible();

  await page.getByTestId("rail-dms").click();
  await expect(page.getByTestId("sidebar")).toBeVisible();
  await dmRow(page, fixture.bob.displayName).locator(".dm-open").click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  await page.getByTestId("channel-title").click();
  await expect(page.getByTestId("profile-modal")).toBeVisible();
  await page.getByTestId("profile-close").click();
  await page.getByTestId("rail-dms").click();
  await page.getByTestId("dm-self-open").click();
  await expect(page.getByTestId("messages")).toBeVisible();

  await page.getByTestId("rail-home").click();
  await expect(page.getByTestId("sidebar")).toBeVisible();

  await page.getByTestId("rail-logout").click();
  await expect(page.getByRole("heading", { name: "Sign out?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign out?" })).toHaveCount(0);
});

test("zooms the profile image with Ctrl-plus", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("rail-account").click();
  const dialog = page.getByTestId("profile-picture-dialog");
  const input = dialog.getByTestId("profile-picture-import-input");
  await input.setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG });

  const image = dialog.locator(".profile-picture-crop-image");
  await expect(image).toBeVisible();
  const initialWidth = await image.evaluate((element) => Number.parseFloat(getComputedStyle(element).width));

  await page.keyboard.press("Control+=");

  await expect.poll(async () => image.evaluate((element) => Number.parseFloat(getComputedStyle(element).width))).toBeGreaterThan(initialWidth);
});
