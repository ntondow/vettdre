# Terminal Handoff Prompt 8: Right Panel — Building Profile Integration

## Goal
Replace the Terminal's simplified right panel with the full BuildingProfile component from Market Intel. When a user clicks a BBL in any Terminal event card, the right panel should show the same rich property deep-dive (PLUTO data, violations, permits, ownership chain, comps) that exists in Market Intel — not the stripped-down JSON dump currently there. The building profile is self-contained and handles its own data fetching; we just need to wire it up correctly.

## Project
Repo: VettdRE (this repo)
Files to modify:
- `src/app/(dashboard)/terminal/components/terminal-feed.tsx` (modify right panel section)

Files to reference (read-only):
- `src/app/(dashboard)/market-intel/building-profile.tsx`
- `src/app/(dashboard)/market-intel/building-profile-modal.tsx`

## Discovery Instructions
Before writing any code, read the following files:

1. `src/app/(dashboard)/market-intel/building-profile.tsx` — Read the props interface at the top of the file. The component accepts:
   - `boroCode: string` (e.g., "1" for Manhattan)
   - `block: string` (block number)
   - `lot: string` (lot number)
   - `address?: string`
   - `borough?: string`
   - `ownerName?: string`
   - `onClose: () => void`
   - `onNameClick?: (name: string) => void`
   - `plutoData?: PlutoDataProp` (pre-fetched data for instant render)
   Note the PlutoDataProp interface — it expects: address, ownerName, unitsRes, unitsTot, yearBuilt, numFloors, bldgArea, lotArea, assessTotal, bldgClass, zoneDist, borough, zip, lat, lng.

2. `src/app/(dashboard)/market-intel/building-profile-modal.tsx` — The slide-over wrapper. Note the overlay pattern: `fixed inset-0 z-[2000]`, `bg-black/40` backdrop, `ml-auto w-full md:max-w-3xl`. This is a LIGHT theme component.

3. `src/app/(dashboard)/terminal/components/terminal-feed.tsx` — Find the right panel section (the `{detailEvent && <aside>}` block). Understand:
   - How `handleBblClick` works (line ~140)
   - What `detailEvent` contains
   - The current simplified property detail rendering
   - The `detailLoading` state

4. `src/app/(dashboard)/terminal/components/terminal-event-card.tsx` — How BBL clicks propagate via `onBblClick` prop.

5. `src/lib/terminal-enrichment.ts` — The EnrichmentPackage interface. The `property_profile` section contains PLUTO-equivalent data that can be mapped to `PlutoDataProp`.

**Propose your plan before writing any code.**

## Implementation Intent

### BBL Parsing
Terminal stores BBL as a 10-character string (e.g., "3072650001") or hyphenated (e.g., "3-07265-0001"). The BuildingProfile component needs separate `boroCode`, `block`, `lot` strings. Add a BBL parser:

```typescript
function parseBBL(bbl: string): { boroCode: string; block: string; lot: string } | null {
  // Handle hyphenated: "3-07265-0001"
  if (bbl.includes('-')) {
    const parts = bbl.split('-');
    if (parts.length === 3) return { boroCode: parts[0], block: parts[1], lot: parts[2] };
  }
  // Handle 10-digit: "3072650001"
  if (bbl.length === 10) {
    return { boroCode: bbl[0], block: bbl.substring(1, 6), lot: bbl.substring(6) };
  }
  return null;
}
```

### PlutoData Mapping
Map the Terminal's EnrichmentPackage `property_profile` to BuildingProfile's `PlutoDataProp`:

```typescript
function enrichmentToPlutoData(ep: EnrichmentPackage): PlutoDataProp | undefined {
  const pp = ep?.property_profile;
  if (!pp) return undefined;
  return {
    address: pp.address || '',
    ownerName: pp.ownerName || '',
    unitsRes: pp.residentialUnits || 0,
    unitsTot: (pp.residentialUnits || 0) + (pp.commercialUnits || 0),
    yearBuilt: pp.yearBuilt || 0,
    numFloors: pp.floors || 0,
    bldgArea: pp.buildingArea || 0,
    lotArea: pp.lotArea || 0,
    assessTotal: 0,  // Not in enrichment package, BuildingProfile will fetch
    bldgClass: '',   // Same — BuildingProfile fetches full PLUTO
    zoneDist: pp.zoningDistricts?.[0] || '',
    borough: pp.borough || '',
    zip: pp.zipCode || '',
    lat: 0,  // BuildingProfile will get from PLUTO
    lng: 0,
  };
}
```

### Right Panel Replacement

Replace the current simplified `<aside>` content with the BuildingProfile component. Key considerations:

1. **Import BuildingProfile** with dynamic import (it's a heavy component):
   ```typescript
   const BuildingProfile = dynamic(
     () => import('@/app/(dashboard)/market-intel/building-profile').then(m => m.default || m.BuildingProfile),
     { loading: () => <LoadingSkeleton /> }
   );
   ```

2. **Don't use ProfileModal** — the Terminal already has its own right panel container. Embed BuildingProfile directly inside the existing `<aside>` wrapper, not wrapped in the modal overlay.

3. **Pass props** from the Terminal event's enrichment data:
   ```tsx
   <BuildingProfile
     boroCode={parsed.boroCode}
     block={parsed.block}
     lot={parsed.lot}
     address={detailEvent.enrichmentPackage?.property_profile?.address}
     borough={detailEvent.enrichmentPackage?.property_profile?.borough}
     ownerName={detailEvent.enrichmentPackage?.property_profile?.ownerName}
     onClose={() => setDetailEvent(null)}
     plutoData={enrichmentToPlutoData(detailEvent.enrichmentPackage)}
   />
   ```

4. **Theme adaptation**: BuildingProfile is a light-theme component. The Terminal right panel container should add a light background override so BuildingProfile renders correctly:
   ```tsx
   <aside className="hidden lg:flex flex-col w-[480px] border-l border-[#21262D] bg-white text-gray-900 overflow-y-auto">
     <BuildingProfile ... />
   </aside>
   ```
   This creates a clean visual separation: dark terminal feed on the left, light property detail on the right. This is intentional — the building profile has too many sub-components to retheme for dark mode in this prompt.

5. **Width adjustment**: Increase the right panel from `w-[400px]` to `w-[480px]` to give BuildingProfile enough room for its tabbed layout.

### Loading State

While BuildingProfile is loading (dynamic import + its own data fetches), show a skeleton that matches the Terminal's dark/light split:
- Dark panel header with BBL and address
- Light panel body with shimmer placeholder for tabs

### Close Behavior

When the user clicks BuildingProfile's close button (`onClose`), set `detailEvent(null)` which hides the right panel entirely and returns to the feed-only view.

## Constraints
- Do NOT modify BuildingProfile itself — it's a shared component used by Market Intel. Only modify terminal-feed.tsx.
- Do NOT wrap in ProfileModal — embed directly in the Terminal's existing aside container
- Use dynamic import for BuildingProfile to avoid loading it until the panel opens
- The right panel is desktop-only (`hidden lg:flex`). On mobile, clicking a BBL should remain a no-op for now (or open a simplified detail view — not BuildingProfile).
- If BBL parsing fails (malformed BBL), fall back to the existing simplified detail view
- The light background on the right panel is intentional — do not attempt to retheme BuildingProfile for dark mode
- Do NOT add new dependencies
