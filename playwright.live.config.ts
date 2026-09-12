import { defineConfig } from "@playwright/test";
// Deliberate opt-in: this uses the running local app's real provider keys and bills four images.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.live.ts",
  timeout: 600000,
  workers: 1,
  retries: 0,
  outputDir: "output/playwright/live-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "output/playwright/live-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
