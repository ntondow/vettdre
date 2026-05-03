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
- **Status:** `done` (PR #50, merged 2026-05-03)
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

**Discovery during CI (2026-05-03 amendment):** First PR-blocking CI run failed typecheck — local-filtered count was 287 (= 285 clean baseline + 2 dupe drift per CLAUDE.md), CI clean-checkout count was 515. **228-error gap.** Methodology v2.2 §"Verified-claim audit pattern" caught this on the first run that could enforce it — the v2.2 tightening shipped in PR #48 just two hours before this CI ran, and the worked example is now self-referential. Resolution: re-anchor CI threshold from 285 to 515 (CI canonical going forward); preserve the 285 anchor in CLAUDE.md as historical context; file Phase 5 stub `z0a-followup-typecheck-gap-investigation` with three working hypotheses for diff-and-categorize triage. **Methodology innovation flag (per Nathan's prior observation):** the inline baseline-check wrapper not only enforces baselines — it surfaces local-vs-CI drift on the first run, a stronger property than the methodology anticipated. Worth documenting in v2.3 retro candidate.

- **Files:** see Plan of record above + amendment touches `.github/workflows/ci.yml` (threshold), `CLAUDE.md` (new 515 anchor below 285 anchor), `SLICES-speed.md` (new Phase 5 stub + this Discovery section).
- **Success criteria:** new smoke test passes (3 contracts); existing 377/377 vitest suite still green; `.github/workflows/ci.yml` exists; first PR run goes green on all 4 jobs **after the 285→515 amendment** (the verification artifact for Z.0a per kickoff).
- **Depends on:** PR #49 (Z.6, merged 2026-05-03) — SLICES-speed.md must exist for the plan-of-record append.
- **Requires approval:** Pre-approved by Nathan (5 questions answered + variance OK at 170 lines well under 280-line ceiling).
- **Outcome:** Shipped via PR #50 (merged 2026-05-03). 4-job CI live on `origin/main` with branch protection. First CI run caught typecheck baseline drift (285 → 515 re-anchored to CI canonical) — methodology v2.2 §verified-claim audit pattern caught its first drift. See `z0a-followup-typecheck-gap-investigation`.
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.0a".
- **Branch:** `chore/speed-z0a-gh-actions` off `origin/main`.

### Z.0b — Playwright harness scaffold (local dev target)
- **Status:** `done` (PR #51, merged 2026-05-03)
- **Goal:** Install `@playwright/test`, scaffold `tests/e2e/`, implement first 4 of the kickoff's 5 critical flows against `http://localhost:3000` (deal-submission flow #3 deferred — see Q2). Closes the v2.1.1 caveat that gate verification falls back to manual Chrome MCP walks. **Local dev target** (decided 2026-05-03 by Nathan): no staging infra exists; dedicated staging is 2-3 weeks of work; Cloud Run preview URLs add complexity. Migration to staging is filed as `z0b-followup-staging-target`.
- **Files in scope:**
  - `package.json` (add `@playwright/test` devDep + `e2e`/`e2e:headed`/`e2e:ui` scripts)
  - `playwright.config.ts` (new, ~50 lines — `baseURL` from env w/ `localhost:3000` default, `webServer` auto-starts `next dev`, single chromium project)
  - `tests/e2e/_setup/auth.ts` (new — login helper; stores auth state to `playwright/.auth/user.json` for spec reuse)
  - `tests/e2e/_setup/test-data.ts` (new — exports test creds from env, fails loudly if not set)
  - `tests/e2e/01-login.spec.ts`, `02-create-contact.spec.ts`, `04-send-gmail-reply.spec.ts` (`.skip` placeholder per kickoff), `05-market-intel-search.spec.ts` (4 specs; gap at `03` is intentional per Q3)
  - `tests/smoke/z0b-playwright.test.ts` (new — 3 contracts)
  - `.gitignore` (add `playwright-report/`, `test-results/`, `playwright/.auth/`)
  - `docs/playwright-setup.md` (new, ~30 lines — env vars, test-user provisioning, run instructions)
- **Smoke contract regex pins (3):**
  1. **C1 — config exists with env-overridable baseURL:** `playwright.config.ts` contains both `process.env.PLAYWRIGHT_BASE_URL` AND `localhost:3000`.
  2. **C2 — at least 4 specs:** `tests/e2e/` glob count of `*.spec.ts` files ≥ 4 (was ≥5 in kickoff; adjusted for option (a) defer of flow 3).
  3. **C3 — npm script wired:** `package.json` `scripts` block contains `"e2e":` key.
- **Estimated lines:** ~330 NEW authored content. Excludes `package-lock.json` deltas from `npm install @playwright/test` (tooling content, not work content per the same convention used for SLICES-bms.md `git mv` and methodology tracking).

**Methodology → kickoff → spec-file mapping table (per Nathan's ask):**

| Methodology #§"Required infrastructure" flow | Kickoff scope | This slice | Status |
|---|---|---|---|
| 1. Login + redirect to dashboard | Flow 1 | `01-login.spec.ts` | Shipped |
| 2. Create contact → pipeline → advance stage | Flow 2 (simplified — just create) | `02-create-contact.spec.ts` | Shipped (simplified) |
| 3. Public deal submission → manager approves → invoice | Flow 3 (simplified — just public submit) | _deferred_ | `z0b-followup-flow-3-deal-submission-seed` (needs seed) |
| 4. Send Gmail reply with template merge fields | Flow 4 | `04-send-gmail-reply.spec.ts` | Shipped (`test.skip()` until test user has Gmail OAuth) |
| 5. Showing slot creation → public booking → agent sees | _Substituted_ | _deferred_ | `z0b-followup-flow-5-showing-booking` (Twilio + calendar deps make local-dev playwright struggle) |
| 6. Market intel address search → building profile → prospecting | Flow 5 (kickoff substituted #6 for #5) | `05-market-intel-search.spec.ts` | Shipped |
| 7-10. Underwrite/onboarding/bulk-invoice/terminal | _deferred_ | — | `z0b-followup-flows-6-10` (capacity/Phase 1) |

Future agents picking up follow-ups: the gap at `03-*.spec.ts` is the visual signal that flow 3 was deferred. When `z0b-followup-flow-3-deal-submission-seed` ships, fill the `03` slot. Methodology flow #5 (showing booking) gets a future `06-showing-booking.spec.ts` (or whichever number is unused at that time) — keep the methodology-flow-number → spec-number mapping consistent with this table.

## Plan of record

**Three-commit choreography (one PR):**

1. **`chore(slices): flip Z.0a done with PR #50 outcome line`** — cross-slice flip per documented pattern. SLICES-speed.md only.

2. **`chore(speed): append Z.0b plan-of-record + 5 follow-up stubs`** — this commit. Append plan-of-record (with mapping table) to existing skeletal Z.0b entry; flip status `pending` → `in_progress`; file 5 Phase 5 stubs (see below).

3. **`feat(speed): scaffold playwright harness with first 4 flows (local dev target)`** — `npm install --save-dev @playwright/test`, `playwright.config.ts`, `tests/e2e/` directory + 4 specs + 2 helpers, smoke contract, `.gitignore` updates, setup doc, 3 npm scripts.

**Phase 5 stubs filed in commit 2:**
1. `z0b-followup-flow-3-deal-submission-seed` — implement deferred flow 3 with seed strategy (Prisma direct insert vs. agent-create chain).
2. `z0b-followup-flow-5-showing-booking` — implement methodology §"Required infrastructure" flow #5 (substituted by kickoff with market intel for this slice).
3. `z0b-followup-staging-target` — migrate playwright target from local dev to staging when infra matures (Cloud Run preview / dedicated staging service / test tenant in prod).
4. `z0b-followup-ci-integration` — wire `npm run e2e` into GH Actions as 5th required status check. Blocked on: staging target OR a CI-friendly DB seeding strategy.
5. `z0b-followup-flows-6-10` — implement remaining methodology flows (underwrite/LOI, onboarding/sign, bulk invoice, terminal feed). Phase 1 slice when capacity permits.

**Variance from 280-line stop condition:** ~330 lines, ~50-line variance. **Surfaced + approved by Nathan** with the precedent that splitting Z.0b1 (config + login) + Z.0b2 (other 3 flows) would fragment a logically-atomic setup slice. Same precedent class as PR #47 (310-355) and PR #48 (~150 + 2,729 tracked) and PR #49 (~345 + ~1,300 moved).

**Cross-slice flip pattern (continuing the Z.6 → Z.0a → Z.0b chain):** Z.0b's status flow is `in_progress` (commit 2 baseline) → `awaiting_review` (this PR's final amendment commit) → `done` (Z.1's PR, one-line amendment at start). Same pattern as PRs #45/#46/#47/#48/#49/#50. Documented here so the next reader knows where to find Z.0b's `done` flip (it lives in Z.1's PR).

**Stop conditions internalized:**
- Don't run against prod (URL hardcoded localhost in default; `PLAYWRIGHT_BASE_URL` env var lets users override).
- Don't store credentials in repo. Test creds come from `.env.local` (gitignored).
- Test user must be a dedicated playwright test account, NOT Nathan's super_admin login. Provisioning steps documented in PR body + `docs/playwright-setup.md`.
- DO NOT wire to GH Actions yet. Z.0b ships LOCAL-ONLY. CI integration is `z0b-followup-ci-integration`.
- DO NOT mock significant data. Tests hit real local dev server with real Prisma queries against Nathan's local DB.
- If `npm install @playwright/test` adds >100 MB to node_modules and significantly slows install, flag.
- If `next dev` startup makes `webServer` flaky, propose healthcheck endpoint.

**Open questions for Nathan:** none after pre-approval round (5 questions answered + mapping-table ask incorporated above).

**Discovery findings:**
- `@playwright/test` appears in `package-lock.json` only as a peer dep of Next.js 16.1.6 — not actually installed. Fresh `npm install --save-dev @playwright/test` needed.
- No `e2e` script collision; no `dotenv-cli`; `.env.local` already exists for test creds.
- Login flow uses `supabase.auth.signInWithPassword` → redirects to `/` → `landingForRole(role)` routes to role-specific landing (super_admin → `/dashboard`, owner/admin/manager → `/brokerage/dashboard`, agent → `/brokerage/my-deals`).
- Flow 3 (deal submission via public token) requires a seeded `DealSubmission` row with the token — fresh local DB has no tokens. Stop condition triggered; Q2 resolved by deferring flow 3 (option (a)).
- Methodology §"Required infrastructure" flow 5 is showing-booking; kickoff substituted market intel (methodology #6) for it. Q1 resolved by shipping kickoff's 5 + filing methodology #5 as `z0b-followup-flow-5-showing-booking`.
- Test accounts per methodology §"Test accounts" live in 1Password under "VettdRE — audit test accounts" — Nathan provisions; creds go into `.env.local`.

- **Files:** see Files in scope above.
- **Success criteria:** new smoke test passes (3 contracts); existing 385/385 vitest suite still green; `playwright.config.ts` exists; CI's 4 jobs (typecheck, lint, test, build) all green on PR (verification artifact for CI continuity); `npm run e2e` runs locally — passing/skipping per spec, output pasted into PR comment as Z.0b's verification artifact per kickoff.
- **Depends on:** PR #50 (Z.0a, merged 2026-05-03) — CI must exist for the smoke test job to run; methodology v2.2 + audit infrastructure docs on `origin/main` (PR #48).
- **Requires approval:** Pre-approved by Nathan (5 questions answered + variance OK + mapping table ask incorporated).
- **Outcome:** Shipped via PR #51 (merged 2026-05-03). Playwright harness scaffolded with 4 specs (login, contact, gmail, market intel; flow #3 deferred per `z0b-followup-flow-3-deal-submission-seed`). All 4 CI jobs green. Test user provisioning + first local `npm run e2e` deferred per `z0b-followup-verify-e2e-runs` (Path A — speed of Phase Z over full e2e verification of scaffold).
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.0b".
- **Branch:** `chore/speed-z0b-playwright` off `origin/main`.

### Z.1 — Bundle analyzer baseline + report
- **Status:** `done`
- **Goal:** Add `@next/bundle-analyzer@16.1.6` (matches Next.js exact version), wire behind `ANALYZE=true` env flag, capture real baseline edge + client bundle sizes for top 10 routes by running `ANALYZE=true npm run build` locally. Commit baseline numbers to `docs/handoff/speed-2026-q2-baselines.md`. Purely observational — no code refactor.
- **Files in scope:**
  - `package.json` (add `@next/bundle-analyzer` devDep + `analyze` script)
  - `next.config.ts` (wrap with `withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })`; preserve hardcoded `NEXT_PUBLIC_*` env per CLAUDE.md known issue; preserve outer `withSentryConfig` wrap)
  - `docs/handoff/speed-2026-q2-baselines.md` (new — header + methodology note + 10 route sections + aggregate stats + webpack-vs-Turbopack known-limitation callout)
  - `tests/smoke/z1-bundle-analyzer.test.ts` (new — 3 contracts)
- **Smoke contract regex pins (3):**
  1. **C1 — `analyze` npm script wired:** `package.json` `scripts` block contains `"analyze":` with `ANALYZE=true` substring.
  2. **C2 — config wrapped:** `next.config.ts` references both `withBundleAnalyzer` AND `process.env.ANALYZE`.
  3. **C3 — baselines doc populated:** `docs/handoff/speed-2026-q2-baselines.md` exists with ≥10 `### ` route headers.
- **Estimated lines:** ~250 (config wrap ~5 + npm script 2 + baselines doc ~120 + smoke ~60 + SLICES-speed.md ~60). Under 280-line ceiling — no variance.

## Plan of record

**Three-commit choreography (one PR):**

1. **`chore(slices): flip Z.0b done with PR #51 outcome line + file z0b-followup-verify-e2e-runs`** — cross-slice flip per documented pattern (verbatim outcome from kickoff) + new Phase 5 stub for Path A deferral.

2. **`chore(speed): append Z.1 plan-of-record + capture v2.3 retro candidates`** — this commit. Append plan-of-record; flip Z.1 `pending` → `in_progress`; capture two v2.3 retro candidates per Nathan's notes (CI bundle capture if local-vs-CI bundle drift surfaces; per-audit subdirectory pattern for Phase Z deliverables).

3. **`feat(speed): add bundle analyzer + baseline report`** — install `@next/bundle-analyzer@16.1.6`, wrap `next.config.ts` (analyzer inside Sentry), add `analyze` script, run `ANALYZE=true npm run build` locally, capture per-route numbers in `speed-2026-q2-baselines.md`, ship smoke contract.

**Wrap order in `next.config.ts`:**
```ts
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
export default withSentryConfig(withBundleAnalyzer(nextConfig), { ... });
```
Default ANALYZE unset → analyzer disabled → behavior identical to today. Hardcoded `NEXT_PUBLIC_*` env preserved (CLAUDE.md known issue stays intact).

**Top 10 routes for baseline (from CLAUDE.md project structure):**
1. `/dashboard` — Home dashboard
2. `/contacts` — CRM contacts list
3. `/pipeline` — Kanban deal board
4. `/messages` — Gmail inbox (likely large per messages-view.tsx pattern)
5. `/calendar` — 1900-line component per CLAUDE.md known issue
6. `/market-intel` — NYC property intelligence (17 NYC API integrations)
7. `/deals` — Deal Modeler / Underwriting (15+ sub-pages root)
8. `/terminal` — NYC Real Estate Terminal
9. `/brokerage/transactions` — BMS transactions pipeline
10. `/leasing/setup` — AI Leasing Agent setup wizard

**Webpack-vs-Turbopack risk callout (per Q1):** Baselines doc will include a "Known limitation" section noting that `@next/bundle-analyzer` wraps webpack. ~~Our build is webpack today (`next build` without `--turbopack` flag); if a future slice switches build to Turbopack, the analyzer silently becomes a no-op until Vercel ships a Turbopack-native analyzer.~~ **Reframed during implementation (2026-05-03):** Next.js 16's default build is *already* Turbopack — the analyzer would be a no-op without intervention. Z.1's `analyze` script forces `next build --webpack` so the analyzer has something to instrument; the baselines doc carries the caveat that the captured numbers are webpack-bundled, not the Turbopack-default view Cloud Run serves. Re-baseline once Vercel's `next experimental-analyze` (Turbopack-native) ships.

**v2.3 retro candidates surfaced during this slice (don't act now, just capture):**
- **CI vs local bundle capture.** Z.0a's worked example showed real local-vs-CI baseline drift for typecheck. Bundle analyzer is much more deterministic than typecheck (raw webpack output, no heuristics-based filters), so local capture is acceptable here. But if a future slice observes local-vs-CI bundle size drift, file `z1-followup-ci-bundle-capture` and reconsider. For now: local is fine.
- **Per-audit subdirectory pattern for Phase Z deliverables.** This slice creates `docs/handoff/speed-2026-q2-baselines.md` at the flat root of `docs/handoff/`. If we run multiple audits with this Phase-Z-deliverable-doc pattern, per-audit subdirs (`docs/handoff/speed-2026-q2/baselines.md`, etc.) may scale better. Methodology v2.3 candidate; not a blocker for Z.1.

**Stop conditions internalized:**
- If `@next/bundle-analyzer@16.1.6` install fails with peer-dep conflicts → STOP, propose alternatives.
- If `ANALYZE=true npm run build` fails → STOP, capture error + propose fix.
- If wrap breaks the hardcoded `NEXT_PUBLIC_*` env preservation → STOP, surface (load-bearing for Cloud Run).
- If reports land outside `.next/analyze/` → add `.gitignore` patterns.
- If line count > 280 → surface.

**Open questions for Nathan:** none after pre-approval round (5 questions answered + 2 v2.3 retro notes captured above).

**Discovery findings:**
- `@next/bundle-analyzer@16.1.6` exists at the exact same version as our Next.js. Single dep: `webpack-bundle-analyzer@4.10.1`.
- No bundle analyzer currently in package.json or lock.
- ~~Build path is webpack, NOT Turbopack. `package.json` script is plain `next build` (no `--turbopack` flag). Next 16 build defaults to webpack unless flag passed; dev server is the Turbopack one.~~ **CORRECTION (during implementation, 2026-05-03):** Next.js 16.1.6's default `next build` actually uses **Turbopack**, not webpack — the build banner is "▲ Next.js 16.1.6 (Turbopack)" and `@next/bundle-analyzer` only wraps webpack, so the first `ANALYZE=true npm run build` produced no report and printed: *"The Next Bundle Analyzer is not compatible with Turbopack builds, no report will be generated. Consider trying the new Turbopack analyzer via `next experimental-analyze`. To run this analysis pass the `--webpack` flag to `next build`."* **Fix:** the `analyze` script is `ANALYZE=true next build --webpack` (not `ANALYZE=true npm run build`), forcing webpack just for analyzer purposes. This means baselines capture a webpack-bundled view of the app, not the Turbopack-default view that Cloud Run actually serves — the baselines doc carries that caveat. Surfaced in PR per methodology v2.2 surface-baseline-mismatches rule.
- `next.config.ts` is already wrapped with `withSentryConfig`. Standard pattern: `withSentryConfig(withBundleAnalyzer(nextConfig), {...})` — analyzer wraps inside Sentry.
- `.next/` is already gitignored, so analyzer reports written to `.next/analyze/` won't accidentally commit.
- Per-route First Load JS data is **not** present in the analyzer's `client.html` for this version (no `window.entrypoints` data assignment); Next 16's CLI build output also no longer prints the per-route size summary. Baselines doc captures per-route **page-chunk** sizes (sufficient to rank surfaces) and notes the gap.

- **Files:** see Files in scope above.
- **Success criteria:** new smoke test passes (3 contracts); existing 390/390 vitest suite still green; `npm run analyze` (= `ANALYZE=true next build --webpack`) succeeds and emits report HTML files in `.next/analyze/`; `speed-2026-q2-baselines.md` contains real per-route numbers (not placeholders) + 10 priority routes + webpack-vs-Turbopack callout (reframed: "Turbopack is the default; analyzer uses --webpack fallback").
- **Depends on:** PR #51 (Z.0b, merged 2026-05-03) — playwright harness shipped + audit infrastructure stable on `origin/main`.
- **Requires approval:** Pre-approved by Nathan (5 questions answered + 2 v2.3 retro notes captured).
- **Outcome:** Shipped via PR #52 (merged 2026-05-03). Bundle analyzer scaffolded with `@next/bundle-analyzer` wrapping `next.config.ts` behind `ANALYZE=true`. Real baseline numbers captured for 10 priority routes (heaviest: `/market-intel` 31.1 kB gz, `/deals/new` 33.1 kB gz). Three findings surfaced: (1) Next 16 default build is Turbopack not webpack — analyze script forces `--webpack` so analyzer has webpack stats to instrument; webpack-vs-Turbopack caveat documented; (2) per-route First Load JS not auto-extractable in this analyzer version, captured page-chunk sizes instead; (3) local typecheck reads 287 vs CLAUDE.md 285 anchor — preexisting +2 drift, CI canonical 515 is what blocks PRs.
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.1".
- **Branch:** `chore/speed-z1-bundle-analyzer` off `origin/main`.

### Z.2 — Lighthouse CI + Web Vitals baseline
- **Status:** `done`
- **Scope reduction (per Nathan, 2026-05-03):** **LOCAL CAPTURE ONLY** for this slice — same Path A precedent as Z.0b's playwright-local-only deferral. Wiring Lighthouse into GitHub Actions is filed as `z2-followup-ci-integration`. Reasons mirror Z.0b: booting `npm run start` against a CI-friendly DB + injecting auth = significant infra work beyond Z.2's baseline-capture goal.
- **Goal:** Install `@lhci/cli`, configure for the 10 priority routes (same set as Z.1), capture local baseline numbers, append a "Core Web Vitals baseline" section to the existing `docs/handoff/speed-2026-q2-baselines.md` (one doc, not a new one — keep all Foundation baselines colocated). Warn-only assertions: LCP < 2.5s, FCP < 1.8s, TTI < 3.8s, CLS < 0.1, TTFB < 800ms.
- **Files in scope:**
  - `package.json` (add `@lhci/cli` devDep + `lighthouse` + `lighthouse:report` scripts)
  - `lighthouserc.cjs` (new — 10 URLs, `numberOfRuns: 3` median, warn-only assertions, `LIGHTHOUSE_BASE_URL` env override defaulting to `http://localhost:3000`, no `puppeteerScript` for now per Q1 path (a))
  - `docs/handoff/speed-2026-q2-baselines.md` (append "Core Web Vitals baseline" section — does NOT restructure Z.1's content)
  - `tests/smoke/z2-lighthouse-ci.test.ts` (new — 3 contracts)
  - `.gitignore` (+1 line: `.lighthouseci/` — lhci's report output dir)
- **Smoke contract regex pins (3):**
  1. **C1 — `lighthouse` npm script wired:** `package.json` `scripts` block contains `"lighthouse":` keyed to `lhci collect`.
  2. **C2 — config exists with ≥10 URLs:** `lighthouserc.cjs` exists; counts ≥10 entries in the URL list (regex match on `http`-prefixed strings inside `url:` array).
  3. **C3 — baselines doc populated:** `docs/handoff/speed-2026-q2-baselines.md` contains a "Core Web Vitals baseline" section header AND ≥10 route × metric rows (TBD rows count — the contract is structural, not numerical, per Q4).
- **Estimated lines:** ~200 code (config ~70 + scripts +2 + smoke ~80 + .gitignore +1 + plan-of-record ~50) + ~120 doc data appended (mostly TBD table + 3 public-route real-number rows + methodology note). Within 280-line code budget per kickoff's data-content carve-out.

## Plan of record

**Four-commit choreography (one PR):**

1. **`chore(slices): flip Z.1 done with PR #52 outcome line + file z2-followup-ci-integration`** — cross-slice flip per documented pattern (verbatim outcome from kickoff) + new Phase 5 stub for CI deferral + one-line cross-ref to `z0b-followup-verify-e2e-runs` noting shared blocker.

2. **`chore(speed): append Z.2 plan-of-record + capture v2.3 retro candidate`** — this commit. Append plan-of-record; flip Z.2 `pending` → `in_progress`; capture one v2.3 retro candidate (auth-gated priority routes finding — see retro section below).

3. **`feat(speed): add Lighthouse CI tooling + Core Web Vitals baseline (Foundation Z.2)`** — install `@lhci/cli`, write `lighthouserc.cjs`, add npm scripts, run `npm run lighthouse` locally against the 3 reachable public routes, append "Core Web Vitals baseline" section to baselines doc with TBD rows for 10 priority routes + real numbers for public routes, ship smoke contract.

4. **`chore(slices): mark Z.2 awaiting_review (implementation done, opening PR)`** — flip Z.2 `in_progress` → `awaiting_review`. Z.2's `done` flip lands in Z.3's PR per cross-slice flip pattern (continuing Z.6 → Z.0a → Z.0b → Z.1 → Z.2 → Z.3).

**Why `.cjs` not `.json` (per Q3):** Header comments earn their lines explaining the local-only posture, the TBD rationale for auth-gated routes, and the auth path forward (puppeteerScript stub once test user provisioned). JSON can't host that context. Negligible cost — config is ~70 lines either way.

**Why TBD rows count for smoke contract C3 (per Q4):** The contract is structural ("matrix exists with ≥10 routes documented"), not "all numbers captured." Requiring real numbers would block Z.2 from shipping until test user provisioning happens, which contradicts Path A. Future agents who fill in TBD rows don't need to update the smoke — the contract still holds.

**Auth path forward (post-merge, when test user provisioned):**
- Add `puppeteerScript: "lighthouse/auth-puppeteer.cjs"` to `lighthouserc.cjs`
- Write `lighthouse/auth-puppeteer.cjs` that uses `PLAYWRIGHT_TEST_EMAIL`/`PLAYWRIGHT_TEST_PASSWORD` env vars to fill the `/login` form and submit
- Re-run `npm run lighthouse`; replace TBD rows in baselines doc with median-of-3 numbers
- This work is bundled into whichever slice unblocks `z0b-followup-verify-e2e-runs`

**Webpack-vs-Turbopack note (different from Z.1's caveat):** Lighthouse measures the locally-served output of `npm run start` (production build, Turbopack). Cloud Run also uses Turbopack. So unlike Z.1 — where the analyzer measured a webpack-bundled view that isn't what production serves — Z.2's numbers ARE representative of the production-default compiler. The caveat to document is the OPPOSITE direction: Z.1 was webpack-only-by-necessity; Z.2 is Turbopack-by-default.

**Methodology v2.3 retro candidate (single, captured here per Nathan's note):**
- **Public routes ≠ priority routes for SaaS apps.** The Z.2 kickoff implicitly assumed at least some of the 10 priority routes would be measurable without auth. Discovery showed all 10 sit under `(dashboard)/` and middleware redirects to `/login`. For SaaS perf tooling slices, "priority routes" is the post-auth product surface; "public routes" is auth + marketing + tokenized invites. They rarely overlap. Future Phase 5 audit-tooling kickoffs (and the methodology doc itself) should plan for pre-auth capture from the start — either by provisioning the test user as a Phase Z entry slice, or by accepting the TBD-rows + later-fill pattern up front. Filed for v2.3 §"Required infrastructure" addition.

**Open questions for Nathan:** none after pre-approval round (5 questions answered + 1 v2.3 retro note captured above).

**Discovery findings:**
- `@lhci/cli@0.15.1` is the current latest. No `engines` field; transitive `lighthouse@12.6.1` requires Node ≥18 — fine on Node 20+ (laptop is Node 25.x).
- Test user is NOT provisioned (per Z.0b's `z0b-followup-verify-e2e-runs` deferral). Confirmed by reading `tests/e2e/_setup/test-data.ts` — `PLAYWRIGHT_TEST_EMAIL`/`PLAYWRIGHT_TEST_PASSWORD` read from `.env.local`, fail loudly if missing.
- **All 10 priority routes are auth-gated.** Verified: every route in `/dashboard`, `/contacts`, `/pipeline`, `/messages`, `/calendar`, `/market-intel`, `/deals`, `/terminal`, `/brokerage/transactions`, `/leasing/setup` is under the `(dashboard)/` route group, which `src/middleware.ts` redirects to `/login` for unauthenticated requests. So local Lighthouse runs against these routes without auth would measure the redirect, not the page.
- Reachable public routes for partial baseline: `/login`, `/leasing-agent` (marketing landing), `/privacy`. Token-required public routes (`/book/[slug]`, `/submit-deal/[token]`, `/sign/[token]`, `/chat/[configSlug]`) need real tokens to render meaningfully — skip.
- `lhci`'s `puppeteerScript` typically requires `npm i puppeteer` (~100 MB). Skipping for now; the future stub can use lhci's `chrome-launcher` (already a transitive dep) for a lighter approach.
- `tests/e2e/_setup/auth.ts` uses playwright form-fill, not `storageState`. Not directly reusable in lhci without rewrite. Future puppeteerScript will replicate the same form-fill pattern (`/login` page, fill email + password, submit, wait for non-`/login` URL).

- **Files:** see Files in scope above.
- **Success criteria:** new smoke test passes (3 contracts); existing 396/396 vitest suite still green (+3 from this slice → 399); `npm run lighthouse` succeeds for the 3 public routes and produces `.lighthouseci/` artifacts; `speed-2026-q2-baselines.md` "Core Web Vitals baseline" section contains 10 TBD rows + real numbers for 3 public routes + methodology note + Turbopack-default callout.
- **Depends on:** PR #52 (Z.1, merged 2026-05-03) — bundle analyzer scaffold + baselines doc already present on `origin/main` (Z.2 appends to the doc Z.1 created).
- **Requires approval:** Pre-approved by Nathan (5 questions answered + 1 v2.3 retro note captured).
- **Outcome:** Shipped via PR #53 (merged 2026-05-03). `@lhci/cli@0.15.1` + `lighthouserc.cjs` scaffolded with all 10 priority routes pre-staged (commented in; 1-line uncomment after test user provisioning). Real Web Vitals captured for 3 reachable public surfaces: `/login` (100/100, LCP 0.49s), `/privacy` (100/100, LCP 0.37s), `/leasing-agent` (97/100, LCP 1.29s) — all CLS=0, all under Web Vitals "good" thresholds. 10 priority routes documented as TBD pending `z0b-followup-verify-e2e-runs` (test user provisioning is shared blocker per cross-ref in stub). `z2-followup-ci-integration` filed for CI wiring. v2.3 retro candidate captured: "Public routes ≠ priority routes for SaaS apps — tooling slices need pre-auth capture planned from start."
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.2".
- **Branch:** `chore/speed-z2-lighthouse-ci` off `origin/main`.

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

### `z0a-followup-typecheck-gap-investigation` — Investigate the 228-error gap between local-filtered tsc and CI clean-checkout
- **Status:** Phase 5 backlog
- **Background:** Z.0a's first PR-blocking CI run revealed a 228-error gap between the local-filtered typecheck count (287, per CLAUDE.md canonical filter `^[^(]* [0-9]+(\.test)?\.tsx?\(`) and CI's clean-checkout count (515). Z.0a's CI threshold was re-anchored from 285 to 515 to unblock the slice; the gap itself is preserved here for triage. Methodology v2.2 §"Verified-claim audit pattern" (shipped 2 hours earlier in PR #48) caught the drift on the first CI run that could enforce it — exactly the failure mode v2.2 was designed to surface.
- **Why deferred:** Investigating 228 errors requires capturing full `tsc --noEmit` output from BOTH local clean-tree and CI, then diffing and categorizing per-error. Not blocking — re-anchoring to 515 lets Z.0a ship and the rest of Phase Z proceed. May surface real regressions worth fixing OR be entirely tooling artifact.
- **Required input before slicing:**
  - **Hypothesis (a) — Local filter regex incomplete.** The CLAUDE.md filter excludes errors from dupe FILES (e.g. `auth-context 100.ts`) but may not exclude errors from dupe DIRECTORIES (e.g. errors emitted from a non-dupe file but referencing a type in a dupe directory's barrel re-export). If true: refine the filter regex; local count likely converges with CI count.
  - **Hypothesis (b) — Silent regression across PRs #44-#49 before CI existed to catch it.** Five PRs landed between the 285 anchor (PR #34, 2026-05-01) and PR #49 (2026-05-03) with no CI gate. The methodology's "surface baseline mismatches" rule was followed only when *measured* mismatches were observed; CI-vs-local mismatches couldn't be observed pre-Z.0a. If true: the 228 errors are real and Phase 3 cleanup scope grows.
  - **Hypothesis (c) — Tooling drift.** TS version via lockfile race, prisma generate output diff, Node version difference between local (varies) and CI (Node 20). If true: identify the specific tool delta and either bring CI in line with local OR adopt CI as canonical (which is now the policy).
  - Capture full `tsc --noEmit` output from clean-tree local (via `git stash --include-untracked` per CLAUDE.md protocol) AND from a CI run (download via `gh run download`). Diff per-error file path; categorize errors as: dupe-attribution, real-regression-since-PR#34, tooling-artifact.
- **Affected surfaces:** `.github/workflows/ci.yml` (threshold may drop after fixes), `CLAUDE.md` (anchor may drop OR be refined with a tighter filter regex), `tsconfig.json` (if config drift discovered between local and CI), potentially individual TS files if real regressions surface.
- **Filed:** 2026-05-03 by Nathan (during Z.0a CI failure resolution; the methodology-v2.2-caught-this irony documented here as a worked example for future v2.3 retro candidates).

### `z0b-followup-flow-3-deal-submission-seed` — Implement deferred flow 3 (deal submission via public token)
- **Status:** Phase 5 backlog
- **Background:** Z.0b's kickoff specified flow 3 = "open public submit-deal token (use a seeded test token), fill fields, submit, confirm success state." Public route `/submit-deal/[token]` requires a `DealSubmission` row to exist with that token. Fresh local DB has no tokens. Z.0b's stop-condition fired ("If any of the 5 flows requires data that doesn't exist in a fresh local DB, STOP and surface"). Resolved by deferring flow 3 to this stub; Z.0b ships 4 flows.
- **Why deferred:** Adding a seed strategy in Z.0b would have either (a) added a `tests/e2e/_setup/seed.ts` that the kickoff explicitly placed out of scope, or (b) chained an agent-side create flow inside the spec which makes the test fragile (depends on the create-side working). Splitting cleanly: ship harness + 4 flows now; add flow 3 with a deliberate seed strategy later.
- **Required input before slicing:**
  - **Option (a) — Prisma direct insert** in `tests/e2e/_setup/seed.ts` at suite-start: insert a `DealSubmission` row with a known token. Pros: deterministic, fast. Cons: introduces a seed script that needs maintenance + may diverge from the create-flow's actual schema over time.
  - **Option (b) — Agent-create chain inside the spec**: log in as agent → navigate to `/brokerage/deal-submissions` → click "invite submitter" → grab token URL from the UI → continue spec. Pros: tests both create-side and submit-side end-to-end. Cons: fragile (one create-side regression breaks both flows); slower.
  - **Option (c) — Hybrid**: Prisma seed for the row, but UI navigation to grab the token URL from the dashboard so the spec also exercises the agent-side surfacing.
- **Affected surfaces:** `tests/e2e/03-create-deal-submission.spec.ts` (new — fills the gap left by Z.0b); potentially `tests/e2e/_setup/seed.ts` (new if option (a) or (c)).
- **Filed:** 2026-05-03 by Nathan (during Z.0b discovery; stop condition resolution).

### `z0b-followup-flow-5-showing-booking` — Implement methodology §"Required infrastructure" flow #5 (showing slot booking)
- **Status:** Phase 5 backlog
- **Background:** Z.0b's kickoff substituted methodology flow #6 (market intel address search) for flow #5 (showing slot booking) in the "first 5" set. Reason cited by Nathan: showing-booking has Twilio + calendar dependencies that local-dev playwright will struggle with; market intel is simpler (just type address, see results). Methodology canonical flow list still names showing-booking as #5; this stub tracks the methodology-vs-shipped-set divergence.
- **Why deferred:** Twilio SMS (slot booking confirmation) and Google Calendar API (slot creation) need either real credentials in local dev (Nathan-provisioned + scoped for testing) or mocked equivalents. Decision-cost > Z.0b's atomic-scope budget.
- **Required input before slicing:**
  - Confirm methodology flow #5 stays as-canonical (showing booking) vs. updating methodology to reflect the substitution.
  - Decide on Twilio + Google Calendar testing strategy: live-credentials (test phone number, dedicated calendar) vs. mocking layer (e.g. Twilio test mode, Calendar mock fetch).
  - Identify which side of the booking flow to test first: agent creates slot, OR public booking via `/book/[slug]`, OR both as a chained spec.
- **Affected surfaces:** `tests/e2e/06-showing-booking.spec.ts` (new — naming convention per the methodology→spec mapping table in Z.0b's plan-of-record); potentially Twilio/Calendar mocking helpers in `tests/e2e/_setup/`.
- **Filed:** 2026-05-03 by Nathan (during Z.0b discovery; methodology #5 vs kickoff #5 substitution).

### `z0b-followup-staging-target` — Migrate playwright target from local dev to staging environment
- **Status:** Phase 5 backlog
- **Background:** Z.0b ships `playwright.config.ts` with `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'` — local dev target by Nathan's 2026-05-03 decision (no staging infra exists; dedicated staging is 2-3 weeks of work; Cloud Run preview URLs add complexity). Local dev was the fastest path to a working harness. This stub tracks the migration to staging when infra matures.
- **Why deferred:** Staging infra is a multi-week project (auth, data seeding, deploy pipeline, isolation from prod) that exceeds Z.0b's atomic-scope budget. Audit roadmap risk register (per `audit-roadmap-2026-q2-q4.md`) flags staging as a separate decision point.
- **Required input before slicing:** staging infra decision — Cloud Run preview URLs (auto-provisioned per PR), dedicated staging service (separate Cloud Run instance + DB), or test tenant in prod (multi-tenant carve-out + cleanup automation). Each has trade-offs around cost, fidelity, and isolation.
- **Affected surfaces:** `playwright.config.ts` (`baseURL` switch via env var — already env-overridable in Z.0b, so likely just a doc update), `docs/playwright-setup.md` (env var documentation), potentially `cloudbuild.yaml` (if Cloud Run preview URLs become the target).
- **Filed:** 2026-05-03 by Nathan (during Z.0b discovery; per kickoff explicit deferral note).

### `z0b-followup-ci-integration` — Wire `npm run e2e` into GitHub Actions as 5th required status check
- **Status:** Phase 5 backlog
- **Background:** Z.0b ships LOCAL-ONLY per Nathan's 2026-05-03 decision. The kickoff explicitly says "DO NOT wire this to GH Actions yet. The webServer config will time out in CI without a database. Z.0b ships LOCAL-ONLY. CI integration is a follow-up slice." Per Z.0a's status-check naming contract documented in `.github/workflows/ci.yml`, the new job will be named `e2e` (additive — never rename existing names).
- **Why deferred:** CI integration is blocked on either (a) a staging target so playwright can run against a real running app without needing CI to provision a database, OR (b) a CI-friendly DB seeding strategy that lets `webServer` run `next dev` against an ephemeral DB (Postgres container, sqlite shim, etc.). Both are non-trivial.
- **Required input before slicing:**
  - Either ship `z0b-followup-staging-target` first (then CI just hits staging URL), OR design a CI DB seeding strategy.
  - Decide e2e job timeout (likely 10-15 min initially given playwright + webServer overhead).
  - Decide whether e2e job is required-for-merge from day 1 or warn-only initially.
- **Affected surfaces:** `.github/workflows/ci.yml` (new `e2e` job), branch protection (Nathan adds the new required status check), potentially `playwright.config.ts` (CI-specific config block — `retries: 2` already configured per Z.0b plan).
- **Filed:** 2026-05-03 by Nathan (during Z.0b discovery; per kickoff explicit deferral note).

### `z0b-followup-flows-6-10` — Implement remaining 5 methodology flows from §"Required infrastructure"
- **Status:** Phase 5 backlog
- **Background:** Methodology §"Required infrastructure" canonical 10-flow list. Z.0b ships flows {1, 2*, 4, 6} (4 flows; flow 3 deferred per `z0b-followup-flow-3-deal-submission-seed`; flow 5 deferred per `z0b-followup-flow-5-showing-booking`). This stub tracks the remaining 4 flows: #7 (AI underwrite → LOI PDF), #8 (onboarding → public sign → invoice), #9 (bulk invoice generation), #10 (terminal feed + filter + building profile).
- **Why deferred:** Atomic scope budget. The kickoff explicitly placed flows 6-10 out of scope and named this stub.
- **Required input before slicing:**
  - Review each flow against the staging-target decision — flows 7-10 may have heavier data requirements (AI inference latency, PDF generation, terminal feed seeded with NYC events) that argue for staging over local-dev.
  - Decide whether to ship all 4 in one slice or split (likely split — Phase 1 capacity-permitting).
- **Affected surfaces:** `tests/e2e/07-underwrite-loi.spec.ts`, `tests/e2e/08-onboarding-sign.spec.ts`, `tests/e2e/09-bulk-invoice.spec.ts`, `tests/e2e/10-terminal-feed.spec.ts` (numbering per the methodology→spec mapping table in Z.0b's plan-of-record).
- **Filed:** 2026-05-03 by Nathan (during Z.0b discovery; per kickoff explicit deferral note).

### `z0b-followup-verify-e2e-runs`
- **Status:** Phase 5 backlog
- **Background:** Z.0b (PR #51) shipped the playwright harness scaffold with structural smoke contracts + green CI, but local `npm run e2e` was NOT run before merge. Per Path A decision (Nathan, 2026-05-03), test user provisioning + first local run deferred to keep Phase Z momentum.
- **Why deferred:** Test user provisioning is one-time admin work in the Supabase dashboard (~15 min). Phase Z's goal is "infrastructure exists," not "every test verified live." Smoke contracts pin the structural shape; runtime verification gates Phase 1+ when capacity permits.
- **Required input before slicing:** None — pure provisioning task. Steps in `docs/playwright-setup.md`.
- **Affected surfaces:** `playwright/.auth/user.json` (generated locally), `.env.local` (PLAYWRIGHT_TEST_EMAIL + PLAYWRIGHT_TEST_PASSWORD env vars).
- **Also unblocks:** Z.2's auth-gated baseline capture — all 10 priority routes are auth-gated, so Z.2 shipped with `TBD — pending test user provisioning` for those rows. Once this stub's provisioning lands, Z.2's TBD rows can be filled by re-running `npm run lighthouse` against the now-loginnable test user. (Discovered during Z.2 plan-of-record: methodology assumed some priority routes would be public; for SaaS apps the priority set and the public set rarely overlap.)
- **Filed:** 2026-05-03 by Nathan (Z.0b merge — Path A choice).

### `z2-followup-ci-integration`
- **Status:** Phase 5 backlog
- **Background:** Z.2 (PR TBD) shipped Lighthouse CI tooling + baseline capture for local runs. Wiring `npm run lighthouse` into GitHub Actions as a 6th status check (warn-only initially, then fail-on-regression once thresholds are calibrated) was deferred per the same pattern as `z0b-followup-ci-integration`. Both depend on a CI strategy for booting the Next.js server + handling auth.
- **Why deferred:** Running Lighthouse in CI requires booting `npm run start` against a CI-friendly DB + injecting auth — significant infra work beyond Z.2's baseline-capture goal. Either solve it once for both playwright + Lighthouse (combined CI integration slice) or solve separately.
- **Required input before slicing:** Decision on CI server-boot strategy (use a Cloud Run preview URL? boot ephemeral local + dummy DB? share infra with `z0b-followup-ci-integration`?).
- **Affected surfaces:** `.github/workflows/ci.yml` (new job), `lighthouserc.cjs` (CI-specific config branch), possibly `package-lock.json`.
- **Filed:** 2026-05-03 by Nathan (Z.2 shipping, CI wire deferred for Z.0b parity).
