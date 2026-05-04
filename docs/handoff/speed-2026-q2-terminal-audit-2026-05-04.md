# Foundation Audit — Phase 0 walk: Terminal

**Date:** 2026-05-04
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`69a8223e-fccd-4adb-9591-44f590061de4` (React #31 hot-fix in PR #59 verified live)
**Mode:** vertical-slice (functional + UX + a11y + RBAC + perf), READ-ONLY discovery
**Scope:** `/terminal` feed, filter sidebar, inline event expansion, right-panel BuildingProfile, search overlay, keyboard navigation. Out of scope: watchlist CRUD (no watchlists exist on this account), mobile responsive (Chrome MCP can't reflow viewport), admin health dashboard at `/settings/admin/terminal`.

---

## Summary

Phase 0 finding **F-2.1 (React #31 in BuildingProfile)** confirmed fixed on both surfaces. 24 additional findings captured across the Terminal area. Priority distribution: 3 P1, 3 P2, 8 P3, 10 positive observations.

The Terminal area is **functionally healthy** — the 3-stage ingestion + enrichment + AI-brief pipeline works, keyboard navigation is well-implemented, and graceful degradation is solid (404s on intel endpoints don't break the right panel). The biggest gaps cluster around three themes: (a) **AI brief generation lags badly on the Sales dataset** (most cards stamp "Brief unavailable"), (b) **search coverage doesn't match its empty-state promises** (claims to index owner LLC names but doesn't search ACRIS party fields), and (c) **API endpoints return 404 for sparse-data BBLs** instead of 200-with-empty-payload, which masks real coverage gaps as infrastructure errors.

None of the findings are P0 or block daily use. Phase 1 candidates are clear: T-10 (Sales brief gap), T-16 (search coverage), T-22 (404 normalization). Everything else is batch-able with related work or defer-friendly.

---

## Method

The walk followed the methodology v2.2 vertical-slice Phase 0 prompt:

1. Land cold on `/terminal` (no warm cache)
2. Catalog initial render: feed, sidebars, borough toggle, watchlist state
3. Probe filter sidebar interactions (event types, neighborhoods, search)
4. Test keyboard navigation (`j`/`k`/`Enter`/`o`/`/`/`?`/`Esc`)
5. Inline-expand event cards (Level 1 progressive disclosure)
6. Open right-panel BuildingProfile (Level 2) — both rich-data and sparse-data BBLs
7. Inspect network requests (404s, slow endpoints, response shapes)
8. Compare data consistency between inline expansion and right-panel render

No code changes were made. No fixes are proposed in this doc — that's Phase 1 work.

---

## Findings

### P1 — high impact, candidate for Phase 1

**T-10 — Sales events overwhelmingly missing AI briefs**
*Severity: P1 · Category: Functional / Content quality*

Repro: filter by Sales (default state). Visible briefs: every Sale card shows `Property sale recorded — Brief unavailable`. Compare to Violations filter: every card has a 1-2 sentence contextual brief like *"Class I (lead paint) HPD violation issued at 573 Wyona Street (Bushwick, 2 units) today. Status: First no access to RE-inspect violation."*

Evidence: 14+ Sales cards screenshotted; 0 with populated AI briefs. Memory ref: `project_terminal_realtime.md` already identified slow brief generation, but this walk shows the gap is dataset-skewed — Violations brief generation is healthy, Sales is not.

Hypotheses (for Phase 1 discovery to confirm/refute):
- ACRIS data shape (deed-only, multi-table join with Legals + Parties) doesn't fill the prompt template the same way single-table HPD data does → silent prompt failures or empty completions
- Sales dataset volume ≫ Violations volume → rate-limit hit on Sales, Violations completes
- Brief queue priority skews to Violations
- ACRIS `record_id` extractor returns mismatched IDs → AI brief stored against wrong event

**Triggers an audit doc B-finding:** the user-facing claim of the Terminal product is "Bloomberg-style AI briefs on every event." Without briefs on Sales, the product reads as half-functional even though the pipeline runs.

---

**T-16 — Search doesn't index ACRIS party names despite empty-state copy claiming it does**
*Severity: P1 · Category: Functional / Discoverability*

Repro: press `/` → type `wolfson` → result count: **0 events match "wolfson"**. But on the Sales feed, the FIRST sale card (BK 3003191141) when expanded shows parties **WOLFSON, WENDY** + **WOLFSON, RUSSELL M** as buyers. Search empty-state copy explicitly suggests *"Search by owner LLC name"* — that affordance is misleading.

Suspected coverage:
- Index seems to span: address, BBL, AI brief text (when populated)
- Index doesn't span: ACRIS Party records (parties stored in `EnrichmentPackage` JSON or related model — not lifted into the search index)

This is a **product credibility issue** — a Bloomberg-style intel terminal that can't find a known buyer/seller name from a deed it ingested 20 days ago looks broken to anyone who tries it. Worse, the empty-state suggests the feature exists.

---

**T-22 — `/api/intel/buildings/{bbl}` returns 404 for sparse-data BBLs**
*Severity: P1 · Category: API / Data fusion*

Repro: open right-panel BuildingProfile for BK 3040670038 (a BBL-only Violation event with no street address). Network requests:

```
GET /api/intel/buildings/3040670038/signals → 404
GET /api/intel/buildings/3040670038         → 404
```

Right panel renders gracefully despite both 404s — distress score 0 ("Low"), 1 data source, 28% confidence, building condition card populated from the event's own enrichment package. No user-facing error, no broken layout.

But these 404s are not errors — they represent **expected sparse data**. A BBL not yet enriched with PLUTO + Apollo + ACRIS history isn't a missing resource, it's a partial resource. Returning 404 forces the client into a fallback path that should be the **primary** path. Also pollutes Sentry / log baselines with non-error 404s, making real 404s harder to triage.

Recommended Phase 1 framing: change to **200 with empty/partial payload + explicit `coverage` indicator** in the response. Right panel renders the same UI; `coverage: "partial"` lets the front-end show a clearer "Limited data — building not in PLUTO" badge instead of inferring sparseness from missing fields.

---

### P2 — medium impact, batch with related work or schedule for Phase 1+

**T-19 — Multi-select event-type filter has ambiguous selected state**
*Severity: P2 · Category: UX*

Repro: Violations filter is selected (highlighted, count "64"). Click Sales button. Observed: feed didn't visibly change (still all Violations), but Sales button now also reads as highlighted. Multi-select intent is fine — checkbox-style selection makes sense for an event feed — but radio/checkbox affordance isn't visually distinguished. User can't tell at a glance whether clicking adds-to-selection or replaces-selection.

Defer-friendly: small visual tweak (filled vs outline, or explicit checkmark icon) addresses it.

---

**T-21 — Empty/sparse right-panel state has no explicit "limited data" messaging**
*Severity: P2 · Category: UX*

Tied to T-22. When BBL has no PLUTO/Apollo enrichment, panel renders but several sections are empty (Owner card placeholder, Investment Score `0` with empty stars). User can't distinguish "low score" from "no data." A `coverage: "partial"` server-side flag (T-22) plus a visible badge ("Limited public data") in the panel header resolves both.

---

**T-24 — Conflicting violation counts between inline expansion and right-panel BuildingProfile**
*Severity: P2 · Category: Data integrity / UX*

Same BBL (3040670038), same screen render:
- Inline card expansion: *"Open violations: 1 Class A, 1 Class C, 1 Class I across property"*
- Right-panel Building Condition card: *"HPD Violations 0 open (1 Class C)"*

Likely explanation: inline brief was AI-generated against a snapshot from an earlier enrichment pass; right-panel renders against current API data. Either is plausibly correct in isolation — the conflict is what's confusing.

Defer-friendly options: (a) source-stamp both ("As of 2026-04-15" vs "Live"), (b) reconcile both to the same source, (c) collapse the inline restated counts and link to the right panel as the source of truth.

---

### P3 — low impact, defer or batch

**T-1, T-3 — Sale events all stamped "20d ago" / Violations all "20h ago"**
*Severity: P3 · Category: Data freshness signaling*

Suggests ACRIS ingestion may be paused or running far slower than HPD violations. Could also mean the timestamp display reflects the underlying NYC dataset's `recorded` date rather than `last fetched` — needs investigation. Memory note: `project_terminal_realtime.md` flagged AI brief lag separately.

**T-2, T-12 — Address fallback gaps**
*Severity: P3 · Category: Data quality*

Cards like "BK • 3040670038" or "ADAM CLAYTON POWELL JR BLVD" (missing street number) when address resolution falls back to BBL or partial geocode. Common HPD/ACRIS data quality artifact, not a Terminal bug per se. UX could improve fallback display ("Address pending" instead of bare BBL).

**T-7, T-8 — PROPERTY snapshot conditionally hidden in inline expansions**
*Severity: P3 · Category: UX consistency*

499 Milford St expansion has FILING / PARTIES / PROPERTY (Class/Built/Units/Lot SF/Zoning/Floors) / "Research this event" button. BBL-only 3003191141 expansion has FILING / PARTIES only — no PROPERTY, no Research button. Conditional rendering is correct (no PLUTO data → no Property block) but inconsistent UX makes the surface feel half-built.

**T-11 — Inconsistent AI brief formatting**
*Severity: P3 · Category: Content style*

Some cards show paragraph briefs (most Violations). One card shows bullet-list brief with `•` prefix style — looks like raw enrichment data passing through instead of being summarized. Not a bug exactly, but breaks the Bloomberg voice that the rest of the feed maintains.

**T-14 — Search overlay full-screen blackout**
*Severity: P3 · Category: UX*

Current behavior: pressing `/` blacks out the entire feed area while sidebar stays visible. Works but feels heavy compared to a typical command bar (cmd+k). Consider in-place dropdown or partial overlay.

**T-15 — Sidebar still accessible during search overlay**
*Severity: P3 · Category: positive*

Even though the feed area blacks out, the left nav (Dashboard, Brokerage, etc.) remains clickable. Good escape hatch.

**T-20 — `o` keyboard shortcut may not fire after card click + scroll**
*Severity: P3 · Category: Functional, intermittent*

Repro: click a card (focuses it), then press `o`. Observed: right panel did not open in one attempt. Re-running with explicit click of "Open Building Profile →" link did open the panel. Possible focus-loss on scroll, or `o` requires keyboard-driven focus (j/k) rather than click-driven focus.

**T-23 — Right-panel title truncates to "Bloc..." for BBL-only buildings**
*Severity: P3 · Category: UX / copy*

BBL 3040670038 right-panel header reads "Bloc...". Title source is clearly "Block 04067, Lot 0038" but truncated mid-word. Fall back to a more useful identifier ("Brooklyn BBL 3040670038" or full "Block 04067, Lot 0038").

---

### Positive observations (worth preserving / using as references)

**P-T1 — F-2.1 (React #31) confirmed fixed.** Both crash surfaces (Market Intel slide-over and Terminal right panel) render cleanly. Smoke tests at `tests/smoke/hotfix-building-profile-react31.test.tsx` should keep them clean.

**P-T2 — Keyboard shortcuts overlay is excellent.** `?` opens a clean modal with all bindings (j/k/Enter/o/w//Esc/?). Bottom-right placement, sized appropriately, dismisses on Esc. Good a11y baseline.

**P-T3 — Filter reactivity: neighborhoods sidebar adapts to active event-type filter.** Switching from Sales to Violations updated the neighborhood list from `Park Slope (4) / East Flatbush (3) / ...` to `Harlem (793) / Morningside Heights (367) / ...` without page reload.

**P-T4 — Right-panel chevron toggle works.** Smooth collapse/expand. State should persist (saw it remembered between events) — would be worth confirming with a localStorage check next walk.

**P-T5 — RECENT BBLs sidebar section.** After opening a BBL profile, the BBL appears under "RECENT" in left sidebar. Helpful re-entry pattern.

**P-T6 — Card focus ring on j/k navigation.** Subtle but visible blue/teal outline on focused card. Good a11y.

**P-T7 — Class color-coding is clear.** Red `HPD Viol` badge + red Class I/Class C labels distinguish severity. Class C ("immediately hazardous") and Class I (lead paint) treated correctly.

**P-T8 — Graceful degradation on 404 BBL endpoints.** The 404s on `/api/intel/buildings/{bbl}` don't break the panel — it renders with cached enrichment from the event itself. (Still want to fix the 404→200 normalization per T-22, but the resilience here is solid.)

**P-T9 — Search empty-state copy.** Three concrete suggestions (`Try a partial BBL` / `Search by owner LLC name` / `Use a broader keyword from the AI brief`) and a `0 results` counter. The suggestions over-promise (T-16) but the format is right.

**P-T10 — Borough toggle works as expected.** MN+BK toggle correctly persists across event-type filter changes.

---

## Phase 5 stub drafts (ready for SLICES-speed.md)

These are formatted for paste-in to `SLICES-speed.md` Phase 5 backlog using the canonical ledger format (Status / Background / Discovery instructions / Hypotheses / Why deferred / Required input / Affected surfaces / Out of scope / Filed). Branch off `origin/main` when each gets sliced.

### `phase-0-followup-terminal-sales-brief-gap` (P1)
- **Status:** Phase 5 backlog
- **Background:** Sales events overwhelmingly stamp "Brief unavailable" while Violations cards have rich Bloomberg-voice AI briefs. Dataset-skewed gap, not a global outage. Surfaced 2026-05-04 during Phase 0 Terminal walk; ~14+ Sales cards screenshotted with empty briefs vs every Violations card populated.
- **Discovery instructions:** Read `lib/terminal-ai.ts` `generateBrief()` and check for ACRIS-specific prompt branches in `lib/terminal-ingestion.ts` `pollAcris()`. Query DB for `terminal_event` rows where `dataset_id = 'bnx9-e6tj'` (ACRIS Master) and inspect `ai_brief` column distribution (populated vs null). Run `/api/terminal/generate-briefs` manually and inspect Sentry for failed-completion traces. Compare ACRIS row payload shape (multi-table join: Master + Legals + Parties) against HPD violations row shape to see how prompt template fills differently.
- **Hypotheses to confirm/refute:** (a) dataset-shape mismatch — ACRIS multi-table join data doesn't fill the prompt template the same way single-table HPD data does, causing silent prompt failures or empty completions; (b) rate-limit hit on Sales volume (Sales >> Violations); (c) brief queue priority bias toward Violations; (d) mismatched `record_id` extractor for ACRIS, causing briefs to be stored against the wrong event.
- **Why deferred:** Phase 0 finding (P1) — needs dedicated Phase 1 slice scoped after discovery confirms which hypothesis holds. Not a hot-fix surface.
- **Required input before slicing:** None beyond audit doc landing (PR #61). Hypothesis triage can happen at slice plan-of-record time.
- **Affected surfaces:** `lib/terminal-ai.ts`, `lib/terminal-ingestion.ts` (likely `pollAcris()` specifically), possibly `lib/terminal-datasets.ts` (`record_id` extractor for ACRIS).
- **Out of scope:** Violations brief pipeline (works fine — don't refactor what's working).
- **Filed:** 2026-05-04 by Cowork during Phase 0 Terminal audit (`docs/handoff/speed-2026-q2-terminal-audit-2026-05-04.md`, finding T-10).

### `phase-0-followup-terminal-search-acris-parties` (P1)
- **Status:** Phase 5 backlog
- **Background:** Pressing `/` in Terminal and searching for "wolfson" returns 0 results, but the first Sale card on the feed lists WOLFSON, WENDY + WOLFSON, RUSSELL M as ACRIS parties when expanded. Search empty-state copy explicitly suggests *"Search by owner LLC name"* — affordance promised but not delivered. Product credibility issue: a Bloomberg-style intel terminal that can't find a known buyer/seller name from a deed it ingested 20 days ago looks broken.
- **Discovery instructions:** Locate the search endpoint (likely `/api/terminal/search` or in-memory client filter — confirm which). Map the current search index fields. Inspect `EnrichmentPackage.parties` shape on a sale event (e.g. BBL 3003191141, the Wolfson event). Check whether parties are stored on `TerminalEvent` directly or only in the enrichment JSON.
- **Hypotheses to confirm/refute:** (a) current search index spans address + BBL + AI brief text only, never parties; (b) parties live only in `EnrichmentPackage` JSON and aren't lifted into a search-indexed column; (c) ACRIS party names are technically searchable but the AI brief doesn't include them, so brief-text search misses.
- **Why deferred:** Phase 0 finding (P1) — Phase 1 work. Two solution paths to triage at slice time: lift parties to a queryable column (correct) vs scope-back the empty-state copy to match actual coverage (faster, lower commitment).
- **Required input before slicing:** Decide between "lift index" (preferred) and "scope-back copy" (cheaper). Probably the right call once discovery confirms party storage shape.
- **Affected surfaces:** likely a new API route or extension to existing `/api/terminal/search`, possibly a new column on `TerminalEvent` (`parties_text` denormalized for search), and the empty-state copy in the search overlay component.
- **Out of scope:** non-ACRIS party-like fields (Apollo people search results — different data domain, separate concern).
- **Filed:** 2026-05-04 by Cowork during Phase 0 Terminal audit (`docs/handoff/speed-2026-q2-terminal-audit-2026-05-04.md`, finding T-16).

### `phase-0-followup-terminal-buildings-api-404-normalization` (P1)
- **Status:** Phase 5 backlog
- **Background:** `/api/intel/buildings/{bbl}` and `/api/intel/buildings/{bbl}/signals` return HTTP 404 for BBLs without rich PLUTO/Apollo enrichment (e.g. BK 3040670038). The right-panel BuildingProfile renders gracefully despite the 404s — distress score 0, 1 data source, 28% confidence, building condition card populated from the event's own enrichment package. Graceful degradation works (positive!), but the 404s pollute Sentry/logs and force the fallback render path to be the primary path. Clients can't distinguish "missing" from "sparse" — they're rendered identically by an `if 404 → render with limited data` branch.
- **Discovery instructions:** Read both route handlers in `src/app/api/intel/buildings/[bbl]/route.ts` and `src/app/api/intel/buildings/[bbl]/signals/route.ts`. Verify intent: is 404 truly "BBL not found" or is it "BBL valid but no enrichment yet"? Check the BuildingProfile component's call sites to confirm the fallback path is the primary path for sparse BBLs. Inspect Sentry's logged 404s on these routes and quantify how many are "sparse data" vs "actually missing" — if the vast majority are sparse, 404 is the wrong contract.
- **Hypotheses to confirm/refute:** (a) routes treat any BBL without a PLUTO row as 404; (b) signals route has separate logic and 404s for different reasons; (c) front-end already has a `coverage` notion but it's inferred from missing fields rather than a server-side flag.
- **Why deferred:** Phase 0 finding (P1) — Phase 1 work. The fix is API surface change (200 + envelope vs 404 + fallback inference), which warrants its own slice. Backfill of sparse BBLs is separate scope.
- **Required input before slicing:** Decide on response shape: `200 + { coverage: "partial", availableSources: [...] }` envelope (preferred — single canonical response, client renders consistently) vs keep 404 + add a `HEAD /api/intel/buildings/{bbl}` coverage endpoint (more REST-pure but adds round trips). Default: envelope.
- **Affected surfaces:** `src/app/api/intel/buildings/[bbl]/route.ts`, `src/app/api/intel/buildings/[bbl]/signals/route.ts`, BuildingProfile component (display "Limited data" badge when `coverage === "partial"`), possibly Sentry filter rules (suppress non-error 404s).
- **Out of scope:** Retroactively backfilling enrichment for sparse BBLs — separate Phase 1+ initiative driven by Phase Z's enrichment pipeline metrics.
- **Filed:** 2026-05-04 by Cowork during Phase 0 Terminal audit (`docs/handoff/speed-2026-q2-terminal-audit-2026-05-04.md`, finding T-22).

---

## Out of scope (deferred to other walks / phases)

- **Watchlist CRUD UX** — no watchlists exist on this test account; needs a populated watchlist to walk
- **Phase 2 push notifications / alerting** — separate spec, not Phase 0
- **Mobile responsive** — Chrome MCP `resize_window` doesn't reliably reflow Next.js app; needs real-device or DevTools-driven walk
- **Admin Terminal health dashboard** at `/settings/admin/terminal` — separate area, walk it as part of "Settings/Admin" Phase 0 batch
- **Cron pipeline observability** (ingest/enrich/generate-briefs run health) — captured by Z.4 Sentry refinement, not part of feed walk

---

## Methodology v2.3 retro candidates surfaced this walk

1. **Network-tap during walks is high signal.** T-22's 404 finding only surfaced because I checked `/api/intel/buildings/3040670038` requests — visible UI rendered fine. Future Phase 0 prompts should include "open Network panel + filter to XHR/fetch" as a standard probe step alongside screenshots.

2. **Promised-vs-delivered affordance gap is its own finding category.** T-16 isn't a code bug — it's a UX bug where the empty-state copy describes coverage that doesn't exist. Worth adding a category to the swarm prompt template: "Promises in copy that the implementation doesn't deliver."

3. **Cross-surface data consistency check.** T-24 (conflicting violation counts inline vs right-panel) only shows up when the same BBL is rendered twice on the same screen. Worth building into the vertical-slice Phase 0 template: "Render the same entity in 2+ surfaces simultaneously and check for conflicting facts."

These are candidates, not commits — distill before locking into v2.3.
