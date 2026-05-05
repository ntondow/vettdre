# Foundation Audit — Phase 0 walk #7: Leasing (owner persona)

**Date:** 2026-05-05 (afternoon, after walks 4-6 + walk-5 recovery)
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`540d05d3` (createClient hot-fix); main HEAD `b14f961` after PR #66 merge
**Mode:** vertical-slice + persona/enhancement lens (option C, second walk applying it)
**Persona:** Property owner / landlord (multifamily, 30+ units, hires VettdRE Leasing Agent so they DON'T have to staff a leasing office)
**JTBD:** *"It's Monday morning. I want a 60-second pulse-check on my building's lease-up — how many inquiries did the AI handle, how many tours did it book, where did prospects drop off, where did the AI escalate to me, and is my lease-up on track. Not 30 minutes of clicking."*
**Scope:** `/leasing` (landing/inbox view), `/leasing/analytics`. Out of scope this walk: `/leasing/setup` (owner-onboarding JTBD, different scan), `/leasing/[configId]/knowledge` (config surface), `/leasing/[configId]/team` (config), `/leasing/[configId]/web-chat` (config), `/leasing/referral` (separate JTBD), `/leasing/upgrade/success`. The 5 deferred sub-pages are owner-onboarding-flow surfaces, not weekly-pulse-check surfaces — would walk separately with a different JTBD.

---

## Summary

The Leasing area exists as a **property-management-vendor product** but the current /leasing landing surface treats the owner persona as a **broker doing message triage**. That's a design mismatch worth surfacing.

7 findings: 0 P0, 0 P1 defects, 2 P2 defects, 5 P3, 3 positive observations.
**8 enhancement opportunities** — this is by far the highest enhancement density of any walk so far. The owner JTBD ("hands-off lease-up tracking") isn't well-served by the current message-triage-style interface; the gap between "how the tool is built" and "what the owner needs from it" is wide enough that almost every landing-page element has an enhancement opportunity attached to it.

**Headline persona findings:**
- **The /leasing landing page IS NOT a dashboard — it's a conversation list with stat tiles.** For the owner JTBD, the conversation list should be tertiary; performance metrics + escalations should be primary. The page has the data (Hot Leads, Escalated filter, Showings This Week, Messages Today) but presents it as configuration noise.
- **The /leasing/analytics page is empty when there's no data, with no preview of what metrics will appear.** Owner persona can't see what's coming. Greyed-out skeleton metric cards would manage expectations + preview product value.
- **Building/unit-level pivots are missing.** Owners think "how is 532 Neptune Ave performing?" not "show me all conversations." All filters are conversation-level.

The Leasing AI Agent product itself works (per CLAUDE.md status: 10+ sub-pages, multi-channel inbound, A/B testing, follow-ups, benchmarking). The owner-experience layer on top of it is where the gap is.

---

## Method

Vertical-slice + persona Phase 0 walk:
1. Cold-load `/leasing`, observe stats row + conversation list + filter chips + Today's Usage widget
2. Frame the JTBD: "60-second pulse-check"
3. Ask: can I see at a glance how my building is performing? (Stats: 0/0/0/0 — but the layout doesn't surface trends, comparisons, or escalations prominently)
4. Ask: can I drill down to a specific building or unit? (No — only conversation-level filters)
5. Ask: can I see WHERE prospects are dropping off? (Navigate to /leasing/analytics — empty state, no preview)
6. Catalog defects + enhancement gaps under both lenses

No code, no fixes.

---

## Findings (defects)

### P2 — medium impact

**LP-5 — "Today's Usage" card on /leasing landing surfaces product-tier metering, not business-performance metering**
*Severity: P2 · Category: Persona-mismatch / Information architecture*

Repro: scroll to bottom-left of `/leasing`. "Today's Usage" card shows "0/25 msgs" + "0 sent | 0 received" + "0 new convs" + "Resets in 13h 2m". This is **subscription-tier rate-limit metering** (per `lib/leasing-limits.ts`) — useful for the operator who's worried about hitting their cap. But for the owner persona doing a pulse-check, this surface answers a question they didn't ask. It's billing-flavored noise on a performance-flavored page.

Defer-friendly fix paths: (a) move to Settings → Billing or Settings → Plan limits; (b) collapse to a single "X% of daily quota used" line item in a small footer area; (c) only surface when nearing the cap (conditional render).

---

**LP-6 — Notification banner copy uses broker-vocabulary, not owner-vocabulary**
*Severity: P2 · Category: Persona-aware copy*

Repro: top of `/leasing`. Banner: "Get instant alerts when your AI needs help. [Enable notifications] [Not now]"

For an owner persona, "your AI" is colloquially fine, but "needs help" implies the AI is incompetent or struggling. The owner is BUYING the AI to handle leasing for them; framing it as "needing help" undermines the value prop. Better copy: "Get instant alerts when an escalation requires your input." Or "Your leasing agent will only ping you for things that need a human decision."

This is a small thing but it's the first thing the owner sees on the page, and it's setting the wrong tone.

---

### P3 — low impact

**LP-7 — Test conversation pollution.** "Test / You: hi / Cold / 62d ago" lingers in the conversation list. Same pattern as walk #5 Prop-6 (532 Neptune Ave SMOKE-TEST-001). Test data not segmented from prod. Worth a cross-area test-data-cleanup pass.

**LP-9 — Analytics empty state has good copy + CTA.** "Not enough data yet / Your analytics will appear here once your AI has handled a few conversations. / Go to conversations →". Positive — but doesn't preview WHAT metrics will appear (see LP-A1 below).

**LP-11 — Analytics date-range filter chips (Last 7 / 30 / 90 days).** Standard, helpful. Positive.

**LP-12 — Filter chips on /leasing landing have no count badges.** All / Active / Qualified / Showing / Escalated — no counts visible (vs. Messages had counts on some). Especially problematic for "Escalated" — the most important number for the owner JTBD.

**LP-13 — Stats row math is observable.** Active 0 + Showings 0 + Hot Leads 0 + Messages Today 0/25 — all clear. Positive.

---

### Positive observations

**LP-2 — AI temperature classification surfaces in conversation row.** "Cold" tag visible on the test conversation. Indicates prospect engagement signal. Useful when there's data.

**LP-3 — Filter chip vocabulary matches the leasing funnel.** All / Active / Qualified / Showing / Escalated — these are the right buckets for a leasing flow. Filter design is correct; what's missing is per-bucket COUNT VISIBILITY (LP-12) and bucket-pivot affordances (LP-A2).

**LP-8 — Top toolbar has all the right surfaces.** + Add Property / Knowledge Base / Analytics / Web Chat / Team / Refer & Earn / Settings. Comprehensive control surface. Positive.

---

## Enhancement opportunities (persona: Owner / Landlord · JTBD: hands-off lease-up tracking)

### LP-A1 — Replace `/leasing` landing with a true Owner Dashboard (P1 enhancement)

**Gap:** Current `/leasing` is a conversation list with summary tiles. Owner's first need is "how is my building performing this week?" — they care about lease-up velocity and AI-handled volume, not which specific conversation is at the top of the list.

**Enhancement:** Convert `/leasing` (or add a new `/leasing/dashboard` that becomes default) to a true performance dashboard:
- Top: weekly lease-up funnel (Inquiries → Tours → Applications → Leases) with conversion rates
- Middle: AI-handled vs. human-escalated split (clear that the AI is doing the work, with explicit count of escalations needing owner attention)
- Lower: per-building / per-unit performance leaderboard ("532 Neptune Ave: 12 inquiries, 3 tours, 1 lease — on track" vs. "20-15 24th St: 4 inquiries, 0 tours — needs attention")
- Sidebar: cross-building benchmarks (you vs. similar buildings via `LeasingBenchmark` model in CLAUDE.md schema)

The conversation list moves to `/leasing/conversations` as a power-user / drill-down surface.

**Impact:** Direct owner JTBD. Replaces 30 minutes of clicking with a 60-second pulse-check. Justifies the product subscription on its own.

---

### LP-A2 — Building/unit-level pivots, not just conversation-level (P1 enhancement)

**Gap:** All filters are conversation-level (Active / Qualified / Showing / Escalated). Owner thinks "how is 532 Neptune Ave doing?" not "show me all my conversations."

**Enhancement:** Add a "By Building" or "By Unit" pivot affordance. Per-building card view: each building in a card showing inquiries/tours/applications/leases for the period, with a sparkline showing trend + status indicator (on-track / at-risk / under-performing). Click into a building → sub-view of units, each with same metrics.

**Impact:** Aligns the data model with how owners actually think. Especially valuable for owners with multiple buildings — they can spot which building is dragging the portfolio.

---

### LP-A3 — Escalations should be the most prominent thing, with 1-click resolution (P1 enhancement)

**Gap:** "Escalated" is one of 5 filter chips with no count badge. Owner JTBD specifically says "where did the AI escalate to me" — that's the AI's most important communication, but it's de-emphasized.

**Enhancement:** Promote escalations to a top-level component. Pinned at the top of `/leasing`: "**3 escalations need your input**" red banner with each escalation as a row showing prospect name + AI's reason for escalating + suggested response + "Approve" / "Edit" / "Take over" buttons. Owner can clear all 3 in 60 seconds without leaving the page.

Backend: per `LeasingConversation.escalationReason` enum in CLAUDE.md schema. Surface this as a queue.

**Impact:** Closes the loop on the AI's "I need help" handoff. Direct owner JTBD. Without this, escalations sit unhandled and the AI looks broken.

---

### LP-A4 — Empty-state analytics should preview what metrics will appear (P2 enhancement)

**Gap:** `/leasing/analytics` shows "Not enough data yet" with no skeleton. Owner can't see what's coming.

**Enhancement:** Render greyed-out skeleton metric cards in the empty state — "Conversion funnel (your data here)", "Response time distribution (your data here)", "Tour booking rate (your data here)", etc. Manages expectations + previews product value.

**Impact:** Onboarding clarity. Owner immediately sees "ah, this is what I'll get once the AI runs for a few weeks."

---

### LP-A5 — Cross-building benchmarks visible at-a-glance (P2 enhancement)

**Gap:** `LeasingBenchmark` model exists in schema (per CLAUDE.md: "anonymous percentiles" across buildings). But there's no visible "you vs. similar buildings" comparison anywhere on the landing page.

**Enhancement:** Sidebar widget on `/leasing` (or a card on the proposed dashboard): "Your buildings vs. similar 30-50 unit Brooklyn multifamily — Inquiry-to-tour conversion: 18% (your) vs. 24% (median) — needs attention." Helps owner triage which buildings to focus on.

**Impact:** Owner can self-benchmark without asking VettdRE for "are these numbers good?" Direct retention play.

---

### LP-A6 — "AI handled X conversations this week, saved you Y hours" headline (P2 enhancement)

**Gap:** Owner is paying for the AI to do work. The product currently doesn't TELL them how much work it did. Without a clear value-receipt, retention/upgrade decisions get harder.

**Enhancement:** Headline metric on `/leasing` dashboard: "**This week: AI handled 47 conversations → 12 tours booked → 3 leases signed. Saved you ~14 hours.**" Hours-saved calculation = avg time per inquiry × count. Configurable per-org rate.

**Impact:** Re-justifies the product on every visit. Helps with renewal conversations too.

---

### LP-A7 — Cross-area integration: Leasing escalations → Calendar (P3 enhancement)

**Gap:** When the AI books a tour, that should appear in the owner's calendar. Currently unclear if the AI's tour-bookings flow into `/calendar` (yesterday's walk #5 showed empty calendar). Cross-area integration uncertain.

**Enhancement:** Verify and surface: AI-booked tours appear on the owner's calendar with a "📞 AI-booked" badge. From the calendar event, owner can drill into the originating Leasing conversation. Stitches Leasing + Calendar.

**Impact:** Owner doesn't have to context-switch to know about tours coming up.

---

### LP-A8 — "Pause AI for this property" affordance (P3 enhancement)

**Gap:** Sometimes owners need to pause leasing on a building (mid-renovation, unit reserved, etc). Currently unclear how to do this — would have to dig into Settings or the property config.

**Enhancement:** Per-building toggle on the Owner Dashboard: "Pause AI for 532 Neptune Ave" with a reason selector (under renovation / unit reserved / temporary hold / other). When paused, AI auto-replies "We're temporarily not accepting inquiries on this property — please check back in [date]." Resume on a click.

**Impact:** Common owner workflow. Currently absent or buried.

---

## Phase 5 stub drafts (canonical format, ready for SLICES-speed.md)

```markdown
### `phase-0-followup-leasing-todays-usage-card-relocation` (P2)
- **Status:** Phase 5 backlog
- **Background:** `/leasing` landing page surfaces a "Today's Usage" card showing tier-quota metering (X/25 msgs, 0 sent | 0 received, resets-in countdown). For the owner persona doing a weekly pulse-check, this is product-tier billing noise on a business-performance surface. Surfaced 2026-05-05 during Phase 0 walk #7 with owner persona lens.
- **Discovery instructions:** Read `src/app/(dashboard)/leasing/page.tsx` to find the "Today's Usage" component. Check if it conditionally renders based on tier or always renders. Decide: move to Settings → Billing, or collapse to a footer one-liner, or render only when nearing the cap (>80%).
- **Hypotheses to confirm/refute:** (a) component was added during initial leasing-limits implementation as visible reassurance for tier-aware product mgmt; (b) target audience for this card is the operator/admin, not the owner persona — needs persona-aware rendering.
- **Why deferred:** Phase 0 finding (P2) — Phase 1 work. Pure UX move; no data layer change.
- **Required input before slicing:** Decide between three options above. Default lean: relocate to Settings → Plan limits with a small "X% of daily quota used" footer line on /leasing.
- **Affected surfaces:** `src/app/(dashboard)/leasing/page.tsx` (remove or collapse), possibly `src/app/(dashboard)/settings/billing/page.tsx` (add tier-quota detail), possibly a new shared component for the footer line.
- **Out of scope:** Tier-quota enforcement logic in `lib/leasing-limits.ts` (separate concern); plan-tier display in upgrade flow.
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #7 (`docs/handoff/speed-2026-q2-leasing-audit-2026-05-05.md`, finding LP-5).

### `phase-0-followup-leasing-notification-banner-copy-rewrite` (P2)
- **Status:** Phase 5 backlog
- **Background:** Notification banner on `/leasing` reads "Get instant alerts when your AI needs help. [Enable notifications] [Not now]". For owner persona, "your AI needs help" implies the AI is struggling, undermining the value prop of "AI handles lease-up for you." Better framing: "Get instant alerts when an escalation requires your input." Surfaced 2026-05-05 during Phase 0 walk #7 (owner persona lens).
- **Discovery instructions:** Find the notification banner component. Likely in `src/app/(dashboard)/leasing/page.tsx` or a shared notifications component. Verify copy is hardcoded vs. config-driven. If config-driven, update the config; if hardcoded, refactor to a string constant + update.
- **Hypotheses to confirm/refute:** (a) copy was written for broker persona during MVP and never updated for owner; (b) copy is shared across personas and needs persona-aware variants.
- **Why deferred:** Phase 0 finding (P2) — Phase 1 work. Pure copy change.
- **Required input before slicing:** Confirm the new copy lands well — propose 3 variants and pick one. Default: "Get instant alerts when an escalation requires your input."
- **Affected surfaces:** `src/app/(dashboard)/leasing/page.tsx` (or wherever the banner lives), possibly i18n strings file if one exists.
- **Out of scope:** Notification toggle behavior, push-notification subscription flow.
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #7 (`docs/handoff/speed-2026-q2-leasing-audit-2026-05-05.md`, finding LP-6).
```

(8 enhancements LP-A1 through LP-A8 will be filed in `## Phase 1 enhancement candidates` section using the canonical schema established in PR #65. Each entry includes Persona, JTBD, Current friction, Proposed enhancement, Impact, Effort, Filed.)

---

## Out of scope (deferred — different JTBD or owner-onboarding scan)

- `/leasing/setup` (owner-onboarding wizard — different JTBD: "I just bought VettdRE Leasing for my building. How do I get started?")
- `/leasing/[configId]/knowledge` (FAQ/competitor intel editor — owner-config flow)
- `/leasing/[configId]/team` (agent assignment + cadences — operations setup)
- `/leasing/[configId]/web-chat` (web chat embed config)
- `/leasing/referral` (referral program — different JTBD: "I'm an owner, I want to refer another owner")
- `/leasing/upgrade/success` (post-upgrade landing)
- `/leasing/import` (bulk unit CSV upload)
- `/leasing/benchmarks` (mentioned in CLAUDE.md but not visible in landing nav)
- AI conversation handling itself (separate technical walk — Phase 0.5 territory)
- Mobile responsive (Chrome MCP limitation)
- RBAC walks for property-manager role (separate role from owner)

A second Leasing walk with the **owner-onboarding JTBD** ("just bought the product, how do I set it up for my building?") would cover the 5 config sub-pages. Worth scheduling after the Phase 0.5 broker workflow walk.

---

## Methodology v2.3 retro candidates (additions from this walk)

1. **Persona-area mismatch is its own finding category.** This walk surfaced a fundamental design mismatch: the /leasing area was BUILT as a broker-style inbox but is SOLD to owners. Almost every defect and most enhancements trace to this mismatch. Methodology v2.3 should explicitly call out: "during persona walks, look for cases where the page assumes a different persona than the buying customer is."

2. **Enhancement density correlates with persona-mismatch severity.** Walk #6 (Messages, broker persona on a broker-built tool) surfaced 5 enhancements in a healthy area. Walk #7 (Leasing, owner persona on a broker-built tool) surfaced 8 enhancements in a less-aligned area. The delta is a useful signal: more enhancements = more mismatch. Tracking this metric across Phase 0 walks would help prioritize which areas need the most product-design work in Phase 1.

3. **Cross-area enhancements continue to emerge** (LP-A7: Leasing escalations → Calendar). Worth bookmarking for Phase 0.5 cross-area persona walks.

4. **Owner-persona walks should pair with Owner-onboarding walks.** Today's walk covered "owner doing a weekly pulse-check" JTBD. The 5 deferred sub-pages are owner-onboarding surfaces — they need their own walk with the "owner setting up the product" JTBD. Methodology v2.3 should formalize: per-persona walks may need multiple JTBD passes to cover the full surface.
