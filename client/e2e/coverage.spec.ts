import { expect, test } from "@playwright/test";
import { enableClipboardStub, requestAsToken, seedWorkspaceFixture, slug } from "./helpers.js";

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

function toLocalDatetimeInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

test("manages channels, members, visibility, and leaving", async ({ page }) => {
  await page.goto("/");

  const channelName = `team-room-${fixture.suffix}`;
  await page.getByRole("button", { name: "Create channel" }).click();
  const createModal = page.locator(".modal").filter({ hasText: "Create a channel" });
  await createModal.getByPlaceholder("e.g. marketing").fill(channelName);
  await createModal.getByText("Private", { exact: true }).click();
  await createModal.getByRole("button", { name: "Create" }).click();

  await expect(page.getByTestId(`channel-row-${slug(channelName)}`)).toBeVisible();

  await page.locator(".ch-name-btn").click();
  let details = page.locator(".details-panel");
  await details.locator(".cd-section").filter({ hasText: "Topic" }).getByRole("button", { name: /Edit|Add/ }).click();
  await details.locator(".cd-section").filter({ hasText: "Topic" }).locator("input").fill("Planning room");
  await details.locator(".cd-section").filter({ hasText: "Topic" }).getByRole("button", { name: "Save" }).click();
  await details.locator(".cd-section").filter({ hasText: "Description" }).getByRole("button", { name: /Edit|Add/ }).click();
  await details.locator(".cd-section").filter({ hasText: "Description" }).locator("textarea").fill("Internal planning");
  await details.locator(".cd-section").filter({ hasText: "Description" }).getByRole("button", { name: "Save" }).click();
  await expect(details).toContainText("Planning room");
  await expect(details).toContainText("Internal planning");

  await details.getByRole("button", { name: "Close channel details" }).click();
  await expect(page.getByRole("button", { name: "Make public" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make private" })).toHaveCount(0);
  await page.getByRole("button", { name: "Make public" }).click();
  await expect(page.getByRole("button", { name: "Make public" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Make private" })).toHaveCount(0);

  await page.locator(".ch-name-btn").click();
  details = page.locator(".details-panel");
  await details.getByRole("button", { name: "Add people" }).click();
  const addPeople = page.getByTestId("add-people-modal");
  await addPeople.getByPlaceholder("Search people").fill(fixture.bob.username);
  await addPeople.getByTestId(`add-people-add-${fixture.bob.username}`).click();
  await addPeople.getByTestId("add-people-done").click();
  await expect(details).toContainText(/Members ·\s*2/);

  await details.getByRole("button", { name: "Close channel details" }).click();
  await page.getByRole("button", { name: "Leave channel" }).click();
  const managerModal = page.locator(".manager-modal");
  await managerModal.getByTestId("leave-manager-search").fill(fixture.bob.username);
  await managerModal.locator(".manager-candidate").click();
  const leaveResponse = page.waitForResponse(
    (response) => response.url().includes("/api/channels/") && response.url().endsWith("/leave") && response.request().method() === "POST"
  );
  await managerModal.getByRole("button", { name: "Transfer & leave" }).click();
  await expect((await leaveResponse).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByTestId(`channel-row-${slug(channelName)}`)).toHaveCount(0);
  await expect(page.getByTestId("channel-row-general")).toBeVisible();
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

test("opens a profile, marks VIP, starts a DM, protects it, and can message self", async ({ page }) => {
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
  await expect(vipDm.getByTitle("Remove conversation")).toHaveCount(0);

  await page.locator(".dm-self .dm-open").click();
  await expect(page.locator(".channel-header .ch-name")).toContainText(fixture.alice.displayName);
  const selfMessage = `Self note ${Date.now()}`;
  await page.locator(".composer-editor").fill(selfMessage);
  await page.locator(".composer-editor").press("Enter");
  await expect(page.locator(".message").filter({ hasText: selfMessage })).toBeVisible();
});

test("edits and deletes own messages", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId(`channel-row-${slug(fixture.generalChannel.name)}`).click();

  const body = `Editable ${Date.now()}`;
  const composer = page.locator(".composer-editor");
  await composer.fill(body);
  await composer.press("Enter");

  const message = page.locator(".message").filter({ hasText: body }).first();
  await message.hover();
  await page.locator('[data-message-actions="true"]').getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Edit message" }).click();
  await message.locator(".msg-edit-input").fill(`${body} updated`);
  await message.locator(".msg-edit-actions .btn-primary").click();
  await expect(message).toContainText("updated");
  await expect(message).toContainText("(edited)");

  await message.hover();
  await page.locator('[data-message-actions="true"]').getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Delete message" }).click();
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
  await expect(page.locator('[data-message-actions="true"] button[title="Add reaction"]')).toBeVisible();

  await page.locator('[data-message-actions="true"]').getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Pin message" }).click();
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
  await page.locator('[data-message-actions="true"]').getByTitle("Forward message").click();

  const forwardModal = page.locator(".modal").filter({ hasText: "Forward message" });
  await forwardModal
    .getByPlaceholder("Search channels and people")
    .fill(fixture.projectChannel.name);
  await forwardModal
    .locator(".forward-destination-row")
    .filter({ hasText: fixture.projectChannel.name })
    .first()
    .click();
  await forwardModal.getByTestId("forward-send-selected").click();

  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.locator(".forwarded-message-card")).toContainText("in #general");
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
  const everyoneMessage = page.locator(".message").filter({ hasText: "📣 @everyone" }).last();
  await expect(everyoneMessage.locator(".mention--broadcast")).toHaveText("📣 @everyone");

  const fileInput = page.locator(".composer input[type='file']").first();
  await fileInput.setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG });
  await expect(page.locator(".pending-att.is-image")).toBeVisible();
  const attachmentBody = `Attached ${Date.now()}`;
  await composer.fill(attachmentBody);
  await page.locator(".composer .send-btn").click();
  const sent = page.locator(".message").filter({ hasText: attachmentBody }).first();
  await expect(sent.locator(".att-image")).toBeVisible();

  const hebrewFilename = "מסמך בדיקה.txt";
  await fileInput.setInputFiles({
    name: hebrewFilename,
    mimeType: "text/plain",
    buffer: Buffer.from("בדיקה", "utf8"),
  });
  await expect(page.locator(".pending-file-name")).toHaveText(hebrewFilename);
  const hebrewAttachmentBody = `Hebrew filename ${Date.now()}`;
  await composer.fill(hebrewAttachmentBody);
  await page.locator(".composer .send-btn").click();
  const hebrewAttachment = page.locator(".message").filter({ hasText: hebrewAttachmentBody }).first();
  await expect(hebrewAttachment.locator(".att-file-name")).toHaveText(hebrewFilename);
});

test("explains the 10 MB attachment limit before uploading", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("composer-attachments").setInputFiles({
    name: "oversized.zip",
    mimeType: "application/zip",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });

  await expect(page.locator(".channel-view .error")).toContainText(
    "“oversized.zip” is too large. Files are limited to 10 MB each."
  );
  await expect(page.locator(".pending-att.uploading")).toHaveCount(0);
});

test("keeps the channel pinned to the bottom after sending an image attachment", async ({ page }) => {
  await page.goto("/");

  const generalId = await channelId(page, "general");
  expect(generalId).toBeTruthy();

  for (let i = 0; i < 18; i++) {
    await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: generalId,
        body: `Scroll filler ${fixture.suffix} ${i}`,
        externalKey: `scroll-filler-${fixture.suffix}-${i}`,
      },
    });
  }

  await requestAsToken(page, fixture.alice.token, `/channels/${generalId}/read`, { method: "POST" });

  await page.reload();
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  const scroller = page.locator(".messages");
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(async () => {
    return scroller.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  }).toBeLessThanOrEqual(30);
  const beforeGap = await scroller.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));

  const fileInput = page.locator(".composer input[type='file']").first();
  await fileInput.setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG });

  const body = `Scroll attach ${Date.now()}`;
  const composer = page.locator(".composer-editor");
  await composer.fill(body);
  await page.locator(".composer .send-btn").click();

  const sent = page.locator(".message").filter({ hasText: body }).last();
  await expect(sent.locator(".att-image")).toBeVisible();
  await expect.poll(async () => {
    return scroller.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  }).toBeLessThanOrEqual(beforeGap + 2);
});

test("schedules a message and clears the banner after delivery", async ({ page }) => {
  await page.goto("/");

  const composer = page.locator(".composer-editor");
  const scheduledBody = `Scheduled ${Date.now()}`;
  await composer.fill(scheduledBody);
  await page.getByRole("button", { name: "Send options" }).click();
  await page.locator(".send-menu button").filter({ hasText: "Custom time…" }).click();
  const scheduleInput = page.locator(".schedule-input");
  await scheduleInput.fill(toLocalDatetimeInput(new Date(Date.now() + 5_000)));
  await scheduleInput.press("Enter");

  await expect(page.getByText(/scheduled message/i)).toBeVisible();
  await expect(page.locator(".message").filter({ hasText: scheduledBody })).toHaveCount(0);
  await expect(page.locator(".scheduled-banner")).toBeVisible();
  await expect(page.locator(".scheduled-banner")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".message").filter({ hasText: scheduledBody })).toBeVisible();
});

test("shows invalid schedule times inside the schedule dialog", async ({ page }) => {
  await page.goto("/");

  await page.locator(".composer-editor").fill(`Invalid schedule ${Date.now()}`);
  await page.getByRole("button", { name: "Send options" }).click();
  await page.locator(".send-menu button").filter({ hasText: "Custom time…" }).click();

  const scheduleModal = page.locator(".modal").filter({ hasText: "Schedule message" });
  await scheduleModal.locator(".schedule-input").fill(toLocalDatetimeInput(new Date(Date.now() - 60_000)));
  await scheduleModal.getByRole("button", { name: "Schedule" }).click();

  await expect(scheduleModal.locator(".schedule-error")).toHaveText("Pick a time in the future.");
  await expect(page.locator(".channel-main > .error")).toHaveCount(0);
});

test("edits and cancels a scheduled message", async ({ page }) => {
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
  const privateChannelName = `private-mentions-${fixture.suffix}`;
  await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: privateChannelName, type: "private" },
  });
  await page.reload();
  await page.getByTestId(`channel-row-${slug(privateChannelName)}`).click();

  const composer = page.locator(".composer-editor");
  await composer.fill(`Hello @${fixture.bob.username}`);
  await page.locator(".mention-item").filter({ hasText: fixture.bob.displayName }).click();
  await page.keyboard.press("Enter");

  const gate = page.locator(".modal").filter({ hasText: `Add to #${privateChannelName}?` });
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
    const adminSearch = adminReset.getByPlaceholder("Find a user by name or username");
    await adminSearch.fill("@");
    await expect(adminReset.locator(".admin-user-results")).toBeVisible();
    await adminSearch.fill(`@${fixture.bob.username}`);
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
  await page.locator('[data-message-actions="true"]').getByTitle("Reply in thread").click();
  await expect(page.locator(".thread-panel")).toBeVisible();

  const reply = `Thread follow-up ${Date.now()}`;
  await page.locator(".thread-panel .composer-editor").fill(reply);
  await page.locator(".thread-panel .composer-editor").press("Enter");
  await expect(page.locator(".thread-panel .message").filter({ hasText: reply })).toBeVisible();
});

test("pins a message from inside a thread", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: `# ${fixture.projectChannel.name}` }).click();
  const root = page
    .locator(".message")
    .filter({ hasText: fixture.messages.threadRoot.body })
    .first();
  await root.hover();
  await page.locator('[data-message-actions="true"]').getByTitle("Reply in thread").click();
  await expect(page.locator(".thread-panel")).toBeVisible();

  const reply = page
    .locator(".thread-panel .message")
    .filter({ hasText: fixture.messages.threadReply.body })
    .first();
  await reply.hover();
  await page.locator('[data-message-actions="true"]').getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Pin message" }).click();

  await page.getByRole("button", { name: "Pinned messages" }).click();
  await expect(page.locator(".pinned-item").filter({ hasText: fixture.messages.threadReply.body })).toBeVisible();
});

test("opens the original thread when a thread reply is forwarded into the same channel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: `# ${fixture.projectChannel.name}` }).click();

  const root = page
    .locator(".message")
    .filter({ hasText: fixture.messages.threadRoot.body })
    .first();
  await root.hover();
  await page.locator('[data-message-actions="true"]').getByTitle("Reply in thread").click();
  await expect(page.locator(".thread-panel")).toBeVisible();

  const reply = page
    .locator(".thread-panel .message")
    .filter({ hasText: fixture.messages.threadReply.body })
    .first();
  await reply.hover();
  await page.locator('[data-message-actions="true"]').getByTitle("Forward message").click();

  const forwardModal = page.locator(".modal").filter({ hasText: "Forward message" });
  await forwardModal
    .getByPlaceholder("Search channels and people")
    .fill(fixture.projectChannel.name);
  await forwardModal
    .locator(".forward-destination-row")
    .filter({ hasText: fixture.projectChannel.name })
    .first()
    .click();
  await forwardModal.getByTestId("forward-send-selected").click();

  await page.getByTestId("thread-close").click();

  const forwarded = page
    .locator(".channel-main .messages .message")
    .filter({ hasText: fixture.messages.threadReply.body })
    .filter({ has: page.locator(".forwarded-message-card") })
    .last();
  await forwarded.hover();
  await forwarded.getByRole("button", { name: /View original/ }).click();

  await expect(page.locator(".thread-panel")).toBeVisible();
  await expect(page.locator(".thread-panel .message").filter({ hasText: fixture.messages.threadReply.body })).toBeVisible();
});

test("covers search keyboard navigation and filter autocomplete", async ({ page }) => {
  await page.goto("/");

  const search = page.getByTestId("search-input");
  await search.fill(fixture.projectChannel.name);
  await page.getByTestId(`search-channel-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);

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
