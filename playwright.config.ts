import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "output/playwright/journey-results",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "output/playwright/journey-report", open: "never" },
    ],
    ["json", { outputFile: "output/playwright/journey-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:6173",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 12000,
  },
  projects: [
    {
      name: "desktop-light",
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: "light" },
    },
    {
      name: "mobile-light",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: "chrome",
        colorScheme: "light",
      },
    },
    {
      name: "desktop-dark",
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: "dark" },
    },
  ],
  webServer: {
    command: "node tests/e2e/server.mjs",
    url: "http://localhost:6173",
    reuseExistingServer: false,
    timeout: 120000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
