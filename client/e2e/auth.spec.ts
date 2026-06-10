import { expect, test } from "@playwright/test";

async function mockSetupStatus(page, needsSetup) {
  await page.route("**/api/auth/setup-status", async (route) => {
    await route.fulfill({ json: { needsSetup } });
  });
}

test("first-run setup validates weak passwords before registering", async ({ page }) => {
  await mockSetupStatus(page, true);
  const registerRequests = [];
  await page.route("**/api/auth/register", async (route) => {
    registerRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      json: {
        token: "token-1",
        user: {
          id: "u1",
          username: "alice",
          displayName: "Alice",
          isAdmin: true,
          mustResetPassword: false,
          onboarded: true,
        },
      },
    });
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
  await mockSetupStatus(page, false);
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      json: { error: "Invalid username or password" },
    });
  });

  await page.goto("/");

  await page.getByLabel("Username").fill("alice");
  await page.locator('input[type="password"]').fill("Password1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("create account tab submits registration payload", async ({ page }) => {
  await mockSetupStatus(page, false);
  let payload;
  await page.route("**/api/auth/register", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        token: "token-1",
        user: {
          id: "u1",
          username: "alice",
          displayName: "Alice Example",
          isAdmin: false,
          mustResetPassword: false,
          onboarded: true,
        },
      },
    });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Username").fill("alice");
  await page.getByLabel("Display name").fill("Alice Example");
  await page.locator('input[type="password"]').fill("Password1");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect.poll(() => payload).toEqual({
    username: "alice",
    displayName: "Alice Example",
    password: "Password1",
  });
});
