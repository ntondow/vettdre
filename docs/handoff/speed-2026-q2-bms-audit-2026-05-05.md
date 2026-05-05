# Foundation Audit — Phase 0 walk #8: BMS (brokerage admin persona)

**Date:** 2026-05-05 (afternoon, after walk #7 Leasing)
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`540d05d3`; main HEAD `b14f961`
**Mode:** vertical-slice + persona/enhancement lens (third walk applying it)
**Persona:** Brokerage admin / owner (the person who runs Gulino itself, NOT the agent who works there — Dan Tomback's boss)
**JTBD:** *"Friday afternoon weekly review — which deals closed, who's behind on tasks, who's hitting goals, what cash is coming in. Spot agents who need help and money I'm owed. 5-minute pulse, not 30-minute drill-down."*
**Scope:** `/brokerage` (auto-redirects to `/brokerage/dashboard`), `/brokerage/agents`, `/brokerage/reports` (P&L tab). Out of scope this walk: Submissions queue (separate broker-side workflow), Invoices index, Payments index, Transactions index (already walked in #4), My Deals (agent-side), Listings + Properties (agent-side), Compliance, Commission Plans (config), Leaderboard (gamification), Templates (config), Settings (admin config).

---

## Summary

**The BMS area is the most persona-aligned surface walked so far.** Built for the brokerage admin from the ground up. The dashboard's stat row (HOUSE REVENUE / AGENT PAYOUTS / PENDING INVOICES / CLOSED DEALS each with 30-day delta) directly answers the JTBD's first three questions ("which deals closed, what cash is coming in, money I'm owed"). Reports tabs (P&L / Agent Production / 1099 Prep / Pipeline) are exactly what an admin would expect.

3 defect findings (1 P3, 2 positive observations baked in) + **5 enhancement opportunities** focused on closing the gap between "showing me last week's numbers" and "telling me what to DO this week." The current dashboard is past-tense (what happened); the JTBD wants forward-tense (what to act on).

Walk was fast (~15 min vs. previous walks' 30 min) because the area is healthy — fewer surprises to catalog. Methodology v2.3 candidate insight reinforced from walk #7: enhancement density correlates inversely with persona-alignment. Walk #6 Messages (broker on broker tool, mostly aligned): 5 enhancements. Walk #7 Leasing (owner on broker tool, mismatched): 8 enhancements. Walk #8 BMS (admin on admin tool, well-aligned): 5 enhancements. Pattern: aligned area → fewer paradigm-shift suggestions, more "deepen what's already there" suggestions.

No P0/P1 defects. No P2 defects. Just thoughtful enhancements + one minor data polish.

---

## Method

Vertical-slice + persona Phase 0 walk:
1. Cold-load `/brokerage`, observe redirect to `/brokerage/dashboard` and overview layout
2. Frame the JTBD: "Friday weekly review — what closed, who needs help, what's coming in"
3. Inspect stat row + Today's tasks + Top performers + Active transactions structure
4. Navigate to `/brokerage/agents` to evaluate roster surface
5. Navigate to `/brokerage/reports` to evaluate financial reporting surface
6. Map findings to JTBD: where does the dashboard answer the question? where does it leave the admin to figure things out manually?

No code, no fixes.

---

## Findings (defects)

### P3 — low impact

**B-5 — Stat-row math driven by SMOKE-TEST data.** PENDING INVOICES $1,485 (with red "↗ new" badge) traces to the SMOKE-TEST-001 transaction from yesterday's BMS testing. Same test-data-pollution category as walk #5 Prop-6 and walk #7 LP-7. Cross-area cleanup pass would fix all three.

**B-6 — Delta indicator color semantics.** Stat-row arrows: red ↗ next to "$1,485 new" (PENDING INVOICES). Red usually means "bad" but here it just means "new (vs. zero baseline)." For PENDING INVOICES, "new" actually means "you're owed money" which is good. Color mapping should be context-aware: revenue/payouts/closed-deals up-arrow = green; invoices/expenses up-arrow = neutral or context-dependent. Defer-friendly.

---

### Positive observations

**B-1 (HEADLINE POSITIVE) — Stat row is correctly persona-targeted.** HOUSE REVENUE / AGENT PAYOUTS / PENDING INVOICES / CLOSED DEALS — exactly the four numbers an admin pulls up first on Friday afternoon. Each with vs-prior-30d delta. This level of alignment is the high bar other areas should be measured against.

**B-2 — "All caught up." empty state with "View pipeline" CTA.** When no submissions are pending review, the surface tells the admin clearly. Workflow-aware positive UX.

**B-3 — Time-period filter (Month / Quarter / Year).** Supports weekly/monthly/quarterly admin reviews directly. Simple and right.

**B-4 — "Today's tasks" with "No tasks due today / Check the pipeline →" empty state.** Actionable empty state. Admin can fall through to next-best-action.

**B-7 — Reports tab structure.** P&L / Agent Production / 1099 Prep / Pipeline. Maps tightly to brokerage admin needs: "where's my money / how are agents performing / can I file taxes / what's the forward view."

**B-8 — Agent roster has the right filter chips.** All / Active / Pending / Inactive / Terminated. Lifecycle-aware — admin can find onboarding-pending hires AND track terminated agents (compliance trail).

---

## Enhancement opportunities (persona: Brokerage admin · JTBD: "Friday weekly review, spot what needs my attention")

### B-A1 — "Needs Your Attention" proactive card on dashboard (P1 enhancement)

**Gap:** Dashboard answers "what happened" (revenue, payouts, invoices, closed). Doesn't answer "what should I do." JTBD specifically says "spot agents who need help and money I'm owed" — that's proactive triage, not retrospective metrics.

**Enhancement:** Top-of-dashboard card surfacing 3-5 admin actions algorithmically:
- 🚨 "Marcus Chen is 40% behind quarterly goal — coach or reassign"
- 💰 "$3,200 invoice to Acme Holdings is 14 days overdue — send reminder"
- ⚠️ "Sarah's NY License expires May 15 (10 days) — renewal needed"
- 📞 "5 deal submissions awaiting your review"
- 📅 "3 transactions stuck in 'Under Contract' >30 days"

Each row has a 1-click action button (Send reminder / Coach / View / Renew).

**Impact:** Direct JTBD. Transforms dashboard from retrospective to action-oriented. The most leverage on this whole walk.

**Effort:** M (~2-3 weeks — query layer + rules engine + UI)

---

### B-A2 — Pair "Top performers" with "Needs coaching" (P1 enhancement)

**Gap:** Dashboard has Top performers card (in skeleton state during walk — no data). Top performers is half the picture; admin equally needs to see who's UNDERPERFORMING relative to their goal trajectory or peer benchmark.

**Enhancement:** Two-column card: "Top performers" (top 3 by revenue/closed deals/etc.) + "Needs coaching" (bottom 3 relative to their goal — not absolute, since absolute would always show new agents). Each row clickable to agent detail.

**Impact:** Admin can run a 2-minute check across both ends of the bell curve weekly. Currently they'd have to navigate to Reports → Agent Production and manually rank.

**Effort:** S (~3-5 days — extends existing Top performers component)

---

### B-A3 — PENDING INVOICES card should expand to top 3 oldest with quick-action affordance (P2 enhancement)

**Gap:** Dashboard PENDING INVOICES shows total ($1,485) with delta. Admin's next question is always "who owes me what, when did I send it, when is it due." Currently they click into Invoices index, scroll, sort. Multiple steps.

**Enhancement:** Hover/expand on the PENDING INVOICES card → show top 3 oldest invoices with: agent / client / amount / days outstanding / "Send reminder" button. Drill-through to full invoice on click. Admin can clear stale invoices in 30 seconds without leaving the dashboard.

**Impact:** Direct JTBD ("money I'm owed"). Reduces clicks for the highest-frequency admin action.

**Effort:** S (~3-5 days — card variant + reminder action)

---

### B-A4 — Forward revenue forecast based on pipeline stage probabilities (P2 enhancement)

**Gap:** Stats are all retrospective (what closed, what's pending, vs prior 30d). Admin doing weekly review wants forward visibility: "$X expected to close this month based on stage probabilities." Currently absent.

**Enhancement:** Add a "Pipeline forecast" card to dashboard showing: total pipeline $ (deals in any stage), weighted forecast $ (each deal × stage probability), expected-close-this-month $. Use stage-conversion data from `Transaction.stage` history to compute probabilities per stage.

**Impact:** Lets admin set realistic monthly targets + spot stalled deals (deals weighted at $0 = stuck). Foundation for any goal-tracking feature.

**Effort:** M (~2-3 weeks — needs historical stage-conversion calculation; no UI lift on its own)

---

### B-A5 — Agent goals visible inline on agent roster, not just Reports (P3 enhancement)

**Gap:** Agent roster (`/brokerage/agents`) shows lifecycle filter chips but no goal-tracking column on the table itself. Admin has to navigate to Reports → Agent Production to see per-agent goal progress. Two-screen task.

**Enhancement:** Add a "Goal progress" column to the agent roster table: each row shows agent's current period progress as a percentage bar (e.g., "Q2: 67% — on track" or "Q2: 32% — at risk"). Color-coded (green/yellow/red). Click row → agent detail with full goal breakdown.

**Impact:** One-screen agent management. Combines roster + performance into the surface admins use most.

**Effort:** M (~1-2 weeks — leverages existing AgentGoal model, adds calculation + column)

---

## Phase 5 stub drafts (canonical format, ready for SLICES-speed.md)

```markdown
### `phase-0-followup-bms-stat-delta-color-semantics` (P3)
- **Status:** Phase 5 backlog
- **Background:** BMS dashboard stat-row delta arrows use red color uniformly for "↗ new" indicators regardless of whether "new" is good (revenue, closed deals) or neutral (invoices, expenses). E.g., PENDING INVOICES with "$1,485 ↗ new" in red could read as alarming when actually "you're owed more money than last period." Surfaced 2026-05-05 during Phase 0 walk #8 (admin persona lens).
- **Discovery instructions:** Read `src/app/(dashboard)/brokerage/dashboard/page.tsx` (or equivalent) to find the stat-card component. Inspect color logic — likely a single `<DeltaIndicator value={delta} />` that maps positive deltas to green and negative to red without context awareness. Check whether stat cards have a per-card "good_direction" prop or similar.
- **Hypotheses to confirm/refute:** (a) stat-card component is generic and applies uniform color logic; (b) component already has variant support but dashboard wires them all the same way.
- **Why deferred:** Phase 0 finding (P3) — Phase 1 work. Pure UX polish, no data layer change.
- **Required input before slicing:** Decide color semantics per card: HOUSE REVENUE up=green, AGENT PAYOUTS up=neutral (cost), PENDING INVOICES up=neutral or context-dependent (good if "you're owed more" / bad if "uncollected"), CLOSED DEALS up=green.
- **Affected surfaces:** likely `src/components/bms/stat-card.tsx` (or wherever the delta indicator lives), `src/app/(dashboard)/brokerage/dashboard/page.tsx` for wiring per-card semantics.
- **Out of scope:** Other surfaces using the same component (would inherit the fix automatically; no scope-creep needed).
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #8 (`docs/handoff/speed-2026-q2-bms-audit-2026-05-05.md`, finding B-6).
```

(B-A1 through B-A5 are 5 enhancement candidates — will be filed in `## Phase 1 enhancement candidates` section using the canonical schema established in PR #65.)

---

## Out of scope (deferred)

- `/brokerage/submissions` (broker-side approval queue — agent persona walk territory)
- `/brokerage/transactions` (already walked in #4 with finding P-1)
- `/brokerage/invoices` index (drill-down detail; covered conceptually by B-A3)
- `/brokerage/payments` index
- `/brokerage/my-deals` (agent-side)
- `/brokerage/listings` (agent-side, plus already touched in walk #5 Prop-11)
- `/brokerage/listings/properties` (agent-side)
- `/brokerage/compliance` (admin-side but separate workflow — license/insurance tracking)
- `/brokerage/commission-plans` (config)
- `/brokerage/leaderboard` (gamification)
- `/brokerage/agents/[id]` (agent detail — would walk if seeded data existed)
- `/brokerage/templates`
- `/brokerage/settings` (admin config — separate Settings walk)
- Reports sub-tabs deep-dive (Agent Production / 1099 Prep / Pipeline — only P&L glanced)
- Mobile responsive

---

## Methodology v2.3 retro candidates (additions from this walk)

1. **Enhancement density inversely correlates with persona alignment.** Walk #6 Messages (broker on broker tool, mostly aligned) → 5 enhancements. Walk #7 Leasing (owner on broker tool, mismatched) → 8 enhancements. Walk #8 BMS (admin on admin tool, well-aligned) → 5 enhancements. Pattern: aligned area surfaces "deepen what's there" enhancements; mismatched area surfaces "rebuild what's there" enhancements. Methodology v2.3 should track this metric across walks as a product-design priority signal.

2. **Defect density also drops when persona-aligned.** This walk had 1 P3 defect (B-6 color semantics) — fewest of any walk so far. Areas built for the right persona surface fewer "this is broken" findings because the design intent matches the user. Confirms walk #7's hypothesis.

3. **Walk speed is a useful signal.** This walk took ~15 min vs. previous walks' ~30 min. Speed correlates with finding density — when there's less to flag, the walk goes faster. Methodology v2.3 should track wall-clock walk time as a signal of area-health.

4. **Fast walks should still write up positives explicitly.** Easy to skip when there's "nothing wrong" but the positives ARE the finding when an area is well-aligned. B-1 "Stat row is correctly persona-targeted" is a useful reference for other areas to be measured against. Methodology v2.3 should treat positive observations as first-class output, not an afterthought.
