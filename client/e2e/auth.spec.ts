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
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Display name").fill("Alice");
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
    await page.getByLabel("Username").fill(`admin-${uniqueSuffix("auth")}`);
    await page.getByLabel("Display name").fill("Admin");
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
    await registerPage.locator('input[type="password"]').fill("Password1");
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
