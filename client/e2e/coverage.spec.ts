import { expect, test } from "@playwright/test";
import { enableClipboardStub, registerUser, requestAsToken, seedWorkspaceFixture, slug, uniqueSuffix } from "./helpers.js";

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

function toLocalDatetimeInput(date, includeSeconds = false) {
  const pad = (n) => String(n).padStart(2, "0");
  const value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return includeSeconds ? `${value}:${pad(date.getSeconds())}` : value;
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

test("virtualizes the add-people directory while keeping all users reachable", async ({ page }) => {
  const suffix = uniqueSuffix("virtual");
  const indexCode = (index) => {
    let code = "";
    do {
      code = String.fromCharCode(97 + (index % 26)) + code;
      index = Math.floor(index / 26) - 1;
    } while (index >= 0);
    return code;
  };
  const people = await Promise.all(
    Array.from({ length: 36 }, (_, index) => registerUser(page, {
      username: `virtualperson${suffix.replace(/[^a-z]/gi, "")}${indexCode(index)}`,
      displayName: `Virtual${indexCode(index)}`,
    }))
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Create channel" }).click();
  const createModal = page.locator(".modal").filter({ hasText: "Create a channel" });
  const channelName = `virtual-room-${suffix}`.toLowerCase();
  await createModal.getByPlaceholder("e.g. marketing").fill(channelName);
  await createModal.getByRole("button", { name: "Create" }).click();
  await page.locator(".ch-name-btn").click();
  await page.getByRole("button", { name: "Add people" }).click();

  const addPeople = page.getByTestId("add-people-modal");
  const list = addPeople.locator(".people-list");
  const virtualContent = list.locator(".people-virtual-content");
  await expect(virtualContent).toHaveAttribute("style", /height:/);
  await list.evaluate((element) => element.scrollTop = element.scrollHeight);
  const lastPerson = people.at(-1);
  await expect(addPeople.getByTestId(`add-people-add-${lastPerson.username}`)).toBeVisible();

  await addPeople.getByTestId("add-people-search").fill(lastPerson.username);
  await expect(addPeople.getByTestId(`add-people-add-${lastPerson.username}`)).toBeVisible();
  await expect(list).toHaveJSProperty("scrollTop", 0);
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

test("opens a profile, marks Starred, starts a DM, protects it, and can message self", async ({ page }) => {
  await page.goto("/");

  const bobMention = page
    .locator(".message")
    .filter({ hasText: `Heads up @${fixture.alice.displayName}` })
    .first();
  await bobMention.locator(".author-btn").click();

  const profile = page.locator(".profile-modal");
  await profile.getByRole("button", { name: "Mark as Starred" }).click();
  await expect(profile.getByRole("button", { name: "Remove from Starred" })).toBeVisible();
  await profile.getByRole("button", { name: "Message" }).click();
  await expect(page.locator(".channel-header .ch-name")).toHaveText(fixture.bob.displayName);

  await page.getByRole("button", { name: "DMs" }).click();
  const starredDm = page.locator(".dm-rich").filter({ hasText: fixture.bob.displayName }).first();
  await expect(starredDm).toBeVisible();
  await expect(starredDm.getByTitle("Remove conversation")).toHaveCount(0);

  await page.locator(".dm-self .dm-open").click();
  await expect(page.locator(".channel-header .ch-name")).toContainText(fixture.alice.displayName);
  const selfMessage = `Self note ${Date.now()}`;
  await page.getByTestId("composer-editor").fill(selfMessage);
  await page.getByTestId("composer-editor").press("Enter");
  await expect(page.locator(".message").filter({ hasText: selfMessage })).toBeVisible();
});

test("edits and deletes own messages", async ({ page }) => {
  await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);

  const body = `Editable ${Date.now()}`;
  const composer = page.getByTestId("composer-editor");
  await composer.fill(body);
  await composer.press("Enter");

  const message = page.locator(".message").filter({ hasText: body }).first();
  await message.hover();
  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Edit message" }).click();
  const editComposer = page.getByTestId("composer-editor");
  await expect(page.getByTestId("composer-editing")).toBeVisible();
  await expect(editComposer).toHaveText(body);
  await editComposer.fill(`${body} updated`);
  await page.getByTestId("composer-send").click();
  await expect(message).toContainText("updated");
  await expect(message).toContainText("(edited)");

  await message.hover();
  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Delete message" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".message").filter({ hasText: `${body} updated` })).toHaveCount(0);
});

test("edits message attachments from the composer", async ({ page }) => {
  await page.goto("/");
  const body = "Attachment edit " + Date.now();
  const editor = page.getByTestId("composer-editor");
  await editor.fill(body);
  await page.locator(".composer input[type='file']").first().setInputFiles({
    name: "original.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await expect(page.locator('.pending-att img[alt="original.png"]')).toBeVisible();
  await expect(page.locator(".pending-att.uploading")).toHaveCount(0);
  await expect(page.getByTestId("composer-send")).toBeEnabled();
  await page.getByTestId("composer-send").click();

  const message = page.locator(".message").filter({ hasText: body }).first();
  await expect(message).toBeVisible();
  await expect(message.locator('[data-testid^="image-attachment-"]')).toHaveCount(1);
  await message.hover();
  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Edit message" }).click();
  await expect(page.locator('.pending-att img[alt="original.png"]')).toBeVisible();
  await page.locator('.pending-att img[alt="original.png"]').locator("xpath=..").getByTitle("Remove").click();
  await expect(page.locator('.pending-att img[alt="original.png"]')).toHaveCount(0);
  await page.locator(".composer input[type='file']").first().setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: ONE_BY_ONE_PNG,
  });
  await expect(page.locator('.pending-att img[alt="replacement.png"]')).toBeVisible();
  await page.getByTestId("composer-send").click();

  await expect(message.locator('[data-testid^="image-attachment-"]')).toHaveCount(1);
  await expect(message.locator('img[alt="replacement.png"]')).toBeVisible();
  await expect(message.locator('img[alt="original.png"]')).toHaveCount(0);
});

test("toggles reactions and pins messages", async ({ page }) => {
  await page.goto("/");

  const formattedId = await messageId(page, "general", fixture.messages.formatted.body);
  expect(formattedId).toBeTruthy();
  const message = page.locator(`.message[data-mid="${formattedId}"]`);
  await expect(message).toBeVisible();
  await message.hover();
  await expect(page.locator('[data-message-actions="true"] button[title="Add reaction"]')).toBeVisible();

  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Pin message" }).click();
  await page.getByRole("button", { name: "Pinned messages" }).click();
  const pinned = page.locator(".pinned-item").filter({ hasText: `API formatting test ${fixture.suffix}` });
  await expect(pinned).toBeVisible();
  await pinned.getByTestId(`pinned-${formattedId}-unpin`).click();
  await expect(pinned).toHaveCount(0);
});

test("forwards a message and jumps back to the original", async ({ page }) => {
  await page.goto("/");

  const message = page
    .locator(".message")
    .filter({ hasText: `API formatting test ${fixture.suffix}` })
    .first();
  await message.hover();
  await page.getByTestId(/-actions$/).getByTitle("Forward message").click();

  const forwardModal = page.getByRole("dialog");
  await forwardModal
    .getByPlaceholder("Search people and channels")
    .fill(fixture.projectChannel.name);
  await forwardModal
    .locator(".forward-destination-row")
    .filter({ hasText: fixture.projectChannel.name })
    .first()
    .click();
  await forwardModal.getByTestId("forward-send-selected").click();

  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  const forwardedCard = page.locator(".forwarded-message-card").filter({ hasText: "in #general" }).first();
  await expect(forwardedCard).toBeVisible();
  await forwardedCard.getByRole("button", { name: /View original/ }).click();
  await expect(page.getByText(`API formatting test ${fixture.suffix}`)).toBeVisible();
});

test("can view the same-channel original repeatedly after scrolling away", async ({ page }) => {
  await page.goto("/");

  const sourceBody = `API formatting test ${fixture.suffix}`;
  const source = page.locator(".message").filter({ hasText: sourceBody }).first();
  await source.hover();
  await page.getByTestId(/-actions$/).getByTitle("Forward message").click();

  const forwardModal = page.getByRole("dialog");
  await forwardModal
    .getByPlaceholder("Search people and channels")
    .fill(fixture.generalChannel.name);
  await forwardModal
    .locator(".forward-destination-row")
    .filter({ hasText: fixture.generalChannel.name })
    .first()
    .click();
  await forwardModal.getByTestId("forward-send-selected").click();

  const forwarded = page
    .locator(".channel-main .messages .message")
    .filter({ hasText: sourceBody })
    .filter({ has: page.locator(".forwarded-message-card") })
    .last();
  await expect(forwarded).toBeVisible();

  await forwarded.getByRole("button", { name: /View original/ }).click();
  await expect(source).toBeInViewport();

  const scroller = page.getByTestId("messages");
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(forwarded).toBeInViewport();

  await forwarded.getByRole("button", { name: /View original/ }).click();
  await expect(source).toBeInViewport();
});

test("handles mention autocomplete, @everyone, and attachments", async ({ page }) => {
  await page.goto("/");

  const composer = page.getByTestId("composer-editor");
  await composer.fill(`Hello @${fixture.bob.username}`);
  await expect(page.locator(".mention-popup")).toBeVisible();
  await page.locator(".mention-item").first().click();
  await page.keyboard.press("Enter");
  const bobMessage = page.locator(".message").filter({ hasText: "Hello" }).last();
  await expect(bobMessage.locator(`.mention[data-mention="${fixture.bob.username}"]`)).toHaveText(
    `@${fixture.bob.displayName}`
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

test("opens mention autocomplete after a soft line break", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByTestId("composer-editor");
  await composer.fill("First line");
  await composer.press("Shift+Enter");
  await composer.type(`@${fixture.bob.username}`);

  await expect(page.locator(".mention-popup")).toBeVisible();
  await expect(page.locator(".mention-item").filter({ hasText: fixture.bob.displayName })).toBeVisible();
});

test("pastes a clipboard image into the composer as an attachment", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByTestId("composer-editor");
  await composer.focus();
  await page.evaluate(
    ({ base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const clipboard = new DataTransfer();
      clipboard.items.add(new File([bytes], "clipboard.png", { type: "image/png" }));
      document.querySelector('[data-testid="composer-editor"]').dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: clipboard,
        })
      );
    },
    { base64: ONE_BY_ONE_PNG.toString("base64") }
  );

  await expect(page.locator('.pending-att.is-image img[alt="clipboard.png"]')).toBeVisible();
  await expect(page.locator(".pending-att.uploading")).toHaveCount(0);
  await expect(page.getByTestId("composer-send")).toBeEnabled();
  await page.getByTestId("composer-send").click();

  await expect(page.locator('.message .att-image img[alt="clipboard.png"]').last()).toBeVisible();
});

test("drags an image and a file anywhere on screen as composer attachments", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".composer")).toBeVisible();
  await page.evaluate(
    ({ imageBase64, textBase64 }) => {
      const bytes = (base64) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes(imageBase64)], "dragged.png", { type: "image/png" }));
      transfer.items.add(new File([bytes(textBase64)], "dragged.txt", { type: "text/plain" }));
      window.__composerDragTransfer = transfer;
      document.querySelector(".sidebar").dispatchEvent(
        new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer })
      );
    },
    {
      imageBase64: ONE_BY_ONE_PNG.toString("base64"),
      textBase64: NOT_IMAGE.toString("base64"),
    }
  );

  await expect(page.getByTestId("composer-drop-overlay")).toHaveText("Drop files to attach");
  const overlayBounds = await page.getByTestId("composer-drop-overlay").boundingBox();
  const viewport = page.viewportSize();
  expect(overlayBounds).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await page.evaluate(() => {
    document.querySelector(".sidebar").dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: window.__composerDragTransfer,
      })
    );
    delete window.__composerDragTransfer;
  });

  await expect(page.getByTestId("composer-drop-overlay")).toHaveCount(0);
  await expect(page.locator('.pending-att.is-image img[alt="dragged.png"]')).toBeVisible();
  await expect(page.locator(".pending-file-name")).toHaveText("dragged.txt");
  await expect(page.locator(".pending-att.uploading")).toHaveCount(0);
  await page.getByTestId("composer-send").click();

  await expect(page.locator('.message .att-image img[alt="dragged.png"]').last()).toBeVisible();
  await expect(page.locator(".message .att-file-name").filter({ hasText: "dragged.txt" }).last()).toBeVisible();
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

  const scroller = page.getByTestId("messages");
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
  const composer = page.getByTestId("composer-editor");
  await composer.fill(body);
  await page.locator(".composer .send-btn").click();

  const sent = page.locator(".message").filter({ hasText: body }).last();
  await expect(sent.locator(".att-image")).toBeVisible();
  await expect.poll(async () => {
    return scroller.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));
  }).toBeLessThanOrEqual(beforeGap + 2);
});

test("schedules a message and clears the banner after delivery", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");

  const composer = page.getByTestId("composer-editor");
  const scheduledBody = `Scheduled ${Date.now()}`;
  await composer.fill(scheduledBody);
  await page.getByRole("button", { name: "Send options" }).click();
  await page.locator(".send-menu button").filter({ hasText: "Custom time…" }).click();
  const scheduleModal = page.locator(".modal").filter({ hasText: "Schedule message" });
  const scheduleInput = scheduleModal.locator('input[type="datetime-local"]');
  // The production control deliberately rounds to five-minute slots and
  // disallows times less than a minute away. The scheduler itself accepts
  // second-precision future timestamps, so relax those browser-only guards
  // here to verify delivery without a fixed one-minute pause.
  await scheduleInput.evaluate((input) => {
    input.min = "";
    input.step = "1";
  });
  await scheduleInput.fill(toLocalDatetimeInput(new Date(Date.now() + 5_000), true));
  await scheduleModal.getByRole("button", { name: "Schedule" }).click();

  await expect(page.getByText(/scheduled message/i)).toBeVisible();
  await expect(page.locator(".message").filter({ hasText: scheduledBody })).toHaveCount(0);
  await expect(page.locator(".scheduled-banner")).toBeVisible();
  await expect(page.locator(".scheduled-banner")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator(".message").filter({ hasText: scheduledBody })).toBeVisible();
});

test("uses conversation wording for scheduled messages in DMs", async ({ page }) => {
  await page.goto("/");
  await page.locator(".dm-item").filter({ hasText: fixture.bob.displayName }).first().locator(".dm-open").click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.bob.displayName);
  const dmComposer = page.locator(".composer:not(.is-disabled) .composer-editor").first();
  const dmComposerForm = dmComposer.locator("xpath=ancestor::form");
  await expect(dmComposer).toHaveAttribute("contenteditable", "true");
  await dmComposer.fill(`DM scheduled ${Date.now()}`);
  await expect(dmComposer).not.toBeEmpty();
  await expect(dmComposerForm.getByTestId("composer-send")).toBeEnabled();
  const sendOptions = dmComposerForm.getByRole("button", { name: "Send options" });
  await expect(sendOptions).toBeEnabled();
  await sendOptions.click();
  await dmComposerForm.locator(".send-menu button:not(:disabled)").filter({ hasText: "Tomorrow, 09:00" }).click();
  await expect(page.locator(".scheduled-banner")).toContainText("for this conversation");
});

test("makes custom scheduling clear and submits the selected local date and time", async ({ page }) => {
  await page.goto("/");
  const body = `Custom schedule ${uniqueSuffix("e2e")}`;
  await page.getByTestId("composer-editor").fill(body);
  await page.getByRole("button", { name: "Send options" }).click();
  await page.locator(".send-menu button").filter({ hasText: "Custom time…" }).click();

  const modal = page.locator(".modal").filter({ hasText: "Schedule message" });
  const date = "2099-12-31";
  const time = "14:35";
  await expect(modal.getByText("Choose a quick option or pick an exact time. Echo uses your local time.")).toBeVisible();
  await modal.locator('input[type="datetime-local"]').fill(`${date}T${time}`);
  await expect(modal.locator(".schedule-preview-time")).toContainText("Dec 31");

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/scheduled") && response.request().method() === "POST"
  );
  await modal.getByRole("button", { name: "Schedule" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const request = response.request().postDataJSON();
  const expected = await page.evaluate(() => new Date("2099-12-31T14:35").toISOString());
  expect(request.scheduledFor).toBe(expected);
  expect(request.body).toBe(body);
  await expect(page.locator(".scheduled-banner")).toContainText("1 scheduled message");
});

test("shows invalid schedule times inside the schedule dialog", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("composer-editor").fill(`Invalid schedule ${Date.now()}`);
  await page.getByRole("button", { name: "Send options" }).click();
  await page.locator(".send-menu button").filter({ hasText: "Custom time…" }).click();

  const scheduleModal = page.locator(".modal").filter({ hasText: "Schedule message" });
  const invalidWhen = toLocalDatetimeInput(new Date(Date.now() - 60_000));
  await scheduleModal.locator('input[type="datetime-local"]').fill(invalidWhen);
  await scheduleModal.getByRole("button", { name: "Schedule" }).click();

  await expect(scheduleModal.locator(".schedule-error")).toHaveText("Pick a time in the future.");
  await expect(page.locator(".channel-main > .error")).toHaveCount(0);
});

test("edits and cancels a scheduled message", async ({ page }) => {
  await page.goto("/");

  const composer = page.getByTestId("composer-editor");
  const scheduledBody = `Scheduled ${Date.now()}`;
  await composer.fill(scheduledBody);
  await page.getByRole("button", { name: "Send options" }).click();
  await page.locator(".send-menu button").filter({ hasText: "Tomorrow, 09:00" }).click();

  await expect(page.getByText(/scheduled message/i)).toBeVisible();
  await page.getByText(/scheduled message/i).click();

  const scheduledModal = page.locator(".modal").filter({ hasText: "Scheduled messages" });
  const scheduledItem = scheduledModal.locator(".scheduled-item").filter({ hasText: scheduledBody }).first();
  await scheduledItem.getByRole("button", { name: "Edit" }).click();
  const edit = scheduledModal.locator(".scheduled-item.editing");
  await edit.locator("textarea").fill(`${scheduledBody} updated`);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(scheduledModal).toContainText("updated");
  await scheduledItem.locator(".scheduled-actions .link-danger").click();
  await expect(scheduledItem).toHaveCount(0);
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

  const composer = page.getByTestId("composer-editor");
  await composer.fill(`Hello @${fixture.bob.username}`);
  await page.locator(".mention-item").filter({ hasText: fixture.bob.displayName }).click();
  await page.keyboard.press("Enter");

  const gate = page.locator(".modal").filter({ hasText: `Add to #${privateChannelName}?` });
  await expect(gate).toBeVisible();
  await gate.getByRole("button", { name: "Send without adding" }).click();
  await expect(page.locator(".message").filter({ hasText: `@${fixture.bob.displayName}` }).last()).toBeVisible();
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

  const composer = page.getByTestId("composer-editor");
  const emojiMessage = `Look :${emojiName}:`;
  await composer.fill(emojiMessage);
  await composer.press("Enter");
  const sent = page.locator(".message").filter({ hasText: "Look" }).last();
  await expect(sent).toContainText("Look");
  await expect(sent.locator("img.custom-emoji")).toBeVisible();
});

test("closes the emoji picker when typing in the composer", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByTestId("composer-editor");
  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  await expect(page.locator(".emoji-popup-wrap")).toBeVisible();

  await composer.press("x");

  await expect(page.locator(".emoji-popup-wrap")).toBeHidden();
  await expect(composer).toHaveText("x");
});

test("closes the composer emoji picker after selecting an emoji", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByTestId("composer-editor");
  await page.getByRole("button", { name: "Emoji", exact: true }).click();
  const picker = page.locator(".emoji-popup-wrap");
  await expect(picker).toBeVisible();

  await picker.locator('button[aria-label="😀"]').first().click();

  await expect(picker).toBeHidden();
  await expect(composer).toContainText("😀");
});

test("opens a thread, replies, and jumps from Activity back to the thread", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByTestId("composer-editor");
  const rootBody = `Thread root ${Date.now()}`;
  await composer.fill(rootBody);
  await composer.press("Enter");
  const root = page.locator(".message").filter({ hasText: rootBody }).first();
  await expect(root).toBeVisible({ timeout: 15_000 });
  await root.hover();
  await page.getByTestId(/-actions$/).getByTitle("Reply in thread").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();

  const reply = `Thread follow-up ${Date.now()}`;
  await page.locator(".thread-panel .composer-editor").fill(reply);
  await page.locator(".thread-panel .composer-editor").press("Enter");
  await expect(page.locator(".thread-panel .message").filter({ hasText: reply })).toBeVisible();
});

test("pins a message from inside a thread", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("channel-title")).toContainText("general");
  await expect
    .poll(async () => {
      const result = await requestAsToken(
        page,
        fixture.alice.token,
        `/channels/${fixture.projectChannel.id}/messages/${fixture.messages.threadRoot.id}/thread`
      );
      return result.replies.some((message) => message.id === fixture.messages.threadReply.id);
    }, { timeout: 15_000 })
    .toBeTruthy();
  await page.getByRole("button", { name: `# ${fixture.projectChannel.name}` }).click();
  const root = page
    .locator(".message")
    .filter({ hasText: fixture.messages.threadRoot.body })
    .first();
  await expect(root).toBeVisible();
  await root.hover();
  const replyInThread = page
    .getByTestId(`message-${fixture.messages.threadRoot.id}-actions`)
    .getByTitle("Reply in thread");
  await expect(replyInThread).toBeVisible();
  await replyInThread.click({ force: true });
  await expect(page.getByTestId("thread-panel")).toBeVisible();

  const reply = page
    .locator(".thread-panel .message")
    .filter({ hasText: fixture.messages.threadReply.body })
    .first();
  await expect(reply).toBeVisible({ timeout: 30_000 });
  await reply.hover();
  await page.getByTestId(/-actions$/).getByTitle("More message actions").click();
  await page.getByRole("menuitem", { name: "Pin message" }).click();

  await page.getByRole("button", { name: "Pinned messages" }).click();
  await expect(page.locator(".pinned-item").filter({ hasText: fixture.messages.threadReply.body })).toBeVisible();
});

test("opens the original thread when a thread reply is forwarded into the same channel", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/channels/${encodeURIComponent(fixture.projectChannel.name)}`);

  const root = page
    .locator(".message")
    .filter({ hasText: fixture.messages.threadRoot.body })
    .first();
  await expect(root).toBeVisible();
  await root.hover();
  await page.getByTestId(/-actions$/).getByTitle("Reply in thread").click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();

  const reply = page
    .locator(".thread-panel .message")
    .filter({ hasText: fixture.messages.threadReply.body })
    .first();
  await expect(reply).toBeVisible({ timeout: 30_000 });
  await reply.hover();
  await page.getByTestId(/-actions$/).getByTitle("Forward message").click();

  const forwardModal = page.getByRole("dialog");
  await forwardModal
    .getByPlaceholder("Search people and channels")
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

  await expect(page.getByTestId("thread-panel")).toBeVisible();
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
