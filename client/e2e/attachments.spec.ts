import { expect, test } from "@playwright/test";
import { channelRow, messageById, requestAsToken, seedWorkspaceFixture, uniqueSuffix, uploadAsToken } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

test("explains and rejects an eleventh message attachment before uploading", async ({ page }) => {
  let uploadRequests = 0;
  await page.route("**/api/uploads", async (route) => {
    uploadRequests += 1;
    await route.continue();
  });
  await page.goto("/");

  const files = Array.from({ length: 11 }, (_, index) => ({
    name: `attachment-${index + 1}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from(`attachment ${index + 1}`, "utf8"),
  }));
  await page.getByTestId("composer-attachments").setInputFiles(files);

  await expect(page.getByTestId("channel-error")).toContainText(
    "A message can have up to 10 files, images, or attachments"
  );
  await expect(page.getByTestId("channel-error")).toContainText("You selected 11");
  await expect(page.locator(".pending-att")).toHaveCount(0);
  expect(uploadRequests).toBe(0);
});

test("keeps code attachments compact until expanded and highlights them full-screen", async ({ page }) => {
  const attachment = (await uploadAsToken(page, fixture.alice.token, {
    name: "preview.ts",
    mimeType: "text/typescript",
    buffer: Buffer.from(
      [
        "interface User {",
        "  name: string;",
        "}",
        "",
        "const greeting = (user: User): string => `Hello ${user.name}`;",
      ].join("\n"),
      "utf8"
    ),
  })).attachments[0];
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `Code attachment preview ${uniqueSuffix("message")}`,
      attachments: [attachment],
    },
  });

  await page.goto("/");
  await channelRow(page, "general").click();
  const message = messageById(page, created.message.id);
  const card = page.getByTestId(`text-attachment-${attachment.key}`);
  await expect(message).toBeVisible();
  await expect(card).toBeVisible();

  const headerChildren = await card.locator(":scope > .att-text-head > *").evaluateAll((nodes) =>
    nodes.map((node) => node.className)
  );
  expect(headerChildren).toEqual(["att-text-toggle", "att-text-download", "att-text-open att-text-header-open"]);
  await expect(card.locator(".att-text-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(card.locator(".att-text-preview")).toHaveCount(0);
  await expect(card.getByRole("link", { name: "Download preview.ts" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Open full-screen preview of preview.ts" })).toBeVisible();

  await card.locator(".att-text-toggle").click();
  await expect(card.locator(".att-text-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(card.locator(".att-text-preview")).toContainText("interface User");
  await expect(card.locator(".att-text-preview .hljs-keyword")).toHaveCount(0);

  await card.getByRole("button", { name: "Open full-screen preview of preview.ts" }).click();
  const dialog = page.getByRole("dialog", { name: "Preview preview.ts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".text-viewer-content")).toContainText("const greeting");
  await expect(dialog.locator(".text-viewer-content .hljs-keyword").first()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Download" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("opens a CSV attachment from its compact header and closes on backdrop click", async ({ page }) => {
  const attachment = (await uploadAsToken(page, fixture.alice.token, {
    name: "report.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,total\nEcho,42\n", "utf8"),
  })).attachments[0];
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body: `CSV attachment preview ${uniqueSuffix("message")}`,
      attachments: [attachment],
    },
  });

  await page.goto("/");
  await channelRow(page, "general").click();
  const message = messageById(page, created.message.id);
  const card = page.getByTestId(`text-attachment-${attachment.key}`);
  await expect(message).toBeVisible();
  await card.getByRole("button", { name: "Open full-screen preview of report.csv" }).click();

  const dialog = page.getByRole("dialog", { name: "Preview report.csv" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".text-viewer-content")).toContainText("Echo,42");
  await page.locator(".text-viewer-backdrop").click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
});
