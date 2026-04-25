# New NYC Open Data Datasets — Handoff Doc

## Goal
Add two new NYC Open Data datasets that complement existing data sources. Property Valuation gives us the city's assessed vs. market value for every property (useful for identifying over/under-valued deals). DOF Annualized Sales gives us a cleaner, more complete version of sales data than the rolling sales we currently pull from ACRIS.

## Project
**Repo/folder:** `src/lib/`, `src/app/(dashboard)/terminal/`, `src/app/(dashboard)/market-intel/`

## What's Already Covered (no work needed)
- **HPD Litigation** (`59kj-x8nc`) — fully wired into data-fusion-engine, terminal-enrichment, building profiles, distress scoring, BOV PDFs, motivation engine
- **RPIE Non-Compliance** (`wvts-6tdf`) — fully wired into data-fusion-engine, building profiles, distress scoring, distressed property search

---

## Discovery Instructions

Before writing any code, read these files:

1. `src/lib/data-fusion-engine.ts` — Understand the dataset registry pattern (`DATASETS` constant ~line 405), how new sources are added to phases, and the `cachedQueryNYC()` pattern
2. `src/lib/cache-manager.ts` — Cache TTL config for each dataset source
3. `src/lib/terminal-enrichment.ts` — How enrichment packages are built, where to add new data
4. `src/lib/terminal-datasets.ts` — Terminal dataset registry (if we want Annualized Sales as a Terminal event source)
5. `src/lib/ai-assumptions.ts` — AI underwriting, where assessed value data would feed in
6. `src/app/(dashboard)/market-intel/building-profile-actions.ts` — How building profile data is fetched (pattern for adding new dataset queries)
7. `src/app/(dashboard)/market-intel/components/building-profile/tab-financials.tsx` — Where assessed value and sales data would display
8. `src/lib/comps-engine.ts` — Comparable sales engine, where annualized sales data would supplement ACRIS rolling sales
9. `src/lib/nyc-opendata.ts` — Base NYC Open Data wrapper

Propose a plan before writing code.

---

## Dataset 1: Property Valuation & Assessment Data

**Socrata ID:** `8y4t-faws`
**API endpoint:** `https://data.cityofnewyork.us/resource/8y4t-faws.json`
**Published by:** NYC Department of Finance
**Update frequency:** Annual (new assessment roll each January)

### Key fields
- `bble` — BBL + check digit (10-11 chars). Join key — strip last char or match on first 10.
- `actextot` — Actual total assessed value
- `acttaxclass` — Actual tax class (1, 2, 2A, 2B, 2C, 3, 4)
- `fullval` — Full market value (DOF's estimate)
- `avtot` — Transitional assessed value
- `curmkttot` — Current market value total
- `nwmkttot` — New market value total (tentative)
- `yrbuilt` — Year built (duplicates PLUTO but useful as cross-check)
- `bldgcl` — Building class
- `owner` — Owner name
- `aptno` — Apartment/unit number
- `staddr` — Street address
- `zip` — ZIP code

### Where to integrate

**1. Building Profile — Financials tab:**
- Display DOF assessed value, market value, and tax class
- Show assessed-to-market ratio (signal: if assessed value is way below recent sale price, tax bill likely jumping)
- Add to `building-profile-actions.ts` as a new fetch in Phase 1 or 2

**2. Terminal Enrichment:**
- Add `dof_assessed_value` and `dof_market_value` to the enrichment package `property_profile`
- Useful for AI brief generation: "Building assessed at $X vs. recent sale at $Y"

**3. AI Underwriting (`ai-assumptions.ts`):**
- Use DOF market value as a cross-reference when generating AI assumptions
- If DOF market value is significantly different from asking price, flag it

**4. Data Fusion Engine:**
- Add as a new source in Phase 1 (core property data, alongside PLUTO)
- Cache TTL: 86400s (24h) — data only changes annually

**5. Comps Engine:**
- Use assessed value as an additional data point in comp scoring

### Implementation pattern
Follow the existing pattern in `data-fusion-engine.ts`:
```
// Add to DATASETS constant
DOF_VALUATION: "8y4t-faws",

// Add to cache-manager.ts
DOF_VALUATION: { ttlSeconds: 86400, priority: "core", timeoutMs: 6000 },

// Query pattern (BBL join)
cachedQueryNYC(bbl10, "DOF_VALUATION", DATASETS.DOF_VALUATION,
  `bble LIKE '${bbl10}%'`, { limit: 1, order: "yralt DESC" }, timing)
```

---

## Dataset 2: DOF Annualized Sales

**Socrata ID:** `w2pb-icbu`
**API endpoint:** `https://data.cityofnewyork.us/resource/w2pb-icbu.json`
**Published by:** NYC Department of Finance
**Update frequency:** Annual (published after fiscal year close)

### Key fields
- `borough` — Borough code (1-5)
- `block` — Tax block
- `lot` — Tax lot
- `address` — Street address
- `apartment_number` — Unit number
- `zip_code` — ZIP
- `building_class_category` — Building class description
- `building_class_at_time_of_sale` — Class at sale
- `sale_price` — Sale price (string, needs parsing)
- `sale_date` — Sale date
- `year_built` — Year built
- `gross_square_feet` — GSF
- `land_square_feet` — Lot SF
- `residential_units` — Residential unit count
- `commercial_units` — Commercial unit count
- `total_units` — Total units

### Where to integrate

**1. Comps Engine (`comps-engine.ts`):**
- Primary use case — supplement ACRIS rolling sales with cleaner, validated data
- DOF Annualized Sales filters out $0 transfers, intra-family transfers, and other non-arm's-length transactions more reliably than raw ACRIS
- Use as a secondary comp source alongside existing ACRIS data

**2. Building Profile — Sales History:**
- Add annualized sales as an additional data layer in the building profile
- Cross-reference with ACRIS rolling sales for completeness

**3. Terminal Enrichment:**
- Add recent sales from this dataset to the enrichment package `comp_sales` array
- Deduplicate against ACRIS data by matching on BBL + sale date

**4. AI Underwriting:**
- Use as a comp data source for AI-generated assumptions
- Cleaner price data = better AI assumptions

### Implementation pattern
```
// Add to DATASETS constant
DOF_ANNUALIZED_SALES: "w2pb-icbu",

// Cache config
DOF_ANNUALIZED_SALES: { ttlSeconds: 86400, priority: "standard", timeoutMs: 8000 },

// Query pattern (construct BBL from components)
cachedQueryNYC(bbl10, "DOF_ANNUALIZED_SALES", DATASETS.DOF_ANNUALIZED_SALES,
  `borough='${boroCode}' AND block='${block}' AND lot='${lot}' AND sale_price > '0'`,
  { limit: 20, order: "sale_date DESC" }, timing)
```

**Important:** `sale_price` is stored as a string in this dataset. Parse to number and filter out $0 and $1 transfers (these are non-arm's-length).

---

## Constraints
- All NYC Open Data calls must include the App Token via `X-App-Token` header (use `process.env.NYC_OPEN_DATA_APP_TOKEN`)
- Follow the existing `cachedQueryNYC()` pattern in data-fusion-engine for caching
- Don't duplicate data that's already available from PLUTO (year built, building class, etc.) — use DOF data as cross-reference/supplement
- Annualized Sales data is annual, so it won't have the most recent transactions — ACRIS rolling sales remains the primary source for recent activity
- Both datasets are large — always query by BBL, never fetch full datasets

## Files Likely Involved

### Modified:
- `src/lib/data-fusion-engine.ts` — Add both datasets to DATASETS constant, add to Phase 1/2 fetches
- `src/lib/cache-manager.ts` — Add cache TTL configs
- `src/lib/terminal-enrichment.ts` — Add assessed value + annualized sales to enrichment package
- `src/lib/comps-engine.ts` — Add annualized sales as secondary comp source
- `src/lib/ai-assumptions.ts` — Use assessed value in AI assumption generation
- `src/app/(dashboard)/market-intel/building-profile-actions.ts` — Add DOF valuation fetch
- `src/app/(dashboard)/market-intel/components/building-profile/tab-financials.tsx` — Display assessed/market value

### Verification
After implementation, test by loading a building profile for a known BBL (e.g., a recent Terminal event) and confirm:
1. DOF assessed value and market value appear in Financials tab
2. Annualized sales appear in sales history (if available for that BBL)
3. No errors in console from failed API calls
4. Cache entries are created (check BuildingCache table)
