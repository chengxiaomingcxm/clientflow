import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * Playwright configuration for end-to-end smoke tests.
 *
 * The tests run against the production build (`next build` + `next start`)
 * because that is what is deployed. Run `npm run build` first, then
 * `npm run test:e2e` (`npm run test:e2e:ci` does both).
 *
 * Only Chromium is configured in Phase 0: it keeps the CI job fast while the
 * suite is a smoke test. Additional browsers can be added in Phase 6.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
