import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// RHSSO / Keycloak E2E integration tests
//
// Prerequisites:
//   1. The RHSSO docker-compose stack is running:
//        docker compose -p echo-rhsso-demo -f docker-compose.rhsso.yml up -d --build
//   2. The bootstrap admin account has been created (POST /api/auth/register).
//
// Run with:
//   npx playwright test --config playwright.rhsso.config.ts
// ---------------------------------------------------------------------------

const RHSSO_USER = process.env.RHSSO_USER || "jane.doe";
const RHSSO_PASSWORD = process.env.RHSSO_PASSWORD || "UserPassword1";
const RHSSO_DISPLAY_NAME = process.env.RHSSO_DISPLAY_NAME || "Jane Doe";

test.describe("RHSSO Keycloak login flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any previous session so the auto-redirect kicks in.
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test("auto-redirects to Keycloak login page when RHSSO is enabled", async ({ page }) => {
    await page.goto("/");

    // The client should automatically redirect to the Keycloak login page.
    await page.waitForURL((url) => url.hostname !== "localhost" || url.port === "8180", {
      timeout: 15_000,
    });

    // Verify we landed on the Keycloak realm login page.
    const url = new URL(page.url());
    expect(url.port).toBe("8180");
    expect(url.pathname).toContain("/realms/echo/protocol/openid-connect/auth");
    await expect(page.locator("#username")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("logs in via Keycloak and the preferred_username matches the Echo username", async ({
    page,
  }) => {
    // 1. Navigate to the Echo client — should auto-redirect to Keycloak.
    await page.goto("/");
    await page.waitForURL((url) => url.port === "8180", { timeout: 15_000 });

    // 2. Fill in credentials on the Keycloak login form.
    await page.locator("#username").fill(RHSSO_USER);
    await page.locator("#password").fill(RHSSO_PASSWORD);
    await page.locator("#kc-login").click();

    // 3. Wait for the redirect back to Echo with the session token in the fragment.
    await page.waitForURL(
      (url) =>
        (url.hostname === "localhost" && url.port === "8091") &&
        url.hash.includes("rhsso_token="),
      { timeout: 15_000 },
    );

    // 4. Extract the token from the URL fragment.
    const callbackUrl = new URL(page.url());
    const token = new URLSearchParams(callbackUrl.hash.slice(1)).get("rhsso_token");
    expect(token, "Echo callback must contain an rhsso_token").toBeTruthy();

    // 5. Hit the /api/auth/me endpoint to verify the session is valid and the
    //    preferred_username from Keycloak matches the Echo username.
    const meResponse = await page.request.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meResponse.status()).toBe(200);

    const { user } = await meResponse.json();
    expect(user.username).toBe(RHSSO_USER);
    expect(user.displayName).toBe(RHSSO_DISPLAY_NAME);
    expect(user.isAdmin).toBe(false);
  });

  test("logout does not cause a redirect loop back to Keycloak", async ({ page }) => {
    // Log in first via Keycloak.
    await page.goto("/");
    await page.waitForURL((url) => url.port === "8180", { timeout: 15_000 });
    await page.locator("#username").fill(RHSSO_USER);
    await page.locator("#password").fill(RHSSO_PASSWORD);
    await page.locator("#kc-login").click();

    // Wait for the callback, then wait for the app to load.
    await page.waitForURL(
      (url) => url.hostname === "localhost" && url.port === "8091",
      { timeout: 15_000 },
    );

    // Wait for the app to fully initialise and show the sidebar logout button.
    await expect(page.getByTestId("sidebar-logout")).toBeVisible({ timeout: 15_000 });

    // Click logout.
    await page.getByTestId("sidebar-logout").click();

    // Wait for the login form to appear (the local auth card).
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible({ timeout: 10_000 });

    // Stay on the page for a few seconds to verify no auto-redirect happens.
    await page.waitForTimeout(3_000);

    // We should still be on localhost:8091, NOT redirected to Keycloak.
    const currentUrl = new URL(page.url());
    expect(currentUrl.port).toBe("8091");
    expect(currentUrl.hostname).toBe("localhost");
  });
});
