# Foundation Audit — Phase 0 walk #4: Dashboard + Contacts + Pipeline (batched)

**Date:** 2026-05-05
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`540d05d3-b429-4e37-a9bc-c4c2a493e010` (createClient hot-fix verified live; main HEAD `50da368` after PR #63 merge)
**Mode:** vertical-slice (functional + UX + a11y + RBAC + perf), READ-ONLY discovery
**Scope:** `/dashboard` (greeting + Market Data card + RE Intelligence feed), `/contacts` (table + filters), `/contacts/[id]` (Jon Klomp dossier), `/pipeline` (which silently redirects to `/brokerage/transactions`).
**Why batched:** all three are content-light surfaces (Dashboard = stats + RSS feed, Contacts = list + dossier, Pipeline = was-supposed-to-be a kanban). Walking together exposes cross-area consistency findings that single-area walks would miss.

---

## Summary

27 findings: 1 surprise P1 (routing/architecture surfaced by walk), 4 P2, ~15 P3, 7 positive observations.

**The standout finding** (P-1): `/pipeline` silently redirects to `/brokerage/transactions`. The CRM Deal pipeline described in CLAUDE.md (stages New Lead → Contacted → Showing → Offer → Under Contract → Closed) is no longer accessible at its documented URL. Sidebar has no "Pipeline" entry. Either the CRM Pipeline was deprecated in favor of BMS Transactions (architectural shift, doc drift) or the redirect is a bug. Both Deal and Transaction models still exist in the schema per CLAUDE.md, so the answer matters: did Deal Pipeline become orphaned, or did it move?

Other notable themes: (a) **timezone/greeting drift** on Dashboard ("Good evening, Nathan, Monday May 4" rendered at user's morning May 5); (b) **duplicate-contact detection missing** on Contacts (mirrors yesterday's U-7 duplicate-deal-address finding from Underwriting); (c) **theme split is consistent** across this batch (Dashboard dark like Terminal, Contacts + Transactions light like CRM workspace) — confirms the rule from U-23.

No P0 crashes. RBAC walk needed separately for `agent` role (this walk used super_admin).

---

## Method

Vertical-slice Phase 0 walk, batched across 3 areas:
1. Cold-load `/dashboard`, capture initial render and post-hydration state separately
2. Catalog Market Data card (8 metrics, sparklines, sources)
3. Inspect Real Estate Intelligence feed (categories, source attribution, content quality)
4. Navigate to `/contacts`, audit table + filter chips
5. Click into one contact (Jon Klomp), audit 5-tab dossier
6. Navigate to `/pipeline` to walk CRM kanban — observed redirect to `/brokerage/transactions`
7. Audit Transactions tracker (stats cards + filters + table)
8. Cross-compare findings across areas (theme, stat-card patterns, empty states)

No code, no fixes.

---

## Findings

### P1 — surfaced surprises

**P-1 — `/pipeline` route silently redirects to `/brokerage/transactions`; CRM Deal Pipeline appears orphaned**
*Severity: P1 (could de-rate to P3 if confirmed-intentional doc-drift) · Category: Routing / Architecture*

Repro: navigate to `https://app.vettdre.com/pipeline`. URL bar updates to `/brokerage/transactions`. Page renders BMS Transactions tracker (Type=Rental/Sale, Stages from BMS lifecycle, Invoice Sent badge), NOT the CRM kanban (New Lead → Contacted → Showing → Offer → Under Contract → Closed) described in `CLAUDE.md` Feature Details section "Pipeline (Working)."

Sidebar inventory: Dashboard, Brokerage, Messages, Calendar, Contacts, Properties, Underwrite, Leasing, Market Intel, Terminal, Screening. **No "Pipeline" entry.** Was removed from sidebar nav.

Per `prisma/schema.prisma` summary in CLAUDE.md: both `Deal` and `Transaction` models still exist. They're semantically different — Deal is CRM-side (linked to Contact, Pipeline, Stage); Transaction is BMS-side (commission tracking, parties JSON, agent payout). The redirect collapses these into one URL.

Three possible truths (Phase 1 discovery to determine):
- (a) **Architectural shift**: CRM Deal Pipeline was deprecated, all deal flow moved to BMS Transactions. CLAUDE.md docs are stale. **Required fix:** update CLAUDE.md, possibly remove `Deal` model + related routes if truly dead, or document the migration path.
- (b) **Soft deprecation**: CRM Deal Pipeline still exists at a different URL, sidebar just dropped the link. **Required fix:** find the new URL, restore sidebar link, update docs.
- (c) **Routing bug**: `/pipeline` was supposed to land on the CRM kanban; redirect is unintentional. **Required fix:** remove the redirect, restore the route handler.

This is a P1 because it affects user navigation expectations (anyone who bookmarked `/pipeline` or follows CLAUDE.md docs will land somewhere unexpected). Could be downgraded to P3 if the answer is (a) and the only fix is documentation.

---

### P2 — medium impact, batch with related work or schedule for Phase 1+

**D-1 — Dashboard greeting + date show wrong timezone / cached state**
*Severity: P2 · Category: UX / Data freshness*

Repro: open `/dashboard` at user's morning local time (US Eastern, ~AM). Page initially renders skeleton with "Tuesday, May 5, 2026" timestamp. After hydration, page renders "**Good evening, Nathan**" with "Monday, May 4, 2026."

Possible causes: (a) greeting + date computed off server time in a different timezone; (b) aggressive Cloudflare-tier cache serving yesterday's render; (c) the `created` timestamp the dashboard uses for date isn't `Date.now()`, it's the last-cached snapshot. The skeleton-state correctly reflected current time (Tuesday May 5) — so client knows the right date — but the loaded state regressed.

Erodes trust ("the app doesn't even know what time it is"). Plausibly cosmetic if the underlying data is fresh, but worth instrumenting.

---

**C-1 / C-2 — Duplicate contact detection missing at create time**
*Severity: P2 · Category: Data quality (mirrors U-7 from Underwriting walk)*

Repro: `/contacts` table shows 8 rows including:
- `John Gulino` × 2: same email `john@gulinogroupny.com`, different sources (`client_onboarding` no phone vs `email` with phone `+1 (347) 652-8488`), different scores (Pending vs 30)
- `Nathan Tondow` × 2: same email `ntondow@gmail.com`, different sources (`client_onboarding` no phone vs `cold_call` with phone `7329021678`), different scores (Pending vs 50)

Same root issue as Underwriting U-7 (duplicate `5 BLEECKER STREET` deal cards): system creates entities without dedup check. For Contacts the dedup key is email; for Deals it's address.

Defer-friendly options: (a) modal at create time "We found 1 contact with this email — link or create new?"; (b) bg job that nightly merges duplicates; (c) leave duplicates and add a "merge" UI at the row level. (a) is the cleanest.

---

**C-5 — Inconsistent phone number formatting**
*Severity: P2 · Category: Data quality / UX*

Repro: `/contacts` table — phone column displays:
- `+1 (347) 652-8488` (formatted)
- `7329021678` (bare 10-digit)
- `5163610458` (bare 10-digit)
- `—` (em-dash for missing)

Different rows, different formats. Either format-on-write was added later and historical rows weren't migrated, or formatting is per-source (e.g., Twilio-imported vs manually-typed). Either way, a single normalize-on-display function would fix all rows without DB migration.

---

**P-2 thru P-6 collapsed — Transactions tracker patterns are consistent and positive**
*(Not separate P2 findings; aggregated positive observation)*

Stats cards (Open / Closed This Month / Avg Days to Close / By Type) format identical to Underwriting Pipeline from yesterday's walk — good cross-area consistency. Stage filter dropdown + Rental/Sale chip filters + search input. Lifecycle column uses progress dots `●●○○○` for stage indication. Light theme matches CRM/workspace pattern.

Minor: "By Type **1R / 0S**" stat label is terse; needs tooltip clarifying R=Rental, S=Sale.

---

### P3 — low impact, defer or batch

**D-2 — Skeleton-shimmer correctly indicates Dashboard load state.** Contrast with U-13 from Underwriting Modeler which showed real-but-wrong red metrics during load. Dashboard is the right pattern. Positive (P3 only because it informs U-13's fix direction).

**D-3 — Dashboard uses Terminal-style dark theme.** Consistent with U-23 finding: research/feed surfaces are dark, workspace/CRM surfaces are light. Confirmed pattern across this walk. Positive.

**D-4 — Market Data card is genuinely impressive.** 8 metrics (30Y Fixed 6.30%, 15Y Fixed 5.64%, 10Y Treasury 4.39%, FED Funds 3.64%, CPI 330.3, NYC Median $862K, NYC DOM 50, NYC Supply 3.6 mo, NYC HPI 685.8) each with sparkline trend, delta indicator (▲/▼ + value), source attribution (FRED, REDFIN, FHFA). Excellent data density.

**D-5 — RE Intelligence feed has good editorial filter.** Categories (All / NYC / Markets / Rates / CRE) + source badges (CITYLIMITS / COMM OBS / HOUSINGWIRE) + relative timestamps. RSS aggregation done well.

**D-6 — Spanish-language article in feed in English UI.** "PODCAST: ¿Cómo USCIS se convirtió en una agencia de control migratorio?" from CityLimits. Either intentional (NYC has Spanish-speaking property professionals — useful inclusion) or a data quality artifact (RSS feed lacks language filtering). Worth a product call: explicit Spanish locale toggle vs filter out non-English.

**C-3 — Zero-count filter chips render in same style as active filter.** `Landlords 0 / Buyers 0 / Sellers 0 / Renters 8` — visually identical to "All 8" except for count. Disabling/de-emphasizing zero-count chips could reduce visual noise.

**C-4 — Score column shows "Pending" + numeric scores asymmetrically.** Indicates async lead-scoring runs lazily. Good UX signal that work is in progress. Positive.

**C-7 — `+ Add Contact` button visible to super_admin.** Need separate RBAC walk for `agent` role to confirm permission gating.

**C-8 — Empty-state for filter tabs untested.** Clicking "Landlords 0" should show empty state. Defer-friendly.

**C-10 — Activity/Deals/Tasks/Emails zero-state shown twice.** In contact dossier: tab counts (e.g., "Tasks (0)") AND Stats sidebar ("Total activities: 0, Last contacted: —"). Could collapse one.

**C-11 — Contact dossier "Not scored" placeholder vs Contacts list "Pending."** Different empty-state language for the same data shape. Worth normalizing across surfaces.

**C-12 — Tag autocomplete / shared taxonomy not visible.** Contact has tags `onboarded × tenant-rep-signed ×` but no visible way to see all tags in use across contacts. Probably exists in Settings; defer to next walk.

**C-13 — Action bar (Email / Log Call / Log Text / Add Task) is workflow-driven and clear.** Positive.

**C-14 — "Verify & Enrich" CTA description is informative.** "Click Verify & Enrich to analyze this contact with PDL and NYC property records." Good copy.

**C-15 — Stats sidebar shows Created/Agent/Source clearly.** Good ownership model. Positive.

**P-2 — Transactions stats cards match Underwriting Pipeline pattern.** Cross-area consistency. Positive.

**P-4 — "By Type 1R / 0S" label is terse.** Needs tooltip clarifying R/S meaning.

**P-5 — Lifecycle progress dots `●●○○○`.** Visual stage indicator. Positive.

**P-6 — Theme-split rule confirmed across this walk.** Workspace/CRM = light (Contacts, Transactions), Research/Feed = dark (Dashboard, Terminal, Underwriting research tools). Pattern is intentional and consistent.

---

### Positive observations (cross-cutting)

1. **Theme-split rule holds** across Phase 0 walks 2-4 (Terminal, Underwriting, this walk). Workspace/CRM = light, Research/Feed = dark. This is intentional design, not a bug.
2. **Stats card pattern is consistent** between Underwriting Pipeline (Active Deals / Screened This Mo / Avg Cap Rate / Deal Volume) and BMS Transactions (Open / Closed This Month / Avg Days to Close / By Type). Same component or shared design pattern. Positive.
3. **Empty-state copy is uniformly helpful** across surfaces (Comps "Search for a property...", Cap Rates "Analyze market cap rates...", Contacts dossier "No deals yet" / "No showings yet" / "No activity yet"). Positive — design system rigor.
4. **Skeleton-shimmer-during-load** is correctly used on Dashboard (D-2). Underwriting Modeler should adopt this pattern (U-13).
5. **Source attribution** is consistent across data-display surfaces — Market Data card cites FRED/REDFIN/FHFA, RE Intelligence feed cites CITYLIMITS/COMM OBS/HOUSINGWIRE, Contact stats cite Source (Client Onboarding / cold_call / email). Positive — provenance discipline.
6. **AI-data transparency** continues — `+` markers on AI-generated assumptions in Underwriting (yesterday), "Verify & Enrich" CTA in Contacts dossier (today). Consistent affordance for "this involves AI."
7. **Action bars are workflow-driven** — Contacts dossier (Email / Log Call / Log Text / Add Task), Underwriting deal cards (Generate LOI / Investment Summary / Export PDF / Save Deal). Pattern: surface the next-best-action above the data. Good.

---

## Phase 5 stub drafts (canonical format, ready for SLICES-speed.md)

```markdown
### `phase-0-followup-pipeline-route-redirect-investigation` (P1)
- **Status:** Phase 5 backlog
- **Background:** `/pipeline` URL silently redirects to `/brokerage/transactions`. CLAUDE.md docs (Feature Details section "Pipeline (Working)") describe a CRM Deal Pipeline kanban with stages New Lead → Contacted → Showing → Offer → Under Contract → Closed. The current `/brokerage/transactions` page renders BMS Transactions (Rental/Sale type, Invoice Sent stage, BMS lifecycle dots) — semantically a different feature backed by the `Transaction` model, not the `Deal` model. Sidebar nav has no "Pipeline" entry. Both `Deal` and `Transaction` Prisma models still exist per CLAUDE.md schema reference.
- **Discovery instructions:** Search the codebase for the `/pipeline` route handler — `src/app/(dashboard)/pipeline/page.tsx` and `next.config.ts` `rewrites`/`redirects`. Determine which of three scenarios is true: (a) CRM Deal Pipeline was deprecated and the redirect is intentional (architectural shift, fix is doc update); (b) CRM Deal Pipeline still exists at a different URL and the redirect was added later (fix is restore sidebar link + update docs); (c) the redirect is a bug (fix is remove the redirect). Check `git log` on `next.config.ts` and the pipeline directory for the commit that introduced the redirect. Check whether `Deal` model rows exist in prod DB (proxy for "is anyone using the CRM pipeline").
- **Hypotheses to confirm/refute:** (a) intentional architectural deprecation tied to BMS launch (most likely given Gulino BMS rollout 2026-04-28 and the focus shift); (b) routing config conflict (low probability — would have been caught earlier); (c) feature still exists somewhere undocumented.
- **Why deferred:** Phase 0 finding — Phase 1 work. Resolution depends on product call about whether CRM Pipeline should be restored as a distinct feature or fully merged into BMS Transactions. If (a), the fix is docs + possibly removing dead `Deal` model code. If (b)/(c), the fix is route + nav restoration.
- **Required input before slicing:** Product decision: keep CRM Pipeline as separate feature, or finalize migration to BMS Transactions? Expected default: finalize migration (CLAUDE.md docs need full audit and rewrite for the Pipeline section).
- **Affected surfaces:** `src/app/(dashboard)/pipeline/page.tsx` (and entire directory), `next.config.ts` (redirect/rewrite config), `CLAUDE.md` (Feature Details "Pipeline" section), `src/components/layout/sidebar.tsx` (if restoring nav link), `prisma/schema.prisma` (if `Deal` model is dead, eventual cleanup).
- **Out of scope:** Migrating any existing `Deal` model rows to `Transaction` (data migration is separate Phase 1+ work if needed).
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #4 (`docs/handoff/speed-2026-q2-dashboard-contacts-pipeline-audit-2026-05-05.md`, finding P-1).
```

(Other findings — D-1 dashboard greeting drift, C-1/C-2 duplicate contacts, C-5 phone formatting — are P2 and tracked in this audit doc for batch follow-up. Not filing as individual stubs to avoid backlog clutter; they'll batch with adjacent area work.)

---

## Out of scope (deferred)

- **Mobile responsive** — Chrome MCP can't reflow viewport reliably (yesterday's lesson)
- **RBAC walks for `agent` role** — needs role-switch capability, separate Phase 0.5 cross-cut
- **Calendar area** — not in this batch, will walk separately
- **Brokerage subnav deep-dive** — Submissions, Invoices, Payments, Agents, My Deals, Listings, Properties, Reports, Leaderboard, Templates not walked (BMS-side, separate roadmap area)
- **Settings area** — separate roadmap area
- **Tag taxonomy management** — likely lives in Settings, walk later
- **Empty-state checks for zero-count filter chips** — defer-friendly; spot-check in Phase 0.5

---

## Methodology v2.3 retro candidates surfaced this walk

1. **Batched walks expose redirect/architecture surprises that single-area walks miss.** Walking `/dashboard → /contacts → /pipeline` in sequence made the `/pipeline → /brokerage/transactions` redirect immediately obvious because the sidebar was visible the whole time. A single-area walk of just "Pipeline" might have started at `/brokerage/transactions` directly and never noticed the redirect. Methodology v2.3 should explicitly recommend batched walks for content-light surfaces, not just for efficiency but for cross-cut findings.

2. **Doc-vs-runtime drift is its own finding category.** P-1 is fundamentally a discrepancy between CLAUDE.md (says "/pipeline is the CRM Deal kanban") and runtime reality (it's BMS Transactions). A "doc audit" cross-cut should run after Phase 0 walks complete — every CLAUDE.md feature claim verified against actual runtime behavior.

3. **Cross-area consistency findings are valuable and easy to spot in batched walks.** This walk surfaced 7 positive cross-area observations (theme-split rule, stat-card pattern, empty-state copy discipline, skeleton-shimmer pattern, source attribution, AI-data transparency, action-bar pattern). Single-area walks would miss these because the comparison frame isn't there. Methodology v2.3 should add a "cross-area consistency" mode that's specifically about diffing patterns across areas.
