# Market Intel Map: Deep-Dive Audit — Claude Code Handoff

## Goal
Perform a comprehensive audit of the Market Intel map feature across 5 dimensions: bugs/visual issues, performance, load speed, UX quality, and technology opportunities. Do NOT fix anything yet — produce a prioritized findings report with specific recommendations, saved to `MAP_AUDIT_REPORT.md` at the project root.

## Project
- **Repo:** VettdRE (Next.js 16, TypeScript, Leaflet 1.9.4 via CDN, Supabase)
- **Map code:** `src/app/(dashboard)/market-intel/` (83 files, ~32K lines), `src/lib/map-*.ts`, `src/lib/neighborhoods*.ts`, `src/lib/cache-*.ts`, `src/lib/data-fusion-engine.ts`, `src/lib/nyc-opendata.ts`, `src/lib/vitality-*.ts`

## Context
The map is VettdRE's core research tool — agents spend most of their time here. It uses Leaflet loaded from unpkg CDN (not an npm package), renders 15 data layers across 5 source types (static GeoJSON, server-action, viewport-api, ArcGIS raster, viewport-PLUTO), and makes live NYC Open Data API calls on every pan/zoom. The main file `map-search.tsx` is 2,521 lines. Performance and UX quality directly impact agent productivity and retention.

---

## Audit Stream 1: Bugs, Visual Issues & Errors

**Goal:** Find rendering bugs, overlapping text, broken interactions, spacing issues, z-index conflicts, and error states.

**Read these files completely:**
```
src/app/(dashboard)/market-intel/map-search.tsx          # 2,521 lines — THE main file
src/app/(dashboard)/market-intel/map-layers-renderer.tsx  # 607 lines — layer rendering
src/app/(dashboard)/market-intel/layer-control.tsx        # 223 lines — layer toggle UI
src/lib/map-layers.ts                                     # 446 lines — 15 layer definitions
src/lib/map-styles.ts                                     # 229 lines — visual config
```

**Check for:**
- **Z-index conflicts:** 9 panes (z300-z450) — do layers overlap incorrectly? Do tooltips render behind other layers?
- **Text overlap:** Building labels render at z17+ — do they collide with violation badges (z360) or construction markers (z420)?
- **Tooltip conflicts:** Multiple layers can show tooltips — what happens when markers from different layers are close together?
- **Mobile rendering:** Does the map work on phones? Touch interactions? Pinch zoom? Does the "View List" sidebar cause layout issues on mobile?
- **Error handling:** What happens when NYC Open Data API calls fail? When the user pans faster than data loads? When a layer source is down?
- **Known issue from CLAUDE.md:** "Cannot read properties of undefined (reading 'x')" — is this still present? Where does it occur?
- **Memory leaks:** Are Leaflet layers/markers properly cleaned up when removed or when the component unmounts? Check for missing `removeLayer()` or `clearLayers()` calls.
- **State sync:** Do filter changes correctly trigger map re-renders? Are there stale-data scenarios where the map shows old results after a filter change?
- **Basemap switching:** Do all 3 basemap options work? Do layers render correctly on each basemap?
- **Search address:** Does geocoding work? Does the marker placement match the searched address?

---

## Audit Stream 2: Performance & Speed

**Goal:** Identify every performance bottleneck. The map should feel instant — sub-200ms for pan/zoom, sub-1s for layer data load.

**Read these files completely:**
```
src/app/(dashboard)/market-intel/map-search.tsx           # Main component — look at ALL useEffect hooks, API calls, re-render triggers
src/app/(dashboard)/market-intel/map-actions.ts           # 340 lines — NYC Open Data fetches
src/app/(dashboard)/market-intel/map-layers-renderer.tsx  # Layer rendering logic
src/app/(dashboard)/market-intel/street-intel-actions.ts  # 596 lines — street-level data fetches
src/app/(dashboard)/market-intel/neighborhood-actions.ts  # 465 lines — NTA data
src/app/(dashboard)/market-intel/vitality-actions.ts      # 197 lines — vitality scores
src/lib/cache-manager.ts                                  # 268 lines — caching strategy
src/lib/cache-warming.ts                                  # 67 lines — pre-warming
src/lib/data-fusion-engine.ts                             # 2,492 lines — data fusion
src/lib/nyc-opendata.ts                                   # 219 lines — API wrappers
```

**Analyze and answer these questions:**

### Data fetching
- How many API calls fire on a single pan/zoom event? List every network request triggered by `moveend`/`zoomend`.
- Is there debouncing on map movement? What's the debounce interval? Is it too aggressive or too conservative?
- Are API calls cancelled when the user pans again before results arrive? (AbortController?)
- Which API calls are the slowest? NYC Open Data PLUTO queries can take 2-5 seconds — is this being handled?
- Are there redundant API calls? (e.g., fetching the same data for overlapping viewport areas)

### Rendering
- How many DOM elements does the map create at typical zoom levels? At z17+ with all layers on?
- Are `circleMarker` used everywhere per the CLAUDE.md convention, or are there heavyweight `Marker` instances?
- Are GeoJSON layers using `pointToLayer` with `circleMarker` for point data?
- Is Canvas rendering enabled (`preferCanvas: true`) or is it using SVG (default, slower)?
- How are building labels rendered? Are they DOM elements (slow) or canvas/SVG?

### Component structure
- `map-search.tsx` is 2,521 lines — how many `useState` hooks does it have? How many `useEffect` hooks? Is there unnecessary re-rendering?
- Are expensive computations wrapped in `useMemo`? Are callback functions stable (wrapped in `useCallback`)?
- Does the component re-render when unrelated state changes (e.g., sidebar toggle causing map re-render)?

### Caching
- What's the cache hit rate likely to be? How long do cache entries live?
- Is `BuildingCache` in Supabase actually being used for map data, or is it only for building profiles?
- Are static GeoJSON files (subway lines, zoning, opportunity zones) loaded once and cached, or re-fetched?

### Bundle size
- Leaflet is loaded from CDN (unpkg.com) — is this blocking the initial render? Is there a loading state while Leaflet downloads?
- How large are the static GeoJSON files? Are they loaded lazily or upfront?
- Is `data-fusion-engine.ts` (2,492 lines) imported into the map component? If so, is tree-shaking working?

---

## Audit Stream 3: Initial Load Speed

**Goal:** The map should be interactive within 2 seconds of navigation. Identify everything that blocks or delays first paint.

**Trace the full initialization sequence:**
1. User clicks "Market Intel" in sidebar
2. What server components render first?
3. When does the client component mount?
4. When does the Leaflet `<script>` tag start downloading?
5. When does Leaflet finish loading and `setLeafletLoaded(true)` fire?
6. When does the map container initialize?
7. When does the first tile layer appear?
8. When do building markers start rendering?
9. When is the map fully interactive?

**Check for:**
- Is there a loading skeleton/spinner while Leaflet downloads?
- Could Leaflet be loaded from a faster CDN (cdnjs, jsdelivr) or bundled as an npm package?
- Could the initial viewport data be pre-fetched on the server (SSR) and passed as props?
- Is `sessionStorage.getItem("vettdre-map")` restore causing a flash of wrong location?
- Are there waterfall dependencies (A must finish before B starts) that could be parallelized?

---

## Audit Stream 4: UX Quality Assessment

**Goal:** Evaluate the map UX against best-in-class real estate mapping tools (CoStar, Reonomy, PropertyShark, Google Maps). Identify gaps and improvements.

**Read the UI files:**
```
src/app/(dashboard)/market-intel/map-search.tsx           # Main map + interactions
src/app/(dashboard)/market-intel/unified-search.tsx       # 771 lines — search bar
src/app/(dashboard)/market-intel/layer-control.tsx        # Layer panel
src/app/(dashboard)/market-intel/components/filter-panel.tsx  # 615 lines
src/app/(dashboard)/market-intel/components/results-panel.tsx # 417 lines
src/app/(dashboard)/market-intel/building-profile.tsx     # 1,012 lines — slide-over
src/app/(dashboard)/market-intel/nta-neighborhood-filter.tsx
```

**Evaluate:**

### Map interactions
- Click behavior: what happens when you click a building? Is there a delay? Does it feel responsive?
- Hover behavior: are there tooltips on hover? Are they useful? Do they appear fast enough?
- Cluster behavior: at low zoom, are dense areas readable or a mess of overlapping dots?
- Zoom UX: does zooming feel smooth? Are there jarring transitions when layers appear/disappear at their minZoom?
- Pan boundaries: the map has `maxBounds` for NYC — is this appropriate? Can agents accidentally pan to empty areas?

### Information hierarchy
- At each zoom level, is the right information visible? Too much? Too little?
- Is the color coding intuitive? (1-9 units = one color, 10-19 another, etc.)
- Are the most important actions (search, filter, click building) discoverable?

### Search & filter UX
- Is the search bar prominent enough? Does autocomplete work well?
- Are filters easy to apply/remove? Can you see which filters are active?
- Is there a "reset filters" option?

### Building profile slide-over
- Does it open fast enough after clicking a building?
- Is the information organized logically?
- Can you easily go from the profile to other actions (add to prospects, create contact, run deal analysis)?

### Missing features (compare to competitors)
- Drawing tools (polygon search, radius search)?
- Saved map views / bookmarks?
- Share a map view with a colleague (URL state)?
- Heat map mode for pricing/rent data?
- Street view integration?
- Comparable sales overlay on the map itself?
- Route/commute time from a point?
- Side-by-side comparison mode?

---

## Audit Stream 5: Technology & Architecture Opportunities

**Goal:** Identify open-source libraries, architectural patterns, and modern techniques that could significantly improve the map.

**Current stack:** Leaflet 1.9.4 from CDN, raw DOM manipulation, server actions for data, Supabase cache.

**Research and evaluate these alternatives/additions:**

### Map renderer
- **Mapbox GL JS / MapLibre GL JS** — WebGL-based, vector tiles, smoother zoom/pan, built-in clustering, 3D buildings. Would this be a worthwhile migration from Leaflet? What's the effort? MapLibre is free/open-source.
- **deck.gl** — GPU-accelerated large dataset rendering. Could overlay on Leaflet or MapLibre for massive marker counts.
- **Leaflet.markercluster** — If staying with Leaflet, would clustering improve the experience at low zoom?
- **Leaflet.VectorGrid** — Render vector tiles in Leaflet for better performance than GeoJSON.

### Data loading
- **Vector tiles (MVT/PBF)** — Instead of fetching GeoJSON from NYC Open Data on every pan, could we pre-process into vector tiles served from Supabase or a CDN? Tools: tippecanoe, Martin (PostGIS vector tile server).
- **PMTiles** — Single-file tile archives that can be served from static hosting. Could eliminate all the per-viewport API calls for PLUTO data.
- **SWR / React Query** — Client-side data fetching with caching, deduplication, background refresh. Better than raw `useEffect` + `fetch`.
- **Web Workers** — Move GeoJSON parsing and filtering off the main thread.

### Rendering performance
- **Canvas renderer** — Leaflet supports `preferCanvas: true` for L.CircleMarker. Is this enabled?
- **Supercluster** — Mapbox's clustering library. Works with Leaflet. Very fast even with 100K+ points.
- **Virtualized rendering** — Only render markers in the current viewport, not all loaded data.

### UX enhancements
- **Turf.js** — Spatial analysis in the browser (buffer, intersect, within, area). Could power polygon search, radius search, "show buildings within 0.5mi of subway."
- **Mapbox/MapLibre Geocoder** — Better address search than rolling your own.
- **URL state sync** — Encode map center/zoom/filters in the URL so views are shareable/bookmarkable. Libraries: `nuqs`, `next-usequerystate`.
- **Framer Motion** — Smooth transitions for the building profile slide-over and filter panel.

### Architecture
- **Component decomposition** — `map-search.tsx` at 2,521 lines is too large. How should it be split? Suggest a clean component tree.
- **Custom hooks** — Extract data fetching, layer management, and interaction handling into reusable hooks (e.g., `useMapData`, `useMapLayers`, `useMapInteraction`).
- **State management** — Is the current useState approach sufficient, or would Zustand/Jotai help manage the complex map state?

**For each technology recommendation, provide:**
- What it replaces or adds
- Estimated effort (hours/days)
- Performance impact (quantified if possible)
- Tradeoffs and risks
- Whether it requires a migration or can be incrementally adopted

---

## Output Format

Save findings to `MAP_AUDIT_REPORT.md` at the project root. Use this structure:

```markdown
# Market Intel Map: Audit Report
Generated: [date]

## Executive Summary
[2-3 paragraph overview of the map's current state, biggest opportunities, and recommended priorities]

## Stream 1: Bugs & Visual Issues
### [B1] [Title] — [CRITICAL/HIGH/MEDIUM/LOW]
- **File:** `path` line [N]
- **Issue:** [description]
- **Impact:** [what the user experiences]
- **Fix:** [recommendation]

## Stream 2: Performance Bottlenecks
### [P1] [Title] — [CRITICAL/HIGH/MEDIUM/LOW]
- **File:** `path` line [N]
- **Current behavior:** [what happens now]
- **Impact:** [measured or estimated delay]
- **Optimization:** [specific recommendation]

## Stream 3: Load Speed
### Current Load Waterfall
[List each initialization step with estimated timing]
### Recommendations
[Prioritized list of speed improvements]

## Stream 4: UX Assessment
### Strengths
[What's working well]
### Gaps vs. Competitors
[Missing features ranked by impact]
### Quick Wins
[Low-effort UX improvements]

## Stream 5: Technology Opportunities
### Tier 1: High Impact, Moderate Effort
[Recommendations with full analysis]
### Tier 2: High Impact, High Effort
[Bigger bets]
### Tier 3: Nice-to-Have
[Lower priority enhancements]

## Recommended Roadmap
[Suggested order of implementation in 3 phases: Quick wins (1-2 days), Medium-term (1-2 weeks), Strategic (1-2 months)]
```

## Constraints
- **READ ONLY.** Do not modify any files. This is an audit, not a fix session.
- Read every file listed above — do not skip or skim the large files.
- For performance analysis, count actual useState/useEffect hooks, API calls per interaction, and DOM elements.
- For technology recommendations, only suggest battle-tested open-source libraries (>5K GitHub stars, active maintenance).
- Consider that this is a Next.js 16 App Router project — recommendations must be compatible.
- The map currently uses Leaflet from CDN, not as an npm package — factor this into migration estimates.
- Be specific with line numbers and code references, not vague observations.

## Discovery Instructions

**Before starting the audit, read these files for context:**
```
CLAUDE.md                                                  # Full project architecture
src/app/(dashboard)/market-intel/map-search.tsx             # Start here — the entire map lives in this file
src/lib/map-layers.ts                                      # Layer definitions and pane config
src/app/(dashboard)/market-intel/map-layers-renderer.tsx    # How layers actually render
src/app/(dashboard)/market-intel/map-actions.ts             # Server actions for map data
src/app/(dashboard)/market-intel/street-intel-actions.ts    # Street-level data fetches
src/lib/cache-manager.ts                                   # Caching strategy
```

**Then proceed through all 5 audit streams in order.** Propose your audit plan before starting — list which files you'll read in what order.
