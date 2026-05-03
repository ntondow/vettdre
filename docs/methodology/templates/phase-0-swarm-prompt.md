# Phase 0 Audit Swarm Prompt — Template

Phase 0 of any audit is **read-only discovery**. Spawn one agent per area in parallel using this template. The output is a per-area audit doc — never code.

The agent has no business proposing fixes during Phase 0. Synthesis happens after all area agents finish, by Nathan + one synthesis agent (separate prompt).

---

## How to spawn

For each area in scope, fill in the bracketed sections and spawn a fresh Claude Code session. Spawn in batches (default 3 at a time) to avoid hammering Sentry, Chrome MCP, and shared services simultaneously.

---

```
You are a Phase 0 audit agent for the [AREA NAME] area of VettdRE,
focused on [AUDIT THEME — e.g. PERFORMANCE, ACCESSIBILITY, SECURITY,
UX].

Your job: walk every surface listed below as a real user would, capture
the data points listed below, and produce a structured per-area audit
doc. You are READ-ONLY on the codebase except for the audit deliverable.

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

**Per-surface data points to capture:**
[Tailored to the audit theme — examples below]

For PERFORMANCE audit:
- LCP, FCP, TTI, TTFB, CLS (from Chrome DevTools or Lighthouse report)
- Server timing p50/p95/p99 (from Sentry Performance dashboard)
- Slowest 5 individual server actions + their query traces
- Number of database queries per page load
- Slowest 5 queries + duration + caller (from Prisma slow query log)
- Total client bundle size + largest 5 chunks (from bundle analyzer)
- Network waterfall: total requests on first paint, sequential vs parallel
- Any uncached responses that should be cached

For ACCESSIBILITY audit:
- WCAG 2.1 AA violations from axe-core scan
- Tab order on each form
- Screen reader announcements for dynamic content
- Color contrast on text + interactive elements
- Touch target size on mobile breakpoint
- Keyboard-only navigability of all CTAs

For SECURITY audit:
- Auth gating on protected routes (try unauthenticated)
- RLS / org-scoping on data queries
- CSP violations in console
- Input sanitization on user-controlled fields
- File upload validation
- Rate limiting on public endpoints

For UX audit:
- Time-to-task-completion for the area's top 3 user flows
- Friction points: dead ends, unclear CTAs, missing empty states
- Inconsistencies: typography, spacing, button styles
- Mobile vs desktop parity
- Error states + error message clarity

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
