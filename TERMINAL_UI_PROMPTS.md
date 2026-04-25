# Terminal UI Improvement Prompts — Paste into Claude Code

Run these in order. Each prompt is self-contained. Wait for each to complete before running the next.

---

## Prompt 0: Token Consolidation (run first)

```
Read TERMINAL_ENV_CLEANUP_HANDOFF.md. This is a simple find-and-replace task.

Replace every instance of `NYC_OPEN_DATA_TOKEN` with `NYC_OPEN_DATA_APP_TOKEN` across the codebase. There are ~8 occurrences across 5 files:

- src/lib/comps-engine.ts (lines 176, 328, 332)
- src/lib/fhfa.ts (line 151)
- src/app/(dashboard)/market-intel/new-development-actions.ts (line 101)
- src/app/(dashboard)/market-intel/comps-actions.ts (lines 41, 69)
- src/app/(dashboard)/deals/caprate-actions.ts (line 33)

After making changes, run: grep -r "NYC_OPEN_DATA_TOKEN" src/ to confirm zero references to the old name remain (only NYC_OPEN_DATA_APP_TOKEN should exist).

Do not change anything else.
```

---

## Prompt 1: Event Card Redesign

```
Read TERMINAL_UI_HANDOFF.md fully before starting. Then read these files:

- src/app/(dashboard)/terminal/components/terminal-event-card.tsx
- src/lib/terminal-enrichment.ts (understand enrichmentPackage shape)
- src/lib/neighborhoods.ts (neighborhood name lookup)

Propose a plan, then implement:

Redesign the Terminal event card header. Currently it shows "BK · 3058920015" (borough + raw BBL). Change it to show:

1. **Address as primary text** — pull from `event.enrichmentPackage?.property_profile?.address`. White text, truncated if too long. If address is unavailable, fall back to the BBL display.

2. **Neighborhood + borough** — after the address, show "· Williamsburg · BK" in muted text. Get the neighborhood from `event.enrichmentPackage?.property_profile?.nta_name` or use the NTA code to look up the name. If no neighborhood data, just show the borough code.

3. **BBL as tooltip only** — the raw BBL should appear on hover (title attribute) of the address text, not as visible text. Keep it clickable to open the building profile panel.

4. **Metadata row below the header** for relevant events:
   - Dollar amount for SALE_RECORDED, LOAN_RECORDED, FORECLOSURE_FILED: pull from `event.metadata?.doc_amount` or `event.metadata?.amount`. Format as "$4.8M" / "$2.1M" / "$350K". Color: green for sales, blue for loans, red for foreclosures.
   - Unit count: from `event.enrichmentPackage?.property_profile?.units_total`. Show as "12 units" in a small muted badge. Only show for multifamily (>1 unit).
   - This row should be compact — small text, flex row, gap-2.

5. **Keep existing elements working:** badge (Sale/Loan/Alt-1/etc.), bookmark icon, timestamp, color tags in brief, left border color.

Match existing Terminal dark theme: primary text `text-[#E6EDF3]`, secondary `text-[#8B949E]`, accent `text-[#0A84FF]`. Monospace for data values.
```

---

## Prompt 2: Right Panel Collapse/Expand

```
Read TERMINAL_UI_HANDOFF.md section 2 ("Right Panel Collapse/Expand"). Then read:

- src/app/(dashboard)/terminal/components/terminal-feed.tsx (find where detailEvent and the right panel are rendered, around line 453+)

Propose a plan, then implement:

Add a collapse/expand affordance to the Terminal right panel (building profile sidebar).

1. **Collapse chevron:** Add a small button on the left edge of the right panel, vertically centered. Use `ChevronLeft` from lucide-react. Clicking it collapses the panel with a slide-right animation (panel slides off-screen to the right). The feed area should smoothly expand to fill the freed space.

2. **Expand chevron:** When collapsed, show a small `ChevronRight` button pinned to the right edge of the feed area. Clicking it re-opens the panel with the last-viewed building still loaded.

3. **X button stays:** The existing X button inside the panel should still work — it fully dismisses the panel (clears detailEvent to null). The chevron only hides/shows it visually.

4. **State:** Add `isPanelCollapsed` boolean to component state. Don't persist to DB — local state only.

5. **Animation:** Use `transition-transform duration-300 ease-out`. Collapsed state: `translate-x-full`. The feed container width should transition smoothly (use flex or grid layout adjustment).

6. **Styling:** The chevron handle should be a small pill-shaped button (~24px wide, ~48px tall) with `bg-[#21262D]` background, `text-[#8B949E]` icon, hover `bg-[#30363D]`. Position it so it overlaps the panel edge slightly.

Keep the panel desktop-only (`hidden lg:flex` behavior).
```

---

## Prompt 3: Inline Card Expand (Level 1 — Cached Data)

```
Read TERMINAL_UI_HANDOFF.md section 3 ("Expandable Event Detail"). Then read:

- src/app/(dashboard)/terminal/components/terminal-event-card.tsx
- src/app/(dashboard)/terminal/components/terminal-feed.tsx
- src/app/(dashboard)/terminal/actions.ts
- src/lib/terminal-enrichment.ts (enrichment package shape)

Propose a plan, then implement:

Add inline expand/collapse to Terminal event cards. This is Level 1 — showing data that's already cached in the enrichment package.

**Interaction:**
- Clicking the card body (not the address link, not the bookmark) toggles expand/collapse
- Only one card can be expanded at a time — expanding a new card collapses the previous one
- Add a small `ChevronDown` icon on the right side of each card header that rotates to `ChevronUp` when expanded
- Track `expandedEventId` state in terminal-feed.tsx, pass as prop to cards

**Expanded section content (all from existing enrichmentPackage + metadata):**
- **Filing details:** Document ID, filing/recorded date, document type — from `event.metadata`
- **Parties:** Buyer/seller or borrower/lender names — from `event.metadata.parties` or enrichment data
- **Property snapshot:** Building class, year built, total units, lot area, zoning — from `enrichmentPackage.property_profile`
- **Quick links row:** Buttons linking to:
  - ACRIS: `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id={docId}` (if doc ID available)
  - BIS: `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro={boro}&block={block}&lot={lot}`
  - HPD: `https://hpdonline.nyc.gov/hpdonline/building/{boroId}/{block}/{lot}`
- **Action row:** "Open Building Profile →" button (calls onBblClick), "Underwrite →" link to `/deals/new?address={address}&bbl={bbl}`

**New server action — `getRelatedEvents(bbl, excludeEventId)`:**
- Query TerminalEvent where bbl matches, exclude current event, order by detectedAt DESC, limit 5
- Return: `{ id, eventType, detectedAt, aiBrief (first 100 chars) }`
- Show these as a compact "Other events at this building" list in the expanded section. Fetch on expand, cache in a useRef Map.

**Animation:** Use the CSS `grid-template-rows: 0fr / 1fr` trick for smooth height transitions. Don't render hidden expanded content for collapsed cards (lazy render on expand).

**Styling:** Expanded background: `bg-[#1C2333]`. Section headers: `text-[10px] uppercase tracking-wider text-[#8B949E]`. Data values: monospace. Quick link buttons: small pill buttons with `bg-[#21262D] hover:bg-[#30363D] text-[#8B949E]` styling. External links open in new tab.

Create a new component `src/app/(dashboard)/terminal/components/event-detail-expanded.tsx` for the expanded section to keep the card component manageable.
```

---

## Prompt 4: Deep Research Button (Level 2 — Web Search)

```
Read TERMINAL_UI_HANDOFF.md section 3, the Level 2 part. Then read:

- src/app/(dashboard)/terminal/components/event-detail-expanded.tsx (the component you just created in Prompt 3)
- src/app/(dashboard)/terminal/actions.ts
- src/lib/brave-search.ts (Brave Web Search wrapper)
- src/lib/firecrawl.ts (Firecrawl wrapper — check budget/availability pattern)
- src/lib/brave-listings.ts (listing search pattern)

Propose a plan, then implement:

Add a "Research this event" button inside the expanded card detail section (from Prompt 3).

**New server action — `searchEventWebIntel(address, eventType)`:**
- Construct a search query from address + event context (e.g., "88 Greenwich St NYC office residential conversion" or "1245 Grand Concourse foreclosure")
- Try Firecrawl search first (check budget via existing pattern in firecrawl.ts). If unavailable or over budget, fall back to Brave Search.
- Return top 5 web results: `{ title, url, snippet, source }[]`
- Also search for listings at the address using the pattern from brave-listings.ts
- Return listings separately: `{ address, price, beds, url, source }[]`
- Add simple in-memory cache: Map keyed by `${address}-${eventType}` with 30-minute TTL. Check cache before making API calls.

**UI in expanded card:**
- "Research this event" button with a `Search` icon (lucide). Style: `bg-[#0A84FF]/10 text-[#0A84FF] hover:bg-[#0A84FF]/20` pill button.
- When clicked: show loading skeleton (3 shimmer rows). Button text changes to "Searching..."
- Results appear in a "Web Intel" section:
  - Articles: each shows title (linked, opens new tab), snippet (1-2 lines, muted text), source domain
  - Listings: compact list with address, price, beds if available
- If no results: "No relevant articles found" muted message
- Cache results in a useRef Map in terminal-feed.tsx keyed by eventId — don't re-fetch if user collapses and re-expands

**Styling:** Match Terminal dark theme. Article links: `text-[#0A84FF] hover:underline`. Snippets: `text-[#8B949E] text-[11px]`. Source domain: `text-[#484F58] text-[10px]`.
```

---

## Prompt 5: Neighborhood Filter

```
Read TERMINAL_UI_HANDOFF.md section 4 ("Neighborhood Filter"). Then read:

- src/app/(dashboard)/terminal/components/terminal-feed.tsx (left sidebar section, filter state management)
- src/app/(dashboard)/terminal/components/watchlist-manager.tsx (reference for sidebar section pattern)
- src/app/(dashboard)/terminal/actions.ts (existing fetchTerminalEvents, understand filter params)
- src/app/(dashboard)/terminal/page.tsx (initial data loading)
- src/lib/terminal-enrichment.ts (check if NTA code/name is stored in enrichment package)
- prisma/schema.prisma (check UserTerminalPreferences model for enabledNtas field)

Propose a plan, then implement:

Add a neighborhood filter section to the Terminal left sidebar.

**Step 1: Ensure NTA data is available.**
Check if `enrichmentPackage.property_profile` includes NTA code or name from PLUTO data. If not, update `terminal-enrichment.ts` to include `nta` and `nta_name` from PLUTO in the property profile.

**Step 2: Add enabledNtas to UserTerminalPreferences.**
Check the Prisma model — if `enabledNtas` doesn't exist, add it as `String[]` (default empty = all enabled). Run prisma generate (but NOT prisma migrate — note the migration SQL needed in a comment).

**Step 3: New server action — `fetchNeighborhoodCounts(orgId, boroughs, categories)`:**
- Query TerminalEvent grouped by NTA from the enrichment package JSON
- Filter by current borough and category selections
- Return `{ nta: string, name: string, count: number }[]` sorted by count DESC
- Only include NTAs with count > 0

**Step 4: Update `fetchTerminalEvents` to accept `ntas?: string[]` filter.**
Add filtering on the NTA field in the enrichment package JSON. Use Prisma JSON path filtering or raw SQL if needed.

**Step 5: Create `src/app/(dashboard)/terminal/components/neighborhood-filter.tsx`:**
- Section header: "NEIGHBORHOODS" with same styling as "EVENT TYPES"
- Small search input at top to filter the neighborhood list (client-side filter)
- Each neighborhood is a toggle button with count badge (same visual pattern as event type toggles)
- Multi-select behavior
- Empty neighborhoods hidden
- When boroughs change, refetch neighborhood counts
- Persist selection via updateTerminalPreferences

**Step 6: Wire into terminal-feed.tsx:**
- Add to left sidebar below event types, above watchlists
- Add to mobile filter bottom sheet
- Pass enabledNtas to fetchTerminalEvents calls

Match existing sidebar styling: `bg-[#0D1117]` background, `text-[#E6EDF3]` labels, `bg-[#1C2333]` active toggle, `bg-[#21262D]` count badges.
```

---

## Prompt 6: Keyboard Navigation

```
Read TERMINAL_UI_HANDOFF.md section 6 ("Keyboard Navigation"). Then read:

- src/app/(dashboard)/terminal/components/terminal-feed.tsx (feed rendering, event list, existing keyboard handling for Cmd+K)

Propose a plan, then implement:

Add keyboard navigation to the Terminal feed for power users.

**Shortcuts:**
- `j` — move focus to next event card
- `k` — move focus to previous event card
- `Enter` — expand/collapse the focused card (toggle expandedEventId)
- `o` — open focused card's building in the right panel (trigger onBblClick)
- `w` — quick-watch the focused card's BBL
- `Esc` — close in priority order: (1) close expanded card, (2) close right panel, (3) deactivate search
- `/` — activate search (in addition to existing Cmd+K)
- `?` — toggle keyboard shortcut help overlay

**Implementation:**
1. Add `focusedIndex` state (number | null) to terminal-feed.tsx
2. Add `useEffect` with `keydown` listener on `document`
3. **Guard:** Don't capture keys when an input, textarea, or contenteditable element is focused (check `document.activeElement?.tagName`)
4. j/k: increment/decrement focusedIndex, clamped to 0..events.length-1. Scroll the focused card into view with `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.
5. Enter/o/w: operate on `events[focusedIndex]` if focusedIndex is set
6. Esc: check state in priority order and close the first thing that's open

**Visual focus indicator:**
- Add a `data-focused="true"` attribute or a conditional class to the focused card
- Style: `ring-1 ring-[#0A84FF]/50` or a subtle blue left-border glow (e.g., `shadow-[inset_3px_0_0_#0A84FF]`)
- Remove focus indicator when mouse is used (set focusedIndex to null on any mouse click on a card, let hover states take over)

**Help overlay — create `src/app/(dashboard)/terminal/components/keyboard-shortcuts-help.tsx`:**
- Small modal/overlay showing all shortcuts in a two-column grid
- Dark theme: `bg-[#161B22] border border-[#30363D]` with rounded corners
- Each shortcut: key in a `kbd` style box + description
- Close with `?` again or Esc
- Position: bottom-right corner of the feed area, floating

Make sure keyboard nav doesn't interfere with the existing search Cmd+K shortcut or any input fields.
```

---

## Prompt 7: Polish Pass

```
Read TERMINAL_UI_HANDOFF.md section 7 ("Polish & Animation"). Then read:

- src/app/globals.css (existing terminal animations)
- src/app/(dashboard)/terminal/components/terminal-event-card.tsx
- src/app/(dashboard)/terminal/components/terminal-feed.tsx

Propose a plan, then implement a final polish pass on all Terminal UI work:

**Animations:**
- Card enter animation: tighten to 150ms fade-in with subtle translateY(-4px → 0). Update the `terminal-card-enter` keyframe in globals.css.
- Expanded card transition: verify the grid-template-rows animation is smooth. If janky, add `will-change: grid-template-rows` or switch to max-height with a generous value.
- Right panel slide: verify 300ms ease-out feels right. Add `will-change: transform` for GPU acceleration.

**Hover states:**
- Event cards: on hover, add a subtle left-border glow matching the event type color. Currently it's just a background change — add `box-shadow: inset 3px 0 0 {eventTypeColor}` on hover with transition.

**Focus management:**
- When right panel opens, don't steal focus from the feed
- When search activates, auto-focus the search input
- When a card expands, don't scroll the page — the expanded content should appear below the card header

**Empty states:**
- If current filters (borough + event type + neighborhood) result in zero events, show: centered message "No events match your current filters" with a "Reset filters" button that clears all filters to defaults. Use `text-[#8B949E]` for the message, standard blue button for reset.

**Accessibility audit:**
- All interactive elements need `aria-label` attributes
- Expanded cards need `aria-expanded="true/false"`
- Keyboard shortcuts help should be announced to screen readers
- The collapse/expand panel chevron needs `aria-label="Collapse panel"` / `"Expand panel"`
- Focused card needs `aria-current="true"` or equivalent
- Quick links in expanded cards need descriptive aria-labels (e.g., "View on ACRIS", "View on BIS")

**Small visual fixes:**
- Verify text truncation works cleanly on long addresses
- Verify dollar amounts format correctly for edge cases ($0, very large amounts like $150M)
- Verify the neighborhood filter search input has proper placeholder text and clear button
- Check that loading skeletons for web research match the terminal shimmer animation

Do a final visual review of the full Terminal page after all changes. Take screenshots if possible and verify nothing looks broken.
```

---

## Post-Implementation: Update CLAUDE.md

```
After all 7 prompts are complete, update CLAUDE.md with the following changes:

1. In the "Terminal — Working" section under "Pending / Incomplete Features", update the status and notes to reflect:
   - Terminal UI v2 complete: address-first cards, inline expand with progressive disclosure, neighborhood filters, keyboard navigation, collapsible panel

2. In the "Recent Changes" section at the top, add entries for:
   - Event card redesign (address + neighborhood + dollar amounts)
   - Right panel collapse/expand
   - Inline expandable event cards with two-level progressive disclosure (cached data + on-demand web research)
   - Neighborhood filter in left sidebar
   - Keyboard navigation (j/k/Enter/o/w/Esc/?)
   - Terminal polish pass (animations, hover states, accessibility)

3. In the Terminal section under Feature Details, update the UI description to reflect the new interaction patterns.

Do not change any other sections of CLAUDE.md.
```
