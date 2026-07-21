import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// RHSSO / Keycloak E2E tests
// ---------------------------------------------------------------------------

const RHSSO_USER = process.env.RHSSO_USER || "jane.doe";
const RHSSO_PASSWORD = process.env.RHSSO_PASSWORD || "UserPassword1";

async function isActualSsoEnabled(request) {
  try {
    const statusResponse = await request.get("/api/auth/setup-status");
    if (statusResponse.ok()) {
      const { rhssoEnabled } = await statusResponse.json();
      return !!rhssoEnabled;
    }
  } catch {}
  return false;
}

// ===========================================================================
// SECTION 1: Mocked Flow Tests (Runs in EVERY E2E run)
// ===========================================================================
test.describe("RHSSO login flows (Mocked, runs in every test run)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("auto-redirects to Keycloak login page when RHSSO is enabled (Mocked)", async ({ page }) => {
    // 1. Mock the setup status to report that RHSSO is enabled.
    await page.route("**/api/auth/setup-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ needsSetup: false, rhssoEnabled: true }),
      });
    });

    // 2. Intercept the redirect to the backend login route.
    let redirectAttempted = false;
    await page.route("**/api/auth/rhsso/login", async (route) => {
      redirectAttempted = true;
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html>Mocked Login Page</html>",
      });
    });

    // 3. Navigate to the client.
    await page.goto("/");

    // 4. Verify that the auto-redirect was triggered.
    await expect.poll(() => redirectAttempted).toBe(true);
  });

  test("does not auto-redirect and shows normal login page when RHSSO is disabled (Mocked)", async ({ page }) => {
    // 1. Mock the setup status to report that RHSSO is disabled.
    await page.route("**/api/auth/setup-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ needsSetup: false, rhssoEnabled: false }),
      });
    });

    // 2. Navigate to the client.
    await page.goto("/");

    // 3. Verify we stay on the login screen with normal credentials.
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.locator("button:has-text('Sign in with RHSSO')")).toHaveCount(0);
  });

  test("logout bypasses redirect and shows local login card (Mocked)", async ({ page }) => {
    // 1. Mock setup status to report RHSSO is enabled.
    await page.route("**/api/auth/setup-status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ needsSetup: false, rhssoEnabled: true }),
      });
    });

    // 2. Intercept any redirect attempts.
    let redirectAttempted = false;
    await page.route("**/api/auth/rhsso/login", async (route) => {
      redirectAttempted = true;
      await route.fulfill({ status: 200, body: "Redirected" });
    });

    // 3. Simulate post-logout state by setting the bypass flag.
    await page.addInitScript(() => {
      sessionStorage.setItem("echo.ssoBypass", "true");
    });

    // 4. Navigate to client.
    await page.goto("/");

    // 5. Verify it shows the local login card instead of auto-redirecting.
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

    await page.waitForTimeout(1000);
    expect(redirectAttempted).toBe(false);
  });
});

// ===========================================================================
// SECTION 2: Real Integration Tests (Runs only when actual Keycloak stack is running)
// ===========================================================================
test.describe("RHSSO login flows (Real integration, runs only when Keycloak is up)", () => {
  test.beforeEach(async ({ page, request }) => {
    if (!(await isActualSsoEnabled(request))) {
      test.skip();
      return;
    }
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("auto-redirects to Keycloak login page when RHSSO is enabled (Real)", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL((url) => url.hostname !== "localhost" || url.port === "8180", {
      timeout: 15_000,
    });

    const url = new URL(page.url());
    expect(url.port).toBe("8180");
    expect(url.pathname).toContain("/realms/echo/protocol/openid-connect/auth");
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("logs in via Keycloak and the preferred_username matches the Echo username (Real)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL((url) => url.port === "8180", { timeout: 15_000 });

    await page.locator("#username").fill(RHSSO_USER);
    await page.locator("#password").fill(RHSSO_PASSWORD);
    await page.locator("#kc-login").click();

    await page.waitForURL(
      (url) =>
        (url.hostname === "localhost" && (url.port === "8091" || url.port === "5173")) &&
        url.hash.includes("rhsso_token="),
      { timeout: 15_000 },
    );

    const callbackUrl = new URL(page.url());
    const token = new URLSearchParams(callbackUrl.hash.slice(1)).get("rhsso_token");
    expect(token, "Echo callback must contain an rhsso_token").toBeTruthy();

    const meResponse = await page.request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meResponse.status()).toBe(200);

    const { user } = await meResponse.json();
    expect(user.username).toBe(RHSSO_USER);
    expect(["Jane Doe", "Or Vazana"]).toContain(user.displayName);
    expect(user.isAdmin).toBe(false);
  });

  test("logout does not cause a redirect loop back to Keycloak (Real)", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL((url) => url.port === "8180", { timeout: 15_000 });
    await page.locator("#username").fill(RHSSO_USER);
    await page.locator("#password").fill(RHSSO_PASSWORD);
    await page.locator("#kc-login").click();

    await page.waitForURL(
      (url) => url.hostname === "localhost" && (url.port === "8091" || url.port === "5173"),
      { timeout: 15_000 },
    );

    await expect(page.getByTestId("sidebar-logout")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("sidebar-logout").click();

    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(3_000);

    const currentUrl = new URL(page.url());
    expect(currentUrl.port).toMatch(/^(8091|5173)$/);
    expect(currentUrl.hostname).toBe("localhost");
  });
});
