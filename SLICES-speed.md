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
- **Status:** `done`
- **Goal:** Wire Prisma `$on('query')` in `src/lib/prisma.ts` to log queries slower than env-configurable threshold (default 200ms dev, 500ms prod). Dev: `console.warn`. Prod: `Sentry.addBreadcrumb` (category: prisma, level: warning) + `console.warn` fallback. PII-safe — log the parameterized query template ONLY, NEVER the params (DB rows can contain emails, addresses, etc.).
- **Files in scope:**
  - `src/lib/prisma.ts` (add `$on("query")` handler; switch `log` config to fully-object form per Q1; preserve singleton API + `getDatasourceUrl()` connection-pool config; preserve dev/prod stdout asymmetry per Q2)
  - `tests/smoke/z3-prisma-slow-query.test.ts` (new — 3 contracts)
- **Smoke contract regex pins (3):**
  1. **C1 — `$on("query", ...)` registered:** `src/lib/prisma.ts` matches `/\$on\(\s*["']query["']/`.
  2. **C2 — threshold env var read:** `src/lib/prisma.ts` matches `/process\.env\.PRISMA_SLOW_QUERY_MS_(DEV|PROD)/`.
  3. **C3 — no unconditional query-string log spam:** `src/lib/prisma.ts` does NOT match `/log:\s*\[\s*["']query["']\s*\]/` (the literal-string single-element form that prints every query to stdout). Our config uses the object/event form, so this regex must NOT match.
- **Estimated lines:** ~50 code (prisma.ts) + ~70 smoke + ~70 plan-of-record + ~80 SLICES-speed.md retro/finding capture = ~270 total. Within 280-line ceiling.

## Plan of record

**Four-commit choreography (one PR):**

1. **`chore(slices): flip Z.2 done with PR #53 outcome line`** — cross-slice flip per documented pattern. Verbatim outcome from kickoff.

2. **`chore(speed): append Z.3 plan-of-record + capture Z.4 stale-kickoff finding`** — this commit. Append plan-of-record; flip Z.3 `pending` → `in_progress`; capture **CRITICAL FINDING** (per Nathan, 2026-05-03) about Z.4's kickoff being stale (Sentry Performance is ALREADY enabled in `sentry.server.config.ts` + `sentry.edge.config.ts`; tracesSampleRate is 0.1 prod / 1.0 dev) — this needs to feed Z.4's re-scoping when we get there.

3. **`feat(speed): instrument Prisma slow query log (Foundation Z.3)`** — modify `src/lib/prisma.ts` to switch `log` to fully-object form with event-based query emission, register `$on("query")` handler, env-configurable threshold, dev/prod branching per Q3. Ship 3-contract smoke test.

4. **`chore(slices): mark Z.3 awaiting_review`** — flip Z.3 `in_progress` → `awaiting_review`. Z.3's `done` flip lands in Z.4's PR per cross-slice flip pattern (continuing Z.6 → Z.0a → Z.0b → Z.1 → Z.2 → Z.3 → Z.4).

**Log config shape (per Q1 fully-object + Q2 preserve asymmetry):**

```ts
log: process.env.NODE_ENV === "development"
  ? [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ]
  : [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "error" },
    ]
```

Event-based query emission is in BOTH environments (per kickoff) — the threshold filter in the handler prevents prod log spam. Stdout error/warn behavior matches existing config exactly (no behavioral regression for non-query Prisma logs).

**Handler shape (per Q3 — match kickoff verbatim):**

```ts
prisma.$on("query", (e) => {
  const threshold = isDev ? devThreshold : prodThreshold;
  if (e.duration < threshold) return;
  const payload = { duration_ms: e.duration, query: e.query, target: e.target };
  if (isDev) {
    console.warn("[prisma slow query]", payload);
  } else {
    // Sentry breadcrumb is safe to call even if init failed — it
    // becomes a no-op rather than throwing. console.warn fallback
    // ensures Cloud Run logs still capture the event regardless.
    if (typeof Sentry?.addBreadcrumb === "function") {
      Sentry.addBreadcrumb({
        category: "prisma",
        level: "warning",
        message: "slow-query",
        data: payload,
      });
    }
    console.warn("[prisma slow query]", payload);
  }
});
```

**PII safety (load-bearing comment in code):** `e.params` is intentionally excluded — Prisma serializes actual values into params (emails, addresses, names). Only `e.query` (parameterized SQL template, e.g. `SELECT ... WHERE email = ?`) is logged.

**Critical finding to capture in retro candidates (per Nathan, 2026-05-03):**
- **Z.4 kickoff is stale.** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.4" claims the work is "enable Sentry Performance" — but `sentry.server.config.ts` and `sentry.edge.config.ts` already call `Sentry.init({ tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1, ... })`. Performance tracing is on. Z.4 needs **re-scoping** when we get there — likely to "refine custom spans on highest-traffic surfaces (data-fusion-engine, nyc-opendata, firecrawl, AI inference) + verify DSN inlining works in prod" rather than the kickoff's framing.
- **Sentry DSN known issue.** Nathan observed `Invalid Sentry Dsn: $NEXT_PUBLIC_SENTRY_DSN` in browser console at some point but it's NOT documented in CLAUDE.md or any handoff doc. Discovery during Z.3 confirmed: DSN is wired in `cloudbuild.yaml` as a build-time secret, but the literal-`$`-prefix in the observed message suggests Turbopack edge bundling failed to interpolate the env var (same root cause as the `NEXT_PUBLIC_SUPABASE_*` workaround in `next.config.ts`). When Z.4 kicks off, **first action**: reproduce the DSN error → if confirmed, file `z4-followup-document-known-dsn-issue` (or fold into Z.4 itself depending on scope). For Z.3's scope: Sentry breadcrumb path is a no-op if DSN init failed, which is fine — `console.warn` fallback ensures Cloud Run logs still capture slow queries.

**Open questions for Nathan:** none after pre-approval round (5 questions answered + Z.4 re-scoping flagged for capture).

**Discovery findings:**
- `src/lib/prisma.ts` is ~25 lines: `globalForPrisma` singleton, `getDatasourceUrl()` connection-pool config, `log: ["error", "warn"]` (dev) / `["error"]` (prod), default export.
- Sentry server + edge configs both call `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 prod / 1.0 dev, environment, enableLogs: true })`. **Performance is already enabled.** (Confirmed: this is the basis for the Z.4 re-scoping note above.)
- No existing slow-query logging anywhere in `src/`.
- No existing `Sentry.addBreadcrumb` calls anywhere in `src/`.
- Prisma 5.22 supports `$on("query", ...)` with the constructor `log: [{ emit: "event", level: "query" }]` shape. TypeScript inference may require `as const` or explicit `Prisma.PrismaClientOptions["log"]` annotation; will surface during typecheck if needed (per Q4).

- **Files:** see Files in scope above.
- **Success criteria:** new smoke test passes (3 contracts); existing 403/403 vitest suite still green (+3 from this slice → 406); local `npm run dev` produces `[prisma slow query]` console output for at least one heavy route (e.g. `/messages` or `/market-intel`); typecheck holds at baseline (≤515 CI canonical) — Z.3 introduces zero new errors in files it touches.
- **Depends on:** PR #53 (Z.2, merged 2026-05-03) — clean baseline on `origin/main`.
- **Requires approval:** Pre-approved by Nathan (5 questions answered + Z.4 re-scoping finding captured + Sentry DSN issue noted for later filing).
- **Outcome:** Shipped via PR #54 (merged 2026-05-03). Prisma slow query handler registered in `lib/prisma.ts` with HMR-stacking guard (`globalForPrisma.prismaSlowQueryHandlerRegistered`) + PII-safe payload (`e.query` template only, never `e.params`) + threshold env-configurable (`PRISMA_SLOW_QUERY_MS_DEV` default 200, `_PROD` default 500) + Sentry breadcrumb in prod with `console.warn` fallback in dev. Verified via standalone probe: `SELECT COUNT(*)` on users at 240ms tripped the dev threshold cleanly with `$1` placeholder confirming PII safety. Z.4 stale-kickoff finding ("Sentry Performance is already enabled") captured in plan-of-record retro section, drove this slice's re-scope.
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.3".
- **Branch:** `chore/speed-z3-prisma-slow-query` off `origin/main`.

### Z.4 — Sentry Performance refinement (RE-SCOPED) — custom spans + DSN inlining
- **Status:** `done`
- **Re-scope history (TWO rounds of stale-kickoff corrections — important for future agents):**
  - **Round 1 (Z.3 discovery, captured in Z.3 plan-of-record retro):** Original Z.4 kickoff in `docs/handoff/site-wide-speed-audit-2026-05-02.md` claimed "enable Sentry Performance." Discovery during Z.3 confirmed Performance is **already** enabled in `sentry.server.config.ts` + `sentry.edge.config.ts` (`tracesSampleRate: 0.1 prod / 1.0 dev`). The handoff doc was updated for Z.4's re-scope after Z.3 shipped.
  - **Round 2 (Z.4 discovery — this slice, 2026-05-03):** The re-scoped kickoff also missed that **`src/instrumentation-client.ts` exists** as the modern Next.js 15+ file convention for client-side Sentry init. The kickoff said "no `sentry.client.config.ts` — client-side Sentry is unconfigured" — technically true (no `sentry.client.config.ts`) but misleading: client Sentry IS configured via `src/instrumentation-client.ts`, which calls `Sentry.init({ dsn, tracesSampleRate, environment, integrations: [replayIntegration], replaysSessionSampleRate: 0.1, replaysOnErrorSampleRate: 1.0 })`. Adding `sentry.client.config.ts` would COLLIDE with this. Z.4 skips that step entirely.
- **Goal:** (1) Defensive DSN hardcode in `next.config.ts` `env` block (mirrors Supabase workaround per CLAUDE.md known issue) — cheap insurance against Turbopack edge bundling losing the env var in prod. (2) Add `Sentry.startSpan` wraps on 6 high-traffic server-side surfaces with one canonical doc-comment in `data-fusion-engine.ts` showing the pattern. (3) Update the speed audit handoff doc Z.4 section with the corrected re-scope narrative.
- **Files in scope:**
  - `next.config.ts` (+1 line: literal DSN value in `env` block per Q1)
  - `src/lib/data-fusion-engine.ts` (~10 lines: span wrap on `fetchBuildingIntelligence` + canonical span-pattern doc comment per Q4)
  - `src/lib/nyc-opendata.ts` (~5 lines: span wrap on `queryNYC` generic SODA fetch helper)
  - `src/lib/firecrawl.ts` (~5 lines: span wrap on `firecrawlSearch`)
  - `src/lib/apollo.ts` (~5 lines: span wrap on `apolloEnrichPerson`)
  - `src/lib/email-parser.ts` (~5 lines: span wrap on Claude `messages.create` inside `parseEmailWithAI`)
  - `src/lib/leasing-engine.ts` (~5 lines: span wrap on Claude `messages.create` in tool-loop)
  - `tests/smoke/z4-sentry-performance.test.ts` (new — 4 contracts, ~90 lines)
  - `docs/handoff/site-wide-speed-audit-2026-05-02.md` (~15 lines: Z.4 section update with re-scope narrative)
- **Smoke contract regex pins (4):**
  1. **C1 — client-side Sentry init exists:** `src/instrumentation-client.ts` exists and matches `/Sentry\.init\(/`. (Replaces the kickoff's "sentry.client.config.ts exists" pin — corrected to the actual modern file convention.)
  2. **C2 — `next.config.ts` includes `NEXT_PUBLIC_SENTRY_DSN` in its `env` block:** matches `/NEXT_PUBLIC_SENTRY_DSN:/`.
  3. **C3 — ≥6 source files contain `Sentry.startSpan` calls:** counted across the named lib/ files via filesystem scan.
  4. **C4 — no PII captured in span data:** scan all 6 modified lib files; ensure no `Sentry.startSpan` call has `data:` containing keys `params`, `body`, or `request`. Pin via regex: `/Sentry\.startSpan\([^)]*data:\s*\{[^}]*(params|body|request)/` must NOT match.
- **Estimated lines:** ~50 code + ~90 smoke + ~110 plan-of-record + ~15 handoff doc + ~30 follow-up stub = ~295. **Slightly above 280 ceiling — variance approved by Nathan in Q5 ("exactly 6 spans, anything above is a follow-up slice").** Variance lives in the plan-of-record + handoff-doc edits, both of which are documentation. Code+smoke total is ~140 — well under budget.

## Plan of record

**Four-commit choreography (one PR):**

1. **`chore(slices): flip Z.3 done with PR #54 outcome line`** — cross-slice flip per documented pattern. Verbatim outcome from kickoff.

2. **`chore(speed): append Z.4 plan-of-record + handoff doc Z.4 re-scope + file z4-followup-verify-prod-dsn-inlining`** — this commit. Append plan-of-record; flip Z.4 `pending` → `in_progress`; capture two stale-kickoff facts in retro candidates; update `docs/handoff/site-wide-speed-audit-2026-05-02.md` Z.4 section with corrected re-scope narrative; file new Phase 5 stub for prod DSN verification.

3. **`feat(speed): Sentry Performance refinement — DSN inlining + 6 custom spans (Foundation Z.4)`** — implementation. Hardcode DSN in `next.config.ts` env block; add `Sentry.startSpan` wraps on 6 surfaces; canonical pattern doc-comment in `data-fusion-engine.ts`; ship 4-contract smoke test.

4. **`chore(slices): mark Z.4 awaiting_review`** — flip Z.4 `in_progress` → `awaiting_review`. Z.4's `done` flip lands in Z.5's PR per cross-slice flip pattern (continuing Z.6 → Z.0a → Z.0b → Z.1 → Z.2 → Z.3 → Z.4 → Z.5).

**DSN hardcode shape (per Q1 — match Supabase workaround pattern):**

```ts
env: {
  NEXT_PUBLIC_SUPABASE_URL: "https://...",  // existing
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "...",      // existing
  NEXT_PUBLIC_APP_URL: "https://app.vettdre.com",  // existing
  NEXT_PUBLIC_SENTRY_DSN: "https://...@...ingest.us.sentry.io/...",  // NEW
}
```

Sentry DSNs are **public write-only keys** designed for client-bundle exposure (per Q1) — same security category as the already-hardcoded `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Hardcoding the literal value (not `process.env.NEXT_PUBLIC_SENTRY_DSN`) is what makes edge inlining reliable per CLAUDE.md known issue.

**Span pattern (per Q4 — canonical doc-comment in data-fusion-engine.ts):**

```ts
// Foundation/Speed Audit Z.4 — Sentry custom span pattern reference.
//
// Wrap any meaningful boundary (NYC API call, AI inference, external
// HTTP fetch) in Sentry.startSpan so traces show per-call timing. The
// 6 surfaces wrapped in this slice (data-fusion-engine,
// nyc-opendata, firecrawl, apollo, email-parser, leasing-engine) are
// the canonical examples; future slices can add more by copying the
// shape below.
//
// Pattern:
//   import * as Sentry from "@sentry/nextjs";
//   return Sentry.startSpan(
//     { name: "<descriptive-name>", op: "<category>.<subcategory>" },
//     async (span) => {
//       // your work here; throw normally — Sentry captures errors
//     },
//   );
//
// PII safety: never put query params, request bodies, or user-provided
// strings into the span's data field. Span name + op are public-safe;
// data is not. (Smoke test C4 enforces this.)
```

**Retro candidates captured (per Nathan, 2026-05-03 — TWO this slice):**
1. **"Sentry Performance is already enabled"** (already captured in Z.3's plan-of-record retro section; preserved here as the trigger for Z.4's first re-scope).
2. **"Client-side Sentry was technically configured via `src/instrumentation-client.ts`"** — the re-scoped Z.4 kickoff missed this file. Future agents should grep for **both** `sentry.client.config*` AND `instrumentation-client*` when checking client-side Sentry state. **v2.3 methodology candidate:** discovery instructions for slices touching framework integrations should enumerate ALL file naming conventions for that framework version, not just the legacy ones the kickoff author was familiar with. Expand discovery checklist for Next.js + Sentry slices to include the modern `src/instrumentation*.ts` convention as well as the legacy `sentry.{client,server,edge}.config.ts` root files.

**Open questions for Nathan:** none after pre-approval round (5 questions answered + 2 stale-kickoff facts + 1 v2.3 retro candidate captured).

**Discovery findings:**
- `sentry.server.config.ts` + `sentry.edge.config.ts` exist and call `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 prod / 1.0 dev, environment, ... })`. Performance is on (Z.3 finding, confirmed).
- `src/instrumentation-client.ts` exists and calls `Sentry.init({ dsn, tracesSampleRate, environment, integrations: [replayIntegration], replaysSessionSampleRate: 0.1, replaysOnErrorSampleRate: 1.0 })` plus exports `onRouterTransitionStart` for App Router instrumentation. **This is the modern client-side Sentry init.**
- `src/instrumentation.ts` exports `register()` that imports server/edge configs based on `NEXT_RUNTIME`, plus `onRequestError = Sentry.captureRequestError` for App Router error capture.
- DSN inlining works in DEV — verified by grepping the dev bundle for the literal `3c5724a8` DSN-prefix; found in `Documents_vettdre_src_instrumentation-client_ts_*.js`. Prod-side inlining unverified (cannot reach deployed Chrome console from this environment); filed as `z4-followup-verify-prod-dsn-inlining`.
- `@sentry/nextjs@^10.42.0` exports `startSpan` from server, edge, AND client builds (verified via `node_modules/@sentry/nextjs/build/types/.../nextSpan.d.ts`). Pattern: `Sentry.startSpan({ name, op }, async (span) => { ... })`.
- 6 span insertion points verified: `data-fusion-engine.ts:183` (`fetchBuildingIntelligence`), `nyc-opendata.ts:148` (`queryNYC` generic SODA helper), `firecrawl.ts:200` (`firecrawlSearch`), `apollo.ts:75` (`apolloEnrichPerson`), `email-parser.ts:52+` (Claude `messages.create` inside `parseEmailWithAI`), `leasing-engine.ts:808` (Claude `messages.create` inside tool loop).

- **Files:** see Files in scope above.
- **Success criteria:** new smoke test passes (4 contracts); existing 407/407 vitest suite still green (+4 from this slice → 411); local `npm run build` boots without Sentry-init errors; no PII in any span data field (C4 enforces); local typecheck holds at baseline (≤515 CI canonical); prod DSN-inlining verification deferred to `z4-followup-verify-prod-dsn-inlining`.
- **Depends on:** PR #54 (Z.3, merged 2026-05-03) — clean baseline.
- **Requires approval:** Pre-approved by Nathan (5 questions answered + 2 stale-kickoff facts + 1 v2.3 methodology candidate captured).
- **Outcome:** Shipped via PR #55 (merged 2026-05-03). Sentry Performance was already enabled (Z.3 finding); Z.4 re-scoped to (1) skip `sentry.client.config.ts` (collides with `src/instrumentation-client.ts` modern Next.js 15+ pattern), (2) defensive DSN literal hardcode in `next.config.ts` mirroring Supabase workaround, (3) 6 custom spans across 6 hot surfaces (data-fusion-engine, nyc-opendata, firecrawl, apollo, email-parser, leasing-engine). `z4-followup-verify-prod-dsn-inlining` filed for Nathan's post-merge prod-side verification (deployed Chrome console check). v2.3 methodology candidate captured: framework-integration discovery should enumerate ALL file naming conventions (e.g. both `sentry.{client,server,edge}.config.ts` AND `src/instrumentation*.ts`).
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.4" (post this PR's update).
- **Branch:** `chore/speed-z4-sentry-spans` off `origin/main`.

### Z.5 — Cloud Run cold start measurement (LAST Phase Z slice)
- **Status:** `done`
- **Goal:** Add unauthenticated `/api/health` endpoint returning `uptime_seconds` + minimal status payload, so cold-start latency can be measured. Document the methodology + a 5-row TBD measurements table in `docs/handoff/speed-2026-q2-baselines.md` (parallel to Z.2's TBD pattern). Nathan fills in measurements via post-merge commit. **Do NOT implement keepalive** — that's Phase 1+ work driven by what Z.5's numbers show.
- **Files in scope:**
  - `src/app/api/health/route.ts` (new — Sentry-wrapped GET handler per Q2(a); no DB hit; payload: `status`, `uptime_seconds`, `timestamp`, `node_env`, `git_sha`)
  - `src/lib/supabase/middleware.ts` (+1 line: `pathname.startsWith("/api/health")` inserted at TOP of API public-routes group per Q3, grouped with `/api/book` / `/api/automations/cron` / etc.)
  - `tests/smoke/z5-cold-start.test.ts` (new — 3 contracts; path corrected from kickoff typo per Q5)
  - `docs/handoff/speed-2026-q2-baselines.md` (append "Cold start baseline" section: methodology + 5-row TBD table + decision tree)
- **Smoke contract regex pins (3):**
  1. **C1 — health route exists with GET handler:** `src/app/api/health/route.ts` exists and matches `/export\s+(async\s+)?function\s+GET/`.
  2. **C2 — payload contract:** route source matches BOTH `/uptime_seconds/` AND `/status/` (regex pin on the response keys).
  3. **C3 — middleware exempts health route:** `src/lib/supabase/middleware.ts` matches `/pathname\.startsWith\(["']\/api\/health/`.
- **Estimated lines:** ~30 code + ~70 smoke + ~80 doc append + ~80 plan-of-record + ~15 follow-up stub = ~275. Within 280.

## Plan of record

**Four-commit choreography (one PR):**

1. **`chore(slices): flip Z.4 done with PR #55 outcome line`** — cross-slice flip per documented pattern.

2. **`chore(speed): append Z.5 plan-of-record + file z5-followup-unwrap-health-span`** — this commit. Append plan-of-record; flip Z.5 `pending` → `in_progress`; file new Phase 5 stub for the Sentry-span unwrap when Cloud Scheduler keepalive lands (per Q2(a)).

3. **`feat(speed): add /api/health endpoint + cold-start baseline scaffold (Foundation Z.5)`** — implementation. New route handler with `Sentry.startSpan` wrap; middleware public-routes update; 3-contract smoke; baselines doc gets "Cold start baseline" section with TBD-row table + methodology + decision tree.

4. **`chore(slices): mark Z.5 awaiting_review`** — flip Z.5 `in_progress` → `awaiting_review`. **Z.5 is the LAST Phase Z slice.** After this PR merges + Nathan completes the 5 cold-start measurements (separate post-merge commit), Phase Z is complete and Phase 0 swarm opens. Z.5's `done` flip lands in the Phase 0 kickoff slice's PR per cross-slice flip pattern.

**Endpoint payload shape (per Q1 — keep `git_sha` placeholder):**

```ts
{
  status: "ok",
  uptime_seconds: process.uptime(),
  timestamp: new Date().toISOString(),
  node_env: process.env.NODE_ENV,
  git_sha: process.env.GIT_COMMIT_SHA ?? "unknown",
}
```

`git_sha` is harmless when unset — Cloud Build can populate via `_COMMIT_SHA` substitution later (out of scope for this slice; flagging here so future agent who wires it knows the field is already in place).

**Sentry span wrap (per Q2(a) — keep wrap, file follow-up):**

```ts
return Sentry.startSpan(
  { name: "health.check", op: "http.server.health" },
  async () => NextResponse.json({ ... }),
);
```

The wrap shows cold-start latency in Sentry traces — useful for Phase 0 + Phase 1 cold-start analysis. **Trade-off acknowledged:** when Cloud Scheduler keepalive lands (Phase 1+), every ping creates a span = noise. Filed `z5-followup-unwrap-health-span` to address deliberately when we're already in keepalive territory.

**Public-routes insertion point (per Q3 — top of API group for readability):**

Insert `pathname.startsWith("/api/health") ||` next to `pathname.startsWith("/api/onboarding") ||` (the first `/api/*` entry in the OR-chain). Grouped semantically with the other unauthenticated API routes.

**TBD-rows pattern (per Q4 — agent ships skeleton, Nathan fills numbers):**

Same approach as Z.2's auth-gated baseline rows. Doc gets:
- "Cold start baseline" section header
- Methodology subsection (curl pattern, idle-gap timing, expected scale-to-0 behavior on Cloud Run)
- 5-row TBD table (Run #1-5: timestamp, request latency ms, response uptime_seconds, classification cold/warm)
- Median + p95 placeholders
- Decision tree: "if median > 5s → propose Cloud Scheduler keepalive in Phase 1 OR `--min-instances=1`; if 1-5s → keepalive optional, depends on UX impact; if <1s → skip keepalive entirely (cold start is not a bottleneck)"

Nathan completes via separate commit on main post-merge (no need for a follow-up PR; baselines doc edits are atomic).

**Smoke path corrected per Q5:** `tests/smoke/z5-cold-start.test.ts` (kickoff had typo `tests/smoke/zcold-start.test.ts`).

**Open questions for Nathan:** none after pre-approval round (5 questions answered + 1 new follow-up stub filed).

**Discovery findings:**
- `/api/health/briefs/route.ts` exists as a sub-route. The leaf `/api/health/route.ts` does NOT — no collision; adding the leaf is fine (different URL paths in App Router).
- `cloudbuild.yaml` confirms cold starts are real: `--min-instances 0`, `--max-instances 10`, `--memory 1Gi`, `--cpu 1`, `--concurrency 80`, `--timeout 300`. Container scales to 0 when idle.
- `Dockerfile` is multi-stage with standalone output — minimal cold-start surface, but production runner installs `@googleworkspace/cli` globally per CLAUDE.md (adds startup time).
- `src/lib/supabase/middleware.ts` public-routes is a simple `pathname.startsWith(...)` OR-chain at lines 93-130. One-line addition.
- Rate-limiting at top of `updateSession` applies to ALL `/api/*` routes (60 req/min per IP). Fine for Cloud Scheduler keepalive AND Nathan's 5 manual cold-start tests (~20 min apart).
- `docs/methodology/templates/phase-0-swarm-prompt.md` exists (confirmed for handoff narrative after Z.5 ships).

- **Files:** see Files in scope above.
- **Success criteria:** new smoke test passes (3 contracts); existing 413/413 vitest suite still green (+3 from this slice → 416); local `npm run build` succeeds (route compiles without route-handler convention errors); `/api/health` reachable post-deploy and returns the documented payload; baselines doc has "Cold start baseline" section ready for Nathan's measurements.
- **Depends on:** PR #55 (Z.4, merged 2026-05-03) — clean baseline + Sentry span pattern landed (Z.5's wrap copies it).
- **Requires approval:** Pre-approved by Nathan (5 questions answered).
- **Outcome:** Shipped via PR #56 (merged 2026-05-03, deployed via build 2cd4a3b6). `/api/health` endpoint live at app.vettdre.com/api/health (Sentry-wrapped, no DB hit, returns `uptime_seconds` + `timestamp` + `node_env` + `git_sha` placeholder). Middleware exempts the route from auth via single-line public-routes addition at top of API group. 3-contract smoke at `tests/smoke/z5-cold-start.test.ts` passes (final suite count 418/418 green). `docs/handoff/speed-2026-q2-baselines.md` gained "Cold start baseline" section with methodology + 5-row TBD table + decision tree (median <1s skip / 1-5s optional / >5s required Cloud Scheduler keepalive or `--min-instances=1`). One Phase 5 stub filed: `z5-followup-unwrap-health-span` (deliberate unwrap when keepalive lands to avoid 1,440 spans/day of noise). Z.5's `done` flip + "Phase Z — Gate" header land in Phase 0 prep slice PR per cross-slice flip pattern. Phase Z complete. Cross-slice flip chain closes here: Z.6 → Z.0a → Z.0b → Z.1 → Z.2 → Z.3 → Z.4 → Z.5.
- **Kickoff prompt:** `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Z.5".
- **Branch:** `chore/speed-z5-cold-start` off `origin/main` (merged + deleted).

---

## Phase Z — Gate (signed off 2026-05-03)

Phase Z complete. All 8 setup slices shipped + merged to `main` between
2026-05-03 (Z.6) and 2026-05-03 (Z.5). Cross-slice flip chain:
Z.6 → Z.0a → Z.0b → Z.1 → Z.2 → Z.3 → Z.4 → Z.5 (closes here in Phase 0
prep PR).

**Phase Z deliverables (all green):**
- [x] Per-audit ledger split + `SLICES-speed.md` bootstrap (Z.6, PR #49)
- [x] GitHub Actions CI skeleton (Z.0a, PR #50) — typecheck + lint baseline + test + build, all 4 required status checks gate `main`
- [x] Playwright harness scaffold (Z.0b, PR #51) — 4 specs (login, contact, gmail, market intel) green
- [x] Bundle analyzer baseline + report (Z.1, PR #52) — `npm run analyze` produces report; baselines doc has 316-chunk breakdown + 7.25MB parsed / 2.10MB gzip + top 10 priority routes
- [x] Lighthouse CI + Web Vitals baseline (Z.2, PR #53) — `npm run lighthouse` works against 13 URLs; 3 public routes captured (login 100/100, privacy 100/100, leasing-agent 97/100), 10 auth-gated TBD until test user provisioned (`z0b-followup-verify-e2e-runs`)
- [x] Prisma slow query log (Z.3, PR #54) — handler registered with HMR-stacking guard, PII-safe (template only, never params); dev `console.warn`, prod `Sentry.addBreadcrumb` + console fallback
- [x] Sentry Performance refinement — custom spans + DSN inlining (Z.4, PR #55) — 6 spans wrapped (`data-fusion`, `nyc-opendata`, `firecrawl`, `apollo`, `email-parser` Claude call, `leasing-engine` Claude tool loop); literal DSN in `next.config.ts` env block per CLAUDE.md "Edge env var workaround" pattern
- [x] Cloud Run cold start measurement (Z.5, PR #56) — `/api/health` endpoint live, baselines doc has cold-start methodology + 5-row TBD table + decision tree
- [ ] Asana board for Phase 0 swarm tracking _(deferred during Phase Z; SLICES-speed.md remains canonical execution ledger. File `phase-0-followup-asana-setup` if/when stakeholder visibility becomes blocking. Pragmatic deferral approved by Nathan 2026-05-03.)_

**Phase 5 backlog filed during Phase Z:** 10 stubs (verified via `grep -c "^### \`z" SLICES-speed.md`; kickoff narrative claimed 11, actual is 10). All preserved at end of this file under §"Phase 5 — Polish backlog".

---

## Phase 0 — Discovery (parallel agent swarm)

Per methodology v2.2 §"Phase 0 — Discovery": one read-only audit agent
per area, swarm prompt template at
`docs/methodology/templates/phase-0-swarm-prompt.md`, areas enumerated
in `docs/handoff/site-wide-speed-audit-2026-05-02.md` §"Phase 0 —
Discovery".

### Phase 0 prep — widen swarm prompt template + close Phase Z gate
- **Status:** `awaiting_review`
- **Goal:** Three jobs, atomic: (1) close Phase Z gate (flip Z.5 `awaiting_review` → `done` with PR #56 + build 2cd4a3b6 outcome line; insert "Phase Z — Gate (signed off 2026-05-03)" header between Z.5 and Phase 0 sections); (2) widen `docs/methodology/templates/phase-0-swarm-prompt.md` to default to **VERTICAL SLICE MODE** (perf + functional + UX + a11y + RBAC in one walkthrough per area) instead of dimension-themed mode (PERFORMANCE-only, ACCESSIBILITY-only, etc., which forces N agents per area and triples token spend); (3) add 3-contract smoke pinning the gate header + Z.5 done state + template's new VERTICAL SLICE MODE section. The dimension-themed mode is preserved as LEGACY (still useful for dimension-specific deep-dives, e.g. a pure security audit) but no longer the swarm's default.
- **Files in scope:**
  - `SLICES-speed.md` (Z.5 done flip + Phase Z gate header + this slice entry per Q3 placement)
  - `docs/methodology/templates/phase-0-swarm-prompt.md` (add VERTICAL SLICE MODE as new default; frame existing dimension-themed mode as LEGACY; worked example for Foundation/Speed Audit area "Market Intel building profile")
  - `tests/smoke/phase-0-prep.test.ts` (new — 3 contracts; path corrected from kickoff typo per Q4)
- **Smoke contract regex pins (3):**
  1. **C1 — VERTICAL SLICE MODE in template:** `docs/methodology/templates/phase-0-swarm-prompt.md` matches `/VERTICAL SLICE MODE/`.
  2. **C2 — Phase Z gate header in ledger:** `SLICES-speed.md` matches `/## Phase Z — Gate \(signed off/`.
  3. **C3 — Z.5 done with PR #56 + build SHA:** `SLICES-speed.md` Z.5 section has status `done` AND outcome line matches BOTH `/PR #56/` AND `/build 2cd4a3b6/`.
- **Estimated lines:** ~30 ledger edits + ~80 template additions + ~50 smoke + ~40 plan-of-record = ~200. Within 280.

## Plan of record

**Three-commit choreography (one PR):**

1. **`chore(slices): flip Z.5 done + Phase Z complete gate header + phase-0-prep plan-of-record`** — this commit. Append plan-of-record (this section); flip Z.5 `awaiting_review` → `done` with PR #56 + build 2cd4a3b6 outcome line; insert "Phase Z — Gate (signed off 2026-05-03)" header with 9-item checklist (8 checked + Asana unchecked per Q5); flip phase-0-prep `pending` → `in_progress`.

2. **`feat(methodology): widen phase-0-swarm-prompt template for vertical-slice mode + smoke contract`** — implementation. Add VERTICAL SLICE MODE section as new default to `docs/methodology/templates/phase-0-swarm-prompt.md`; frame existing dimension-themed mode as LEGACY; add worked example. Create `tests/smoke/phase-0-prep.test.ts` with 3 contracts.

3. **`chore(slices): mark phase-0-prep awaiting_review`** — flip phase-0-prep `in_progress` → `awaiting_review`. Phase-0-prep's `done` flip lands in the FIRST Phase 0 swarm slice's PR per cross-slice flip pattern.

**Q1 — Kickoff verbatim for gate items.** 9 items in the gate checklist exactly as kickoff worded them, except Asana item adjusted per Q5.

**Q2 — Build SHA confirmed.** Phase Z deploy build = `2cd4a3b6` (full UUID `2cd4a3b6-70b5-4344-9ce3-ad87dfbb5807`, deploy SUCCESS at 2026-05-03T23:17). Used in Z.5 outcome line for traceability.

**Q3 — Phase 0 prep entry placement.** Inside Phase 0 section as the first entry. Replaces the "Empty until Phase Z gate signed off" placeholder. Pre-Phase-0-swarm prep work (which this is) belongs in the Phase 0 section so the next agent picking up Phase 0 sees it as the entry point, not buried in Phase Z.

**Q4 — Smoke path typo fix.** Test file at `tests/smoke/phase-0-prep.test.ts` (kickoff said `tests/smoke/phase-0-prep-prep.test.ts` — duplicated word).

**Q5 — Asana item DEVIATION from kickoff.** Kickoff lists Asana board setup as `[x]` checked. Reality: Asana setup was pragmatically deferred during Phase Z because SLICES-speed.md served as the single canonical execution ledger and stakeholder visibility was not yet blocking. **Marked `[ ]` UNCHECKED** with deferral note. If/when stakeholder visibility becomes blocking, file `phase-0-followup-asana-setup` (not pre-filed in Phase 5 backlog now — only file when actually needed, per methodology v2.2 §"Phase 5 stubs are deferred work, not speculative work").

**Q6 — Stub count reconciliation.** Kickoff narrative claimed "11 Phase 5 stubs filed during Phase Z". Verified via `grep -c "^### \`z" SLICES-speed.md` = **10**. The kickoff over-counted by 1; gate header reflects the true count (10). Likely root cause: kickoff was drafted while Z.5 plan-of-record was still being appended (which filed `z5-followup-unwrap-health-span` as the 10th, not 11th). No action needed — captured here for traceability per methodology v2.2 §"Verified-claim audit pattern".

**VERTICAL SLICE MODE rationale (template change):** The dimension-themed mode (PERFORMANCE-only, ACCESSIBILITY-only, SECURITY-only, UX-only) treats each dimension as an independent audit pass per area. For a 10-area audit × 4 dimensions = 40 agent runs. Token cost scales linearly with dimension count, but most bugs in real-world product surfaces cross dimensions (a 4s LCP also hides an a11y skip-link gap, a missing aria-label, AND an unauthenticated data leak — all visible in the same walkthrough). Vertical-slice mode runs ONE agent per area covering all dimensions; the agent captures whatever it finds across the 4 axes. Result: 10 runs instead of 40, cross-dimensional patterns surface earlier (synthesis step still consolidates by pattern, not by dimension), and agents naturally prioritize what's most broken in their area instead of grading one dimension while ignoring obvious other-dimension issues.

The dimension-themed mode is NOT removed — it's preserved as LEGACY for future audits where a pure single-dimension deep dive is genuinely the right tool (e.g. a SOC 2 prep audit that needs ONLY security findings, not noise from perf/UX). New default is vertical-slice; opt into dimension-themed when the audit's purpose is single-axis.

**Cross-slice flip pattern:** Phase-0-prep's `done` flip lands in the FIRST Phase 0 swarm slice's PR (continuing the chain). The chain extends: Z.6 → Z.0a → Z.0b → Z.1 → Z.2 → Z.3 → Z.4 → Z.5 → phase-0-prep → [first Phase 0 area].

**Open questions for Nathan:** none after pre-approval round (6 questions answered + Q5 deviation captured + Q6 stub-count reconciliation surfaced).

- **Files:** see Files in scope above.
- **Success criteria:** new smoke test passes (3 contracts); existing 418/418 vitest suite still green (+3 from this slice → 421); local `npm run build` succeeds; SLICES-speed.md gate header reads cleanly; template VERTICAL SLICE MODE section renders coherently when read by next-agent picking up first Phase 0 swarm slice.
- **Depends on:** PR #56 (Z.5, merged 2026-05-03) — `/api/health` endpoint live + baselines doc with cold-start section.
- **Requires approval:** Pre-approved by Nathan (6 questions answered).
- **Outcome:** _filled in at PR-merge time. Phase 0 swarm opens after this PR merges._
- **Kickoff prompt:** Phase 0 prep narrative (chat, 2026-05-03) — no separate kickoff doc since this is connective tissue between Phase Z and Phase 0, not a kickoff-prompt-document slice.
- **Branch:** `chore/phase-0-prep` off `origin/main`.

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

### `z4-followup-verify-prod-dsn-inlining`
- **Status:** Phase 5 backlog
- **Background:** Z.4 (PR TBD) hardcoded the Sentry DSN literal value in `next.config.ts`'s `env` block as defensive insurance against the Turbopack edge-bundling issue documented in CLAUDE.md (same root cause as the `NEXT_PUBLIC_SUPABASE_*` workaround). In dev, DSN inlining was verified working: grep of the dev bundle found the literal `3c5724a8` DSN prefix in `Documents_vettdre_src_instrumentation-client_ts_*.js`. **Prod-side inlining was NOT verified** because the agent running Z.4 cannot reach the deployed Chrome console.
- **Why deferred:** Verification requires opening `https://app.vettdre.com` in Chrome post-Z.4-merge and checking DevTools console. Pure access constraint; no code work for this stub if verification passes.
- **Required input before slicing:** Deployed prod access (Nathan or whoever has the laptop+browser).
- **Verification steps:**
  1. After Z.4 merges and the next deploy ships, open `https://app.vettdre.com` in Chrome.
  2. Open DevTools console; navigate around (login, dashboard, market-intel).
  3. **If `Invalid Sentry Dsn: $NEXT_PUBLIC_SENTRY_DSN` does NOT appear:** Z.4's hardcode worked. Mark this stub `verified` and close.
  4. **If the error DOES appear:** the hardcode didn't fix it; investigate alternative inlining mechanism (e.g. webpack `DefinePlugin` config inside `withSentryConfig`, or `instrumentation-client.ts` running before env-var injection completes). File a hot-fix slice based on findings.
- **Affected surfaces:** purely observational unless step 4 fires; in that case, likely `next.config.ts` (alternative inlining mechanism) or `src/instrumentation-client.ts` (DSN fallback).
- **Filed:** 2026-05-03 by Nathan (Z.4 shipping, prod verification deferred for environment-access reasons).

### `z5-followup-unwrap-health-span`
- **Status:** Phase 5 backlog (hold until Cloud Scheduler keepalive lands)
- **Background:** Z.5 (PR TBD) wrapped the `/api/health` GET handler in `Sentry.startSpan({ name: "health.check", op: "http.server.health" }, ...)` per Q2(a) approval. Useful during Phase 0 + early Phase 1 for cold-start visibility in Sentry traces. **Trade-off acknowledged at slice time:** when Cloud Scheduler keepalive lands (Phase 1+), every ping creates a span — at 1 ping/min that's ~1,440 spans/day of pure noise.
- **Trigger:** when the slice that wires Cloud Scheduler keepalive ships (likely a Phase 1 slice driven by Z.5's measurements via the decision tree in the baselines doc).
- **Required input before slicing:** confirmation that keepalive is wired and pinging `/api/health` regularly. Without keepalive, the span wrap stays useful — don't unwrap prematurely.
- **Affected surfaces:** `src/app/api/health/route.ts` (remove the `Sentry.startSpan` wrap; keep the JSON payload intact). Smoke test C2 (payload shape) keeps passing; no smoke contract pins the span wrap explicitly so removing it is safe.
- **Decision when slicing:** consider whether to drop the span entirely or replace with `Sentry.setTag("health-ping", true)` so keepalive pings can be filtered out at the Sentry dashboard level — preserves visibility for non-keepalive traffic (e.g. external monitoring tools, manual probes) while suppressing noise.
- **Filed:** 2026-05-03 by Nathan (Z.5 shipping, deliberate deferral for when keepalive lands).
