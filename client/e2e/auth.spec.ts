import { expect, test } from "@playwright/test";
import { resetScenario } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await resetScenario(page, "auth");
});

test("first-run setup validates weak passwords before registering", async ({ page }) => {
  const registerRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/register")) registerRequests.push(request);
  });

  await page.goto("/");

  await expect(page.getByText("First-time setup")).toBeVisible();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Display name").fill("Alice");
  await page.locator('input[type="password"]').fill("weak");
  await page.getByRole("button", { name: "Create admin account" }).click();

  await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
  expect(registerRequests).toHaveLength(0);
});

test("login displays server errors", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Display name").fill("Alice");
  await page.locator('input[type="password"]').fill("Password1");
  await page.getByRole("button", { name: "Create admin account" }).click();

  await expect(page.getByText("#general", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Username").fill("alice");
  await page.locator('input[type="password"]').fill("WrongPassword1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("create account tab submits registration payload", async ({ page }) => {
  let payload;
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/register") && request.method() === "POST") {
      payload = request.postDataJSON();
    }
  });

  await page.goto("/");
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Display name").fill("Alice");
  await page.locator('input[type="password"]').fill("Password1");
  await page.getByRole("button", { name: "Create admin account" }).click();
  await expect(page.getByText("#general", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click({ force: true });
  await expect(page.getByRole("tab", { name: "Create account" })).toBeVisible();

  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Username").fill("bob");
  await page.getByLabel("Display name").fill("Bob Builder");
  await page.locator('input[type="password"]').fill("Password1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.poll(() => payload).toEqual({
    username: "bob",
    displayName: "Bob Builder",
    password: "Password1",
  });
});
