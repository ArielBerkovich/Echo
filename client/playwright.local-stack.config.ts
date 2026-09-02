import { defineConfig, devices } from "@playwright/test";

// Runs focused tests against an already-running local Docker Compose stack.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Specs share state within a worker, and the backend uses one shared
  // workspace database. Keep the default serialized so unrelated files
  // cannot race through shared notifications, activity, and realtime state.
  // E2E_WORKERS remains available for intentionally isolated environments.
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS || 1),
  reporter: "list",
  use: {
    baseURL: process.env.ECHO_URL || "http://127.0.0.1:8090",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
