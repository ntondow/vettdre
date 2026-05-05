# Foundation Audit — Phase 0 walk: Underwriting

**Date:** 2026-05-04 (later evening, after PR #61 + PR #62)
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`540d05d3-b429-4e37-a9bc-c4c2a493e010` (createClient hot-fix verified live; main HEAD `51e9d85` — Terminal audit doc + 3 P1 stubs canonical)
**Mode:** vertical-slice (functional + UX + a11y + RBAC + perf), READ-ONLY discovery
**Scope:** `/deals/pipeline` (kanban), `/deals/new?id=*` (Modeler workspace), `/deals/comps`, `/deals/cap-rates`, `/deals/screen`. Out of scope this walk: Comparison, Benchmarks, Closing Costs, Rent Stab, Renovation, GP/LP Waterfall, Saved Analyses, Inv Summary, LOI/BOV Generators, Documents — all 9 deferred to subsequent walks or batched into a Phase 0.5 sweep.

---

## Summary

Underwriting is a **mature, feature-dense area** — 14+ sub-pages spanning kanban pipeline, full DCF/IRR modeler, NYC-specific tools (RGB rent stab, LL97, transfer taxes, CEMA), GP/LP waterfall, and document generators (LOI, BOV, Investment Summary, PDF exports). The Modeler workspace is genuinely impressive: 5 deal structures (All Cash / Conventional / Bridge → Refi / Assumable / Syndication) with side-by-side compare, FRED-integrated mortgage rates, AI-generated assumptions with explicit `+` markers showing which fields were auto-populated, RGB I&E benchmark warnings inline on the P&L, and a Year 1 Budget P&L that surfaces "Use $X" alternative-value links from comp data.

Findings cluster into three themes: (a) **dual-theme inconsistency** — research tools are Terminal-dark while pipeline + modeler are light, intentional or accidental is unclear; (b) **data integrity gaps** — pipeline kanban metrics don't match modeler workspace metrics for the same deal, duplicate-address detection missing at deal-create time; (c) **load state UX** — Modeler renders interim placeholder values during AI-assumption load that are user-facing red ("CoC -9.04%, IRR -50%") and could spook users mid-load.

No P0 crashes. 1 P1 (kanban/modeler metric divergence). 4 P2. ~12 P3. ~10 positive observations.

---

## Method

Vertical-slice Phase 0 walk:
1. Land cold on `/deals` (auto-redirects to `/deals/pipeline`)
2. Inspect kanban: stages, filters, cards, stats
3. Click into a deal card → Modeler workspace
4. Observe initial-load state vs post-AI-assumptions state
5. Spot-check 3 research sub-pages (Comps, Cap Rates, Quick Screen) for theme + empty-state consistency
6. Cross-compare metric values between pipeline kanban and modeler workspace for the same deal

No code, no fixes, no settings changes.

---

## Findings

### P1 — high impact, candidate for Phase 1

**U-14 — Pipeline kanban metrics don't match Modeler workspace metrics for the same deal**
*Severity: P1 · Category: Data integrity*

Repro: open `/deals/pipeline`. Find any deal card with metrics displayed (e.g., 258 Bedford Avenue card showed `$3.9M / 22.3% Cap / 58.6% IRR`). Click into the deal → Modeler workspace loads → after AI-assumptions hydrate, IRR displays `94.40%` (vs kanban's 58.6%), Cap Rate 22.33% (matches within rounding), Purchase Price $3,851,889 (close to kanban's $3.9M but not identical).

Cap rate aligns; IRR and PP diverge. Hypotheses (for Phase 1 discovery):
- Kanban shows screening-stage AI assumptions (one snapshot), workspace recomputes with current FRED mortgage rates → time-of-fetch drift compounds
- Workspace's "+ AI-Generated Assumptions" header re-runs AI on every load → non-deterministic outputs
- Kanban metrics are cached at deal-create time; workspace is live

Either way, the user sees one set in the pipeline list and a different set in the workspace — confusing for "should I open this deal?" decisions. Single source of truth needed: either lock the deal's screening snapshot and display it consistently, or recompute on both surfaces with a `last-calculated-at` timestamp.

---

### P2 — medium impact, batch with related work

**U-7 — Duplicate-address deals not flagged at create time**
*Severity: P2 · Category: Data quality*

Repro: pipeline shows two cards for `5 BLEECKER STREET, Manhattan` — same address, different IDs (created 3/13/2026 and 3/12/2026), both Acquisition deals at $3.7M / 2.1% Cap. System creates both without warning. Either intentional (re-screening same property at different times — needs versioning), or accidental (user duplicated the deal).

Defer-friendly: surface a "We found 1 deal at this address — view existing or continue?" modal at deal-create time. Doesn't block anything; just adds an awareness step.

---

**U-13 / U-19 — Modeler initial-load shows alarming negative metrics before AI assumptions hydrate**
*Severity: P2 · Category: UX / load state*

Repro: from pipeline, click any deal → Modeler workspace. For ~3-5 seconds, the metric tiles show:
- CoC Return: -9.04% (red)
- IRR: -50.00% (red)
- Equity Multiple: -0.41x (red)
- DSCR: 0.57x (red)

Then AI-assumptions load and metrics flip to green positive values (52.85% / 94.40% / 14.98x / 4.09x). The interim red values are computed from the un-hydrated form defaults — they're mathematically real but user-facing and wrong-feeling for the deal in question.

Defer-friendly options: (a) skeleton-shimmer the metric tiles until assumptions hydrate; (b) show the kanban-cached values as the placeholder until live computation completes; (c) gate the workspace render behind the AI-assumptions promise.

---

**U-19 — Year 1 P&L "Use $X" alternative-value links lack affordance clarity**
*Severity: P2 · Category: UX / copy*

Repro: in Modeler workspace, scroll to Year 1 Budget P&L. Lines with ⚠️ icons (Payroll, R&M General, Landscaping) show "Use $45,600" / "Use $142,500" / "Use $28,500" links to the right of the value column. Clicking presumably swaps the value to the suggested benchmark, but the affordance doesn't say:
- What dataset the suggestion comes from (RGB I&E? Borough median? Asset-class peer?)
- What year/window
- Whether clicking is reversible
- Whether multiple "Use $X" clicks compound or each is independent

Defer-friendly: add a tooltip or inline metadata ("RGB 2024 borough median for similar Class C multifamily").

---

**U-23 — Theme inconsistency within `/deals/*`: research tools dark, pipeline + modeler light**
*Severity: P2 · Category: UX / consistency (or P3 if intentional)*

Pattern observed:
- LIGHT theme: `/deals/pipeline` (kanban dashboard), `/deals/new?id=*` (Modeler workspace)
- DARK theme (Terminal-style `bg-[#0D1117]`): `/deals/comps`, `/deals/cap-rates`, `/deals/screen` (Quick Screen)

If intentional (research-tools-are-dark, workspace-is-light), worth documenting in CLAUDE.md so future contributors understand the rule. If accidental theme bleed (e.g. CSS scope leak from Terminal styles), investigate. Currently undecidable from a walk alone.

---

### P3 — low impact, defer or batch

**U-1, U-15 — Sub-nav IA + Deal Structure tabs are well-organized.** Left sub-nav has clear category groupings (PIPELINE, IMPORT, SCREEN, UNDERWRITE, RESEARCH, SYNDICATION, GENERATE). Modeler tabs cover 5 financing structures. Architecture is solid; no findings.

**U-2 — Stats-card em-dash for "Avg Cap Rate" / "Deal Volume" when pipeline is empty.** Correct division-by-zero handling. Positive.

**U-3 — Pipeline filter chips are color-coded by stage.** Clear visual mapping. Positive.

**U-6 — "Screened This Mo" stat is ambiguous.** Could mean "deals advanced from Screening this month" (throughput) or "deals currently in Screening" (= 4 in this account, but stat shows 0). Worth clarifying label.

**U-8 — Cap-rate green/red color thresholds don't account for asset class.** A 5% cap is excellent for Manhattan office (green) and terrible for Bronx multifamily (red). Currently treats all caps comparably. Defer-friendly; add asset-class-aware thresholds when cap-rate engine matures.

**U-9 — IRR shown alongside Cap when calculated.** Good. Empty pipeline columns have helpful "Drag deals here" placeholder. Positive.

**U-16 — Break-even occupancy >100% (e.g., 119.4%) shown without warning.** A break-even occ above 100% means the deal can never break even at the current rent assumption. UX should flag with a "Deal infeasible at current assumptions" warning or auto-cap at 100% with explanation.

**U-18 — "+ AI-Generated Assumptions" yellow banner is good UX.** Explicitly tells users which inputs are AI-generated. Positive — preserves trust.

**U-20 — Per-unit values in Year 1 P&L appear correct.** $58,590 mgmt fee / $1,028 per unit = ~57 units assumed; consistent across line items. Positive.

**U-21 — `+` indicator next to AI-generated input fields.** Surfaces auto-calc transparency at the field level, not just the section level. Positive.

**U-22 — FRED integration on LTV slider + "30yr Fixed: 6.30% [FRED]" tag.** Real-time mortgage rate plumbing. Positive.

**U-25 — "Solve for Price" toggle on Quick Screen.** Goal-seek style modeling — let user enter target IRR and back-solve max price. Good CRE workflow. Positive.

---

### Positive observations summary

1. Modeler architecture is genuinely impressive — 5 financing structures + side-by-side compare + AI-generated assumptions banner + FRED-rate integration + Year 1 P&L with benchmark warnings inline.
2. Empty states (Comps, Cap Rates, Quick Screen) all have useful CTAs.
3. AI-assumption transparency: yellow banner header, `+` markers per-field, "Use $X" inline alternatives.
4. NYC-specific calc tools (Closing Costs, Rent Stab, Renovation) deferred from this walk — but the navigation IA suggests they're treated as first-class research tools, not buried submodes.

---

## Phase 5 stub drafts (canonical format, ready for SLICES-speed.md)

```markdown
### `phase-0-followup-underwriting-pipeline-modeler-metric-divergence` (P1)
- **Status:** Phase 5 backlog
- **Background:** Pipeline kanban displays IRR/Cap/Price metrics that diverge from the same deal's Modeler workspace metrics (e.g., 258 Bedford Avenue: kanban 58.6% IRR vs workspace 94.40% IRR; kanban $3.9M PP vs workspace $3,851,889). Cap rates align within rounding. Likely root cause: kanban shows a snapshot from screening-stage AI assumptions while workspace recomputes on load with live FRED rates and re-run AI assumptions. User can't tell which surface is "true" for "should I open this deal?" decisions.
- **Discovery instructions:** Read `lib/ai-assumptions.ts` to understand when AI assumptions run (deal create vs every workspace load). Read pipeline kanban card data source (`app/(dashboard)/deals/pipeline/*` and the relevant server action) to see whether kanban hydrates from cached `Deal.computedMetrics` or recomputes. Compare with workspace `app/(dashboard)/deals/new/page.tsx` Modeler render path. Check `DealAnalysis` schema for which fields are stored vs computed.
- **Hypotheses to confirm/refute:** (a) AI-assumptions runs every workspace load with non-deterministic output; (b) FRED rates fetched at workspace-load drift from kanban-cached rates; (c) kanban shows screening-stage values that are intentionally frozen but the freeze isn't documented.
- **Why deferred:** Phase 0 finding (P1) — Phase 1 work. Resolution requires deciding whether kanban is "snapshot view" or "live view," then enforcing consistently. Probably the right answer is snapshot-with-timestamp, but needs product call.
- **Required input before slicing:** Decide: snapshot-and-display-timestamp vs recompute-everywhere-on-render. Default lean: snapshot at screening, display "as of <date>" on kanban, link to "Refresh" action.
- **Affected surfaces:** `lib/ai-assumptions.ts`, `app/(dashboard)/deals/pipeline/*`, `app/(dashboard)/deals/new/page.tsx`, possibly `prisma/schema.prisma` (`DealAnalysis.metricsSnapshot` JSON column).
- **Out of scope:** Cap-rate engine accuracy; FRED rate fetch logic.
- **Filed:** 2026-05-04 by Cowork during Phase 0 Underwriting audit (`docs/handoff/speed-2026-q2-underwriting-audit-2026-05-04.md`, finding U-14).
```

(Other findings — U-7 duplicate-address detection, U-13 load-state metrics, U-19 "Use $X" affordance, U-23 theme split — are P2/P3 and will be batched with the next Underwriting walk that covers the 9 deferred sub-pages. Not filing as individual stubs yet to avoid backlog clutter; tracked in this audit doc for the second-pass walk.)

---

## Out of scope (deferred)

- 9 sub-pages: Comparison, Benchmarks, Closing Costs, Rent Stab, Renovation, GP/LP Waterfall, Saved Analyses, Inv Summary, LOI/BOV Generators, Documents
- Mobile responsive (Chrome MCP can't reflow viewport reliably)
- Permission/RBAC on deal-create flow (super_admin walks all surfaces; Phase 1 RBAC walk needed for `agent` role)
- Settings → AI configuration interaction with the deal modeler's AI assumptions
- Document Import flow (`/deals/import` — CSV upload of existing deals)
- Underwriting performance instrumentation (Sentry spans on deal-calculator — separate Z.4 follow-up territory)

Plan: a Phase 0.5 "Underwriting deep-dive" walk batches the 9 deferred sub-pages once Pipeline + Modeler + 3 research tools are stabilized.

---

## Methodology v2.3 retro candidates surfaced this walk

1. **Empty-account walks miss data-integrity findings.** This account has 4 deals total; U-14 (kanban/workspace metric divergence) was visible because metrics existed. A truly empty account would have shown nothing to compare. Phase 0 prep should pre-seed test data when surfaces require it (or document required pre-state in the swarm prompt).

2. **Vertical-slice mode catches "load state" UX gaps that perf-only mode misses.** U-13 (alarming red metrics during AI-assumptions load) is invisible to a perf audit (page renders fast — good!) but visible to a UX walk (page renders WRONG content fast — bad). Methodology v2.3 should explicitly call this out as a category: "fast-but-wrong vs slow-but-right is a UX trade-off, not a perf one."

3. **Theme audit is a separate concern from individual-finding audits.** U-23 (dark/light theme split within `/deals/*`) is a cross-page consistency issue that needs a "theme-audit" pass across all areas, not a per-area walk. Worth a Phase 0.5 cross-cut.
