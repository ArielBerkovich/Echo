import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const echoUrl = process.env.ECHO_URL || "http://localhost:8091";
const username = process.env.RHSSO_USER || "jane.doe";
const password = process.env.RHSSO_PASSWORD || "UserPassword1";
// Screenshots are written next to this script by default; override with ARTIFACT_DIR.
const artifactDir = process.env.ARTIFACT_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "artifacts");

console.log("Launching headless browser...");
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();

  // Step 1: Hit the app URL
  console.log(`Navigating to ${echoUrl}...`);
  await page.goto(echoUrl);

  // Step 2: Verify automatic redirect to Keycloak
  console.log("Waiting for redirection to Keycloak...");
  await page.waitForURL((url) => url.origin === "http://localhost:8180");
  console.log(`Successfully redirected to Keycloak: ${page.url()}`);

  // Capture screenshot of Keycloak login page
  await page.screenshot({ path: `${artifactDir}/login_redirect.png` });
  console.log("Saved login page screenshot.");

  // Step 3: Log in
  console.log("Filling in Keycloak login form...");
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  console.log("Submitting login form...");
  await page.locator("#kc-login").click();

  // Step 4: Verify redirect back to client app
  console.log("Waiting for redirect back to Echo...");
  await page.waitForURL((url) => url.origin === echoUrl);
  console.log(`Successfully logged in and redirected back: ${page.url()}`);

  // Wait for the app page to load user state (e.g. check for Jane Doe on screen)
  console.log("Verifying logged-in user profile display...");
  const userProfile = page.locator(".profile-name, :text('Jane Doe')");
  await userProfile.waitFor({ timeout: 5000 });
  console.log("User 'Jane Doe' found in UI.");

  await page.screenshot({ path: `${artifactDir}/logged_in.png` });
  console.log("Saved logged-in screen screenshot.");

  // Step 5: Click Logout button
  console.log("Locating and clicking the logout button...");
  const logoutButton = page.locator("[data-testid='sidebar-logout'], .footer-signout");
  await logoutButton.click();

  // Step 6: Verify redirect back to local login / bypass mode
  console.log("Waiting for logout completion...");
  await page.waitForSelector(".auth-card");
  console.log("Successfully returned to local auth card.");

  await page.screenshot({ path: `${artifactDir}/logged_out.png` });
  console.log("Saved logged-out screen screenshot.");

  // Step 7: Ensure no redirect loop happens by waiting and observing
  console.log("Observing for 5 seconds to ensure no redirect loop occurs...");
  await page.waitForTimeout(5000);
  assert.equal(page.url().startsWith(echoUrl), true, `URL changed unexpectedly: ${page.url()}`);
  
  // Verify we are still on the local login screen, not redirected back to Keycloak
  const keycloakRedirected = page.url().includes("8180");
  assert.ok(!keycloakRedirected, "System entered redirect loop and redirected back to Keycloak!");
  
  console.log("Loop verification passed! User remains on the local login screen.");
  console.log("VERIFICATION SUCCESSFUL");
} catch (error) {
  console.error("Verification failed:", error);
  process.exit(1);
} finally {
  await browser.close();
}
