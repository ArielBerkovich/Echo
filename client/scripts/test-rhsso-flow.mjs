// Browser-side smoke test for a running Echo + RHSSO/Keycloak pair.
// Environment: ECHO_URL (default http://localhost:4001), RHSSO_USER,
// RHSSO_PASSWORD. The workspace's local admin must already exist.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const echoUrl = process.env.ECHO_URL || "http://localhost:4001";
const username = process.env.RHSSO_USER || "jane.doe";
const password = process.env.RHSSO_PASSWORD || "UserPassword1";
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage();
  await page.goto(`${echoUrl}/api/auth/rhsso/login`);
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("#kc-login").click();
  await page.waitForURL((url) => url.origin === echoUrl && url.hash.includes("rhsso_token="));

  const callback = new URL(page.url());
  const token = new URLSearchParams(callback.hash.slice(1)).get("rhsso_token");
  assert.ok(token, "Echo callback did not contain a session token");
  const response = await page.request.get(`${echoUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status(), 200);
  const { user } = await response.json();
  assert.equal(user.username, username);
  assert.equal(user.displayName, "Jane Doe");
  assert.equal(user.isAdmin, false);
  console.log(JSON.stringify({ status: "ok", user }, null, 2));
} finally {
  await browser.close();
}
