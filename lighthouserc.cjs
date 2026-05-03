// Foundation/Speed Audit Z.2 — Lighthouse CI config.
//
// LOCAL-CAPTURE ONLY for this slice. CI integration is deferred to
// `z2-followup-ci-integration` (mirrors Z.0b's playwright deferral —
// running Lighthouse in GitHub Actions requires booting `npm run start`
// against a CI-friendly DB + injecting auth, which is significant infra
// work beyond the baseline-capture goal).
//
// Run locally: `npm run lighthouse` (collects) then `npm run lighthouse:report`
// (opens the most recent report HTML in a browser).
//
// AUTH POSTURE — important for future agents:
//
// All 10 priority routes (the dashboard product surfaces) are auth-gated.
// `src/middleware.ts` redirects unauthenticated requests under
// `/dashboard`, `/contacts`, `/messages`, etc. to `/login`. So a local
// Lighthouse run against e.g. `/dashboard` without auth would measure
// the redirect → `/login`, not the actual page. The test user is NOT yet
// provisioned in `.env.local` (deferred per
// `z0b-followup-verify-e2e-runs`).
//
// Until the test user is provisioned, this config measures only the
// 3 reachable PUBLIC routes. The 10 priority routes are commented in
// the URL list with the prefix `// AUTH-GATED — TBD:` so future agents
// can uncomment them once auth is wired.
//
// AUTH PATH FORWARD (when test user lands):
//   1. Set PLAYWRIGHT_TEST_EMAIL + PLAYWRIGHT_TEST_PASSWORD in .env.local
//   2. Add `puppeteerScript: "lighthouse/auth-puppeteer.cjs"` here
//   3. Write `lighthouse/auth-puppeteer.cjs` mirroring the form-fill
//      pattern in `tests/e2e/_setup/auth.ts` (goto /login, fill creds,
//      click submit, wait for non-/login URL)
//   4. Uncomment the auth-gated URLs below
//   5. Re-run `npm run lighthouse`; replace TBD rows in
//      `docs/handoff/speed-2026-q2-baselines.md` with median-of-3 numbers

const baseUrl = process.env.LIGHTHOUSE_BASE_URL ?? "http://localhost:3000";

// Reachable public routes — the partial baseline this slice actually
// captures. Used to prove the tooling works end-to-end.
const publicRoutes = [
  `${baseUrl}/login`,
  `${baseUrl}/leasing-agent`,
  `${baseUrl}/privacy`,
];

// All 13 URLs the matrix tracks: 10 auth-gated priority routes (will be
// measured once test user is provisioned) + 3 public routes (measured
// today). Smoke contract C2 counts entries shaped like
// `${baseUrl}/<route>`; the structural assertion holds regardless of
// which routes are currently active in `ci.collect.url` below.
const allRoutes = [
  // 10 priority routes — auth-gated, currently TBD in baselines doc.
  // Activated by uncommenting the spread into ci.collect.url below
  // once auth-puppeteer.cjs lands.
  `${baseUrl}/dashboard`,
  `${baseUrl}/contacts`,
  `${baseUrl}/pipeline`,
  `${baseUrl}/messages`,
  `${baseUrl}/calendar`,
  `${baseUrl}/market-intel`,
  `${baseUrl}/deals`,
  `${baseUrl}/terminal`,
  `${baseUrl}/brokerage/transactions`,
  `${baseUrl}/leasing/setup`,
  // Reachable public routes — actually measured today.
  ...publicRoutes,
];

module.exports = {
  ci: {
    collect: {
      // Only run the public routes today. Auth-gated will be enabled
      // by uncommenting + adding puppeteerScript per the path-forward
      // comment above.
      url: publicRoutes,
      // Reduce noise: median of 3 runs per URL. Local-only; CI run
      // count will be tuned when `z2-followup-ci-integration` ships.
      numberOfRuns: 3,
      // Settings tuned for local capture — desktop preset matches
      // Cloud Run's typical client. Mobile capture is a follow-up.
      settings: {
        preset: "desktop",
        // Skip the PWA + best-practices audits — focus on perf + SEO.
        // Re-enable in a future slice if those become priorities.
        onlyCategories: ["performance"],
      },
    },
    assert: {
      // WARN-ONLY in this slice. Numbers are observational; thresholds
      // are calibrated to Core Web Vitals "good" cutoffs but failing
      // them must NOT fail the npm script. The assert step prints
      // warnings to stdout; nothing exits non-zero.
      assertions: {
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "first-contentful-paint": ["warn", { maxNumericValue: 1800 }],
        "interactive": ["warn", { maxNumericValue: 3800 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        "server-response-time": ["warn", { maxNumericValue: 800 }],
      },
    },
    upload: {
      // Local-only — write reports to `.lighthouseci/` (gitignored).
      // No remote upload. Once `z2-followup-ci-integration` lands, the
      // CI variant of this config will switch `target` to `temporary-public-storage`
      // or a self-hosted lhci server.
      target: "filesystem",
      outputDir: "./.lighthouseci",
    },
  },
  // Exposed for the smoke test + future agents who want to run a
  // subset (e.g. just one route) without editing the config.
  _allRoutes: allRoutes,
  _priorityRoutes: allRoutes.slice(0, 10),
  _publicRoutes: publicRoutes,
};
