import { expect, test } from "@playwright/test";
import { registerUser, requestAsToken, uniqueSuffix } from "./helpers.js";

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Password1";

async function workspaceAdminAuth(page) {
  const statusResponse = await page.request.get("/api/auth/setup-status");
  const { needsSetup } = await statusResponse.json();
  const response = await page.request.post(needsSetup ? "/api/auth/register" : "/api/auth/login", {
    data: { username: "admin", password: ADMIN_PASSWORD },
  });
  const body = await response.json().catch(() => ({}));
  expect(response.ok(), body.error || "failed to authenticate workspace admin").toBeTruthy();
  return body;
}

test("forgot password requests admin help for the entered username", async ({ page }) => {
  let requestedUsername;
  let requestCount = 0;
  await page.addInitScript(() => localStorage.clear());
  await page.route("**/api/auth/setup-status", (route) =>
    route.fulfill({ json: { needsSetup: false, rhssoEnabled: false } })
  );
  await page.route("**/api/auth/forgot-password", async (route) => {
    requestCount += 1;
    requestedUsername = route.request().postDataJSON()?.username;
    await route.fulfill({
      status: 202,
      json: {
        ok: true,
        message: "If that username belongs to a local account, the workspace admin has been notified.",
      },
    });
  });

  await page.goto("/");
  await page.getByLabel("Username").fill("alice.test");
  await page.getByRole("button", { name: "Forgot password?" }).click();

  await expect.poll(() => requestedUsername).toBe("alice.test");
  const status = page.getByRole("status");
  await expect(status).toContainText("workspace admin has been notified");
  await status.selectText();
  expect(requestCount).toBe(1);
});

test("forgot password delivers Echo's one-time-password instructions to the admin", async ({ browser, page }) => {
  const admin = await workspaceAdminAuth(page);
  await requestAsToken(page, admin.token, "/users/me/onboarded", { method: "POST" });
  const selfReset = await page.request.post(`/api/admin/users/${admin.user.id}/reset-password`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  expect(selfReset.status()).toBe(403);
  const usernameSuffix = uniqueSuffix("forgot").replace(/[^a-z0-9]/gi, "").slice(0, 16);
  const requestedUser = await registerUser(page, {
    username: `reset.request${usernameSuffix}`,
    displayName: "Reset Request",
  });

  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByLabel("Username").fill(requestedUser.user.username);
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("status")).toContainText("workspace admin has been notified");

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.addInitScript((token) => localStorage.setItem("echo.token", token), admin.token);
  try {
    await adminPage.goto("/");
    const echoDm = adminPage.getByRole("button", { name: "Offline Echo" });
    await expect(echoDm).toBeVisible();
    await echoDm.click();
    const notification = adminPage.locator('[data-testid^="message-"]').filter({
      hasText: `Password help requested for @${requestedUser.user.username}`,
    });
    const issueButton = notification.getByRole("button", {
      name: `Issue OTP for @${requestedUser.user.username} and reply`,
    });
    await expect(issueButton).toBeVisible();
    await issueButton.click();

    await expect(notification).toContainText("One-time password issued and posted below");
    const reply = adminPage.locator('[data-testid^="message-"]').filter({
      hasText: `One-time password for @${requestedUser.user.username}`,
    });
    await expect(reply).toContainText("It expires in 1 hour");
    const replyText = await reply.innerText();
    const otp = replyText.match(/One-time password[^:]*:\s*([A-Za-z0-9]+)/)?.[1];
    expect(otp).toBeTruthy();

    const otpLogin = await page.request.post("/api/auth/login", {
      data: { username: requestedUser.user.username, password: otp },
    });
    expect(otpLogin.ok()).toBeTruthy();
    await expect(otpLogin.json()).resolves.toMatchObject({ user: { mustResetPassword: true } });
  } finally {
    await adminContext.close();
  }
});

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
    await page.locator('input[name="password"]').fill("Password1");
    await page.getByLabel("Confirm password").fill("Password1");
    await page.getByRole("button", { name: "Create admin account" }).click();

    await expect(page.getByTestId("sidebar-logout")).toBeVisible();
    return;
  }

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Username").fill(username);
  await page.locator('input[name="password"]').fill("WrongPassword1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("That username or password doesn't look right.")).toBeVisible();
});

test("create account tab submits registration payload", async ({ page }) => {
  const statusResponse = await page.request.get("/api/auth/setup-status");
  const { needsSetup } = await statusResponse.json();
  if (needsSetup) {
    await page.goto("/");
    await expect(page.getByLabel("Admin username")).toHaveValue("admin");
    await page.locator('input[name="password"]').fill("Password1");
    await page.getByLabel("Confirm password").fill("Password1");
    await page.getByRole("button", { name: "Create admin account" }).click();
    await expect(page.getByTestId("sidebar-logout")).toBeVisible();
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
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  await expect(confirmation).toHaveAttribute("autocomplete", "new-password");
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
  expect(pasteWasPrevented).toBeFalsy();
});
