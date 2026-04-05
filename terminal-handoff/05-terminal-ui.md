# Terminal Handoff Prompt 5: Terminal UI (Bloomberg Dark Theme)

## Goal
Build the Terminal's frontend: a Bloomberg Terminal-inspired dark interface that displays a real-time feed of NYC real estate intelligence briefs. This is a new page at `/terminal` within the existing VettdRE dashboard. The UI includes: event feed with infinite scroll, borough filter toggles, event category toggles, and a responsive layout (three-panel desktop, single-column mobile).

## Project
Repo: VettdRE (this repo)
Target files:
- `src/app/(dashboard)/terminal/page.tsx` (new)
- `src/app/(dashboard)/terminal/actions.ts` (new)
- `src/app/(dashboard)/terminal/components/` (new directory, multiple components)

## Discovery Instructions
Before writing any code, read the following files to understand existing UI patterns:

1. `src/app/(dashboard)/market-intel/market-intel-search.tsx` — Study the search/filter UI pattern. Note how filters are managed in state, how server actions are called, how loading states work.

2. `src/app/(dashboard)/market-intel/building-profile.tsx` — Study the slide-over panel pattern. The Terminal's right panel (property deep-dive) should follow this same approach.

3. `src/app/(dashboard)/market-intel/actions.ts` — Study how server actions fetch data and return serialized results.

4. `src/app/(dashboard)/pipeline/page.tsx` — Study the Kanban board for infinite scroll and real-time update patterns if applicable.

5. `src/app/(dashboard)/messages/messages-view.tsx` — Study the three-pane layout (sidebar + list + detail). The Terminal has a similar structure.

6. `src/components/layout/sidebar.tsx` — Understand the existing nav structure so you know how Terminal fits in (this integration is done in Prompt 6, but understanding context helps).

7. `src/app/globals.css` — See existing custom animations (fade-in, modal-in, slide-up) and utility classes (pb-safe, no-scrollbar). Terminal will add new animation keyframes here.

8. `src/lib/neighborhoods.ts` — The 179 NYC neighborhoods with NTA codes. Used for the neighborhood filter dropdown.

9. `prisma/schema.prisma` — Find TerminalEvent, UserTerminalPreferences, TerminalEventCategory models.

10. `CLAUDE.md` — Full project context, especially the styling conventions (Tailwind, clsx, tailwind-merge).

**Propose your plan before writing any code.**

## Implementation Intent

### Design System (Tailwind Custom Classes)

Add Terminal-specific CSS custom properties to `globals.css` or use Tailwind's arbitrary value syntax. The Terminal has its own dark color palette that lives INSIDE the normal VettdRE app:

```
--terminal-bg-primary: #0D1117      (main background)
--terminal-bg-secondary: #161B22    (card/panel backgrounds)
--terminal-bg-tertiary: #1C2333     (hover states, active filters)
--terminal-text-primary: #E6EDF3    (brief content)
--terminal-text-secondary: #8B949E  (metadata, timestamps)
--terminal-accent-green: #30D158    (new events, positive metrics)
--terminal-accent-red: #FF6B6B      (distress signals)
--terminal-accent-amber: #FFD93D    (warnings, expiring benefits)
--terminal-accent-blue: #0A84FF     (interactive elements, links)
--terminal-border: #21262D          (panel dividers, card borders)
```

Typography: Use `font-mono` (Tailwind's monospace stack) for brief content. Use the app's default font for UI chrome.

### Page Structure (`terminal/page.tsx`)

Server component that:
1. Fetches user's TerminalPreferences (or creates default if none exist)
2. Fetches initial 50 events matching the user's enabled categories and boroughs
3. Fetches TerminalEventCategory list for the toggle UI
4. Passes data to the client component

### Main Client Component (`components/terminal-feed.tsx`)

Three-panel layout:

**Top Bar (always visible):**
- Left: "VettdRE Terminal" in monospace, bold
- Center: Borough toggles — 5 pill buttons: MN | BK | QN | BX | SI. Active = accent-blue background, inactive = bg-tertiary. Multiple can be active. Clicking toggles. State synced to UserTerminalPreferences.
- Right: Connection status dot (green = data fresh < 30min, amber = stale > 30min), notification bell (watchlist alerts count — just the icon for now, functionality in Phase 2), search icon (placeholder for Phase 3)

**Left Sidebar (desktop only, `hidden md:block`):**
- Neighborhood dropdown: multi-select, cascades from active boroughs. Use the neighborhoods from `neighborhoods.ts`. Filter by borough.
- Event category toggles: list of 13 categories with on/off toggle switches and live event count badges. Persist to UserTerminalPreferences on change.
- Watchlists section: "Coming in Phase 2" placeholder with lock icon
- Recently viewed: last 5 BBLs clicked (stored in component state, not persisted)

**Main Feed (center, takes remaining width):**
- Reverse-chronological event stream
- Each event is a `TerminalEventCard` component
- Infinite scroll: load 50 at a time, fetch more on scroll-to-bottom
- Loading skeleton with shimmer animation (use existing `skeleton-shimmer` if available, or create one matching the dark theme)
- Empty state: "No events match your filters" with suggestions to expand boroughs or categories

**Right Panel (desktop only, `hidden lg:block`, optional):**
- Hidden by default. Shows when user clicks a BBL link in any brief.
- Slide-in from right with animation
- Shows the property deep-dive: tabbed sections for Overview, Violations, Permits
- For MVP, this can be a simplified version that shows the enrichmentPackage data formatted nicely. Full integration with building-profile.tsx is Phase 2.
- Close button returns to feed-only view

### TerminalEventCard Component (`components/terminal-event-card.tsx`)

Each event card displays:
- Left border accent color based on event category (sales = green, violations = red, permits = blue, foreclosures = red, etc.)
- The aiBrief text rendered with monospace font
- Color tags applied: parse the colorTags from metadata and wrap matching text substrings with the appropriate color class
- Relative timestamp (2m ago, 1h ago, 3d ago) with absolute time on hover (use title attribute)
- BBL as a clickable link that opens the right panel
- Category badge in top-right corner
- Subtle fade-in animation on new cards

For events where `aiBrief` is still null (not yet processed by AI):
- Show a condensed card with: event type badge, address, BBL, "Generating brief..." shimmer

### Server Actions (`terminal/actions.ts`)

```typescript
"use server"

// Fetch events with filters
async function getTerminalEvents(params: {
  boroughs: number[];
  categories: string[];
  ntas: string[];
  cursor?: string;  // last event ID for pagination
  limit?: number;   // default 50
}): Promise<{ events: TerminalEvent[]; hasMore: boolean }>

// Update user preferences
async function updateTerminalPreferences(prefs: {
  enabledCategories?: string[];
  enabledBoroughs?: number[];
  selectedNtas?: string[];
}): Promise<void>

// Get event counts per category (for toggle badges)
async function getEventCategoryCounts(
  boroughs: number[],
  since: Date  // e.g., last 24 hours
): Promise<Record<string, number>>

// Get single event detail (for right panel)
async function getTerminalEventDetail(eventId: string): Promise<TerminalEvent | null>
```

### Responsive Behavior

- **Desktop (lg+):** Three-panel layout. Left sidebar 260px, main feed flexible, right panel 400px (when open).
- **Tablet (md-lg):** Two-panel. Left sidebar collapsible (hamburger toggle), main feed full width, right panel overlays as modal.
- **Mobile (< md):** Single-column feed. Borough toggles become horizontally scrollable pills. Category toggles in a bottom sheet (triggered by filter icon in top bar). No right panel — BBL click navigates to a full-page detail view.

### Animations (add to globals.css)

```css
@keyframes terminal-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes terminal-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Infinite Scroll

Use Intersection Observer to detect when the user scrolls near the bottom of the feed. Load next 50 events. Show a loading spinner at the bottom while fetching. Stop loading when `hasMore` is false.

Do NOT use any external virtualization library unless the feed becomes noticeably slow (>500 events loaded). Start simple.

## Constraints
- Use Tailwind CSS for all styling — no external CSS files except additions to globals.css
- Use `clsx` and `tailwind-merge` for conditional class composition (already installed)
- Lucide React for icons (already installed) — MonitorDot for status, Bell for notifications, Filter for mobile filter, ChevronRight for expand
- All event data fetching goes through server actions in actions.ts
- The Terminal page lives inside the existing (dashboard) layout — it gets the sidebar, mobile nav, and auth protection for free
- Do NOT modify the (dashboard)/layout.tsx in this prompt — that's Prompt 6
- Persist user preferences (boroughs, categories, NTAs) to the database via updateTerminalPreferences. Do NOT use localStorage.
- The dark theme is scoped to the Terminal page only — it does NOT affect the rest of the VettdRE app. Wrap the Terminal in a container div with the dark background.
- Ensure the feed is accessible: proper ARIA labels on toggles, keyboard navigable, color is not the only indicator of meaning (use icons alongside color)
- Brief text rendering: preserve whitespace and line breaks from the aiBrief field. Use `whitespace-pre-wrap` and `font-mono`.
