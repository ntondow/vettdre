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

### 0c2 — Page-level wiring sweep for `?as_org` override (follow-up to 0c)
- **Status:** `awaiting_review`
- **Goal:** Phase 0 verification on production found that BMS pages still showed home-org KPIs while the banner reported "Viewing as Gulino Group." Action layer was already override-capable from 0c, but client pages were not threading `?as_org` from the URL into action calls — server actions then fell back to referer-parsing, which is unreliable.
- **Closes bug:** Phase 0 verification Failure 1 (TOTAL PAID = $0 on `/brokerage/payments` for Gulino), Failure 3 (B-012 redirect shim at `reports/page.tsx` dropping query params). Completes B-013 page-side.
- **Files:**
  - **DB audit (read-only):** `scripts/2026-04-29_audit_payments_kpi.ts` — confirmed Gulino orgId `5ecba9ba-6de1-4b1e-bb6a-3f2dfef81670` has 18 Payment rows / $20,110.83 sum. Backfill correct; bug was page wiring.
  - **Page wiring (12 surfaces):** `payments/page.tsx`, `dashboard/page.tsx`, `commission-plans/page.tsx`, `agents/page.tsx`, `compliance/page.tsx`, `listings/page.tsx`, `setup/page.tsx`, `client-onboarding/page.tsx`, `settings/page.tsx`, `settings/audit-log.tsx`, `reports/{pnl,production,tax-prep,pipeline}/page.tsx`. Pattern: `useSearchParams()` + `useMemo(overrideOpts)` + thread `overrideOpts` to all action call sites; add `overrideOpts` to relevant `useEffect` deps so loaders re-run on `?as_org` change.
  - **Redirect shim:** `reports/page.tsx` rewritten as async server component that reads `searchParams` and forwards them to `/brokerage/reports/pnl?…`.
  - **Action layer extensions:** `transactions/actions.ts` (added `options` to `getRecentActiveTransactions`), `setup/actions.ts` (`getSetupProgress`), `agents/onboarding-actions.ts` (`inviteAgent`, `bulkInviteAgents`, `revokeInvite`, `getPendingInvites`), `listings/actions.ts` (8 actions: `createListing`, `updateListing`, `getListings`, `updateListingStatus`, `getListingStats`, `createProperty`, `getProperties`, `getAgentsForDropdown`), `client-onboarding/actions.ts` (`getOnboardings`, `voidOnboarding`, `resendOnboarding`, `deleteOnboarding`, `archiveOnboarding`), `deal-submissions/actions.ts` (`getPublicSubmissionLink`, `regenerateSubmissionToken`).
- **Success criteria:** Visiting `?as_org=<gulino-id>` makes every BMS page consistently show Gulino data — KPIs, lists, settings, reports, onboardings, listings, agents. ✓ verified locally via build; awaiting prod verification.
- **Out of scope:** Detail pages with route params (e.g. `/brokerage/agents/[id]`, `/brokerage/transactions/[id]`) — these need a separate pattern since `useSearchParams` is fine but the param-bearing pages are also reading from layouts. Filed as 0c3 if a verification gap emerges.
- **Gates:** typecheck 294 (= baseline 294), test 33/33, lint 4530 (= baseline 4530), build ✓.
- **Depends on:** 0c, 0b
- **Requires approval:** No (but stops Phase 0 verification gate from passing until merged + deployed).

### 0c3 — Override threading on detail-route pages (follow-up to 0c2)
- **Status:** `awaiting_review`
- **Goal:** Detail pages (e.g. `/brokerage/agents/[id]`) read the `?as_org` override correctly. Slice 1a verification surfaced the gap: clicking an agent row navigates with `?as_org` preserved, but the detail page returns "Agent not found" because its server-side query doesn't thread the override.
- **Closes bug:** Extends B-009 / B-022 family. Specifically the agent-detail "Agent not found" reported in slice 1a verification.
- **Implementation notes:**
  - Wired client detail pages (`useSearchParams` + `useMemo(overrideOpts)` + `detailQs`) and threaded `overrideOpts` into all action calls and internal navigation: `agents/[id]/page.tsx`, `transactions/[id]/page.tsx`, `client-onboarding/[id]/page.tsx`, `listings/[id]/page.tsx`, `listings/properties/[id]/page.tsx`.
  - Threaded read paths used by detail pages: `getTransaction`, `getDealTimeline` (transactions/actions.ts), `getOnboarding`, `generateInvoiceFromOnboarding` (client-onboarding/actions.ts), `getListing`, `getProperty` plus all listing-detail write actions (`updateListing`, `advanceListingStatus`, `revertListingStatus`, `takeOffMarket`, `putBackOnMarket`, `claimListing`, `assignListing`, `createTransactionFromListing`, `deleteListing`) and `updateProperty`/`deleteProperty` (listings/actions.ts).
  - Smoke test extended (`tests/smoke/override-scoping.test.ts`): added `client-onboarding/actions.ts` + `listings/actions.ts` to the action-file matrix, plus a new `Slice 0c3 — detail-page override threading` describe block that asserts each detail page imports `useSearchParams`, reads `as_org`, computes `overrideOpts`, and passes it to at least one action call. 46 tests pass (was 33).
- **Deferred (TODO-0c3-followup, tracked in EXEMPT_EXPORTS):**
  - `transactions/actions.ts` write surface (25 exports — `updateTransaction`, `advanceStage`, `toggleTask`, etc.) — large surface; threading deferred to a future cleanup slice.
  - `client-onboarding/actions.ts:createOnboarding` — ties the document to the calling agent's identity; product needs to clarify whether super_admin can author onboardings on behalf of another org's agent.
  - `client-onboarding/vault/[id]/page.tsx` — template editor. The vault list page itself doesn't support override (tied to org-scoped templates), so detail-page override is moot until the list page changes. Filed as a future slice.
  - `listings/actions.ts:bulkCreateListings`, `getPropertySummaries`, `fuzzyMatchProperties`, `fuzzyMatchAgents` — typeahead/import helpers, not on the detail-render path.
- **Gates:** typecheck 287 (≤ baseline 294), test 52/52 (was 33), lint 4530 (= baseline 4530), build ✓.
- **Depends on:** 0c2 (action-layer baseline), 1a (uncovered the gap).
- **Requires approval:** No (same shape as 0c2).

**[PHASE 0 APPROVAL GATE — `awaiting_review` 2026-04-29 (re-verification needed after 0c2 deploy)]**

Phase 0 status as of 2026-04-29:
- 0a discovery committed in PR #2 (data sources map, canonical-store decision)
- 0b backfill applied: 18 Gulino payment rows, $20,110.83 total, full DS→TX→INV→PAY chain restored (PR #3, commit `1e2d3cb`)
- 0c override threading swept across 9 BMS action files + smoke test (PR #4)
- 0d banner z-index fix (PR #5)
- 14 client-onboarding observability + 503 retry (PR #6)
- 0c2 page-level wiring sweep — addresses Phase 0 verification Failures 1 & 3 (PR pending, stacked on PR #6)
- Phase 0 gates: typecheck 294 (= baseline 294), test 33/33, lint 4530 (= baseline 4530), build ✓
- Awaiting Nathan's approval after re-verifying `?as_org` flow in production post-0c2 deploy

---

## Phase 1 — Manager workflow consolidation (Week 2)

### 1a — Make table rows clickable across BMS
- **Status:** `awaiting_review`
- **Goal:** Rows in deal-submissions, transactions, invoices, agents, onboarding open detail panel on click.
- **Closes bug:** B-006
- **Files:**
  - `deal-submissions/submissions-dashboard.tsx` — row click → existing `openPanel(s.id)`; Actions cell wrapped in stopPropagation.
  - `agents/page.tsx` — desktop row click → `router.push('/brokerage/agents/[id]?as_org=...')`; Account-status + Actions cells stopPropagation; mobile card Link href + action-menu link both preserve `?as_org`.
  - `client-onboarding/page.tsx` — desktop row click → `router.push('/brokerage/client-onboarding/[id]?as_org=...')`; mobile Links + action menu "View Details" preserve `?as_org`; Actions cell stopPropagation.
  - `invoices/page.tsx` — row click toggles new inline detail-expand row (issued/sent/due/paid dates, total commission, processing fee, agent/house payouts, notes); checkbox + Actions cells stopPropagation. Decision: built inline expand instead of detail panel/route because no detail destination exists today; full panel deferred to a later slice.
  - `listings/page.tsx` — added `tabIndex` + `onKeyDown` to existing table-row onClick (a11y completeness).
  - `transactions/page.tsx` — already row-wrapped in `<Link>`; skipped.
- **Success criteria:** Click opens detail. Keyboard navigation works (Enter on row). ✓ All wired surfaces use `tabIndex={0}` + `onKeyDown(Enter|Space)` + `cursor-pointer` + visible focus ring (`focus:ring-blue-500 ring-inset`).
- **Out of scope (filed as follow-ups if needed):** Mobile invoice cards (currently no row-click expand on mobile — desktop only); detail panel for invoices replacing the inline expand (slice 2 territory — invoice creation in-context).
- **Gates:** typecheck 294 (= baseline 294), test 33/33, lint 4530 (= baseline 4530), build ✓.
- **Depends on:** Phase 0 done.
- **Requires approval:** No.

### 1 — Unified Pending Approval queue
- **Status:** `awaiting_review`
- **Goal:** /brokerage/deal-submissions becomes the manager's primary inbox. Card layout. Inline expand-to-detail. "Approve & Push to Invoice" primary CTA.
- **Closes bug:** B-006 (alongside 1a). Major UX uplift.
- **Files:** `src/app/(dashboard)/brokerage/deal-submissions/*` and components.
- **Wireframe-approved scope (Nathan, 2026-04-29):**
  1. **Default tab:** "Submitted" only. Newest first.
  2. **Stub:** "+ Add" button (placeholder; hooks to existing create flow). _(deferred — existing list page already provides creation entry; no separate stub needed for v1.)_
  3. **Two primary CTAs visible in v1:** "Approve only" (no invoice side-effect) AND "Approve & Push to Invoice" (atomic).
  4. **Reject:** reason is **required**. Empty reason → block submit.
  5. **Toast on Approve & Push to Invoice:** must include inline "View invoice" action that links to `/brokerage/invoices/[id]?as_org=...` (preserves override).
  6. **Audit log:** ONE row per **logical action**. Approve+Invoice is a single logical event, not two rows. Use a `kind` field (or consolidate the audit-action enum) so the timeline doesn't double-count.
- **Implementation notes (this PR — v1 scope on top of existing dashboard):**
  - **(1)** Default `statusFilter` flipped from `"all"` to `"submitted"` in `submissions-dashboard.tsx`. Existing query already orders by `createdAt desc`, so newest-first is preserved.
  - **(3)** Detail-panel footer now shows three buttons when status=`submitted`: **Approve & Push to Invoice** (primary, blue), **Approve only** (secondary, green-outline → existing `approveSubmission`), **Reject** (red-outline → existing reject modal).
  - **(4)** Reject modal: `<textarea required>`, "_Required — the reason shows on the agent's timeline_" hint, **Reject Submission** button disabled until trimmed reason is non-empty. Server-side `rejectSubmission` also rejects empty trimmed reasons (defense-in-depth; previously accepted blanks).
  - **(5)** `toast` state extended to `{ type, message, action?: { label, href } }` with optional `durationMs` (default 4 s, 8 s for actionable toasts). `showToast` accepts an `opts` arg. The toast renders an inline `<Link>` button (preserves `?as_org`) → `/brokerage/invoices/{invoiceId}?as_org=...`.
  - **(6)** New atomic server action `approveAndCreateInvoice(submissionId, overrides?, options?)` in `deal-submissions/actions.ts`. Wraps approval flip + Invoice insert + Transaction insert + DealSubmission status update inside one `prisma.$transaction({ timeout: 15000, maxWait: 5000 })`. Writes ONE submission audit row tagged `action="approved_and_invoiced"` with full details (`previousStatus`, `invoiceId`, `invoiceNumber`, `transactionId`, `agentSplitPctOverride`, `exclusiveTypeOverride`). Invoice and Transaction get their own `action="created"` rows in their own audit timelines (those are first-existence rows, not duplicates of the submission action). Override-threaded; overrides param matches `approveSubmission` for parity. Symmetric idempotency guards (existingInvoice / existingTransaction lookups) mirror `pushToInvoice`.
  - **Smoke test:** `tests/smoke/override-scoping.test.ts` adds a `Slice 1 — Pending Approval queue` describe with four contracts: action exported with override threading, audit row tagged `"approved_and_invoiced"`, `prisma.$transaction({ timeout })` wrapper present, and `rejectSubmission` requires trimmed reason at the server.
- **Out of scope of this PR (relocated, not deferred):** Card-grid + inline-expand UI restructure — moved into slice 1c per Nathan's correction 2026-04-29. The functional changes (atomic action, required reject, toast action, default tab, three buttons) ship in PR #10 on the existing table + slide-over panel; the visual redesign follows in PR #11. Other deferrals stand: all-status tabs, bulk approve, sidebar badge (1.5), invoice draft preview.
- **Gates:** typecheck 286 (≤ baseline 294), test 56/56 (was 52), lint 0 errors in changed files (3 pre-existing unused warnings), build ✓.
- **Depends on:** 1a, Phase 0
- **Requires approval:** Wireframe approved 2026-04-29. Implementation proceeds.

### 1c — UI restructure for Pending Approval queue
- **Status:** `pending`
- **Goal:** Convert the existing dashboard to the wireframe layout. Table → card grid (one card per submission). Detail panel → inline expand-to-detail. Three buttons (Approve & Push to Invoice / Approve only / Reject) and the reject modal relocate from the slide-over footer to the expanded-card footer.
- **Closes (UX):** U-024 (rows scan-identically), U-027 (green PAYOUT looks like link), B-006 fully (1a partially closed it). Resolves the John-and-Kristin "can't tell where to click" demo issue that the layout change was meant to solve in slice 1.
- **Why this is its own slice:** Originally part of slice 1's wireframe. Deferred unilaterally (without chat surfacing) during the 1 v1 build; Nathan course-corrected and pulled it into a stacked PR. Saved feedback memory `feedback_surface_scope_cuts_before_pr.md` so this doesn't recur.
- **Files:** `src/app/(dashboard)/brokerage/deal-submissions/*` — `submissions-dashboard.tsx` plus new components (`SubmissionCard`, `SubmissionDetailExpand`, `RecentlyApprovedRail`, `EmptyState`, `TopBar`) per the wireframe component breakdown.
- **Discovery:** Re-read the wireframe ASCII layout from the slice 1 wireframe proposed earlier in the conversation. Reuse the named components rather than inventing new ones.
- **Out of scope:** Invoice tab + Payment tab inside the inline expand (slices 2 + 3). For 1c, expand renders **placeholder tabs** that are visible but disabled with copy "Available after Slice 2/3" so the tab structure is in place when 2/3 land.
- **Success criteria:**
  - Default load shows card grid for Submitted submissions.
  - Empty state ("Caught up" / similar copy) renders when no Submitted submissions.
  - Click card → expand inline (other cards stay in the grid below the expanded card; not a modal, not a drawer).
  - Three buttons in expanded-card footer; reject modal still requires a non-empty trimmed reason.
  - Toast with "View invoice" still works after Approve & Push (preserves `?as_org`).
  - Recently Approved rail in the right column showing the last 5–10 from the current session.
  - Filter checkboxes in the right column replace the status tabs.
  - Search + Agent filter survive the restructure.
- **Gates:** lint baseline 4530 unchanged in changed files; typecheck no regression below 286 (hold or improve); tests grow by ≥ 4 new contracts (card render, expand toggle, three-buttons-clickable, reject-modal validation). Build ✓.
- **Depends on:** Slice 1 (PR #10).
- **Stack:** `feat/bms-overhaul-1c-card-grid-redesign` → base `feat/bms-overhaul-1-pending-approval-queue` (PR #10).
- **Requires approval:** No — originally-approved wireframe being completed.

### 1.5 — Sidebar count badge for Submissions
- **Status:** `awaiting_review`
- **Goal:** Brokerage sub-sidebar "Submissions" item shows `[N]` where N is count of `status='submitted'` for current tenant. Hidden when zero. Override-aware so super_admins viewing another tenant see the target org's count.
- **Files:** `src/app/(dashboard)/brokerage/layout.tsx` (badge wiring + `?as_org` reading), `src/app/(dashboard)/brokerage/deal-submissions/actions.ts` (`getSubmittedCount`).
- **Server action:** `getSubmittedCount(options?)` — `view_all_submissions` permission gated (agents return 0), counts `status: "submitted"`. Override-threaded.
- **Cache strategy:** client-side fetch on mount + every pathname change. Cheap COUNT query; no extra invalidation needed since the existing `revalidatePath("/brokerage/deal-submissions")` calls in approve/reject/push-to-invoice actions plus the pathname-change refetch keep the badge fresh as managers move between sections.
- **Visual:** numeric pill (white-on-blue when inactive, blue-on-blue-tint when item is active), max display "99+". Per-href `badges` map keyed on item.href so future items (Compliance expiring, unpaid invoices) can share the same surface without touching render branches.
- **Smoke contracts (+2):**
  - `getSubmittedCount` exported, override-threaded, permission-gated, scoped to `status: "submitted"`.
  - Layout imports the action, reads `?as_org`, renders the per-href badge with hidden-when-zero behavior + `data-testid="brokerage-nav-badge-<href>"` hook for both desktop sidebar and mobile pill bar.
- **Gates:** lint 4530 (held — verified at full-project level after a pre-existing `react-hooks/set-state-in-effect` warning surfaced on a line I didn't touch); typecheck 113 (held); 73 / 73 tests (+2); build clean.
- **Stack:** `feat/bms-overhaul-1.5-sidebar-badge` → base `feat/bms-overhaul-3-payment-tab` (PR #13).
- **Depends on:** Slice 1 (uses the same status/count source).
- **Requires approval:** No.

### 2a — Defaults tab skeleton-hang fix (slice 2 follow-up)
- **Status:** `awaiting_review`
- **Goal:** Stop the Brokerage Settings → Defaults tab from hanging on its skeleton when a manager navigates straight there (without first clicking "Brokerage Settings"). Pre-existing latent bug in `page.tsx` — the `useEffect` that calls `getBrokerageSettings` only fired for `activeTab === "settings"`, so `settingsLoaded` stayed false when Defaults was the first tab clicked. Slice 2's new "CC the brokerage on invoice send" toggle made Defaults the natural verification target and surfaced it.
- **Closes:** slice 2 verification regression. Not a bug slice 2 introduced (guard predates commit `a889a3e`), but slice 2 is the reason it became user-visible.
- **Files:** `src/app/(dashboard)/brokerage/settings/page.tsx` (single useEffect guard change).
- **Fix:** extend the load guard to fire on either `activeTab === "settings"` OR `activeTab === "defaults"`, since both branches render `settingsForm` from the same `getBrokerageSettings` payload.
- **Gates:** lint 0 errors on changed file (3 preexisting warnings, unchanged); typecheck 113 (held); 66 / 66 tests; build clean.
- **Stack:** committed onto `feat/bms-overhaul-2-invoice-tab` (PR #12); no separate PR.
- **Requires approval:** No.

### 2 — Invoice tab in-context (Invoice creation + send)
- **Status:** `awaiting_review`
- **Goal:** Wire the Invoice tab inside the inline-expanded card. Lazy fetch on tab activation; populated state shows invoice number, status badge, dates strip (Issued/Due/Sent/Paid), amounts grid (Total Commission/Agent Payout/House Split/Processing Fee), Send/Resend CTA with "Email agent" toggle and idempotent resend; empty states for rejected and pre-invoiced submissions; "Push this submission to an invoice" CTA in the empty-pre-invoiced state. Per-org "CC the brokerage on invoice send" toggle in Defaults tab.
- **Closes (UX):** U-022 / U-023 (invoice context lives next to the deal, not in a separate /invoices page). Slice 1's Approve & Push already auto-creates the Invoice draft; slice 2 adds the surface where the manager interacts with it.
- **Files:** `src/app/(dashboard)/brokerage/deal-submissions/components/invoice-tab.tsx` (new), `src/app/(dashboard)/brokerage/deal-submissions/actions.ts` (`getInvoiceForSubmission`, `sendInvoiceToAgent`), `src/app/(dashboard)/brokerage/deal-submissions/components/detail-tabs.tsx` (flip `enabled`), `src/app/(dashboard)/brokerage/deal-submissions/submissions-dashboard.tsx` (wire), `src/app/(dashboard)/brokerage/settings/{actions.ts,page.tsx}` (CC toggle), `src/lib/{bms-types.ts,resend.ts}`.
- **Server actions added:**
  - `getInvoiceForSubmission(submissionId, options?)` — lazy-fetch full Invoice + `Transaction.invoiceSentAt`. Returns `{ success: true, data: null }` for empty-state semantics; `success: false` only for actual errors. Override-threaded.
  - `sendInvoiceToAgent(invoiceId, options?: { skipEmail?, overrideAsOrg? })` — first send: flips status via `updateInvoiceStatus(→"sent")` (keeps `Transaction.invoiceSentAt` + transaction-stage sync), Resend email, audit row "sent" (logged by `updateInvoiceStatus`). Resend (status === "sent"): skips status flip, re-fires email, writes "resent" audit row. CCs `bmsSettings.companyEmail` when `bmsSettings.ccBrokerageOnInvoiceSend === true`. `skipEmail` writes a "sent_offline" audit row on first-send only.
- **Success criteria:**
  - Invoice tab opens lazy: no fetch until clicked.
  - Rejected submission renders the red empty state ("No invoice will be created").
  - Pre-invoiced submission (no invoice yet) renders the empty state with a "Push this submission to an invoice" CTA. Click → existing `pushToInvoice` server action runs; toast offers "View invoice" link.
  - Populated state shows invoice number (linked to `/brokerage/invoices/[id]?as_org=`), status badge, four date cells, four amount rows.
  - Send CTA: idle → sending → ✓ Sent (1.5s) → idle. Label flips to "Resend" when status === "sent". "Email agent" checkbox controls `skipEmail`.
  - Resend writes a separate "resent" audit row.
  - Per-org CC toggle in Defaults tab; disabled when `companyEmail` is empty.
- **Gates:** lint baseline 4530 unchanged on changed files (verified 0 errors / 3 preexisting warnings); typecheck no regression below 113 errors (was 115 — improved by 2); tests grow by 5 new contracts (`getInvoiceForSubmission` thread + transaction join, `sendInvoiceToAgent` thread + idempotent resend, dashboard wiring, InvoiceTab states, Resend cc + bms-settings + UI). Build ✓.
- **Depends on:** Slice 1 (PR #10) + Slice 1c (PR #11).
- **Stack:** `feat/bms-overhaul-2-invoice-tab` → base `feat/bms-overhaul-1c-card-grid-redesign` (PR #11).
- **Requires approval:** No — directly approved by Nathan after slice 1c verification.

### 3 — Payment tab in-context (Payment recording)
- **Status:** `awaiting_review`
- **Goal:** Wire the Payment tab inside the inline-expanded card. Lazy fetch on tab activation; four states (pre-invoiced empty with push-to-invoice CTA, status=invoiced auto-shown record-payment form, populated history with outstanding balance + "Record additional", voided). Auto-flip invoice → "paid" when sum closes the balance, with toast confirmation.
- **Closes:** original slice 3 success criteria. The Invoice marked-paid cascade was already in the existing `recordPayment` action; slice 3 wraps it for the tab + adds the audit row.
- **Files:** `src/app/(dashboard)/brokerage/deal-submissions/components/payment-tab.tsx` (new), `src/app/(dashboard)/brokerage/deal-submissions/actions.ts` (`recordPaymentForInvoice`), `src/app/(dashboard)/brokerage/deal-submissions/components/detail-tabs.tsx` (flip), `src/app/(dashboard)/brokerage/deal-submissions/submissions-dashboard.tsx` (wire).
- **Server action added:**
  - `recordPaymentForInvoice(invoiceId, input, options?: { overrideAsOrg? })` — wraps existing `/brokerage/payments` `recordPayment` (validation, balance math, auto-flip-to-paid, deal-submission cascade, transaction sync all live there). Wrapper adds `record_payment` permission check, voided-invoice guard, and an invoice audit row tagged `"payment_recorded"` or `"payment_recorded_paid_in_full"` so the audit trail distinguishes balance-closing payments. Override-threaded.
- **UX answers:**
  - **Q1 (auto-flip):** `recordPayment` already promotes invoice → "paid" + cascades deal submission when sum hits `agentPayout` (with 0.5% rounding tolerance). Surfaced via `paidInFull` flag → toast "✓ Marked invoice as Paid".
  - **Q2 (partial UX):** Outstanding balance shown in the populated-state balance summary, not in the form. Color flips emerald (zero) ↔ rose (positive). Form field defaults to current balance.
  - **Pre-invoiced empty state:** reuses the Invoice tab's "Push this submission to an invoice" CTA so users don't bounce between tabs.
- **Success criteria:**
  - Payment tab opens lazy: no fetch until clicked.
  - status < invoiced → empty state with push-to-invoice CTA.
  - status === invoiced → record-payment form auto-shown (Amount default = balance, Method, Date default today, Reference, Notes).
  - status === paid → balance summary + payment history list + "Record additional payment" affordance.
  - status === void → terminal "Voided — no payment activity expected".
  - Submitting a payment that closes the balance fires "✓ Marked invoice as Paid" toast and refreshes the dashboard.
- **Gates:** lint baseline 4530 unchanged on changed files (verified 0 errors); typecheck no regression below 113 errors (held); 71 / 66 tests (+5 new contracts: wrapper-not-rewrite, balance-aware audit kind, dashboard wiring, four states, no tabs disabled). Build ✓.
- **Depends on:** Slice 2 (PR #12).
- **Stack:** `feat/bms-overhaul-3-payment-tab` → base `feat/bms-overhaul-2-invoice-tab` (PR #12).
- **Requires approval:** No — directly approved by Nathan after slice 2/2a verification.

### 1b — Default landing per role
- **Status:** `awaiting_review`
- **Goal:** Role-aware default landing — replace the hardcoded `/market-intel` fallback so each role lands on a sensible default.
- **Closes bug:** B-018
- **Approved role-to-landing map:**
  - `super_admin` → `/dashboard` (interim — see slice 3.Z below)
  - `owner` / `admin` / `manager` → `/brokerage/dashboard`
  - `agent` → `/brokerage/my-deals`
  - null / orphan / unknown → `/market-intel` (safe fallback)
- **Approved placement:** logic lives in `src/app/page.tsx` (server component, runs once per session). Middleware NOT extended with Prisma — kept edge-safe. Single change in `lib/supabase/middleware.ts`: the auth-page bounce fallback flips from `/market-intel` → `/` so the bounce hits the role-aware redirect in `page.tsx` and the role-to-landing map lives in exactly one place.
- **Deep-link handling:** unchanged — `/login?redirect=/path` still wins. Role-based landing only fires when entering via root `/`.
- **Auth-flow impact:** none. Pending-approval redirect, auto-provision, and `?as_org=` cross-tenant override paths all unchanged.
- **Smoke contracts (+4):** `landingForRole` table for super_admin / owner+admin+manager / agent / fallback; source-level guard that `page.tsx` threads role through the helper + redirects unauth → `/login`; source-level guard that middleware does NOT import Prisma or `landingForRole` (edge-safe contract); pinned the unauth `/` → `/login` redirect.
- **Files:** `src/app/page.tsx`, `src/lib/supabase/middleware.ts` (one-line fallback change), `tests/smoke/role-landing.test.ts` (new file).
- **Stack:** `feat/bms-overhaul-1b-default-landing` → base `feat/bms-overhaul-1.5-sidebar-badge` (PR #14).
- **Requires approval:** approved 2026-04-29 (middleware diff scope was constrained to a single line; both decisions and edge cases approved in chat before code).

### 1b2 — Auth-flow file class fix (slice 1b follow-up)
- **Status:** `awaiting_review`
- **Goal:** Three additional auth-flow entry points hardcoded `/market-intel` as the post-auth landing and bypassed the role-aware redirect from slice 1b. Verification surfaced the login form's `router.push` after fresh sign-in still landing on `/market-intel`. Same bug class lived in two more places. Each fix is a single-line flip from `"/market-intel"` → `"/"` so the bounce hits the role-aware redirect in `app/page.tsx`.
- **Closes:** slice 1b verification gap. Bug class, not a single-instance bug — guarded with a class-level scan contract so future code can use `/market-intel` as a destination elsewhere (it's a legitimate page) but auth-flow files can never re-introduce it as a landing.
- **Files:**
  - `src/app/(auth)/login/page.tsx` (line 37 — login form success router.push fallback).
  - `src/app/(auth)/pending-approval/page.tsx` (line 25 — "I've been approved, check again" button).
  - `src/app/auth/callback/route.ts` (line 6 — magic-link / OAuth callback fallback when `?next=` is missing; the `?next=` deep-link path is preserved).
- **Smoke contract added to `tests/smoke/role-landing.test.ts`:** scans the three auth-flow files for any string literal `"/market-intel"` (single OR double quoted). Guards the *class*, not just one instance.
- **Gates:** lint 4530 (held — verified at full-project level after a pre-existing `react-hooks/set-state-in-effect` warning on `login/page.tsx:30` from commit `84cf82bb` surfaced under file-scoped lint); typecheck 113 (held); 82 / 79 tests (+3 — one per auth-flow file in the scan); build clean.
- **Stack:** committed onto `feat/bms-overhaul-1b-default-landing` (PR #15) — 1b's spec was always "role-based landing, all entry points"; this completes it. No separate PR.
- **Requires approval:** approved 2026-04-29 (option (b) from chat: fix all 3 + class-level scan).

### 4 — Manager dashboard rebuild
- **Status:** `awaiting_review`
- **Goal:** Replace the 11-KPI grid with the approved wireframe — 4 KPIs with vs-prior delta, primary CTA strip, today's tasks panel (TransactionTask source), top-3 leaderboard, active transactions list. Each panel manages its own loading/error/retry state. Greeting uses the real logged-in user's name even under `?as_org=`. Slice 5 (drop screening KPIs) rolled in.
- **Closes bug:** addresses U-006 (KPI overload), U-007 (duplicated finance panel removed), U-009 (period selector now shows explicit date range), U-010 (screening KPIs removed — slice 5 closure), U-011 (primary CTA added).
- **Approved decisions:** 4 KPIs = House Revenue / Agent Payouts / Pending Invoices / Closed Deals (each with vs-prior delta); TransactionTask source for the tasks panel; org-wide data scope for both manager and owner; CTA copy when n=0 = "All caught up. View pipeline →" linking to `/brokerage/transactions`; period selector keeps month/quarter/year toggle + adds explicit date-range subtitle; new test file `tests/smoke/dashboard-rebuild.test.ts`; slice 5 rolled in.
- **Implementation additions (per chat approval):** (A) per-panel loading/error/retry — `PanelShell` shared shell + each panel owns its own status state; (B) `getDashboardHeader` returns `ctx.userName` from `getCurrentOrgContext` so the greeting stays personal to the actual user even when an override is active.
- **Server actions added:**
  - `getKpiComparison(period, opts)` — returns `{ current, previous }` snapshots of the 4 KPIs so each card renders a delta without two client fetches.
  - `getTodaysTasksForManager(opts)` — TransactionTask rows due ≤ end-of-today, not completed, scoped to org. Capped at 5.
  - `getDashboardHeader(opts)` — first-name + override flags for the greeting.
- **Server action removed:** `getScreeningDashboardStats` deleted from `dashboard/actions.ts` (slice 5 closure — only consumer was the dashboard page).
- **Files:**
  - `src/app/(dashboard)/brokerage/dashboard/page.tsx` (rewrite — 785 lines → ~120 lines).
  - `src/app/(dashboard)/brokerage/dashboard/actions.ts` (rewrite — replaces screening action with the 3 new ones).
  - `src/app/(dashboard)/brokerage/dashboard/loading.tsx` (replaced — matches the new shape).
  - `src/app/(dashboard)/brokerage/dashboard/components/` (new): `panel-shell.tsx`, `kpi-strip.tsx`, `primary-cta-strip.tsx`, `tasks-panel.tsx`, `top-performers-panel.tsx`, `active-transactions-panel.tsx`.
  - `tests/smoke/dashboard-rebuild.test.ts` (new — 5 contracts beyond the 4 originally proposed).
- **Smoke contracts (+5):** (a) PrimaryCtaStrip imports slice 1.5's `getSubmittedCount`; page wires the strip in. (b) Page does NOT import `getScreeningDashboardStats`; action is gone from `dashboard/actions.ts`. (c) No `<StatCard>` instances; no "Financial Overview" heading; `<KpiStrip>` mounts exactly once. (d) Page wires all four required panels + uses `getDashboardHeader` + `periodSubtitle()`. Plus: each new server action is exported with `overrideAsOrg` threading; each panel component owns its own status state machine + retry tick.
- **Gates:** typecheck 113 (held); lint 4530 (held — 0 errors on changed files); 88 / 79 tests (+9: 5 in this slice's smoke file plus auto-loaded existing-file contracts); build clean.
- **Stack:** `feat/bms-overhaul-4-dashboard-rebuild` → base `feat/bms-overhaul-1b-default-landing` (PR #15).
- **Requires approval:** approved 2026-04-29 (full discovery + wireframe + 7 decisions in chat before code, plus 2 implementation additions).

### 5 — Hide screening KPIs from BMS dashboard
- **Status:** `deleted` (rolled into slice 4 — see PR #16 description for U-010 closure).
- **Note:** Preserved as an audit-trail marker. The screening KPI strip and supporting `getScreeningDashboardStats` action were removed as part of the slice 4 dashboard rewrite. The action's only consumer was the BMS dashboard page; slice 4 deleted both. The standalone `lib/screening/integration.getScreeningBmsStats` function (which the deleted dashboard action wrapped) is still in place and remains usable from `/screening` if/when that surface needs it.

**[PHASE 1 APPROVAL GATE — STOP HERE]**

---

## Phase 2 — Agent + Client Onboarding (Week 3)

### 7a — Agent picker on Onboarding form
- **Status:** `awaiting_review` (PR #19, 2026-04-30)
- **Goal:** Form has agent dropdown. Defaults to current user; users with `view_agents` (admin/broker/manager) can pick.
- **Closes bug:** B-024
- **Roster scope:** include BrokerAgent rows with `status IN ('active', 'pending', 'invited')`. Exclude `suspended` and `terminated`. Rationale: brokerage admins need to file onboardings on behalf of newly-hired agents BEFORE that agent has finished their first login (otherwise we re-create the friction we're trying to remove).
- **Files:** `src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx`, `src/app/(dashboard)/brokerage/client-onboarding/actions.ts`, `src/lib/onboarding-types.ts`, `tests/smoke/onboarding-agent-picker.test.ts` (new).
- **Success criteria:** Picker only shows agents in current tenant. Onboarding assigned to picked agent. Plain `agent` role sees read-only "Agent: {Self Name}" label, no `<select>` in DOM. Cross-org `agentId` is rejected server-side via re-fetch with `where: { id, orgId: ctx.orgId }`. PDF prefill, audit log (`logAgentAction` with `targetAgentId`), and `OnboardingDocument.agentId` all use the resolved agent (not `ctx.agentId`).
- **Depends on:** Phase 1.
- **Requires approval:** No.

### 7a-fixup — Re-attribute existing pre-picker onboarding records
- **Status:** `pending`
- **Priority:** low (Phase 2 polish)
- **Type:** Manual SQL update (no code change). Run after 7a ships and the new picker is in active use.
- **Goal:** For the 9 onboarding records that predate the agent picker (all currently attributed to "Nathan Tondow" because no picker existed), re-attribute each to the BrokerAgent that the deal was actually for. Decision per-record is Nathan's — most are voided/expired/test or family-of-Nathan and may be left as-is; only the 2 Gulino-client records may need re-attribution if those onboardings should belong to a Gulino-org agent.
- **Records (captured 2026-04-30 from prod):**
  | onboarding_id | client | status | created |
  |---|---|---|---|
  | `f2109513-98bb-4ef1-8b4a-8cdd63ff7f4a` | Kristin Gulino | voided | 2026-03-30 |
  | `d9341885-a543-491b-9cb5-1705342daa60` | Nathan Tondow (self) | voided | 2026-03-30 |
  | `8fe135bb-c727-4def-96a4-9806cad3711b` | Nathan Test | voided | 2026-03-30 |
  | `6c8dab01-4e87-40c7-87cf-16582ed3bfa8` | Nathan Test | expired | 2026-03-31 |
  | `0fc2da04-a99e-4206-8ff6-94df3a11926c` | Rachel Tondow | completed | 2026-03-31 |
  | `fb5532d9-96bc-42ca-a413-2e26506352b2` | John Gulino | completed | 2026-03-31 |
  | `e412faf5-7a90-44f4-991e-03fef7a72854` | Kristin Gulino | completed | 2026-03-31 |
  | `dde681de-550d-4b67-959a-dd1eeb7638ef` | Linda Tondow | completed | 2026-04-01 |
  | `2e335658-96ac-4fad-964b-caa5f57856b3` | Jon Klomp | completed | 2026-04-05 |
- **Note:** All 9 records live in `org_id = 5ecba9ba-...` ("Nathan Tondow's Organization"), NOT in "Gulino Group" — they were created before the 2026-04-27 org split. Re-attribution may need to also move records cross-org if the intent is to associate them with Gulino agents. Confirm with Nathan before any UPDATE.
- **Success criteria:** Each of the 9 records is either (a) confirmed to remain attributed to Nathan, or (b) re-attributed to the correct BrokerAgent (and possibly correct org).
- **Depends on:** 7a (picker live + 24h soak so the new code path is the canonical one before historical fix).

### 17 — Onboarding form UX cleanup
- **Status:** `awaiting_review` (PR #20)
- **Goal:** Fix placeholder-as-prefill (B-025), currency formatting on blur (B-026), retry affordance on transient submit failure (B-023), conditional Personal Note based on delivery method (B-029).
- **Closes bug:** B-023, B-025, B-026, B-029
- **Dropped from initial scope:** B-028 (Send Invite loading state). Verified during slice 14 review that the existing `disabled={submitting}` + spinner already flips BEFORE the await — fix was already in place from a prior slice. Documented in the PR for traceability.
- **Files:** `new/page.tsx` (+90 lines for state, helper, retry button, conditional render); `tests/smoke/onboarding-form-ux.test.ts` (new, 9 source-level contracts).
- **Success criteria:**
  - Italic + lighter-weight placeholders visually distinct from filled values (B-025).
  - Fee + Monthly Rent inputs format as `4,500` on blur, revert to bare digits on focus (B-026).
  - Thrown errors from `createOnboarding` show "Try again" inline button; action-returned errors do NOT (B-023).
  - Personal Note section hides when delivery is SMS-only or link-only; submit payload omits `notes` for those channels even if state holds typed text (B-029).
- **Verification gates:**
  - `npm run test`: 105/105 pass (was 96; 9 new for slice 17).
  - `npm run build`: exit 0.
  - `npx tsc --noEmit` filtered: 288 (vs main baseline 292; -4 from inference narrowing). Slice 17 tracked files contribute zero TS errors.
  - `npx eslint <changed files>`: exit 0.
- **Depends on:** 14, 7a (both merged).
- **Requires approval:** No.

### 18 — Onboarding empty state + list reliability
- **Status:** `awaiting_review` (PR #21)
- **Goal:** Filter-aware empty state on `/client-onboarding` (Payments-style differentiation between slate-zero and filter-narrowed empty). Lock in B-019 closure with regression guards on the LIST page's override threading.
- **Closes bug:** U-071
- **B-019 verified out of scope:** Already closed by slice 0c2 (commit `772c897` threaded `?as_org` through 12 BMS client pages including `/client-onboarding`). Reading current main: `useSearchParams` → `overrideOpts` → memoized → passed to `getOnboardings` (both initial + slice-14 retry) AND all four mutation handlers (resend/void/delete/archive). The "9 records on first load, 0 on reload" symptom from the 2026-04-28 audit was the pre-0c2 state. Slice 18 adds source-level smoke contracts to prevent silent regression — the existing `override-scoping.test.ts` covers ACTION layer + DETAIL pages but not LIST pages.
- **Files:** `src/app/(dashboard)/brokerage/client-onboarding/page.tsx` (~30 lines: split empty-state branch into filter-narrowed + slate-zero); `tests/smoke/onboarding-list-empty-state.test.ts` (new, 8 source-level contracts).
- **Success criteria:**
  - Empty state on a status tab with 0 records reads "No [status] onboardings yet. Try the All tab to see everything." (no CTA — records exist on other tabs).
  - Empty state on All tab with 0 records reads "No client onboardings yet. Invite your first client to get started." + "New Client Onboarding" CTA (slate-zero state).
  - 5 regression guards on the LIST page's override threading lock in slice 0c2's invariants.
- **Verification gates:**
  - `npm run test`: 113/113 pass (was 105; +8 new for slice 18).
  - `npm run build`: exit 0.
  - `npx tsc --noEmit` clean tree: 292 (matches baseline; slice 18 tracked files contribute zero new TS errors).
  - `npx eslint <changed files>`: zero new errors (3 pre-existing warnings on unused imports `ExternalLink`, `Clock`).
- **Depends on:** 0c2 (already merged).
- **Requires approval:** No.

### 13 — Profile-completion banner for agents
- **Status:** `awaiting_review` (PR #22)
- **Goal:** Server-rendered banner on `/brokerage/my-deals` and client-side banner on `/settings/profile` that surfaces missing profile fields (Full Name, Phone, License Number) tied to concrete downstream artifacts (signed onboarding documents, SMS delivery, NYS compliance).
- **Closes bug:** B-017
- **Field set decision:** fullName, phone, licenseNumber. Email skipped — set at signup, effectively always present. Title and brokerage skipped — nice-to-haves that would pollute the banner with low-signal noise.
- **No-dismiss-button decision:** banner naturally disappears when fields are populated (next render computes empty `missingFields`). Avoids "user clicks X, banner stays gone forever" UX trap.
- **Files:**
  - `src/components/profile-completion-banner.tsx` (new): stateless component + `computeMissingProfileFields` helper.
  - `src/app/(dashboard)/brokerage/my-deals/page.tsx`: add `getProfile()` to a `Promise.all` with the existing submissions fetch, compute missing fields, pass to view.
  - `src/app/(dashboard)/brokerage/my-deals/my-deals-view.tsx`: accept `profileMissingFields` prop, render banner with link to /settings/profile.
  - `src/app/(dashboard)/settings/profile/page.tsx`: render banner inline (gated on `!loading` to avoid flicker), no link (form below is the action).
  - `tests/smoke/profile-completion-banner.test.ts` (new): 16 contracts (mix of pure-helper unit tests + source-level callsite assertions).
- **Success criteria:**
  - Agent with incomplete profile sees amber banner at top of /my-deals listing missing fields, with "Update profile" CTA → /settings/profile.
  - Same agent sees banner at top of /settings/profile listing missing fields (no CTA — form is the action).
  - Banner stops rendering when all three fields are populated (next request / next render).
  - Super_admin viewing via `?as_org=` sees their OWN profile state (not the override target's), because `getCurrentOrgContext` swaps orgId not userId.
- **Verification gates:**
  - `npm run test`: 113 → 129 (+16 new for slice 13).
  - `npm run build`: exit 0.
  - `npx tsc --noEmit` clean tree: ≤ 293 (current main anchor).
  - `npx eslint <changed files>`: zero new errors.
- **Depends on:** none blocking.
- **Requires approval:** No.

### 6 — Default landing for agent (regression-guard contract)
- **Status:** `awaiting_review` (PR #23)
- **Verification finding:** 1b + 1b2 fully cover the original scope (agent → `/brokerage/my-deals`, role-to-path map locked in, 3 auth-flow files class-scanned for hardcoded `/market-intel`). Slice 6's original "add agent-specific landing logic if 1b didn't cover it" goal is **closed by 1b**.
- **What this slice ships instead:** one source-level regression contract in `tests/smoke/role-landing.test.ts` asserting `canAccessPage("agent", landingForRole("agent")) === true`. Locks in B-018's exact regression class — catches three classes of silent breakage:
  1. agent loses `view_own_submissions` in `BMS_PERMISSIONS`,
  2. `/brokerage/my-deals` permission requirement changes in `PAGE_PERMISSION_MAP`,
  3. `landingForRole("agent")` changes to a route agent can't access.
- **Scoped to "agent" only:** the codebase has two distinct role vocabularies (`User.role`: super_admin/admin/agent; `BrokerageRoleType`: brokerage_admin/broker/manager/agent) bridged by `getCurrentBrokerageRole` via an async Prisma join. Only `"agent"` is identical across both vocabularies, so it's the only role testable in pure source-level form. Other roles tracked in `slice 6-ext` below.
- **Closes bug:** B-018 (regression guard).
- **Files:** `tests/smoke/role-landing.test.ts` (+1 describe block, +1 it; +1 import for `canAccessPage`).
- **No production code changes.**
- **Verification gates:**
  - `npm run test`: 130 (was 129; +1 new).
  - `npm run build`: exit 0.
  - `npx tsc --noEmit` clean tree: ≤ 292 (no production code changes).
  - `npx eslint <changed files>`: zero new errors.
- **Depends on:** 1b + 1b2 (both merged on main).
- **Requires approval:** No.

### 6-ext — Cross-role landing permission contract
- **Status:** `awaiting_review` ([PR #25](https://github.com/ntondow/vettdre/pull/25))
- **Priority:** low (Phase 3 polish)
- **Goal:** Extend slice 6's permission-compat contract from "agent" (role-string identity) to owner / admin / manager via the *pure* User.role → BrokerageRole translation path.
- **Why:** slice 6 was scoped to agent only because that's the one role string that appears in both `User.role` and `BrokerageRoleType` vocabularies. Other roles flow through a translation layer that can drift silently — bms-auth had two near-identical inline `ROLE_MAP` literals (in `getCurrentBrokerageRole` + `getCurrentAgentInfo`) duplicating the manager/admin/owner mapping.
- **Approach (Option A):** Extract the pure subset of the translation into `src/lib/bms-role-translation.ts` (`translateUserRoleToBrokerageRole`), which depends only on the User.role string. Refactor *both* `getCurrentBrokerageRole` and `getCurrentAgentInfo` to call the helper instead of inlining ROLE_MAP. Add 8 new contracts to `tests/smoke/role-landing.test.ts`: 5 pure-helper unit tests + 3 cross-role permission contracts (owner/admin/manager). No behavior change vs the previous inline mappings — verified per-input.
- **Scope notes:** super_admin and agent are documented exclusions in the cross-role loop. super_admin lands on `/dashboard` which is outside `PAGE_PERMISSION_MAP` (parked by 3.Z). agent is already covered by slice 6 via role-string identity. The "first user in org is owner" fallback and the BrokerAgent.brokerageRole DB read remain DB-dependent and out of pure-helper scope (manual end-to-end coverage per phase).
- **Closes:** the gap left by slice 6's source-only scope. Catches drift on the User → BrokerageRole map that slice 6 can't see.
- **Files:** new `src/lib/bms-role-translation.ts`, modified `src/lib/bms-auth.ts`, modified `tests/smoke/role-landing.test.ts`.
- **Depends on:** none blocking (1b + 6 on main).

**[PHASE 2 APPROVAL GATE — STOP HERE]**

---

## Phase 3 — IA + polish (Week 4)

### 7 — Single sidebar per role
- **Status:** `awaiting_review` ([PR #27](https://github.com/ntondow/vettdre/pull/27))
- **Goal:** Brokerage admins → brokerage-shaped sidebar (Wireframe B: WORK / LISTINGS & DEALS / INTEL — three sections, ten items, down from nine sections / thirteen items). Agents → agent-focused sidebar (Wireframe A: WORK / RESEARCH — two sections, nine items, down from three sections / ten items).
- **Closes bug:** addresses U-001 through U-005, U-012.
- **Approach:** Replace `AGENT_NAV_SECTIONS` and `ADMIN_NAV_SECTIONS` constants in `sidebar.tsx` per the approved wireframes. Mirror in `mobile-nav.tsx` (5-tab bottom bar holds highest-frequency surfaces; More sheet holds the rest). Flip the role-branch polarity from `role === "agent" ? AGENT : ADMIN` (privilege-by-default) to `isAdminRole(role) ? ADMIN : AGENT` with a positive-match `ADMIN_USER_ROLES = {admin, owner, super_admin}` set — unknown roles fall through to agent. Add submitted-count badge to the global "Brokerage" item (override-aware via `useSearchParams`'s `?as_org=`). Delete `ComingSoonItem` function + all `comingSoon` code paths (Property Management section gone). Remove AUTOMATION top-level entry (still accessible via `/settings/automations`) and the duplicate "Client Onboarding" global entry (single source of truth in the brokerage sub-nav).
- **Files:** `src/components/layout/sidebar.tsx`, `src/components/layout/mobile-nav.tsx`, `tests/smoke/sidebar-shape.test.ts` (NEW — 20 source-level contracts: Wireframe A item set, Wireframe B item set, removed surfaces, polarity flip, submitted-count badge wiring, mobile-desktop parity bidirectional).
- **Bundled chore:** CLAUDE.md lint baseline 4520 → 4484 (re-anchored per surface-baseline-mismatches rule; 36-error improvement accumulated across Phase 2 + Phase 3 slices since the 4520 anchor was set).
- **Out of scope:** BrokerageRoleType-based segmentation (manager-aware global sidebar). Today's User.role taxonomy doesn't include "manager" — adding manager-specific global surfaces would require `getCurrentBrokerageRole` from the global layout, a bigger lift. Brokerage sub-nav at `/brokerage/*` still segments by BrokerageRoleType independently. Slice 8 owns the sub-nav flatten; slice 9 owns the emoji → lucide migration.
- **Success criteria:** 20/20 smoke contracts pass. Manual test as each role: agent on /dashboard sees Wireframe A; admin sees Wireframe B; super_admin under override sees admin sidebar with the override-scoped submitted badge. No "Acquisitions / Closing / Portfolio / Property Management" jargon anywhere.
- **Depends on:** Phase 2 (done).

### 8 — Brokerage nav flatten
- **Status:** `awaiting_review` (PR #TBD)
- **Goal:** From 7 sections × 17 items (Variant 3 in slice 7's inventory) to 3 sections × 11 items + Admin link (Wireframe C). One above the ≤10 target — ship at 11; both My Deals and Leaderboard have clear weekly use cases for John/Kristin.
- **Closes bug:** U-013, U-014, U-016.
- **Approach:** Replace `ADMIN_NAV` in `brokerage/layout.tsx` per Wireframe C (Operations / Agents & Listings / Reports / Admin). Drop entire stale "Admin > Setup" section from `AGENT_NAV` (agents shouldn't see brokerage_admin onboarding wizard; pre-slice-8 layout returned AGENT_NAV unfiltered). Relocate four sub-nav items: Setup, Commission Plans, Compliance → Settings page "Brokerage Configuration" cards (lighter approach — no inline tab refactor). Bulk Invoices was already accessible via existing "Bulk Generate" button in `/brokerage/invoices` header (no change needed). Add `<ComplianceAlert />` to `/brokerage/dashboard` — calls existing `getExpiringItems(60)` helper (no Prisma schema change), surfaces "X compliance documents expiring in next 60 days. View →" amber callout, override-aware via `?as_org=`. Without this Dashboard alert, hiding Compliance from sub-nav is unsafe — NYS license expiration is a real-world legal risk.
- **Files:** `src/app/(dashboard)/brokerage/layout.tsx` (constants flatten + agent cleanup), `src/app/(dashboard)/brokerage/dashboard/page.tsx` (import + render alert), `src/app/(dashboard)/brokerage/dashboard/components/compliance-alert.tsx` (NEW), `src/app/(dashboard)/brokerage/settings/page.tsx` (Brokerage Configuration card section), `tests/smoke/brokerage-subnav-shape.test.ts` (NEW — 21 contracts: Wireframe C item set, removed surfaces, agent variant cleanup, sub-nav badge wiring, mobile pill ordering parity, Compliance Dashboard alert wiring + auto-hide guard + override propagation, Settings cards reachability).
- **Success criteria:** 21/21 smoke contracts pass. Manager nav matches consulting proposal in audit doc.
- **Depends on:** 7 (merged).

### 3.Z — Admin Home for super_admin (slice 1b follow-up)
- **Status:** `pending`
- **Goal:** Replace `/dashboard` as the super_admin landing with a real admin home — tenant switcher, cross-tenant activity feed, team management entry, audit log shortcut.
- **Why:** super_admin currently inherits the investor-shaped `/dashboard` (per slice 1b) which has nothing administratively useful for Vettdre staff. Slice 1b parks them there as an interim; this slice replaces it with a purpose-built surface.
- **Files:** new `src/app/(dashboard)/admin/page.tsx` + supporting components. Update `landingForRole("super_admin")` in `src/app/page.tsx` to point to the new path.
- **Smoke contract delta:** the slice 1b smoke test pinning `super_admin → /dashboard` will need updating in this slice — flag in the PR description so the reviewer knows the change is intentional, not a regression.
- **Depends on:** Phase 1 + 3 work first; this is platform polish.
- **Requires approval:** YES — new admin surface, wireframe gated.

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

### 3.Y — Structural fix for override-context propagation
- **Status:** `pending`
- **Goal:** Replace per-callsite override threading with a single OrgContext wrapper that every Prisma query must use. Make it impossible to forget threading without a typecheck error.
- **Why:** 0c covered ~50 action exports + threading; 0c2 found another ~22 server actions + 12 read-side pages that 0c missed. Pattern will keep recurring as new code is added. Architectural fix collapses this into one place.
- **Approach (agent proposes details when slice begins):**
  - QueryClient wrapper takes OrgContext at construction.
  - Lint rule or TypeScript constraint blocking direct `prisma.*` calls from `app/(dashboard)/brokerage/*` — must go through OrgContext.
  - Migration plan: progressive — new code uses the wrapper; existing code migrates slice-by-slice as it gets touched.
- **Files:** `lib/prisma.ts`, `lib/team-context.ts`, all of `src/app/(dashboard)/brokerage/**`.
- **Success criteria:** `tests/smoke/override-scoping.test.ts` becomes obsolete because the type system enforces it.
- **Depends on:** Phase 1, 2 (don't refactor while major surfaces are in flux).
- **Requires approval:** YES — architectural change.

### 3.X — Parent branch cleanup
- **Status:** `done` (PR-A merged 2026-04-30; PR-D merged 2026-04-30).
- **Goal (closed):** Merge `feat/super-admin-cross-tenant-view` + 15 BMS overhaul slice branches to main.
- **Plan revision (2026-04-30):** Original A → B → C plan replaced after P0 — deploying from main rolled back all 15 slice branches because they weren't on main yet. Final plan was PR-A + PR-D (single integration PR collapsing planned PR-B + PR-C + the 15 slice branches via rebase of `cf6e1cf` onto main). c05e952 R6 cleanup handled inline in PR-D's rebase.
- **PRs:** PR-A #17 (merged); PR-D (merged 2026-04-30, restoring all 15 BMS overhaul slices to main).
- **Outcome:** main reflects production reality; deploy from main = current prod; no orphan slice branches. Status flipped to `done` in Phase 3 slice 1 (PR #24).

### 13-cross-cut — Manager-side profile-completeness warning at filing time
- **Status:** `awaiting_review` ([PR #26](https://github.com/ntondow/vettdre/pull/26))
- **Priority:** low (Phase 3 polish)
- **Goal:** When a manager uses the slice 7a agent picker on `/brokerage/client-onboarding/new` to file an onboarding for an agent whose profile is incomplete (Full Name, Phone, or License Number missing), surface a warning at the moment of filing — not just on the agent's own /my-deals banner.
- **Why:** Without this, John/Kristin file docs for Anthony, the prefill renders with `(Agent's name)` placeholders, and nobody catches it until the client signs a document with the placeholder visible. Slice 13 surfaces the gap to the agent themselves but doesn't warn the manager filing on their behalf.
- **Approach:** Extend `getAgentRosterForOnboarding` to JOIN BrokerAgent → User and select `user.fullName / user.phone / user.licenseNumber` (no Prisma schema change — fields already on User). Render an inline amber callout in `new/page.tsx` below the picker's helper text via a new `ProfileCompletenessWarning` component that reuses slice 13's `computeMissingProfileFields` helper. Three early-return guards (no selected agent, BrokerAgent.userId === null, or empty missingFields) keep it from firing during initial paint or for pending/invited hires. Copy branches on `isSelf`: second-person ("your profile is missing … Complete your profile") when manager picks themselves, third-person ("{firstName}'s profile … Ask {firstName}") otherwise. Both link to /settings/profile (same target as slice 13's banner).
- **Files:** `src/app/(dashboard)/brokerage/client-onboarding/actions.ts` (extend select), `src/app/(dashboard)/brokerage/client-onboarding/new/page.tsx` (warning component + render below picker), `tests/smoke/profile-completion-banner.test.ts` (extend with 8 cross-cut contracts).
- **Success criteria:** when the picker selects an agent with missing fields, an inline note appears below the picker listing the gaps; submission still proceeds (warning not block).
- **Bundled:** CLAUDE.md typecheck baseline 292 → 286 (re-anchored per surface-baseline-mismatches rule).
- **Depends on:** 7a + 13 (both merged).

### 3.W — Clean Finder-duplicate files from main
- **Status:** `awaiting_review` (PR #24 — bundled with 3.X status flip as Phase 3 slice 1).
- **Priority:** low (Phase 3 polish).
- **Goal:** Remove four ` 2.tsx` Finder-duplicate files that landed on main via commit `53d7751 chore: in-flight work — terminal realtime, screening IDV, market-intel updates, building-intel docs`. Surfaced during PR-D rebase (predate PR-D).
- **Files removed (4):**
  - `src/components/layout/sidebar 2.tsx` (375 lines, primary `sidebar.tsx` is 384 lines).
  - `src/app/screen/[token]/client 2.tsx` (376 lines, primary `client.tsx` is 498 lines).
  - `src/app/(dashboard)/screening/[id]/page 2.tsx` (799 lines, primary `page.tsx` is 1021 lines).
  - `src/app/(dashboard)/brokerage/client-onboarding/page 2.tsx` (294 lines, primary `page.tsx` is 499 lines).
- **Verification before removal:** zero imports of any dupe anywhere in `src/` or `tests/`. All dupes are shorter than their primaries (stale snapshots, not divergent forks). Origin commit `53d7751` matches the slice spec exactly.
- **Baseline impact:** typecheck and lint anchors held at 292 / 4520 after removal — the 4 dupes were error-clean themselves, so anchor counts didn't move. CLAUDE.md anchors unchanged.
- **Outcome:** `git ls-files | grep -E ' [0-9]+\.(tsx?|js)$'` returns zero results.

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
