---
name: vettdre
description: VettdRE is a NYC/NYS/NJ commercial real estate intelligence SaaS platform built with Next.js 16, Prisma, Supabase, and Stripe. Use this skill for ANY task involving the VettdRE codebase — building features, fixing bugs, debugging deployments, writing server actions, updating the UI, working with real estate data APIs, or modifying the billing/permissions system. This skill contains the full architecture, file structure, data source catalog, coding conventions, and deployment pipeline.
---

# VettdRE — Codebase Intelligence Skill

## What is VettdRE?

A real estate intelligence platform for NYC commercial real estate professionals. Users search properties across NYC, New York State, and New Jersey, view unified building profiles aggregated from 14+ public data sources, model deals with AI-powered underwriting, prospect building owners, and run outreach campaigns.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Database | Supabase (PostgreSQL) via Prisma ORM |
| Auth | Supabase Auth (email/password, magic links) |
| Payments | Stripe (Checkout, Webhooks, Billing Portal) |
| Hosting | Google Cloud Run (Docker, us-east1) |
| Build | Cloud Build (cloudbuild.yaml) |
| Maps | Leaflet (dynamic import, no SSR) |
| AI | Anthropic Claude API (deal assumptions, AI underwriting) |
| Search | Brave Search API (live listings, entity research, web comps) |
| Styling | Tailwind CSS + shadcn/ui components |

## File Structure

```
src/
├── app/
│   ├── (auth)/                    # Login, signup, forgot-password
│   ├── (dashboard)/               # Main app (requires auth)
│   │   ├── layout.tsx             # Dashboard shell — sidebar, mobile nav, UserPlanProvider
│   │   ├── market-intel/          # Core feature — property search + building profiles
│   │   │   ├── page.tsx           # Market Intel search page (tabs: Property, Ownership, Map, On-Market, etc.)
│   │   │   ├── market-intel-search.tsx  # Main search UI component (NYC/NYS/NJ modes)
│   │   │   ├── map-search.tsx     # Leaflet map component for NYC map tab
│   │   │   ├── map-actions.ts     # Server actions for map viewport queries (PLUTO + DOB)
│   │   │   ├── nys-actions.ts     # Server actions for NY State (data.ny.gov Socrata API)
│   │   │   ├── nj-actions.ts      # Server actions for NJ (ArcGIS REST API)
│   │   │   ├── building-profile.tsx           # Full building profile page
│   │   │   └── building-profile-actions.ts    # Server actions for building data (PLUTO, HPD, DOB, ACRIS, LL84, RPIE)
│   │   ├── deal-modeler/          # Deal modeling + AI underwriting
│   │   ├── properties/            # Saved properties
│   │   ├── prospecting/           # Owner prospecting
│   │   ├── pipeline/              # Deal pipeline CRM
│   │   ├── portfolios/            # Portfolio management
│   │   ├── settings/              # Settings pages (billing, branding, gmail, members, etc.)
│   │   └── ...
│   ├── api/
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts  # Create Stripe checkout session
│   │   │   └── portal/route.ts    # Create Stripe billing portal session
│   │   └── webhooks/
│   │       └── stripe/route.ts    # Stripe webhook handler (subscription lifecycle)
│   └── auth/callback/route.ts     # Supabase auth callback
├── components/
│   ├── ui/                        # shadcn/ui primitives (button, card, dialog, etc.)
│   ├── sidebar.tsx                # Main navigation sidebar with feature gating
│   ├── mobile-nav.tsx             # Mobile navigation
│   ├── upgrade-modal.tsx          # Stripe upgrade/pricing modal
│   └── providers/
│       └── user-plan-provider.tsx  # React context for user plan + permissions
├── lib/
│   ├── prisma.ts                  # Prisma client singleton
│   ├── stripe.ts                  # Stripe client (lazy init) + price-to-plan mapping
│   ├── feature-gate.ts            # Feature permissions per plan tier (client-safe)
│   ├── feature-gate-server.ts     # Server-side permission checks + trial management
│   ├── data-fusion-engine.ts      # Central aggregation — 14 sources → BuildingIntelligence
│   ├── entity-resolver.ts         # Fuzzy matching, LLC piercing, owner resolution
│   ├── ai-assumptions.ts          # AI-powered deal assumption generation
│   ├── brave-search.ts            # Brave Search API wrapper + budget tracking
│   ├── brave-listings.ts          # Live listing search + parser
│   ├── brave-comps.ts             # Web-enhanced comparable sales
│   ├── brave-entity.ts            # Owner/entity web intelligence
│   ├── neighborhoods.ts           # NYC neighborhoods lookup
│   ├── neighborhoods-nys.ts       # NYS counties + municipalities
│   ├── neighborhoods-nj.ts        # NJ counties + municipalities
│   └── supabase/
│       ├── client.ts              # Browser Supabase client
│       ├── server.ts              # Server-side Supabase client
│       └── middleware.ts          # Auth middleware
└── middleware.ts                   # Next.js middleware (auth redirect)
```

## Data Sources

### NYC (Primary Market)

| Source | API | Dataset ID | Key Fields |
|--------|-----|-----------|------------|
| PLUTO | Socrata (data.cityofnewyork.us) | `64uk-42ks` | address, units, sqft, year built, FAR, zoning, owner, assessed value |
| ACRIS | Socrata | `8h5j-fqxa` (master), `636b-3b5g` (legals), `bnx9-e6tj` (parties) | Sales history, deed holders, mortgage info |
| HPD Registration | Socrata | `tesw-yqqr` | Owner name, managing agent, phone |
| HPD Contacts | Socrata | `feu5-w2e2` | Contact details for registered buildings |
| HPD Violations | Socrata | `wvxf-dwi5` | Open/closed violations by class (A/B/C) |
| HPD Complaints | Socrata | `uwyv-629c` | Tenant complaints |
| HPD Litigation | Socrata | `59kj-x8nc` | Housing court cases |
| DOB Permits | Socrata | `ic3t-wcy2` | Active construction permits |
| DOB Jobs | Socrata | `ic3t-wcy2` | New building / alteration applications |
| DOB Violations | Socrata | `3h2n-5cm9` | Building code violations |
| DOB ECB | Socrata | `6bgk-3dad` | Environmental control board violations |
| DOF Rolling Sales | Socrata | `usep-8jbt` | Recent closed sales (comps) |
| LL84 Energy | Socrata | `5zyy-y8am` | Energy Star grade, EUI, utility consumption, GHG |
| RPIE | Socrata | `wvts-6tdf` | Income & expense filing non-compliance |
| Rent Stabilization | Socrata | `gkh2-hj5p` | Rent stabilized unit counts |
| Speculation Watch | Socrata | `jnm5-kvjy` | Speculative purchasing patterns |

### NYS (data.ny.gov)

| Source | Dataset ID | Key Fields |
|--------|-----------|------------|
| Assessment Rolls | `7vem-aaz7` | All assessed properties statewide. Fields: `parcel_address_street`, `primary_owner_first_name`, `primary_owner_last_name`, `assessment_total`, `full_market_value`, `property_class`, `county_name`, `municipality_name`, `print_key_code` |

**NYS Gotchas:**
- Roll year is typically `getFullYear() - 2` (data lags ~2 years)
- County/municipality names are mixed case — use `upper()` in Socrata queries
- Owner name split across `primary_owner_first_name` + `primary_owner_last_name` + additional owner fields
- Address built from `parcel_address_number` + `parcel_address_street` + `parcel_address_suff`
- No `residential_units` column — use `property_class` to filter (411 = apartments, 210-280 = residential)

### NJ (ArcGIS REST)

| Source | Service URL | Key Fields |
|--------|-----------|------------|
| Parcels Composite | `https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query` | `MUN_NAME`, `PCLBLOCK`, `PCLLOT`, `PROP_CLASS`, `PROP_LOC`, `DWELL`, `YR_CONSTR`, `LAND_VAL`, `IMPRVT_VAL`, `DEED_DATE`, `CALC_ACRE` |

**NJ Gotchas:**
- ArcGIS field names are case-sensitive
- Service URL changes periodically — was `Parcels_and_MODIV_Composite`, now `Parcels_Composite_NJ_WM`
- Use `f=json` and `returnGeometry=false` for data-only queries
- Owner names often redacted in NJ public data
- Filter multifamily: `PROP_CLASS IN ('2','4A','4C')`

## Socrata API Patterns

**CRITICAL: Never quote numeric values in $where clauses.** Socrata does string comparison on quoted values, which breaks negative longitude comparisons (all NYC longitudes are -73.x to -74.x).

```typescript
// CORRECT — unquoted numerics
`latitude > ${swLat} AND longitude > ${swLng} AND unitsres > 0`

// WRONG — quoted numerics (string comparison breaks negative numbers)
`latitude > '${swLat}' AND longitude > '${swLng}' AND unitsres > '0'`
```

Standard Socrata query pattern:
```typescript
const url = new URL("https://data.cityofnewyork.us/resource/DATASET_ID.json");
url.searchParams.set("$where", conditions.join(" AND "));
url.searchParams.set("$limit", "400");
url.searchParams.set("$select", "field1,field2,field3");
// Socrata auto-encodes $where as %24where — this is fine
```

## Server Actions Pattern

All data fetching uses Next.js Server Actions with `"use server"` directive:

```typescript
"use server";

export async function fetchSomething(params: Params): Promise<Result> {
  // Always wrap in try/catch — never let API failures crash the page
  try {
    const url = new URL("https://api.example.com/resource.json");
    url.searchParams.set("$where", buildQuery(params));
    const response = await fetch(url.toString());
    if (!response.ok) return { properties: [], total: 0 };
    const data = await response.json();
    return { properties: data.map(parseRecord), total: data.length };
  } catch (error) {
    console.error("Fetch error:", error);
    return { properties: [], total: 0 };
  }
}
```

**CRITICAL for `"use server"` files:**
- Never use `export type { ... }` to re-export TypeScript interfaces — Next.js server action boundary compiler converts these to runtime value references that crash with `ReferenceError: X is not defined`
- Use `import type { X }` for type imports (these are correctly erased)
- If consumers need types, export them from a separate non-server file

## Feature Gating / Permissions

Plans: `free`, `explorer`, `pro`, `team`, `enterprise`

```typescript
// src/lib/feature-gate.ts — client-safe, no "use server"
import { hasPermission, type Feature } from '@/lib/feature-gate';

// Check in components
if (hasPermission(userPlan, 'deal_modeler')) { ... }

// Wrap UI sections
<FeatureGate feature="contact_info" fallback={<UpgradePrompt />}>
  <ContactDetails />
</FeatureGate>
```

Plan hierarchy: free < explorer < pro < team = enterprise

## Stripe Integration

```typescript
// src/lib/stripe.ts — LAZY initialization (required for Docker builds)
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}
```

**Never initialize Stripe at module level** — env vars aren't available during Docker build.

Price IDs are in environment variables: `STRIPE_EXPLORER_MONTHLY_PRICE_ID`, `STRIPE_PRO_YEARLY_PRICE_ID`, etc.

Webhook at `/api/webhooks/stripe/route.ts` — uses `request.text()` for raw body (NOT `request.json()`).

## Data Fusion Engine

The building profile calls `fetchBuildingIntelligence(bbl)` which:
1. Fires 14+ data source queries in parallel via `Promise.allSettled()`
2. Cross-references entities via `entity-resolver.ts` (fuzzy matching, LLC piercing)
3. Resolves conflicts using source priority hierarchy
4. Calculates distress score (0-100) and investment score (0-100)
5. Returns unified `BuildingIntelligence` object
6. Caches results for 15 minutes (LRU, 100 entries)

## Leaflet Map

Leaflet is dynamically imported (no SSR). Key patterns:
- Map container needs `invalidateSize()` when becoming visible after being hidden
- Use `loadPropertiesRef.current` pattern to avoid stale closures in event handlers
- `IntersectionObserver` detects tab visibility changes
- Query PLUTO with map viewport bounds on `moveend` event

## Deployment

```bash
# Local
npm run dev          # starts with --turbopack

# Production
git push origin main
gcloud builds submit --config cloudbuild.yaml --region=us-east1
# Docker build → Cloud Run deploy

# Env vars
# .env.local (local dev)
# Cloud Run → Edit & Deploy → Variables & Secrets (production)
# Some env vars with special chars need to be added via Cloud Console UI, not CLI
```

## Common Bugs & Fixes

| Bug | Cause | Fix |
|-----|-------|-----|
| Map returns 0 results | Quoted numerics in SODA $where | Remove quotes from all numeric comparisons |
| Map blank on tab switch | Leaflet container size unknown | `invalidateSize()` via IntersectionObserver |
| Map stale data | Event handler captures old closure | Use `ref.current` pattern for callbacks |
| 500 on page load | `export type` in "use server" file | Move type exports to non-server file |
| Docker build fails "apiKey not provided" | Module-level Stripe/API init | Use lazy initialization pattern |
| NYS returns 0 results | Wrong column names / roll year | Check dataset schema, use `getFullYear()-2` |
| NJ returns 0 results | Dead ArcGIS service URL | Verify service URL hasn't changed |
| Webhook signature fails | Using `request.json()` | Must use `request.text()` for raw body |

## Environment Variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # Admin operations (user management)

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_EXPLORER_MONTHLY_PRICE_ID
STRIPE_EXPLORER_YEARLY_PRICE_ID
STRIPE_PRO_MONTHLY_PRICE_ID
STRIPE_PRO_YEARLY_PRICE_ID
STRIPE_TEAM_MONTHLY_PRICE_ID

# External APIs
BRAVE_SEARCH_API_KEY
ANTHROPIC_API_KEY

# NYC Open Data (optional, increases rate limits)
NYC_OPEN_DATA_APP_TOKEN
```

## Prisma Schema Key Models

- **User**: plan (UserPlan enum), stripeCustomerId, stripeSubscriptionId, trialEndsAt, usageCounters
- **Organization**: tier (OrgTier), subscriptionStatus
- **Property**: saved properties with BBL, address, metadata
- **Deal**: deal models with purchase price, assumptions, AI-generated projections
- **Prospect**: prospecting targets with owner info, contact attempts

## Coding Conventions

- All data fetching via server actions (`"use server"`)
- Graceful degradation — API failures return empty results, never crash
- Lazy initialization for all API clients (Stripe, Brave, etc.)
- Parallel fetching with `Promise.allSettled()` for building profiles
- Feature gating checked both client-side (UI) and server-side (actions)
- Console.log debugging must be removed before committing
- Build must pass (`npx next build`) with zero errors before deployment
