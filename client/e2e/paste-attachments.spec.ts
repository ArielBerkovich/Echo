import { expect, test } from "@playwright/test";
import { seedWorkspaceFixture } from "./helpers.js";

let fixture: Awaited<ReturnType<typeof seedWorkspaceFixture>>;

test.beforeEach(async ({ page }) => {
  fixture = await seedWorkspaceFixture(page);
  await page.goto("/");
});

async function dispatchTextPaste(page, text: string) {
  await page.getByTestId("composer-editor").evaluate((editor, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    editor.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    }));
  }, text);
}

test("pastes ordinary text without showing the attachment suggestion", async ({ page }) => {
  const text = "A short pasted message";

  await dispatchTextPaste(page, text);

  await expect(page.getByTestId("composer-editor")).toHaveText(text);
  await expect(page.getByTestId("composer-paste-prompt")).toHaveCount(0);
});

test("offers text or attachment for a large JSON paste", async ({ page }) => {
  const text = JSON.stringify({ payload: "x".repeat(2_600) });

  await dispatchTextPaste(page, text);

  const prompt = page.getByTestId("composer-paste-prompt");
  await expect(prompt).toContainText("Attach this paste as a file?");
  await expect(prompt.getByRole("button", { name: "Attach as file" })).toBeVisible();
  await expect(prompt.getByRole("button", { name: "Paste as text" })).toBeVisible();
  await expect(page.getByTestId("composer-send")).toBeEnabled();
  await page.getByTestId("composer-send").click();
  await expect(page.getByTestId("composer-paste-error")).toContainText("Choose an option above before sending this message.");

  await dispatchTextPaste(page, "another large paste that must wait");
  await expect(page.getByTestId("composer-paste-error")).toContainText("Choose an option for the current paste before pasting more content.");
  await expect(prompt.getByRole("button", { name: "Attach as file" })).toBeVisible();

  await prompt.getByRole("button", { name: "Attach as file" }).click();
  await expect(page.getByTestId("composer-paste-prompt")).toHaveCount(0);
  await expect(page.locator(".pending-file-name")).toHaveText("pasted.json");
  await expect(page.getByTestId("composer-editor")).toHaveText("");
});

test("requires an attachment when pasted text exceeds the message limit", async ({ page }) => {
  const text = JSON.stringify({ payload: "x".repeat(4_100) });

  await dispatchTextPaste(page, text);

  const prompt = page.getByTestId("composer-paste-prompt");
  await expect(prompt).toContainText("Paste exceeds the message limit");
  await expect(prompt.getByRole("button", { name: "Attach as file" })).toBeVisible();
  await expect(prompt.getByRole("button", { name: "Paste as text" })).toHaveCount(0);
  await expect(page.getByTestId("composer-send")).toBeEnabled();
  await page.getByTestId("composer-send").click();
  await expect(page.getByTestId("composer-paste-error")).toContainText("Choose an option above before sending this message.");
  await expect(page.getByTestId("composer-editor")).toHaveText("");

  await prompt.getByRole("button", { name: "Attach as file" }).click();
  await expect(page.locator(".pending-file-name")).toHaveText("pasted.json");
});

test("rejects pasted content larger than the 10 MB attachment limit", async ({ page }) => {
  const text = "x".repeat(10 * 1024 * 1024 + 1);

  await dispatchTextPaste(page, text);

  const prompt = page.getByTestId("composer-paste-prompt");
  await expect(prompt).toContainText("This paste can’t be attached.");
  await expect(prompt).toContainText("Files are limited to 10 MB");
  await expect(prompt.getByRole("button", { name: "Attach as file" })).toHaveCount(0);
  await expect(prompt.getByRole("button", { name: "Paste as text" })).toHaveCount(0);
  await expect(page.locator(".pending-att")).toHaveCount(0);
  await expect(page.getByTestId("composer-editor")).toHaveText("");
});
