# VettdRE Audit Roadmap — 2026 Q2 → Q4 (Working Hypothesis)

**Status:** working hypothesis, not commitment. Updates after each audit closes based on what we learn. Re-anchor after Foundation audit ships (~mid-Q2).
**Methodology:** `docs/methodology/slice-based-audit.md` (v2.2)
**Owner:** Nathan
**Last updated:** 2026-05-03

---

## Goal

Bring BMS-Overhaul-level intensity to every area of VettdRE. Each area gets a dedicated audit covering functional + UX + perf + a11y + RBAC + security in one vertical pass — not horizontal "speed audit then UX audit then a11y audit." 8-9 audits over the next 4-6 months after Foundation ships.

**Why area-first instead of dimension-first:**

Dimension-first means revisiting every area N times. Each visit reloads context, re-walks the surface, re-coordinates with the same UI. Area-first lets you ship every dimension's improvements together while context is loaded. BMS proved this scales: 30+ slices in 3 weeks shipped functional fixes (slice 22 vault override, slice 21 rental Value), UI fixes (typography refresh, sidebar restructure, emoji→lucide), perf-adjacent fixes (.gcloudignore), and infrastructure (Phase Z setup) — all under one audit umbrella.

The exception is **Foundation** (the audit currently called "speed audit"). It's dimension-first — perf + infrastructure across all areas — because the infrastructure it builds is shared by every subsequent area audit.

---

## The sequence

| # | Audit | Theme | Est | Why this position |
|---|-------|-------|-----|-------------------|
| 0 | Foundation (Speed Audit) | Infra + perf | 4-6 wk | Builds CI, playwright, Sentry, Asana, baselines that all subsequent audits use. Ships speed wins as a side effect. |
| 1 | Onboarding | Full vertical | 3-4 wk | BMS-adjacent. Fixes the as_org-write family from B-019 (`22-followup-as-org-onboarding-create`). Highest Gulino traffic outside BMS. |
| 2 | Calendar | Full vertical | 3-4 wk | Showings flow is highly visible. 1900-line `calendar-view.tsx` carries technical debt. Mobile responsive gap (per MOBILE_SPEC.md). |
| 3 | Messages | Full vertical | 4-5 wk | Gmail integration is complex (sync, threading, AI parsing). Larger than typical area; might split. |
| 4 | Market Intel | Full vertical | 4-5 wk | Heavy data: 17 NYC API calls, building profiles, map search, fusion engine. Performance + UX both critical. Map mobile is bad. |
| 5 | CRM Core (Properties + Pipeline + Contacts) | Full vertical | 4-5 wk | Combine because shared infrastructure (deal lifecycle, contact lookup, enrichment). Splitting creates artificial seams. |
| 6 | Underwriting | Full vertical | 3-4 wk | 15+ sub-pages but lower live traffic. Specialized; can wait. |
| 7 | Terminal | Full vertical | 2-3 wk | Newer feature, smaller surface, well-documented. Probably less debt. Already had perf work (memory: terminal real-time). |
| 8 | Leasing | Full vertical | 3-4 wk | Newer feature. AI-heavy (Claude integration, gws tools). Multi-channel (SMS/voice/email/web). |
| 9 | Settings | Full vertical | 2-3 wk | 17+ sub-pages but mostly thin. Last because it's touched by every other audit. |

**Total estimate:** ~30-40 weeks sequential, ~16-24 weeks with cross-area parallelism (2-3 audits in flight at peak).

---

## Per-audit summary (working hypotheses)

These are starting hypotheses for what each audit will contain. Phase 0 swarm of each audit will refine into actual slice lists. Don't treat as commitments.

### Foundation (Speed Audit)
**Phase Z slices already specified in `docs/handoff/site-wide-speed-audit-2026-05-02.md`:**
Z.0a GH Actions CI · Z.0b Playwright harness · Z.1 Bundle analyzer · Z.2 Lighthouse CI · Z.3 Prisma slow query log · Z.4 Sentry Performance · Z.5 Cold start measurement · Z.6 Asana board.
**Phase 0 swarm prompt** (to be widened before run): captures perf metrics + functional defects + UX issues + a11y violations + RBAC gaps in one pass per area. Output feeds both this audit's Phase 1 (perf fixes) and the per-area audits' starting bug-lists.
**Phase 1+:** TBD after synthesis. Likely: top 10-15 quick perf wins + 1 cross-cutting infra slice.

### Onboarding
**Likely scope:** finish the `as_org` write surface (B-019 family), iPad real-finger validation deferred from BMS Item 6, full client signing flow audit (auto-checked checkboxes still right? prefill display correct on all templates? signature pad works on Android?), template management (vault editor cross-page move from `19-B2a-followup-cross-page-move`), invite delivery resilience (SMS + email retry, dead-letter handling), document export quality (PDF generation perf + correctness), super_admin cross-tenant write semantics (legal/product clarification needed first per B-019).

### Calendar
**Likely scope:** decompose the 1900-line `calendar-view.tsx`. Mobile responsive layouts (4 views × multiple breakpoints). Google Calendar sync resilience (token refresh races, deletion edge cases). Showing slot booking UX. Recurring events (currently no support). Time-zone handling. Performance on accounts with 1000+ events.

### Messages
**Likely scope:** Gmail sync efficiency (currently runs every 60s; throttle vs push?). Thread grouping accuracy. AI email parsing quality + rate limit (`AI_PARSE_MAX_PER_HOUR`). Snooze + follow-up reminder reliability. Bulk action correctness vs Gmail (label sync, delete sync). Compose UX (template merge, attachments). Mobile responsive for thread list + compose.

### Market Intel
**Likely scope:** 17 NYC API failure modes + retry + cache eviction (BuildingCache invalidation logic). Map performance with 100+ markers. Map mobile UX. Building Profile slide-over performance (currently 3-phase progressive; fast enough?). Data Fusion Engine error paths. Contact directory ranking + Apollo enrichment correctness. Speculation Watch List freshness. Distress score formula validation.

### CRM Core (Properties + Pipeline + Contacts)
**Likely scope:** Properties unified hub (currently aggregates 4 sources; rough). Pipeline drag-and-drop perf with 100+ deals. Contact dossier 5-tab usability. Enrichment pipeline correctness (PDL + Apollo + PLUTO merge logic). Lead scoring threshold tuning per contact type. Custom pipeline stages (currently fixed). Bulk operations (mass email, mass tag, mass status change).

### Underwriting
**Likely scope:** 15+ sub-pages walk-through, IRR/DCF math correctness on edge cases, AI assumptions quality, NYC-specific calculators (transfer tax, mansion tax, MRT) verification against current law, LL97 penalty refresh, RGB rate refresh, document generation (LOI / BOV / investment summary) PDF quality, T-12 parsing accuracy, comparable sales scoring.

### Terminal
**Likely scope:** AI brief generation latency (memory: project_terminal_realtime — already flagged). Watchlist alerts + push notifications (Phase 3). 7-dataset polling reliability. ACRIS 3-table join correctness. Backfill end-to-end test. Right panel BuildingProfile reuse correctness. Keyboard navigation completeness.

### Leasing
**Likely scope:** Conversation engine intent detection accuracy. Multi-channel handoff (SMS → email continuity). Tour booking calendar integration (gws tools). ILS parser quality (StreetEasy/Apartments/Zillow formats). Follow-up cadence engine reliability. Tier limits + upgrade UX. A/B testing framework correctness.

### Settings
**Likely scope:** 17+ pages, mostly thin. RBAC enforcement audit on every settings mutation. Form validation consistency. Save-state UX. Admin pages (users, teams, terminal health) at scale. Branding settings (logo upload, color picker reliability).

---

## Cross-area parallelism strategy

Methodology v2.2 bans parallel slices WITHIN one audit (the late-April BMS P0). Cross-AUDIT parallelism is allowed because area boundaries are mostly disjoint code paths.

**Recommended max:** 2 audits actively shipping slices at any time. 3 only if one is in Phase 0 (read-only) while another is in Phase 1+ (write).

**Coordination overhead:** Asana board needs per-audit columns. Daily check-in covers both audits. Single end-of-week phase-gate review across all in-flight audits. Reviewer (Nathan) doesn't context-switch within a working day — alternate days per audit if both demand attention.

**Hard rule:** if both audits would touch the same file (e.g. shared lib/, middleware, schema), serialize them. Don't optimize the schedule by gambling on no-conflict.

---

## Timeline scenarios

**Aggressive (2-3 audits in flight at peak):** ~16-20 weeks total = ~4-5 months. Foundation ships ~week 4-6, then 2-3 area audits running in waves. Last audit closes ~end of Q3.

**Steady (1-2 audits in flight, generous Phase 0 windows):** ~24-30 weeks total = ~6-8 months. Foundation ships ~week 6, then sequential area audits with 2-week breaks. Last audit closes ~end of Q4.

**Conservative (1 audit at a time, no parallelism):** ~36-44 weeks = ~9-11 months. Foundation ships ~week 6, every area audit fully sequenced. Last audit closes ~Q1 2027.

**Recommendation:** target steady. Aggressive risks methodology integrity (parallel coordination overhead grows fast). Conservative leaves too much value on the table.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Foundation audit reveals a P0 bug (e.g. data-corruption from a slow query) that demands immediate fix | Medium | Pauses Foundation Phase 1 to ship hot-fix | Methodology v2.2 hot-fix-slice pattern handles this |
| Area audits surface bugs that compound (Calendar + Messages share notification system; fix in Calendar breaks Messages) | High | Cross-audit conflicts | Hard rule about no-shared-file parallelism |
| Gulino reports P0 mid-roadmap | Medium | Audit pause for hot-fix | Treat as a normal slice off main; methodology supports this |
| New tenant onboards mid-roadmap and finds bugs not in Gulino's surface | Medium | Backlog grows faster than fix rate | Phase 5 stub triage discipline |
| Stakeholder request for new feature mid-roadmap | High | Sprint disruption | New features pause an audit's Phase 1+ work, never Phase Z infra. ADR captures the deferral. |
| Methodology evolves and forces re-baseline | Medium | Slows audits temporarily | Document v2.X bumps; require explicit re-anchor at every phase gate |
| AI agent capability changes during roadmap (better models, swarm orchestration) | High (positive) | Faster execution if managed | Re-evaluate parallelism + Phase 0 swarm scale at every quarterly review |
| Burnout / context-switch fatigue on Nathan-side review | High | Roadmap slips | Hard rule: max 1 working day on any single audit per week to keep mental freshness; defer if needed |

---

## What forces a roadmap update

- End of every audit (closeout retrospective): re-evaluate next 2 audits' scope based on what we learned
- New tenant onboards: re-prioritize sequencing based on their use patterns
- P0 incident: defer audit work, re-plan after recovery
- Major feature ship (e.g. AI Leasing v2): may insert a new audit or re-scope existing ones
- Methodology bump (e.g. v2.3): may change parallelism rules or audit shape

This roadmap is rewritten at the end of every audit cycle. Don't treat any specific date as load-bearing.

---

## Out of scope (not on this roadmap)

- New product surfaces (e.g. mobile native app, new tenant-onboarding flow). Roadmap is for EXISTING areas only. New surfaces get their own pre-launch audit.
- Architecture-level changes (e.g. multi-region deploy, replacing Supabase with X). Those are ADRs + epic projects, not audits.
- Compliance audits (SOC 2, GDPR, etc.). Those are external-driven and outside the methodology framework.
- Marketing site / landing pages. Different concern.

---

## Open questions to resolve before audit #1 starts

1. **Headcount:** is this a solo Nathan-with-Claude-Code roadmap or do other engineers join? Affects parallelism strategy.
2. **Stakeholder cadence:** Gulino-owner sync frequency during area audits? Other clients onboard during the roadmap?
3. **Definition of "BMS-level intensity":** is the goal slice-volume parity (~30 slices per audit) or quality parity (every dimension covered, regardless of slice count)? Quality parity is correct; slice count varies by area complexity.
4. **Pre-emptive product decisions:** the as_org-cross-tenant-write semantics need legal/product clarification (per B-019 / `22-followup-as-org-onboarding-create`). Clarify BEFORE Onboarding audit starts so the slice scope is unambiguous.
5. **Methodology evolution between audits:** if Foundation audit retro surfaces a v2.3 bump, does it apply to in-flight area audits or only future ones? Default: future-only to avoid mid-audit churn.

---

## Right now

Foundation audit kicking off. First slice = methodology-tracking (`bms-audit-closeout-followup-methodology-tracking`). After that ships, Foundation Phase Z proceeds (Z.0a → Z.0b → Z.1 → ... → Z.6). Foundation Phase 0 swarm runs with widened theme. Phase 1+ scope defined post-synthesis.

This roadmap doc is a planning artifact, not a contract. Read it at the start of every audit to remember where you are. Update it at the end of every audit closeout. If anyone (including you) wants to deviate from it, that's fine — just update the doc.
