# Foundation / Speed Audit — Slice List (SLICES-speed.md)

**Created:** 2026-05-03 in slice Z.6 (this file's bootstrap commit).
**Audit kickoff doc:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` (Phase Z + 0 kickoff prompts).
**Audit sprint plan:** `docs/handoff/audit-sprint-plan-2026-05-02.md` (10-day target).
**Audit roadmap (master backlog):** `docs/handoff/audit-roadmap-2026-q2-q4.md`.
**Top-level index:** `SLICES.md`.
**Methodology:** v2.2 (`docs/methodology/slice-based-audit.md`).

This file is the single source of truth for the Foundation/Speed audit's
execution. Claude Code agents update status as they finish slices. Nathan
approves at phase boundaries.

---

## Status legend

- `pending` — not started.
- `in_progress` — currently being worked on.
- `awaiting_review` — PR open, waiting for Nathan.
- `done` — PR merged.
- `blocked` — needs Nathan's input (note why).

## Phase legend

- `Z` — Setup (one-time per audit; ledgers, baselines, infrastructure).
- `0` — Discovery (parallel agent swarm; read-only audit per area).
- `1+` — Execution (per-area perf fixes; phase boundaries assigned at
  end of Phase 0).

---

## Phase Z — Setup

Audit infrastructure that must exist before Phase 0 discovery can run.
Per methodology v2.2 §"Phase Z — Setup": ledger, kickoff doc, sprint
plan, methodology version pin, CI harness, e2e harness, observability
baselines.

### Z.6 — Per-audit ledger split + SLICES-speed.md bootstrap
- **Status:** `done` (PR #49, merged 2026-05-03)
- **Goal:** Split top-level `SLICES.md` into per-audit ledgers (`SLICES-bms.md` + `SLICES-speed.md`); rebuild top-level `SLICES.md` as audit ledger index; pre-file 7 skeletal Phase Z entries (Z.0a, Z.0b, Z.1-Z.5) so the next slice (Z.0a) has a real plan-of-record location. **Re-ordered to ship FIRST in Phase Z** (kickoff doc lists this last as Z.6, but every other Phase Z slice references SLICES-speed.md, so this must exist before they ship).
- **Files in scope:**
  - `SLICES.md` (rename → `SLICES-bms.md` via `git mv`; recreate as new index)
  - `SLICES-speed.md` (new, this file)
  - `tests/smoke/p5-stub-naming.test.ts`, `tests/smoke/bms-audit-closeout.test.ts`, `tests/smoke/gcloudignore.test.ts` (read-target update SLICES.md → SLICES-bms.md)
  - `tests/smoke/slices-split.test.ts` (new — 4 contracts)
  - Comment-only refs: `src/app/page.tsx`, `tests/smoke/role-landing.test.ts`, `tests/smoke/onboarding-agent-picker.test.ts`, `tests/smoke/signing-fixes-D.test.ts`, `tests/smoke/override-scoping.test.ts`, `CLAUDE.md` (BMS-section refs only), `docs/handoff/bms-overhaul-bootstrap.md`, `docs/handoff/bms-overhaul-retrospective-2026-05-02.md`
- **Smoke contract regex pins (4):**
  1. **C1 — Index file structure:** top-level `SLICES.md` exists, contains `Audit Ledger Index` header, references both `SLICES-bms.md` and `SLICES-speed.md`.
  2. **C2 — BMS file preserved:** `SLICES-bms.md` exists AND retains audit-closed gate header (regex pin `/BMS Overhaul — Audit Closed/`).
  3. **C3 — Speed file populated:** `SLICES-speed.md` contains all 8 Phase Z entries (Z.0a, Z.0b, Z.1, Z.2, Z.3, Z.4, Z.5, Z.6 — regex pin per entry).
  4. **C4 — Index doesn't accumulate audit content:** top-level `SLICES.md` does NOT contain `slice 22-as-org-vault`, `gcloudignore`, or `BMS Overhaul — Audit Closed`. Catches future drift where someone appends an audit's stubs to the index.
- **Estimated lines:** ~345 of NEW authored content (excludes the SLICES-bms.md content moved via `git mv`).

## Plan of record

**Three-commit choreography (one PR):**

1. **`chore(slices): rename SLICES.md → SLICES-bms.md`** — `git mv` to preserve history. 1-line header note in SLICES-bms.md pointing at this slice + methodology v2.2 §"Split convention". Update 3 smoke tests that `read("SLICES.md")` to `read("SLICES-bms.md")`.

2. **`chore(slices): create top-level SLICES.md as audit ledger index`** — new ~40-line index with rows for BMS Overhaul (Closed) and Foundation/Speed Audit (Active), convention notes, and the agent discovery loop pointer.

3. **`chore(speed): create SLICES-speed.md + smoke contract + reference cleanup`** — this file (Z.6 plan-of-record + 7 skeletal entries), `tests/smoke/slices-split.test.ts` (4 contracts), and TARGETED reference cleanup:
   - `CLAUDE.md` BMS-section refs (lines ~931, 952, 953, 964, 984, 1006, 1047) — mechanical "SLICES.md" → "SLICES-bms.md" within the explicitly-BMS-scoped operating-principles block. Out-of-scope: broader CLAUDE.md restructure (audit is closed; deferred).
   - `src/app/page.tsx` lines 36, 40 — comment refs to BMS slices (1b, 3.Z) → "SLICES-bms.md".
   - 4 smoke tests with comment-only refs to BMS slices: `role-landing.test.ts`, `onboarding-agent-picker.test.ts`, `signing-fixes-D.test.ts`, `override-scoping.test.ts`.
   - `docs/handoff/bms-overhaul-bootstrap.md`, `docs/handoff/bms-overhaul-retrospective-2026-05-02.md` — BMS docs naming the BMS ledger.
   - **Out of scope:** methodology + templates + audit-sprint-plan + speed audit doc (refs are correct as-is; methodology refers to "SLICES.md" generically as the pattern).

**Variance from 280-line stop condition:** estimated ~345 lines, ~65-line variance. Surfaced + approved by Nathan with the precedent that splitting Z.6a (rename+index) and Z.6b (SLICES-speed.md + 7 entries) would create a transient broken state on `main` between merges (Z.6a's index would reference SLICES-speed.md that doesn't exist until Z.6b ships). Atomicity wins. Same precedent: PR #47 (310-355 line variance) and PR #48 (~150 + 2,729 tracked).

**Cross-slice flip pattern (called out per Q3 approval):** Z.6's status flow is `in_progress` (commit 3 baseline) → `awaiting_review` (this PR's final amendment commit) → `done` (Z.0a's PR, one-line amendment at start). Same cross-slice flip pattern as slice 22 (closed in PR #45), gcloudignore (closed in PR #46), and slices-stub-naming-cleanup (closed in PR #47). The retrospective flagged outcome-line enforcement as a v2.3 candidate; until it ships, **documentation IS the fix** — calling out the cross-slice dependency explicitly here so the next reader knows where to find Z.6's `done` flip.

**Stop conditions internalized:**
- DO NOT modify SLICES-bms.md content beyond the 1-line header note.
- DO NOT pre-emptively rewrite CLAUDE.md's broader operating-principles section (BMS audit is closed; broader retirement is a follow-up project).
- DO NOT migrate BMS Phase 5 stubs to SLICES-speed.md — they remain in SLICES-bms.md as that audit's polish backlog.
- If `git mv SLICES.md SLICES-bms.md` reveals uncommitted content, STOP — branch should be clean off origin/main.

**Open questions for Nathan:** none (5 questions answered + variance approved).

- **Files:** see Plan of record above.
- **Success criteria:** new smoke test passes (4 contracts); existing 363/363 vitest suite still green; typecheck baseline ≤285 holds; build clean. `git log --follow SLICES-bms.md` shows BMS commit history (rename preserved).
- **Depends on:** PR #48 (`bms-audit-closeout-followup-methodology-tracking`, merged 2026-05-03) — methodology v2.2 §"Split convention" and audit infrastructure docs must exist on `origin/main`.
- **Requires approval:** Pre-approved by Nathan (5 questions answered + variance + cross-slice flip pattern documented).
- **Outcome:** Shipped via PR #49 (merged 2026-05-03, commit b5a8cc5). Three artifacts landed: (1) `git mv SLICES.md SLICES-bms.md` with history preserved (`git log --follow SLICES-bms.md` shows the BMS commit chain pre-rename); (2) new top-level `SLICES.md` as ~30-line audit ledger index with rows for BMS Overhaul (Closed) and Foundation/Speed Audit (Active); (3) `SLICES-speed.md` (this file) with 8 Phase Z entries pre-filed and 14-case smoke contract at `tests/smoke/slices-split.test.ts`. Targeted reference cleanup in CLAUDE.md BMS section + `src/app/page.tsx` + 4 smoke test comments + retrospective line 81. Cross-slice flip per documented pattern: Z.6 status flipped from `awaiting_review` to `done` in this slice's (Z.0a's) opening commit. Variance from 280-line stop condition (~345 lines total) approved + documented; precedent: PR #47 (310-355) and PR #48 (~150 + 2,729 tracked).

---

### Z.0a — GitHub Actions CI skeleton
- **Status:** `awaiting_review` (PR #50)
- **Goal:** Establish `.github/workflows/` with PR-blocking jobs for typecheck, lint, test, build, and smoke contracts. Replaces the v2.1.1 interim manual-checklist pattern with real CI per methodology v2.2 §"Required infrastructure".
- **Files in scope:**
  - `.github/workflows/ci.yml` (new — single workflow, 4 parallel jobs)
  - `tests/smoke/z0a-gh-actions.test.ts` (new — 3 contracts)
- **Smoke contract regex pins (3):**
  1. **C1 — workflow file shape:** `.github/workflows/ci.yml` exists; contains all 4 job IDs (`typecheck:`, `lint:`, `test:`, `build:`).
  2. **C2 — triggers:** workflow `on:` block contains both `pull_request:` AND `push:`.
  3. **C3 — Node version pinned:** workflow uses `node-version: '20'` (matches Dockerfile `FROM node:20-alpine`).
- **Estimated lines:** ~170 (80 workflow + 60 smoke + 30 SLICES-speed.md).

## Plan of record

**Three-commit choreography (one PR):**

1. **`chore(slices): flip Z.6 done with PR #49 outcome line`** — cross-slice flip per the pattern documented in Z.6's plan-of-record. One-line status flip + outcome line filled with PR #49's landed artifacts. Mirrors PRs #45/#46/#47/#48.

2. **`chore(speed): append Z.0a plan-of-record to SLICES-speed.md`** — this commit. Append plan-of-record block to the existing skeletal Z.0a entry; flip status `pending` → `in_progress`. Per methodology v2.2 §"Plan-of-record artifact format" + §2 Plan-of-record gate.

3. **`feat(speed): add GitHub Actions CI workflow with typecheck/lint/test/build`** — `.github/workflows/ci.yml` (4 parallel jobs, ubuntu-latest, Node 20, npm cache enabled, prisma generate where types are needed) + `tests/smoke/z0a-gh-actions.test.ts` (3 contracts).

**Workflow design:**
- **Triggers:** `pull_request: branches: [main]` AND `push: branches: [main]` (per Q2 — both, scoped to main on push). Feature-branch pushes don't duplicate-run because the PR run covers them.
- **Permissions:** `contents: read` only (least privilege).
- **Jobs (4, parallel):**
  - `typecheck` — `npm ci` → `npx prisma generate` → inline baseline-check shell counting `tsc --noEmit` errors; fails only if `> 285` (CLAUDE.md anchor).
  - `lint` — `npm ci` → inline baseline-check counting `npm run lint` errors; fails only if `> 4484` (CLAUDE.md anchor). No prisma generate (lint doesn't read generated types — saves ~5s per Q3).
  - `test` — `npm ci` → `npx prisma generate` → `npm run test`. Vanilla pass/fail at 377/377.
  - `build` — `npm ci` → `npx prisma generate` → `npm run build`. Vanilla pass/fail.
- **No deploy step** — Cloud Build keeps doing that. **No e2e** — that's Z.0b. **No Lighthouse** — that's Z.2.

**Why inline baseline-check wrappers:** `tsc --noEmit` exits non-zero with any error. Codebase has 285 pre-existing typecheck errors and 4484 lint errors. Without wrappers, both jobs would be RED forever (until Phase 3 cleanup ships) — defeats branch-protection gating. Wrappers count errors and fail only when `> baseline`. Per Q1, kept inline (4-line shell per job, self-contained yml). If Z.0b/Z.2 add more baseline-checked dimensions (3+), refactor to `scripts/ci-*.sh` then. **Methodology innovation flag (per Nathan's observation):** if the pattern repeats in Z.0b/Z.2, document in v2.3 retro candidate as "baseline-check wrapper" — turns "baselines hold" principle into PR-blocking enforcement. Don't add to methodology now; wait for evidence.

**Status-check naming contract (per Q5 — committed for branch protection stability):**
- Names: `typecheck`, `lint`, `test`, `build`. **Stable.** Branch protection rules match by job name; renaming requires updating branch protection.
- Future slices ADD names (Z.0b → `e2e`, Z.2 → `lighthouse-warn`). Never rename existing names. Documented in PR body so the convention persists.

**Branch protection setup (per Q4 — Nathan-side, admin access required):**
- GitHub Settings → Branches → Add rule for `main` → Require status checks to pass before merging → Require branches up-to-date before merging → Select all 4 status checks (`typecheck`, `lint`, `test`, `build`).
- PR body includes the verbatim checklist.

**Stop conditions internalized:**
- If CI typecheck > 285 (clean tree), surface — likely env diff or untracked-file pollution. Methodology: don't anchor silently.
- If CI lint > 4484, document workflow file in lint-ignore or surface new baseline.
- If `next build` needs `DATABASE_URL` or other secrets we don't have configured, surface the list — Nathan configures in repo settings.
- If `npm ci` times out on cold cache, propose dependency-caching strategy refinement.
- If branch protection requires GitHub PRO/Team plan beyond what's already in place, surface.

**Open questions for Nathan:** none after pre-approval round (5 questions answered).

**Discovery findings:**
- `next.config.ts` hardcodes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` per CLAUDE.md known-issue → CI build doesn't need them as env vars.
- `next.config.ts` has `typescript: { ignoreBuildErrors: true }` → `npm run build` succeeds even with the 285-error TS backlog. Strict TS check is `npm run typecheck` (separate job).
- Sentry source map upload conditional on `SENTRY_AUTH_TOKEN` (defaults disabled in CI per `disable: !process.env.SENTRY_AUTH_TOKEN`) — no Sentry secret required.
- Prisma generate creates client code only — no DB connection — works fine in CI without `DATABASE_URL`.
- No existing `.github/workflows/` directory (confirmed with `ls`).
- `npm run check` script exists but runs all 4 in series → CI splits into parallel jobs for faster feedback.

- **Files:** see Plan of record above.
- **Success criteria:** new smoke test passes (3 contracts); existing 377/377 vitest suite still green; `.github/workflows/ci.yml` exists; first PR run goes green on all 4 jobs (the verification artifact for Z.0a per kickoff).
- **Depends on:** PR #49 (Z.6, merged 2026-05-03) — SLICES-speed.md must exist for the plan-of-record append.
- **Requires approval:** Pre-approved by Nathan (5 questions answered + variance OK at 170 lines well under 280-line ceiling).
- **Outcome:** _filled in at gate-run time. Z.0a's `done` flip lands in Z.0b's PR per cross-slice flip pattern (continuing the Z.6 → Z.0a flow)._
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.0a".
- **Branch:** `chore/speed-z0a-gh-actions` off `origin/main`.

### Z.0b — Playwright harness scaffold
- **Status:** `pending`
- **Goal:** Install `@playwright/test`, scaffold `tests/e2e/`, implement first 5 critical flows (login, create contact, create deal submission, send Gmail reply, market intel address search). Closes the v2.1.1 caveat that gate verification falls back to manual Chrome MCP walks.
- **Files likely involved:** `package.json` (add `@playwright/test`), `playwright.config.ts` (new), `tests/e2e/*.spec.ts` (new, 5 specs).
- **Smoke contract idea:** at least 1 contract — playwright config exists + each of the 5 flow specs exist + `npm run e2e` script is wired. Pinned at `tests/smoke/z0b-playwright.test.ts`.
- **Stop conditions:** If line count exceeds 280, split: Z.0b1 (config + login flow) and Z.0b2 (other 4 flows). If staging URL auth requires complex setup, surface options.
- **Estimated lines:** ~250 (config + 5 specs + npm script + smoke).
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.0b".
- **Branch (when started):** `chore/speed-z0b-playwright` off `origin/main`.

### Z.1 — Bundle analyzer baseline + report
- **Status:** `pending`
- **Goal:** Add `@next/bundle-analyzer`, wire behind `ANALYZE=true` env flag, capture baseline edge + client bundle sizes for top 10 routes. Commit baseline numbers to `docs/handoff/speed-2026-q2-baselines.md`. Purely observational — no code refactor.
- **Files likely involved:** `next.config.ts` (wrap with analyzer), `package.json` (add devDep + `analyze` script), `docs/handoff/speed-2026-q2-baselines.md` (new — baseline doc).
- **Smoke contract idea (2):** `package.json` has `analyze` script with `ANALYZE=true`; `next.config.ts` wraps config with bundle analyzer behind env flag (regex pin `withBundleAnalyzer\(.+\)` or equivalent).
- **Stop conditions:** If analyzer is incompatible with Next.js 16 / Turbopack, surface alternatives.
- **Estimated lines:** ~80 (config + baseline doc).
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.1".
- **Branch (when started):** `chore/speed-z1-bundle-analyzer` off `origin/main`.

### Z.2 — Lighthouse CI + Web Vitals baseline
- **Status:** `pending`
- **Goal:** Capture Core Web Vitals (LCP, FCP, TTI, TTFB, CLS) for top 10 routes on every PR via Lighthouse CI, with one-time baseline capture. Warn-only initially.
- **Files likely involved:** `lighthouserc.json` (new), `.github/workflows/lighthouse.yml` (new — depends on Z.0a), `package.json` (add `@lhci/cli` + `lighthouse` script), `docs/handoff/speed-2026-q2-baselines.md` (extend with Web Vitals section).
- **Smoke contract idea (2):** `lighthouserc.json` exists with ≥10 URLs; `npm run lighthouse` script exists.
- **Stop conditions:** Depends on Z.0a (no CI = no Lighthouse CI). Authenticated route testing may need a separate slice if cookie injection setup is complex.
- **Estimated lines:** ~150 (lighthouserc + workflow + baseline rows).
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.2".
- **Branch (when started):** `chore/speed-z2-lighthouse-ci` off `origin/main`.

### Z.3 — Prisma slow query log
- **Status:** `pending`
- **Goal:** Wire Prisma `$on('query')` to log queries slower than threshold (200ms dev, 500ms prod). Send to Sentry as performance breadcrumb in prod. Aids Phase 0 N+1 / missing-index detection.
- **Files likely involved:** `lib/prisma.ts` (singleton — add slow-query handler), `instrumentation.ts` if exists (sentry wiring).
- **Smoke contract idea (2):** `lib/prisma.ts` has `$on("query", ...)` with threshold filter; does NOT log every query unconditionally in production.
- **Stop conditions:** If Sentry isn't installed yet, stop — that's Z.4 first.
- **Estimated lines:** ~60.
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.3".
- **Branch (when started):** `chore/speed-z3-prisma-slow-query` off `origin/main`.

### Z.4 — Sentry Performance enable + server action timing
- **Status:** `pending`
- **Goal:** Enable Sentry Performance (`tracesSampleRate: 0.1`), wrap highest-traffic server actions + lib/data-fusion-engine + lib/nyc-opendata + lib/firecrawl + AI inference + Apollo/PDL with custom spans. Server-side only initially.
- **Files likely involved:** `sentry.server.config.*` (new or modify), `lib/data-fusion-engine.ts`, `lib/nyc-opendata.ts`, `lib/firecrawl.ts`, server actions in highest-traffic areas.
- **Smoke contract idea (2):** Sentry init has `tracesSampleRate` from env var; ≥1 custom span exists in `lib/data-fusion-engine.ts` or `lib/nyc-opendata.ts`.
- **Stop conditions:** If Sentry isn't installed at all, this slice expands beyond Phase Z scope — surface options.
- **Estimated lines:** ~150.
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.4".
- **Branch (when started):** `chore/speed-z4-sentry-performance` off `origin/main`.

### Z.5 — Cloud Run cold start measurement
- **Status:** `pending`
- **Goal:** Measure baseline cold start time (container start → first response). Add `/api/health` endpoint with `process.uptime()` payload for cold-start detection. Document numbers in `speed-2026-q2-baselines.md`. **Don't implement keepalive** — that's a Phase 1 decision.
- **Files likely involved:** `src/app/api/health/route.ts` (new, unauthenticated), `docs/handoff/speed-2026-q2-baselines.md` (extend).
- **Smoke contract idea (1):** `/api/health` endpoint exists and returns `uptime` field.
- **Stop conditions:** If cold starts are <1s, propose skipping the keepalive Phase 1 work entirely. If >15s, surface — likely Docker bloat or startup script issue.
- **Estimated lines:** ~50.
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.5".
- **Branch (when started):** `chore/speed-z5-cold-start-baseline` off `origin/main`.

---

## Phase 0 — Discovery (parallel agent swarm)

To be filled at Phase 0 swarm time. Per methodology v2.2 §"Phase 0 —
Discovery": one read-only audit agent per area, swarm prompt template
at `docs/methodology/templates/phase-0-swarm-prompt.md`, areas
enumerated in `docs/handoff/site-wide-speed-audit-2026-05-02.md`
§"Phase 0 — Discovery".

_Empty until Phase Z gate signed off._

---

## Phase 1+ — Execution

To be filled after Phase 0 swarm reports land. Phase boundaries assigned
based on highest-impact areas (likely: cross-cutting infra → individual
hot pages).

_Empty until Phase 0 reports land + Nathan assigns phase scopes._

---

## Phase 5 — Polish backlog

Stubs deferred during Phase 1+ execution. Same format as methodology
v2.2 §"Phase 5 stubs": `<parent-slice-id>-followup-<short-name>`.

_Empty — populated as slices ship and surface deferrable work._
