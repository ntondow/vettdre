# Terminal UI Improvements — Handoff Doc

## Goal
Upgrade the VettdRE Terminal from a functional MVP to a polished, Bloomberg-inspired real estate intelligence feed. The current version works but has rough UX edges: BBL-centric headers that mean nothing to casual users, no way to drill into events, no neighborhood context, and a right panel with no close affordance. This batch addresses all of that in one cohesive pass.

## Project
**Repo/folder:** `src/app/(dashboard)/terminal/` and `src/components/`
**Live feature:** Terminal is already deployed and working with the 3-stage pipeline (ingest → enrich → AI briefs). This work is purely frontend UX improvements — no pipeline or backend changes needed except one new server action for web research.

---

## Discovery Instructions for Claude Code

Before writing any code, read these files and propose a plan:

### Must-read files (read fully):
1. `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — Main feed layout, right panel rendering, filter state, event click handlers
2. `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — Card component (what gets displayed per event)
3. `src/app/(dashboard)/terminal/components/terminal-search.tsx` — Search overlay (reference for modal/overlay patterns)
4. `src/app/(dashboard)/terminal/components/watchlist-manager.tsx` — Left sidebar watchlist section
5. `src/app/(dashboard)/terminal/actions.ts` — Server actions (you'll add new ones here)
6. `src/app/(dashboard)/terminal/page.tsx` — Page-level data fetching and prop passing
7. `src/app/(dashboard)/market-intel/building-profile.tsx` — Right panel building profile (understand how it renders)
8. `src/app/(dashboard)/market-intel/components/building-profile/profile-header.tsx` — Current BBL/address display in profile header
9. `src/lib/terminal-enrichment.ts` — Enrichment package shape (what data is already available on each event)
10. `src/lib/neighborhoods.ts` — Neighborhood name lookup utilities
11. `src/lib/brave-search.ts` — Brave Web Search wrapper (for event detail web research)
12. `src/lib/firecrawl.ts` — Firecrawl wrapper (for event detail web research)
13. `src/app/globals.css` — Terminal-specific animations and keyframes

### Also scan:
- `src/lib/terminal-datasets.ts` — Dataset registry, understand event type taxonomy
- `src/lib/terminal-ai.ts` — AI brief generation (understand metadata shape: `_colorTags`, `_headline`)
- `prisma/schema.prisma` — `TerminalEvent` model and related models

### After reading, propose a plan before writing code. Group work into these phases:
1. Event card redesign (address, neighborhood, dollar amounts, unit count)
2. Right panel collapse/expand affordance
3. Expandable event detail (progressive disclosure)
4. Neighborhood filter
5. Keyboard navigation
6. Polish pass (animations, hover states, accessibility)

---

## Implementation Intent

### 1. Event Card Redesign

**Current state:** Card header shows `BK · 3058920015` (borough + raw BBL) with timestamp and badge.

**Target state:** Card header shows the address, neighborhood, and key financial figure. BBL becomes a secondary detail.

**Header row should display:**
- Address (from `enrichmentPackage.property_profile.address`) — primary text, white, truncated if long
- Neighborhood name (from NTA code via `neighborhoods.ts` lookup, or `enrichmentPackage.property_profile.neighborhood`) — secondary text, muted
- Borough code — as part of the neighborhood string (e.g., "Williamsburg · BK")
- Timestamp — right-aligned, same as now
- Event badge — same as now (Sale, Loan, Alt-1, etc.)
- Bookmark icon — same as now

**Below the header, above the brief, add a metadata row for relevant events:**
- Dollar amount for sales/loans/foreclosures — pull from `metadata.doc_amount` or `metadata.amount` — display as formatted currency (e.g., "$4.8M", "$2.1M"). Use green for sales, blue for loans, red for foreclosures/liens.
- Unit count for multifamily — from `enrichmentPackage.property_profile.units_total` or PLUTO data. Show as "12 units" badge.
- BBL as a small monospace tooltip/hover element — not prominent, but accessible for power users.

**If address is not yet available** (enrichment hasn't run), fall back to the BBL display as it works now.

### 2. Right Panel Collapse/Expand

**Current state:** Right panel appears when a BBL is clicked. Has an X button inside the panel to close it. No way to re-open without clicking another BBL.

**Target state:** Add a persistent collapse/expand affordance on the left edge of the right panel.

**Interaction design:**
- When panel is open: a small chevron-left (`ChevronLeft` from lucide) handle on the panel's left edge, vertically centered. Clicking collapses the panel with a slide-right animation.
- When panel is collapsed: a small chevron-right handle remains visible at the right edge of the feed area. Clicking re-opens the panel with the last-viewed building.
- The X button inside the panel should remain — it fully dismisses the panel (clears the selected event). The chevron just hides/shows it.
- Store collapsed state in local component state (not persisted to DB).
- The handle should have a subtle hover effect (slightly wider, background highlight).

**Animation:** Use `transition-transform duration-300` with `translate-x-full` for collapsed state. The feed area should expand smoothly to fill the space when panel collapses.

### 3. Expandable Event Detail (Progressive Disclosure)

**This is the biggest feature.** Use a two-level progressive disclosure pattern:

**Level 1 — Inline Expand (click the card):**
When a user clicks anywhere on the event card body (not the BBL/address link, not the bookmark), the card expands in-place with a smooth height animation to reveal a detail section.

The expanded section shows data that's ALREADY in the enrichment package (instant, no API calls):
- **Filing details:** Document ID, filing date, document type, recorded date — from `metadata`
- **Parties:** Buyer/seller or borrower/lender names — from `metadata.parties` or ACRIS data
- **Property snapshot:** Building class, year built, total units, lot area, zoning — from `enrichmentPackage.property_profile`
- **BBL event timeline:** Other Terminal events at the same BBL (query: "show me what else happened at this building"). Server action: `getRelatedEvents(bbl, excludeEventId)` — returns last 5 events at same BBL.
- **Quick links:** Buttons/links to open ACRIS document (`https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id={docId}`), BIS profile (`https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro={boro}&block={block}&lot={lot}`), HPD building page.
- **Action row:** "Open Building Profile →" button (triggers the right panel), "Add to CRM" shortcut, "Underwrite →" link to deal modeler.

**Level 2 — Deep Research (on-demand, button click within expanded card):**
Inside the expanded card, show a "Research this event" button. When clicked:
- Fires a server action that does a Brave Search query for the address + relevant keywords (e.g., "88 Greenwich St NYC sale" or "1245 Grand Concourse foreclosure")
- Returns 3-5 relevant article links with titles and snippets
- Also searches for recent listings at the address via the existing `brave-listings.ts` orchestrator
- Display results in the expanded card under a "Web Intel" section
- Show a loading skeleton while fetching (2-3 seconds expected)
- Cache results on the client for the session (don't re-fetch if user collapses and re-expands)

**Interaction details:**
- Only one card can be expanded at a time (expanding a new card collapses the previous one)
- Chevron indicator: add a small `ChevronDown` icon on the right side of each card that rotates to `ChevronUp` when expanded
- Expanded state uses a slightly different background: `bg-[#1C2333]` (the hover color becomes the expanded color)
- Collapse animation: smooth height transition using CSS `grid-template-rows: 0fr → 1fr` trick for performant animation
- Clicking the address/BBL link in the header still opens the right panel (separate action from expand)

### 4. Neighborhood Filter

**Current filters:** Borough toggles (top bar), Event Type toggles (left sidebar).

**Add neighborhood filter to the left sidebar**, below event types, above watchlists.

**Implementation:**
- New section header: "NEIGHBORHOODS" with a search input for filtering the list
- Show neighborhoods that have events in the current feed (don't show empty neighborhoods)
- Each neighborhood is a toggle pill/button with event count badge (same style as event type toggles)
- Multi-select: users can enable multiple neighborhoods
- Neighborhoods come from NTA codes on the enriched events — group by NTA name
- When borough filter changes, update available neighborhoods
- Persist selection to `UserTerminalPreferences` (add `enabledNtas` field if not already there — check the model)
- On mobile: include in the bottom sheet filter alongside event types

**Data source:** The NTA code should already be in the enrichment package from PLUTO data (`enrichmentPackage.property_profile.nta` or similar). If it's not being stored during enrichment, add it to the enrichment step in `terminal-enrichment.ts` (pull from PLUTO `nta` field).

**Server action updates:**
- `fetchTerminalEvents()` needs to accept an optional `ntas: string[]` filter parameter
- The SQL query needs to filter on the NTA field in the enrichment package JSON (Prisma JSON filtering or raw SQL)

### 5. Neighborhood Display on Event Cards

Add the neighborhood name next to the address in the card header. Format: `165 N 6TH ST · Williamsburg · BK`

The neighborhood name can be derived from:
- `enrichmentPackage.property_profile.nta_name` (if stored during enrichment)
- Or lookup via `getNeighborhoodNameByZip()` from `lib/neighborhoods.ts` using the zip code
- Or lookup via NTA code mapping

Keep it to one line — if address + neighborhood is too long, truncate the address and keep the neighborhood visible.

### 6. Keyboard Navigation

Add keyboard shortcuts for power users. These are standard in Bloomberg and TradingView:

- `j` / `k` — move focus down/up through event cards (add a visible focus ring)
- `Enter` — expand/collapse the focused card (Level 1)
- `o` — open the focused card's building in the right panel
- `w` — quick-watch the focused BBL
- `Esc` — collapse expanded card, or close right panel, or deactivate search (in that priority order)
- `/` or `Cmd+K` — activate search (already implemented for Cmd+K)
- `?` — show keyboard shortcut overlay/help

**Implementation:**
- Track `focusedIndex` in feed state
- Add a visible focus indicator: subtle blue left-border glow or outline on the focused card
- Scroll focused card into view when navigating with j/k
- Use a `useEffect` with `keydown` listener on the feed container
- Don't capture keys when user is typing in search, filter inputs, or any input field

### 7. Polish & Animation

- **Card enter animation:** Current `terminal-card-enter` class. Keep it but make it snappier — 150ms fade-in + slight translateY.
- **Expanded card transition:** Use `grid-template-rows` trick for smooth height animation (avoid janky height: auto transitions).
- **Right panel slide:** `transition-transform duration-300 ease-out` for collapse/expand.
- **Hover states:** Event cards should have a subtle left-border glow on hover matching the event type color (currently just background change).
- **Focus management:** When right panel opens, don't steal focus from the feed. When search activates, auto-focus the input.
- **Empty state for filters:** If neighborhood + event type filters result in zero events, show a clear empty state message: "No events match your filters" with a "Reset filters" button.
- **Accessibility:** All interactive elements need proper `aria-label`, `role`, and keyboard handling. The expand/collapse needs `aria-expanded`. Card landmark should be `article` (already is).

---

## Constraints

### Stack & Patterns
- **Next.js 16 App Router** — all components in terminal/ are client components (`"use client"`)
- **Tailwind CSS 4** — no CSS modules, no styled-components. Custom animations go in `globals.css`
- **Lucide React** for all icons
- **No new dependencies** — use what's already installed
- **Server actions** in `terminal/actions.ts` must be `async` (required by `"use server"` directive)
- **Dark theme is scoped** to Terminal only — don't leak dark styles to other pages

### Existing patterns to follow
- Event card styling: `bg-[#161B22]`, hover `bg-[#1C2333]`, borders `border-[#21262D]`
- Text colors: primary `text-[#E6EDF3]`, secondary `text-[#8B949E]`, accent `text-[#0A84FF]`
- Green: `#30D158`, Red: `#FF6B6B`, Amber: `#FFD93D`, Blue: `#0A84FF`
- Monospace font for data values (BBL, amounts, dates)
- The right panel is desktop-only (`hidden lg:flex`). Don't add it to mobile.
- Borough toggle style in top bar — match this for any new toggle elements
- Filter counts use `bg-[#21262D]` badge style

### Things to avoid
- Don't touch the pipeline (ingestion, enrichment, AI brief generation) — this is frontend only
- Don't change the `TerminalEvent` Prisma model schema — work with the existing JSON fields (`metadata`, `enrichmentPackage`, `aiBrief`)
- Don't add localStorage usage in artifacts (but fine in Next.js components)
- Don't make the expanded event detail a separate route — it's all in-page state
- Don't pre-fetch web research for all events — only fetch on explicit user action (Level 2 expand button)
- Don't break the existing real-time subscription or infinite scroll
- Keep the existing search functionality working as-is

### Performance considerations
- Event cards render in a potentially infinite scroll — keep the card component lean
- Only one card expanded at a time (prevents DOM bloat from multiple expanded cards)
- Lazy-load the expanded detail section (don't render hidden content for collapsed cards)
- Web research results should be cached in component state (React `useRef` map keyed by eventId)
- Neighborhood filter list should be computed from the current event set, not a separate API call

---

## Files Likely Involved

### Primary (will be modified):
- `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — Major rewrite: address display, metadata row, expand/collapse, detail section
- `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — Right panel collapse, keyboard nav, expanded card state, neighborhood filter integration
- `src/app/(dashboard)/terminal/actions.ts` — New server actions: `getRelatedEvents()`, `searchEventWebIntel()`
- `src/app/globals.css` — New animations for card expand, panel slide

### Secondary (may need changes):
- `src/app/(dashboard)/terminal/page.tsx` — Pass neighborhood data as initial props
- `src/app/(dashboard)/terminal/components/watchlist-manager.tsx` — Layout adjustment if neighborhood filter added above/below
- `src/lib/neighborhoods.ts` — May need NTA-to-name lookup if not already present
- `src/lib/terminal-enrichment.ts` — Ensure NTA code/name is stored in enrichment package
- `src/lib/brave-search.ts` — Used by the web research action (read-only reference)
- `src/lib/firecrawl.ts` — Used by the web research action (read-only reference)
- `prisma/schema.prisma` — Check `UserTerminalPreferences` model for `enabledNtas` field; add if missing

### New files (if needed):
- `src/app/(dashboard)/terminal/components/event-detail-expanded.tsx` — Extracted component for the expanded card detail section (keeps terminal-event-card.tsx manageable)
- `src/app/(dashboard)/terminal/components/neighborhood-filter.tsx` — Neighborhood filter sidebar section
- `src/app/(dashboard)/terminal/components/keyboard-shortcuts-help.tsx` — Keyboard shortcut overlay (triggered by `?`)

---

## New Server Actions Needed

### `getRelatedEvents(bbl: string, excludeEventId: string)`
- Query `TerminalEvent` where `bbl = bbl` and `id != excludeEventId`
- Order by `detectedAt DESC`, limit 5
- Return minimal shape: `{ id, eventType, detectedAt, aiBrief (first 100 chars), metadata.doc_amount }`
- No auth beyond standard org check

### `searchEventWebIntel(address: string, eventType: string)`
- Construct a search query from address + event context (e.g., "88 Greenwich St NYC office to residential conversion")
- Use Firecrawl search first (if budget allows), fall back to Brave Search
- Return top 5 results: `{ title, url, snippet, source }`
- Also run a quick listings search via `brave-listings.ts` pattern for the address
- Return listings separately: `{ address, price, beds, url, source }`
- Implement a simple in-memory cache (Map keyed by `${address}-${eventType}`) with 30-minute TTL to avoid redundant searches

### `fetchNeighborhoodCounts(orgId: string, boroughs: number[], categories: string[])`
- Query `TerminalEvent` grouped by NTA code/name within the current filter context
- Return `{ nta: string, name: string, count: number }[]`
- Used to populate the neighborhood filter sidebar with accurate counts

---

## Summary of Changes (for quick reference)

| # | Feature | Complexity | Key Files |
|---|---------|-----------|-----------|
| 1 | Address + neighborhood + $ in card header | Medium | terminal-event-card.tsx |
| 2 | Right panel collapse/expand chevron | Low | terminal-feed.tsx, globals.css |
| 3 | Inline card expand (Level 1 — cached data) | High | terminal-event-card.tsx, event-detail-expanded.tsx, actions.ts |
| 4 | Deep research button (Level 2 — web search) | Medium | event-detail-expanded.tsx, actions.ts, brave-search.ts |
| 5 | Neighborhood filter sidebar | Medium | neighborhood-filter.tsx, terminal-feed.tsx, actions.ts, page.tsx |
| 6 | Keyboard navigation (j/k/Enter/o/w/Esc/?) | Medium | terminal-feed.tsx, keyboard-shortcuts-help.tsx |
| 7 | Polish (animations, hover, focus, a11y) | Low | globals.css, terminal-event-card.tsx, terminal-feed.tsx |
