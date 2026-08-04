import { expect, test } from "@playwright/test";
import { channelRow, messageById, requestAsToken, seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
});

async function openFreshMessage(page, key, body) {
  const created = await requestAsToken(page, fixture.alice.token, "/messages/upsert", {
    method: "POST",
    body: {
      channelId: fixture.generalChannel.id,
      body,
      externalKey: `${key}-${fixture.suffix}`,
    },
  });

  await page.goto("/");
  await channelRow(page, "general").click();
  const message = messageById(page, created.message.id);
  await expect(message).toBeVisible();
  return { id: created.message.id, message };
}

test("keeps a message active while hovering and opening its action menu", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "hover-actions",
    `Hover action buttons ${fixture.suffix}`
  );
  const actions = page.getByTestId(`message-${id}-actions`);

  await message.hover();
  await expect(actions).toBeVisible();

  await actions.getByTestId(`message-${id}-forward`).hover();
  await expect(message).toHaveClass(/actions-hovered/);

  await actions.getByTestId(`message-${id}-more`).click();
  await expect(message).toHaveClass(/menu-open/);

  await page.getByRole("menu", { name: "Message actions" }).getByRole("menuitem", { name: "Copy message" }).hover();
  await expect(message).toHaveClass(/menu-open/);
});

test("keeps a message active through reaction selection", async ({ page }) => {
  const { id, message } = await openFreshMessage(
    page,
    "hover-reaction",
    `Hover reaction picker ${fixture.suffix}`
  );
  const actions = page.getByTestId(`message-${id}-actions`);

  await message.hover();
  await actions.getByTestId(`message-${id}-add-reaction-action`).click();

  const picker = page.getByRole("dialog", { name: "Choose a reaction" });
  await expect(picker).toBeVisible();
  await expect(message).toHaveClass(/reaction-open/);

  await picker.getByRole("button", { name: "React with 👍" }).click();
  await expect(picker).toBeHidden();
  await expect(message).toHaveClass(/actions-hovered/);
});
