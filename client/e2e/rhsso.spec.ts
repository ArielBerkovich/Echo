import { expect, test } from "@playwright/test";
import { registerUser, uniqueSuffix } from "./helpers.js";

// ---------------------------------------------------------------------------
// RHSSO / Keycloak E2E tests
// ---------------------------------------------------------------------------

const RHSSO_USER = process.env.RHSSO_USER || "jane.doe";
const RHSSO_PASSWORD = process.env.RHSSO_PASSWORD || "UserPassword1";
const RHSSO_ADMIN = process.env.RHSSO_ADMIN || "admin";
const RHSSO_ADMIN_PASSWORD = process.env.RHSSO_ADMIN_PASSWORD || "AdminPassword1";
const RHSSO_ORIGIN = process.env.RHSSO_ORIGIN || "http://localhost:8180";
const ECHO_ORIGIN = process.env.ECHO_URL || "http://localhost:8091";
const ECHO_PORT = new URL(ECHO_ORIGIN).port;

async function createRhssoUser(request, username, password) {
  const tokenResponse = await request.post(
    `${RHSSO_ORIGIN}/realms/master/protocol/openid-connect/token`,
    {
      form: {
        grant_type: "password",
        client_id: "admin-cli",
        username: RHSSO_ADMIN,
        password: RHSSO_ADMIN_PASSWORD,
      },
    }
  );
  expect(tokenResponse.ok(), "failed to authenticate the RHSSO test administrator").toBeTruthy();
  const { access_token: accessToken } = await tokenResponse.json();
  const createResponse = await request.post(`${RHSSO_ORIGIN}/admin/realms/echo/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      username,
      enabled: true,
      email: `${username}@example.test`,
      emailVerified: true,
      firstName: "Target",
      lastName: "Identity",
      credentials: [{ type: "password", value: password, temporary: false }],
    },
  });
  expect(createResponse.status(), "failed to create the RHSSO migration target").toBe(201);
}

async function isActualSsoEnabled(request) {
  // The default suite runs through Vite, whose origin is intentionally not an
  // RHSSO callback origin. Real integration belongs to playwright.rhsso.config
  // against the dedicated Compose stack; keep it out of ordinary UI runs.
  if (!process.env.ECHO_URL) return false;
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

  test("offers RHSSO without redirecting until the user chooses it (Mocked)", async ({ page }) => {
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
    await page.route("**/api/auth/rhsso/login?**", async (route) => {
      redirectAttempted = true;
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html>Mocked Login Page</html>",
      });
    });

    // 3. Navigate to the client.
    await page.goto("/");

    // 4. RHSSO is the primary option; local login is available on the next view.
    await expect(page.getByRole("button", { name: "Sign in with RHSSO" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with local account" })).toBeVisible();
    expect(redirectAttempted).toBe(false);
    await page.getByRole("button", { name: "Sign in with local account" }).click();
    await expect(page.getByRole("button", { name: "Back to sign-in options" })).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await page.getByRole("button", { name: "Back to sign-in options" }).click();
    await expect(page.getByRole("button", { name: "Sign in with local account" })).toBeVisible();
    await page.getByRole("button", { name: "Sign in with RHSSO" }).click();
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
    await page.route("**/api/auth/rhsso/login?**", async (route) => {
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

  test("opens Keycloak only after choosing RHSSO (Real)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in with RHSSO" })).toBeVisible();
    await page.getByRole("button", { name: "Sign in with RHSSO" }).click();
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
    await page.getByRole("button", { name: "Sign in with RHSSO" }).click();
    await page.waitForURL((url) => url.port === "8180", { timeout: 15_000 });

    await page.locator("#username").fill(RHSSO_USER);
    await page.locator("#password").fill(RHSSO_PASSWORD);
    await page.locator("#kc-login").click();

    await page.waitForURL(
      (url) => url.hostname === "localhost" && url.port === ECHO_PORT,
      { timeout: 15_000 },
    );
    const creationModal = page.getByTestId("creation-migration-modal");
    if (await creationModal.isVisible().catch(() => false)) {
      await creationModal.getByRole("button", { name: "Create a new Echo account" }).click();
    }
    await expect(page.getByTestId("rail-logout")).toBeVisible({ timeout: 15_000 });
    const token = await page.evaluate(() => localStorage.getItem("echo.token"));
    expect(token, "Echo must store the RHSSO session after account creation").toBeTruthy();

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
    await page.getByRole("button", { name: "Sign in with RHSSO" }).click();
    await page.waitForURL((url) => url.port === "8180", { timeout: 15_000 });
    await page.locator("#username").fill(RHSSO_USER);
    await page.locator("#password").fill(RHSSO_PASSWORD);
    await page.locator("#kc-login").click();

    await page.waitForURL(
      (url) => url.hostname === "localhost" && url.port === ECHO_PORT,
      { timeout: 15_000 },
    );

    await expect(page.getByTestId("rail-logout")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("rail-logout").click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();

    await expect(page.getByRole("button", { name: "Sign in with RHSSO" })).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(3_000);

    const currentUrl = new URL(page.url());
    expect(currentUrl.port).toBe(ECHO_PORT);
    expect(currentUrl.hostname).toBe("localhost");
  });

  test("migrates a logged-out local Echo user into a new RHSSO identity (Real)", async ({
    page,
    request,
  }) => {
    const suffix = uniqueSuffix("sso").replace(/[^a-z0-9]/gi, "").slice(-12);
    const oldUsername = `legacy.person${suffix}`;
    const targetUsername = `migration.sso${suffix}`;
    const targetPassword = "TargetPassword1";
    await createRhssoUser(request, targetUsername, targetPassword);

    const oldAccount = await registerUser(page, {
      username: oldUsername,
      password: "Password1",
      displayName: "Legacy Person",
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Sign in with RHSSO" }).click();
    await page.waitForURL((url) => url.port === "8180", { timeout: 15_000 });
    await page.locator("#username").fill(targetUsername);
    await page.locator("#password").fill(targetPassword);
    await page.locator("#kc-login").click();

    await page.waitForURL(
      (url) => url.port === ECHO_PORT && url.hash.includes("rhsso_creation=pending"),
      { timeout: 15_000 }
    );
    const modal = page.getByTestId("creation-migration-modal");
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Bring history from an old account" }).click();
    await modal.getByLabel("Old username").fill(oldUsername);
    await modal.getByLabel("Old password").fill("Password1");
    const rhssoUsername = page.getByLabel("RHSSO username");
    await expect(rhssoUsername).toHaveValue(targetUsername);
    await expect(rhssoUsername).toHaveAttribute("readonly", "");
    await modal.getByRole("button", { name: "Keep old history and continue" }).click();

    await expect(page.getByTestId("rail-logout")).toBeVisible({ timeout: 15_000 });
    const token = await page.evaluate(() => localStorage.getItem("echo.token"));
    const meResponse = await page.request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { user } = await meResponse.json();
    expect(user).toMatchObject({
      id: oldAccount.user.id,
      username: targetUsername,
      displayName: "Legacy Person",
    });

    const oldLogin = await page.request.post("/api/auth/login", {
      data: { username: oldUsername, password: "Password1" },
    });
    expect(oldLogin.status()).toBe(401);

    const skipTour = page.getByRole("button", { name: "Skip tour" });
    if (await skipTour.isVisible().catch(() => false)) await skipTour.click();
    await page.getByTestId("rail-logout").click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign in with RHSSO" })).toBeVisible();
    await expect(page.getByText("This migration attempt expired. Please start again.")).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("");
  });
});
