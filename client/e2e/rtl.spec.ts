import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, slug } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function selectRtl(page) {
  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByTestId("settings-language-he").click();
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "rtl");
}

async function selectInterfaceDirection(page, direction) {
  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByTestId(`settings-language-${direction === "rtl" ? "he" : "en"}`).click();
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", direction);
}

async function openProjectChannel(page) {
  await page.getByTestId("rail-home").click();
  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
}

function bobMentionOption(page) {
  return page.locator(".mention-item").filter({
    has: page.locator(".mi-handle").filter({ hasText: `@${fixture.bob.username}` }),
  }).first();
}

test("derives the interface direction from the selected language", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.getByTestId("channel-title")).toBeVisible();

  const chromeDirections = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector('[data-testid="channel-title"]')).direction,
    document: getComputedStyle(document.documentElement).direction,
  }));
  expect(chromeDirections.title).toBe("rtl");
  expect(chromeDirections.document).toBe("rtl");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "rtl");
});

test("migrates the legacy automatic direction preference to LTR", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("echo.interfaceDirection", "rtl");
    localStorage.setItem("echo.language", "en");
  });
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "ltr");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("echo.language"))).toBe("en");
});

test("keeps Hebrew paragraphs RTL, including after a line break", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const composer = page.getByTestId("composer-editor");
  await composer.fill("שלום עולם\nבדיקה נוספת");
  await expect.poll(() => composer.locator("p").count()).toBe(2);
  for (const paragraph of await composer.locator("p").all()) {
    await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
    await expect.poll(() => paragraph.evaluate((element) => getComputedStyle(element).textAlign)).toBe("start");
  }
});

test("inspects an English DM quote in the Hebrew interface", async ({ page }) => {
  const body = `adsfsd\nfdsfgsf ${fixture.suffix}`;
  const message = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.dmChannel.id, body, externalKey: `rtl-english-quote-${fixture.suffix}` },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto("/dms");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`).locator(".dm-open").click();

  const source = page.getByTestId(`message-${message.message.id}`);
  await source.hover();
  await page.getByTestId(`message-${message.message.id}-quote`).click();

  const quote = page.getByTestId("composer-editor").locator("blockquote");
  await expect(quote).toBeVisible();
  await expect(page.getByTestId("composer-editor")).toHaveAttribute("data-quote-direction", "ltr");
  await expect(quote).toContainText("Bob Builder said:");
  await expect(quote.locator(":scope > p")).toHaveCount(1);
  await expect.poll(() => quote.evaluate((element) => {
    const paragraph = element.querySelector("p");
    return {
      quoteDirection: getComputedStyle(element).direction,
      paragraphDirection: paragraph && getComputedStyle(paragraph).direction,
      paragraphAlign: paragraph && getComputedStyle(paragraph).textAlign,
      borderLeft: getComputedStyle(element).borderLeftWidth,
      borderRight: getComputedStyle(element).borderRightWidth,
    };
  })).toEqual({ quoteDirection: "ltr", paragraphDirection: "ltr", paragraphAlign: "left", borderLeft: "3px", borderRight: "0px" });
  await expect.poll(() => page.getByTestId("composer-editor").evaluate((editor) => {
    const replyParagraph = Array.from(editor.children).find((element) =>
      element.tagName === "P" && element.previousElementSibling?.tagName === "BLOCKQUOTE");
    return replyParagraph && {
      direction: getComputedStyle(replyParagraph).direction,
      textAlign: getComputedStyle(replyParagraph).textAlign,
    };
  })).toEqual({ direction: "ltr", textAlign: "left" });
  await page.screenshot({ path: "test-results/hebrew-english-dm-quote.png", fullPage: true });
});

test("keeps a quote from a Hebrew-named author on the RTL edge", async ({ page }) => {
  const authorName = "דנה כהן";
  const body = `An English message ${fixture.suffix}`;
  await requestAsToken(page, fixture.bob.token, "/users/me", {
    method: "PATCH",
    body: { displayName: authorName },
  });
  const message = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.dmChannel.id, body, externalKey: `rtl-hebrew-author-quote-${fixture.suffix}` },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto(`/dms/${fixture.dmChannel.id}`);

  const source = page.getByTestId(`message-${message.message.id}`);
  await source.hover();
  await page.getByTestId(`message-${message.message.id}-quote`).click();

  const composer = page.getByTestId("composer-editor");
  const quote = composer.locator("blockquote");
  await expect(quote).toContainText(`${authorName} said:`);
  await expect.poll(() => quote.evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    borderLeft: getComputedStyle(element).borderLeftWidth,
    borderRight: getComputedStyle(element).borderRightWidth,
  }))).toEqual({ direction: "rtl", borderLeft: "0px", borderRight: "3px" });
  await expect.poll(() => quote.evaluate((element) => {
    const quoteRect = element.getBoundingClientRect();
    const composerRect = element.closest(".composer-editor")?.getBoundingClientRect();
    return Math.abs(quoteRect.right - (composerRect?.right || 0));
  })).toBeLessThanOrEqual(8);
  await page.screenshot({ path: "test-results/hebrew-author-english-quote.png", fullPage: true });
  await requestAsToken(page, fixture.bob.token, "/users/me", {
    method: "PATCH",
    body: { displayName: fixture.bob.displayName },
  });
});

test("keeps a Hebrew DM quote compact at the RTL reading edge", async ({ page }) => {
  const body = `ציטוט עברי ${fixture.suffix}`;
  const message = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.dmChannel.id, body, externalKey: `rtl-hebrew-quote-${fixture.suffix}` },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto("/dms");
  await page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`).locator(".dm-open").click();

  const source = page.getByTestId(`message-${message.message.id}`);
  await source.hover();
  await page.getByTestId(`message-${message.message.id}-quote`).click();

  const quote = page.getByTestId("composer-editor").locator("blockquote");
  await expect(quote).toBeVisible();
  await expect.poll(() => quote.evaluate((element) => {
    const paragraph = element.querySelector("p");
    return {
      quoteDirection: getComputedStyle(element).direction,
      paragraphDirection: paragraph && getComputedStyle(paragraph).direction,
      borderLeft: getComputedStyle(element).borderLeftWidth,
      borderRight: getComputedStyle(element).borderRightWidth,
    };
  })).toEqual({ quoteDirection: "rtl", paragraphDirection: "rtl", borderLeft: "0px", borderRight: "3px" });
  await expect.poll(() => page.getByTestId("composer-editor").evaluate((editor) => {
    const replyParagraph = Array.from(editor.children).find((element) =>
      element.tagName === "P" && element.previousElementSibling?.tagName === "BLOCKQUOTE");
    return replyParagraph && {
      direction: getComputedStyle(replyParagraph).direction,
      textAlign: getComputedStyle(replyParagraph).textAlign,
    };
  })).toEqual({ direction: "rtl", textAlign: "right" });
  await page.screenshot({ path: "test-results/hebrew-hebrew-dm-quote.png", fullPage: true });
});

test("keeps an English quote created in the Hebrew composer left-to-right", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto("/dms");
  await page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`).locator(".dm-open").click();

  const composer = page.getByTestId("composer-editor");
  await composer.click();
  await page.getByTestId("composer-blockquote").click();
  await page.keyboard.type("Several English words");
  await page.keyboard.press("Enter");

  const quote = composer.locator("blockquote");
  await expect.poll(() => quote.evaluate((element) => {
    const paragraph = element.querySelector("p");
    return {
      quoteDirection: getComputedStyle(element).direction,
      paragraphDirection: paragraph && getComputedStyle(paragraph).direction,
      paragraphAlign: paragraph && getComputedStyle(paragraph).textAlign,
      borderLeft: getComputedStyle(element).borderLeftWidth,
      borderRight: getComputedStyle(element).borderRightWidth,
    };
  })).toEqual({ quoteDirection: "ltr", paragraphDirection: "ltr", paragraphAlign: "start", borderLeft: "3px", borderRight: "0px" });
  await expect.poll(() => quote.locator("p").last().evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "ltr", textAlign: "left" });
  await page.screenshot({ path: "test-results/hebrew-toolbar-english-quote.png", fullPage: true });
});

test("keeps RTL workspace dividers beside the rail", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await openProjectChannel(page);

  const expectRailFacingDivider = async (locator) => {
    await expect.poll(() => locator.evaluate((element) => ({
      left: getComputedStyle(element).borderLeftWidth,
      right: getComputedStyle(element).borderRightWidth,
    }))).toEqual({ left: "0px", right: "1px" });
  };

  await page.getByTestId(`message-${fixture.messages.threadRoot.id}-reply-count`).click();
  await expect(page.getByTestId("thread-panel")).toBeVisible();
  await expectRailFacingDivider(page.getByTestId("thread-panel"));
  await page.getByTestId("thread-close").click();

  await page.getByTestId("channel-members").click();
  await expect(page.getByTestId("members-panel")).toBeVisible();
  await expectRailFacingDivider(page.getByTestId("members-panel"));
  await page.getByTestId("members-panel").locator(":scope > header button").click();

  await page.getByTestId("rail-saved").click();
  await expect(page.locator(".workspace-frame:has(.app-nav.no-sidebar) > .chat-pane")).toBeVisible();
  await expectRailFacingDivider(page.locator(".workspace-frame:has(.app-nav.no-sidebar) > .chat-pane"));

  await page.getByTestId("rail-activity").click();
  await expectRailFacingDivider(page.locator(".workspace-frame:has(.app-nav.no-sidebar) > .chat-pane"));
  await page.screenshot({ path: "test-results/hebrew-activity-rail-divider.png", fullPage: true });
});

test("places Hebrew quote markers on the RTL side", async ({ page }) => {
  const quoteBody = `> ציטוט עברי ${fixture.suffix}`;
  await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body: quoteBody,
      externalKey: `rtl-quote-${fixture.suffix}`,
    },
  });

  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const message = page.locator(".message").filter({ hasText: `ציטוט עברי ${fixture.suffix}` }).last();
  const quote = message.locator("blockquote");
  await expect(quote).toBeVisible();
  await expect.poll(() => quote.evaluate((element) => ({
    borderRight: getComputedStyle(element).borderRightWidth,
    borderLeft: getComputedStyle(element).borderLeftWidth,
    paddingRight: getComputedStyle(element).paddingRight,
  }))).toEqual({ borderRight: "3px", borderLeft: "0px", paddingRight: "12px" });
});

test("keeps channel tags isolated in an RTL message", async ({ page }) => {
  const body = `שלום #${fixture.projectChannel.name} asdas ${fixture.suffix}`;
  await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body,
      externalKey: `rtl-channel-tag-${fixture.suffix}`,
    },
  });

  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const tag = page.locator(".message").filter({ hasText: body }).last().locator(".channel-tag");
  await expect.poll(() => tag.evaluate((element) => {
    const style = getComputedStyle(element);
    return { display: style.display, direction: style.direction, unicodeBidi: style.unicodeBidi };
  })).toEqual({ display: "inline-block", direction: "ltr", unicodeBidi: "isolate" });
});

test("anchors RTL quote and list structures on the right", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const composer = page.getByTestId("composer-editor");
  await page.getByTitle("ציטוט").click();
  await expect.poll(() => composer.locator("blockquote").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    borderRight: getComputedStyle(element).borderRightWidth,
    borderLeft: getComputedStyle(element).borderLeftWidth,
  }))).toEqual({ direction: "rtl", borderRight: "3px", borderLeft: "0px" });
  await expect.poll(() => composer.locator("blockquote > p").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "rtl", textAlign: "right" });

  await composer.pressSequentially("שורה בעברית");
  await composer.press("Enter");
  await expect.poll(() => composer.locator("blockquote").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    borderRight: getComputedStyle(element).borderRightWidth,
    borderLeft: getComputedStyle(element).borderLeftWidth,
  }))).toEqual({ direction: "rtl", borderRight: "3px", borderLeft: "0px" });
  await expect.poll(() => composer.locator("blockquote > p").last().evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "rtl", textAlign: "right" });

  await composer.fill("");
  await page.getByTitle("רשימת תבליטים").click();
  await expect.poll(() => composer.locator("ul").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");

  await composer.fill("");
  await page.getByTitle("רשימה ממוספרת").click();
  await expect.poll(() => composer.locator("ol").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");

  await page.reload();
  await openProjectChannel(page);
  const englishListComposer = page.getByTestId("composer-editor");
  await page.getByTitle("רשימה ממוספרת").click();
  await englishListComposer.type("English list item");
  await expect.poll(() => englishListComposer.locator("ol").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "ltr", textAlign: "start" });
  await expect.poll(() => englishListComposer.locator("ol li > p").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "ltr", textAlign: "left" });
});

test("keeps LTR list text beside the marker", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await openProjectChannel(page);

  const composer = page.getByTestId("composer-editor");
  await page.getByTitle("Bulleted list").click();
  await composer.type("English list item");
  await expect.poll(() => composer.locator("ul").evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
  await expect.poll(() => composer.locator("ul li > p").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "ltr", textAlign: "left" });
});

for (const listType of [
  { name: "bullet", title: { en: "Bulleted list", he: "רשימת תבליטים" }, selector: "ul" },
  { name: "numbered", title: { en: "Ordered list", he: "רשימה ממוספרת" }, selector: "ol" },
]) for (const listCase of [
  { name: "English list in RTL", interfaceDirection: "rtl", listDirection: "ltr", text: "English list item", itemDirection: "ltr", itemAlign: "left" },
  { name: "Hebrew list in RTL", interfaceDirection: "rtl", listDirection: "rtl", text: "טקסט עברי", itemDirection: "rtl", itemAlign: "right" },
  { name: "English list in LTR", interfaceDirection: "ltr", listDirection: "ltr", text: "English list item", itemDirection: "ltr", itemAlign: "left" },
  { name: "Hebrew list in LTR", interfaceDirection: "ltr", listDirection: "rtl", text: "טקסט עברי", itemDirection: "rtl", itemAlign: "right" },
]) {
  test(`keeps ${listCase.name} in a ${listType.name} list beside its marker`, async ({ page }) => {
    await page.goto(`/channels/${fixture.projectChannel.name}`);
    await selectInterfaceDirection(page, listCase.interfaceDirection);
    await openProjectChannel(page);

    const composer = page.getByTestId("composer-editor");
    await page.getByTitle(listType.title[listCase.interfaceDirection === "rtl" ? "he" : "en"]).click();
    await composer.type(listCase.text);

    await expect.poll(() => composer.locator(listType.selector).evaluate((element) => ({
      direction: getComputedStyle(element).direction,
      textAlign: getComputedStyle(element).textAlign,
    }))).toEqual({ direction: listCase.listDirection, textAlign: "start" });
    await expect.poll(() => composer.locator(`${listType.selector} li > p`).evaluate((element) => ({
      direction: getComputedStyle(element).direction,
      textAlign: getComputedStyle(element).textAlign,
    }))).toEqual({ direction: listCase.itemDirection, textAlign: listCase.itemAlign });
  });
}

test("anchors an empty Hebrew composer and mention popup to the RTL side", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const composer = page.getByTestId("composer-editor");
  await composer.fill("123 !?");
  await expect.poll(() => composer.locator("p").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "rtl", textAlign: "start" });

  await composer.fill("");
  await page.getByTitle("רשימת תבליטים").click();
  await composer.type("טקסט עברי");
  await expect.poll(() => composer.locator("li p").evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "rtl", textAlign: "right" });
  await composer.fill("");
  await expect.poll(() => composer.locator("p").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => composer.locator("p").evaluate((element) => getComputedStyle(element).textAlign)).toBe("right");

  await composer.fill("שלום @");
  const popup = page.locator(".mention-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toHaveClass(/mention-popup-rtl/);
  const [popupBox, composerBox, viewport] = await Promise.all([
    popup.boundingBox(),
    page.getByTestId("composer").boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);
  expect(popupBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(popupBox.x).toBeGreaterThanOrEqual(0);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(viewport.width);
  expect(Math.abs(popupBox.y + popupBox.height - composerBox.y)).toBeLessThan(20);
  await composer.fill("");
  await composer.type("@");
  await expect(page.locator(".mention-popup")).toBeVisible();
  const triggerGeometry = await page.evaluate(() => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const editor = document.querySelector('[data-testid="composer-editor"]');
    return { caretLeft: range?.left ?? 0, editorRight: editor?.getBoundingClientRect().right ?? 0 };
  });
  expect(triggerGeometry.caretLeft).toBeGreaterThan(triggerGeometry.editorRight - 120);
  await composer.type("b");
  const userMention = page.locator(".mention-item").filter({ hasText: "@" }).first();
  await expect(userMention).toBeVisible();
  await userMention.click();
  const selectedMention = composer.locator("[data-user-mention]");
  await expect(selectedMention).toBeVisible();
  const selectedGeometry = await selectedMention.boundingBox();
  const selectedEditor = await composer.boundingBox();
  expect(selectedGeometry).not.toBeNull();
  expect(selectedEditor).not.toBeNull();
  expect(selectedGeometry.x + selectedGeometry.width).toBeGreaterThan(selectedEditor.x + selectedEditor.width - 140);
});

test("places the RTL schedule dialog to the right of the mobile drawer", async ({ page }) => {
  await page.setViewportSize({ width: 742, height: 900 });
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  await page.getByTestId("composer-editor").fill("הודעה לתזמון");
  await page.getByTestId("composer-send-options").press("Enter");
  await page.getByRole("button", { name: "זמן מותאם…" }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "תזמון הודעה" });
  await expect(dialog).toBeVisible();
  const [box, viewport] = await Promise.all([
    dialog.boundingBox(),
    page.evaluate(() => ({
      width: window.innerWidth,
      drawerWidth: Math.min(300, window.innerWidth - 88),
    })),
  ]);
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(viewport.drawerWidth);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
});

test("keeps the RTL send-options menu above navigation", async ({ page }) => {
  await page.setViewportSize({ width: 742, height: 900 });
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  await page.getByTestId("composer-editor").fill("הודעה לתזמון");
  await page.getByTestId("composer-send-options").press("Enter");
  const menu = page.locator(".send-menu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(742);
  await expect.poll(() => menu.evaluate((element) => getComputedStyle(element).zIndex)).toBe("1000");
});

test("keeps the RTL schedule tooltip above the composer control", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const scheduleButton = page.getByTestId("composer-send-options");
  await scheduleButton.hover();
  const tooltip = page.locator(".echo-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveClass(/echo-tooltip-above/);
  await expect(tooltip).toHaveText("תזמון הודעה");
});

test("keeps the RTL schedule dialog out of the desktop navigation column", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  await page.getByTestId("composer-editor").fill("הודעה לתזמון בשולחן העבודה");
  await page.getByTestId("composer-send-options").press("Enter");
  await page.getByRole("button", { name: "זמן מותאם…" }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "תזמון הודעה" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(360);
});

test("keeps message actions RTL while a Hebrew message surface is RTL", async ({ page }) => {
  const hebrewBody = `הודעה עברית ${fixture.suffix}`;
  await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body: hebrewBody,
      externalKey: `rtl-actions-${fixture.suffix}`,
    },
  });
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const message = page.locator(".message").filter({ hasText: hebrewBody }).first();
  await expect.poll(() => message.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await message.hover();
  await page.locator(".message-more-action").first().click();
  const menu = page.locator(".msg-menu").last();
  await expect(menu).toHaveAttribute("dir", "rtl");
  await expect.poll(() => menu.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => menu.getByRole("menuitem").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("right");
});

test("keeps Hebrew reply metadata isolated from the RTL message body", async ({ page }) => {
  const rootBody = `שיחה עברית ${fixture.suffix}`;
  const root = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body: rootBody,
      externalKey: `rtl-thread-root-${fixture.suffix}`,
    },
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      parentId: root.message.id,
      body: "תגובה עברית",
      externalKey: `rtl-thread-reply-${fixture.suffix}`,
    },
  });
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const rootMessage = page.locator(".message").filter({ hasText: rootBody }).first();
  await expect(rootMessage).toBeVisible();
  const replyLink = rootMessage.locator(".thread-reply-link");
  await expect(replyLink).toBeVisible();
  await expect(replyLink).toHaveAttribute("dir", "ltr");
  await expect.poll(() => replyLink.evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
  await expect.poll(() => replyLink.evaluate((element) => getComputedStyle(element).unicodeBidi)).toBe("isolate");
});

test("isolates selected mentions in the RTL composer", async ({ page }) => {
  await page.goto("/channels/general");
  await selectRtl(page);
  await page.getByTestId("rail-home").click();
  await page.getByTestId("channel-row-general").click();

  const editor = page.getByTestId("composer-editor");
  await editor.fill("ערעהכגה גד @");
  await expect(page.locator(".mention-popup")).toBeVisible();
  await editor.type(fixture.bob.username);
  await bobMentionOption(page).click();
  await editor.type(" sdfvsdfsdfsdfsdfsdfsdfsd");

  const mention = editor.locator("[data-user-mention]");
  await expect(mention).toHaveCSS("display", "inline-block");
  await expect(mention).toHaveCSS("unicode-bidi", "isolate");
  await expect(mention).toHaveCSS("white-space", "nowrap");
  await expect(mention.locator("bdi")).toHaveCount(1);
  await expect(mention.locator("bdi")).toHaveCSS("direction", "ltr");
  await expect(mention.locator("bdi")).toHaveCSS("unicode-bidi", "isolate");
  await expect(mention).toHaveText(`@${fixture.bob.displayName}`);
});

test("keeps the RTL mention trigger and selected token on the same text edge", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const editor = page.getByTestId("composer-editor");
  await editor.fill("שלום ");
  await editor.type("@");
  await expect(page.locator(".mention-popup")).toBeVisible();
  await expect.poll(() => editor.locator("p").first().evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    text: element.textContent,
  }))).toEqual({ direction: "rtl", text: "שלום @" });

  await editor.type(fixture.bob.username);
  await bobMentionOption(page).click();
  const paragraph = editor.locator("p").first();
  const mention = editor.locator("[data-user-mention]");
  await expect(paragraph).toHaveCSS("direction", "rtl");
  await expect(mention).toHaveText(`@${fixture.bob.displayName}`);
  await expect(mention.locator("bdi")).toHaveCSS("direction", "ltr");
  await expect.poll(() => mention.evaluate((element) => element.getClientRects().length)).toBe(1);

  await editor.type("שלום");
  const postMentionGeometry = await page.evaluate(() => {
    const selection = window.getSelection();
    const caret = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const paragraph = document.querySelector('[data-testid="composer-editor"] p');
    const textNode = [...(paragraph?.childNodes || [])].findLast((node) => node.nodeType === Node.TEXT_NODE);
    const suffixRange = textNode ? document.createRange() : null;
    if (suffixRange) suffixRange.selectNodeContents(textNode);
    const suffix = suffixRange?.getBoundingClientRect() || null;
    return { caretLeft: caret?.left ?? 0, suffixLeft: suffix?.left ?? 0, suffixRight: suffix?.right ?? 0 };
  });
  expect(Math.abs(postMentionGeometry.caretLeft - postMentionGeometry.suffixLeft)).toBeLessThan(2);
});

test("keeps the LTR composer aligned after typing following a mention", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await openProjectChannel(page);

  const editor = page.getByTestId("composer-editor");
  await editor.fill("@");
  await expect(page.locator(".mention-popup")).toBeVisible();
  await editor.type(fixture.bob.username);
  await bobMentionOption(page).click();
  await editor.type(" testing");

  const paragraph = editor.locator("p").first();
  await expect(paragraph).toHaveCSS("direction", "ltr");
  await expect(paragraph).toHaveCSS("text-align", "left");

  const geometry = await page.evaluate(() => {
    const selection = window.getSelection();
    const caret = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const paragraph = document.querySelector('[data-testid="composer-editor"] p');
    const mention = paragraph?.querySelector("[data-user-mention]");
    const textNode = [...(paragraph?.childNodes || [])].findLast((node) => node.nodeType === Node.TEXT_NODE);
    const suffixRange = textNode ? document.createRange() : null;
    if (suffixRange) suffixRange.selectNodeContents(textNode);
    const suffix = suffixRange?.getBoundingClientRect() || null;
    return {
      caretRight: caret?.right ?? 0,
      mentionLeft: mention?.getBoundingClientRect().left ?? 0,
      suffixLeft: suffix?.left ?? 0,
      suffixRight: suffix?.right ?? 0,
    };
  });
  expect(geometry.mentionLeft).toBeLessThan(geometry.suffixLeft);
  expect(Math.abs(geometry.caretRight - geometry.suffixRight)).toBeLessThan(2);
});

test("switches an RTL composer to LTR after an English mention suffix", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const editor = page.getByTestId("composer-editor");
  await editor.fill("@");
  await expect(page.locator(".mention-popup")).toBeVisible();
  await editor.type(fixture.bob.username);
  await bobMentionOption(page).click();
  await editor.type(" hello world");

  const paragraph = editor.locator("p").first();
  await expect(paragraph).toHaveCSS("direction", "ltr");
  await expect(paragraph).toHaveCSS("text-align", "left");
  const geometry = await page.evaluate(() => {
    const paragraph = document.querySelector('[data-testid="composer-editor"] p');
    const mention = paragraph?.querySelector("[data-user-mention]");
    const suffixNode = [...(paragraph?.childNodes || [])].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("hello"));
    const suffixRange = suffixNode ? document.createRange() : null;
    if (suffixRange) suffixRange.selectNodeContents(suffixNode);
    return {
      mentionLeft: mention?.getBoundingClientRect().left ?? 0,
      suffixLeft: suffixRange?.getBoundingClientRect().left ?? 0,
      text: paragraph?.textContent || "",
    };
  });
  expect(geometry.text).toContain("hello world");
  expect(geometry.mentionLeft).toBeLessThan(geometry.suffixLeft);
});

test("keeps the visible caret left of a Hebrew mention suffix in RTL", async ({ page }) => {
  test.setTimeout(60_000);
  const originalDisplayName = fixture.bob.displayName;
  const hebrewDisplayName = "משתמש קיים";
  await requestAsToken(page, fixture.bob.token, "/users/me", {
    method: "PATCH",
    body: { displayName: hebrewDisplayName },
  });
  fixture.bob.displayName = hebrewDisplayName;
  try {
    const users = await requestAsToken(page, fixture.alice.token, "/users");
    expect(users.users.find((user) => user.username === fixture.bob.username)?.displayName).toBe(hebrewDisplayName);

    await page.goto(`/channels/${fixture.projectChannel.name}`);
    await selectRtl(page);
    await openProjectChannel(page);

    const editor = page.getByTestId("composer-editor");
    await editor.fill("@");
    await expect(page.locator(".mention-popup")).toBeVisible();
    await editor.type(fixture.bob.username);
    const option = page.locator(".mention-item").filter({ hasText: hebrewDisplayName });
    await expect(option).toBeVisible();
    await option.click();

    const geometry = await page.evaluate(() => {
      const selection = window.getSelection();
      const caret = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
      const mention = document.querySelector('[data-testid="composer-editor"] [data-user-mention]');
      return {
        caretLeft: caret?.left ?? 0,
        mentionLeft: mention?.getBoundingClientRect().left ?? 0,
        mentionText: mention?.textContent || "",
      };
    });
    expect(geometry.mentionText).toBe(`@${hebrewDisplayName}`);
    expect(geometry.caretLeft).toBeLessThan(geometry.mentionLeft);

    await editor.type(" hello");
    await expect(editor.locator("p").first()).toHaveCSS("direction", "ltr");
    await expect(editor.locator("p").first()).toHaveCSS("text-align", "left");
  } finally {
    await requestAsToken(page, fixture.bob.token, "/users/me", {
      method: "PATCH",
      body: { displayName: originalDisplayName },
    });
    fixture.bob.displayName = originalDisplayName;
  }
});

test("keeps mixed RTL message mentions visually attached", async ({ page }) => {
  const body = `ערעהכגה גד @${fixture.alice.username} @${fixture.bob.username} sdfvsdfsdfsdfsdfsdfsdfsd ${fixture.suffix}`;
  await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body,
      externalKey: `rtl-mixed-mentions-${fixture.suffix}`,
    },
  });

  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const message = page.locator(".message").filter({ hasText: fixture.suffix }).last();
  const mentions = message.locator(".mention[data-mention]");
  await expect(mentions).toHaveCount(2);
  for (const mention of await mentions.all()) {
    await expect(mention).toHaveCSS("display", "inline-block");
    await expect(mention).toHaveCSS("white-space", "nowrap");
    await expect(mention.locator("bdi")).toHaveCount(1);
    await expect(mention.locator("bdi")).toHaveCSS("unicode-bidi", "isolate");
    await expect.poll(() => mention.evaluate((element) => element.getClientRects().length)).toBe(1);
  }
  await expect(mentions.nth(0)).toHaveText(`@${fixture.alice.displayName}`);
  await expect(mentions.nth(1)).toHaveText(`@${fixture.bob.displayName}`);
});

test("supports a Hebrew RTL thread panel, composer, actions, and jump control", async ({ page }) => {
  const rootBody = `שורש דיון עברי ${fixture.suffix}`;
  const root = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      body: rootBody,
      externalKey: `rtl-thread-panel-root-${fixture.suffix}`,
    },
  });
  for (let index = 0; index < 24; index += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: fixture.projectChannel.id,
        parentId: root.message.id,
        body: `תגובה עברית ${index}`,
        externalKey: `rtl-thread-panel-reply-${fixture.suffix}-${index}`,
      },
    });
  }

  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);
  await page.getByTestId(`message-${root.message.id}-reply-count`).click();

  const thread = page.getByTestId("thread-panel");
  await expect(thread).toBeVisible();
  await expect(thread.locator(".message").filter({ hasText: rootBody })).toBeVisible();
  await expect.poll(() => thread.locator(".message").first().evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");

  const threadComposer = thread.getByTestId("composer-editor");
  await threadComposer.fill("תגובה חדשה בעברית");
  await expect.poll(() => threadComposer.locator("p").evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await threadComposer.press("Enter");
  await expect(thread.locator(".message").filter({ hasText: "תגובה חדשה בעברית" })).toBeVisible();

  const threadMessage = thread.locator(".message").filter({ hasText: "תגובה עברית 0" }).first();
  await threadMessage.hover();
  await page.locator(".message-more-action").last().click();
  const menu = page.locator(".msg-menu").last();
  await expect(menu).toHaveAttribute("dir", "rtl");
  await expect.poll(() => menu.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");

  const threadBody = page.getByTestId("thread-body");
  await threadBody.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.projectChannel.id,
      parentId: root.message.id,
      body: "תגובה חדשה בזמן קריאה",
      externalKey: `rtl-thread-panel-live-${fixture.suffix}`,
    },
  });
  const jump = page.getByTestId("thread-new-messages-button");
  await expect(jump).toBeVisible();
  const [jumpBox, bodyBox] = await Promise.all([jump.boundingBox(), threadBody.boundingBox()]);
  expect(jumpBox).not.toBeNull();
  expect(bodyBox).not.toBeNull();
  expect(jumpBox.x - bodyBox.x).toBeLessThanOrEqual(18);
});

test("places the RTL scroll-to-latest control on the left", async ({ page }) => {
  const channelName = `rtl-scroll-${fixture.suffix}`;
  const created = await requestAsToken(page, fixture.alice.token, "/channels", {
    method: "POST",
    body: { name: channelName, type: "public" },
  });
  for (let index = 0; index < 28; index += 1) {
    await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
      method: "POST",
      body: {
        channelId: created.channel.id,
        body: `שלום הודעה ${index}`,
        externalKey: `rtl-scroll-${fixture.suffix}-${index}`,
      },
    });
  }

  await page.goto(`/channels/${channelName}`);
  await selectRtl(page);
  await openProjectChannel(page);
  await page.getByTestId(`channel-row-${slug(channelName)}`).click();
  const scroller = page.getByTestId("messages");
  await expect(scroller).toBeVisible();
  await scroller.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight - 220);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  const button = page.getByTestId("new-messages-button");
  await expect(button).toBeVisible();
  const [buttonBox, scrollerBox] = await Promise.all([button.boundingBox(), scroller.boundingBox()]);
  expect(buttonBox).not.toBeNull();
  expect(scrollerBox).not.toBeNull();
  expect(buttonBox.x).toBeGreaterThanOrEqual(scrollerBox.x);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(scrollerBox.x + scrollerBox.width);
  expect(buttonBox.x - scrollerBox.x).toBeLessThanOrEqual(18);
});

test("keeps rail tooltips and account/API settings usable in Hebrew", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const settingsRailButton = page.getByTestId("rail-settings");
  await expect(settingsRailButton).toHaveAttribute("title", /\u2066/);
  await settingsRailButton.hover();
  const tooltip = page.locator(".echo-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveClass(/echo-tooltip-left/);
  const [tooltipBox, railBox] = await Promise.all([tooltip.boundingBox(), settingsRailButton.boundingBox()]);
  expect(tooltipBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(tooltipBox.x + tooltipBox.width).toBeLessThanOrEqual(railBox.x + 1);

  await settingsRailButton.click();
  await expect(page.getByTestId("current-password")).toHaveAttribute("placeholder", "הסיסמה הנוכחית");
  await expect(page.getByTestId("new-password")).toHaveAttribute("placeholder", "סיסמה חדשה");
  await expect(page.getByTestId("confirm-new-password")).toHaveAttribute("placeholder", "אישור הסיסמה החדשה");
  await expect(page.getByTestId("change-password-form")).toContainText("לפחות 8 תווים");
  await expect(page.getByTestId("settings-page")).toContainText("ההתראות חסומות עבור אתר זה");

  await page.getByRole("button", { name: "API", exact: true }).click();
  await page.locator(".api-group-toggle").first().click();
  const apiDescription = page.locator(".api-desc").first();
  await expect(apiDescription).toBeVisible();
  await expect.poll(() => apiDescription.evaluate((element) => ({
    direction: getComputedStyle(element).direction,
    textAlign: getComputedStyle(element).textAlign,
  }))).toEqual({ direction: "rtl", textAlign: "right" });
  await page.screenshot({ path: "test-results/hebrew-settings-tooltips-api.png", fullPage: true });
});

test("places the first RTL quote reply caret after the quote", async ({ page }) => {
  const body = `English quote source ${fixture.suffix}`;
  const message = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.dmChannel.id, body, externalKey: `rtl-first-quote-caret-${fixture.suffix}` },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto("/dms");
  await page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`).locator(".dm-open").click();
  await page.getByTestId(`message-${message.message.id}`).hover();
  await page.getByTestId(`message-${message.message.id}-quote`).click();

  const composer = page.getByTestId("composer-editor");
  const reply = `first quote reply ${fixture.suffix}`;
  await expect(composer.locator("blockquote + p")).toHaveCount(1);
  await expect.poll(() => composer.locator("blockquote + p").evaluate((element) => element.querySelectorAll("br").length)).toBe(1);
  await composer.pressSequentially(reply);
  const quote = composer.locator("blockquote");
  await expect(quote).not.toContainText(reply);
  await expect(composer.locator("blockquote + p")).toContainText(reply);
});

test("keeps a multiline English quote reply outside the quote block", async ({ page }) => {
  const body = `English multiline quote ${fixture.suffix}`;
  const message = await requestAsToken(page, fixture.bob.token, "/messages/upsert", {
    method: "POST",
    body: { channelId: fixture.dmChannel.id, body, externalKey: `rtl-multiline-quote-${fixture.suffix}` },
  });

  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto("/dms");
  await page.getByTestId(`dm-row-${slug(fixture.bob.displayName)}`).locator(".dm-open").click();
  await page.getByTestId(`message-${message.message.id}`).hover();
  await page.getByTestId(`message-${message.message.id}-quote`).click();

  const composer = page.getByTestId("composer");
  await composer.pressSequentially("first English line");
  await composer.press("Enter");
  await composer.pressSequentially("second English line");

  const quote = page.locator("blockquote").filter({ hasText: "Bob Builder said:" });
  await expect(quote).toHaveCount(1);
  await expect(quote).not.toContainText("first English line");
  await expect(quote).not.toContainText("second English line");
  await expect(page.getByText("second English line", { exact: true })).toBeVisible();
});

test("translates the Hebrew channel creation dialog", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await page.getByTestId("rail-home").click();
  await page.getByTestId("create-channel").click();

  const dialog = page.getByTestId("create-channel-modal");
  await expect(dialog).toContainText("שם הערוץ");
  await expect(dialog).toContainText("למי תהיה גישה לערוץ הזה?");
  await expect(dialog).toContainText("מנהלים בלבד");
  await expect(page.getByTestId("create-channel-cancel")).toHaveText("ביטול");
  await expect(page.getByTestId("create-channel-submit")).toHaveText("יצירה");
  await page.screenshot({ path: "test-results/hebrew-create-channel.png", fullPage: true });
});

test("translates the unauthenticated login screen in Hebrew", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("echo.language", "he");
  });
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const rhssoButton = page.getByRole("button", { name: "כניסה באמצעות RHSSO", exact: true });
  if (await rhssoButton.count()) await expect(rhssoButton).toBeVisible();
  const localAuthButton = page.getByRole("button", { name: "כניסה עם חשבון מקומי", exact: true });
  if (await localAuthButton.count()) await localAuthButton.click();
  await expect(page.getByRole("tab", { name: "כניסה", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "יצירת חשבון", exact: true })).toBeVisible();
  const signInTab = page.getByRole("tab", { name: "כניסה", exact: true });
  const createAccountTab = page.getByRole("tab", { name: "יצירת חשבון", exact: true });
  const tabIndicator = page.locator(".auth-tab-ind");
  const expectIndicatorUnder = async (tab) => {
    await expect.poll(async () => {
      const [indicatorBox, tabBox] = await Promise.all([tabIndicator.boundingBox(), tab.boundingBox()]);
      return indicatorBox && tabBox && Math.abs(indicatorBox.x - tabBox.x) < 8;
    }).toBe(true);
  };
  await expectIndicatorUnder(signInTab);
  await createAccountTab.click();
  await expectIndicatorUnder(createAccountTab);
  await signInTab.click();
  await expectIndicatorUnder(signInTab);
  await expect(page.getByLabel("שם משתמש")).toBeVisible();
  await expect(page.getByTestId("auth-password")).toHaveAttribute("placeholder", "הזינו סיסמה");
  await expect(page.getByRole("button", { name: "כניסה", exact: true })).toBeVisible();
  await expect.poll(() => page.getByTestId("auth-password").evaluate((input) => ({
    direction: getComputedStyle(input).direction,
    textAlign: getComputedStyle(input).textAlign,
  }))).toEqual({ direction: "ltr", textAlign: "left" });
  const passwordField = page.getByTestId("auth-password");
  const [inputBox, lockBox, eyeBox] = await Promise.all([
    passwordField.boundingBox(),
    passwordField.locator("xpath=preceding-sibling::*[name()='svg']").boundingBox(),
    page.getByRole("button", { name: "הצגת סיסמה" }).boundingBox(),
  ]);
  expect(inputBox).not.toBeNull();
  expect(lockBox).not.toBeNull();
  expect(eyeBox).not.toBeNull();
  expect(lockBox.x + lockBox.width).toBeLessThan(inputBox.x + inputBox.width / 2);
  expect(eyeBox.x).toBeGreaterThan(inputBox.x + inputBox.width / 2);
  await page.screenshot({ path: "test-results/hebrew-login.png", fullPage: true });
});

test("keeps Hebrew selected after signing out", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await page.getByTestId("rail-settings").click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByTestId("settings-language-he").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("echo.language"))).toBe("he");

  await page.getByTestId("rail-logout").click();
  await page.getByRole("button", { name: "יציאה", exact: true }).last().click();
  const rhssoButton = page.getByRole("button", { name: "כניסה באמצעות RHSSO", exact: true });
  if (await rhssoButton.count()) await expect(rhssoButton).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("creates and uses surveys and retrospectives in Hebrew RTL", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("echo.language", "he"));
  await page.goto(`/channels/${fixture.generalChannel.name}`);

  await page.getByTestId("composer-more-actions").click();
  await page.getByTestId("composer-survey").click();
  const surveyModal = page.getByTestId("survey-modal");
  await expect(surveyModal).toContainText("שאלה");
  await expect(surveyModal).toContainText("אפשרויות");
  await expect(surveyModal.getByRole("button", { name: "שליחת סקר" })).toBeVisible();
  const surveyInputs = surveyModal.locator("input.settings-input");
  await surveyInputs.nth(0).fill("מה נרצה לשפר?");
  await surveyInputs.nth(1).fill("מהירות");
  await surveyInputs.nth(2).fill("יציבות");
  await surveyModal.getByRole("button", { name: "שליחת סקר" }).click();

  const survey = page.locator(".survey-card").filter({ hasText: "מה נרצה לשפר?" }).last();
  await expect(survey).toBeVisible();
  await expect(survey).toContainText("סקר");
  await expect(survey).toContainText("0 הצבעות");
  await expect.poll(() => survey.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect.poll(() => survey.evaluate((element) => {
    const option = element.querySelector(".survey-option").getBoundingClientRect();
    const progress = element.querySelector(".survey-option-progress").getBoundingClientRect();
    return Math.abs(Math.round(progress.right - option.right));
  })).toBeLessThanOrEqual(2);
  await page.screenshot({ path: "test-results/hebrew-survey.png", fullPage: true });
  await survey.getByRole("button", { name: /מהירות/ }).click();
  await expect(survey).toContainText("1 הצבעה");

  await page.getByTestId("composer-more-actions").click();
  await page.getByTestId("composer-retro").click();
  const retroCreate = page.locator(".retro-create-modal");
  await expect(retroCreate).toContainText("התחלת רטרוספקטיבה");
  await retroCreate.locator("input.settings-input").fill("רטרוספקטיבת ספרינט");
  await retroCreate.getByRole("button", { name: "יצירת רטרוספקטיבה" }).click();
  const retroMessage = page.locator(".retro-message-card").filter({ hasText: "רטרוספקטיבת ספרינט" }).last();
  await expect(retroMessage).toBeVisible();
  await retroMessage.click();
  const board = page.locator(".retro-modal");
  await expect(board).toBeVisible();
  await expect.poll(() => board.evaluate((element) => getComputedStyle(element).direction)).toBe("rtl");
  await expect(board.locator(".retro-column")).toHaveCount(4);
  await expect(board.getByRole("button", { name: "הוספת רעיון" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/hebrew-survey-retro.png", fullPage: true });
});
