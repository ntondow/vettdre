# VettdRE — Product Vision & Roadmap

> **Purpose:** This is the single source of truth for VettdRE's product direction. It reflects where the product actually is, what's working, and what to build next — grounded in real user behavior, not aspirational architecture. Share this at the start of any development conversation.

> **Last updated:** March 2026

---

## WHO WE ARE

VettdRE is a real estate intelligence and operations platform. It started as a tool Nathan built for himself — to prospect properties, research ownership, underwrite deals, and run his brokerage. That origin matters because it means every feature was built to solve a real workflow problem, not a hypothetical one.

The platform currently serves two user types:

1. **NYC rental brokers** who use the map and building data to prospect for landlord clients
2. **Gulino Group** (Nathan's brokerage) which uses the BMS to manage deal submissions, invoices, agents, commissions, transactions, and listings

The product went live in February 2026. Three agents are actively using the prospecting tools. Early behavior confirms the core loop: **map → building → data → action.** No one has asked for new features. They want the existing tools to be faster and more complete.

---

## THE CORE LOOP

This is what works. Everything else is downstream of making this better.

```
SEARCH MAP → FIND BUILDING → DRILL INTO DATA → IDENTIFY OWNER → TAKE ACTION
                                                                    ↓
                                                            Save / Contact / 
                                                            Underwrite / Pitch
```

The map is the front door. Building data is the hook. Owner identification is the value. Speed is the constraint.

Users don't come for features — they come for information advantage. The ability to look at any building in NYC and know more about it than the person across the table.

---

## WHAT'S LIVE TODAY

### Market Intelligence (Prospecting)
- NYC property search across 4 modes (Property, Ownership, Name, Map)
- Interactive Leaflet map with PLUTO bounds queries + 14 intelligence layers
- Building profiles pulling from 17+ NYC Open Data sources
- AI-powered ownership analysis
- Contact enrichment (Apollo, People Data Labs)
- Comparable sales engine with similarity scoring
- Live listings via Brave Search
- Census/demographic neighborhood profiles
- Energy (LL84), violations (HPD, DOB), permits, litigation
- Rent stabilization data, speculation watch list
- Seller Motivation Score Engine (22 signals, 0-100 score, Hot Leads pipeline)
- Neighborhood Vitality Overlay (31-brand gentrification/distress detection)
- Virtual Street Walk (construction, sales, violations, 311, building labels at zoom 16+)

### Deal Intelligence (Underwriting)
- Full deal modeler with 5 structures (All Cash, Conventional, Bridge→Refi, Assumable, Syndication)
- AI one-click underwriting (generates full DealInputs from building data)
- Cap rate engine with market-derived rates and trend analysis
- NYC-specific: closing costs, tax reassessment, LL97 penalties, rent stabilization modeling
- Expense benchmarks from RGB I&E Study
- GP/LP promote waterfall engine
- Renovation cost estimator
- LOI generation (PDF + Word)

### Brokerage Management System (BMS) — Phases 1-10.5 Complete
- Deal submissions with approval workflow
- Commission invoice generation (single + bulk ZIP)
- Agent management with roster, detail pages, onboarding, unified identity system
- Commission plans (flat, volume-based, value-based tiers)
- Transaction pipeline (rental + sale stage workflows)
- Multi-agent deal splits with per-agent payout tracking
- Listings database with pipeline tracking
- Compliance document tracking
- Payment recording and history
- Reporting (P&L, agent production, 1099 prep, deal pipeline)
- Agent leaderboard with goals, badges, streaks
- RBAC with 4 roles, 27 permissions
- Audit logging
- Full mobile responsiveness

### Infrastructure
- Stripe billing with 4-tier pricing and feature gating
- Supabase auth with approval gate
- Gmail integration (OAuth, sync, send)
- Google Calendar 2-way sync
- Twilio phone/SMS
- CRM with contacts, pipeline, prospecting lists

---

## WHAT'S WRONG RIGHT NOW

Honest assessment of current gaps. These must be fixed before anything else gets built.

### Performance (Critical)
- **Building profile loads too slowly.** The data fusion engine hits 14+ APIs via `Promise.allSettled()`. Users feel the wait. This is the #1 thing killing the experience.
- **Tool-to-tool navigation is sluggish.** Next.js page transitions between sections feel slow. Users lose momentum.
- **Both must be fixed before any new features or market expansion.**

### Data Completeness (High Priority)
- Some building data isn't displaying correctly — fields missing or rendering wrong
- Ownership chain resolution is weak compared to Reonomy/PropertyShark
- Contact info quality (direct emails, cell phones) needs improvement
- Property data coverage has gaps — some buildings return sparse profiles

### Competitive Gaps vs. Reonomy / PropertyShark
These are the benchmarks. VettdRE needs to match or beat these platforms on the prospecting use case.

| Capability | Reonomy/PropertyShark | VettdRE Today | Gap |
|------------|----------------------|---------------|-----|
| Property lookup speed | Near-instant | Slow (multi-second loads) | **Critical** |
| Ownership chain depth | Multi-layer LLC piercing, full history | Basic entity resolution | **High** |
| Contact info quality | Direct emails, cell phones, confidence scores | Apollo/PDL enrichment, hit-or-miss | **High** |
| Data coverage | Every NYC property, complete fields | Most properties, some sparse | **Medium** |
| Underwriting tools | None (data only) | Full 5-structure deal modeler | **VettdRE advantage** |
| Brokerage operations | None | Complete BMS | **VettdRE advantage** |
| AI analysis | Basic | AI ownership, AI assumptions, one-click underwrite | **VettdRE advantage** |
| Marketing materials | None | LOI generation only | **Gap** |
| Document parsing (OM/T-12) | None | None | Opportunity |

**The competitive position is clear:** Reonomy and PropertyShark are pure data lookup tools. VettdRE is data + intelligence + operations. But the data layer needs to be *at least as fast and complete* for the intelligence and operations layers to matter.

### Competitive Landscape (Beyond Reonomy)

| Competitor | What They Do | VettdRE Overlap | Their Advantage | VettdRE Advantage |
|-----------|-------------|----------------|-----------------|-------------------|
| **Altrio** | Pipeline CRM + AI data extraction for institutional investors | Pipeline, CRM, deal tracking | AI OM/rent roll parsing, counterparty matching, fund management | Map, building data, public data, brokerage ops |
| **Northspyre** | Development management (acquisition → stabilization) | Underwriting, pro forma | Back-of-envelope quick screen, AI investment memos, construction management | Prospecting, property intelligence, BMS |
| **IntellCRE** | AI-powered CRE marketing automation | Underwriting, comps | BOVs, OMs, brochures, property microsites, branded templates in 30 seconds | Full data layer, prospecting, brokerage management |
| **Adventures in CRE** | Excel model library + education | Deal modeling concepts | 154 models across every asset class, deep waterfall variants | Live data, automation, AI, platform vs. spreadsheets |

**Strategic insight:** No competitor combines property intelligence + deal modeling + brokerage operations + document generation. Each owns one piece. VettdRE can own the full stack.

---

## THE ROADMAP

### Phase 1: Polish & Power (Now → Done When It's Done)

**Goal:** Make the existing NYC tools fast, reliable, and competitive with Reonomy/PropertyShark. This is the only phase that matters right now.

**Performance**
- Implement aggressive caching for building profile data (Redis or in-memory LRU with 15-30min TTL)
- Add skeleton/shimmer loading states so the page feels responsive while data fetches
- Prioritize critical data (PLUTO basics, ownership, violations) in first render; lazy-load secondary data (energy, comps, census)
- Prefetch building data on map hover or list scroll (before click)
- Investigate Next.js route prefetching and parallel route loading for tool-to-tool navigation
- Consider server-side rendering for building profiles with streaming (React Suspense boundaries)
- Profile and optimize the data fusion engine — identify which of the 14+ API calls are slowest and cache most aggressively
- Target: building profile loads in under 2 seconds for cached data, under 5 seconds for cold fetch

**Ownership & Entity Resolution**
- Deepen LLC piercing: follow registered agent chains, cross-reference NY DOS corporate filings with ACRIS parties
- Build ownership history timeline (who owned what, when, price paid)
- Cross-reference ownership across multiple properties to surface portfolio connections
- Display ownership confidence scores

**Contact Information**
- Layer multiple skip-tracing sources beyond Apollo/PDL
- Add contact confidence scoring (verified email vs. guessed, direct cell vs. office line)
- Cache enrichment results to avoid redundant API spend
- Display "last verified" timestamps on contact info

**Data Completeness**
- Audit every field in the building profile — identify what's broken or missing
- Ensure all 17 NYC Open Data sources are rendering correctly
- Add missing data indicators (show users what's unavailable, not just blank space)
- Improve address normalization and BBL resolution accuracy

**Deal Modeler: Quick Screen Mode** *(inspired by Northspyre)*
- Add a "Quick Analysis" step before the full deal modeler
- Back-of-envelope: purchase price + estimated NOI + rough cap rate → IRR, cash-on-cash, equity multiple in 5 seconds
- Progressive disclosure: Quick Screen → "Go Deeper" → full 5-structure deal modeler
- Available directly from building profile ("Quick Screen This Building")
- Uses AI assumptions engine for instant pre-fill, but user can override 3-4 key numbers
- Goal: answer "does this deal pencil?" before committing to full underwriting

**UX Polish**
- Fix all rendering bugs and display issues
- Improve map interaction (load speed, marker clustering at scale, bounds queries)
- Streamline the building profile layout — most important data first, progressive disclosure for deep dives
- Make the search → building → action flow feel seamless (fewer clicks, better transitions)
- Implement Airbnb-style pill bar for map layer controls (replace checkbox clutter)

**Acceptance Criteria for Phase 1:**
- Nathan uses VettdRE as his primary prospecting tool every day without reaching for PropertyShark
- Building profiles load in under 2 seconds (cached) / 5 seconds (cold)
- Tool-to-tool navigation feels instant
- Ownership data is as deep as or deeper than Reonomy for NYC properties
- Contact enrichment returns a usable phone/email for 70%+ of identified owners
- Zero broken fields or rendering bugs in building profiles
- Quick Screen returns a go/no-go answer in under 10 seconds from any building profile

---

### Phase 2: Scale Preparation (After Phase 1)

**Goal:** Make VettdRE ready for other people. Not marketing, not user acquisition — infrastructure for scale and a frictionless entry experience.

**Free Tier & Onboarding**
- Define exactly what's in the free tier vs. paid:
  - **Free:** BMS core (submissions, invoices, basic agent management), NYC market intel (property search, basic building profiles), map access
  - **Paid (Pro):** Full building profiles with all 17+ data sources, ownership/entity research, contact enrichment, deal modeler, AI assumptions, advanced BMS (bulk upload, reporting, compliance, audit log)
  - **Enterprise:** White-label, API access, dedicated support
- Build a zero-friction signup flow: email → confirm → you're in the app within 30 seconds
- First-time user experience: land on the map, see your area, click a building, get value immediately
- No onboarding wizard, no 8-step setup. Drop them into the map. Let the product speak.
- Progressive feature discovery — surface paid features naturally as users hit walls, not through nag screens
- Consider demo/sample data for users outside NYC so they can experience the product before their market is live

**Authentication & Multi-Tenancy**
- Harden Supabase auth for scale: rate limiting, abuse prevention, email verification
- Audit multi-tenant data isolation — every query scoped to orgId
- Ensure feature gating works flawlessly for free ↔ paid transitions
- Stripe billing flow: free → trial → paid must be seamless

**Technical Debt & Stability**
- Error monitoring and alerting (Sentry or equivalent)
- Uptime monitoring for all external API dependencies
- Automated testing for critical paths (search, building profile, deal modeler)
- Database performance audit — add indexes, optimize queries, check for N+1 patterns
- API rate limiting and cost controls (especially for Apollo, PDL, Claude)

**Documentation**
- API documentation if planning to offer API access to enterprise clients
- Internal architecture docs for any future developers/contractors
- User-facing help docs or tooltips for complex features (deal modeler, BMS workflows)

**Acceptance Criteria for Phase 2:**
- A new user can sign up, reach the map, and search a property in under 60 seconds
- Free tier provides genuine value without feeling crippled
- Upgrade prompts feel natural, not predatory
- Platform handles 100+ concurrent users without degradation
- All critical paths have error handling and monitoring

---

### Phase 2.5: Document Generation & Deal Marketing (After Phase 2)

**Goal:** Turn VettdRE's data and intelligence into professional, branded deliverables that brokers can send to clients, investors, and counterparties. This is the highest-value feature gap identified from competitive analysis (IntellCRE, Altrio, Northspyre).

**Why now:** VettdRE already has all the inputs — building data, comps, cap rates, deal modeling, ownership intelligence. The missing piece is output. Brokers need to hand something to a client. Right now they export to Excel or copy-paste. This phase makes VettdRE the tool that produces the pitch, not just the research behind it.

**Document Generation Engine**
- Templated PDF/DOCX generation system using existing jsPDF + docx patterns (proven with LOI and invoice generators)
- Brokerage branding integration: logo, colors, fonts, disclaimers pulled from BrandSettings (already in BMS)
- All documents feature-gated (Pro+ tier)

**Broker Opinion of Value (BOV)** — *Priority 1*
- One-click from building profile: "Generate BOV"
- Pulls: building overview (PLUTO), comps (comps engine), cap rate analysis, ownership summary, market context (census/neighborhood), estimated value range
- Sections: Executive Summary, Property Overview, Comparable Sales (with map), Market Analysis, Valuation Opinion, Marketing Strategy Outline, Broker Bio/Contact
- Output: branded PDF (8-12 pages)
- This is what brokers hand to landlords to win listing assignments. High-frequency, high-stakes document.

**Investment Summary / Deal Memo** — *Priority 2*
- One-click from deal modeler: "Generate Investment Summary"
- Pulls: deal inputs, projected returns (IRR, equity multiple, cash-on-cash), sensitivity analysis, cap rate analysis, expense benchmarks, proforma highlights
- Sections: Deal Overview, Financial Summary, Return Projections, Sensitivity Matrix, Market Context, Risk Factors
- Output: branded PDF (5-8 pages)
- Inspired by Northspyre's AI Investment Memo — distills full underwriting into a shareable document for investment committees or partners

**One-Page Flyer / Teaser** — *Priority 3*
- Quick marketing piece from BMS listing or building profile
- Front: hero photo (if available), address, key stats (units, SF, year built, asking price), highlights
- Back: map, comps summary, contact info
- Output: PDF (1-2 pages, print-ready)
- Inspired by IntellCRE's brochure automation

**OM (Offering Memorandum)** — *Priority 4 (stretch)*
- Full offering memorandum combining building profile + deal analysis + market data + photos
- Sections: Cover, Table of Contents, Executive Summary, Property Description, Financial Analysis, Rent Roll Summary, Market Overview, Comparable Sales, Location Map, Offering Terms
- This is a larger effort than BOV/Investment Summary and may require photo upload and richer layout support
- Consider whether to build in-house or integrate with IntellCRE's API if available

**Technical Approach**
- Reuse `invoice-simple-pdf.ts` pattern (jsPDF) for simpler documents (flyers, BOVs)
- Use `docx` package for Word output (already proven with LOI generator)
- New `src/lib/document-templates/` directory with template definitions
- Server actions that aggregate data from multiple sources (building profile + deal modeler + comps) into a unified document payload
- Template selection UI: user picks template style, customizes cover text, generates

**Acceptance Criteria for Phase 2.5:**
- BOV generates in under 10 seconds from any NYC building profile
- Investment Summary generates from any saved deal analysis
- All documents render with brokerage branding (logo, colors, contact info)
- PDF output is print-quality (300 DPI images where applicable)
- Documents are shareable (download + optional email via Gmail integration)
- Zero manual data entry required — everything auto-fills from platform data

---

### Phase 3: Universal Property Architecture (After Phase 2.5)

**Goal:** Refactor the NYC-specific code into a universal pattern that supports multiple markets. Prove the pattern works with a second US city.

**The Architecture**

```
┌─────────────────────────────────────────┐
│         LAYER 2: INTELLIGENCE           │
│   AI, deal modeling, visualization      │
│   Speaks only to Universal Property     │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│         LAYER 1: CORE PLATFORM          │
│   BMS, CRM, Pipeline, Calendar, Docs   │
│   Speaks only to Universal Property     │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│         LAYER 0: DATA LAYER             │
│   Universal Property Object             │
│   + Local Market Adapters               │
│   (NYC | US National | CA | UK | ...)   │
└─────────────────────────────────────────┘
```

**The Universal Property Object**

Every property maps to one schema. Market-specific fields extend it via adapters.

```typescript
interface UniversalProperty {
  vettdreId: string;
  localIdentifiers: LocalId[];     // BBL (NYC), APN (US), UPRN (UK)
  address: NormalizedAddress;
  coordinates: LatLng;
  propertyType: PropertyType;
  size: { value: number; unit: 'sqft' | 'sqm' };
  yearBuilt?: number;
  estimatedValue?: { amount: number; currency: string };
  ownershipEntity?: Entity;
  transactions: Transaction[];
  documents: Document[];
  localData: MarketAdapterData;    // Market-specific extension
}
```

**The Strangler Fig Refactor**

Critical rule: Never break what's working. Grow the new architecture around the existing one.

Step 1 — Additive Only (no existing code changes):
- Create `src/lib/property-schema.ts` — Universal Property Object types
- Create `src/lib/adapters/base-adapter.ts` — Adapter interface
- Create `src/lib/adapters/nyc/index.ts` — NYC adapter wrapping existing `data-fusion-engine.ts` unchanged
- Create `src/lib/adapters/registry.ts` — Market → adapter mapping

Step 2 — Translation Layer (most careful phase):
- Building profile accepts `UniversalProperty | PlutoData` union type
- Render universal fields where they exist, fall back to raw PLUTO where they don't
- Route `building-profile-actions.ts` through NYC adapter
- Test extensively — every building profile feature must work identically

Step 3 — Database (additive migrations only):
- `PropertyIdentifier` model (vettdreId, market, idType, value)
- `MarketAdapter` model (market, displayName, isActive, isPremium)
- Never rename or drop existing columns

Step 4 — Second Market (proves the pattern):
- Identify the best US city for expansion based on public data availability
- Candidates: Chicago (Cook County data), Philadelphia (OPA data), Los Angeles (county assessor), Miami-Dade (county property appraiser)
- Build the adapter, validate that the universal schema works across different data shapes
- This becomes the first paid Market Pack

**Acceptance Criteria for Phase 3:**
- NYC works exactly as before (zero regressions)
- Building profile renders identically for NYC properties whether accessed through the old path or the new adapter path
- Second US market is searchable and delivers building profiles
- The adapter interface is clean enough that adding a third market is a 1-2 week effort, not a month

---

### Phase 4: Prepare for Canada & UK (After Phase 3 Proven)

**Goal:** Validate the adapter pattern works across international boundaries with different data structures, legal systems, and currencies.

**Canada — Major Cities**
- Target markets: Toronto, Vancouver, Montreal (if English data available)
- Data sources to research: MPAC (Municipal Property Assessment Corporation), land registry offices, city open data portals
- Business logic: Canadian mortgage rules, land transfer tax (Ontario), property transfer tax (BC), foreign buyer restrictions
- Currency: CAD
- Area unit: sqft (Canada uses both, but real estate industry uses sqft)

**UK — Major Cities**
- Target markets: London, Manchester, Birmingham
- Data sources to research: HM Land Registry (price paid data is free), EPC Register, Planning Portal, council tax bands
- Business logic: Stamp duty land tax, leasehold vs. freehold, EPC compliance requirements, Section 21/Section 8
- Currency: GBP
- Area unit: sqft (UK real estate uses sqft despite metric system)
- ID type: UPRN (Unique Property Reference Number)

**Israel (Nathan Priority)**
- Research required: Tabu (Land Registry), local municipality data, Madlan
- Business logic: Arnona (municipal tax), Mas Shevach (capital gains), Betterment Levy
- Currency: ILS
- Area unit: sqm

**For Each New Market:**
1. Audit available public data sources (free and paid)
2. Map available fields to the Universal Property Object
3. Identify what's missing vs. NYC (every market will have less data)
4. Build the adapter
5. Create market-specific business logic (tax calculations, regulatory rules)
6. Design market-specific building profile sections
7. Test with real properties

**What NOT To Build Yet:**
- Data marketplace (requires thousands of users to have leverage with data providers)
- White-label (requires proven multi-market product first)
- PMS / Property Management System (see Future Considerations below)
- Investor Portal / LP Reporting (Nathan isn't managing investor capital yet)

---

## MARKET EXPANSION PRIORITY ORDER

| Priority | Market | Why | Data Richness | Estimated Effort |
|----------|--------|-----|---------------|-----------------|
| 1 | NYC (current) | Live, proven, Nathan's home market | Excellent (17+ sources) | Polishing |
| 2 | Second US city | Proves adapter pattern domestically | Good (varies by city) | 3-4 weeks |
| 3 | Canadian majors | English-speaking, similar market structure | Moderate | 4-6 weeks |
| 4 | UK majors | English-speaking, rich public data | Good (Land Registry is excellent) | 4-6 weeks |
| 5 | Israel | Personal priority for Nathan | Research needed | TBD |

**Do not expand to a new market until the previous market's adapter is stable and the data is rendering correctly.**

---

## PRICING PHILOSOPHY

**The model: Free operational tools → paid intelligence.**

| Tier | Price | What's Included | Purpose |
|------|-------|-----------------|---------|
| **Free** | $0 | BMS core, basic market intel (search, map, basic building data), limited enrichment | Get users in the door. Daily usage habit. |
| **Pro** | ~$50-199/mo | Full building profiles, ownership research, contact enrichment, deal modeler, AI tools, document generation (BOV, investment summary, flyer), advanced BMS | The money maker. Information advantage. |
| **Enterprise** | $499+/mo | White-label branding, API access, market pack subscriptions, OM generation, dedicated support | Scale play for brokerages. |

The free tier must provide genuine standalone value. A broker should be able to search properties and get basic building info without paying. The upgrade trigger should be organic: "I found the building, now I need the owner's phone number" → that's a Pro feature. "I need to send a BOV to this landlord" → also Pro.

**Revenue is not the immediate priority.** Nathan can self-fund. The priority is building a product so good that charging for it later is easy. Current revenue: Gulino Group at $499/mo + 3 agents grandfathered at $50/mo = ~$650/mo when billing starts.

**Validation from competitors:** Northspyre gives away pro forma modeling free and charges for pipeline/management. IntellCRE charges for marketing material generation. Altrio charges for pipeline + AI extraction. The pattern holds: give away the tool that creates the habit, charge for the output that creates the value.

---

## FUTURE CONSIDERATIONS

These are real opportunities but NOT current priorities. They go on the roadmap only after Phases 1-4 are complete. Ordered by strategic value and feasibility.

### AI Document Parsing (OM Intake) — *High Value, Post Phase 2.5*
*Inspired by: Altrio's AI-powered data extraction*

Upload a broker's offering memorandum PDF → AI extracts rent roll, T-12, unit mix, asking price, cap rate, expense breakdown → auto-populates the deal modeler. This closes the "I received a deal, now I need to analyze it" workflow gap.

**Technical approach:** Claude API with structured output extraction. PDF text extraction (already have jsPDF patterns). Table parsing for rent rolls and T-12s. Confidence scoring on extracted values with human review step.

**Why it matters:** This is the inverse of document generation. Phase 2.5 produces documents FROM VettdRE data. OM parsing brings external documents INTO VettdRE. Together they make VettdRE the hub for all deal documentation flow.

**When to build:** After document generation is proven (Phase 2.5). The parsing engine reuses the same data schemas — it just fills them from PDFs instead of from building profiles.

### Property Microsites — *Medium Value, Post Phase 2.5*
*Inspired by: IntellCRE's property websites*

Auto-generate a public-facing listing page from BMS listing data. Each listing gets a shareable URL with photos, key stats, map, financials, and lead capture form. Buyer/investor engagement tracking (who viewed, which sections, how long).

**Connection to existing features:** BMS already has listings with full property data. BrandSettings already stores brokerage branding. The microsite is a public rendering of data that's already in the platform.

**Technical approach:** Dynamic Next.js route (`/listing/[slug]`) with public access (no auth). OG meta tags for social sharing. Optional NDA gate before showing financials. Lead capture feeds into CRM contacts.

**When to build:** After BMS listings are being actively used by multiple brokerages. The microsite is a marketing channel — it needs enough listings to justify the investment.

### Asset-Class Specific Deal Models — *High Value, Long-term*
*Inspired by: Adventures in CRE's 154-model library*

Extend the deal modeler beyond multifamily. Each asset class has fundamentally different revenue drivers, expense structures, and risk factors:

| Asset Class | Key Revenue Drivers | Unique Expense Items | Unique Modeling Needs |
|------------|-------------------|---------------------|----------------------|
| **Hotel** | RevPAR, ADR, occupancy by season | FF&E reserves (4-5% of revenue), franchise fees, management fees | Seasonal revenue curves, STR vs. flagged, PIP requirements |
| **Retail** | Base rent + percentage rent + CAM recovery | Tenant improvement allowances, leasing commissions | Lease-by-lease modeling, NNN vs. gross, anchor vs. inline |
| **Industrial** | NNN rent/SF, dock income | Clear height premium, specialized TI | Logistics location scoring, warehouse vs. flex vs. cold storage |
| **Office** | Rent/SF by floor, parking revenue | TI/LC, free rent periods, operating expense stops | Lease rollover risk, return-to-office sensitivity, co-working mix |
| **Self-Storage** | Unit mix by size × occupancy × rate | Minimal TI, low CapEx | Occupancy ramp curves, ancillary revenue (insurance, moving supplies) |
| **Condo Development** | Price/SF by floor, view, exposure | Construction hard/soft costs, sales commissions | Absorption schedule, construction timeline, pre-sales vs. spec |
| **Mixed-Use** | Combination of above | Shared infrastructure allocation | Multi-tenant-type NOI, cross-subsidization |

**Approach:** Each asset class becomes a deal modeler "mode" with its own input form, expense categories, and revenue assumptions. The core calculation engine (DCF, IRR, equity waterfall) stays shared. NYC-specific regulatory overlays (LL97, rent stabilization) apply where relevant.

**When to build:** After the multifamily deal modeler is best-in-class and the universal property architecture (Phase 3) provides data for non-NYC markets. Start with the asset class Nathan models most frequently after multifamily.

### Advanced Waterfall Structures — *Medium Value, Post Asset-Class Models*
*Inspired by: Adventures in CRE's 18 waterfall variants*

The current promote engine handles basic GP/LP waterfalls. Real deals use more complex structures:

- Multiple LP tiers with different pref rates
- Co-invest structures (GP capital alongside LP)
- Catch-up provisions with lookback
- IRR hurdles vs. equity multiple hurdles (or both)
- Pref with compounding (simple vs. compound)
- Clawback provisions
- Distribution recycling

**When to build:** When Nathan or VettdRE users are actively structuring syndicated deals with institutional LPs who require these structures.

### Property Management System (PMS)
A free-tier PMS (rent roll, tenant records, lease dates, maintenance requests) could be a powerful daily-use hook for property owners/operators. But building a competitive PMS is a large effort and competes with mature products (AppFolio, Buildium, Yardi). The PMS becomes compelling when it's *integrated with the intelligence layer* — a landlord managing tenants in the PMS who can also pull building comps, model a sale, or benchmark expenses against market data. Without that integration, it's just another PMS.

**When to build:** After the core prospecting/intelligence tools are best-in-class and the multi-market architecture is proven. The PMS connects naturally to the existing BMS listings module.

### Data Marketplace
An API marketplace where users purchase premium data sources (CoStar, ATTOM, CoreLogic) pre-wired into the platform. VettdRE acts as the normalization and intelligence layer. This requires significant user volume to have negotiating leverage with data providers. It's a Phase 2-of-the-company play.

**When to build:** After 1,000+ active users create demand that data providers want to reach.

### Investor Portal / LP Reporting
Separate portal for investor relations, capital commitments, distributions, K-1 records. Connects to the existing GP/LP promote engine. Market is dissatisfied with incumbents (Juniper Square, InvestNext).

**When to build:** When Nathan is actively managing LP capital and needs this for his own operations.

### White-Label
Every tool white-labelable under a client brokerage's brand. This is the enterprise revenue path. IntellCRE has proven the pattern — every document, every template, every microsite renders in the client's brand. VettdRE's BrandSettings infrastructure already supports this at the BMS level.

**When to build:** After at least one external brokerage is paying for and actively using the full BMS + intelligence stack.

### CRM-Connected Deal Marketing — *Post Property Microsites*
*Inspired by: Altrio's smart counterparty matching + IntellCRE's engagement analytics*

When a broker generates a BOV or sends a listing microsite, track buyer/investor engagement (opens, time on page, sections viewed). Auto-create CRM contact records when prospects submit info. Match deals to investor criteria from CRM profiles. Log interest levels, pass reasons, and follow-up triggers.

**When to build:** After Property Microsites and document generation are both live and producing measurable engagement data.

---

## TECHNICAL PRINCIPLES

These rules apply to all development on VettdRE.

### Architecture
- **Never modify working files without explicit instruction.** New features go in new files alongside existing ones.
- **The NYC adapter must wrap existing code, not rewrite it.** It calls `data-fusion-engine.ts` internally.
- **Union types during transition.** Components that accept `PlutoData` should accept `PlutoData | UniversalProperty` during migration.
- **No destructive Prisma migrations.** Add columns and tables only. Never rename or drop until confirmed safe.
- **Export types from non-server files.** Never `export type { ... }` from `"use server"` files.

### Data
- Numeric values in Socrata `$where` clauses must never be quoted
- Graceful degradation: API failures return empty results, never crash
- Parallel fetching with `Promise.allSettled()` for building profiles
- `Array.isArray()` checks before spreading API responses
- `JSON.parse(JSON.stringify(obj))` for Server→Client serialization

### UI
- Tailwind + shadcn/ui for all styling
- Mobile-first: `md:` breakpoint, 16px inputs (`text-base sm:text-sm`), bottom-sheet modals
- Feature gate everything using `src/lib/feature-gate.ts`
- Dynamic imports for lazy-loading heavy components
- `circleMarker` not `Marker` for Leaflet map performance

### Performance (New Priority)
- Cache aggressively: building profile data should be cached at multiple layers
- Skeleton states for everything — never show a blank screen while loading
- Prioritize above-the-fold data in building profiles
- Lazy-load secondary data sections
- Prefetch on hover/scroll when possible
- Monitor and optimize: track load times, identify bottlenecks

---

## TECH STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack, standalone output) |
| Language | TypeScript 5 (strict mode) |
| Database | Supabase (PostgreSQL), Prisma 5.22 ORM |
| Auth | Supabase Auth (email/password, magic links) + approval gate |
| Payments | Stripe (Checkout, Webhooks, Billing Portal) |
| Hosting | Google Cloud Run (Docker, Node 20-Alpine, port 8080) |
| Maps | Leaflet (dynamic import, no SSR, circleMarker for perf) |
| AI | Anthropic Claude API |
| Search | Brave Search API |
| Enrichment | Apollo.io, People Data Labs |
| Communication | Twilio (SMS + voice), Gmail API (OAuth) |
| Styling | Tailwind CSS 4 + shadcn/ui |

---

## THE NORTH STAR

VettdRE exists because real estate professionals make million-dollar decisions based on incomplete information, fragmented tools, and gut instinct.

The product replaces that with a single platform where you can find any property, know everything about it, model the deal, produce the pitch, manage the transaction, and operate the asset — faster and with better data than anyone else at the table.

The near-term mission is simpler: **make the NYC prospecting and intelligence tools so fast, complete, and reliable that no serious NYC real estate professional would use anything else.**

Get that right, and everything else follows.

---

*This document replaces all previous vision documents. Paste it at the start of any new Claude conversation to resume with full context.*
