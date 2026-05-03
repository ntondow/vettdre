# Phase 0 Audit Swarm Prompt — Template

Phase 0 of any audit is **read-only discovery**. Spawn one agent per area in parallel using this template. The output is a per-area audit doc — never code.

The agent has no business proposing fixes during Phase 0. Synthesis happens after all area agents finish, by Nathan + one synthesis agent (separate prompt).

---

## Two modes — pick one before spawning

### VERTICAL SLICE MODE (default — use unless you have a specific reason not to)

ONE agent per area. The agent walks the area's surfaces as a real user would and captures findings across **all** of: performance, functional correctness, UX, accessibility, RBAC/security. Whatever's broken in this area, the agent records it — regardless of which dimension the bug lives in.

**Why this is the default:**
- Most real-world bugs cross dimensions. A 4s LCP on the building profile page also tends to hide a missing aria-label, a CTA dead-end, AND an unauthenticated data leak — all visible during the same walkthrough. Forcing the agent to ignore 3 of those because "this is the perf agent" wastes 75% of the leverage of the walkthrough.
- Token cost scales with (areas × modes). 10 areas × 1 mode = 10 runs; 10 areas × 4 modes = 40 runs for the same surface coverage. Same synthesis output, 4× the cost.
- Cross-dimensional patterns surface earlier. Synthesis still consolidates by pattern, not by dimension — a vertical-slice agent producing "this page has 3 issues across perf + a11y + RBAC" feeds synthesis better than four single-dimension docs each reporting the page once.
- Agents naturally prioritize what's most broken. A vertical-slice agent who finds the page is functionally broken won't waste 80% of its run polishing perf metrics on a page that doesn't work.

**When to override and use LEGACY mode instead:**
- The audit's purpose is genuinely single-axis (e.g. SOC 2 prep wants ONLY security findings; a pre-launch perf push wants ONLY perf numbers, no UX noise).
- The dimension under audit needs deep specialized tooling that's awkward to run alongside other dimensions (e.g. running axe-core in headless mode while also running Chrome DevTools perf profiling).
- A previous Phase 0 found a single dimension dominated all severity rankings, and Phase 5 wants to revisit that dimension specifically.

### LEGACY MODE (dimension-themed — opt in only when single-axis is the explicit goal)

One agent per (area × dimension). E.g. for 10 areas × 4 dimensions, 40 agent runs. The dimension-specific data point lists are preserved below — use them when LEGACY mode is the right tool. Otherwise default to VERTICAL SLICE.

---

## Worked example — VERTICAL SLICE MODE for Foundation/Speed Audit

For the area "Market Intel building profile" (`/market-intel` + slide-over building modal):

- Surfaces in scope: `/market-intel` search modes (property, ownership, name/portfolio, map); building profile slide-over for 5 representative BBLs (1 Manhattan condo, 1 Brooklyn HPD-flagged multifamily, 1 stalled-site, 1 LLC-owned, 1 with active permits).
- Per-surface data points captured (NOT split across 4 agents):
  - **Perf:** LCP/FCP/TTI from Chrome DevTools, server timing p50/p95 from Sentry, slowest 5 server actions during the walkthrough, total queries per page load (cross-reference Prisma slow query log).
  - **Functional:** does each search mode return results? does building profile load? does AI ownership analysis complete? do violations/permits/contacts panels render?
  - **UX:** time-to-task for "find building → open profile → identify owner" flow; friction points; empty-state quality for unmatched searches.
  - **A11y:** axe-core scan on the page; keyboard navigation through the slide-over; screen-reader announcement for slide-over open/close; color contrast on AI Lead Score badges.
  - **RBAC:** unauthenticated access attempt; org-scoping verification (does User-A see User-B's saved prospects? — should NOT); data leak check on enrichment endpoints.
- Output: ONE doc at `docs/handoff/speed-2026-q2-market-intel-audit-<YYYY-MM-DD>.md` with all five dimensions interleaved per surface, P0/P1/P2 ranking applied across dimensions consistently.

The synthesis agent reads N such per-area docs and produces the cross-cutting view (e.g. "Apollo waterfall in 5 of 10 areas" surfaces from a single perf line in 5 separate vertical-slice docs).

---

## How to spawn

For each area in scope, fill in the bracketed sections and spawn a fresh Claude Code session. Spawn in batches (default 3 at a time) to avoid hammering Sentry, Chrome MCP, and shared services simultaneously.

---

```
You are a Phase 0 audit agent for the [AREA NAME] area of VettdRE,
running in VERTICAL SLICE MODE (default).

Your job: walk every surface listed below as a real user would, and
capture findings across ALL FIVE dimensions for each surface:
performance, functional correctness, UX, accessibility, RBAC/security.
Produce one structured per-area audit doc. You are READ-ONLY on the
codebase except for the audit deliverable.

DO NOT propose fixes. DO NOT write code. ONLY measure and capture.
If you catch yourself starting to write fix recommendations, stop and
revert.

**Login credentials:** [where to find them — 1Password entry, etc.]
**Tools:** `mcp__Claude_in_Chrome__*` for browser, `mcp__workspace__bash`
for one-off scripts (read-only — no migrations, no writes).

**Surfaces in scope:**
- [URL 1] — [what to test on this surface]
- [URL 2] — [what to test on this surface]
- ...

**Per-surface data points to capture (all five dimensions):**

**Performance:**
- LCP, FCP, TTI, TTFB, CLS (from Chrome DevTools or Lighthouse report)
- Server timing p50/p95/p99 (from Sentry Performance dashboard)
- Slowest 5 individual server actions + their query traces
- Number of database queries per page load
- Slowest 5 queries + duration + caller (from Prisma slow query log)
- Total client bundle size + largest 5 chunks (from bundle analyzer)
- Network waterfall: total requests on first paint, sequential vs parallel
- Any uncached responses that should be cached

**Functional correctness:**
- Does each top-level action on the surface produce the expected result?
- Are forms submittable? Do submissions succeed? Do errors surface
  cleanly when inputs are invalid?
- Are all the data panels populated, or do some show empty/error states
  for valid inputs?
- For surfaces with async/streaming/multi-phase loads (Market Intel
  building profile, Terminal feed, etc.): does each phase complete?

**UX:**
- Time-to-task-completion for the area's top 3 user flows
- Friction points: dead ends, unclear CTAs, missing empty states
- Inconsistencies: typography, spacing, button styles
- Mobile vs desktop parity
- Error states + error message clarity

**Accessibility:**
- WCAG 2.1 AA violations from axe-core scan
- Tab order on each form
- Screen reader announcements for dynamic content
- Color contrast on text + interactive elements
- Touch target size on mobile breakpoint
- Keyboard-only navigability of all CTAs

**RBAC / security:**
- Auth gating on protected routes (try unauthenticated)
- RLS / org-scoping on data queries (try cross-org access)
- CSP violations in console
- Input sanitization on user-controlled fields
- File upload validation
- Rate limiting on public endpoints

If a dimension genuinely doesn't apply to a surface (e.g. RBAC on a
fully-public page), say so explicitly in the audit doc — don't omit
silently. "N/A — page is unauthenticated by design" is a valid finding.

[LEGACY MODE — only if explicitly opted-in: replace the five-dimension
block above with a single "Per-surface data points: [DIMENSION-specific
list from §LEGACY data points below]" block.]

**For each bug found, record in
`docs/handoff/[AUDIT-NAME]-[AREA]-audit-<YYYY-MM-DD>.md`:**

1. One-line description
2. Screenshot path (save to `docs/handoff/screenshots/[AUDIT]-[AREA]-<n>.png`)
3. Surface (URL + best-guess component path from CLAUDE.md)
4. Severity:
   - **P0** — blocks task completion / unusable / security or data risk
   - **P1** — degraded UX / measurable but non-blocking
   - **P2** — cosmetic / paper cuts
5. Reproduction steps (numbered, click-by-click)
6. Captured data points (from above list, where relevant)

**End your audit doc with these required sections:**

- **"Top 5 issues by impact"** — ranked list with severity + estimated
  user-impact rationale.
- **"Cross-area patterns observed"** — issues that likely show up
  elsewhere (e.g. "Apollo enrichment is sequential everywhere it's
  used", or "all forms missing aria-required"). Synthesis uses this.
- **"Surfaces blocked from full audit"** — anything that 503'd, errored
  unexpectedly, or required permissions you didn't have. Capture the
  error and continue rather than blocking.

**Stop conditions:**
- If you discover a security issue (auth bypass, data leak, exposed
  secret), STOP and surface in chat IMMEDIATELY. Do NOT include the
  issue in the audit doc until reviewed.
- If a surface 503s or unexpectedly errors, capture the error in the
  "blocked" section and continue.
- If you can't get baseline measurements (tooling missing, dashboard
  inaccessible), STOP — Phase Z isn't complete and Phase 0 should not
  proceed.
- If the agent context window approaches the limit and the audit isn't
  complete, STOP and produce a partial doc with a "remaining surfaces"
  list — don't ship a confident-looking complete-audit doc that's
  actually missing half.
- DO NOT propose fixes. If you catch yourself starting to write fix
  recommendations, stop and revert.
```

---

## Synthesis step (after all area audits complete)

After all area agents have produced their per-area audit docs, spawn ONE synthesis agent with this prompt:

```
You are the Phase 0 synthesis agent for the [AUDIT NAME].

Read every per-area audit doc at `docs/handoff/[AUDIT-NAME]-*-audit-*.md`.
Produce one synthesis doc at `docs/handoff/[AUDIT-NAME]-synthesis-<YYYY-MM-DD>.md`.

The synthesis must include:

1. **Master ranked bug list** — every bug from every per-area doc,
   ranked P0 → P1 → P2, deduplicated where the same root cause appears
   across areas. Cite the per-area doc + bug ID for each entry.

2. **Cross-cutting patterns** — bugs that appear in 3+ areas should
   become single cross-cutting slices, not N individual fixes. Examples:
   - "Apollo enrichment sequential in 5 areas — single lib fix"
   - "All forms missing aria-required — single audit pass"

3. **Quick-win shortlist** — top 10 effort-to-impact ratio. These
   become Phase 1 candidate slices.

4. **Long-tail backlog** — everything else. Each becomes a Phase 5
   stub in SLICES.md.

5. **Suggested Phase 1 scope** — propose the 10-15 slices you'd ship
   first, in dependency order. Do NOT write the slice prompts; that's
   Nathan's role after approval.

6. **Open questions** — anything that needs Nathan's decision before
   Phase 1 can scope (e.g. stakeholder input required, library swap
   considered, breaking change ahead).

Stop conditions:
- If you discover a security issue surfaced in any area audit, STOP
  and re-surface it in chat IMMEDIATELY.
- If two area audits contradict each other on a fact, capture both
  and flag for Nathan — don't pick a winner.
- DO NOT write fix code. DO NOT propose implementations beyond the
  slice-list level.
```

Nathan reviews the synthesis, approves or refines, then defines Phase 1 scope. Each Phase 1 slice gets its own kickoff prompt (use `kickoff-prompt.md` template).

---

## Why these constraints matter

**Read-only-ness:** Phase 0 agents write fix code if you let them. The fix code is always wrong because it skips the synthesis step that catches cross-cutting patterns. Resist.

**Severity definitions:** P0/P1/P2 are area-agnostic. A perf P0 (page > 5s TTI) is comparable to an a11y P0 (form unusable with screen reader) in terms of how the audit prioritizes work. Without consistent severity, synthesis can't rank.

**Captured data points are auditable:** "It feels slow" is not a Phase 0 finding. "LCP measured 4.2s on 3G fast emulation" is. Numbers > vibes.

**Synthesis is mandatory:** without it, you ship N individual fixes for the same root cause and waste 80% of the leverage. The Asana board fills with duplicate cards. Future-you can't tell what's a real new bug vs the 6th instance of the Apollo waterfall pattern.

**Vertical-slice over dimension-themed:** Real product bugs cross dimensions. The page that's 4s LCP is also the page with broken keyboard nav and the unauthenticated data leak — same walkthrough catches all three. Dimension-themed mode runs four agents per area at 4× the token cost and produces docs that synthesis has to re-cross-reference anyway. Vertical-slice agents produce docs that already integrate dimensions per surface, so synthesis can focus on cross-area patterns instead of stitching dimension-axes back together. Only opt into LEGACY (dimension-themed) mode when the audit's purpose is genuinely single-axis — most real product audits aren't.
