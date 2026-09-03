const { defineConfig } = require("@playwright/test");

// Runs the packaged-renderer Electron shell against the RHSSO Compose stack.
// The stack is intentionally started outside this config so it can be shared
// with the browser RHSSO integration suite.
module.exports = defineConfig({
  testDir: "./e2e",
  testMatch: "rhsso.spec.cjs",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    trace: "on-first-retry",
  },
});
