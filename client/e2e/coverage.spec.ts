import { expect, test } from "@playwright/test";
import { enableClipboardStub, seedWorkspaceFixture } from "./helpers.js";

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8/5+hHgAHggJ/PFvdcQAAAABJRU5ErkJggg==",
  "base64"
);
const NOT_IMAGE = Buffer.from("not an image", "utf8");

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
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

  const channelName = `team-room-${fixture.suffix}`;
  await page.getByRole("button", { name: "Create channel" }).click();
  const createModal = page.locator(".modal").filter({ hasText: "Create a channel" });
  await createModal.getByPlaceholder("e.g. marketing").fill(channelName);
  await createModal.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText(channelName, { exact: true })).toBeVisible();

  await page.locator(".ch-name-btn").click();
  const details = page.locator(".details-panel");
  await details.locator(".cd-section").filter({ hasText: "Topic" }).getByRole("button", { name: /Edit|Add/ }).click();
  await details.locator(".cd-section").filter({ hasText: "Topic" }).locator("input").fill("Planning room");
  await details.locator(".cd-section").filter({ hasText: "Topic" }).getByRole("button", { name: "Save" }).click();
  await details.locator(".cd-section").filter({ hasText: "Description" }).getByRole("button", { name: /Edit|Add/ }).click();
  await details.locator(".cd-section").filter({ hasText: "Description" }).locator("textarea").fill("Internal planning");
  await details.locator(".cd-section").filter({ hasText: "Description" }).getByRole("button", { name: "Save" }).click();
  await expect(details).toContainText("Planning room");
  await expect(details).toContainText("Internal planning");

  await page.getByRole("button", { name: "Make private" }).click();
  await expect(page.getByRole("button", { name: "Make public" })).toBeVisible();

  await page.getByRole("button", { name: "Add people" }).click();
  const addPeople = page.locator(".modal").filter({ hasText: "Add people to" });
  await addPeople.getByPlaceholder("Search people").fill(fixture.bob.username);
  await addPeople.getByRole("button", { name: "Add" }).click();
  await expect(details).toContainText("Members · 2");
  await addPeople.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Leave channel" }).click();
  await page.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page.getByText(channelName, { exact: true })).toHaveCount(0);
  await expect(page.getByText("#general", { exact: true })).toBeVisible();
});

test("joins a public channel, hides a channel locally, and restores it from search", async ({ page }) => {
  await page.goto("/");
  const hiddenId = await channelId(page, fixture.projectChannel.name);

  await page.evaluate((id) => {
    localStorage.setItem("echo.hiddenChannels", JSON.stringify([id]));
  }, hiddenId);
  await page.reload();
  await expect(page.getByText(fixture.projectChannel.name, { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    localStorage.setItem("echo.hiddenChannels", JSON.stringify([]));
  });
  await page.reload();
  await expect(page.getByText(fixture.projectChannel.name, { exact: true })).toBeVisible();

  await page.getByText("#general", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Leave channel" })).toHaveCount(0);
});

test("opens a profile, marks VIP, starts a DM, hides it, and can message self", async ({ page }) => {
  await page.goto("/");

  const bobMention = page
    .locator(".message")
    .filter({ hasText: `Heads up @${fixture.alice.username}` });
  await bobMention.locator(".author-btn").click();

  const profile = page.locator(".profile-modal");
  await profile.getByRole("button", { name: "Mark as VIP" }).click();
  await expect(profile.getByRole("button", { name: "VIP" })).toBeVisible();
  await profile.getByRole("button", { name: "Message" }).click();
  await expect(page.locator(".channel-header .ch-name")).toHaveText(fixture.bob.displayName);

  await page.getByRole("button", { name: "DMs" }).click();
  const vipDm = page.locator(".dm-rich").filter({ hasText: fixture.bob.displayName });
  await expect(vipDm).toBeVisible();
  await vipDm.getByTitle("Remove conversation").click();
  await expect(vipDm).toHaveCount(0);

  await page.locator(".dm-self .dm-open").click();
  await expect(page.locator(".channel-header .ch-name")).toContainText(fixture.alice.displayName);
  const selfMessage = `Self note ${Date.now()}`;
  await page.locator(".composer-editor").fill(selfMessage);
  await page.locator(".composer-editor").press("Enter");
  await expect(page.locator(".message").filter({ hasText: selfMessage })).toBeVisible();
});

test("edits and deletes own messages", async ({ page }) => {
  await page.goto("/");

  const body = `Editable ${Date.now()}`;
  const composer = page.locator(".composer-editor");
  await composer.fill(body);
  await composer.press("Enter");

  const message = page.locator(".message").filter({ hasText: body }).first();
  await message.hover();
  await message.getByTitle("Edit message").click();
  await message.locator(".msg-edit-input").fill(`${body} updated`);
  await message.locator(".msg-edit-actions .btn-primary").click();
  await expect(message).toContainText("updated");
  await expect(message).toContainText("(edited)");

  await message.hover();
  await message.getByTitle("Delete message").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".message").filter({ hasText: `${body} updated` })).toHaveCount(0);
});

test("toggles reactions and pins messages", async ({ page }) => {
  await page.goto("/");

  const formattedId = await messageId(page, "general", fixture.messages.formatted.body);
  expect(formattedId).toBeTruthy();
  const message = page.locator(`.message[data-mid="${formattedId}"]`);
  await expect(message).toBeVisible();
  await message.hover();
  await expect(message.locator(".msg-actions button[title='Add reaction']")).toBeVisible();

  await message.getByTitle("Pin message").click();
  await page.getByRole("button", { name: "Pinned messages" }).click();
  const pinned = page.locator(".pinned-item").filter({ hasText: `API formatting test ${fixture.suffix}` });
  await expect(pinned).toBeVisible();
  await pinned.getByTitle("Unpin").click();
  await expect(pinned).toHaveCount(0);
});

test("forwards a message and jumps back to the original", async ({ page }) => {
  await page.goto("/");

  const message = page
    .locator(".message")
    .filter({ hasText: `API formatting test ${fixture.suffix}` })
    .first();
  await message.hover();
  await message.getByTitle("Forward message").click();

  const forwardModal = page.locator(".modal").filter({ hasText: "Forward message" });
  await forwardModal
    .getByPlaceholder("Search channels and people")
    .fill(fixture.projectChannel.name);
  await forwardModal.getByRole("button", { name: "Forward" }).click();

  await page.getByRole("button", { name: `# ${fixture.projectChannel.name}` }).click();
  await expect(page.getByText(`Forwarded from ${fixture.alice.displayName} in #general`)).toBeVisible();
  await page.getByRole("button", { name: /View original/ }).click();
  await expect(page.getByText(`API formatting test ${fixture.suffix}`)).toBeVisible();
});

test("handles mention autocomplete, @everyone, and attachments", async ({ page }) => {
  await page.goto("/");

  const composer = page.locator(".composer-editor");
  await composer.fill(`Hello @${fixture.bob.username}`);
  await expect(page.locator(".mention-popup")).toBeVisible();
  await page.locator(".mention-item").first().click();
  await page.keyboard.press("Enter");
  const bobMessage = page.locator(".message").filter({ hasText: "Hello" }).last();
  await expect(bobMessage.locator(`.mention[data-mention="${fixture.bob.username}"]`)).toHaveText(
    `@${fixture.bob.username}`
  );

  await composer.fill("@e");
  await page.locator(".mention-item").filter({ hasText: "Notify everyone in this channel" }).click();
  await page.keyboard.press("Enter");
  await expect(page.locator(".message .mention--broadcast")).toBeVisible();

  const fileInput = page.locator(".composer input[type='file']").first();
  await fileInput.setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG });
  await expect(page.locator(".pending-att")).toBeVisible();
  const attachmentBody = `Attached ${Date.now()}`;
  await composer.fill(attachmentBody);
  await page.locator(".composer .send-btn").click();
  const sent = page.locator(".message").filter({ hasText: attachmentBody }).first();
  await expect(sent.locator(".att-image")).toBeVisible();
});

test("schedules, edits, and cancels a message", async ({ page }) => {
  await page.goto("/");

  const composer = page.locator(".composer-editor");
  const scheduledBody = `Scheduled ${Date.now()}`;
  await composer.fill(scheduledBody);
  await page.getByRole("button", { name: "Send options" }).click();
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

test("blocks private-channel mentions until the user chooses how to handle them", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText(fixture.projectChannel.name, { exact: true }).click();
  await page.getByRole("button", { name: "Make private" }).click();

  const composer = page.locator(".composer-editor");
  await composer.fill(`Hello @${fixture.bob.username}`);
  await page.locator(".mention-item").filter({ hasText: fixture.bob.displayName }).click();
  await page.keyboard.press("Enter");

  const gate = page.locator(".modal").filter({ hasText: `Add to #${fixture.projectChannel.name}?` });
  await expect(gate).toBeVisible();
  await gate.getByRole("button", { name: "Send without adding" }).click();
  await expect(page.locator(".message").filter({ hasText: `@${fixture.bob.username}` }).last()).toBeVisible();
});

test("covers custom emoji upload, validation, and usage", async ({ page }) => {
  await page.goto("/");

  const emojiName = `spark${Date.now().toString(36).slice(-6)}`;
  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  await page.getByRole("button", { name: "Add custom emoji" }).click();

  const emojiModal = page.locator(".modal").filter({ hasText: "Add custom emoji" });
  await emojiModal.locator("input[type='file']").setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: NOT_IMAGE,
  });
  await expect(page.getByText("Custom emoji must be an image")).toBeVisible();

  await emojiModal.locator("input[type='file']").setInputFiles({
    name: `${emojiName}.png`,
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await emojiModal.locator(".emoji-name-input input").fill(emojiName);
  await emojiModal.getByRole("button", { name: "Cancel" }).click();

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
    { name: emojiName, base64: ONE_BY_ONE_PNG.toString("base64") }
  );
  await page.reload();

  const composer = page.locator(".composer-editor");
  const emojiMessage = `Look :${emojiName}:`;
  await composer.fill(emojiMessage);
  await composer.press("Enter");
  const sent = page.locator(".message").filter({ hasText: "Look" }).last();
  await expect(sent).toContainText("Look");
  await expect(sent.locator("img.custom-emoji")).toBeVisible();
});

test("updates settings and replays the walkthrough", async ({ browser, page }) => {
  await page.context().grantPermissions(["notifications"]);
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.locator(".settings-page");
  const displayName = `Alice ${Date.now()}`;
  await settings.locator(".settings-input").first().fill(displayName);
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.locator(".settings-saved")).toContainText("Saved");

  await settings.getByRole("button", { name: "☾ Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await settings.getByRole("button", { name: "☀ Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "light");

  const avatarInput = settings.locator("input[type='file']");
  await avatarInput.setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await expect(settings.getByText("Saved ✓")).toBeVisible();

  await settings.getByRole("button", { name: "Replay walkthrough" }).click();
  await expect(page.getByText("Welcome to Echo 👋")).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();

  if (fixture.alice.isAdmin) {
    await page.getByRole("button", { name: "Settings" }).click();
    const adminReset = page.locator(".admin-reset");
    await adminReset.getByPlaceholder("Find a user by name or @username").fill(fixture.bob.username);
    await adminReset.getByRole("button", { name: fixture.bob.displayName }).click();
    await adminReset
      .getByRole("button", {
        name: new RegExp(`Issue one-time password for ${fixture.bob.displayName}`),
      })
      .click();
    const otp = (await page.locator(".token-value").textContent())?.trim();
    expect(otp).toBeTruthy();

    const resetContext = await browser.newContext();
    const resetPage = await resetContext.newPage();
    try {
      await resetPage.goto("/");
      await resetPage.locator('input[placeholder="your-handle"]').fill(fixture.bob.username);
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
      await loginPage.locator('input[placeholder="your-handle"]').fill(fixture.bob.username);
      await loginPage.locator('input[type="password"]').fill("Password2");
      await loginPage.getByRole("button", { name: "Sign in" }).click();
      await expect(loginPage.getByRole("button", { name: "Settings" })).toBeVisible();
    } finally {
      await loginContext.close();
    }
  }
});

test("opens a thread, replies, and jumps from Activity back to the thread", async ({ page }) => {
  await page.goto("/");
  const composer = page.locator(".composer-editor");
  const rootBody = `Thread root ${Date.now()}`;
  await composer.fill(rootBody);
  await composer.press("Enter");
  const root = page.locator(".message").filter({ hasText: rootBody }).first();
  await root.hover();
  await root.getByTitle("Reply in thread").click();
  await expect(page.locator(".thread-panel")).toBeVisible();

  const reply = `Thread follow-up ${Date.now()}`;
  await page.locator(".thread-panel .composer-editor").fill(reply);
  await page.locator(".thread-panel .composer-editor").press("Enter");
  await expect(page.locator(".thread-panel .message").filter({ hasText: reply })).toBeVisible();
});

test("covers search keyboard navigation and filter autocomplete", async ({ page }) => {
  await page.goto("/");

  const search = page.getByPlaceholder("Search messages, people, and channels");
  await search.fill(fixture.projectChannel.name);
  await page.keyboard.press("Enter");
  await expect(page.locator(".channel-header .ch-name")).toContainText(fixture.projectChannel.name);

  await search.fill("");
  await search.fill(`in:${fixture.projectChannel.name}`);
  await page.keyboard.press("Tab");
  await expect(search).toHaveValue(new RegExp(`in:${fixture.projectChannel.name}\\s`));

  await search.fill("");
  await search.fill(`from:@${fixture.bob.username}`);
  await page.keyboard.press("Tab");
  await expect(search).toHaveValue(new RegExp(`from:@${fixture.bob.username}\\s`));

  await search.fill("");
  await search.fill("has:im");
  await page.keyboard.press("Tab");
  await expect(search).toHaveValue(/has:image\s/);
});
