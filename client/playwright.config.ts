import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: 10_000 },
  // Specs share state within a worker, but each worker gets its own fixture
  // users/channels. Keep tests in a file ordered while running files in
  // parallel. E2E_WORKERS lets CI and local runs tune database/browser load.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 2),
  reporter: "list",
  use: {
    baseURL: process.env.ECHO_E2E_BASE_URL || "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      SCHEDULER_TICK_MS: "1000",
      AUTH_RATE_LIMIT_MAX: "200",
    },
  },
});
