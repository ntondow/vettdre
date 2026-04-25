# Terminal Handoff Prompt 10: Watchlists + Notification Bell

## Goal
Activate the Terminal's watchlist system: let users create watches on specific BBLs, blocks, owners, or neighborhoods, then automatically generate alerts when new events match. Wire up the notification bell in the Terminal top bar to show unread alert counts and an alert dropdown. Replace the "Coming in Phase 2" placeholder in the left sidebar with a working watchlist manager.

## Project
Repo: VettdRE (this repo)
Files to modify:
- `src/app/(dashboard)/terminal/components/terminal-feed.tsx` (replace watchlist placeholder, wire notification bell)
- `src/app/(dashboard)/terminal/actions.ts` (add watchlist + alert server actions)

Files to create:
- `src/app/(dashboard)/terminal/components/watchlist-manager.tsx` (new — sidebar watchlist UI)
- `src/app/(dashboard)/terminal/components/alert-dropdown.tsx` (new — bell notification dropdown)
- `src/lib/terminal-alerts.ts` (new — alert matching engine)

Files to reference (read-only):
- `prisma/schema.prisma` — TerminalWatchlist, TerminalWatchlistAlert, WatchType enum
- `src/lib/terminal-enrichment.ts` — EnrichmentPackage interface (for owner matching)

## Discovery Instructions
Before writing any code, read the following files:

1. `prisma/schema.prisma` — Find and read:
   - `TerminalWatchlist` model — fields: id, userId, orgId, watchType (WatchType enum), watchValue, label, notifyTiers (Int[]), isActive, createdAt
   - `TerminalWatchlistAlert` model — fields: id, watchlistId, eventId, read, notifiedAt
   - `WatchType` enum — values: bbl, block, owner, nta
   - Note the indexes on both models

2. `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — Find:
   - The watchlist placeholder section (look for "Coming in Phase 2" or Lock icon, around line 240)
   - The notification bell in the top bar (look for `Bell` icon import from lucide-react)
   - How state is managed (useState hooks at top of component)
   - The left sidebar section structure

3. `src/app/(dashboard)/terminal/actions.ts` — Read the full file. Understand the auth pattern (`getAuthContext()`), how Prisma queries are structured, the existing action signatures.

4. `src/lib/terminal-enrichment.ts` — Read the EnrichmentPackage interface. For owner matching, the `property_profile.ownerName` field is where the current owner name lives.

5. `src/lib/terminal-datasets.ts` — Understand how BBL is stored (10-character string, first digit = borough).

6. `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — Understand the card structure so we can add a "Watch this BBL" action to it.

7. `src/lib/entity-resolver.ts` — Check if there's a fuzzy name matching utility we can reuse for owner watchlist matching.

**Propose your plan before writing any code.**

## Implementation Intent

### 1. Alert Matching Engine (`src/lib/terminal-alerts.ts`)

Create a function that runs after each ingestion cycle to match new events against active watchlists:

```typescript
async function matchEventsToWatchlists(
  eventIds: string[],  // newly created event IDs from this ingestion run
  orgId: string
): Promise<{ alertsCreated: number }>
```

Matching logic by WatchType:
- **bbl**: Exact match — event.bbl === watchlist.watchValue
- **block**: Prefix match — event.bbl starts with watchValue (e.g., watchValue "307265" matches all lots on block 07265 in borough 3)
- **owner**: Fuzzy match — check `enrichmentPackage.property_profile.ownerName` contains watchValue (case-insensitive). Only match events that have been enriched. Use a simple `toLowerCase().includes()` — don't over-engineer this.
- **nta**: Exact match — event.ntaCode === watchlist.watchValue

Additional logic:
- Only match against watchlists where `isActive = true`
- Respect `notifyTiers` — only alert if event tier is in the watchlist's notifyTiers array
- Dedup: don't create alert if one already exists for this watchlist + event combo (use upsert or check before insert)
- Batch process: handle up to 500 events per call efficiently

**Integration point:** Call `matchEventsToWatchlists()` at the end of the ingestion cron endpoint (`/api/terminal/ingest/route.ts`), passing the IDs of newly created events. Add this as the last step after all datasets are polled.

### 2. Watchlist Server Actions (`actions.ts` additions)

Add to the existing actions.ts file:

```typescript
// CRUD for watchlists
async function createWatchlist(params: {
  watchType: 'bbl' | 'block' | 'owner' | 'nta'
  watchValue: string
  label?: string
  notifyTiers?: number[]  // default [1, 2, 3] = all tiers
}): Promise<{ id: string }>

async function getWatchlists(): Promise<Array<{
  id: string
  watchType: string
  watchValue: string
  label: string | null
  notifyTiers: number[]
  isActive: boolean
  createdAt: Date
  alertCount: number  // total unread alerts for this watchlist
}>>

async function updateWatchlist(id: string, params: {
  label?: string
  notifyTiers?: number[]
  isActive?: boolean
}): Promise<void>

async function deleteWatchlist(id: string): Promise<void>

// Alert management
async function getUnreadAlertCount(): Promise<number>

async function getAlerts(params?: {
  watchlistId?: string
  unreadOnly?: boolean
  limit?: number  // default 20
}): Promise<Array<{
  id: string
  watchlistId: string
  watchlistLabel: string | null
  watchType: string
  watchValue: string
  event: {
    id: string
    eventType: string
    bbl: string
    aiBrief: string | null
    detectedAt: Date
  }
  read: boolean
  notifiedAt: Date
}>>

async function markAlertsRead(alertIds: string[]): Promise<void>

async function markAllAlertsRead(): Promise<void>
```

### 3. Watchlist Manager Component (`components/watchlist-manager.tsx`)

Replaces the "Coming in Phase 2" placeholder in the left sidebar. Uses the Terminal dark theme.

**Layout:**
- Section header: "Watchlists" with a "+" button to create new
- List of active watchlists, each showing:
  - Icon by type: `MapPin` for BBL, `Grid3x3` for block, `User` for owner, `Map` for NTA
  - Label or watchValue as display name
  - Unread alert count badge (red dot with number)
  - Toggle switch for active/inactive
  - Trash icon button for delete (with confirmation)

**Create Watchlist Form:**
Inline form that expands when "+" is clicked:
1. Type selector: 4 pill buttons (BBL | Block | Owner | NTA)
2. Value input: text field with placeholder based on type:
   - BBL: "Enter 10-digit BBL (e.g., 3072650001)"
   - Block: "Enter borough + block (e.g., 307265)"
   - Owner: "Enter owner name"
   - NTA: Dropdown populated from neighborhoods.ts, filtered by active boroughs
3. Label input: optional, "Display name (optional)"
4. Create button

**Quick Watch from Event Card:**
Add a small bookmark/watch icon to the terminal-event-card.tsx. Clicking it creates a BBL watchlist for that event's BBL. If a watchlist already exists for that BBL, the icon shows as filled/active.

### 4. Alert Dropdown Component (`components/alert-dropdown.tsx`)

Triggered by the notification bell icon in the Terminal top bar.

**Bell icon behavior:**
- Show unread count badge (red circle with number, max "99+")
- Poll for unread count every 60 seconds (or refresh on window focus)
- Click opens a dropdown panel anchored to the bell icon

**Dropdown panel:**
- Dark themed (matches Terminal)
- Header: "Alerts" with "Mark all read" link
- List of recent alerts (most recent first, limit 20):
  - Each alert shows: watchlist type icon, brief excerpt (first 80 chars of aiBrief), event type badge, relative timestamp
  - Unread alerts have a subtle left border accent (accent-blue)
  - Click an alert → marks it read + scrolls/navigates to that event in the feed (set detailEvent)
- Empty state: "No alerts yet. Create a watchlist to start monitoring."
- Footer: "View all alerts" link (scrolls to watchlist section in sidebar)

**Positioning:**
Use a portal or absolute positioning. The dropdown should appear below the bell icon, aligned right. Close on click outside or Escape key.

### 5. Integration with Existing Components

**terminal-feed.tsx changes:**
1. Replace the watchlist placeholder section with `<WatchlistManager />`
2. Wire the Bell icon to `<AlertDropdown />`
3. Add state: `watchlists`, `unreadAlertCount`, `alerts`
4. Add a `refreshAlerts()` function called on interval and after watchlist CRUD
5. Pass `onQuickWatch` callback to event cards for the bookmark action

**terminal-event-card.tsx changes:**
1. Add a small bookmark icon (Lucide `Bookmark` or `Eye`) in the card's action area
2. Accept `isWatched: boolean` and `onQuickWatch: (bbl: string) => void` props
3. Filled icon if BBL is already in user's watchlists

**Ingestion endpoint changes (`/api/terminal/ingest/route.ts`):**
1. After polling all datasets, collect all newly created event IDs
2. Call `matchEventsToWatchlists(newEventIds, orgId)`
3. Log alert creation count in the response

## Constraints
- Do NOT modify the Prisma schema — TerminalWatchlist, TerminalWatchlistAlert, and WatchType are already defined
- Owner matching is case-insensitive substring (`includes`), not fuzzy. Keep it simple — fuzzy matching can be added later.
- Maximum 25 watchlists per user (enforce in createWatchlist)
- Alert dropdown loads max 20 alerts. No infinite scroll on the dropdown — keep it lightweight.
- Polling interval for unread count: 60 seconds. Do NOT use WebSocket/Realtime for alert counts (that comes in Prompt 11).
- All watchlist/alert actions require authentication (use getAuthContext pattern)
- The watchlist manager must work within the existing left sidebar width (260px on desktop)
- Dark theme styling: use the same Terminal CSS custom properties (--terminal-bg-secondary, --terminal-text-primary, etc.)
- Do NOT add push notifications or email alerts — this is in-app only for now
- Quick watch from event card should show a brief toast/confirmation, not a modal
