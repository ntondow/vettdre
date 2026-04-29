# BMS Data-Source Map (slice 0a discovery)

**Created:** 2026-04-28
**Slice:** Phase 0 / 0a — Single deal data model
**Audit reference:** `docs/handoff/bms-audit-2026-04-28.md` (B-002, B-004, B-007, B-008)
**Status:** discovery draft — awaiting Nathan's canonical-store decision before code changes.

---

## TL;DR for the decision

The audit's framing of "three parallel deal stores" is partially wrong, and the
fix is smaller than it implied:

1. **The CRM `Deal` model is not used by any BMS surface.** Zero `prisma.deal.*`
   calls under `src/app/(dashboard)/brokerage/`. CRM `Deal` lives in the lead
   pipeline (`messages`, `market-intel`, `settings/export`) and is a separate
   concern.

2. **Inside BMS, `DealSubmission` and `Transaction` are sequential, not parallel.**
   They link via `Transaction.dealSubmissionId` (`@unique`). Intended flow:

       DealSubmission (inbound)
         → Invoice (billing instrument; created by pushToInvoice)
           → Payment (records receipt; updates Invoice.status="paid")
         → Transaction (close-stage workflow; created at close-time)

3. **Gulino's "$0 paid out" on the Dashboard is not a parallel-store bug. It's
   an incomplete insert chain.** The 18 historical imports set
   `DealSubmission.status="paid"` directly, never creating Invoice or Payment
   rows. Dashboard "house revenue" reads from `Invoice.status="paid"`, finds
   nothing → $0. Submissions surface reads from `DealSubmission.status="paid"`,
   finds 18. Same data layer, different filters; both correct given what's on
   disk; one of them is empty because the chain was skipped at import time.

The decision Nathan needs to make is which of these three the canonical
"how many deals?" KPI counts:

- **(a) DealSubmission count** — counts inbound, regardless of close. Matches
  the Submissions page. **What the code does today.**
- **(b) Transaction count where stage="closed"** — counts only post-close.
  Matches the "did money close?" mental model.
- **(c) Union (DealSubmission with no linked Transaction) ∪ (closed Transaction)**
  — what the leaderboard already does for lifetime stats. Avoids
  double-counting when both rows exist.

**My recommendation: (a) for the inbound funnel KPI ("X deals submitted this
month") + a separate Transaction-based KPI ("X deals closed this month").**
Two distinct metrics, two distinct stores, no aliasing. This is honest about
the workflow (one row in each store has its own meaning) and matches the
leaderboard's lifetime pattern.

The actual P0 fixes for the audit's financial-mismatch bugs are:

- **Slice 0b** — backfill the missing Invoice + Payment rows for Gulino's
  historical imports so the dashboard's revenue KPIs populate.
- **Slice 0c** — thread `overrideAsOrg` through every BMS action's local
  `getCurrentOrg()` helper (most don't yet — see "Override gap" below).

The "single source of truth" framing in the audit was the right instinct but
the wrong target. The truth is already single (one row per concept across
linked tables); we just need the chain to be complete.

---

## Per-surface data-source map

Every BMS list/dashboard page and the Prisma models it touches. Pulled from
`grep "prisma\\.<model>\\." src/app/(dashboard)/brokerage/**/actions.ts`.

| Surface | Reads | Writes | Notes |
|---|---|---|---|
| `dashboard/page.tsx` (via `reports/actions.getDashboardSummary`) | `DealSubmission` (count, sum, groupBy), `Invoice` (sum where status=paid for revenue, sum where draft/sent for pending payouts) | none | Combines inbound funnel (Submissions) with cash flow (Invoices). The "$0 revenue" symptom for Gulino comes from the Invoice-side query returning empty because no Invoice rows exist for the historical imports. |
| `deal-submissions/page.tsx` | `DealSubmission` (list/detail/stats), joins `BrokerAgent` | `DealSubmission` (create on /new; update on approve, reject, fee-edit), `Invoice` (read in pushToInvoice), `Transaction` (existence-guard read in pushToInvoice) | `pushToInvoice` is where the chain is supposed to advance. |
| `transactions/page.tsx` | `Transaction` (list, count, by-stage), reads `DealSubmission` for create-from-submission, reads `Invoice` for syncTransactionFromInvoice | `Transaction` (create, update, advanceStage), `Invoice` (create from transaction in some flows) | The `[id]/page.tsx` detail panel handles the close-stage workflow (tasks, milestones, agent splits). |
| `invoices/page.tsx` | `Invoice` (list, count, groupBy by status), joins `Payment` | `Invoice` (create, update, delete, bulk), `DealSubmission` (status update on linked sub) | `createInvoiceFromSubmission` is the supported entry; bulk Excel upload bypasses DealSubmission. |
| `payments/page.tsx` | `Payment` (list, sum, count), `Invoice` (read for cap calc) | `Payment` (create, delete), `Invoice` (status update on full-pay), `DealSubmission` (status update on full-pay if linked) | Source of cash-flow truth. |
| `reports/revenue/*` | `DealSubmission`, `Invoice` (for P&L, agent earnings, 1099, monthly trend) | none (read-only) | Already accepts `overrideAsOrg`. |
| `reports/actions.ts` (powers Dashboard + several reports) | `DealSubmission`, `Invoice` | none | **Local `getCurrentOrg()` does NOT thread overrideAsOrg.** This is one of the override gaps slice 0c sweeps. |
| `my-deals/page.tsx` (agent self-service) | `DealSubmission` (list, count, agg, groupBy), `Invoice` (sum), `Transaction` (count, list), `User` (profile) | none | Agent-side mirror of Submissions + Earnings. |
| `leaderboard/page.tsx` | `BrokerAgent` (roster), `DealSubmission` (count, agg), `Transaction` (count where closed, agg) | `AgentGoal` (set), `BrokerAgent.badges` (refresh) | **Already implements the union pattern** (Transaction.closed ∪ DealSubmission-without-Transaction) for lifetime stats. |
| `earnings/page.tsx` | `DealSubmission` (agg, groupBy), `User` (profile) | none | |
| `agents/page.tsx` | `BrokerAgent` (CRUD list), `DealSubmission` + `Invoice` aggs for stats | `BrokerAgent` (create, update, deactivate, etc.) | Compliance subview reads `BrokerAgent`. |
| `client-onboarding/page.tsx` | `ClientOnboarding`, `OnboardingDocument`, `BrokerAgent`, `User` | `ClientOnboarding` create/update | Distinct concern from deals; included for completeness. |
| `compliance/page.tsx` | `BrokerAgent` (license / insurance fields) | none | |
| `commission-plans/page.tsx` | `BrokerAgent` (assigned plan) | `BrokerAgent` (assign plan) | |
| `listings/*` | `BrokerAgent` (assignment), `Transaction` (close link) | `Transaction` (create when listing leases) | Listings convert to Transactions at lease-up; same chain. |

### Key insight: which model carries which fact

| Concept | Authoritative store | Why |
|---|---|---|
| **Inbound funnel ("a deal arrived")** | `DealSubmission` | Created when agent submits via `/submit-deal/[token]` (public) or `/brokerage/my-deals/submit` (auth). Status starts at `submitted`. |
| **Approved-but-not-billed** | `DealSubmission.status` ∈ {approved} | One state on the submission row. |
| **Billing instrument ("invoice exists")** | `Invoice` | Created by `createInvoiceFromSubmission`. 1:1 with DealSubmission via `Invoice.dealSubmissionId`. |
| **Cash received** | `Payment` | `Payment.invoiceId` links to Invoice. Sum of payments = Invoice.amountPaid. |
| **Close-stage workflow (milestones, tasks)** | `Transaction` | Created near close (currently at `pushToInvoice` — need to confirm the wiring is complete; see open question below). 1:1 with DealSubmission via `Transaction.dealSubmissionId`. |
| **Agent commission earned (gross)** | `DealSubmission.totalCommission` | Snapshotted at submission time. |
| **Agent payout (net of fee)** | `DealSubmission.agentPayout` AND `Invoice.agentPayout` | Mirrored — currently identical at create-time, but the Invoice version is what `Payment` records pay against. PATCH C made `DealSubmission.agentPayout` net-of-fee. |
| **Processing fee snapshot** | `DealSubmission.processingFee*` mirrored to `Invoice.processingFee*` | Locked at invoice creation. |
| **CRM lead pipeline ("a contact in stage X")** | `Deal` | Separate model. CRM only. Not used by BMS surfaces. |

### The audit's reported financial inconsistency, explained

For Gulino, super_admin override:

| KPI | Surface | Query | Why it shows what it shows |
|---|---|---|---|
| `1 approved deal / $54,000 volume` | Dashboard | `DealSubmission` count + sum where status ∈ {approved, invoiced, paid} AND `createdAt` in the rolling 30-day window | One test deal created post-Phase-D smoke testing matches the window. The 18 Gulino historical imports have `createdAt = 2026-04-27` (the import date — bug B-005), which IS in the rolling window… so they should match. **Hypothesis worth verifying empirically:** the override may not be reaching this query because `getCurrentOrg()` in `reports/actions.ts` doesn't accept `overrideAsOrg` and the referer-fallback path may be missing the param at this code path. |
| `18 paid totaling $36,179` | Submissions | `DealSubmission` list where status=paid (and orgId routed through full override threading) | The 18 are real, in Gulino's tenant, with status=paid. |
| `0 invoices` | Invoices | `Invoice` count by orgId | The Gulino bulk import never created Invoice rows. **B-007.** |
| `$0 paid out` | Payments | `Payment` count + sum by orgId | Same — no Payment rows. **B-008.** |
| `1 invoice — $1,485 pending` (Payments page banner) | Payments | `Invoice` where status ∈ {draft, sent} | One Invoice exists from a non-Gulino tenant leaking through — likely the same override-scoping gap that affects the dashboard. Alternatively: a single live Gulino invoice was hand-created post-import. Worth confirming during 0c implementation. |
| `Dashboard HOUSE REVENUE $0 / AGENT PAYOUTS $0` | Dashboard | `Invoice` sum where status=paid AND `paidDate` in window | No Invoice rows means $0. **Same root cause as B-007 / B-008 — the import never created the chain past DealSubmission.** |

**Bottom line:** The dashboard isn't "reading from a different data source." It's reading from `DealSubmission` for the funnel KPIs and `Invoice` for the revenue KPIs — exactly what the schema intends. The mismatch is that for Gulino's historical data, only the DealSubmission rows exist; the Invoice + Payment rows were never created. Slice 0b is the fix.

---

## Override gap (sets up slice 0c)

Local `getCurrentOrg()` helpers in BMS action files:

| File | Threads `overrideAsOrg` to `getCurrentOrgContext`? |
|---|---|
| `deal-submissions/actions.ts` | ✅ (Phase D + threading sweep) |
| `invoices/actions.ts` | ✅ (override-threading sweep, commit `b264a45`) |
| `payments/actions.ts` | ✅ (same sweep) |
| `transactions/actions.ts` | ✅ (same sweep) |
| `agents/actions.ts` | ✅ (same sweep) |
| `leaderboard/actions.ts` | ✅ (same sweep) |
| `reports/revenue/actions.ts` | ✅ (Phase D) |
| **`reports/actions.ts`** | ❌ — `getCurrentOrg()` calls `getCurrentOrgContext()` with no args; powers `getDashboardSummary`, `getPnlReport`, `getAgentProductionReport`, `get1099PrepData`, `getDealPipelineReport`, `exportReportCSV` |
| **`my-deals/actions.ts`** | unknown — needs slice 0c sweep |
| **`earnings/actions.ts`** | unknown — needs slice 0c sweep |
| **`client-onboarding/actions.ts`** | unknown — needs slice 0c sweep (B-022 root cause) |
| **`listings/actions.ts`** | unknown — needs slice 0c sweep |
| **`compliance/actions.ts`** | unknown — needs slice 0c sweep |
| **`commission-plans/actions.ts`** | unknown — needs slice 0c sweep (B-013 root cause) |
| **`reports/actions.ts` (top-level)** | confirmed not threaded |
| `settings/admin/team-actions.ts` | partial (PATCH A) |

The pattern is universal: each BMS action file has a private `async function
getCurrentOrg()` that wraps `getCurrentOrgContext()` and forgets to forward
options. Slice 0c's mechanical work is to add `options: { overrideAsOrg?: string } = {}`
to each helper and thread it down. Test fixture: super_admin login + URL with
`?as_org=Gulino` → every BMS surface should query Gulino.

This explains B-009 (agents page shows Nathan's 3 agents instead of Gulino's
6), B-010 (Settings → Role Assignment same), B-013 (Commission Plans empty),
B-022 (Onboarding form scoped to home org), and B-031 (Brokerage Settings
shows wrong org name).

---

## Open question — Transaction creation timing

Earlier in this branch (before the overhaul), I added a transaction-existence
guard to `pushToInvoice` (commit `b45b5e4`) because P2002 fires on
`transactions.deal_submission_id` when a Transaction already exists. That
suggests **a Transaction row is being created somewhere when an Invoice is
created** (otherwise the guard would be unreachable). I need to confirm:

- Does `pushToInvoice` itself create a Transaction, or is there a separate
  trigger I haven't read yet?
- For the 18 Gulino imports that don't have Invoice rows, do they have
  Transaction rows?
- If yes → the chain is half-complete; backfill needs to populate Invoice +
  Payment but not Transaction.
- If no → backfill needs to populate all three.

I'll resolve this empirically with a read-only query in slice 0b before
writing backfill SQL. Calling it out here so the canonical-store discussion
is fully informed.

---

## Recommended canonical-store decision

**Reaffirm the existing schema. Don't merge stores.** The chain is correct;
the data is incomplete.

- Inbound funnel: `DealSubmission` (status enum)
- Billing: `Invoice` (status enum, 1:1 to DealSubmission)
- Cash: `Payment` (many-to-one to Invoice)
- Close workflow: `Transaction` (stage enum, 1:1 to DealSubmission)
- CRM pipeline: `Deal` — separate concern, leave alone

**Dashboard KPI definitions** (proposed for slice 4):

- "Submitted this month" = `DealSubmission.count` where `createdAt` in window
- "Approved this month" = `DealSubmission.count` where `status` ∈ {approved, invoiced, paid} AND `approvedAt` in window (currently uses `createdAt`, which is a separate small bug worth fixing in slice 4)
- "Closed this month" = `Transaction.count` where `stage="closed"` AND `closedAt` in window
- "Agent payouts paid this month" = `Invoice` sum of `agentPayout` where `status="paid"` AND `paidDate` in window
- "Pending agent payouts" = `Invoice` sum of `agentPayout` where `status` ∈ {draft, sent}
- "House revenue this month" = `Invoice` sum of `housePayout` where `status="paid"` AND `paidDate` in window

These are all already what `getDashboardSummary` does today — no schema or
code changes needed for the canonical-store decision itself. The remaining
work is:

- Slice 0b — backfill missing Invoice/Payment rows for Gulino so the existing
  KPIs have data to report.
- Slice 0c — thread `overrideAsOrg` through `reports/actions.ts` and the
  remaining files in the table above so super_admin override is honest.
- Slice 4 (Phase 1) — re-render the Dashboard with the KPIs above (no
  data-layer changes; just UI).

---

## Files involved (for slice 0a follow-on; no code changes in 0a itself)

- `prisma/schema.prisma` (read-only — schema reaffirmed, no changes)
- `src/lib/bms-types.ts` (no changes — labels + enums already match)
- `src/app/(dashboard)/brokerage/dashboard/page.tsx` (no changes in 0a;
  Phase 1 slice 4 owns dashboard rebuild)
- `src/app/(dashboard)/brokerage/reports/actions.ts` (slice 0c will thread
  override; no changes in 0a)
- `scripts/backfill-gulino-invoices.ts` (new in slice 0b)
