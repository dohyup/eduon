import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results-p4",
  testDir: "./tests/e2e-p4",
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3103",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3103",
    url: "http://127.0.0.1:3103",
    timeout: 120000,
    reuseExistingServer: false,
    env: { EDUON_NEXT_DIST: ".next-p4", NODE_ENV: "development" },
  },
});
