# Terminal Handoff Prompt 11: Supabase Realtime Live Feed

## Goal
Add live event streaming to the Terminal so new events appear in the feed automatically without page refresh. When the ingestion pipeline creates new TerminalEvent records, users with the Terminal open should see them appear at the top of the feed in real-time with a subtle animation. This uses Supabase Realtime (Postgres Changes), which is new infrastructure for VettdRE — no other feature uses it yet.

## Project
Repo: VettdRE (this repo)
Files to modify:
- `src/app/(dashboard)/terminal/components/terminal-feed.tsx` (add Realtime subscription)
- `src/app/(dashboard)/terminal/actions.ts` (add action to fetch single event by ID)

Files to create:
- `src/lib/terminal-realtime.ts` (new — Realtime subscription hook/utility)

Files to reference (read-only):
- `src/lib/supabase/client.ts` — Supabase browser client (needed for Realtime subscription)
- `src/lib/supabase/server.ts` — Supabase server client (reference only)
- `prisma/schema.prisma` — TerminalEvent model and its mapped table name

## Discovery Instructions
Before writing any code, read the following files:

1. `src/lib/supabase/client.ts` — Read the full file. Understand how the Supabase browser client is created. This is what you'll use for Realtime subscriptions (Realtime only works from the browser client, not server).

2. `src/lib/supabase/server.ts` — Read to understand the server client pattern. You won't use this for Realtime but it helps understand the auth context.

3. `prisma/schema.prisma` — Find the TerminalEvent model. Note:
   - The `@@map` directive on the model — this gives you the actual Postgres table name (likely `terminal_events` or `TerminalEvent`)
   - The column mappings (`@map`) — Realtime sends raw Postgres column names, not Prisma field names
   - The `orgId` field mapping for row-level filtering

4. `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — Read the full file. Understand:
   - How `events` state is managed (useState)
   - How new events are prepended (the fetchEvents function and state updates)
   - The feed rendering (map over events array)
   - The IntersectionObserver for infinite scroll
   - Component lifecycle (useEffect hooks)

5. `src/app/(dashboard)/terminal/actions.ts` — Check if there's already a `getTerminalEventDetail()` or similar function that fetches a single event by ID with all fields.

6. `next.config.ts` — Check if there are any Content Security Policy headers that might block WebSocket connections to Supabase.

7. Search the Supabase docs or check `node_modules/@supabase/supabase-js` for the Realtime API:
   - `supabase.channel()` to create a channel
   - `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: '...' }, callback)` pattern
   - `.subscribe()` to activate
   - `.unsubscribe()` for cleanup

**Propose your plan before writing any code.**

## Implementation Intent

### 1. Realtime Subscription Utility (`src/lib/terminal-realtime.ts`)

Create a custom React hook that manages the Supabase Realtime subscription:

```typescript
import { useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseTerminalRealtimeOptions {
  boroughs: number[]       // current borough filter
  categories: string[]     // current category filter
  onNewEvent: (eventId: string) => void  // callback when new event matches filters
  enabled: boolean         // toggle subscription on/off
}

export function useTerminalRealtime({
  boroughs,
  categories,
  onNewEvent,
  enabled,
}: UseTerminalRealtimeOptions) {
  // ...implementation
}
```

**Subscription setup:**
1. Create a Supabase browser client instance
2. Subscribe to Postgres Changes on the TerminalEvent table:
   ```typescript
   const channel = supabase
     .channel('terminal-events')
     .on(
       'postgres_changes',
       {
         event: 'INSERT',
         schema: 'public',
         table: 'terminal_events',  // @@map("terminal_events") in Prisma schema
       },
       (payload) => {
         // payload.new contains the new row with raw Postgres column names
         const newRow = payload.new
         const borough = newRow.borough
         const eventType = newRow.event_type

         // Client-side filter: only notify if event matches current filters
         if (boroughs.length > 0 && !boroughs.includes(borough)) return
         if (categories.length > 0 && !categories.includes(eventType)) return

         onNewEvent(newRow.id)
       }
     )
     .subscribe()
   ```

3. **Filter re-subscription:** When borough or category filters change, unsubscribe and resubscribe. Use a useEffect with boroughs/categories as dependencies.

4. **Cleanup:** On component unmount, unsubscribe from the channel.

5. **Connection status:** Track and expose connection state: 'connecting' | 'connected' | 'disconnected' | 'error'. This feeds the status dot in the Terminal top bar.

**Important note on Realtime and RLS:**
Supabase Realtime respects Row Level Security (RLS) policies. If the TerminalEvent table has RLS enabled, the subscription will only receive events the authenticated user can see. If RLS is NOT enabled on this table (Prisma-managed tables often don't have RLS), the subscription will receive ALL inserts. In that case, add client-side orgId filtering:
```typescript
if (newRow.org_id !== currentOrgId) return
```

### 2. New Event Fetching

When Realtime notifies of a new event, we get the raw Postgres row from the payload. However, the payload may not include all the data we need (enrichment, brief, etc.) and column names are snake_case. Instead of parsing the payload, fetch the full event via a server action:

Add to `actions.ts` (if not already present):
```typescript
async function getTerminalEventById(eventId: string): Promise<TerminalEvent | null>
```

This returns the full Prisma-shaped event object with all fields, ready for rendering in the feed.

### 3. Feed Integration (`terminal-feed.tsx`)

**New event flow:**
1. Realtime callback fires with new event ID
2. Call `getTerminalEventById(eventId)` to fetch full event data
3. Prepend to events array: `setEvents(prev => [newEvent, ...prev])`
4. Show the new event with a highlight animation (brief glow effect, then fade to normal)

**"New events" banner:**
If the user has scrolled down in the feed, don't auto-scroll to top. Instead, show a sticky banner at the top of the feed:
```
"3 new events ↑" (click to scroll to top and show them)
```

Implementation:
- Track `scrollPosition` and `newEventBuffer` state
- If scrolled past threshold (e.g., 200px from top), buffer new events instead of prepending
- Show banner with count
- Click banner → prepend buffered events + smooth scroll to top
- If at top of feed, prepend immediately (no banner)

**Status dot update:**
The top bar has a connection status dot (green/amber). Wire it to the Realtime connection status:
- Green dot + "Live" label: Realtime connected and events within last 30 min
- Amber dot + "Connecting" label: Realtime connecting or reconnecting
- Red dot + "Disconnected" label: Realtime disconnected or errored (with retry)
- The existing freshness check (events < 30min) should be combined: both Realtime connection AND recent events must be true for green.

**Deduplication:**
New events from Realtime might already be in the feed (if the user just loaded/refreshed). Check by event ID before prepending:
```typescript
if (events.some(e => e.id === newEvent.id)) return  // already in feed
```

### 4. Supabase Realtime Configuration

**Enable Realtime on the table:**
Supabase Realtime for Postgres Changes requires the table to be added to the `supabase_realtime` publication. This is done via SQL:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE "terminal_events";
```

**Note:** The actual Postgres table name is `terminal_events` (confirmed from `@@map("terminal_events")` in schema.prisma).

Create a migration or document this SQL command. The simplest approach:
- Add a comment at the top of `terminal-realtime.ts` with the SQL command
- Or create a small migration script: `scripts/enable-terminal-realtime.sql`

### 5. Graceful Degradation

If Realtime fails to connect (network issues, Supabase plan limits, etc.):
- Log the error but don't crash the UI
- Fall back to the existing behavior (manual refresh / periodic polling)
- Add a "Refresh" button next to the status dot that manually calls fetchEvents()
- Status dot shows amber/red to indicate degraded state

### 6. Performance Considerations

- **Throttle fetches:** If many events arrive in quick succession (e.g., during a backfill), batch the fetches. Wait 500ms after the first Realtime notification, collect all IDs, then fetch them in one query (add a `getTerminalEventsByIds` action).
- **Max buffer size:** Don't buffer more than 50 new events. After 50, show "50+ new events" banner.
- **Memory:** When the feed exceeds 500 events in memory, trim the oldest ones (they can be re-fetched via infinite scroll).

## Constraints
- This is the FIRST Supabase Realtime usage in VettdRE — there are no existing patterns to follow. Document the setup clearly.
- Use the Supabase browser client from `src/lib/supabase/client.ts` — Realtime only works client-side
- Do NOT use Supabase Realtime for the alert count polling (that stays as a simple interval fetch) — Realtime is for the event feed only
- The Realtime subscription should clean up on unmount (useEffect cleanup function)
- Client-side filtering is required because Realtime filters are limited (can only filter on equality for one column). We subscribe to ALL inserts and filter in the callback.
- Do NOT modify the ingestion pipeline — Realtime reacts to database inserts automatically via Postgres logical replication
- Handle the case where the Supabase plan doesn't support Realtime (free tier has limits) — graceful degradation, not errors
- The "new events" banner should not obscure the top bar or filter controls
- Keep the Realtime hook as a standalone module (`terminal-realtime.ts`) so it can be tested independently
- Do NOT use Supabase Realtime Broadcast or Presence — only Postgres Changes
- The `scripts/enable-terminal-realtime.sql` file should include both the ADD TABLE command and a comment explaining what it does and when to run it
