# BMS Overhaul — Slice List (SLICES.md)

**Created:** 2026-04-28 from `docs/handoff/bms-audit-2026-04-28.md` and `docs/handoff/bms-overhaul-bootstrap.md`.
**Branch:** `feat/bms-overhaul-2026-q2`
**Audit reference:** `docs/handoff/bms-audit-2026-04-28.md`

This file is the single source of truth for the work. Claude Code agents update
status fields as they go. Nathan approves at phase boundaries.

---

## Status legend
- `pending` — not started
- `in_progress` — currently being worked on
- `awaiting_review` — PR open, waiting for Nathan
- `done` — PR merged
- `blocked` — needs Nathan's input (note why)

## Phase legend
- `Z` — Setup (one-time)
- `0` — Data + override consistency
- `1` — Manager workflow consolidation
- `2` — Agent + Client Onboarding
- `3` — IA + polish

---

## Phase Z — Setup

### Z1 — Push parent branch
- **Status:** `awaiting_review`
- **Goal:** Push feat/super-admin-cross-tenant-view (38 unpushed commits) to origin.
- **Closes bug:** N/A (infra)
- **Files:** None (git only)
- **Discovery:** `git status`, `git log origin/...HEAD --oneline`
- **Success criteria:** origin tip matches local HEAD; backup tag pushed.
- **Requires approval:** YES (granted by Nathan 2026-04-28).
- **Outcome:** Pushed `backup/super-admin-pre-rebase-2026-04-27` first, then force-with-lease pushed `feat/super-admin-cross-tenant-view` (overrode 3 stale pre-rebase commits with 38 rebased + new commits). Origin tip = local HEAD `b264a45`.

### Z2 — Create overhaul branch
- **Status:** `awaiting_review`
- **Goal:** Branch feat/bms-overhaul-2026-q2 from feat/super-admin-cross-tenant-view.
- **Files:** None (git only)
- **Success criteria:** Branch exists on origin, tracking set up.
- **Depends on:** Z1
- **Requires approval:** No.
- **Outcome:** Branch created and pushed with `-u`. Tracking origin/feat/bms-overhaul-2026-q2.

### Z3 — Vitest scaffolding
- **Status:** `awaiting_review`
- **Goal:** Add Vitest + 5 smoke tests + `npm run check` script.
- **Files:** `vitest.config.ts` (new), `tests/setup.ts` (new), `tests/smoke/critical-paths.test.ts` (new), `package.json` (script additions only).
- **Success criteria:** `npm run test` passes locally.
- **Depends on:** Z2
- **Requires approval:** No.
- **Outcome:** 6 smoke tests passing in 210ms. Tests cover the pure-logic core of each named surface (RBAC matrix, status-label maps, processing-fee math) — page-render fallback declined because mocking Prisma+Supabase+cookies for happy-dom is more brittle than what it catches; bootstrap explicitly tolerated this. Vitest scoped to `tests/**` via `include[]` so the pre-existing `src/lib/**/*.test.ts` ad-hoc test files don't confuse discovery.
- **Known baseline issue:** `npm run check` fails on lint baseline (~4530 pre-existing errors). Documented in commit message and CLAUDE.md. Until Phase 3 cleanup, agents run `npm run typecheck && npm run test && npm run build` as the practical green-bar gate; lint only the changed files.

### Z4 — Agent constitution in CLAUDE.md
- **Status:** `awaiting_review`
- **Goal:** Append "Agent operating principles" section to CLAUDE.md.
- **Files:** `CLAUDE.md` (append only — do not modify existing content).
- **Success criteria:** Section renders cleanly; commits without conflicts.
- **Depends on:** Z2
- **Requires approval:** No.
- **Outcome:** 88-line append. Includes the baseline carve-out clarifying that "never skip `npm run check`" means "don't *increase* the baseline error count" until Phase 3 turns lint/strict back on.

### Z5 — SLICES.md committed
- **Status:** `awaiting_review`
- **Goal:** This file. Commit it. Move audit + bootstrap into `docs/handoff/`. Open the Phase Z PR.
- **Files:** `SLICES.md` (this file); `docs/handoff/bms-audit-2026-04-28.md` (moved); `docs/handoff/bms-overhaul-bootstrap.md` (moved).
- **Success criteria:** PR open, all Z slices marked `awaiting_review`.
- **Depends on:** Z1–Z4
- **Requires approval:** No (this slice opens the approval gate).

**[PHASE Z APPROVAL GATE — STOP HERE]**

---

## Phase 0 — Data + override consistency (Week 1)

### 0a — Single deal data model
- **Status:** `awaiting_review` (discovery committed; canonical-store decision pending)
- **Goal:** Decide canonical store for "deals." Recommend: `DealSubmission` for inbound, `Transaction` for closed. Deprecate CRM `Deal` for BMS use cases.
- **Closes bug:** B-002, B-004 (root cause)
- **Files:** prisma/schema.prisma (read-only at first), lib/bms-types.ts, src/app/(dashboard)/brokerage/dashboard/page.tsx, plus any server actions querying deals
- **Discovery:** Mapped every BMS surface to its DB query. Documented in `docs/bms-data-sources.md` (commit `ba9e63c`).
- **Success criteria:** Document committed; Nathan approves the canonical-store choice.
- **Depends on:** Z5
- **Requires approval:** YES — Nathan picks the canonical store before code.
- **Outcome (discovery):** CRM `Deal` is not used by any BMS surface. Within BMS, `DealSubmission` and `Transaction` are sequential (1:1 link), not parallel. Audit's "$0 paid out" symptom traces to incomplete insert chain (Gulino's import skipped past Invoice + Payment), not to a fragmented data model. **Recommendation: reaffirm the existing schema; backfill the chain in 0b; thread override in 0c.** Awaiting Nathan's call.

### 0b — Backfill Gulino's missing Invoice + Payment records
- **Status:** `awaiting_review` (live --apply complete; verification clean; PR awaiting merge)
- **Goal:** 18 paid DealSubmissions in Gulino's tenant have no corresponding Invoice/Payment rows. Backfill them so financial surfaces reconcile.
- **Closes bug:** B-007, B-008
- **Files:** `scripts/2026-04-28_audit_gulino_chain.ts` (read-only audit), `scripts/2026-04-28_backfill_gulino_payments.ts` (idempotent backfill, dry-run default)
- **Discovery (audit, read-only):** Resolved: of the 18 DealSubmissions, **all 18 have Transaction rows** (stage=`payment_received`) and **all 18 have Invoice rows** (status=`paid`, paid_date populated, GG-IMPORT-001..018). What is missing is the **Payment** rows — 0 of 18 invoices have any payment row. The `$0 paid out` symptom traces to Reports/Leaderboard summing from `payments`, not `invoices.agent_payout`. Audit output: `docs/handoff/gulino-chain-audit.md` + `.csv` (gitignored).
- **Plan:** insert one Payment per missing invoice with `amount=invoice.agent_payout`, `payment_date=invoice.paid_date`, `payment_method=check`, `reference_number=BACKFILL-2026-04-28`. One audit_log row per payment. Idempotency via skip-if-any-payment-exists per invoice.
- **Dry-run output (2026-04-28):** 18 payments planned, total $20,110.83. Matches Σ DS.agent_payout snapshot ($20,110.83) one-to-one. Saved at `docs/handoff/gulino-payment-backfill-dryrun.txt` (gitignored).
- **Apply (2026-04-29):** Nathan reconciled dry-run vs `gulino-payout-reconciliation.xlsx` (per-agent + 3 spot-checks); approved. First `--apply` hit Prisma's default 5s tx timeout (36 round-trips × Session Pooler latency). Bumped to `{ timeout: 60_000, maxWait: 10_000 }`; second `--apply` succeeded: 18 inserted / 0 skipped.
- **Verification (2026-04-29):** 18 Payment rows with ref=`BACKFILL-2026-04-28`, Σ amount=$20,110.83, 18 audit_log rows with `metadata.source='2026-04-28_backfill_gulino_payments.ts'`. Re-audit: full DS→TX→INV→PAY chain present 18/18. `/brokerage/payments` simulator shows TOTAL PAID flipped from $0 → $20,110.83. Idempotency confirmed: 3rd `--apply` inserted 0. Logs saved to `docs/handoff/gulino-payment-backfill-{apply,verify}.txt` (gitignored).
- **Out of scope:** Kristin's $175 recruiting override + John/Nathan $437.50 each on Alejandra's 2684 West Street deal. Not in this backfill — `payments.amount` is primary-agent net payout per schema convention. Override-share splits live elsewhere; future slice if needed.
- **Success criteria:** Script idempotent (re-runnable). Dry-run is the default mode (`--apply` required to write). Nathan reconciles dry-run vs `gulino-payout-reconciliation.xlsx` and approves before live run. ✓ all met.
- **Depends on:** 0a
- **Requires approval:** YES — Nathan approves dry-run output before live run. ✓ approved 2026-04-29.

### 0c — Override consistency on User/BrokerAgent/Onboarding/Settings
- **Status:** `awaiting_review` (action-layer threading complete; smoke test gates further regressions; transactions/actions.ts deferred to 0c-followup)
- **Goal:** Sweep all DB queries that take orgId, route through `getCurrentOrgContext()`. Add unit test per surface.
- **Closes bug:** B-009 (partial), B-010, B-012 (partial — page redirect still drops `?as_org`), B-013 (server-side), B-022 (partial)
- **Files:** Threaded reports/actions.ts, settings/actions.ts, commission-plans/actions.ts, compliance/actions.ts, dashboard/actions.ts, agents/actions.ts (all 11 exports), agents/[id]/actions.ts, leaderboard/actions.ts (getAgentGoals), payments/actions.ts (5 of 6 exports). Smoke test added at `tests/smoke/override-scoping.test.ts` enforcing the contract.
- **Discovery:** Grep audit found 15 BMS action files; 295 tsc errors at baseline = 295 post-sweep (no regression).
- **Success criteria:** All callsites route through helper. ✓ All threaded surfaces' exports accept `options: { overrideAsOrg?: string } = {}` and forward to local `getCurrentOrg(options)`. Smoke test verifies via static-source assertion.
- **Deferred (0c-followup):** transactions/actions.ts (27 exports — the file was partially threaded in PATCH B, but the bulk of exports still need the param + forward call); deal-submissions/actions.ts (`quickAddProperty`, `getAgentSplitForDeal`). Public token-authenticated flows (`submitDeal`, `createPublicDealSubmission`, `getPublicSubmissionLink`, `regenerateSubmissionToken`) and pure utilities (`validateExcelData`, leaderboard internal helpers) are exempt by design and listed in the smoke test's EXEMPT_EXPORTS map with reasons.
- **Out of scope:** Page-level wiring. `searchParams.as_org` → action-call threading on the *call sites* is non-trivial for some pages (notably client components like `dashboard/page.tsx` that don't read searchParams today). The action layer is now override-capable; per-page wiring is a separate sweep.
- **Depends on:** Z5
- **Requires approval:** No, but stop if you find a >5-line change to `middleware.ts`. ✓ none required.

### 0d — Override banner z-index fix
- **Status:** `awaiting_review`
- **Goal:** Banner currently cut off ("g as Gulino Group" — "Viewing as" hidden behind sidebar logo).
- **Closes bug:** B-001
- **Files:** `src/components/layout/super-admin-banner.tsx` (added `relative z-50`).
- **Success criteria:** Banner renders with full text, doesn't overlap sidebar. ✓
- **Outcome:** Sidebar is `fixed inset-y-0 left-0 z-40`. The banner was rendered in document flow with no z-context, so the sidebar's full-height fixed positioning covered the leftmost ~60px (the "Super-admin override:" prefix). Single-line CSS fix: `relative z-50` on the banner root puts it in front of the sidebar within the banner's vertical band, leaving the sidebar visible below.
- **Depends on:** None
- **Requires approval:** No.

### 14 — Reliability fix on /brokerage/client-onboarding 503s
- **Status:** `awaiting_review`
- **Goal:** Track down the 503s observed in production network log. Add structured error handling.
- **Closes bug:** B-027 (improved observability + UX), B-028 (transient retry)
- **Files:** `src/app/(dashboard)/brokerage/client-onboarding/actions.ts` (Sentry instrumentation on `getOnboardings`, `getOnboarding`, `createOnboarding` catch blocks; surface real error message instead of swallowing); `page.tsx` (one-shot retry on transient failure; "Try again" button in error toast).
- **Discovery:** Audit sources: action layer already returns structured `{success, error}` (slice prereq met); Send Invite button already shows loading via `submitting` state (slice prereq met). What was missing: (a) Sentry capture from inside action catch blocks — without it, prod errors are invisible because they don't bubble to global-error.tsx; (b) intermittent-503 absorption on the read path; (c) actionable retry UI on the user side.
- **Outcome:**
  - **Observability:** `Sentry.captureException` calls added with `tags: { surface: "client-onboarding", action: <name> }` and surface-specific `extra` context (filters, onboardingId, clientEmail, deliveryMethod, templateCount). Now we can finally tell whether prod 503s are PDF generation, storage upload, SMS/email, or DB pool. The catch blocks also now surface the underlying `error.message` instead of a generic string.
  - **Self-healing:** `fetchData` does a single retry after 1.5s on the read path before showing an error. Absorbs Cloud Run cold-start and Supabase pooler reconnect blips, which is the most likely 503 mode for a low-traffic surface.
  - **User recovery:** error toast now has a "Try again" button that re-runs `fetchData(page, statusFilter)` without a full page reload.
- **Success criteria:**
  - No more 503s during smoke testing. → Cannot verify without prod observability; Sentry capture is the prerequisite for verifying. Will see in dashboard after deploy.
  - Failed POSTs return structured `{success: false, error}`. ✓ (was already done in actions.ts; verified during this slice).
  - Send Invite button shows loading state. ✓ (was already done; verified during this slice).
- **Depends on:** Z5
- **Requires approval:** YES if root cause requires infra change (Cloud Run scaling, DB pool size). → No infra change made in this slice. Once Nathan reviews Sentry events post-deploy, the actual root cause may surface and a follow-up infra slice can be filed.

**[PHASE 0 APPROVAL GATE — `awaiting_review` 2026-04-29]**

Phase 0 status as of 2026-04-29:
- 0a discovery committed in PR #2 (data sources map, canonical-store decision)
- 0b backfill applied: 18 Gulino payment rows, $20,110.83 total, full DS→TX→INV→PAY chain restored (PR #3, commit `1e2d3cb`)
- 0c override threading swept across 9 BMS action files + smoke test (PR #4)
- 0d banner z-index fix (PR #5)
- 14 client-onboarding observability + 503 retry (PR #6)
- Phase 0 gates: typecheck 295 (= baseline 295), test 33/33, lint 4530 (= baseline 4530), build ✓
- Awaiting Nathan's approval to start Phase 1

---

## Phase 1 — Manager workflow consolidation (Week 2)

### 1a — Make table rows clickable across BMS
- **Status:** `pending`
- **Goal:** Rows in deal-submissions, transactions, invoices, agents, onboarding open detail panel on click.
- **Closes bug:** B-006
- **Files:** Each list page + table component.
- **Success criteria:** Click opens detail. Keyboard navigation works (Enter on row).
- **Depends on:** Phase 0 done
- **Requires approval:** No.

### 1 — Unified Pending Approval queue
- **Status:** `pending`
- **Goal:** /brokerage/deal-submissions becomes the manager's primary inbox. Card layout. Inline expand-to-detail. "Approve & Push to Invoice" primary CTA.
- **Closes bug:** B-006 (alongside 1a). Major UX uplift.
- **Files:** `src/app/(dashboard)/brokerage/deal-submissions/*` and components.
- **Success criteria:** Manager can approve a submission and create an Invoice in one click.
- **Depends on:** 1a, Phase 0
- **Requires approval:** YES — show wireframe / progress to Nathan before final styling.

### 2 — Invoice creation in-context
- **Status:** `pending`
- **Goal:** Approving a submission auto-creates an Invoice draft. Manager doesn't navigate to /invoices separately.
- **Files:** server actions for approval flow; Invoice model.
- **Success criteria:** Approve triggers Invoice insert with the right values; visible on Invoices list.
- **Depends on:** 1
- **Requires approval:** No.

### 3 — Payment recording in-context
- **Status:** `pending`
- **Goal:** Manager can record payment on the deal-detail panel. Invoice status updates to Paid.
- **Files:** deal-detail panel + Payment server action.
- **Success criteria:** Payment recorded; Invoice marked paid; audit log entry.
- **Depends on:** 2
- **Requires approval:** No.

### 1b — Default landing per role
- **Status:** `pending`
- **Goal:** Manager logs in → /brokerage/dashboard. Agent → /brokerage/my-deals. Super_admin → admin home.
- **Closes bug:** B-018
- **Files:** `middleware.ts`, `src/app/page.tsx`, possibly `src/lib/supabase/middleware.ts`
- **Success criteria:** Each role lands correctly. Test as Anthony, as Nathan, as a manager-role user.
- **Depends on:** None blocking
- **Requires approval:** YES — middleware change.

### 4 — Manager dashboard rebuild
- **Status:** `pending`
- **Goal:** Replace 11-KPI grid with role-specific dashboard. 4 KPIs, "Pending review (n) →", today's tasks, top-3 leaderboard, this-month financials.
- **Closes bug:** B-002, B-003 (now that data reconciles), addresses U-006, U-007, U-011
- **Files:** `src/app/(dashboard)/brokerage/dashboard/page.tsx`, `components/bms/*`
- **Success criteria:** Dashboard shows correct numbers (matches Submissions/Transactions). One primary CTA visible.
- **Depends on:** 0a, 0b
- **Requires approval:** YES — show progress before final layout.

**[PHASE 1 APPROVAL GATE — STOP HERE]**

---

## Phase 2 — Agent + Client Onboarding (Week 3)

### 7a — Agent picker on Onboarding form
- **Status:** `pending`
- **Goal:** Form has agent dropdown. Defaults to current user; admin/owner can pick.
- **Closes bug:** B-024
- **Files:** `src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx` + actions.
- **Success criteria:** Picker only shows agents in current tenant. Onboarding assigned to picked agent.
- **Depends on:** Phase 1
- **Requires approval:** No.

### 17 — Onboarding form UX cleanup
- **Status:** `pending`
- **Goal:** Fix placeholder-as-prefill (B-025/B-026), currency formatting on blur, Send Invite loading state, conditional Personal Note based on delivery method.
- **Closes bug:** B-023, B-025, B-026, B-029
- **Files:** `new/page.tsx` + components.
- **Success criteria:** Manual smoke test — form behaves correctly through full submit cycle.
- **Depends on:** 14, 7a
- **Requires approval:** No.

### 18 — Onboarding empty state + list reliability
- **Status:** `pending`
- **Goal:** Payments-style empty state on /client-onboarding. Investigate B-019 (same URL → different data).
- **Closes bug:** B-019, U-071
- **Files:** /client-onboarding/page.tsx; data fetch.
- **Success criteria:** Empty state with illustration + CTA when 0 records. Same URL produces same data on multiple loads.
- **Depends on:** 0c (override fix should resolve B-019 root cause)
- **Requires approval:** No.

### 13 — Profile-completion banner for agents
- **Status:** `pending`
- **Goal:** When agent's profile (License #, Phone, Email) is incomplete, show banner on /my-deals + Settings.
- **Closes bug:** B-017
- **Files:** my-deals + settings/profile pages.
- **Success criteria:** Banner shows for incomplete profile; banner dismisses after fields filled.
- **Depends on:** None blocking
- **Requires approval:** No.

### 6 — Default landing for agent (continued from 1b if needed)
- **Status:** `pending`
- **Goal:** Confirm 1b covers agent flow. If not, add agent-specific landing logic.
- **Depends on:** 1b
- **Requires approval:** No.

**[PHASE 2 APPROVAL GATE — STOP HERE]**

---

## Phase 3 — IA + polish (Week 4)

### 7 — Single sidebar per role
- **Status:** `pending`
- **Goal:** Brokerage admins → brokerage-shaped sidebar (no investor-shaped global sidebar). Agents → agent-shaped sidebar (existing MY WORK / COMMUNICATION / RESEARCH).
- **Closes bug:** addresses U-001 through U-005, U-012
- **Files:** `src/components/layout/sidebar.tsx`, `mobile-nav.tsx`, dashboard `layout.tsx`
- **Success criteria:** Manual test as each role. No "Acquisitions / Closing" jargon for brokerage admins. No Brokerage section visible to pure agents.
- **Depends on:** Phase 2
- **Requires approval:** YES — show wireframe.

### 8 — Brokerage nav flatten
- **Status:** `pending`
- **Goal:** From 7 sections × 14 items to 3 sections × 8-10 items.
- **Closes bug:** U-013, U-014, U-016
- **Files:** brokerage layout sub-sidebar.
- **Success criteria:** Manager nav matches consulting proposal in audit doc.
- **Depends on:** 7
- **Requires approval:** No.

### 9 — Replace mixed icons + ALL CAPS labels
- **Status:** `pending`
- **Goal:** All-lucide. Mixed-case section labels.
- **Closes bug:** U-002, U-004
- **Files:** sidebar components.
- **Success criteria:** No emoji icons. No ALL CAPS section headers.
- **Depends on:** 7
- **Requires approval:** No.

### 10 — Empty states pattern across all surfaces
- **Status:** `pending`
- **Goal:** Every surface has Payments-style empty state (illustration + helpful subtitle + primary CTA).
- **Closes bug:** U-029, U-071
- **Files:** Every list page.
- **Success criteria:** Manual sweep confirms.
- **Depends on:** Phase 2
- **Requires approval:** No.

### 19 — Document template management UI
- **Status:** `pending`
- **Goal:** Settings → Brokerage → Templates tab. Upload custom PDFs + map fields.
- **Closes bug:** U-076, U-084
- **Files:** new — settings templates page + template upload action.
- **Success criteria:** Brokerage admin can upload + map a custom doc. Visible in onboarding form.
- **Depends on:** Phase 2
- **Requires approval:** YES — biggest new feature, scope check.

### 20 — Signing flow end-to-end audit + fixes
- **Status:** `pending`
- **Goal:** Walk /sign/[token] flow. Test mobile, multi-device, resume mid-signing. Fix what breaks.
- **Closes bug:** Various deferred from initial audit
- **Files:** `src/app/sign/[token]/*` + signing components.
- **Success criteria:** Manual + smoke test pass on mobile + desktop.
- **Depends on:** Phase 2
- **Requires approval:** No.

### 3.X — Parent branch cleanup
- **Status:** `pending`
- **Goal:** Merge `feat/super-admin-cross-tenant-view` to main as 3 batched PRs (PR-A condo_ownership pipeline, PR-B processing-fee + hotfixes, PR-C auth super-admin override).
- **When:** After Phase 0 merges to `feat/super-admin-cross-tenant-view`, BEFORE Phase 1 branches. The stack is flat at that exact moment — only safe window.
- **Files:** parent branch only (no overhaul-branch touches).
- **Success criteria:** main commit graph reflects production reality; new Phase 1 branch off clean main; no overhaul rebases needed.
- **Depends on:** Phase 0 merge to parent.
- **Requires approval:** YES on PR-A (12 migrations + ingestion pipeline); PR-B and PR-C are small and reviewable but should be inspected.

**[PHASE 3 APPROVAL GATE — STOP HERE]**

---

## After Phase 3

The post-launch hygiene queue from `docs/handoff/bms-audit-2026-04-28.md` (Prisma
schema drift, last_login_at, magic-link guard, transactions.stage, co-broker invoice
path, TypeScript strict mode, ESLint baseline cleanup, etc.) becomes the next sprint
of slices. Add as `Phase 4 — Hygiene` when Phase 3 ships.

The future-features list (Cmd-K, in-app messaging, scheduled reports, mobile-optimized
agent flow, bulk approve) becomes `Phase 5 — Q3 features`. Don't start until product
direction is clear.
