# Foundation Audit — Phase 0 walk #5: Calendar + Properties (batched)

**Date:** 2026-05-05 (morning, after PR #64 merge)
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`540d05d3` (createClient hot-fix); main HEAD `691da6e` after PR #64 merge
**Mode:** vertical-slice (functional + UX + a11y + RBAC + perf), READ-ONLY discovery
**Scope:** `/calendar` (Month view + Day grid + New Event modal), `/properties` (unified hub index + click-through). Out of scope: Calendar Week/Day/Agenda views, Showing Slot Creator, Google Calendar 2-way sync flow.

---

## Summary

22 findings: 2 P1 (both deeply actionable, both with same architectural-shift theme as walk #4's P-1), 1 P2, 12 P3, 7 positive observations.

**The two P1s are the headline:**
- **Cal-1 (F-5.1)** — Calendar disagrees with itself about what day "today" is. Main Month grid highlights Monday May 4 as today; mini sidebar calendar highlights Tuesday May 5 (correct). New Event modal date field defaults to "5/04/2026" — so every event created via "+New Event" is back-dated by one day unless the user manually changes it. Likely UTC-vs-local-time math bug in the main grid + modal that the mini cal avoids.
- **Prop-11 (F-5.2)** — Clicking a property card on `/properties` (the unified hub described in CLAUDE.md) navigates to `/brokerage/listings` (BMS Listings index) instead of opening a property detail view. **This is the second instance of the CRM-route → BMS-route redirect pattern** seen in walk #4's P-1 (`/pipeline → /brokerage/transactions`). It's now a meta-finding worth its own stub.

No P0 crashes. RBAC walk still pending for `agent` role.

---

## Method

Vertical-slice Phase 0 walk, batched:
1. Cold-load `/calendar`, observe Month grid + mini cal + view tabs + Sync/Showings buttons
2. Compare main grid "today" highlight against mini cal "today" highlight
3. Open New Event modal, inspect date field default
4. Cold-load `/properties`, observe stats row + filter chips + property cards
5. Click a property card, observe destination

No code, no fixes.

---

## Findings

### P1 — high impact, candidate for Phase 1

**Cal-1 — Calendar timezone drift: main grid + New Event modal off by one day vs mini cal**
*Severity: P1 · Category: Functional / Timezone math*

Repro at user's morning Eastern time (~AM):
- Mini sidebar calendar: highlights **Tuesday May 5** (correct — actual current date)
- Main Month grid: highlights **Monday May 4** (wrong — yesterday)
- Click "+ New Event" → modal opens → date field defaults to "5/04/2026" (wrong — yesterday)

This means every event created via the default flow is back-dated by one day unless the user manually changes the date. For an agent doing back-to-back showings ("New Event" → fill title → save), every event lands on yesterday's calendar. Time-of-day fields (start/end times) appear to use local time correctly (visible in modal as "10:30 PM" → likely local-time formatted), so the bug is specific to the date computation.

Suspected root cause: somewhere in calendar-view.tsx or the New Event modal, `new Date()` is being toString'd in UTC (or compared against UTC midnight) while the mini cal uses local-time methods (`.getDate()`, `.getDay()`). At ~AM Eastern, UTC date is still "yesterday's" calendar day because Eastern is UTC-5 / UTC-4, so UTC midnight passed already but local midnight hasn't. The mini cal renders correctly because it uses the JS Date object's local-time methods; the main grid + modal renders wrong because something in the chain converts to UTC.

Defer-friendly options for Phase 1: (a) audit all `new Date()` and `.toISOString()` calls in `calendar-view.tsx` and the New Event modal — replace with `date-fns` `format(new Date(), 'yyyy-MM-dd')` or explicit timezone-aware formatting; (b) add a smoke test that mocks system time to early-AM Eastern and asserts main grid "today" matches mini cal "today"; (c) consider repo-wide timezone audit since this is a pattern likely to repeat (yesterday's Dashboard D-1 was the same root cause but lower stakes — only a greeting).

---

**Prop-11 — Property card click redirects from `/properties` (CRM hub) to `/brokerage/listings` (BMS index) instead of opening a detail view**
*Severity: P1 · Category: Routing / Architecture (cross-walk pattern)*

Repro: navigate to `/properties` (unified hub per CLAUDE.md). 5 property cards visible. Click "532 Neptune Ave" card. Destination URL: `/brokerage/listings`. Page renders BMS Listings inventory with subtitle "Manage your brokerage inventory" — NOT a property detail view aggregating Listings + Deals + Showings + Prospecting (which CLAUDE.md describes as the unified hub's purpose).

This is the **second instance of the CRM-route → BMS-route redirect pattern** observed during Phase 0 walks:
- Walk #4 P-1: `/pipeline` (CRM Deal kanban per docs) → `/brokerage/transactions` (BMS Transactions tracker)
- Walk #5 Prop-11: `/properties` card click (CRM unified hub per docs) → `/brokerage/listings` (BMS Listings index)

In both cases, the CRM-side surface is being silently rerouted into the BMS-side equivalent. CLAUDE.md docs describe both CRM features as "Working" but runtime navigates users elsewhere. **This is now an architectural-shift meta-finding**, not a single-area routing bug.

Three possible truths (Phase 1 discovery should answer at least once for this pattern, then apply to both routes):
- (a) **Architectural deprecation**: the CRM-side Pipeline + Properties hub were deprecated in favor of BMS Transactions + Listings, and the redirects are intentional. Fix: complete the migration (remove dead routes / models / docs) and update CLAUDE.md.
- (b) **Soft deprecation**: CRM-side surfaces still exist somewhere but the click-through paths regressed. Fix: restore correct destinations.
- (c) **Routing bug**: the redirects are accidental side effects of a recent commit. Fix: revert.

Given Gulino BMS launch (2026-04-28) and the focus on BMS-first ergonomics, (a) is most likely. But shouldn't be assumed without git-log archaeology.

Cross-references P-1 from `docs/handoff/speed-2026-q2-dashboard-contacts-pipeline-audit-2026-05-05.md` — these two findings should be triaged together as a single Phase 1 architectural-decision question.

---

### P2 — medium impact, batch with related work

**Prop-2 — "My Properties" header has poor color contrast on dark theme**
*Severity: P2 · Category: Accessibility / WCAG contrast*

Repro: navigate to `/properties`. Header text "My Properties" renders in a dark-on-dark color. Barely readable. Likely unscoped from light-theme default — when the page switched to dark theme, the title color wasn't updated. Affects a11y for any user with reduced visual acuity.

Defer-friendly fix: scope title color to the dark surface, or use a semantic color token that adapts to theme.

---

### P3 — low impact, defer or batch

**Cal-2 — Calendar toolbar is comprehensive.** +New Event, Sync, Showings, prev/next month nav, "Today" button, All-types filter, view tabs (Month/Week/Day/Agenda). Good controls. Positive.

**Cal-3 — Mini calendar widget renders correctly.** "May 2026" header, day initials Su/Mo/Tu/We/Th/Fr/Sa, fully populated date grid, today highlighted in blue (correctly!). Positive.

**Cal-4 — "UPCOMING / No upcoming events" empty state.** Helpful copy. Positive.

**Cal-5 — Calendar uses light theme.** Consistent with Workspace/CRM theme rule. Positive.

**Cal-6 — Month grid has Sunday-start week + 6 visible weeks (incl. prev/next gray-out).** Standard calendar UX. Positive.

**Cal-7 — "0 events" subhead under "May 2026".** Empty calendar shown clearly. Good empty state.

**Prop-1 — Properties uses dark theme (Terminal-style).** Per the established rule (Workspace=light, Research/Feed=dark), Properties is being treated as a Research/Feed surface. Defensible if Properties is conceptually a "discovery" surface aggregating sources, but worth product-level review — Properties is closer to "workspace" semantically.

**Prop-3 — Stats row pattern matches BMS Transactions and Underwriting Pipeline.** Total / Listings / Deals / Showings / Prospects. Good cross-area consistency.

**Prop-4 — Stat math validates.** 4 listings + 0 deals + 0 showings + 1 prospect = 5 total. Math checks. Positive.

**Prop-5 — Property cards have rich info density.** Source badge (Listing / Prospect), status badge (Available / New), address, unit, location, rent or assessed value, bed/bath count, source type (rental), days on market. Positive.

**Prop-6 — Test data pollution: "532 Neptune Ave" appears in Properties as Unit 111M, but in BMS Transactions yesterday as Unit SMOKE-TEST-001.** Either the building has multiple units (legitimate) or one is real and one is test data leakage. The "SMOKE-TEST-001" naming convention suggests deliberate test data. Worth scoping how much smoke-test data exists in prod and whether it should be marked/filtered.

**Prop-7 — Inconsistent address case.** "163 GREENPOINT AVENUE / BROOKLYN, NY 11222" in ALL CAPS while other addresses are Title Case ("532 Neptune Ave"). Address normalization missing on Prospect imports.

**Prop-8 — Card type adapts to entity type.** Prospect cards show assessed value, sf, unit count, owner; Listing cards show rent, BR/BA, days on market. Good adaptive rendering.

**Prop-9 — Owner attribution + relative timestamp on Prospect cards.** "Owner: VISTULA 1, LLC · 2mo ago". Nice provenance.

**Prop-10 — Filter chips and search input clean.** All / Listing / Deal / Showing / Prospect / Recently Added. Standard filter affordance.

---

### Positive observations (cross-cutting with prior walks)

1. **Theme-split rule continues to hold.** Walks 2-4 confirmed Workspace=light, Research/Feed=dark. This walk: Calendar=light (Workspace), Properties=dark (Research/Feed). Pattern is intentional.
2. **Stats card pattern is uniformly consistent.** Walk 3 (Underwriting Pipeline), Walk 4 (Brokerage Transactions), Walk 5 (Properties). Same component / shared design.
3. **Empty-state copy continues to be helpful** across all walks. "No upcoming events" / "Drag deals here" / "Search for a property" / "No deals yet" — consistent design discipline.
4. **Mini-cal-vs-main-grid pattern surface another timezone bug** that the Dashboard D-1 finding (yesterday) hinted at. Cross-walk, this is a real architectural problem worth a code-wide timezone audit.
5. **The CRM → BMS architectural shift is real and undocumented.** Both walk #4 P-1 and walk #5 Prop-11 surface the same redirect pattern. The product appears to be migrating from CRM-first to BMS-first nav without finishing the work. Worth a strategic call: complete the migration cleanly (remove dead routes, update docs) or roll back.

---

## Phase 5 stub drafts (canonical format, ready for SLICES-speed.md)

```markdown
### `phase-0-followup-calendar-timezone-drift` (P1)
- **Status:** Phase 5 backlog
- **Background:** Calendar Month view's main grid highlights the wrong cell as "today" — Monday May 4 instead of Tuesday May 5 (the actual current date) when accessed at user's early-morning Eastern time. Mini sidebar calendar correctly highlights May 5. New Event modal date field defaults to "5/04/2026" (yesterday), so every event created via the default flow is back-dated unless the user manually changes the date. Likely UTC-vs-local-time math bug: at ~AM Eastern, UTC date is still "yesterday's" calendar day because UTC midnight passed but local midnight hasn't. Cross-references yesterday's Dashboard D-1 finding (Greeting + date drift) — same root cause, lower stakes there.
- **Discovery instructions:** Audit `src/app/(dashboard)/calendar/calendar-view.tsx` (1900 lines per CLAUDE.md) for `new Date()` calls, `.toISOString()` conversions, and date comparisons. Specifically check the "today" computation in the Month grid render path and the New Event modal's default-date logic. Compare against the mini cal's date logic (which works correctly) — diff to identify the divergent codepath. Confirm by mocking system time to early-AM Eastern in a test and asserting main grid "today" matches mini cal "today".
- **Hypotheses to confirm/refute:** (a) `new Date()` somewhere in the calendar-view chain is being formatted via UTC methods (`.getUTCDate()` instead of `.getDate()`); (b) date comparisons use `.toISOString()` for equality, drifting at midnight UTC; (c) modal default-date is read from a server-side computation that uses UTC; (d) timezone of the org/user isn't being threaded through to the calendar render.
- **Why deferred:** Phase 0 finding (P1) — Phase 1 work. Functional bug affecting daily agent use. Fix is bounded to calendar-view.tsx + modal component but warrants careful test coverage before shipping.
- **Required input before slicing:** Confirm the bug reproduces consistently at user's morning Eastern time (it does — verified during Phase 0 walk). Decide whether to fix scope-wide (audit all `new Date()` in the codebase for similar UTC drift) or scope-local (just calendar-view.tsx). Recommend scope-local for Phase 1 + a separate scope-wide stub for the broader audit.
- **Affected surfaces:** `src/app/(dashboard)/calendar/calendar-view.tsx` (main fix surface), `src/app/(dashboard)/calendar/actions.ts` (if server-side date defaults are involved), New Event modal component (if separate file), possibly `lib/utils.ts` (if a shared date helper is involved).
- **Out of scope:** Repo-wide timezone audit (separate stub if scoped that way); Google Calendar 2-way sync timezone handling (that's a separate concern in `lib/google-calendar.ts`).
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #5 (`docs/handoff/speed-2026-q2-calendar-properties-audit-2026-05-05.md`, finding Cal-1).

### `phase-0-followup-crm-to-bms-route-architecture-decision` (P1, meta)
- **Status:** Phase 5 backlog
- **Background:** Two Phase 0 walks have surfaced the same routing pattern: CRM-prefix top-level routes silently redirect to BMS-prefix routes. (1) Walk #4 P-1: `/pipeline` (described in CLAUDE.md as the CRM Deal kanban) → `/brokerage/transactions` (BMS Transactions tracker). (2) Walk #5 Prop-11: clicking a card on `/properties` (described as the unified CRM hub) → `/brokerage/listings` (BMS Listings index) instead of a detail view. Sidebar nav has no "Pipeline" entry; "Properties" still in sidebar but its click-through bypasses the hub model. Both `Deal` and `Transaction` Prisma models still exist per CLAUDE.md schema reference. Pattern suggests an in-progress migration from CRM-first to BMS-first navigation that hasn't been finalized or documented.
- **Discovery instructions:** Run `git log` on `next.config.ts`, `middleware.ts`, `src/app/(dashboard)/pipeline/`, `src/app/(dashboard)/properties/` to find the commits that introduced the redirects. Determine intent: was this a gradual deprecation (likely tied to Gulino BMS launch 2026-04-28) or accidental? Read the commit messages and adjacent code changes. Check whether `Deal` model rows exist in prod DB (proxy for "is anyone using the CRM pipeline data"). Check whether the unified Properties hub (per CLAUDE.md "Working" claim) has any code path that aggregates Listings + Deals + Showings + Prospecting, or whether that aggregation logic has been removed.
- **Hypotheses to confirm/refute:** (a) intentional architectural deprecation tied to BMS launch — fix is complete the migration (remove dead routes, update docs); (b) accidental redirect introduced in an unrelated PR — fix is revert; (c) intentional redirect but incomplete migration — fix is finish the work.
- **Why deferred:** Phase 0 meta-finding (P1) — Phase 1 strategic decision needed before any code change. Wrong direction here costs significant rework. Worth a 30-min discussion with stakeholder before slicing.
- **Required input before slicing:** Strategic call: keep both CRM-prefix and BMS-prefix as parallel surfaces (with clear docs) vs. finalize migration to BMS-only. Probable answer given Gulino launch context: finalize migration. But needs explicit decision before code.
- **Affected surfaces:** `src/app/(dashboard)/pipeline/` (entire dir — possibly delete), `src/app/(dashboard)/properties/` (depends on decision — keep as hub or redirect), `next.config.ts` (redirects), `src/components/layout/sidebar.tsx` (nav entries), `CLAUDE.md` (Feature Details Pipeline + Properties sections), `prisma/schema.prisma` (potential cleanup of `Deal` model if dead), possibly migration of any existing Deal rows to Transaction.
- **Out of scope:** Migrating individual `Deal` rows to `Transaction` schema (separate Phase 1+ data migration if needed); UX redesign of the resulting BMS-only experience (separate UX walk after migration is finalized).
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #5 (`docs/handoff/speed-2026-q2-calendar-properties-audit-2026-05-05.md`, finding Prop-11; cross-references walk #4 P-1).
```

(Other findings — Prop-2 contrast, Prop-6 test-data pollution, Prop-7 address case, P3 cluster — are batched in this audit doc for follow-up alongside adjacent area work. Not filing as individual stubs.)

---

## Out of scope (deferred)

- Calendar Week / Day / Agenda views (only Month walked)
- Showing Slot Creator + Google Calendar 2-way sync flow
- Properties detail panel / unified hub aggregation behavior (couldn't test — click-through redirected to BMS Listings)
- Mobile responsive (Chrome MCP limitation)
- RBAC walk for `agent` role
- Tag taxonomy / Settings deep dive

---

## Methodology v2.3 retro candidates surfaced this walk

1. **Cross-walk meta-findings need their own stub format.** Prop-11 + walk #4 P-1 are the same architectural pattern surfacing in different surfaces. Filing them as separate per-area stubs loses the connection. Methodology v2.3 should add a "meta-stub" pattern: when a finding from walk N is the same root cause as a finding from walk M, file ONE meta-stub that cross-references both, rather than two area-scoped stubs that happen to share a fix.

2. **Mini-vs-main rendering disagreement is a high-signal probe.** Cal-1 surfaced because two date-rendering surfaces were on the same screen and disagreed. Walk #2 T-24 (Terminal violation counts inline-vs-right-panel) is the same probe pattern. Methodology v2.3's vertical-slice template should explicitly call out: "if two surfaces render the same data, compare them — disagreements are findings."

3. **CRM-vs-BMS route boundaries are now a known pattern.** Walks 4-5 have shown the boundary is leaky in two specific places. Future walks should explicitly check: does this CRM route silently redirect to BMS? does the click-through stay in CRM or jump to BMS? Worth adding to Phase 0 swarm prompt template as a checkpoint.
