# Terminal Handoff Prompt 3: Event Enrichment Pipeline

## Goal
Build the enrichment pipeline that takes raw TerminalEvent records (created by the ingestion layer in Prompt 2) and assembles a structured data package for each event by performing BBL-keyed lookups across NYC Open Data. The enrichment package is the JSON payload that gets passed to the AI synthesis engine (Prompt 4). This prompt does NOT generate AI briefs — it only builds the data package.

## Project
Repo: VettdRE (this repo)
Target files: `src/lib/terminal-enrichment.ts` (new), `src/app/api/terminal/enrich/route.ts` (new)

## Discovery Instructions
Before writing any code, read the following files carefully — the enrichment pipeline REUSES most of its logic from existing code:

1. `src/lib/data-fusion-engine.ts` — **This is the most important file.** Read the full thing. Understand:
   - The `DATASETS` constant (~line 390) with all dataset IDs
   - `fetchBuildingIntelligence(bbl)` — the main orchestrator
   - `fetchBuildingCritical(bbl)` — Phase 1: PLUTO + HPD (fast path)
   - `fetchBuildingStandard(bbl)` — Phase 2: DOB + compliance
   - `fetchBuildingBackground(bbl)` — Phase 3: ownership chain
   - `cachedQueryNYC()` — the core cached SODA query function
   - How Promise.allSettled is used for resilience
   - The BuildingIntelligence type/interface that's returned

2. `src/lib/cache-manager.ts` — Read the full file. Understand:
   - SOURCE_CONFIG with TTLs per source
   - The 3-tier cache hierarchy (memory → per-source → DB)
   - `getBuilding()`, `getSource()`, `getSourcesFromDB()`
   - How stale data is served on error

3. `src/lib/entity-resolver.ts` — Read the key exports:
   - `normalizeAddress()` — address standardization
   - `isSameEntity()` — fuzzy name matching
   - `resolveOwner()` — best owner from multiple sources

4. `src/lib/comps-engine.ts` (first 100 lines) — Understand how comp searches work: same NTA, same building class, +/-20% area, trailing 12 months.

5. `src/lib/neighborhoods.ts` — How neighborhood/NTA lookup works from coordinates or zip codes.

6. `prisma/schema.prisma` — Find the TerminalEvent model. The enrichmentPackage Json field is where the assembled data goes.

**Propose your plan before writing any code.**

## Implementation Intent

### Core Enrichment Function

Create `enrichTerminalEvent(event: TerminalEvent): Promise<EnrichmentPackage>` that:

1. Takes a TerminalEvent with a BBL
2. Calls the existing data-fusion-engine functions to assemble context:
   - `fetchBuildingCritical(bbl)` for PLUTO profile + HPD violations
   - `fetchBuildingStandard(bbl)` for DOB permits + ECB violations
   - For Tier 1 events only: `fetchBuildingBackground(bbl)` for ownership chain
3. Assembles the EnrichmentPackage JSON structure

### EnrichmentPackage Schema

```typescript
interface EnrichmentPackage {
  event_core: {
    eventType: string;
    detectedAt: string;
    rawFields: Record<string, any>;  // Key fields from the triggering record
  };
  property_profile: {
    address: string;
    borough: string;
    neighborhood: string;
    ntaCode: string | null;
    zoningDistricts: string[];
    buildingClass: string;
    landUse: string;
    lotArea: number | null;
    buildingArea: number | null;
    residentialUnits: number | null;
    commercialUnits: number | null;
    floors: number | null;
    yearBuilt: number | null;
    ownerName: string | null;
    builtFAR: number | null;
    maxFAR: number | null;
    unusedFAR: number | null;
    unusedSqFt: number | null;  // (maxFAR - builtFAR) * lotArea
  } | null;
  valuation_context: {
    dofMarketValue: number | null;
    dofAssessedValue: number | null;
    taxClass: string | null;
    recentComps: Array<{
      address: string;
      saleDate: string;
      salePrice: number;
      units: number | null;
      pricePerUnit: number | null;
      pricePerSqFt: number | null;
    }>;
    ntaMedianPricePerUnit: number | null;
    ntaMedianPricePerSqFt: number | null;
    ntaTransactionCount: number | null;
  } | null;
  violation_profile: {
    openHpdViolations: { classA: number; classB: number; classC: number; classI: number };
    openDobViolations: number;
    activeStopWorkOrders: number;
    ecbPenaltyBalance: number | null;
    hpdLitigationCount: number;
    isAepEnrolled: boolean;
  } | null;
  permit_history: {
    activePermits: Array<{
      jobType: string;
      workType: string;
      estimatedCost: number | null;
      filingDate: string;
      status: string;
    }>;
    recentCOs: number;
  } | null;
  ownership_chain: {
    deedHistory: Array<{
      documentId: string;
      docType: string;
      recordedDate: string;
      amount: number | null;
      buyerName: string | null;
      sellerName: string | null;
    }>;
    holdPeriodYears: number | null;
    acquisitionPrice: number | null;
    currentOwnerLLC: string | null;
    dosRegisteredAgent: string | null;  // from NYS entity filings
  } | null;
  portfolio_intel: {
    otherProperties: Array<{
      bbl: string;
      address: string;
      recentActivity: string | null;
    }>;
  } | null;
}
```

### Enrichment Levels by Tier

- **Tier 1 events** (sales, major permits, foreclosures): Full enrichment — all fields populated. Call all 3 phases of data-fusion-engine plus comp search.
- **Tier 2 events** (violations, SWOs, ECB): Partial enrichment — property_profile + violation_profile + permit_history. Skip ownership chain and comps.
- **Tier 3 events**: No enrichment (these are background updates that silently update property profiles).

### Enrichment Cron / Processing Endpoint

Create `src/app/api/terminal/enrich/route.ts` that:

1. Validates CRON_SECRET bearer token
2. Queries for TerminalEvent records where `enrichmentPackage IS NULL` and `tier IN (1, 2)`, ordered by detectedAt DESC, limit 50
3. For each event, calls `enrichTerminalEvent()`
4. Updates the TerminalEvent with the assembled enrichmentPackage
5. Also updates the event's `ntaCode` field if it was null (resolved from PLUTO coordinates)
6. Returns summary: events enriched, errors, duration

This endpoint is called by the same Cloud Scheduler, offset from ingestion (e.g., ingestion at :00/:15/:30/:45, enrichment at :05/:20/:35/:50).

### Reuse Strategy

The critical insight: **do not duplicate data-fusion-engine logic.** Instead:

1. Import and call `fetchBuildingCritical()`, `fetchBuildingStandard()`, `fetchBuildingBackground()` directly
2. These functions already handle caching, error recovery, and parallel queries
3. The enrichment layer's job is to **reshape** the BuildingIntelligence output into the EnrichmentPackage schema
4. Add a thin transformation layer that maps BuildingIntelligence fields → EnrichmentPackage fields

If `fetchBuildingIntelligence()` returns a unified object, you may be able to call it once and reshape the output. Read the return type carefully.

### NTA Resolution

When the ingestion layer creates a TerminalEvent, it may not know the NTA code. The enrichment layer resolves this:
1. Get lat/lng from the PLUTO data (already fetched in property_profile)
2. Use `neighborhoods.ts` to look up the NTA from coordinates or zip code
3. Update the event's ntaCode field

## Constraints
- REUSE existing data-fusion-engine, cache-manager, entity-resolver, comps-engine — do NOT rewrite their logic
- The enrichment function should be pure: takes an event, returns an EnrichmentPackage. Side effects (DB writes) happen in the caller.
- Respect the existing 3-tier cache — enrichment queries will hit cache first, only going to NYC Open Data on cache miss
- Process max 50 events per cron invocation to stay within Cloud Run's 300s timeout
- Use Promise.allSettled when enriching multiple events — one failure should not stop others
- If enrichment fails for an event, set a `metadata.enrichmentError` field rather than leaving it perpetually unenriched (add a retry counter)
- Do NOT generate AI briefs in this prompt — that's Prompt 4
