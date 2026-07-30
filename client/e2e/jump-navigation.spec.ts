import { expect, test } from "@playwright/test";
import {
  messageById,
  requestAsToken,
  seedWorkspaceFixture,
  solidPng,
  uploadAsToken,
} from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function postMessage(page, { authorToken, channelId, parentId = null, body, attachments = [], key }) {
  const { message } = await requestAsToken(page, authorToken, "/messages/upsert", {
    method: "POST",
    body: {
      channelId,
      parentId,
      body,
      attachments,
      externalKey: key,
    },
  });
  return message;
}

function targetBody(marker, content, mention) {
  const heading = `${marker}${mention ? ` @${fixture.alice.username}` : ""}`;
  if (content === "code") {
    return [
      heading,
      "",
      "```js",
      "const stages = ['prepare', 'build', 'verify'];",
      "for (const stage of stages) {",
      "  console.log(`jump target: ${stage}`);",
      "}",
      "```",
    ].join("\n");
  }
  return `${heading} plain message`;
}

async function expectMessageCentered(target) {
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport();
  await expect.poll(
    () =>
      target.evaluate((element) => {
        const scroller = element.closest(".thread-body, .messages");
        if (!scroller) return Number.POSITIVE_INFINITY;
        const targetRect = element.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        return Math.round(
          Math.abs(
            targetRect.top +
              targetRect.height / 2 -
              (scrollerRect.top + scroller.clientHeight / 2)
          )
        );
      }),
    { message: "expected the selected message to remain centered in its own scroller" }
  ).toBeLessThanOrEqual(8);
}

async function seedJumpCase(page, { origin, context, content, withImages }) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const marker = `Jump matrix ${origin} ${context} ${content} ${withImages ? "images" : "no-images"} ${stamp}`;
  const channelId = fixture.projectChannel.id;
  let threadId = null;

  if (context === "thread") {
    const root = await postMessage(page, {
      authorToken: fixture.alice.token,
      channelId,
      body: `Jump matrix thread root ${stamp}`,
      key: `jump-matrix-root-${stamp}`,
    });
    threadId = root.id;
  }

  let delayedImageKey = null;
  if (withImages) {
    const { attachments } = await uploadAsToken(page, fixture.alice.token, {
      name: `jump-layout-${stamp}.png`,
      mimeType: "image/png",
      buffer: solidPng(800, 600),
    });
    const image = attachments[0];
    delayedImageKey = image.key;

    // Deliberately omit width/height metadata. This exercises the hard case:
    // the authenticated image appears later and genuinely changes layout.
    for (let index = 0; index < 3; index++) {
      await postMessage(page, {
        authorToken: fixture.alice.token,
        channelId,
        parentId: threadId,
        body: `Delayed image before target ${index} ${stamp}`,
        attachments: [image],
        key: `jump-matrix-image-${index}-${stamp}`,
      });
    }
  } else {
    // Keep the no-image thread/channel genuinely scrollable on a desktop
    // viewport so exact centering is possible instead of clamping at scrollTop 0.
    for (let index = 0; index < 5; index++) {
      await postMessage(page, {
        authorToken: fixture.alice.token,
        channelId,
        parentId: threadId,
        body: `Plain message before target ${index} ${stamp}`,
        key: `jump-matrix-before-${index}-${stamp}`,
      });
    }
  }

  const target = await postMessage(page, {
    authorToken: origin === "activity" ? fixture.bob.token : fixture.alice.token,
    channelId,
    parentId: threadId,
    body: targetBody(marker, content, origin === "activity"),
    key: `jump-matrix-target-${stamp}`,
  });

  // Code-block channel cases also verify the around-message fetch path by
  // pushing the target outside the normal 50-message history window.
  const messagesAfterTarget = context === "channel" && content === "code" ? 55 : 10;
  for (let index = 0; index < messagesAfterTarget; index++) {
    await postMessage(page, {
      authorToken: fixture.alice.token,
      channelId,
      parentId: threadId,
      body: `Message after jump target ${index} ${stamp}`,
      key: `jump-matrix-after-${index}-${stamp}`,
    });
  }

  if (origin === "saved") {
    await requestAsToken(page, fixture.alice.token, `/saved/${target.id}`, { method: "POST" });
  }

  return { marker, target, delayedImageKey };
}

async function openJumpOrigin(page, origin) {
  await page.addInitScript(
    ({ userId, view }) => {
      localStorage.setItem(
        `echo.loc.${userId}`,
        JSON.stringify({ view, convId: null, convType: null })
      );
    },
    { userId: fixture.alice.id, view: origin }
  );
  await page.goto("/");
  await expect(page.getByTestId(`${origin}-header`)).toBeVisible();
}

const origins = ["saved", "activity"];
const contexts = ["channel", "thread"];
const contents = ["plain", "code"];
const imageStates = [false, true];

for (const origin of origins) {
  for (const context of contexts) {
    for (const content of contents) {
      for (const withImages of imageStates) {
        test(`${origin} keeps a ${context} ${content} target centered ${withImages ? "with delayed images" : "without images"}`, async ({ page }) => {
          const scenario = await seedJumpCase(page, { origin, context, content, withImages });

          if (scenario.delayedImageKey) {
            await page.route(`**/api/files/${scenario.delayedImageKey}`, async (route) => {
              await new Promise((resolve) => setTimeout(resolve, 900));
              await route.continue();
            });
          }

          await openJumpOrigin(page, origin);
          const originItem = page
            .getByTestId(origin === "saved" ? "saved-item" : "activity-item")
            .filter({ hasText: scenario.marker });
          await expect(originItem).toBeVisible();
          await originItem.click();

          if (context === "thread") {
            await expect(page.getByTestId("thread-panel")).toBeVisible();
          } else {
            await expect(page.getByTestId("channel-title")).toContainText(fixture.projectChannel.name);
          }

          const target = messageById(page, scenario.target.id);
          await expect(target).toHaveClass(/flash/);
          await expectMessageCentered(target);

          if (withImages) {
            const scroller = context === "thread"
              ? page.locator(".thread-body")
              : page.locator(".channel-main > .messages");
            await expect(scroller.locator(".att-image img")).toHaveCount(3);
            await expect(scroller.locator(".att-image img").last()).toBeVisible();
            await expectMessageCentered(target);
          }
        });
      }
    }
  }
}
