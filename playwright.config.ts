import { defineConfig, devices } from "@playwright/test";

// Foundation/Speed Audit Z.0b — playwright harness scaffold.
//
// Target: local dev (`http://localhost:3000`) by default. Override with
// PLAYWRIGHT_BASE_URL env var for staging/prod when those exist.
// Migration to staging is filed as `z0b-followup-staging-target` in
// SLICES-speed.md.
//
// Local-only — NOT wired to GitHub Actions yet. The webServer config
// runs `next dev` against Nathan's local DB, which CI doesn't have.
// CI integration is filed as `z0b-followup-ci-integration`.

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Skip the _setup directory — it contains helpers, not specs.
  testIgnore: ["**/_setup/**"],

  // Local: no retries — fail fast so the agent can fix immediately.
  // CI (when wired): 2 retries to absorb known flakes (network blips,
  // dev-server startup race). The CI integration slice will adjust.
  retries: process.env.CI ? 2 : 0,

  // Single worker locally — `next dev` shares state and Prisma
  // connections across specs; parallel workers cause contention.
  workers: process.env.CI ? 1 : 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Local dev startup can be slow — generous default timeout for
    // first-load. Per-spec waits are still in the specs themselves.
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  // Auto-start `next dev` if not already running. `reuseExistingServer`
  // means devs who already have `npm run dev` in another terminal don't
  // get a duplicate startup. Timeout is 90s because Next 16 + Turbopack
  // first-build can take 30-60s on a cold cache.
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
