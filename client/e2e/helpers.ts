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
