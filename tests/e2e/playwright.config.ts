import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html"],
    ["list"],
    ["junit", { outputFile: "test-results/junit.xml" }],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev --prefix ../../apps/platform-frontend",
      port: 3000,
      timeout: 120000,
      reuseExistingServer: true,
      env: {
        BACKEND_PORT: "8888",
      },
    },
    {
      command: "npm run dev --prefix ../../apps/platform-backend",
      port: 8888,
      timeout: 120000,
      reuseExistingServer: true,
    },
  ],
});
