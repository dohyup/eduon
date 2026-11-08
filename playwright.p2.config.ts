import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results-p2",
  testDir: "./tests/e2e-p2",
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  expect: { timeout: 12000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3101",
    url: "http://127.0.0.1:3101",
    timeout: 120000,
    reuseExistingServer: false,
    env: { EDUON_NEXT_DIST: ".next-p2", NODE_ENV: "development" },
  },
});
