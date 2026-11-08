import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results-p3",
  testDir: "./tests/e2e-p3",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3102",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3102",
    url: "http://127.0.0.1:3102",
    timeout: 120000,
    reuseExistingServer: false,
    env: { EDUON_NEXT_DIST: ".next-p3", NODE_ENV: "development" },
  },
});
