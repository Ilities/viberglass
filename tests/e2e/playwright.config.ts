import { defineConfig, devices } from "@playwright/test";
import { backendEnvironment, E2E } from "./playwright/e2eEnvironment";
import { HARNESSES } from "./playwright/harnessMatrix";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./playwright/globalSetup",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E.frontendUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // The default run: journeys through the real backend and Docker worker.
      name: "smoke",
      testDir: "./tests/smoke",
      // Journeys wait for real worker containers.
      timeout: 120_000,
      use: { ...devices["Desktop Chrome"] },
    },
    // Real harness images against the mock model endpoint, one project each; not part of the default run.
    ...HARNESSES.map((harness) => ({
      name: `harness-${harness.agent}`,
      testDir: "./tests/harnesses",
      timeout: 420_000,
      use: { ...devices["Desktop Chrome"], harness },
    })),
    {
      // Quarantined older specs, not part of `npm run test:e2e`. They predate
      // the current UI and fail on login; revive or delete them one by one.
      name: "legacy",
      testIgnore: ["smoke/**", "harnesses/**"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npx tsx src/api/server.ts",
      cwd: "../../apps/platform-backend",
      port: E2E.backendPort,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
      env: backendEnvironment({ port: E2E.backendPort, postgresPort: E2E.postgresPort }),
    },
    {
      command: `npx vite --port ${E2E.frontendPort} --strictPort`,
      cwd: "../../apps/platform-frontend",
      port: E2E.frontendPort,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
      env: {
        VITE_API_URL: E2E.backendUrl,
        VITE_CACHE_DIR: "node_modules/.vite-e2e",
      },
    },
  ],
});
