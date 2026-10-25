import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "room-directory-cards.visual.spec.ts",
  timeout: 45_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3002",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "pnpm exec next dev --port 3002",
    cwd: __dirname,
    url: "http://127.0.0.1:3002/app",
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  outputDir: "test-results"
});
