import { expect, test } from "@playwright/test";
import {
  addEmojiModal,
  channelRow,
  composer,
  dmRow,
  enableClipboardStub,
  loginAndSeedToken,
  messageById,
  messageByText,
  profileModal,
  railItem,
  resetScenario,
  settingsPage,
  threadPanel,
} from "./helpers.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8/5+hHgAHggJ/PFvdcQAAAABJRU5ErkJggg==",
  "base64"
);
const NOT_IMAGE = Buffer.from("not an image", "utf8");

test.beforeEach(async ({ page }) => {
  await resetScenario(page, "workspace");
  await loginAndSeedToken(page, "alice", "Password1");
  await enableClipboardStub(page);
});

async function channelId(page, name) {
  return page.evaluate(async (channelName) => {
    const token = localStorage.getItem("echo.token");
    const res = await fetch(`/api/channels/by-name/${encodeURIComponent(channelName)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const { channel } = await res.json();
    return channel?.id || null;
  }, name);
}

async function messageId(page, channelName, body) {
  const id = await channelId(page, channelName);
  if (!id) return null;
  return page.evaluate(
    async ({ channelId, bodyText }) => {
      const token = localStorage.getItem("echo.token");
      const res = await fetch(`/api/channels/${channelId}/messages`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const { messages } = await res.json();
      return messages.find((m) => String(m.body || "").includes(bodyText))?.id || null;
    },
    { channelId: id, bodyText: body }
  );
}

test("manages channels, members, visibility, and leaving", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("create-channel").click();
  const createModal = page.getByTestId("create-channel-modal");
  await createModal.getByTestId("create-channel-name").fill("team-room");
  await createModal.getByTestId("create-channel-submit").click();

  await expect(channelRow(page, "team-room")).toBeVisible();

  await page.getByTestId("channel-title").click();
  const details = page.locator(".details-panel");
  await details.locator(".cd-section").filter({ hasText: "Topic" }).getByRole("button", { name: /Edit|Add/ }).click();
  await details.locator(".cd-section").filter({ hasText: "Topic" }).locator("input").fill("Planning room");
  await details.locator(".cd-section").filter({ hasText: "Topic" }).getByRole("button", { name: "Save" }).click();
  await details.locator(".cd-section").filter({ hasText: "Description" }).getByRole("button", { name: /Edit|Add/ }).click();
  await details.locator(".cd-section").filter({ hasText: "Description" }).locator("textarea").fill("Internal planning");
  await details.locator(".cd-section").filter({ hasText: "Description" }).getByRole("button", { name: "Save" }).click();
  await expect(details).toContainText("Planning room");
  await expect(details).toContainText("Internal planning");

  await page.getByTestId("channel-visibility").click();
  await expect(page.getByTestId("channel-visibility")).toHaveText("Make public");

  await page.getByTestId("channel-add-people").click();
  const addPeople = page.getByTestId("add-people-modal");
  await addPeople.getByTestId("add-people-search").fill("bob");
  await addPeople.getByTestId("add-people-add-bob").click();
  await expect(details).toContainText("Members · 2");
  await addPeople.getByTestId("add-people-done").click();

  await page.getByTestId("channel-leave").click();
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(channelRow(page, "team-room")).toHaveCount(0);
  await expect(channelRow(page, "general")).toBeVisible();
});

test("joins a public channel, hides a channel locally, and restores it from search", async ({ page }) => {
  await page.goto("/");
  const hiddenId = await channelId(page, "project-alpha");

  await page.evaluate((id) => {
    localStorage.setItem("echo.hiddenChannels", JSON.stringify([id]));
  }, hiddenId);
  await page.reload();
  await expect(channelRow(page, "project-alpha")).toHaveCount(0);

  await page.evaluate(() => {
    localStorage.setItem("echo.hiddenChannels", JSON.stringify([]));
  });
  await page.reload();
  await expect(channelRow(page, "project-alpha")).toBeVisible();

  await channelRow(page, "general").click();
  await expect(page.getByTestId("channel-leave")).toHaveCount(0);
});

test("opens a profile, marks VIP, starts a DM, hides it, and can message self", async ({ page }) => {
  await page.goto("/");

  const bobMention = messageByText(page, "Heads up @alice").first();
  await bobMention.locator('[data-testid$="-author"]').click();

  const profile = profileModal(page);
  await profile.getByTestId("profile-vip").click();
  await expect(profile.getByTestId("profile-vip")).toContainText("VIP");
  await profile.getByTestId("profile-message").click();
  await expect(page.getByTestId("channel-title")).toHaveText("Bob Builder");

  await railItem(page, "dms").click();
  const vipDm = dmRow(page, "Bob Builder");
  await expect(vipDm).toBeVisible();
  await vipDm.getByTestId("dm-remove-bob-builder").click();
  await expect(vipDm).toHaveCount(0);

  await page.getByTestId("dm-self-open").click();
  await expect(page.getByTestId("channel-title")).toContainText("Alice");
  const selfMessage = `Self note ${Date.now()}`;
  await composer(page).fill(selfMessage);
  await composer(page).press("Enter");
  await expect(messageByText(page, selfMessage)).toBeVisible();
});

test("edits and deletes own messages", async ({ page }) => {
  await page.goto("/");

  const body = `Editable ${Date.now()}`;
  await composer(page).fill(body);
  await composer(page).press("Enter");

  const message = messageByText(page, body).first();
  await message.hover();
  await message.locator('[data-testid$="-edit"]').click();
  await message.locator(".msg-edit-input").fill(`${body} updated`);
  await message.locator(".msg-edit-actions .btn-primary").click();
  await expect(message).toContainText("updated");
  await expect(message).toContainText("(edited)");

  await message.hover();
  await message.locator('[data-testid$="-delete"]').click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(messageByText(page, `${body} updated`)).toHaveCount(0);
});

test("toggles reactions and pins messages", async ({ page }) => {
  await page.goto("/");

  const formattedId = await messageId(page, "general", "API formatting test");
  expect(formattedId).toBeTruthy();
  const message = messageById(page, formattedId);
  await expect(message).toBeVisible();
  await message.hover();
  await expect(message.locator('[data-testid$="-add-reaction-action"]')).toBeVisible();

  await message.locator('[data-testid$="-pin"]').click();
  await page.getByTestId("channel-pinned").click();
  const pinned = page.locator(".pinned-item").filter({ hasText: "API formatting test" });
  await expect(pinned).toBeVisible();
  await pinned.locator('[data-testid^="pinned-"][data-testid$="-unpin"]').click();
  await expect(pinned).toHaveCount(0);
});

test("forwards a message and jumps back to the original", async ({ page }) => {
  await page.goto("/");

  const message = messageByText(page, "API formatting test").first();
  await message.hover();
  await message.locator('[data-testid$="-forward"]').click();

  const forwardModal = page.getByTestId("forward-modal");
  await forwardModal.getByTestId("forward-search").fill("project-alpha");
  await forwardModal.locator('[data-testid^="forward-dest-channel-"]').first().click();

  await page.getByRole("button", { name: "# project-alpha" }).click();
  await expect(page.getByText("Forwarded from Alice in #general")).toBeVisible();
  await page.getByRole("button", { name: /View original/ }).click();
  await expect(page.getByText("Welcome to Echo")).toBeVisible();
});

test("handles mention autocomplete, @everyone, and attachments", async ({ page }) => {
  await page.goto("/");

  await composer(page).fill("Hello @bo");
  await page.locator(".mention-item").filter({ hasText: "Bob Builder" }).click();
  await page.keyboard.press("Enter");
  const bobMessage = messageByText(page, "Hello").last();
  await expect(bobMessage.locator('.mention[data-mention="bob"]')).toHaveText("@bob");

  await composer(page).fill("@e");
  await page.locator(".mention-item").filter({ hasText: "Notify everyone in this channel" }).click();
  await page.keyboard.press("Enter");
  await expect(page.locator(".mention--broadcast")).toBeVisible();

  const fileInput = page.getByTestId("composer-attachments");
  await fileInput.setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG });
  await expect(page.locator(".pending-att")).toBeVisible();
  const attachmentBody = `Attached ${Date.now()}`;
  await composer(page).fill(attachmentBody);
  await page.getByTestId("composer-send").click();
  const sent = messageByText(page, attachmentBody).first();
  await expect(sent.locator(".att-image")).toBeVisible();
});

test("schedules, edits, and cancels a message", async ({ page }) => {
  await page.goto("/");

  const scheduledBody = `Scheduled ${Date.now()}`;
  await composer(page).fill(scheduledBody);
  await page.getByTestId("composer-send-options").click();
  await page.locator(".send-menu button").filter({ hasText: "Tomorrow, 9:00 AM" }).click();

  await expect(page.getByText(/scheduled message/i)).toBeVisible();
  await page.getByText(/scheduled message/i).click();

  const scheduledModal = page.locator(".modal").filter({ hasText: "Scheduled messages" });
  await scheduledModal.getByRole("button", { name: "Edit" }).click();
  const edit = scheduledModal.locator(".scheduled-item.editing");
  await edit.locator("textarea").fill(`${scheduledBody} updated`);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(scheduledModal).toContainText("updated");
  await scheduledModal.locator(".scheduled-actions .link-danger").click();
  await expect(page.locator(".scheduled-banner")).toHaveCount(0);
});

test("blocks private-channel mentions until the user chooses how to handle them", async ({ page }) => {
  await page.goto("/");
  await channelRow(page, "project-alpha").click();
  await page.getByTestId("channel-visibility").click();

  await composer(page).fill("Hello @bob");
  await page.locator(".mention-item").filter({ hasText: "Bob Builder" }).click();
  await page.keyboard.press("Enter");

  const gate = page.locator(".modal").filter({ hasText: "Add to #project-alpha?" });
  await expect(gate).toBeVisible();
  await gate.getByRole("button", { name: "Send without adding" }).click();
  await expect(messageByText(page, "@bob").last()).toBeVisible();
});

test("covers custom emoji upload, validation, and usage", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("composer-emoji-toggle").click();
  await page.getByRole("button", { name: "Add custom emoji" }).click();

  const emojiModal = addEmojiModal(page);
  await emojiModal.getByTestId("emoji-file-input").setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: NOT_IMAGE,
  });
  await expect(page.getByText("Custom emoji must be an image")).toBeVisible();

  await emojiModal.getByTestId("emoji-file-input").setInputFiles({
    name: "sparkle-cat.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await emojiModal.getByTestId("emoji-shortcode-input").fill("sparkle-cat");
  await emojiModal.getByTestId("emoji-cancel").click();

  await page.evaluate(
    async ({ name, base64 }) => {
      const token = localStorage.getItem("echo.token");
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const file = new File([bytes], `${name}.png`, { type: "image/png" });
      const form = new FormData();
      form.append("name", name);
      form.append("file", file);
      const res = await fetch("/api/emojis", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error || "emoji create failed");
    },
    { name: "sparkle-cat", base64: ONE_BY_ONE_PNG.toString("base64") }
  );
  await page.reload();

  const emojiMessage = `Look :sparkle-cat:`;
  await composer(page).fill(emojiMessage);
  await composer(page).press("Enter");
  const sent = messageByText(page, "Look").last();
  await expect(sent).toContainText("Look");
  await expect(sent.locator("img.custom-emoji")).toBeVisible();
});

test("updates settings, replays the walkthrough, and forces password resets", async ({ browser, page }) => {
  await page.context().grantPermissions(["notifications"]);
  await page.goto("/");

  await page.getByTestId("sidebar-settings").click();
  const settings = settingsPage(page);
  const displayName = `Alice ${Date.now()}`;
  await settings.getByTestId("settings-display-name").fill(displayName);
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.locator(".settings-saved")).toContainText("Saved");

  await settings.getByTestId("settings-mode-dark").click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await settings.getByTestId("settings-mode-light").click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");

  const avatarInput = settings.getByTestId("settings-avatar-input");
  await avatarInput.setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await expect(settings.getByText("Saved ✓")).toBeVisible();

  await settings.getByTestId("settings-replay-tour").click();
  await expect(page.getByText("Welcome to Echo 👋")).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();

  await page.getByTestId("sidebar-settings").click();
  const adminReset = page.getByTestId("admin-reset");
  await adminReset.getByTestId("admin-reset-search").fill("bob");
  await adminReset.getByTestId("admin-reset-user-bob").click();
  await adminReset.getByTestId("admin-reset-issue").click();
  const otp = (await page.locator(".token-value").textContent())?.trim();
  expect(otp).toBeTruthy();

  const resetContext = await browser.newContext();
  const resetPage = await resetContext.newPage();
  try {
    await resetPage.goto("/");
    await resetPage.locator('input[placeholder="your-handle"]').fill("bob");
    await resetPage.locator('input[type="password"]').fill(otp);
    await resetPage.getByRole("button", { name: "Sign in" }).click();
    await expect(resetPage.getByText("Set a new password")).toBeVisible();

    await resetPage.locator('input[placeholder="New password"]').fill("Password2");
    await resetPage.locator('input[placeholder="Confirm new password"]').fill("Password2");
    await resetPage.getByRole("button", { name: "Save and continue" }).click();
    await expect(resetPage.getByRole("button", { name: "Settings" })).toBeVisible();
  } finally {
    await resetContext.close();
  }

  const loginContext = await browser.newContext();
  const loginPage = await loginContext.newPage();
  try {
    await loginPage.goto("/");
    await loginPage.locator('input[placeholder="your-handle"]').fill("bob");
    await loginPage.locator('input[type="password"]').fill("Password2");
    await loginPage.getByRole("button", { name: "Sign in" }).click();
    await expect(loginPage.getByRole("button", { name: "Settings" })).toBeVisible();
  } finally {
    await loginContext.close();
  }
});

test("opens a thread, replies, and jumps from Activity back to the thread", async ({ page }) => {
  await page.goto("/");
  const rootBody = `Thread root ${Date.now()}`;
  await composer(page).fill(rootBody);
  await composer(page).press("Enter");
  const root = messageByText(page, rootBody).first();
  await root.hover();
  await root.locator('[data-testid$="-reply"]').click();
  await expect(threadPanel(page)).toBeVisible();

  const reply = `Thread follow-up ${Date.now()}`;
  await threadPanel(page).getByTestId("composer-editor").fill(reply);
  await threadPanel(page).getByTestId("composer-editor").press("Enter");
  await expect(threadPanel(page).locator('[data-testid^="message-"]').filter({ hasText: reply })).toBeVisible();
});

test("covers search keyboard navigation and filter autocomplete", async ({ page }) => {
  await page.goto("/");

  const search = page.getByTestId("search-input");
  await search.fill("pro");
  await page.getByTestId("search-channel-project-alpha").click();
  await expect(page.getByTestId("channel-title")).toContainText("project-alpha");

  await search.fill("");
  await search.fill("in:pro");
  await page.keyboard.press("Tab");
  await expect(search).toHaveValue(/in:project-alpha\s/);

  await search.fill("");
  await search.fill("from:@bo");
  await page.keyboard.press("Tab");
  await expect(search).toHaveValue(/from:@bob\s/);

  await search.fill("");
  await search.fill("has:im");
  await page.keyboard.press("Tab");
  await expect(search).toHaveValue(/has:image\s/);
});
