import { defineConfig, devices } from "@playwright/test";

// Runs focused tests against an already-running local Docker Compose stack.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Specs share state within a worker, but each worker gets its own fixture
  // users/channels. Keep tests in a file ordered while running files in
  // parallel. E2E_WORKERS lets CI and local runs tune database/browser load.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 2),
  reporter: "list",
  use: {
    baseURL: process.env.ECHO_URL || "http://127.0.0.1:8090",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
