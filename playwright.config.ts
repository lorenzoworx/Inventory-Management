import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/test-database.js";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/browser-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4199",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:4199/api/health",
    env: { PORT: "4199", HOST: "127.0.0.1", DATABASE_URL: testDatabaseUrl() },
    reuseExistingServer: false
  }
});
