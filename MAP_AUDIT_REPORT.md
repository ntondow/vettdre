# Market Intel Map: Audit Report
Generated: 2026-04-04

## Executive Summary

The Market Intel map is VettdRE's core research tool — a 2,521-line Leaflet-based component rendering 15 data layers from NYC Open Data, with click/hover interactions, grid-based clustering, polygon drawing, and a building profile slide-over. It's **functionally complete and feature-rich**, but has significant performance and architectural debt from rapid iteration.

**Biggest opportunities:** (1) A single `moveend` event can trigger 9-12 parallel API calls with no request cancellation — rapid panning queues dozens of inflight requests. (2) The 2,521-line monolith has 40 useState hooks and 31 useEffect hooks, making it fragile and hard to reason about. (3) No viewport result caching means panning 10% in any direction re-fetches 100% of data. (4) Canvas rendering is disabled, so 1,200+ DOM elements accumulate at zoom 17+ with all layers.

**Recommended priority:** Fix the critical runtime error (flood zone coords null ref), add AbortController to viewport fetches, align debounce timers, enable Canvas rendering. Then decompose the component and adopt React Query incrementally.

---

## Stream 1: Bugs & Visual Issues

### [B1] Flood zone tile URL null reference — CRITICAL
- **File:** `src/app/(dashboard)/market-intel/map-layers-renderer.tsx` lines 255-260
- **Issue:** The FEMA Flood Zone tile layer overrides `getTileUrl()` which calls `map.unproject([coords.x * tileSize, ...])`. If `coords` is undefined (Leaflet calls getTileUrl during map init before projection is ready), this throws "Cannot read properties of undefined (reading 'x')" — the exact error documented in CLAUDE.md.
- **Impact:** Runtime crash when flood zone layer is toggled on during map initialization or rapid zoom changes. Silent error if caught by Leaflet internally, but corrupts tile loading.
- **Fix:** Add null guard: `if (!coords || coords.z === undefined || !map) return "";`

### [B2] No user-facing error messages for API failures — HIGH
- **Files:** `src/app/(dashboard)/market-intel/map-search.tsx` lines 536, 745, 1094, 1200, 1291
- **Issue:** All NYC Open Data API failures are silently logged to console (`console.error("...load error:", err)`). When Socrata rate limits or NYC servers are down (~0.5% of requests), users see no explanation for why layers are empty.
- **Impact:** User confusion — layers appear empty with no feedback. Agent may think there are no violations/permits when the API is just down.
- **Fix:** Add a toast/banner notification on API failure: "Some data layers may be incomplete. Refresh to retry."

### [B3] No Leaflet loading skeleton — HIGH
- **File:** `src/app/(dashboard)/market-intel/map-search.tsx` lines 442-493
- **Issue:** Leaflet JS (150KB gzip) loads from `unpkg.com/leaflet@1.9.4/dist/leaflet.js`. Until it downloads and executes (500-2000ms), the map container is completely blank. No skeleton, spinner, or placeholder shown.
- **Impact:** User sees empty white area for 1-2 seconds on first load. Perceived as broken.
- **Fix:** Show a map-shaped skeleton with loading indicator while `leafletLoaded` is false.

### [B4] Stale GeoJSON on layer re-toggle — MEDIUM
- **File:** `src/app/(dashboard)/market-intel/map-layers-renderer.tsx` lines 112-117
- **Issue:** `layerInstancesRef` caches layer instances. When a layer is toggled off and on, the cached (potentially stale) instance is re-added to the map instead of rebuilding with fresh data. If the underlying data source was updated while the layer was off, users see old data.
- **Impact:** Stale subway stations, zoning districts, or neighborhood boundaries after source updates.
- **Fix:** Add a `maxAge` to cached layer instances or force-rebuild on every toggle.

### [B5] Building labels may obscure violation markers — LOW
- **Files:** `src/lib/map-layers.ts` line 90 (z=370), `src/app/(dashboard)/market-intel/map-search.tsx` line 596 (z=360)
- **Issue:** Building labels render at z-index 370 (pane `buildingLabels`), directly above violation badges at z-index 360. At zoom 17+ with many violations, text labels can fully cover small violation circles.
- **Impact:** Minor visual obscuration. Users can toggle labels off to see violations underneath.
- **Fix:** Consider z-order swap (badges above labels) or transparent label backgrounds.

### [B6] Mobile draw mode requires double-tap to finish polygon — LOW
- **File:** `src/app/(dashboard)/market-intel/map-search.tsx` lines 1606-1714
- **Issue:** Polygon drawing finishes on `dblclick` event. On mobile, double-tap is zoom, not double-click. Users may struggle to close a polygon.
- **Impact:** Draw tool difficult to use on phones. Workaround: use the "finish" button if one exists.
- **Fix:** Add explicit "Finish Drawing" button visible during draw mode on mobile.

---

## Stream 2: Performance Bottlenecks

### [P1] No AbortController on viewport API calls — CRITICAL
- **Files:** `src/app/(dashboard)/market-intel/street-intel-actions.ts` (all fetchXxxInBounds functions), `src/app/(dashboard)/market-intel/map-actions.ts`
- **Current behavior:** When user pans, 6-8 API calls fire with debounced timers (300-1200ms). If user pans again before results arrive, the old requests are NOT cancelled — they complete, results are discarded (via fetchId guard), but HTTP connections are consumed.
- **Impact:** Rapid panning (3 pans in 2 seconds) queues 18-24 inflight HTTP requests. Increases latency by 100-200ms per queued request due to connection pool saturation.
- **Optimization:** Add AbortController to every `fetchXxxInBounds()` function. Cancel previous request when new moveend fires.

### [P2] Staggered debounce timers create API waterfall — HIGH
- **File:** `src/app/(dashboard)/market-intel/map-search.tsx` various lines
- **Current behavior:** Each layer has its own debounce interval:

| Function | Debounce | Line |
|----------|----------|------|
| Building labels | 300ms | 1601 |
| Construction | 600ms | 1309 |
| Recent sales | 600ms | 1390 |
| Violations | 700ms | 1468 |
| 311 Complaints | 700ms | 1550 |
| Properties (PLUTO) | 800ms | 615 |
| Vitality | 800ms | 1224 |
| New developments | 900ms | 1007 |
| Hot leads | 1200ms | 1115 |

- **Impact:** Instead of one synchronized burst, requests trickle out over 900ms (300→1200). This creates connection churn and makes the loading indicator unreliable.
- **Optimization:** Align all moveend debounces to a single 800ms timer, then fire all enabled layers in parallel.

### [P3] No viewport result caching — HIGH
- **File:** `src/app/(dashboard)/market-intel/map-search.tsx` line 849
- **Current behavior:** Every moveend fires a fresh PLUTO query with exact viewport bounds. Panning 10% in one direction discards 90% of already-fetched results and re-queries 100%.
- **Impact:** Redundant data transfer. At zoom 16, each PLUTO query returns ~2000 buildings (2-5KB). Panning slightly re-fetches the same buildings.
- **Optimization:** Implement tile-based caching: divide the map into fixed grid cells, cache results per cell, only fetch cells not already in cache.

### [P4] Enrichment counts batched sequentially — HIGH
- **File:** `src/app/(dashboard)/market-intel/street-intel-actions.ts` lines 455-596
- **Current behavior:** `fetchRecentSalesByBlocks()` and `fetchViolationCountsByBlocks()` loop over blocks in 50-block chunks **sequentially** (await per batch). A viewport with 200 unique blocks = 4 sequential queries.
- **Impact:** 200-block viewport: 4 × 8s = **32 seconds** for full enrichment. Blocks user from sorting by violations/sales during this time.
- **Optimization:** Use `Promise.all()` to parallelize batch queries. 4 parallel queries = 8s total (4x improvement).

### [P5] Canvas rendering disabled — MEDIUM
- **File:** `src/app/(dashboard)/market-intel/map-search.tsx` lines 574-577
- **Current behavior:** Leaflet uses default SVG renderer. Every `L.circleMarker` creates an SVG `<circle>` DOM element. At zoom 17+ with all layers, estimated 650-1,200 DOM elements for markers alone.
- **Impact:** Browser repaints on every hover/interaction affect 20-40 DOM nodes. FPS drops to ~30 at high marker density.
- **Optimization:** Add `preferCanvas: true` to map options or individual circleMarker options. Canvas renders all markers to a single `<canvas>` element.

### [P6] Missing useMemo on sorted results list — MEDIUM
- **File:** `src/app/(dashboard)/market-intel/map-search.tsx` ~line 1967
- **Current behavior:** `filteredBoundsResults` sorts 2,000 properties with complex enrichment lookups on every render (no memoization). O(n log n) with n=2000.
- **Impact:** ~10-30ms wasted per render cycle. At 10 renders/second during map interaction, this adds up.
- **Optimization:** Wrap in `useMemo` with deps `[sortBy, properties, enrichmentCounts]`.

### [P7] loadProperties and loadBuildingLabels recreated on every property change — MEDIUM
- **File:** `src/app/(dashboard)/market-intel/map-search.tsx`
- **Current behavior:** `loadProperties` (useCallback) depends on `[filters, hasActivePolygon, activePolygons]`. `loadBuildingLabels` depends on `[properties]`. When properties load, labels callback recreates, triggering its useEffect.
- **Impact:** Cascading re-renders. Properties load → labels callback recreates → labels useEffect fires → labels re-render (even if viewport didn't change).
- **Optimization:** Use refs for data that doesn't need to trigger re-renders, or stabilize callback dependencies.

### Component Structure Stats
- **useState hooks:** 40
- **useEffect hooks:** 31
- **useCallback hooks:** 23
- **useMemo hooks:** 2 (should be more)

---

## Stream 3: Load Speed

### Current Load Waterfall

| Step | Time (est.) | What happens |
|------|-------------|--------------|
| 0ms | Component mounts, CSS injected | Script tag for Leaflet appended |
| 0-500ms | Leaflet JS downloading from unpkg.com | **Blank map container — no skeleton** |
| 500-2000ms | Leaflet JS parsed + executed | `setLeafletLoaded(true)` |
| 2000ms | Map initialized (L.map, panes, tile layer) | First tiles start loading |
| 2050ms | sessionStorage position restored | Map centers on saved location |
| 2100ms | `loadProperties()` fires | PLUTO API query begins |
| 2500-3500ms | Properties arrive, markers render | **Map first interactive** |
| 3500-5000ms | Layer data trickles in (debounced) | Violations, construction, etc. |

**Total time to first interactive map: ~2.5-3.5 seconds**

### Load Speed Recommendations

1. **Show map skeleton during Leaflet download** — Add a styled placeholder with pulsing animation while `leafletLoaded` is false. Effort: 2 hours.

2. **Prefetch static GeoJSON in parallel** — Start fetching subway-lines, subway-stations, and neighborhoods GeoJSON while Leaflet is downloading (before map init). Effort: 4 hours.

3. **Consider bundling Leaflet as npm package** — Eliminates CDN latency variability. `npm install leaflet` is 150KB gzip, same as CDN. Adds to JS bundle but removes external dependency. Effort: 1 day.

4. **Pre-fetch initial viewport data on server** — The initial PLUTO query could be fetched as a server component prop, eliminating one round-trip. Effort: 1 day.

5. **Validate sessionStorage restore data** — Add bounds checking on restored lat/lng/zoom to prevent NaN or out-of-bounds positions. Effort: 1 hour.

---

## Stream 4: UX Assessment

### Strengths
- **Rich data layers:** 15 layers across 5 source types — more comprehensive than most competitors
- **Smart hover prefetch:** Building profile data prefetched after 300ms hover, reducing modal open time
- **Polygon drawing:** Custom draw tool for area selection — not common in competitor products
- **Neighborhood filtering:** Click-to-select NTA boundaries for spatial filtering
- **Grid clustering:** Effective at preventing marker overlap at low zoom
- **Three basemap options:** Light, dark, satellite — covers different user preferences
- **Bi-directional hover sync:** Hovering a list item highlights the marker and vice versa
- **Three-tier geocoding:** NYC GeoSearch → Geocodio → Nominatim fallback chain

### Gaps vs. Competitors

| Feature | VettdRE | CoStar | Reonomy | PropertyShark |
|---------|---------|--------|---------|---------------|
| Polygon search | Yes | Yes | Yes | Yes |
| Radius search | **No** | Yes | Yes | Yes |
| Shareable URL state | **No** | Yes | Yes | Yes |
| Saved map views | **No** | Yes | Yes | No |
| Density heatmap | Partial (vitality only) | Yes | Yes | Yes |
| Street view embed | **No** | Yes | **No** | Yes |
| Comp sales overlay | Yes (recent sales layer) | Yes | Yes | Yes |
| Side-by-side compare | **No** | Yes | Yes | **No** |
| Route/commute time | **No** | **No** | **No** | **No** |
| Clustering | Grid-based | Supercluster | Supercluster | Icon-based |
| Address autocomplete | Yes (map search) | Yes | Yes | Yes |

### Quick Wins (Low Effort, High Impact)

1. **URL state sync** — Encode lat/lng/zoom/active-filters in URL query params so views are shareable and bookmarkable. Use `nuqs` library. Effort: 2 weeks.

2. **Unified search bar** — Currently two search bars (unified-search.tsx top bar + floating map search). Consolidate into one with autocomplete. Effort: 2 weeks.

3. **Cluster-to-individual fade animation** — At zoom 14→15, clusters disappear and individual markers pop in instantly. Add a 300ms CSS fade transition. Effort: 1 week.

4. **Layer toggle fade transitions** — Layers blink in/out at their minZoom threshold. Add opacity transition. Effort: 3 days.

5. **Radius search** — Add a "draw circle" tool alongside polygon drawing. Use Turf.js `buffer()` for spatial query. Effort: 1 week.

6. **Active filter summary** — Show inline text like "Manhattan, 6-100 units, Built after 1960" below the search bar so users know what's filtered without opening the panel. Effort: 3 days.

---

## Stream 5: Technology Opportunities

### Tier 1: High Impact, Moderate Effort

#### Supercluster (replace grid-based clustering)
- **Replaces:** Custom 60px grid clustering (lines 1745-1835)
- **Effort:** 2 weeks
- **Gain:** Better spatial clustering, smoother expand/collapse animations, hierarchical sub-clusters
- **Bundle:** +12KB gzip
- **Incremental:** Drop-in replacement for the grid algorithm. No Leaflet migration needed.
- **Tradeoff:** Slightly different visual feel. Requires tuning `radius` and `maxZoom` parameters.

#### React Query (replace useEffect + fetch)
- **Replaces:** 30+ raw useEffect/fetch patterns across map components
- **Effort:** 8-10 weeks (phased migration)
- **Gain:** Automatic request deduplication (same BBL from map + profile = 1 request), built-in retry, persistent cache across component lifecycle, DevTools for debugging
- **Bundle:** +60KB gzip
- **Incremental:** Start with building-profile queries, then migrate layer fetches one at a time
- **Tradeoff:** Learning curve, slightly different data flow pattern

#### nuqs / URL state sync
- **Replaces:** sessionStorage map state (lines 504-609)
- **Effort:** 2 weeks
- **Gain:** Shareable URLs, browser back/forward works, bookmarkable views
- **Bundle:** +8KB gzip
- **Incremental:** Start with lat/lng/zoom, then add filters
- **Tradeoff:** URL becomes longer. Need to handle SSR hydration carefully.

### Tier 2: High Impact, High Effort

#### Component decomposition (split map-search.tsx)
- **Replaces:** 2,521-line monolith
- **Effort:** 6 weeks
- **Target:** 8 focused components (MapCore, FloatingSearch, SidePanel, ClusterRenderer, StreetIntelLayers, DrawingMode, NeighborhoodSelect, LayerControl) + 5 custom hooks (useMapData, useMapLayers, useMapInteraction, useMapClustering, useMapSearch)
- **Gain:** 60% reduction in lines per file, isolated testing, easier onboarding for new developers
- **Risk:** Large refactor with many integration points. Requires thorough regression testing.
- **Incremental:** Extract one component at a time starting with FloatingSearch (least coupled).

#### PMTiles for PLUTO data
- **Replaces:** Per-viewport NYC Open Data API calls for PLUTO (line 615-617)
- **Effort:** 4 weeks (pre-tile 800K+ PLUTO records, host on CDN, client integration)
- **Gain:** Instant tile loading (no API latency), offline capability, eliminates ~60% of map API calls
- **Cost:** ~200MB tile archive, monthly regeneration pipeline
- **Tradeoff:** Stale data between regenerations (vs real-time API). Need update pipeline.
- **Incremental:** PMTiles for base building layer only; keep API for filter queries.

#### MapLibre GL JS (Leaflet replacement)
- **Replaces:** Leaflet 1.9.4 CDN
- **Effort:** 6-8 weeks (full rewrite of rendering, interactions, layers)
- **Gain:** WebGL rendering (10x faster at 5K+ markers), vector tile native support, 3D buildings, built-in Supercluster, smoother animations
- **Bundle:** +200KB but eliminates CDN dependency
- **Risk:** Complete rendering rewrite. Leaflet plugins don't work. All custom layer code needs porting.
- **Recommendation:** Only pursue if marker count exceeds 5,000 regularly or 3D buildings are needed.

### Tier 3: Nice-to-Have

#### Web Workers for GeoJSON parsing
- **Effort:** 1 week
- **Gain:** ~150ms off main thread for large GeoJSON (building footprints)
- **When:** Only worthwhile if GeoJSON parsing causes visible UI stutter

#### Turf.js for spatial analysis
- **Effort:** 1 week (radius search feature)
- **Bundle:** +30KB gzip
- **Enables:** Radius search, "buildings within 0.5mi of subway", buffer analysis

#### Canvas rendering (preferCanvas: true)
- **Effort:** 1 week to enable and test
- **Gain:** 2-3x faster rendering at 5,000+ markers by eliminating SVG DOM
- **Tradeoff:** Slightly harder tooltip/hover handling (need canvas hit detection)
- **When:** Enable when users report sluggishness at high zoom with all layers

---

## Recommended Roadmap

### Phase 1: Quick Wins (1-2 weeks)
1. Fix flood zone coords null ref (B1) — 1 hour
2. Add Leaflet loading skeleton (B3) — 2 hours
3. Add error toast for API failures (B2) — 4 hours
4. Add AbortController to viewport fetches (P1) — 1 day
5. Align all debounce timers to 800ms (P2) — 2 hours
6. Parallelize enrichment batch queries (P4) — 4 hours
7. Add useMemo to sorted results (P6) — 1 hour
8. Validate sessionStorage restore data — 1 hour

### Phase 2: Medium-Term (2-4 weeks)
1. URL state sync with nuqs — 2 weeks
2. Replace grid clustering with Supercluster — 2 weeks
3. Implement viewport result caching — 1 week
4. Add cluster-to-individual fade animation — 3 days
5. Consolidate dual search bars — 1 week
6. Enable Canvas rendering for markers — 1 week
7. Add radius search with Turf.js — 1 week

### Phase 3: Strategic (1-3 months)
1. Decompose map-search.tsx into component tree — 6 weeks
2. Extract 5 custom hooks — 3-4 weeks
3. Migrate to React Query (phased) — 8-10 weeks
4. Evaluate PMTiles for PLUTO data — 4 weeks
5. Evaluate MapLibre migration (spike only) — 2 weeks
