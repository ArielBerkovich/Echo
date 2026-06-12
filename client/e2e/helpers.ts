import { expect } from "@playwright/test";

const E2E_RESET_TOKEN = process.env.E2E_RESET_TOKEN || "";

export async function resetScenario(page, scenario) {
  expect(E2E_RESET_TOKEN, "E2E_RESET_TOKEN must be set for e2e tests").toBeTruthy();
  const response = await page.request.post("/api/e2e/reset", {
    data: { scenario },
    headers: { "x-e2e-reset-token": E2E_RESET_TOKEN },
  });
  expect(response.ok(), `failed to reset ${scenario} scenario`).toBeTruthy();
}

export async function loginAndSeedToken(page, username, password) {
  const response = await page.request.post("/api/auth/login", {
    data: { username, password },
  });
  expect(response.ok(), `failed to log in as ${username}`).toBeTruthy();
  const { token } = await response.json();
  await page.addInitScript((value) => {
    localStorage.setItem("echo.token", value);
  }, token);
}

export async function enableClipboardStub(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedText = text;
        },
      },
    });
  });
}

export function slug(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function channelRow(page, name) {
  return page.getByTestId(`channel-row-${slug(name)}`);
}

export function dmRow(page, name) {
  return page.getByTestId(`dm-row-${slug(name)}`);
}

export function railItem(page, key) {
  return page.getByTestId(`rail-${key}`);
}

export function messageById(page, id) {
  return page.getByTestId(`message-${id}`);
}

export function messageByText(page, text) {
  return page.locator('[data-testid^="message-"]').filter({ hasText: text });
}

export function composer(page) {
  return page.getByTestId("composer-editor");
}

export function settingsPage(page) {
  return page.getByTestId("settings-page");
}

export function profileModal(page) {
  return page.getByTestId("profile-modal");
}

export function addEmojiModal(page) {
  return page.getByTestId("add-emoji-modal");
}

export function activityItem(page) {
  return page.getByTestId("activity-item");
}

export function searchResult(page) {
  return page.getByTestId("search-result");
}

export function searchInput(page) {
  return page.getByTestId("search-input");
}

export function threadPanel(page) {
  return page.getByTestId("thread-panel");
}
