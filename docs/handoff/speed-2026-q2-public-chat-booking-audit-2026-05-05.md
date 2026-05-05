# Foundation Audit — Phase 0 walk #10: Public chat + booking (prospect/tenant persona)

**Date:** 2026-05-05 (afternoon, after walk #9 Onboarding)
**Walked by:** Cowork session (Chrome MCP, app.vettdre.com)
**Build/deploy snapshot:** post-`540d05d3`; main HEAD `ea2b92f`
**Mode:** vertical-slice + persona/enhancement lens (fifth walk applying it)
**Persona:** Prospect / tenant — **first non-internal-user persona walked.** A person who saw a unit on a building's marketing site or Streeteasy ad and clicked "schedule a tour" or "ask a question."
**JTBD:** *"I saw a unit. I want to ask a quick question or book a tour. Don't make me create an account, fill 30 fields, or wait for a callback."*
**Scope:** `/chat/[configSlug]` (AI Leasing Agent web chat widget, hosted, public/no-auth) + `/book/[slug]` (public showing booking, no-auth) + `/leasing-agent` (marketing landing).

---

## Honest constraint notice

**This walk could not exercise the happy path** for either /chat or /book because the Cowork test account doesn't have a valid configSlug or active booking slug. The Test leasing config (62d-old, Cold) appears to have been disabled or expired. I probed with `/chat/test`, `/book/test`, and `/chat` (no slug), capturing the error states.

What this audit covers honestly:
- **Error/edge-case states** for both surfaces (which prospects often hit in the real world — outdated marketing links, expired booking links, typo'd URLs)
- **Site architecture** for the prospect persona (front-door discovery surfaces, public-vs-auth boundaries)
- **Marketing landing page** (/leasing-agent) — though this is owner-targeted, not prospect-targeted

What this audit does NOT cover:
- The actual chat conversation flow with the AI agent (would need a valid configSlug)
- The actual booking flow (slot picking, contact entry, confirmation) — would need a valid booking slug
- Mobile responsive (Chrome MCP limitation)

To complete this walk, recommend either: (a) seed the Cowork test account with an active leasing config + active booking slug; or (b) defer the happy-path walks to Phase 0.5 once test data exists.

---

## Summary

5 defect findings (1 P2, 1 P3, 3 positive) + 4 enhancement opportunities (1 P1, 2 P2, 1 P3). Walk took ~10 min — bounded by what's accessible, not by lack of findings.

**The headline finding is architectural:** **VettdRE has no front-door surface for the prospect persona.** Prospects only reach the product via deep links (a chat configSlug or booking slug provided by an owner/broker through external marketing). There's no "browse available units in NYC" public page, no "find your next apartment" entry point, no SEO surface that captures organic prospect intent. This is a strategic product gap if VettdRE wants to grow the prospect funnel without depending entirely on owner-side marketing.

The error-state UX is clean but **dead-ends prospects** — when a prospect hits an invalid/expired link, they have nowhere to go. No "browse other listings" CTA, no "contact us" fallback, no Sign Up Sign Up funnel. Every dead-end is a lost prospect and (because prospects often share links with friends) a lost referral chain.

No P0/P1 defects.

---

## Method

Vertical-slice + persona Phase 0 walk:
1. Probe `/chat/test` → observe error state for invalid configSlug
2. Probe `/book/test` → observe error state for invalid booking slug
3. Probe `/chat` (no slug) → observe error state for missing slug
4. Probe `/leasing-agent` → understand whether it serves prospect or owner persona
5. Map findings to JTBD: "where would a prospect actually land, and what experience do they get"

No code, no fixes.

---

## Findings (defects)

### P2 — medium impact

**PC-2 / PB-2 — Error states for invalid /chat or /book links dead-end the prospect**
*Severity: P2 · Category: UX / conversion*

Repro:
- Navigate to `/chat/test` (or any unrecognized configSlug) → page reads "**This chat is not available / The property chat may have been disabled or the link is incorrect.**" No CTA, no escape hatch, no fallback link.
- Navigate to `/book/test` (or any unrecognized booking slug) → page reads "**No Available Slots / This showing link has no available time slots or has expired.**" Same dead-end pattern.

For a real prospect who clicked an outdated link from a marketing email, expired Streeteasy listing, or shared from a friend, this is a conversion-killer. They came WANTING to book a tour or ask a question; the surface tells them "no" and gives them nowhere to go.

Defer-friendly fixes: (a) add "Browse other available units →" CTA pointing to a fallback property listing surface (assuming one exists or gets built per PC-A1 below); (b) add "Contact us at [phone]" or "Email [address]" fallback for outright dead-ends; (c) for /chat specifically, fall back to a generic "We'd love to hear from you — leave a message" form that routes to the brokerage's general inbox.

---

### P3 — low impact

**PC-4 — Inconsistent error handling between /chat (no slug) and /chat/[invalid slug].**
- `/chat` (no slug) → bare default Next.js 404 page ("404 / This page could not be found.") — terse, no branding
- `/chat/[invalid slug]` → custom styled "This chat is not available" page

The custom page is correct. The 404 default for the no-slug case is a polish gap — should redirect to /leasing-agent or /vettdre.com homepage instead.

---

### Positive observations

**PC-1 — Custom error page for invalid configSlug is clean and accurate.** "This chat is not available / The property chat may have been disabled or the link is incorrect." Doesn't expose internals. Doesn't reveal whether a slug exists (good for security — don't leak that "real" slugs return different errors than "fake" slugs).

**PB-1 — Custom error page for invalid booking slug is friendly.** House emoji, clear copy ("No Available Slots / This showing link has no available time slots or has expired"). Doesn't expose internals.

**PB-3 — Both error pages render responsive + clean layout.** Even in the dead-end state, the page doesn't look broken — just empty.

---

## Enhancement opportunities (persona: Prospect / tenant · JTBD: ask a question or book a tour without friction)

### PC-A1 — Build a prospect "front door" surface (P1 enhancement, strategic)

**Gap:** VettdRE has no public-facing prospect entry point. The marketing page at /leasing-agent is OWNER-targeted (selling the AI agent product to NYC landlords). Prospects can only reach /chat or /book via deep links provided by an owner/broker. There's no SEO surface, no "Available units in Brooklyn" page, no organic prospect funnel.

**Enhancement:** Build a public listings discovery page at `/listings` or `/units`:
- Map view + list view of all units across all VettdRE-leased buildings
- Filter by neighborhood, BR count, rent, move-in date
- Each unit card → "Schedule a tour" deep-links to /book/[slug]; "Ask a question" deep-links to /chat/[configSlug]
- SEO-optimized metadata per unit + neighborhood landing pages
- Optional: "Find your next apartment in NYC" branded experience

**Impact:** Strategic. Currently VettdRE relies entirely on owner-side marketing to drive prospects. A public front door:
- Captures organic search demand for NYC apartments (massive)
- Cross-sells units across buildings (one prospect for Building A might also be a fit for Building B)
- Reduces dependence on owner-side marketing budgets
- Creates a network effect (more owners → more units → more prospects → more conversions → more owners)

**Caveat:** This is a major product investment, not a quick fix. But it's the highest-leverage enhancement surfaced across all 10 walks.

**Effort:** L (1-3 months — listings index + filters + map + SEO + per-unit detail page; could ship MVP in 4-6 weeks)

---

### PC-A2 — Dead-end fallback CTAs on error states (P2 enhancement)

**Gap:** /chat/[invalid] and /book/[invalid] error states have no escape hatch. Prospects bounce.

**Enhancement:** Add fallback CTAs to both error pages:
- "Browse available units →" (links to /listings — depends on PC-A1)
- "Have a question? Email us at [brokerage email]" (configurable per-org fallback)
- "View other properties from [Brokerage Name]" (links to brokerage's public profile)

**Impact:** Direct prospect-conversion improvement. Even capturing 5% of dead-end prospects is meaningful if any non-trivial volume hits these URLs.

**Effort:** S (3-5 days — copy + CTA + link config — depends on what fallback target exists)

---

### PC-A3 — Embeddable chat widget that lives inline on the building's marketing site (P2 enhancement)

**Gap:** /chat/[configSlug] is a hosted, full-page experience. For prospects already on a building's website, they have to LEAVE the marketing site to chat. Higher friction = lower engagement.

**Enhancement:** Provide an embed script: `<script src="https://app.vettdre.com/embed/chat.js" data-config="[configSlug]"></script>`. Renders a floating chat bubble on the building's site. Click → opens chat widget inline (modal or sidebar). Prospect never leaves the marketing site.

**Impact:** Higher conversion because the prospect doesn't break flow. Standard pattern for chat tools (Intercom, Drift, Crisp). VettdRE Leasing Agent should support this as a deployment option.

**Effort:** M (2-3 weeks — embed script + iframe sandbox + cross-origin postMessage + theming for host site)

---

### PC-A4 — Booking flow without account creation (P3 enhancement)

**Gap:** I couldn't walk the happy booking path due to test data gap, but per CLAUDE.md the /book/[slug] flow is "no auth" — good. Common anti-pattern in booking products is forcing prospect signup before tour confirmation. CLAUDE.md says VettdRE doesn't do this; verify it stays that way.

**Enhancement:** Audit the booking flow once test data exists to confirm: (1) prospect can book without creating an account; (2) confirmation goes via email/SMS only; (3) prospect can reschedule via the same link without signup; (4) "Add to calendar" .ics download works without auth. If any of these break the no-friction principle, that's a finding.

**Effort:** Audit only (3-5 days when test data exists). Fixes scoped per finding.

---

## Phase 5 stub drafts (canonical format, ready for SLICES-speed.md)

```markdown
### `phase-0-followup-public-chat-error-fallback-cta` (P2)
- **Status:** Phase 5 backlog
- **Background:** /chat/[invalid] and /book/[invalid] error pages dead-end the prospect with no fallback CTA. "This chat is not available" / "No Available Slots" — accurate copy but the prospect has nowhere to go. For real prospects clicking outdated marketing links, expired Streeteasy ads, or shared-from-friend links, this is a conversion-killer. Surfaced 2026-05-05 during Phase 0 walk #10 (prospect persona lens).
- **Discovery instructions:** Find the error-state components for `/chat/[configSlug]` and `/book/[slug]`. Likely in `src/app/chat/[configSlug]/page.tsx` and `src/app/book/[slug]/page.tsx`. Identify whether the error states are component-level conditionals or full route handlers. Determine: (a) what fallback target exists for "browse other listings" — currently nothing, would need PC-A1 enhancement; (b) what per-org fallback contact info exists in BrandSettings or org config that could surface in the error state.
- **Hypotheses to confirm/refute:** (a) error states are simple conditional renders — easy to add CTAs; (b) BrandSettings already has fallback contact fields — easy to wire; (c) need a new `OrgFallbackConfig` model.
- **Why deferred:** Phase 0 finding (P2) — Phase 1 work. Bounded fix; no architectural change unless paired with PC-A1 (public listings front door) for the "browse other units" CTA.
- **Required input before slicing:** Decide which fallback CTAs to ship: (a) "Email [org-fallback]" only (cheapest, ships standalone); (b) "Email [org-fallback]" + "Browse other units" (depends on PC-A1 existing); (c) full fallback hierarchy (in-org fallback → vettdre.com listings page → external).
- **Affected surfaces:** `src/app/chat/[configSlug]/page.tsx`, `src/app/book/[slug]/page.tsx`, possibly `prisma/schema.prisma` (new fallback fields on `BrandSettings` or `Organization`), possibly settings UI to configure fallback.
- **Out of scope:** Building the full /listings front door (separate PC-A1 enhancement); SEO-optimizing the error pages.
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #10 (`docs/handoff/speed-2026-q2-public-chat-booking-audit-2026-05-05.md`, finding PC-2/PB-2).

### `phase-0-followup-chat-no-slug-404-redirect` (P3)
- **Status:** Phase 5 backlog
- **Background:** `/chat` (no slug) renders the bare default Next.js 404 page ("404 / This page could not be found.") instead of either redirecting to a marketing page or rendering the custom "chat not available" page used for invalid slugs. Polish inconsistency. Surfaced 2026-05-05 during Phase 0 walk #10.
- **Discovery instructions:** Check whether `src/app/chat/page.tsx` exists (probably doesn't — would explain the 404 default). Decide: (a) add a `chat/page.tsx` that redirects to `/leasing-agent` (marketing) or to `/listings` (PC-A1 front door); (b) add `chat/page.tsx` that renders the same "chat not available" custom page used for invalid slugs.
- **Why deferred:** Phase 0 finding (P3) — pure polish. Pairs naturally with the PC-A2 fallback-CTA work.
- **Affected surfaces:** `src/app/chat/page.tsx` (new file).
- **Filed:** 2026-05-05 by Cowork during Phase 0 walk #10 (finding PC-4).
```

(PC-A1 through PC-A4 are 4 enhancement candidates — will be filed in `## Phase 1 enhancement candidates` section using the canonical schema.)

---

## Out of scope (deferred — pending test data)

- Happy-path walk of `/chat/[validSlug]` (AI conversation, intent detection, tour booking via chat)
- Happy-path walk of `/book/[validSlug]` (slot picking, contact entry, confirmation, .ics download)
- Mobile responsive on both surfaces (Chrome MCP limitation)
- Embedded chat widget (doesn't appear to exist yet — PC-A3 enhancement)
- A/B testing flow visibility on prospect side (handled server-side per `LeasingConfig`)
- Internationalization / non-English prospect support
- ADA / WCAG audit of the public-facing surfaces (separate cross-cut)

---

## Methodology v2.3 retro candidates (additions from this walk)

1. **Persona walks can be blocked by test-data gaps.** This walk hit a hard limit — the Cowork test account doesn't have a valid configSlug or active booking. Methodology v2.3 should formalize a "test-data prerequisites" checklist for persona walks: BEFORE starting a walk, verify the persona's primary surface has live data. If not, either seed it or defer.

2. **Strategic gaps surface in front-door audits.** The "no public listings front door for prospects" finding (PC-A1) is the single largest enhancement surfaced across all 10 walks — and it only became visible by walking from the prospect persona. Methodology v2.3 should ensure every external-facing persona gets at least one walk; internal personas (broker, owner, admin) can't surface front-door findings because they only see authenticated surfaces.

3. **Error states ARE the experience for many users.** Most prospects in the real world will hit /chat/[invalid] or /book/[invalid] sooner or later (clicking outdated links). Methodology v2.3 should treat error-state walks as first-class — not "out of scope" or "edge case." For prospect-persona walks especially, the error state is the most-frequent surface.

4. **The "I can't walk this without test data" pattern is information, not failure.** Documenting what CAN'T be walked is as valuable as documenting what CAN. The constraint itself is a finding (test-data gap). Phase 0.5 persona walks can resume the deferred happy-path walks once test data exists.
