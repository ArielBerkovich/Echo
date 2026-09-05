import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture, uniqueSuffix } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await page.goto(`/channels/${encodeURIComponent(fixture.generalChannel.name)}`);
  await expect(page.getByTestId("channel-title")).toContainText(fixture.generalChannel.name);
});

test("creates and manages a retrospective board", async ({ page }) => {
  const title = `Retro ${uniqueSuffix("board")}`;
  await page.getByTestId("composer-retro").click();
  const createModal = page.locator(".retro-create-modal");
  await createModal.locator("input.settings-input").fill(title);
  await createModal.getByRole("button", { name: "Create board" }).click();

  const message = page.locator(".retro-message-card").filter({ hasText: title }).last();
  await expect(message).toBeVisible();
  await message.click();
  const board = page.locator(".retro-modal");
  await expect(board).toBeVisible();
  await expect(board.locator(".retro-column")).toHaveCount(4);

  const wentWell = board.locator(".retro-column.sun");
  await wentWell.getByRole("button", { name: "Add idea" }).click();
  const ideaModal = page.locator(".retro-idea-modal");
  const editor = ideaModal.getByTestId("composer-editor");
  await expect(editor).toBeFocused();
  await editor.fill("The release process was smooth");
  await ideaModal.getByTestId("composer-send").click();
  await expect(wentWell).toContainText("The release process was smooth");

  const idea = wentWell.locator(".retro-item").filter({ hasText: "The release process was smooth" });
  await idea.getByRole("button", { name: "Edit idea" }).click();
  const editModal = page.locator(".retro-idea-modal");
  await editModal.getByTestId("composer-editor").fill("The release process stayed smooth");
  await editModal.getByTestId("composer-send").click();
  await expect(wentWell).toContainText("The release process stayed smooth");

  const backlog = board.locator(".retro-column.violet");
  await wentWell.locator(".retro-item").filter({ hasText: "The release process stayed smooth" }).dragTo(backlog);
  await expect(backlog).toContainText("The release process stayed smooth");

  await backlog.locator(".retro-item").filter({ hasText: "The release process stayed smooth" }).getByRole("button", { name: "Delete idea" }).click();
  const confirm = page.getByRole("dialog");
  await confirm.getByRole("button", { name: "Delete idea" }).click();
  await expect(backlog).not.toContainText("The release process stayed smooth");
});

test("shows optional linked work URL for backlog ideas", async ({ page }) => {
  const title = `Retro ${uniqueSuffix("links")}`;
  await page.getByTestId("composer-retro").click();
  const createModal = page.locator(".retro-create-modal");
  await createModal.locator("input.settings-input").fill(title);
  await createModal.getByRole("button", { name: "Create board" }).click();
  await page.locator(".retro-message-card").filter({ hasText: title }).last().click();

  const board = page.locator(".retro-modal");
  await board.locator(".retro-column.violet").getByRole("button", { name: "Add idea" }).click();
  const ideaModal = page.locator(".retro-idea-modal");
  const link = ideaModal.locator("input[placeholder=\"Paste a link (optional)\"]");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("type", "url");
  await expect(link).toHaveValue("");
  await expect(ideaModal.getByTestId("composer-editor")).toBeFocused();
});
