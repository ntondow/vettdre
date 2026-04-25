# Market Intel Map: Phase 1 Fixes — Claude Code Handoff

## Goal
Fix all critical bugs, performance bottlenecks, and quick-win UX improvements from the map audit (`MAP_AUDIT_REPORT.md`). This is Phase 1 — concrete fixes that don't require new npm dependencies or architectural changes. Ship-ready in one session.

## Project
- **Repo:** VettdRE (Next.js 16, TypeScript, Leaflet 1.9.4 via CDN)
- **Primary file:** `src/app/(dashboard)/market-intel/map-search.tsx` (2,521 lines)
- **Layer renderer:** `src/app/(dashboard)/market-intel/map-layers-renderer.tsx`
- **Data actions:** `src/app/(dashboard)/market-intel/map-actions.ts`, `street-intel-actions.ts`

---

## Batch 1: Critical Bug Fixes

### 1.1 — Fix flood zone coords.x null reference (B1)
**File:** `src/app/(dashboard)/market-intel/map-layers-renderer.tsx` lines 255-260
**Problem:** `getTileUrl()` override calls `map.unproject([coords.x * tileSize, ...])` but `coords` can be undefined during map init, throwing "Cannot read properties of undefined (reading 'x')."
**Fix:** Add null guard at top of `getTileUrl`:
```
if (!coords || coords.z === undefined || !this._map) return "";
```

### 1.2 — Add Leaflet loading skeleton (B3)
**File:** `src/app/(dashboard)/market-intel/map-search.tsx`
**Problem:** Map container is blank white for 500-2000ms while Leaflet JS downloads from CDN.
**Fix:** When `leafletLoaded` is false, render a skeleton placeholder in the map container div:
- Light gray background
- Pulsing `animate-pulse` overlay
- Centered "Loading map..." text or a map icon
- Same dimensions as the map container so there's no layout shift when the real map renders

### 1.3 — Add error toast for API failures (B2)
**File:** `src/app/(dashboard)/market-intel/map-search.tsx` (multiple catch blocks at lines ~536, 745, 1094, 1200, 1291)
**Problem:** All API errors silently log to console. User sees empty layers with no explanation.
**Fix:** Add a state variable `apiError` (string or null). In each catch block, set it with a user-friendly message. Render a toast/banner at the top of the map: "Some data layers couldn't load. Try panning or zooming to retry." Auto-dismiss after 8 seconds. Don't show duplicate toasts if multiple calls fail simultaneously — debounce or use a ref to track if a toast is already showing.

---

## Batch 2: Performance Fixes

### 2.1 — Add AbortController to viewport fetches (P1)
**Files:** `src/app/(dashboard)/market-intel/map-search.tsx`, `src/app/(dashboard)/market-intel/street-intel-actions.ts`, `src/app/(dashboard)/market-intel/map-actions.ts`

**Problem:** Rapid panning queues 18-24 inflight HTTP requests because old requests aren't cancelled.

**Fix approach:**
1. In `map-search.tsx`, create a single `AbortController` ref (e.g., `viewportAbortRef`).
2. On every `moveend` handler, before firing new requests:
   - Abort the previous controller: `viewportAbortRef.current?.abort()`
   - Create a new controller: `viewportAbortRef.current = new AbortController()`
   - Pass `viewportAbortRef.current.signal` to all server action calls
3. In server actions (`map-actions.ts`, `street-intel-actions.ts`), accept an optional `signal?: AbortSignal` parameter and pass it to `fetch()` calls.
4. In the component, catch `AbortError` silently (don't show error toast for aborted requests).

**Important:** Server actions in Next.js don't natively support AbortSignal. The pattern is:
- For `"use server"` actions that call `fetch()` internally, the signal needs to be passed to the underlying `fetch()` call.
- If the server action uses Prisma or non-fetch calls, AbortController won't help — instead, use a `fetchId` pattern (increment a counter, ignore results if counter has moved on). Check if `fetchId` is already implemented and strengthen it if so.

**Audit the existing code first:** The report mentions fetchId guards may already exist. Read all the moveend handlers and understand the current cancellation strategy before adding AbortController. Don't break what's already working.

### 2.2 — Align debounce timers to single 800ms timer (P2)
**File:** `src/app/(dashboard)/market-intel/map-search.tsx`

**Problem:** 9 different debounce intervals (300ms-1200ms) stagger API calls over 900ms, creating a waterfall.

**Current debounce map:**
| Function | Current | Line |
|----------|---------|------|
| Building labels | 300ms | ~1601 |
| Construction | 600ms | ~1309 |
| Recent sales | 600ms | ~1390 |
| Violations | 700ms | ~1468 |
| 311 Complaints | 700ms | ~1550 |
| Properties (PLUTO) | 800ms | ~615 |
| Vitality | 800ms | ~1224 |
| New developments | 900ms | ~1007 |
| Hot leads | 1200ms | ~1115 |

**Fix:** Create a single `moveend` handler with one 800ms debounce that calls ALL enabled layer fetch functions in parallel. This replaces 9 individual debounced handlers with 1 coordinator.

**Implementation:**
1. Create a single `handleViewportChange` function (debounced at 800ms).
2. Inside it, check which layers are enabled and fire all their fetch functions simultaneously with `Promise.allSettled()`.
3. Each layer's fetch function should still check its own `minZoom` before making an API call.
4. Remove the individual per-layer debounce wrappers.

**Important:** Make sure the building labels still load slightly after properties (they depend on property data). If there's a data dependency, keep labels as a chained call after properties resolve, not a separate debounce.

### 2.3 — Parallelize enrichment batch queries (P4)
**File:** `src/app/(dashboard)/market-intel/street-intel-actions.ts` lines ~455-596

**Problem:** `fetchRecentSalesByBlocks()` and `fetchViolationCountsByBlocks()` loop over blocks in 50-block chunks **sequentially** (await per batch). 200 blocks = 4 sequential queries = 32 seconds.

**Fix:** Change sequential `for...of await` to `Promise.all()` on all chunks simultaneously. Cap at 4 concurrent requests to avoid rate limiting:
```typescript
// Instead of:
for (const chunk of chunks) {
  const results = await fetchChunk(chunk);
  // ...
}

// Do:
const results = await Promise.all(
  chunks.map(chunk => fetchChunk(chunk))
);
```

If rate limiting is a concern, use a simple concurrency limiter (process 4 chunks at a time):
```typescript
async function parallelBatches<T>(items: T[][], fn: (batch: T[]) => Promise<any>, concurrency = 4) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}
```

### 2.4 — Enable Canvas rendering (P5)
**File:** `src/app/(dashboard)/market-intel/map-search.tsx` — map initialization (around line 511)

**Problem:** Leaflet uses SVG renderer by default. Every circleMarker creates a `<circle>` DOM element. At zoom 17+ with all layers, estimated 650-1,200 SVG DOM elements.

**Fix:** Add `preferCanvas: true` to the map initialization options:
```typescript
const map = L.map(mapRef.current, {
  center: initCenter,
  zoom: initZoom,
  zoomControl: false,
  preferCanvas: true,  // ADD THIS
  maxBounds: L.latLngBounds(...)
```

**Test carefully:** Canvas rendering changes how hover/tooltip detection works. Verify:
- Hover highlights still work on building markers
- Click events still fire correctly on markers
- Tooltips still appear on hover
- The "search highlight pulse" animation still renders (may need CSS animation fallback)

If Canvas breaks hover behavior, an alternative is to set `renderer: L.canvas()` only on specific high-volume layer groups while keeping SVG for interactive markers.

### 2.5 — Add useMemo to sorted results list (P6)
**File:** `src/app/(dashboard)/market-intel/map-search.tsx` (~line 1967)

**Problem:** `filteredBoundsResults` sorts 2,000 properties on every render without memoization.

**Fix:** Wrap in `useMemo`:
```typescript
const filteredBoundsResults = useMemo(() => {
  // existing sort/filter logic
}, [sortBy, properties, enrichmentCounts, /* other actual deps */]);
```

### 2.6 — Validate sessionStorage restore data
**File:** `src/app/(dashboard)/market-intel/map-search.tsx` lines ~503-510

**Problem:** Restored lat/lng/zoom from sessionStorage is not validated. NaN or extreme values could break map init.

**Fix:** Add bounds checking:
```typescript
try {
  const saved = sessionStorage.getItem("vettdre-map");
  if (saved) {
    const p = JSON.parse(saved);
    if (typeof p.lat === 'number' && typeof p.lng === 'number' && typeof p.zoom === 'number' &&
        p.lat >= 39 && p.lat <= 42 && p.lng >= -75 && p.lng <= -72 && p.zoom >= 10 && p.zoom <= 20) {
      initCenter = [p.lat, p.lng];
      initZoom = p.zoom;
    }
  }
} catch {}
```

---

## Batch 3: UX Polish

### 3.1 — Active filter summary bar
**File:** `src/app/(dashboard)/market-intel/map-search.tsx`

**Problem:** Users can't tell which filters are active without opening the filter panel.

**Fix:** Below the search bar (or below the Layers button), render a compact inline summary when any filters are active. Something like: "Manhattan · 6-100 units · Built after 1960 · [Clear all]". Only show when at least one filter differs from defaults. The "Clear all" link resets all filters.

### 3.2 — Mobile "Finish Drawing" button (B6)
**File:** `src/app/(dashboard)/market-intel/map-search.tsx` lines ~1606-1714

**Problem:** Polygon drawing finishes on `dblclick` which doesn't work well on mobile (double-tap = zoom).

**Fix:** When draw mode is active, show a floating "Finish Drawing" button (visible on all viewports but especially important on mobile). Clicking it closes the polygon and exits draw mode. Also show a "Cancel" button to discard the polygon.

---

## Verification

After all fixes, verify:
1. `npx tsc --noEmit` — zero new TypeScript errors
2. The flood zone layer can be toggled on/off without console errors
3. Rapid panning (3+ times quickly) doesn't queue excessive requests (check Network tab behavior)
4. All layer data loads correctly after the debounce unification
5. Canvas rendering doesn't break hover/click interactions
6. Building labels still render correctly after properties load
7. The loading skeleton shows during initial Leaflet download
8. Error toast appears when simulating an API failure (can test by temporarily breaking a fetch URL)
9. The enrichment queries complete faster than before (should be ~4x improvement)

---

## Constraints
- Do NOT add any new npm dependencies. All fixes use what's already in the project.
- Do NOT restructure the component tree (that's Phase 3). All changes stay in the existing file structure.
- Do NOT change the visual design of the map (colors, marker sizes, etc.) — only fix bugs and add the skeleton/toast/filter-summary.
- Preserve all existing functionality — this is performance and polish, not a feature rewrite.
- Follow existing code patterns (server actions with `"use server"`, Tailwind for styling, Lucide for icons).

## Discovery Instructions

**Before writing any code, read these files:**
```
MAP_AUDIT_REPORT.md                                       # Full audit findings (reference)
src/app/(dashboard)/market-intel/map-search.tsx            # THE main file — read completely
src/app/(dashboard)/market-intel/map-layers-renderer.tsx   # Layer rendering
src/app/(dashboard)/market-intel/map-actions.ts            # Server actions for map data
src/app/(dashboard)/market-intel/street-intel-actions.ts   # Street-level data fetches
src/lib/map-layers.ts                                      # Layer definitions
```

**After reading, propose a plan before writing any code.** Include which fixes you'll tackle in what order, and flag any concerns about the Canvas rendering change or debounce unification.
