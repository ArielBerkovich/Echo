import { expect, test } from "@playwright/test";
import { requestAsToken, seedWorkspaceFixture, slug } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function selectRtl(page) {
  await page.getByTestId("rail-settings").click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByTestId("settings-direction-rtl").click();
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "rtl");
}

async function openProjectChannel(page) {
  await page.getByTestId("rail-home").click();
  await page.getByTestId(`channel-row-${slug(fixture.projectChannel.name)}`).click();
  await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
}

test("persists the RTL preference without changing the page chrome direction", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);
  await expect(page.getByTestId("channel-title")).toBeVisible();

  const chromeDirections = await page.evaluate(() => ({
    title: getComputedStyle(document.querySelector('[data-testid="channel-title"]')).direction,
    document: getComputedStyle(document.documentElement).direction,
  }));
  expect(chromeDirections.title).toBe("ltr");
  expect(chromeDirections.document).toBe("ltr");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-interface-direction", "rtl");
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

test("anchors an empty Hebrew composer and mention popup to the RTL side", async ({ page }) => {
  await page.goto(`/channels/${fixture.projectChannel.name}`);
  await selectRtl(page);
  await openProjectChannel(page);

  const composer = page.getByTestId("composer-editor");
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
});

test("keeps message actions LTR while a Hebrew message surface is RTL", async ({ page }) => {
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
  await expect(menu).toHaveAttribute("dir", "ltr");
  await expect.poll(() => menu.evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
  await expect.poll(() => menu.getByRole("menuitem").first().evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
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
  await expect(menu).toHaveAttribute("dir", "ltr");
  await expect.poll(() => menu.evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");

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
