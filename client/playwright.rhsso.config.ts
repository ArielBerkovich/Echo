import { defineConfig, devices } from "@playwright/test";

// Dedicated Playwright config for RHSSO / Keycloak integration tests.
// These tests expect the docker-compose.rhsso.yml stack to already be running
// and a local admin account to have been created.
//
// Run with:
//   npx playwright test --config playwright.rhsso.config.ts
export default defineConfig({
  testDir: "./e2e",
  testMatch: "rhsso.spec.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Keep tests in a file ordered while running independent files in parallel.
  // The worker count is configurable because Keycloak-backed runs are heavier.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 2),
  reporter: "list",
  use: {
    baseURL: process.env.ECHO_URL || "http://localhost:8091",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // No webServer block — the RHSSO docker-compose stack must already be running.
});
