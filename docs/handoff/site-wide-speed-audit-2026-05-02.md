# Site-Wide Speed Audit — Kickoff (2026-05-02)

**Audit name:** `speed-2026-q2`
**Goal:** Measurably reduce time-to-interactive, server response time, and cold-start latency across every user-facing surface of VettdRE.
**Methodology:** `docs/methodology/slice-based-audit.md` (v2.1)
**Templates:** `docs/methodology/templates/`
**Audit doc (to be filled by Phase 0):** `docs/handoff/speed-2026-q2-audit-<date>.md` (created in Phase Z)
**Slice ledger:** `SLICES-speed.md` (created in Phase Z, indexed from top-level `SLICES.md`)
**Asana project:** "Speed Audit Q2 2026" (created in Phase Z)

**v2.1 compliance applies to all Z slice prompts below.** Each prompt requires:
- Plan-of-record appended to `SLICES-speed.md` slice entry BEFORE writing code.
- Smoke contracts at `tests/smoke/<slice-id>.test.ts`, run in CI `smoke-contracts` job.
- Verification artifact captured post-deploy (paste into PR comment).
- Reference `docs/methodology/templates/kickoff-prompt.md` for canonical structure.

**Phase 0 swarm uses `docs/methodology/templates/phase-0-swarm-prompt.md`** — the swarm prompt block in this doc has been moved out and is now imported by reference.

This is the first site-wide audit using methodology v2. Speed was chosen as the first because it's measurable (no stakeholder debates), bounded by area but methodology applies cross-cuttingly, and lots of quick wins exist across the codebase. Establishes the site-wide audit muscle before tackling something subjective like UX.

**Critical principle for this audit:** measure first, optimize second. Phase 0 is forbidden from proposing fixes — only baselines and bug captures. Phase 1+ scope gets defined AFTER Phase 0 reveals where the actual hot spots are.

---

## Why speed matters now

A few concrete reasons:

- **Cloud Run costs scale with response time.** Faster responses = fewer concurrent instances = lower bill.
- **Real estate is a real-time business.** Agents browsing market intel, managers reviewing transactions, clients signing onboardings — all need sub-second feedback.
- **The Terminal product specifically is performance-bound.** Memory note from 2026-04-06 already flags brief generation as too slow; live polling improvements are queued.
- **Mobile usage is growing.** Slow pages on mobile networks compound — every wasted KB matters more.
- **Cold starts on Cloud Run are user-visible.** First request after idle (auto-scales to 0 instances) takes seconds. Need to measure and reduce.
- **Compounding interest.** Every slow query, every oversized bundle, every render cascade adds up. Audit-and-fix once, win on every future deploy.

---

## Phase Z — Setup (instrumentation + tooling)

Before any audit begins, this infrastructure must exist. Each item below is a Phase Z slice. They run serially because they're touching shared infra.

**Z.0a and Z.0b** were added 2026-05-02 after pre-flight check discovered GH Actions CI and playwright harness don't exist (methodology v2.1.1 patch). They run BEFORE Z.1-Z.6.

### Z.0a — GitHub Actions CI skeleton (kickoff prompt for Claude Code)

```
Slice Z.0a — establish GitHub Actions CI with the four required jobs from
methodology v2.2.

**The bug:**
The repo has no `.github/workflows/` directory. CI is Cloud Build only,
which runs deploy on push to main. There is no PR-blocking check for
typecheck, lint, test, build, or smoke contracts. Methodology v2.2
deferred this requirement (v2.1.1 caveat carried forward) but the speed
audit can't enforce smoke contract regressions without it.

**The fix:**
Add minimal GH Actions workflow at `.github/workflows/ci.yml` with four
jobs running on PR and push: typecheck, lint, test (which covers smoke
contracts via `npm run test -- tests/smoke/`), build. Configure branch
protection on main to require all four green before merge.

**Discovery instructions:**
- Confirm no `.github/workflows/` exists (already known from pre-flight)
- Read package.json scripts (typecheck, lint, test, build all exist —
  confirmed)
- Check Node version expected — likely Node 20 per Dockerfile
- Check if there are any env vars needed at build time that aren't in
  GitHub Actions defaults

**Implementation intent:**
- `.github/workflows/ci.yml` with on:[pull_request, push to main]
- Four jobs (typecheck, lint, test, build) running in parallel
- Node 20, npm cache enabled, prisma generate before any job
- Branch protection setup is Nathan-side in GitHub UI (document in PR
  body what to set)
- DO NOT add e2e-playwright job — that's Z.0b
- DO NOT enable Lighthouse CI — that's Z.2

**Constraints:**
- Don't change Cloud Build behavior (deploy still goes through cloudbuild.yaml)
- Don't add deploy step to GH Actions
- Don't fail the build if lint baseline grows by 1-2 errors during this PR
  (the lint baseline is anchored at 4484 per CLAUDE.md; if lint job catches
  a baseline regression in the workflow file itself, document and proceed)

**Smoke contracts (2):**
1. Positive: `.github/workflows/ci.yml` exists with all 4 job names
   (typecheck, lint, test, build)
2. Positive: workflow runs on both pull_request AND push to main triggers

**Stop conditions:**
- If pre-existing typecheck baseline (285) doesn't hold when CI runs,
  surface — methodology requires baselines hold or improve.
- If npm install times out in CI, propose package.json caching strategy.
- If build needs additional secrets not in repo, surface list — Nathan
  configures in GitHub repo settings.

**Verification (post-merge):**
- Open a trivial test PR, confirm all 4 jobs run + green.
- Screenshot of GitHub Actions tab pasted into PR comment.

**Branch:** chore/speed-z0a-gh-actions off origin/main
**PR title:** chore(speed): add GitHub Actions CI with typecheck/lint/test/build
**Closes:** Z.0a in SLICES-speed.md

**v2.2 required:** plan-of-record in SLICES-speed.md before code; smoke contracts at `tests/smoke/z0a-gh-actions.test.ts`; verification screenshot to `docs/handoff/screenshots/z0a-prod.png`.

Stop and propose plan first.
```

### Z.0b — Playwright harness scaffold (kickoff prompt for Claude Code)

```
Slice Z.0b — install playwright + scaffold harness + implement first 5
critical flows.

**The bug:**
No playwright in the repo. Methodology v2.2 requires e2e harness for
end-of-phase gates. Without it, gate verification falls back to manual
Chrome MCP walks which don't scale across audits.

**The fix:**
Install @playwright/test, configure for staging URL, scaffold tests/e2e/
directory with 5 flows: login, create contact, create deal submission,
send Gmail reply, run market intel address search. Defer flows 6-10
to a separate Phase 1 slice (estimated <280 line ceiling demands the split).

**Discovery instructions:**
- Confirm staging URL exists and is accessible (likely staging.vettdre.com
  or a Cloud Run preview URL — Nathan tell agent)
- Check what auth flow staging uses (Supabase Auth — likely needs a test
  user)
- Confirm the methodology v2.2 flows list at §"Required infrastructure"
  → "Playwright e2e harness"
- Check if any existing test setup uses dotenv-cli — playwright will need
  staging env vars

**Implementation intent:**
- `playwright.config.ts` with baseURL, retry, screenshot on failure,
  trace on first retry
- `tests/e2e/` with 5 spec files (one per flow)
- Auth helper in `tests/e2e/_setup/auth.ts` for cookie-based pre-auth
- npm script `npm run e2e` for local runs
- npm script `npm run e2e:headed` for debugging
- DO NOT wire to GH Actions yet — that's a follow-up slice once Z.0a is
  in place; just confirm runs locally
- DO NOT add the remaining 5 flows — file as Phase 1 follow-up slice

**Constraints:**
- Don't run against prod (use staging only)
- Don't store credentials in the repo (use env vars from GitHub secrets
  or local .env.local)
- Test user must be a dedicated playwright test account, not Nathan's
  super_admin login

**Smoke contracts (2):**
1. Positive: `playwright.config.ts` exists with `baseURL` set from env
2. Positive: `tests/e2e/` contains at least 5 .spec.ts files

**Stop conditions:**
- If staging URL doesn't exist, stop — surface options (use Cloud Run
  preview, build local first, or use prod with a test tenant).
- If auth flow can't be cookie-replayed (e.g. magic link only), propose
  alternative auth strategy.
- If line count exceeds 280, split: Z.0b1 (config + login flow) and
  Z.0b2 (other 4 flows).

**Verification (post-merge):**
- `npm run e2e` runs locally, all 5 flows green.
- Output paste into PR comment.

**Branch:** chore/speed-z0b-playwright off origin/main
**PR title:** chore(speed): scaffold playwright harness with first 5 flows
**Closes:** Z.0b in SLICES-speed.md
**Files Phase 1 follow-up:** `z0b-followup-flows-6-10` for remaining flows.

**v2.2 required:** plan-of-record in SLICES-speed.md before code; smoke contracts at `tests/smoke/z0b-playwright.test.ts`; verification = local `npm run e2e` output.

Stop and propose plan first.
```



### Z.1 — Bundle analyzer baseline + report (kickoff prompt for Claude Code)

```
Slice Z.1 — add @next/bundle-analyzer and capture baseline bundle sizes
for the speed audit.

**The bug:**
We don't currently know what's in our JavaScript bundles. Edge bundle
size, per-route client bundle size, shared chunks — all unmeasured.
Without baseline numbers we can't measure progress on bundle optimization
slices in Phase 1+.

**The fix:**
Install @next/bundle-analyzer (or equivalent), wire it into next.config.ts
behind an env flag, capture baseline reports for the top 10 routes,
commit summary numbers to docs/handoff/speed-2026-q2-baselines.md.

**Discovery instructions:**
- Read next.config.ts — confirm current shape, plan how to wrap with
  the analyzer
- Read package.json — check Next.js version (should be 16.1.6) and
  confirm bundle-analyzer compat
- Identify top 10 routes from CLAUDE.md project structure (dashboard,
  contacts, pipeline, messages, calendar, market-intel, deals, terminal,
  brokerage/transactions, leasing setup)

**Implementation intent:**
- Add @next/bundle-analyzer as devDependency
- Wrap next.config.ts so analyzer activates when ANALYZE=true
- Add `npm run analyze` script that runs ANALYZE=true npm run build
- Create docs/handoff/speed-2026-q2-baselines.md with a section per
  route capturing: edge bundle size, client bundle size, largest 5
  chunks, suspicious imports
- Capture initial baseline numbers and commit them

**Constraints:**
- Don't change Turbopack config or production build behavior
- Analyzer reports must NOT ship in production builds
- Don't refactor any code yet — purely observational

**Smoke contracts (2):**
1. Positive: package.json has `analyze` script that includes ANALYZE=true
2. Positive: next.config.ts wraps config with bundle analyzer behind
   env flag (regex pin: `withBundleAnalyzer\(.+\)` or equivalent)

**Stop conditions:**
- If the analyzer is incompatible with Next.js 16 / Turbopack, surface
  alternatives (e.g. `next-bundle-analyzer`, manual webpack stats).

**Branch:** chore/speed-z1-bundle-analyzer off origin/main
**PR title:** chore(speed): add bundle analyzer + baseline report

Stop and propose plan first.
```

### Z.2 — Lighthouse CI + Web Vitals baseline (kickoff prompt for Claude Code)

```
Slice Z.2 — set up Lighthouse CI to capture Core Web Vitals for top 10
routes on every PR, with a one-time baseline capture.

**The bug:**
We don't currently measure LCP, FCP, TTI, TTFB, CLS, or any of the Core
Web Vitals on a per-route basis. No regression detection. Speed audit
can't measure success without these numbers.

**The fix:**
Install @lhci/cli, configure for top 10 routes, run on PR via GitHub
Actions (or whatever existing CI we have — check first), capture
baseline numbers.

**Discovery instructions:**
- Check if any CI exists (look for .github/workflows/, circleci config,
  cloudbuild.yaml)
- If GitHub Actions exists, plan to add a Lighthouse CI job
- If no CI exists, surface — Phase Z might need a "set up CI" slice
  before this one
- Read CLAUDE.md to confirm top 10 routes
- Confirm staging URL is available (or plan to use prod with a header
  guard, or local with `npm run start`)

**Implementation intent:**
- Add @lhci/cli as devDependency
- lighthouserc.json defining: 10 routes, performance budget targets
  (proposed: LCP < 2.5s, TTI < 3.8s, CLS < 0.1, FCP < 1.8s — these are
  Core Web Vitals "good" thresholds)
- npm run lighthouse script for local runs
- CI job that runs lighthouse on PR (warn-only initially, NOT failing
  builds; we'll tighten after Phase 1 fixes ship)
- Baseline capture run on main, results committed to
  docs/handoff/speed-2026-q2-baselines.md

**Constraints:**
- Run against authenticated routes carefully — most useful routes need
  login. Plan: use Lighthouse with a pre-auth cookie injected from a
  test account, OR run only on public routes (login, /sign/[token],
  /chat/[slug], /book/[slug]) for the baseline and add authenticated
  in a follow-up.
- Don't fail builds initially — set as warn. Tighten in Phase 1.
- Don't tune scores — just measure.

**Smoke contracts (2):**
1. Positive: lighthouserc.json exists with at least 10 URLs configured
2. Positive: npm run lighthouse script exists in package.json

**Stop conditions:**
- If no CI exists at all, stop and surface — Phase Z needs a CI setup
  slice first.
- If authenticated route testing requires complex setup, propose either
  scope reduction (public-only baseline) or full setup (own slice).

**Branch:** chore/speed-z2-lighthouse-ci off origin/main
**PR title:** chore(speed): add Lighthouse CI + baseline Web Vitals capture

Stop and propose plan first.
```

### Z.3 — Prisma slow query log (kickoff prompt for Claude Code)

```
Slice Z.3 — instrument Prisma to log queries slower than threshold to
aid Phase 0 audit.

**The bug:**
We don't currently log slow database queries. N+1 queries and missing
indexes will go undetected during Phase 0 unless we have visibility.

**The fix:**
Wire Prisma's $on('query') event to log queries slower than 200ms in
dev, 500ms in production, with the query text + duration + stacktrace
hint (origin file). Send to Sentry as transaction breadcrumb in prod
so we can query slow-query traces.

**Discovery instructions:**
- Read lib/prisma.ts — confirm current singleton setup
- Check whether log: ['query'] is currently enabled (probably only in
  dev)
- Check if Sentry is wired in middleware / instrumentation
- Read sentry.client.config.* and sentry.server.config.* if they exist

**Implementation intent:**
- lib/prisma.ts: enable query logging in dev (already?) AND production
  (with threshold filter)
- Slow query handler: log to console (dev), send to Sentry as
  performance breadcrumb (prod)
- Threshold env vars: PRISMA_SLOW_QUERY_MS_DEV (default 200),
  PRISMA_SLOW_QUERY_MS_PROD (default 500)
- DON'T log every query in prod — only slow ones
- Sample at 100% for slow queries (we want all of them); don't sample
  fast queries

**Constraints:**
- Don't break existing Prisma client behavior
- Don't add huge log volume — only slow queries
- Don't include query parameters in logs (PII risk)

**Smoke contracts (2):**
1. Positive: lib/prisma.ts has $on("query", ...) handler with duration
   threshold check
2. Negative: lib/prisma.ts does NOT log every query unconditionally in
   production (avoid log spam)

**Stop conditions:**
- If Sentry isn't installed yet, stop — that's a separate Phase Z slice
  (Z.4).

**Branch:** chore/speed-z3-prisma-slow-query off origin/main
**PR title:** chore(speed): instrument Prisma slow query log

Stop and propose plan first.
```

### Z.4 — Sentry Performance refinement (RE-SCOPED — was "enable Sentry Performance")

**Re-scope history (TWO rounds of corrections — kept as historical narrative for future agents):**

- **Original framing (this section, pre-2026-05-03):** "We have NEXT_PUBLIC_SENTRY_DSN configured per CLAUDE.md but performance tracing isn't enabled. Server action timing, API route p50/p95/p99, cold start traces — all unmeasured. Enable Sentry Performance with tracesSampleRate 0.1." Stale.
- **Round 1 correction (Z.3 discovery, 2026-05-03):** Sentry Performance is **already enabled**. `sentry.server.config.ts` and `sentry.edge.config.ts` both call `Sentry.init({ tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1, ... })`. Captured in Z.3's plan-of-record retro section as the trigger for Z.4's first re-scope.
- **Round 2 correction (Z.4 discovery, 2026-05-03):** Round 1's re-scoped kickoff added "client-side Sentry is unconfigured (no `sentry.client.config.ts`)." Technically true (no `sentry.client.config.ts` at root) but **misleading** — `src/instrumentation-client.ts` exists and IS the modern Next.js 15+ file convention for client-side Sentry init. Adding `sentry.client.config.ts` would COLLIDE with this. Captured as a v2.3 methodology candidate: discovery for framework-integration slices should enumerate ALL file naming conventions for the framework version, not just legacy ones the kickoff author was familiar with.

**Final scope as shipped (Z.4 PR):**
1. Defensive DSN hardcode in `next.config.ts` `env` block — mirrors the documented Supabase workaround pattern in CLAUDE.md "Edge env var workaround" (Sentry DSN is a public write-only key, same security category as the already-hardcoded `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. Six `Sentry.startSpan` wraps on high-traffic server-side surfaces: `data-fusion-engine.ts` (`fetchBuildingIntelligence`), `nyc-opendata.ts` (`queryNYC`), `firecrawl.ts` (`firecrawlSearch`), `apollo.ts` (`apolloEnrichPerson`), `email-parser.ts` (Claude `messages.create`), `leasing-engine.ts` (Claude `messages.create` in tool loop).
3. Canonical span-pattern doc-comment in `data-fusion-engine.ts` for future agents to copy.
4. Smoke contracts at `tests/smoke/z4-sentry-performance.test.ts` (4 contracts including PII-safety negative).

**What this slice did NOT ship (and why):**
- No `sentry.client.config.ts` (would collide with `src/instrumentation-client.ts`).
- No prod-side DSN-error verification (cannot reach deployed Chrome console from agent environment). Deferred to `z4-followup-verify-prod-dsn-inlining` per Phase 5 stub.
- More than 6 spans (6-cap per kickoff Q5 — additional surfaces are follow-up slice candidates).

**Branch:** `chore/speed-z4-sentry-spans` off `origin/main`

### Z.5 — Cloud Run cold start measurement

```
Slice Z.5 — capture baseline cold start times for Cloud Run instance
and document the warm-up flow.

**The bug:**
Cloud Run scales to 0 by default (per CLAUDE.md). First request after
idle takes seconds (likely 3-10s). We don't have numbers, don't have a
baseline, don't have a strategy for keeping instances warm.

**The fix:**
Measure cold start from "container start" to "first response served"
across multiple cold-start events. Document the numbers. Propose a
warm-up strategy if numbers are bad (Cloud Scheduler ping every N
minutes, or min-instances=1).

**Discovery instructions:**
- Read cloudbuild.yaml — confirm scaling config (min-instances, max-instances,
  concurrency)
- Read Dockerfile — identify slow startup steps (npm install? prisma
  generate? next build?)
- Check Sentry / Cloud Run logs for any existing cold start traces
- Check if there's already a Cloud Scheduler keepalive — likely no

**Implementation intent:**
- Add a /api/health endpoint that returns 200 with a payload including
  uptime (process.uptime()) so cold starts can be detected
- Add Sentry transaction wrapping on the very first request (mark
  cold-start spans)
- Run 5 cold-start tests (force scale to 0 by waiting, then hit /api/health)
  and capture numbers
- Write findings to docs/handoff/speed-2026-q2-baselines.md
- Propose strategy in PR body (don't implement keepalive yet — that's
  Phase 1)

**Constraints:**
- Don't change current scaling config in this slice (that's a Phase 1
  decision)
- Don't add a keepalive cron in this slice
- /api/health must be unauthenticated (for monitoring)

**Smoke contracts (1):**
1. Positive: /api/health endpoint exists and returns uptime in payload

**Stop conditions:**
- If cold starts are < 1 second, propose skipping the keepalive Phase 1
  work entirely.
- If cold starts are > 15 seconds, surface — that's a much bigger
  problem (likely Docker image bloat or startup script).

**Branch:** chore/speed-z5-cold-start-baseline off origin/main
**PR title:** chore(speed): cold start measurement + /api/health endpoint

Stop and propose plan first.
```

### Z.6 — Speed audit Asana board + SLICES-speed.md

```
Slice Z.6 — set up Asana project + per-audit slice ledger.

This is mostly Nathan's manual setup (Asana doesn't have a great agent
flow), but the deliverable is committed:

Asana setup (Nathan does in browser):
- Create new project: "Speed Audit Q2 2026"
- Sections: Phase Z (Setup), Phase 0 (Discovery), Phase 1 (TBD),
  Phase 2 (TBD), Stakeholder Decisions, Done
- Custom fields: Severity (P0/P1/P2), Phase (Z/0/1/2/3/4/5),
  Area (Calendar/Messages/Market Intel/Underwriting/Terminal/Leasing/
  Onboarding/Pipeline/Contacts/Settings/Properties/Cross-cutting),
  PR Link (URL)
- Cards for each Phase Z slice already filed (Z.1-Z.6)

Repo setup (Claude Code does):
- Create SLICES-speed.md with status legend, phase legend, Z.1-Z.6
  entries already filed
- Update top-level SLICES.md with index pointing to SLICES-speed.md
  (and SLICES-bms.md if it makes sense to rename current SLICES.md
  to SLICES-bms.md as part of this — surface as scope question)

**Branch:** chore/speed-z6-ledger-setup off origin/main
**PR title:** chore(speed): create SLICES-speed.md + index from top-level

Stop and propose plan first (especially the SLICES.md split decision).
```

---

## Phase 0 — Discovery (parallel agent swarm)

After Phase Z is done and baselines are committed, Phase 0 walks every area in parallel.

### Areas (one agent per)

| Area | Surfaces in scope | Likely hot spots |
|------|-------------------|------------------|
| Dashboard | `/dashboard` | Hardcoded data per CLAUDE.md known issue — measure first |
| Contacts | `/contacts`, `/contacts/[id]` | Pagination already done; check enrichment fetch waterfall |
| Pipeline | `/pipeline` | Drag-and-drop perf, deal list size |
| Messages | `/messages` | Gmail sync overhead, thread list size, unread badge query |
| Calendar | `/calendar` | 1900-line component, 4 views; mobile especially |
| Market Intel | `/market-intel`, building profiles | 17 NYC API calls, data fusion engine, map markers |
| Properties | `/properties` | Aggregating 4 sources — likely waterfall |
| Underwriting | `/deals/*` (15+ pages) | PDF generation, AI inference latency |
| Terminal | `/terminal` | Already known: brief generation slow per memory |
| Leasing | `/leasing/*` | Conversation list, follow-up cron, web chat widget |
| BMS | `/brokerage/*` (16+ pages) | Just had an overhaul — check what's left |
| Settings | `/settings/*` (17+ pages) | Per-user settings; mostly small |
| Onboarding | `/brokerage/client-onboarding`, `/sign/[token]` | PDF rendering perf, signing page load |
| Public chat | `/chat/[slug]` | Cold start sensitivity (anonymous load) |
| Public booking | `/book/[slug]` | Cold start sensitivity (anonymous load) |

### Phase 0 swarm prompt

The full swarm prompt template lives at `docs/methodology/templates/phase-0-swarm-prompt.md`. For this audit, fill in the bracketed sections with:

- **AUDIT THEME:** PERFORMANCE
- **Audit name (in audit doc filename):** `speed-2026-q2`
- **Per-surface data points to capture:** use the PERFORMANCE block from the template (LCP/FCP/TTI/TTFB/CLS, server timing p50/p95/p99, slow queries, bundle weight, network waterfall).
- **Severity definitions for this audit:**
  - P0 — page unusable on slow connection (TTI > 5s, or single query > 2s)
  - P1 — degraded UX (TTI 3-5s, or single query 500ms-2s, or bundle > 500KB)
  - P2 — measurable but tolerable
- **Per-area surfaces:** see Areas table above; copy the URLs for the agent's "Surfaces in scope" section.
- **Synthesis step:** see template — runs after all area agents finish.

Spawn agents in batches of 3 (per Open Decisions #8 below) to avoid hammering Sentry, Chrome MCP, and shared services simultaneously.

### Phase 0 synthesis (Nathan + 1 agent)

After all area agents finish:

1. Collect all `docs/handoff/speed-2026-q2-[area]-audit-<date>.md` files.
2. Spawn one synthesis agent to deduplicate cross-area patterns. Output:
   `docs/handoff/speed-2026-q2-synthesis-<date>.md`. Sections:
   - Master ranked list of bugs (P0 → P1 → P2, deduplicated)
   - Cross-cutting patterns that should become single slices (e.g. "all
     pages using lib/contact-enrichment-pipeline.ts are sequential — fix
     once")
   - Quick-win shortlist (top 10 effort-to-impact ratio)
   - Long-tail backlog (everything else, parked as Phase 5 stubs)
3. Nathan reviews and approves the synthesis.
4. Nathan defines Phase 1 scope based on synthesis (typically: top 10-15
   quick wins + one cross-cutting infrastructure slice).

---

## Phase 1+ — Execution (TBD after Phase 0)

Phase 1 scope is intentionally TBD until Phase 0 reveals actual hot spots. Best-guess at audit start:

### Likely Phase 1 themes (not commitments)

- **Database wins** — missing indexes, N+1 queries, over-fetching, sequential where parallelizable. Highest leverage; usually small slices.
- **Bundle wins** — dynamic imports for Leaflet, PDF.js, calendar editor, Mermaid. Image optimization (raw `<img>` → Next.js `<Image>`).
- **Edge middleware audit** — known issue per CLAUDE.md. Probably bloated.
- **Caching wins** — areas without caching that should have it (compare to BuildingCache 3-tier pattern).
- **Cold start mitigation** — Cloud Scheduler keepalive, min-instances tuning.

### Likely Phase 2 themes

- **React render wins** — unnecessary re-renders, memo opportunities, Suspense boundaries.
- **Server vs client component audit** — ensure heavy data-fetching is in RSC.
- **Mobile-specific wins** — slim payloads on mobile breakpoints.

### Likely Phase 3 themes

- **AI inference latency** — Claude calls, Sentry Performance traces, prompt optimization.
- **Document generation** — PDF generation perf (deal PDFs, invoices, signed onboardings).

### Phase N+1 — Closeout

- All baselines re-measured.
- Compare: BEFORE numbers vs AFTER numbers per route.
- Lighthouse CI tightened from warn-only to fail-on-regression.
- Asana board archived.
- Retrospective: `docs/handoff/speed-2026-q2-retrospective-<date>.md`.
- Methodology updates if any patterns surfaced (push to v3 if material).

---

## Open decisions for Nathan (resolve before Phase Z starts)

These need a yes/no before the kickoff prompts can ship as-is. Reasonable defaults proposed; override as needed.

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| 1 | Use Lighthouse CI in Z.2? | Yes | Free, catches regressions automatically. Cost is annoying CI failures. |
| 2 | Run Lighthouse against authenticated routes in baseline? | Defer to follow-up | Setup is fiddly; public routes are still useful baseline. |
| 3 | Sentry Performance sample rate for Z.4? | 0.1 (10%) | Adjustable; start low to control cost. |
| 4 | Cold start strategy if numbers are bad in Z.5? | Decide after measurement | Don't pre-commit; numbers might not justify min-instances=1 cost. |
| 5 | Acceptable slow query threshold for Z.3? | 200ms dev, 500ms prod | Standard observability defaults. |
| 6 | Bundle budget per route — proposed numbers | TBD after Z.1 baseline | Need numbers first. |
| 7 | Split SLICES.md into per-audit files? | Yes — rename current SLICES.md → SLICES-bms.md, create SLICES-speed.md, add top-level SLICES.md as index | Avoids 2000-line ledger. |
| 8 | Phase 0 swarm — run all areas in parallel or in batches? | Batches of 3 | Avoids hammering Sentry / Chrome MCP simultaneously. |
| 9 | Authentication for Phase 0 swarm — share super_admin or use per-area test accounts? | Super_admin OK for read-only audit | Don't want to provision N test accounts. |
| 10 | Should Phase Z include a CI setup slice if no CI exists? | Surface in Z.2 discovery | Don't pre-commit — depends on what's already there. |

---

## Done definition

The speed audit is "done" when:
- [ ] All Phase Z slices merged + verified
- [ ] Phase 0 audit complete: synthesis doc reviewed by Nathan
- [ ] Phase 1+ scope defined and shipped per synthesis
- [ ] Re-measured baselines show measurable improvement on top 10 routes
- [ ] Lighthouse CI tightened from warn-only to fail-on-regression
- [ ] Retrospective written
- [ ] Methodology v3 (if any updates) committed

---

## Constraints / things to NOT do during this audit

- Do NOT optimize anything in Phase 0. Measure only.
- Do NOT change scaling config (min-instances, max-instances, concurrency) without explicit slice + approval.
- Do NOT change Cloud Run region (latency stays comparable for this audit).
- Do NOT swap libraries (e.g. "let's replace Leaflet with Mapbox") without an architecture decision record (ADR).
- Do NOT chase micro-optimizations under 10ms in this audit. Save them for a future polish pass.
- Do NOT touch security boundaries, auth, RLS as part of "speed wins" — security comes first, always.
- Do NOT skip the synthesis step at end of Phase 0. Without it, we end up fixing the same root cause N times across N areas.
