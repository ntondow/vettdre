# Market Intel Map: UI Bug Fixes — Claude Code Handoff

## Goal
Fix two visual bugs on the Market Intel map that are visible in production right now. These are quick, surgical CSS/layout fixes.

## Project
- **Repo:** VettdRE (Next.js 16, TypeScript, Tailwind CSS)
- **Primary file:** `src/app/(dashboard)/market-intel/map-search.tsx`

---

## Bug 1: Map tiles not loading (CSP already fixed — verify only)

**ALREADY FIXED in `next.config.ts`.** The CSP `img-src` was missing the actual tile domains (`*.basemaps.cartocdn.com` for CARTO street/dark basemaps, `server.arcgisonline.com` for satellite). This has been corrected. No code changes needed — just verify the CSP now reads:

```
img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com
```

**No action required for this bug.**

---

## Bug 2: "rties..." text truncated and overlapping the Layers button

**Location:** Top-left of map, next to the `Layers` button with the green badge.

**What's happening:** There is truncated text showing "rties..." that appears to be from a property counter or filter label bleeding into the Layers button area. This text should not be visible in this position — it's either:
1. A property count element that's positioned incorrectly and overlapping
2. An element with insufficient `overflow-hidden` or `text-overflow: ellipsis` missing
3. A z-index issue causing text behind the Layers button to show through

**How to find it:** Search for elements near the Layers button in the top-left. The Layers button is rendered by `LayerControl` component. Check for:
- Any sibling or adjacent elements that might be overflowing
- The `NtaNeighborhoodFilter` component which renders in the same top-left area
- Any absolutely positioned elements that might overlap

**File:** `src/app/(dashboard)/market-intel/map-search.tsx` — check the JSX around lines 2242-2250 where `LayerControl` is rendered, and also check `src/app/(dashboard)/market-intel/layer-control.tsx`.

**Fix:** Find the overlapping element and either:
- Add `overflow-hidden` and `truncate` classes
- Fix its positioning so it doesn't overlap the Layers button
- Hide it if it's redundant information

---

## Bug 3: "No public" and "Clear all" filter summary positioned poorly

**Location:** Below the search bar, floating in the middle of the map.

**What's happening:** The active filter summary bar (just added in the latest map fixes) shows pills like "No public" and a "Clear all" link. It's positioned at `top-16 md:top-14` with `left-1/2 -translate-x-1/2`, which puts it directly below the search bar. But:
1. It's too close to the search bar — overlapping or nearly touching
2. On the current view it looks disconnected and floating awkwardly
3. The "No public" pill text is confusing without context (should say "Exclude public housing" or similar)

**File:** `src/app/(dashboard)/market-intel/map-search.tsx` around line 2319-2336.

**Current code:**
```tsx
{activeFilterCount > 0 && (
  <div className="absolute top-16 md:top-14 left-1/2 -translate-x-1/2 z-[999] max-w-md">
    <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm flex items-center gap-2 text-xs text-slate-600 flex-wrap">
      ...
      {filters.excludePublic ? <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">No public</span> : null}
      <button onClick={clearFilters} className="text-blue-600 hover:text-blue-800 font-medium ml-1">Clear all</button>
    </div>
  </div>
)}
```

**Fix:**
1. **Reposition:** Attach the filter summary directly below the search bar container instead of using absolute positioning with magic `top-16` values. Consider making it part of the search bar's wrapper div so it moves with it naturally.
2. **Better label:** Change "No public" to "No public housing" for clarity.
3. **Spacing:** Add `mt-1` or `mt-1.5` gap between the search bar and the filter summary.
4. **Mobile:** On mobile, the search bar uses `left-3 right-16` positioning. The filter summary should follow the same bounds, not center itself at `left-1/2`.
5. **Visual polish:** The filter summary should feel like a natural extension of the search bar, not a separate floating element. Consider:
   - Matching the search bar's width
   - Using a slightly smaller font or lighter styling
   - Adding individual "x" dismiss buttons on each pill (not just "Clear all")

---

## Verification

After fixes:
1. `npx tsc --noEmit` — zero new TypeScript errors
2. No text overlaps the Layers button
3. The filter summary bar sits cleanly below the search bar on both desktop and mobile
4. Filter pills show descriptive text (not abbreviations like "No public")
5. "Clear all" resets all filters and hides the summary bar
6. Take a screenshot-level look at the top of the map — nothing should overlap or truncate

## Constraints
- Small surgical fixes only — do not restructure the component
- Follow existing Tailwind patterns
- Do not change functionality, only positioning and text labels

## Discovery Instructions
Read these files before making changes:
```
src/app/(dashboard)/market-intel/map-search.tsx    # Lines 2240-2340 (LayerControl area + filter summary)
src/app/(dashboard)/market-intel/layer-control.tsx  # Layers button rendering
next.config.ts                                      # Verify CSP fix is present (line 48)
```
