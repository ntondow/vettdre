# VettdRE — Full Codebase Summary for Claude Context

> **Purpose:** This file gives Claude complete context on the VettdRE codebase — architecture, file map, patterns, recent work, and conventions. Paste this into a new conversation to resume development.

---

## What is VettdRE?

A real estate intelligence SaaS platform for NYC commercial real estate professionals. Users search properties across NYC, NYS, and NJ, view unified building profiles from 17+ public data sources, model deals with AI-powered underwriting, prospect building owners, and run outreach campaigns.

**Live at:** Google Cloud Run (us-east1), deployed via `gcloud builds submit --config cloudbuild.yaml --region=us-east1`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router, Turbopack, standalone output) |
| Language | TypeScript 5 (strict mode) |
| React | 19.2.3 |
| Database | Supabase (PostgreSQL), Prisma 5.22 ORM |
| Auth | Supabase Auth (email/password, magic links) + user approval gate |
| Payments | Stripe (Checkout, Webhooks, Billing Portal) |
| Hosting | Google Cloud Run (Docker, Node 20-Alpine, port 8080) |
| Maps | Leaflet (dynamic import, no SSR, circleMarker for perf) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Search | Brave Search API (listings, comps, entity research) |
| Enrichment | Apollo.io (people/org), People Data Labs (skip tracing) |
| Communication | Twilio (SMS + voice), Gmail API (OAuth) |
| Styling | Tailwind CSS 4 + shadcn/ui, Lucide React icons |
| Charts | Recharts (bar, line, composed) |
| PDFs | jsPDF (client-side), docx package for Word |

---

## Recent Development History (latest → oldest)

```
BMS Phase 3.5: RBAC (4 roles, 24 permissions), brokerage settings page, agent invite/onboarding flow, file upload model, audit logging (all 7 action files), audit log viewer
BMS Phase 3: Brokerage dashboard, reporting (P&L, agent production, 1099 prep, deal pipeline), compliance tracking, payment recording + inline invoices
BMS Phase 2: Commission plan templates, agent roster + detail pages, Excel import, agent self-service portal, sidebar role-gating
BMS Phase 1: Brokerage Management System — agent deal submissions, approval queue, invoice generator, Excel bulk upload, public submission links
cb88e6e Deal accuracy engine: NYC closing costs, tax reassessment, expense benchmarks, rent stabilization, LL97 penalties, market cap rates
16424e3 Deal modeler design pass: gauges, sliders, BRRRR timeline, rate comparison, waterfall viz, tooltips, keyboard shortcuts
e29ba6f Deal structure engine: 5 structures, comparison mode, AI guidance, feature gating
6e01d71 Market Pulse redesign - Bloomberg terminal aesthetic, default to Map tab, shimmer loading
f9b85b8 Renovation Cost Estimator - condition assessment, 3-tier cost tables, ARV, ROI
47a9bee Fannie Mae Loan Lookup - GSE detection, agency badge, scoring adjustments
7727114 Redfin market trends + FHFA HPI - market temperature, local vs metro appreciation
18e20c7 Comparable Sales engine - automated comps, similarity scoring, valuation estimates
7a168b9 FRED + HUD - live mortgage rates, market pulse, HUD fair market rents
95228d2 GP/LP Promote Model - waterfall engine, sensitivity tables
8aac5fe NY Corporations - LLC piercing, registered agent, related entities
132923a Census + Geocodio - neighborhood profiles, AI calibration
0c21998 Twilio phone system - SMS, calls, webhooks, phone settings
```

---

## File Structure

### src/lib/ (63 files — core business logic)

#### Deal Modeling & Underwriting
| File | Lines | Purpose |
|------|-------|---------|
| `deal-calculator.ts` | 759 | Full underwriting: unit mix, expenses, DCF, IRR, 10-year proforma |
| `deal-structure-engine.ts` | 986 | 5 deal structures: All Cash, Conventional, Bridge→Refi, Assumable, Syndication |
| `ai-assumptions.ts` | 919 | One-click underwrite: generates full DealInputs from building data |
| `cap-rate-engine.ts` | 383 | Market-derived cap rates from comps + expense benchmarks, trend analysis |
| `expense-benchmarks.ts` | 326 | NYC RGB I&E Study benchmarks by building category (6 types, 11 line items) |
| `rent-stabilization.ts` | 200 | RGB rates, HSTPA 2019 modeling, MCI/IAI upside, year-by-year rent projections |
| `ll97-penalties.ts` | 200 | LL97 carbon penalties: 2-period limits, $268/ton, retrofit cost analysis |
| `nyc-deal-costs.ts` | 438 | NYC transfer taxes, MRT, mansion tax, CEMA savings, tax reassessment |
| `comps-engine.ts` | 641 | DOF Rolling Sales + PLUTO, similarity scoring (0-100), automated valuation |
| `renovation-engine.ts` | 383 | Condition assessment, 3-tier cost tables, ARV, ROI |
| `promote-engine.ts` | 314 | GP/LP waterfall: distribution tiers, IRR hurdles, catch-up |
| `expense-analyzer.ts` | — | T-12 parsing, market benchmarks, anomaly detection |
| `bms-types.ts` | — | BMS shared types, status labels, colors, Excel column aliases, audit log types |
| `bms-auth.ts` | — | getCurrentBmsUser, requireBmsPermission (role-based BMS access) |
| `bms-permissions.ts` | — | BMS_ROLES, BMS_PERMISSIONS map, hasPermission, getRoleLabel |
| `bms-files.ts` | — | FileAttachment CRUD (upload, list, delete) |
| `bms-audit.ts` | — | Fire-and-forget audit logging (logAction + 6 convenience functions) |
| `invoice-pdf.ts` | — | jsPDF commission invoice generator (single + batch) |

#### Data Sources & APIs
| File | Lines | Purpose |
|------|-------|---------|
| `data-fusion-engine.ts` | 1942 | Central aggregator: 14+ APIs in parallel, BuildingIntelligence object, 15min cache |
| `nyc-opendata.ts` | — | 17 NYC Open Data (Socrata) API helpers |
| `entity-resolver.ts` | 548 | Fuzzy matching, address normalization, LLC piercing |
| `apollo.ts` | 561 | Apollo.io: people search, enrichment, org enrichment, bulk |
| `brave-search.ts` | — | Brave Web Search wrapper |
| `brave-listings.ts` | 360 | Live listings via Brave, parser, dedup |
| `brave-comps.ts` | — | Web comps merged with DOF sales |
| `brave-entity.ts` | — | Owner/entity research: news, courts, corp records |
| `census.ts` | — | Census ACS API: tract-level demographics |
| `geocodio.ts` | 340 | Geocoding + Census data, LRU cache |
| `fred.ts` | — | FRED API: mortgage rates, CPI, housing starts (24hr cache) |
| `hud.ts` | — | HUD Fair Market Rents by ZIP (30-day cache) |
| `fhfa.ts` | — | FHFA HPI + ACRIS appreciation |
| `fannie-mae.ts` | 344 | Fannie Mae ROPC OAuth2 loan lookup |
| `redfin-market.ts` | — | Embedded quarterly market metrics |
| `airbnb-market.ts` | — | InsideAirbnb neighborhood STR averages |
| `zillow-data.ts` | — | ZIP-level rent/sale estimates |
| `ny-corporations.ts` | — | NY DOS corporate filings |

#### Communication & Email
| File | Purpose |
|------|---------|
| `gmail.ts` | Gmail OAuth token management & refresh |
| `gmail-sync.ts` | Initial + incremental sync via historyId |
| `gmail-send.ts` | Send/reply with CC/BCC, attachments, templates |
| `google-calendar.ts` | 2-way Google Calendar sync (532 lines) |
| `email-parser.ts` | AI parsing via Claude: extract lead data |
| `email-categorizer.ts` | Rule-based: lead, personal, newsletter |
| `email-scoring.ts` | Engagement scoring 0-100 |
| `follow-up-checker.ts` | Auto reminders for threads >24h |
| `twilio.ts` / `twilio-actions.ts` | SMS + voice (469 lines actions) |

#### Documents
| File | Purpose |
|------|---------|
| `deal-pdf.ts` | Deal analysis PDF (807 lines) |
| `pdf-report.ts` | Building intelligence PDF (587 lines) |
| `loi-template.ts` / `loi-pdf.ts` / `loi-docx.ts` | Letter of Intent (PDF + Word) |

#### Infrastructure
| File | Purpose |
|------|---------|
| `prisma.ts` | Prisma singleton |
| `utils.ts` | cn, formatCurrency, getInitials |
| `stripe.ts` | Stripe client (lazy init) |
| `feature-gate.ts` | Client-safe: 5 plans, 71 features |
| `feature-gate-server.ts` | Server-side permission + daily limits |
| `supabase/client.ts` / `server.ts` / `middleware.ts` | Auth + session |
| `neighborhoods.ts` / `neighborhoods-nys.ts` / `neighborhoods-nj.ts` | Location data |
| `geo-utils.ts` / `nyc-zip-centroids.ts` | Geospatial helpers |

---

### src/app/(dashboard)/ — Dashboard Pages

#### deals/ (13 files)
| File | Purpose |
|------|---------|
| `deals/new/deal-modeler.tsx` | **3,130 lines** — Full deal modeler: 5 structures, unit mix, expenses, gauges, sliders, waterfall, comps, LOI, PDF export |
| `deals/actions.ts` | Server actions: AI assumptions, save/load deals, comps, contact search |
| `deals/closing-cost-actions.ts` | NYC itemized closing costs + tax reassessment |
| `deals/benchmark-actions.ts` | Expense benchmark, rent stabilization, LL97 projection fetchers |
| `deals/caprate-actions.ts` | Market cap rate derivation server action |
| `deals/deal-pipeline.tsx` | Deal list/pipeline UI |
| `deals/promote/promote-builder.tsx` | GP/LP waterfall builder + sensitivity |

#### market-intel/ (43 files)
| File | Purpose |
|------|---------|
| `building-profile.tsx` | **3,560 lines** — Building profile modal: PLUTO overview, AI ownership, contacts, violations, comps, energy, expense benchmark, cap rate |
| `market-intel-search.tsx` | Main search: 4 modes (Property, Ownership, Name, Map) |
| `map-search.tsx` | Leaflet interactive map with PLUTO bounds queries |
| `actions.ts` | NYC/NYS/NJ property search server actions |
| `building-profile-actions.ts` | Building profile enrichment: PLUTO, HPD, DOB, LL84 |
| `comps-actions.ts` | Comparable sales with PLUTO valuation |
| `renovation-actions.ts` / `str-actions.ts` | Renovation + STR projection actions |
| `nys-actions.ts` / `nj-actions.ts` | State search actions |
| `ai-analysis.ts` | Claude AI ownership analysis |
| `graph-engine.ts` / `portfolio-engine.ts` | Ownership graph + portfolio discovery |
| `enrichment.ts` / `lead-verification.ts` / `tracerfy.ts` | Contact enrichment |
| `components/` (14 files) | Filter panel, search components, result cards |

#### Other Dashboard Routes
| Route | File(s) | Status |
|-------|---------|--------|
| `/contacts` + `/contacts/[id]` | Contact list + 5-tab dossier | Working |
| `/pipeline` | Kanban board, drag-drop | Working |
| `/messages` + `/messages/templates` | Gmail inbox, 3-pane layout | Working |
| `/calendar` | Month/week/day/agenda, Google sync | Working |
| `/prospecting` | Prospect lists, CSV export | Working |
| `/portfolios` | Basic schema + UI | Basic |
| `/properties` | Empty state | Minimal |
| `/brokerage/dashboard` | Stats cards, deal/invoice status charts, period selector | Working |
| `/brokerage/deal-submissions` | Approval queue, status filters | Working |
| `/brokerage/invoices` | Invoice list, inline payment recording | Working |
| `/brokerage/commission-plans` | Flat/volume/value tier builder | Working |
| `/brokerage/reports/*` | P&L, agent production, 1099 prep, pipeline (4 sub-tabs) | Working |
| `/brokerage/compliance` | Document tracking, expiry alerts, agent compliance grid | Working |
| `/brokerage/payments` | Payment recording, history, filters, CSV export | Working |
| `/brokerage/agents` + `[id]` | Roster, detail pages, Excel import, onboarding | Working |
| `/brokerage/settings` | Roles & permissions, brokerage settings, audit log (3 tabs) | Working |
| `/brokerage/my-deals` | Agent self-service portal | Working |
| `/join/agent/[token]` | Public agent invite landing + accept flow | Working |
| `/settings/*` (20 sub-pages) | Full settings suite | Working |

---

## Database Schema (42 models, 20 enums)

**Core:** Organization, User (multi-tenant, RBAC with 5 roles + approval gate)
**CRM:** Contact, EnrichmentProfile, QualificationScore, Activity, Task
**Deals:** Pipeline, Deal, DealAnalysis (JSON inputs/outputs), PromoteModel
**Properties:** Property, Showing, ShowingSlot, ContactPropertyInterest
**Email:** GmailAccount, EmailMessage, EmailLabel, EmailThreadLabel, EmailTemplate, FollowUpReminder, EmailSignature
**Calendar:** CalendarEvent (2-way Google sync)
**Prospecting:** ProspectingList, ProspectingItem, Portfolio, PortfolioBuilding
**Communication:** PhoneNumber, PhoneCall, SmsMessage
**Settings:** NotificationPreferences, WorkingHours, SyncSettings, LeadAssignmentRule, AiSettings, BrandSettings
**System:** Automation, AutomationRun, AuditLog
**BMS:** BrokerAgent, DealSubmission, Invoice, CommissionPlan, CommissionTier, ComplianceDocument, Payment, FileAttachment (BmsDealType, InvoiceStatus, CommissionPlanType, ComplianceDocType, PaymentMethod enums)

---

## NYC Open Data Sources (17 datasets)

| # | Source | Dataset ID | Key Fields |
|---|--------|-----------|------------|
| 1 | PLUTO | `64uk-42ks` | address, units, sqft, year built, FAR, zoning, assessed value |
| 2 | ACRIS Master | `bnx9-e6tj` | Document type, amount, recorded date |
| 3 | ACRIS Legals | `8h5j-fqxa` | BBL linkage |
| 4 | ACRIS Parties | `636b-3b5g` | Buyer/seller names |
| 5 | HPD Registrations | `tesw-yqqr` | Owner name, managing agent |
| 6 | HPD Contacts | `feu5-w2e2` | Contact details |
| 7 | HPD Violations | `wvxf-dwi5` | A/B/C class violations |
| 8 | HPD Complaints | `uwyv-629c` | 311 complaints |
| 9 | HPD Litigation | `59kj-x8nc` | Housing court cases |
| 10 | DOB Permits | `ic3t-wcy2` | Construction permits |
| 11 | DOB Violations | `3h2n-5cm9` | Code violations |
| 12 | DOB ECB | `6bgk-3dad` | ECB violations |
| 13 | DOF Rolling Sales | `usep-8jbt` | Recent sales (comps) |
| 14 | LL84 Energy | `5zyy-y8am` | EUI, GHG, Energy Star |
| 15 | RPIE | `wvts-6tdf` | I&E filing non-compliance |
| 16 | Rent Stabilization | `35ss-ekc5` | Stabilized unit counts |
| 17 | Speculation Watch | `adax-9x2w` | Speculative purchases |

**NYS:** Assessment Rolls (`7vem-aaz7`), Entity Names (`ekwr-p59j`), Entity Filings (`63wc-4exh`)
**NJ:** ArcGIS Parcels Composite (`Parcels_Composite_NJ_WM/FeatureServer/0`)

---

## Feature Gate System (5 plans)

| Plan | Price | Key Features |
|------|-------|-------------|
| Free | $0 | Market Intel (NYC only), basic census |
| Explorer | $59/mo | NYS+NJ, map, owner name, distress/investment scores, listings, web intel, Fannie Mae, renovation, STR |
| Pro | $219/mo | Deal Modeler (all 5 structures), prospecting, Apollo enrichment, phone/SMS, promote model, comp analysis |
| Team | $399/mo | Investors, multi-numbers, promote templates/sensitivity/export |
| Enterprise | Custom | All features |

BMS features: bms_submissions (pro+), bms_invoices (pro+), bms_agent_portal (pro+), bms_agent_onboarding (pro+), bms_bulk_upload (team+), bms_agents (team+), bms_commission_plans (team+), bms_compliance (team+), bms_payments (team+), bms_audit_log (team+), bms_file_upload (team+)

---

## API Routes (10)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/gmail` | GET | Gmail OAuth initiation |
| `/api/auth/gmail/callback` | GET | Gmail OAuth callback |
| `/api/book` | POST | Public showing booking |
| `/api/report/[bbl]` | GET | Building PDF report |
| `/api/stripe/checkout` | POST | Create checkout session |
| `/api/stripe/portal` | POST | Customer billing portal |
| `/api/webhooks/stripe` | POST | Stripe webhooks |
| `/api/twilio/sms` | POST | Incoming SMS |
| `/api/twilio/voice` | POST | Incoming call |
| `/api/twilio/status` | POST | Call/SMS status |

---

## Key Architecture Patterns

### Server Actions
```typescript
"use server";
export async function fetchSomething(params: Params): Promise<Result> {
  try {
    const url = new URL("https://data.cityofnewyork.us/resource/DATASET_ID.json");
    url.searchParams.set("$where", conditions.join(" AND "));
    url.searchParams.set("$limit", "400");
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

### Deal Structure Engine
- 5 structures: `all_cash`, `conventional`, `bridge_refi`, `assumable`, `syndication`
- `DealInputsBase` (shared) → structure-specific inputs → `DealAnalysis` output
- Optional enrichment fields: `rentProjectionData`, `ll97AnnualPenalties`, `capRateAnalysis`
- `exitSensitivity` with optimistic/base/conservative scenarios
- All calculations in `calculateDealStructure()` dispatcher

### Building Profile Data Flow
1. User clicks building → `enrichBuildingProfile(boroCode, block, lot)` fires
2. Data fusion: 14+ APIs via `Promise.allSettled()` in `data-fusion-engine.ts`
3. Building profile renders: PLUTO overview, AI ownership, contacts, violations, comps, energy, benchmarks, cap rates
4. "Open in Deal Modeler" links pass BBL as query param → auto-prefills everything

### Expense Benchmark Engine
- 6 building categories: Pre-War Walkup/Elevator, Post-War Walkup/Elevator, Modern, New Construction
- Classification via `classifyBuildingCategory(yearBuilt, hasElevator, numFloors, bldgClass)`
- 11 expense line items from RGB I&E Study
- Adjustments: borough factor (Manhattan 1.15 → SI 0.85), size factor, fuel type, RS compliance

### Market Cap Rate Engine
- `deriveMarketCapRate()` takes comps + subject building data
- Estimates NOI per comp using expense benchmarks → implied cap rate
- Weights by similarity (40%), recency (35%), distance (25%)
- Trend analysis: compressing/stable/expanding (basis points per year)
- Fallback rates by borough when insufficient comps
- Exit sensitivity: optimistic (-50bp), base (+25bp), conservative (+75bp)

---

## Coding Conventions

- All data fetching via `"use server"` actions
- **CRITICAL:** Never `export type { ... }` from server files — causes `ReferenceError`. Use `import type` instead
- **CRITICAL:** Never quote numeric values in Socrata `$where` clauses — breaks negative longitude
- Graceful degradation: API failures return empty results, never crash
- Lazy initialization for all API clients (Stripe, Brave, Twilio)
- Parallel fetching with `Promise.allSettled()` for building profiles
- Feature gating: client-side (UI) + server-side (actions)
- Dynamic imports for lazy-loading: `import("./str-actions")`
- `Array.isArray()` checks before spreading API responses
- `JSON.parse(JSON.stringify(obj))` for Server→Client serialization (Dates, Decimals)
- Build must pass (`npx next build`) with zero errors before deployment
- UI: Dark theme for deal modeler (slate-900 bg), light theme for building profiles
- Market Pulse widget uses Bloomberg terminal aesthetic
- Default Market Intel tab is **map** (not property)
- Tailwind for all styling; custom animations in `globals.css` (fade-in, modal-in, slide-up)
- Use `circleMarker` not `Marker` for Leaflet map performance
- Mobile: `md:` breakpoint splits mobile (bottom tab bar) vs desktop (sidebar)

---

## Common Bugs & Fixes

| Bug | Cause | Fix |
|-----|-------|-----|
| Map returns 0 results | Quoted numerics in SODA `$where` | Remove quotes from all numeric comparisons |
| Map blank on tab switch | Leaflet container size unknown | `invalidateSize()` via IntersectionObserver |
| Map stale data | Event handler captures old closure | Use `ref.current` pattern for callbacks |
| 500 on page load | `export type` in "use server" file | Move type exports to non-server file |
| Docker build fails | Module-level API init | Use lazy initialization pattern |
| `as const` on ternary in JSX | TS error in typed arrays | Extract to typed variable |
| Block-scoped variable used before declaration | useMemo references variable defined below | Use variable already defined in useMemo scope |

---

## Deployment

```bash
npm run dev                    # local with Turbopack
npx tsc --noEmit               # type check
npx next build                 # production build
git push origin main           # push code
gcloud builds submit --config cloudbuild.yaml --region=us-east1  # deploy
```

- Docker: Multi-stage (Node 20-Alpine), standalone output, port 8080
- Cloud Run: 1Gi memory, 1 CPU, 80 concurrency, 0-10 instances
- 11 secrets via Cloud Secret Manager

---

## Environment Variables

```
DATABASE_URL=                    # Supabase Session Pooler
DIRECT_URL=                      # Supabase Direct
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=               # Claude AI
NYC_OPEN_DATA_APP_TOKEN=         # Optional
APOLLO_API_KEY=                  # Apollo.io
PDL_API_KEY=                     # People Data Labs
BRAVE_SEARCH_API_KEY=            # Brave Search
CENSUS_API_KEY=                  # Census Bureau
GEOCODIO_API_KEY=                # Geocodio
FRED_API_KEY=                    # Federal Reserve
HUD_API_TOKEN=                   # HUD FMR
GOOGLE_CLIENT_ID=                # Gmail OAuth
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID=              # Optional
TWILIO_AUTH_TOKEN=               # Optional
FANNIE_CLIENT_ID=                # Optional
FANNIE_CLIENT_SECRET=            # Optional
FANNIE_API_KEY=                  # Optional
```

---

## What's NOT Built Yet

| Feature | Status |
|---------|--------|
| Dashboard real stats | Placeholder data |
| `/tasks` page | Not built |
| `/insights` (AI) | Not built |
| `/analytics` | Not built |
| Properties page | Empty state only |
| Portfolios | Basic schema + UI |
| Automations | Schema only, no UI/engine |
| Service worker / PWA offline | Not started |
| BMS Agent Roster | ✅ Complete (roster, detail, import) |
| BMS Commission Plans | ✅ Complete (flat/volume/value tiers) |
| BMS Agent Self-Service | ✅ Complete (my-deals portal) |
| BMS Dashboard | ✅ Complete (stats, charts, period selector) |
| BMS Reporting | ✅ Complete (P&L, agent production, 1099 prep, pipeline) |
| BMS Compliance Tracking | ✅ Complete (documents, expiry alerts, agent grid) |
| BMS Payment Recording | ✅ Complete (record, history, inline on invoices, CSV export) |
| BMS Roles & Permissions | Complete (4 roles, 24 permissions, settings page) |
| BMS Agent Onboarding | Complete (invite flow, public accept page, user linking) |
| BMS File Upload Model | Complete (FileAttachment model + CRUD, not yet wired to UI) |
| BMS Audit Logging | Complete (all 7 action files wired, audit log viewer) |
| BMS Brokerage Settings | Complete (3-tab page: roles, settings, audit log) |
| Stripe Connect Payouts | Not started (Phase 4 — agent payouts via Stripe) |
| White-label BaaS | Not started (Phase 4) |
| Mobile page layouts | Bottom nav done, pages need responsive |
