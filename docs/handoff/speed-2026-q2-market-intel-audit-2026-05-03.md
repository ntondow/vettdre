# Foundation/Speed Audit Q2 2026 — Market Intel Phase 0 Audit

**Audit:** Foundation/Speed Audit Q2 2026
**Phase:** 0 (Discovery)
**Mode:** VERTICAL SLICE (perf + functional + UX + a11y + RBAC in one walkthrough)
**Area:** Market Intel
**Walkthrough date:** 2026-05-03
**Walked by:** Cowork session via Chrome MCP (Nathan's "I drive" decision after spawned Claude Code session lacked Chrome MCP wiring)
**Auth:** super_admin (nathan@ntrec.co), production app at `https://app.vettdre.com`
**Read-only:** captured findings only; no code changes

---

## Methodology + scope

- Sample-based, not exhaustive. Walked top surfaces with representative inputs.
- Performance metrics captured via Chrome DevTools `performance.getEntriesByType()` calls executed in browser console (no Lighthouse run; no DevTools Performance panel recording).
- Sentry Performance dashboard not consulted (access not verified during walk).
- axe-core not run inline (would require browser extension install in walk-driving Chrome session).
- Mobile breakpoint NOT walked (time budget — defer to follow-up).
- Cross-tenant test (`?as_org=`) NOT completed because the building profile path crashed (P0 finding F-2.1 below); cross-tenant retest pending profile fix.
- Production-served Turbopack build is what Cloud Run delivers (vs. Z.1's webpack-bundled baselines).

**Surfaces walked (5 of 7 planned):**

| # | Surface | URL | Outcome |
|---|---------|-----|---------|
| 1 | Market Intel landing (Map tab default) | `/market-intel` | walked; perf metrics captured |
| 2 | Search tab — unified auto-detecting search | `/market-intel?tab=search` | walked; query for "350 Park Ave" |
| 3 | Building profile via search result Full Profile button | clicked from Search results | **CRASHED — P0** |
| 4 | Map re-load after profile crash | `/market-intel` | walked; map reloaded with 1937 properties |
| 5 | Map marker click to open profile | (not attempted — same code path as F-2.1) | DEFERRED |
| 6 | Prospecting save flow | (not reached — depends on profile opening) | BLOCKED by F-2.1 |
| 7 | Cross-tenant `?as_org=` prospecting save | (not reached — depends on F-6) | BLOCKED |
| 8 | Unauthenticated access test | (not walked — time budget) | DEFERRED |

---

## Findings by surface

### Surface 1 — Market Intel landing (Map tab default)

**URL:** `https://app.vettdre.com/market-intel`
**Component:** `src/app/(dashboard)/market-intel/page.tsx` + `map-search.tsx` + Leaflet

#### F-1.1 — TTFB 3.9s (P0, perf)
- **Captured:** `responseStart - startTime = 3,893 ms` via `performance.getEntriesByType("navigation")`.
- **Threshold:** Web Vitals "good" is < 800ms; "poor" is > 1,800ms. We're 5× over poor.
- **Suspected cause(s):** Cloud Run cold start (Z.5 baseline pending), heavy SSR work for the Market Intel route, or middleware-level work. NEXT_PUBLIC env var inlining was confirmed by Z.4 for Sentry — no related issue.
- **Cross-reference:** Z.5 cold-start baselining will quantify how much is cold-start vs steady-state. Repeat walk after Cloud Scheduler keepalive lands.

#### F-1.2 — FCP 9.5s (P0, perf)
- **Captured:** First Paint = First Contentful Paint = 9,460 ms.
- **Threshold:** Web Vitals "good" is < 1.8s; "poor" is > 3.0s. We're 5× over poor.
- **Suspected cause(s):** TTFB (3.9s) + heavy client-side hydration including Leaflet map init = ~5.5s of client work after server response.
- **Reference:** Z.1 baselines list `/market-intel` page chunk at 31.1 kB gz / 135 kB parsed — second-heaviest priority route. Top candidate for code-split + Leaflet dynamic-import (per CLAUDE.md, Leaflet is supposedly already dynamic-imported with `circleMarker` for perf — verify and optimize further).

#### F-1.3 — Map "Loading map..." for ~14-16s after page paint (P1, perf + UX)
- **Captured:** First visit map showed "Loading map..." for 6+8s = 14s. Second visit ~16s. Consistent.
- **User impact:** user sees blank-ish page for full 14-16s before primary visual content (the map) is interactive.
- **Suspected cause(s):** sequential dependency chain — page load → Leaflet init → tile fetch → bbox query → 1947 marker render. Possibly progressive marker render would reduce perceived blank time.

#### F-1.4 — `manifest.json` redirects to `/login` (P1, RBAC misconfiguration / functional)
- **Captured:** Network log shows `GET /manifest.json` returns 200 (line 19) but a follow-up `GET /login?redirect=%2Fmanifest.json` is also fired (line 20, status `pending`), suggesting middleware is auth-gating the manifest. Per PWA spec, `manifest.json` should be unauthenticated.
- **User impact:** PWA "Add to home screen" likely broken on logged-out users; service worker registration may also be affected.
- **Likely root cause:** `lib/supabase/middleware.ts` public-routes OR-chain doesn't include `/manifest.json`, `/icon-*.png`, `/favicon.ico`. Add them.
- **Severity rationale:** P1 not P0 because PWA install-prompt is not core flow. But it's an easy 1-line fix and global impact.

#### F-1.5 — 89 resources loaded on first paint + RSC over-prefetch on sidebar nav (P2, perf)
- **Captured:** `performance.getEntriesByType("resource").length === 89`. Network log shows 12+ `_rsc=z6pw7` GET requests for sidebar nav routes (`/settings`, `/screening`, `/terminal`, `/leasing`, `/deals`, `/properties`, `/contacts`, `/calendar`, `/messages`, `/brokerage`, `/dashboard`).
- **Note:** Next.js RSC auto-prefetches visible Link components on hover OR initial render. For sidebar with 11 nav items, that's 11 unnecessary RSC requests on every page load.
- **Phase 1 candidate:** disable RSC prefetch on tertiary nav (sidebar Link prop `prefetch={false}` or app-wide config).

#### F-1.6 — Console clean of VettdRE errors (PASS)
- All 57 console messages on landing are MetaMask extension noise (`chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/lockdown-install.js`).
- **Implicit Z.4 verification:** the previously-observed `Invalid Sentry Dsn: $NEXT_PUBLIC_SENTRY_DSN` from earlier session is GONE post-Z.4 deploy. Z.4's DSN literal hardcode in next.config.ts works in prod. **Close `z4-followup-verify-prod-dsn-inlining` stub** when this audit's findings ship.

#### F-1.7 — Functional: map renders 1947 properties (PASS, slow)
- Default filter "No public housing" applied (1 filter chip visible). 1947 properties · 1947 in view; markers color-coded by unit count (1-9 / 10-19 / 20-49 / 50+). Tri-state region toggle exists (NYC / NY State / New Jersey).
- Repeat visit showed 1937 properties (slight count difference, possibly bbox state or freshness — within noise).

#### F-1.8 — Tab structure differs from kickoff assumption (info)
- Kickoff assumed 4 search modes (Property / Ownership / Name / Map). Reality: 3 tabs (**Map / Search / Listings**). The "search modes" are unified into the Search tab via auto-detection.
- **Action:** update `CLAUDE.md` Market Intel section to reflect 3-tab structure with unified Search.

---

### Surface 2 — Search tab (unified auto-detecting search)

**URL:** `https://app.vettdre.com/market-intel?tab=search`
**Component:** `src/app/(dashboard)/market-intel/market-intel-search.tsx` (best guess from CLAUDE.md)

#### F-2.0 — Stat tiles render only on Search tab (info)
- Top of page shows 4 stat tiles (Saved Properties, Active Deals, Prospecting, Contacts) on Search tab but NOT on Map tab. Inconsistent — either tiles should always show or never show. Not severity-relevant; UX consistency note.

#### F-2.1 — **Building profile crashes with React error #31 (P0, functional + perf BLOCKER)**

**HEADLINE FINDING.**

- **Repro:** From Search tab, search "350 Park Ave" → 2 results (350 PARK AVENUE BBL 1-01287-0033 + 350 PARK AVENUE SOUTH BBL 1-00855-0020) → click "Full Profile" button on the first card.
- **Result:** Page-level error boundary triggered. UI shows "Something went wrong / An unexpected error occurred. Our team has been notified and is looking into it. / Try again" with an empty layout. The slide-over modal does NOT open; the entire route bombs.
- **Console error:** `Error: Minified React error #31; visit https://react.dev/errors/31?args[]=object%20with%20keys%20%7B%24%24typeof%2C%20render%2C%20displayName%7D` — meaning **"Objects are not valid as a React child (found: object with keys {$$typeof, render, displayName})"**. Root cause: a React forwardRef/lazy component is being rendered as an element (treated like JSX) instead of being used as a component. Likely a misuse of `React.lazy()` or an import-style mismatch (`import Foo from` vs `import { Foo } from`).
- **Suspected files:** `building-profile.tsx`, `building-profile-modal.tsx`, or one of the dynamic imports inside the building profile slide-over (`market-intel/building-profile-actions.ts` per CLAUDE.md). The `f6007b3e8a455ef7.js` chunk is where the throw originates.
- **User impact:** **Building profile is the second-most-critical Market Intel surface** (after the map itself). Users CANNOT view full property details from search results. This blocks the core "find building → identify owner" workflow. Probably affects map-marker-click path too (same component).
- **Cross-area implication:** if this same component is reused (e.g. Terminal right panel reuses BuildingProfile per CLAUDE.md), Terminal may also be broken. **Phase 0 Terminal walk should treat this as a known-blocker risk.**
- **Severity:** **P0** — production user flow is dead.
- **Recommended Phase 1 priority:** SLICE 1 of speed audit Phase 1+ (or a hot-fix slice if this is recent).

#### F-2.2 — Search auto-detect works + returns results in ~8s (PASS, slow)
- Typed/clicked address chip "350 Park Ave" → input populated, "Address" type badge appeared on right side of input. Clicked Search button → results rendered ~8 seconds later: 2 properties found.
- 8-second search latency is high but acceptable given multi-API query path (PLUTO + ACRIS owner lookup + BBL geocoding).
- Sort dropdown (Units) + result count ("2 properties") render cleanly.

#### F-2.3 — Quick-chip UX: clicks fill input but DO NOT auto-submit (P2, UX)
- Clicked "Address: 350 Park Ave" chip → input filled with "350 Park Ave" + auto-detect badge appeared. But search did NOT auto-execute.
- User must then click the Search button. Two-step interaction where one would suffice.
- **Recommendation:** Either (a) chip auto-submits, OR (b) chip label changes to "Try: 350 Park Ave" to set expectation.

#### F-2.4 — Result cards render rich PLUTO data (PASS)
- Each result card showed: address, ZIP, BBL, building class code (O4 / K4), units (—), floors, year, sq ft, assessed value, zoning, owner. The "11.6 unused FAR (3.4 / 15.0)" line on 350 Park Avenue South is a particularly nice signal for development-curious users.

---

### Surfaces 3-7 — DEFERRED / BLOCKED

- **Building profile via map marker click:** same code path as F-2.1, expected same React #31 crash. Skipping to avoid duplicate finding.
- **Prospecting save flow:** depends on building profile opening. Blocked.
- **Cross-tenant `?as_org=` prospecting save:** blocked behind prior dependencies.
- **Unauthenticated access test:** time budget — captured F-1.4 (manifest auth-gating) as a related finding; full logout+access test deferred.
- **Mobile breakpoint walk:** time budget — defer to mobile-specific follow-up.
- **axe-core scan:** defer to a tool-equipped follow-up walk (chrome-mcp doesn't have axe-core integration).

---

## Top 5 issues by impact

1. **F-2.1 — Building profile crashes with React #31 (P0, functional).** Production-blocking on Market Intel's core workflow. Likely affects Terminal right panel too. **Recommended for Phase 1 slice 1 OR hot-fix slice.**
2. **F-1.2 — FCP 9.5s on `/market-intel` first load (P0, perf).** 5× over Web Vitals "poor" threshold. Likely TTFB-dominated.
3. **F-1.1 — TTFB 3.9s (P0, perf).** Substantial Cloud Run cold-start + SSR work; quantify after Z.5 baseline.
4. **F-1.3 — Map "Loading" for 14-16s (P1, perf + UX).** Sequential dependency chain; perceived blank-page time. Tile fetch + 1947 marker render in series.
5. **F-1.4 — `manifest.json` auth-gated (P1, RBAC misconfig).** PWA install + service worker likely broken. Easy 1-line fix in middleware.

---

## Cross-area patterns observed

- **TTFB ~4s on first load** is suspected site-wide if cold-start dominated. Other Phase 0 area walks should capture TTFB to confirm pattern. If pattern holds, Z.5 cold-start baseline + Phase 1 keepalive becomes high-leverage cross-cutting work.
- **`manifest.json` auth-gating** is a global middleware bug. Affects every route, not just Market Intel. **Single Phase 1 fix solves it everywhere.**
- **Heavy initial JS load on heavy routes** (Market Intel: 89 resources, 9.5s FCP). Other heavy-data routes (Terminal feed, Deal Modeler, Calendar 1900-line component) likely show similar patterns.
- **RSC sidebar prefetch** is over-eager: 11 nav items = 11 unnecessary RSC fetches on every page load. **Single Phase 1 fix benefits all dashboard pages.**
- **React error #31 in BuildingProfile** is suspected to surface in Terminal too (per CLAUDE.md, Terminal right panel reuses Market Intel's BuildingProfile via dynamic import). Phase 0 Terminal walk should anticipate. The component may have been broken in a recent refactor on a path Phase Z's CI didn't exercise.

---

## v2.3 methodology candidates from this walk

- **Phase 0 vertical-slice walks need an "abort condition" guidance.** When a P0 surfaces mid-walk (like F-2.1), the right action is record-and-continue-where-possible, not exhaust the full surface list. The current swarm prompt template doesn't say so explicitly.
- **CLAUDE.md staleness check.** This walk found CLAUDE.md describes 4 search modes when reality is 3 tabs + unified auto-detect. Phase 0 walks should default to recording any CLAUDE.md drift they observe; methodology v2.3 should probably make this explicit.

---

## Surfaces blocked from full audit

- **F-2.1's React #31 crash blocks** the entire building-profile + prospecting + cross-tenant test path. Re-walk these after Phase 1 fix lands.
- **Sentry Performance dashboard access** not verified during walk — server-timing p50/p95 data captured was indirect (via DevTools Network tab timing only).
- **axe-core scan** not run.
- **Mobile breakpoint** not walked.
- **Unauthenticated access test** not completed.

These collectively are ~30% of the original kickoff scope. File `phase-0-followup-market-intel-rewalk` for after F-2.1 ships.

---

## Audit doc disposition

- File: `docs/handoff/speed-2026-q2-market-intel-audit-2026-05-03.md`
- Branch: this doc lands on a chore-slice branch alongside Terminal + Underwriting audits when those complete.
- Synthesis: this doc + Terminal + Underwriting audits feed the Phase 0 synthesis slice; that slice produces the master ranked list and Phase 1 scope recommendation.
