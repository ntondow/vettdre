# Terminal Handoff Prompt 12: Search Across Briefs, Addresses, Owners

## Goal
Add a search bar to the Terminal that lets users search across AI briefs, addresses, owner names, and BBLs. This unlocks the Terminal as a research tool — instead of only scrolling the feed, users can find specific events by keyword. The search uses PostgreSQL full-text search for brief content and ILIKE for structured fields, with results displayed inline in the feed area.

## Project
Repo: VettdRE (this repo)
Files to modify:
- `src/app/(dashboard)/terminal/components/terminal-feed.tsx` (add search UI, toggle between feed and search results)
- `src/app/(dashboard)/terminal/actions.ts` (add search server action)

Files to create:
- `src/app/(dashboard)/terminal/components/terminal-search.tsx` (new — search input + results component)

Files to reference (read-only):
- `prisma/schema.prisma` — TerminalEvent model, column types and indexes
- `src/app/(dashboard)/market-intel/market-intel-search.tsx` — Existing search UI pattern to follow
- `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — Reuse for rendering search results

## Discovery Instructions
Before writing any code, read the following files:

1. `prisma/schema.prisma` — Find the TerminalEvent model. Note:
   - `aiBrief` is `@db.Text` — full text content, good candidate for PostgreSQL full-text search
   - `bbl` is `@db.VarChar(10)` — structured, exact/prefix match
   - `enrichmentPackage` is `Json?` — contains nested `property_profile.address` and `property_profile.ownerName`
   - `eventType` is `String` — can be used as a filter alongside search
   - Existing indexes: detectedAt, bbl, borough+detectedAt, eventType+detectedAt

2. `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — Find:
   - The search icon in the top bar (should be a placeholder from Prompt 5)
   - How the feed area renders (the center panel)
   - State management patterns

3. `src/app/(dashboard)/market-intel/market-intel-search.tsx` — Study:
   - The search input pattern (debounced input, loading state)
   - How search results are displayed
   - The empty state and no-results patterns

4. `src/app/(dashboard)/terminal/actions.ts` — Read the full file. Understand how Prisma queries are structured, especially the `getTerminalEvents` function. Note the use of `prisma.$queryRaw` if any (we'll need it for full-text search).

5. `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — Understand the props interface so search results can reuse this component.

6. `src/lib/prisma.ts` — Check how the Prisma client is initialized. Confirm we can use `prisma.$queryRaw` for custom SQL.

**Propose your plan before writing any code.**

## Implementation Intent

### 1. PostgreSQL Full-Text Search Setup

Create a GIN index on the `aiBrief` column for fast full-text search. This requires a raw SQL migration:

**Migration file** (`prisma/migrations/[timestamp]_terminal_search_index/migration.sql`):
```sql
-- Create a GIN index for full-text search on Terminal event briefs
CREATE INDEX IF NOT EXISTS "TerminalEvent_ai_brief_search_idx"
ON "TerminalEvent"
USING GIN (to_tsvector('english', COALESCE(ai_brief, '')));

-- Create a trigram index on BBL for prefix search (if pg_trgm is available)
-- This is optional — LIKE 'prefix%' can use the existing btree index
```

To create this migration properly:
1. Create the migration directory: `prisma/migrations/[timestamp]_terminal_search_index/`
2. Write the `migration.sql` file with the GIN index
3. Run `npx prisma migrate resolve --applied [timestamp]_terminal_search_index` if applying manually, OR use `npx prisma migrate dev --name terminal_search_index` to generate it

**Alternative if raw migration is too complex:** Skip the GIN index and use `ILIKE` for brief search. It's slower on large datasets but simpler to set up and fine for the current data volume (< 50K events). The GIN index can be added later as an optimization.

### 2. Search Server Action (`actions.ts`)

Add a search function that queries across multiple fields:

```typescript
async function searchTerminalEvents(params: {
  query: string           // user's search text
  boroughs?: number[]     // optional borough filter (respect current filters)
  categories?: string[]   // optional category filter
  limit?: number          // default 30
  offset?: number         // for pagination
}): Promise<{
  results: Array<{
    event: TerminalEvent   // full event object
    matchField: 'brief' | 'address' | 'owner' | 'bbl'  // which field matched
    snippet?: string       // highlighted excerpt for brief matches
  }>
  totalCount: number
  hasMore: boolean
}>
```

**Search strategy (query → multiple searches, merge results):**

1. **BBL exact/prefix match** (fastest, check first):
   - If query looks like a BBL (all digits, 1-10 chars): `WHERE bbl LIKE '{query}%'`
   - Instant, uses existing btree index

2. **Address search** (JSON field):
   - Use Prisma's JSON filtering or raw SQL:
   ```sql
   WHERE enrichment_package->'property_profile'->>'address' ILIKE '%{query}%'
   ```
   - Normalize query: uppercase, trim whitespace

3. **Owner name search** (JSON field):
   ```sql
   WHERE enrichment_package->'property_profile'->>'ownerName' ILIKE '%{query}%'
   ```

4. **Brief full-text search** (text content):
   - With GIN index:
   ```sql
   WHERE to_tsvector('english', COALESCE(ai_brief, '')) @@ plainto_tsquery('english', '{query}')
   ```
   - Without GIN index (fallback):
   ```sql
   WHERE ai_brief ILIKE '%{query}%'
   ```

**Merge logic:**
- Run all 4 searches in parallel via `Promise.allSettled`
- Dedup by event ID (same event might match on address AND brief)
- Assign `matchField` based on which search found it (prefer more specific: bbl > address > owner > brief)
- Sort by relevance: exact BBL matches first, then address, then owner, then brief (within each group, sort by detectedAt desc)
- Apply `limit` and `offset` after merging

**Security:**
- Sanitize the query string: strip SQL-special characters for raw queries, or use parameterized queries exclusively
- Minimum query length: 2 characters
- Rate limit: debounce on client (300ms), no server-side rate limit needed for authenticated users

### 3. Search Input Component (`components/terminal-search.tsx`)

**UI Structure:**
A search bar that appears in the Terminal top bar, replacing or augmenting the search icon placeholder.

**Behavior:**
1. Search icon click → expands an input field in the top bar (animation: slide-in from right)
2. User types → debounce 300ms → call `searchTerminalEvents`
3. Results replace the main feed area while search is active
4. Clear button (X) or Escape → dismiss search, return to feed
5. Empty search field → return to feed

**Search input styling (Terminal dark theme):**
```
bg-[#161B22] border border-[#21262D] text-[#E6EDF3] placeholder-[#8B949E]
rounded-lg px-4 py-2 font-mono text-sm
focus:border-[#0A84FF] focus:ring-1 focus:ring-[#0A84FF]
```

**Results display:**
- Reuse `TerminalEventCard` for each result
- Add a match indicator: small badge showing what matched ("Address match", "Owner match", "BBL match", "Brief match")
- For brief matches with a snippet, highlight the matching text with a subtle background color (--terminal-accent-blue at 20% opacity)
- Show total result count: "12 results for 'rent stabilization'"
- Paginate with "Load more" button (not infinite scroll — search results are finite)

**Loading state:**
- Skeleton shimmer while searching (same as feed loading)
- "Searching..." text below the input

**No results state:**
- "No events found for '{query}'"
- Suggestions: "Try searching by BBL, address, owner name, or keywords from briefs"

### 4. Feed Integration (`terminal-feed.tsx`)

**State additions:**
```typescript
const [isSearching, setIsSearching] = useState(false)
const [searchQuery, setSearchQuery] = useState('')
const [searchResults, setSearchResults] = useState<SearchResult[]>([])
const [searchLoading, setSearchLoading] = useState(false)
```

**Layout change:**
When `isSearching` is true:
- Hide the infinite scroll feed
- Hide the left sidebar filters (they're not applicable during search)
- Show the search results in the main feed area
- Keep the right panel functional (clicking a BBL in search results opens the detail panel)

When `isSearching` is false:
- Normal feed behavior (unchanged)

**Top bar changes:**
Replace the search icon placeholder with an interactive search trigger:
- Default: search icon (magnifying glass)
- Clicked: expand to search input (push borough toggles left or overlay them on mobile)
- On mobile: search input takes full width of top bar, borough toggles hidden temporarily

### 5. Search Highlight Utility

Create a simple text highlighting function for brief snippets:

```typescript
function highlightMatches(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text

  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="bg-[#0A84FF]/20 text-[#E6EDF3] rounded px-0.5">{part}</mark>
      : part
  )
}
```

Apply this to the aiBrief text in search result cards when the match is on the brief field.

## Constraints
- Use parameterized queries (`prisma.$queryRaw` with `Prisma.sql` template) for ALL raw SQL — never concatenate user input into SQL strings
- Minimum search query length: 2 characters (don't search on single characters)
- Debounce search input by 300ms on the client
- Maximum 100 results per search (hard cap in the server action)
- The GIN index migration is optional — implement ILIKE fallback as the primary approach, add GIN as enhancement. Note in comments that GIN can be added for better performance at scale.
- Do NOT modify terminal-event-card.tsx structure — only add the match indicator badge as an optional prop
- Search respects the user's current borough filter but NOT category filter (users might want to find events across categories)
- Search results should include events regardless of whether they have an AI brief — BBL/address/owner matches on un-briefed events are still valuable
- Keep the search component self-contained — it should manage its own state and only communicate with terminal-feed.tsx via callbacks
- Do NOT use any external search library (Lunr, Fuse.js, etc.) — PostgreSQL is sufficient
- The search bar should be keyboard-accessible: Cmd/Ctrl+K to focus, Escape to close
- Do NOT add search to mobile bottom sheet filters — search is a top bar feature on all screen sizes
