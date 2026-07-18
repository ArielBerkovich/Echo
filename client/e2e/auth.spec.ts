import { expect, test } from "@playwright/test";
import { uniqueSuffix } from "./helpers.js";

test("registration rejects weak passwords", async ({ page }) => {
  const username = `weak.user${uniqueSuffix("auth").replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
  const response = await page.request.post("/api/auth/register", {
    data: { username, firstName: "Weak", lastName: "User", password: "weak" },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body).toMatchObject({
    error: "Password must be at least 8 characters",
  });
});

test("login displays server errors", async ({ page }) => {
  const username = `alice-${uniqueSuffix("auth")}`;
  const statusResponse = await page.request.get("/api/auth/setup-status");
  const { needsSetup } = await statusResponse.json();

  if (needsSetup) {
    await page.goto("/");
    await expect(page.getByLabel("Admin username")).toHaveValue("admin");
    await page.locator('input[type="password"]').fill("Password1");
    await page.getByRole("button", { name: "Create admin account" }).click();

    await expect(page.getByText("#general", { exact: true })).toBeVisible();
    return;
  }

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.locator('input[type="password"]').fill("WrongPassword1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("That username or password doesn't look right.")).toBeVisible();
});

test("create account tab submits registration payload", async ({ page }) => {
  const statusResponse = await page.request.get("/api/auth/setup-status");
  const { needsSetup } = await statusResponse.json();
  if (needsSetup) {
    await page.goto("/");
    await expect(page.getByLabel("Admin username")).toHaveValue("admin");
    await page.locator('input[type="password"]').fill("Password1");
    await page.getByRole("button", { name: "Create admin account" }).click();
    await expect(page.getByText("#general", { exact: true })).toBeVisible();
    return;
  }

  const bobUsername = `bob.builder${uniqueSuffix("auth").replace(/[^a-z0-9]/gi, "").slice(0, 16)}`;
  let payload;
  const registerPage = await page.context().newPage();
  registerPage.on("request", (request) => {
    if (request.url().includes("/api/auth/register") && request.method() === "POST") {
      payload = request.postDataJSON();
    }
  });

  try {
    await registerPage.addInitScript(() => localStorage.clear());
    await registerPage.goto("/");
    await expect(registerPage.getByRole("tab", { name: "Create account" })).toBeVisible();

    await registerPage.getByRole("tab", { name: "Create account" }).click();
    await registerPage.getByLabel("First name").fill("Bob");
    await registerPage.getByLabel("Last name").fill("Builder");
    await registerPage.getByRole("button", { name: "Continue" }).click();
    await registerPage.locator('input[name="password"]').fill("Password1");
    await registerPage.getByLabel("Confirm password").fill("Password1");
    await registerPage.getByRole("button", { name: "Create account" }).click();
  } finally {
    await registerPage.close();
  }

  await expect.poll(() => payload).toMatchObject({
    firstName: "Bob",
    lastName: "Builder",
    password: "Password1",
  });
});

test("signup keeps password confirmation errors on the fields", async ({ page }) => {
  const statusResponse = await page.request.get("/api/auth/setup-status");
  const { needsSetup } = await statusResponse.json();

  await page.goto("/");
  if (needsSetup) {
    await expect(page.getByLabel("Admin username")).toBeVisible();
  } else {
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.getByLabel("First name").fill("Signup");
    await page.getByLabel("Last name").fill("Tester");
    await page.getByRole("button", { name: "Continue" }).click();
  }

  const password = page.locator('input[name="password"]');
  const confirmation = page.getByLabel("Confirm password");
  await password.fill("Password1");
  await page.getByRole("button", { name: needsSetup ? "Create admin account" : "Create account" }).click();
  await expect(confirmation.locator("xpath=../.."))
    .toContainText("Please confirm your password");

  await confirmation.fill("Password2");
  await page.getByRole("button", { name: needsSetup ? "Create admin account" : "Create account" }).click();
  await expect(confirmation.locator("xpath=../.."))
    .toContainText("Passwords don't match");
  await expect(page.locator(".auth-card > .error")).toHaveCount(0);

  const pasteWasPrevented = await confirmation.evaluate((input) => {
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(pasteWasPrevented).toBeTruthy();
});
