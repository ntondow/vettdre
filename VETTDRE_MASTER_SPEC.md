# VettdRE — Master Product Spec

Read CLAUDE.md for project context.

---

## Product Vision

VettdRE is a **Real Estate Command Center** — the best tool for sourcing and closing **OFF-MARKET deals**, with on-market listings as a complementary overlay.

```
FIND → REACH → MODEL → OFFER → RAISE → CLOSE
```

Each stage is a standalone tool that can be individually gated behind subscription tiers.

---

# PART 1: INTELLIGENCE ENHANCEMENTS

## 1. New Development Pipeline (DOB NOW Job Filings)

### Data Source
NYC Open Data: **DOB NOW: Build – Job Application Filings** 
API Endpoint: `https://data.cityofnewyork.us/resource/ic3t-wcy2.json`

This dataset already exists in the codebase (DOB Permits `ic3t-wcy2`), but we need to use it specifically to find NEW BUILDINGS (NB) and large alterations.

### Filter Logic for New Developments
Query DOB filings where:
```
job_type = 'NB' (New Building)
AND proposed_dwelling_units >= 10   (meaningful size for leasing)
AND filing_status IN ('APPROVED', 'PARTIALLY APPROVED', 'IN PROCESS')
AND borough = [user selected]
```

Also useful:
```
job_type = 'A1' (Major Alteration — gut renovations, conversions)
AND proposed_dwelling_units >= 10
AND existing_dwelling_units = 0 OR existing_dwelling_units IS NULL
```

### Key Data Points from DOB Filings
| Field | Use |
|-------|-----|
| `job_filing_number` | Unique ID |
| `borough` | Borough filter |
| `house_number` + `street_name` | Address |
| `block` + `lot` | BBL for cross-referencing |
| `job_type` | NB = New Building, A1 = Major Alteration |
| `proposed_dwelling_units` | Total units being built |
| `proposed_stories` | Building height |
| `proposed_occupancy` | Residential, mixed-use, etc. |
| `filing_status` | Approved, In Process, etc. |
| `filing_date` | When filed |
| `permittee_business_name` | Developer/GC company |
| `permittee_first_name` + `permittee_last_name` | Developer contact |
| `permittee_phone` | Developer phone |
| `owner_business_name` | Owner/developer entity |
| `owner_first_name` + `owner_last_name` | Owner name |
| `owner_phone` | Owner phone |
| `estimated_job_costs` | Construction budget (signals scale) |
| `community_board` | Neighborhood context |
| `zoning_district` | Zoning info |

### New Development Search UI

Add a 5th search mode to Market Intel: **"New Development"**

Tab bar becomes:
```
[Property] [Ownership] [Name/Portfolio] [Map] [New Development]
```

**New Development Search Page:**
```
+----------------------------------------------------------+
| New Development Search                                    |
|                                                          |
| Borough: [All v]  Min Units: [10___]  Status: [All v]   |
|                                                          |
| Job Type: [o New Building] [o Major Alteration] [o Both] |
|                                                          |
| Min Est. Cost: [$________]   Filed After: [____-__-__]   |
|                                                          |
|                          [Search]                        |
+----------------------------------------------------------+
| 147 new developments found                               |
|                                                          |
| +----------------------------------------------------+  |
| | 456 Atlantic Ave, Brooklyn          NB | 120 units  |  |
| | Developer: Atlantic Realty Partners LLC              |  |
| | Contact: John Smith - (718) 555-0123                |  |
| | Est. Cost: $45M - Filed: Jan 2025 - Status: Approved|  |
| | 12 stories - R7A zoning                             |  |
| |                                                     |  |
| |          [View Details] [+ Add to CRM] [Prospect]   |  |
| +----------------------------------------------------+  |
+----------------------------------------------------------+
```

### New Development Details Panel
When "View Details" is clicked, show a slide-over with:

**Header:**
- Address + borough
- Job type badge (New Building / Major Alteration)  
- Status badge (Approved / In Process)
- Units count prominent

**Developer/Owner Section:**
- Owner name + business name
- Owner phone (tap to call)
- Permittee name + business name  
- Permittee phone (tap to call)
- [+ Add to CRM] button for each person
- [Apollo Lookup] button to enrich the developer

**Building Specs:**
- Proposed units + stories
- Estimated job cost
- Zoning district
- Occupancy type
- Filing date

**Cross-Reference Section (auto-loaded):**
- PLUTO data for the lot (if exists — may not for vacant lots)
- Any existing HPD violations (for A1 alterations on existing buildings)
- ACRIS: who owns the lot? Recent sales?
- Related filings at same address

**Actions:**
- [+ Add Developer to CRM] → creates landlord contact with dev data
- [Add to Prospect List] → adds to prospecting
- [Draft Pitch] → opens compose with leasing pitch template

### Server Action

Create `src/app/(dashboard)/market-intel/new-development-actions.ts`:

```typescript
"use server";

export async function searchNewDevelopments(filters: {
  borough?: string;
  minUnits?: number;
  jobType?: 'NB' | 'A1' | 'both';
  status?: string;
  minCost?: number;
  filedAfter?: string;
}) {
  const params = new URLSearchParams();
  
  // Base: new buildings or major alterations
  if (filters.jobType === 'NB') {
    params.append('$where', `job_type='NB'`);
  } else if (filters.jobType === 'A1') {
    params.append('$where', `job_type='A1'`);
  } else {
    params.append('$where', `job_type IN('NB','A1')`);
  }
  
  // Add filters
  let whereClause = params.get('$where') || '';
  
  if (filters.borough) {
    const boroMap: Record<string, string> = {
      'MANHATTAN': '1', 'BRONX': '2', 'BROOKLYN': '3', 
      'QUEENS': '4', 'STATEN ISLAND': '5'
    };
    whereClause += ` AND borough='${boroMap[filters.borough] || filters.borough}'`;
  }
  
  if (filters.minUnits) {
    whereClause += ` AND proposed_dwelling_units >= ${filters.minUnits}`;
  }
  
  if (filters.status) {
    whereClause += ` AND filing_status='${filters.status}'`;
  }
  
  if (filters.minCost) {
    whereClause += ` AND estimated_job_costs >= ${filters.minCost}`;
  }
  
  if (filters.filedAfter) {
    whereClause += ` AND filing_date >= '${filters.filedAfter}'`;
  }

  const url = `https://data.cityofnewyork.us/resource/ic3t-wcy2.json?$where=${encodeURIComponent(whereClause)}&$order=filing_date DESC&$limit=200`;
  
  const response = await fetch(url, {
    headers: { 'X-App-Token': process.env.NYC_OPEN_DATA_TOKEN || '' }
  });
  
  return response.json();
}
```

---

## 2. Confidence Score Restructure

### Rename
**Old:** "AI Lead Score"  
**New:** "Data Confidence Score"

### Philosophy
- Measures DATA RELIABILITY, not lead quality
- NYC public data confirms IDENTITY (who owns this building)
- Apollo/PDL confirms REACHABILITY (how to contact them)
- Score answers: "How confident are we in this ownership + contact data?"

### New Scoring Rubric (max 100 pts)

**Identity Confirmation (NYC Public Data) — max 50 pts:**
| Factor | Points | Description |
|--------|--------|-------------|
| HPD Registration Match | +15 | Owner name matches HPD registration |
| ACRIS Deed Match | +15 | Owner matches deed records |
| PLUTO Owner Match | +10 | Owner matches tax lot data |
| DOB Filing Match | +5 | Owner name on building permits |
| DOB Phone Found | +5 | Phone number in DOB filings |

**Reachability (Enrichment Data) — max 50 pts:**
| Factor | Points | Description |
|--------|--------|-------------|
| Phone Found (any source) | +5 | At least one phone number |
| Phone Verified (2+ sources) | +10 | Same phone in multiple sources |
| Phone Cross-Match (DOB + Apollo/PDL) | +5 | DOB phone confirmed by enrichment |
| Email Found (Apollo) | +8 | Apollo returned an email |
| Email Found (PDL) | +5 | PDL returned an email |
| Email Confirmed (Apollo + PDL) | +2 | Both sources agree on email (12 total) |
| Apollo Person Match | +10 | Apollo found this person |
| Apollo Org Match | +5 | Apollo found their organization |
| PDL Person Match | +5 | PDL found this person |
| LinkedIn Found | +5 | LinkedIn profile found |
| Mailing Address Matches | +5 | Mailing address confirmed |

### Grade Thresholds
- **A (85-100):** High confidence — identity confirmed, verified contact info
- **B (70-84):** Good confidence — identity confirmed, some contact info
- **C (50-69):** Moderate — identity likely, limited contact info
- **D (30-49):** Low — identity uncertain, minimal contact info
- **F (0-29):** Very low — limited or conflicting data

### What scores mean in practice
- Identity-only (NYC data matches but no enrichment) → ~40-50 (D/C grade)
- Identity + some contact info → ~60-70 (C/B grade)
- Full verification (identity + verified phone + email + LinkedIn) → 80+ (A/B grade)

### UI Display

```
+--------------------------------------------------+
| Data Confidence Score              78 / 100  [B] |
+--------------------------------------------------+
| IDENTITY                                         |
| [x] HPD Registration Match    Owner confirmed  15|
| [x] ACRIS Deed Match          Deed matches     15|
| [x] PLUTO Owner Match         Tax lot matches  10|
| [ ] DOB Filing Match           Not checked       0|
|                                                  |
| REACHABILITY                                     |
| [x] Apollo Person Match       Found in Apollo   10|
| [x] Email Found (Apollo)      Email available    8|
| [x] Phone Verified (2+ src)   HPD + Apollo      10|
| [ ] PDL Person Match          Not checked        0|
| [x] LinkedIn Found            Profile found      5|
| [ ] Apollo Org Match           Not checked        0|
| [ ] DOB Filing Match           Not checked        0|
| [ ] PDL Match                  Not checked        0|
+--------------------------------------------------+
```

- Green checkmark for matched/confirmed factors
- Gray box for unmatched or unchecked
- Each row: factor name + description + points
- Score + grade badge in header (color-coded: green A/B, yellow C, red D/F)
- Remove the old "Verified" badge — it's misleading. Show grade badge only.

### Implementation

Update `src/app/(dashboard)/market-intel/lead-verification.ts`:
- Rename the function from `calculateLeadScore` to `calculateConfidenceScore`
- Replace the scoring rubric with the one above
- Accept all data sources as input: HPD, ACRIS, PLUTO, DOB, PDL result, Apollo result
- Return `ConfidenceScoreBreakdown` with factors

Update `src/app/(dashboard)/market-intel/building-profile.tsx`:
- Rename "AI Lead Score" section to "Data Confidence Score"
- Show the factor breakdown instead of the old scoring
- Color the score badge based on grade
- Remove "Verified" text from the header

Update `src/app/(dashboard)/market-intel/building-profile-actions.ts`:
- Call the new `calculateConfidenceScore` function with all available data
- Pass Apollo and PDL results into the scoring

---

## 3. Apollo Expansion

### 3A. Auto-Enrich on Contact Creation

When a contact is created via "Add to CRM" from a building profile or anywhere in Market Intel:

In `building-profile-actions.ts` > `createContactFromBuilding`:
```typescript
// After creating the contact:
// 1. Run Apollo People Enrichment
const apolloResult = await enrichPerson({
  first_name: data.firstName,
  last_name: data.lastName,
  organization_name: data.company,
  domain: data.company ? await guessCompanyDomain(data.company) : undefined,
});

// 2. If Apollo found them, update contact with enriched data
if (apolloResult?.person) {
  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      email: apolloResult.person.email || contact.email,
      phone: apolloResult.person.phone_numbers?.[0]?.sanitized_number || contact.phone,
      typeData: {
        ...contact.typeData,
        apolloEnriched: true,
        linkedinUrl: apolloResult.person.linkedin_url,
        title: apolloResult.person.title,
        photoUrl: apolloResult.person.photo_url,
        seniority: apolloResult.person.seniority,
      }
    }
  });
}

// 3. If landlord with a company, also run Org Enrichment
if (data.contactType === 'landlord' && data.company) {
  const orgResult = await enrichOrganization({ domain: companyDomain });
  if (orgResult?.organization) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        typeData: {
          ...contact.typeData,
          orgIndustry: orgResult.organization.industry,
          orgRevenue: orgResult.organization.estimated_num_employees,
          orgEmployees: orgResult.organization.estimated_num_employees,
          orgWebsite: orgResult.organization.website_url,
          orgPhone: orgResult.organization.phone,
          orgFounded: orgResult.organization.founded_year,
          orgLogo: orgResult.organization.logo_url,
        }
      }
    });
  }
}
```

Show a toast: "Contact created + enriched with Apollo data"

### 3B. Organization Intelligence Card (Landlord Dossier)

When a landlord contact has org data (from 3A), show:

```
+--------------------------------------------------+
| Organization Intelligence                        |
|                                                  |
| [LOGO] 97 Dupont LLC                            |
|                                                  |
| Industry:    Real Estate                         |
| Founded:     2008                                |
| Employees:   12                                  |
| Revenue:     $5M - $10M                          |
| Website:     97dupont.com                        |
| Phone:       (718) 336-1400                      |
| Address:     97 Dupont St, Brooklyn, NY 11222    |
|                                                  |
| Source: Apollo.io                                |
+--------------------------------------------------+
```

If org data isn't populated yet, show a "Enrich Company" button that triggers Apollo Org Enrichment on demand and saves results to typeData.

### 3C. Find Decision Makers (Landlord Dossier)

Add a "People at [Company]" section to the landlord contact dossier.

```
+--------------------------------------------------+
| People at 97 Dupont LLC                          |
|                                                  |
| Dorothy Chasewood — Owner (this contact)         |
|    dorothy@97dupont.com - (718) 336-1416         |
|                                                  |
| Michael Torres — Property Manager            [+] |
|    m.torres@97dupont.com - (718) 336-1420        |
|                                                  |
| Sarah Kim — Leasing Agent                    [+] |
|    s.kim@97dupont.com                            |
|                                                  |
|            [Find More People] (FREE)             |
+--------------------------------------------------+
```

Implementation — use Apollo People Search (FREE, no credits):
```typescript
const people = await findPeopleAtOrg({
  organization_name: contact.typeData.entityName,
  person_titles: ['Owner', 'Principal', 'CEO', 'Property Manager', 
                  'Managing Director', 'VP Operations', 'Leasing', 
                  'Director of Leasing'],
});
```

Each person shows:
- Photo (from Apollo)
- Name + title
- Email + phone (if enriched — costs 1 credit per person)
- [+] button to add as a separate CRM contact
- "Find More People" button to run the search again with broader titles

### 3D. Bulk Enrich Prospect List

On the Prospecting page:
- Add "Enrich All" button in the toolbar
- Selects all prospects that haven't been enriched yet (typeData.apolloEnriched !== true)
- Runs Apollo Bulk People Enrichment (max 10 per API call)
- Shows progress: "Enriching 23 prospects... 10/23"
- Batches into groups of 10
- Updates each prospect's owner data with Apollo results (linkedinUrl, title, photoUrl, verified email/phone)
- Summary toast: "23 prospects enriched. 18 matched, 5 no match."
- Shows credit usage: "Used 23 credits (9,977 remaining)"

### 3E. Email Personalization with Apollo Data

When composing an email to a landlord contact that has Apollo data, auto-suggest personalizations:
- Auto-fill merge variables: `{title}`, `{company}`, `{industry}`
- Show a "Personalize" button that uses AI to draft an opening line using their title, company, and portfolio context

---

## 4. Map Integration for New Developments

Add new development markers to the existing map search:

### Map Filter Addition
Add a toggle/checkbox to the map filter panel:
```
[x] Show existing buildings
[x] Show new developments (crane markers)
```

### New Development Markers
- Icon: crane icon — distinct from existing building markers
- Color: orange/amber (vs blue for existing buildings)
- On click: show popup with address, units, developer, status, cost
- Click "View Details" opens the new development detail panel

### Implementation
In `map-search.tsx` or `map-actions.ts`:
- When "Show new developments" is checked, query DOB filings for NB jobs in the visible map bounds
- Use the block/lot from DOB filings + PLUTO geocoding to place markers
- Or use the house_number + street_name + borough to geocode

---

## 5. Leasing Pitch Template

Auto-create a new email template:
```
Subject: Leasing Services for [Address]

Hi [Developer Name],

I noticed your new [units]-unit development at [address] in [neighborhood] 
recently received [approval status]. 

I specialize in lease-up services for new developments in [borough] and 
would love to discuss how I can help fill your building quickly and at 
optimal rents.

My recent lease-up track record includes:
- [Customizable section]

Would you have 15 minutes this week to discuss?

Best,
[Your Name]
```

---

## 6. Prospecting Source Filter

On the Prospecting page, add a filter:
```
Source: [All v] [Market Intel] [New Development] [On-Market] [Manual]
```

When source = "New Development", show additional columns:
- Proposed Units
- Est. Cost  
- Filing Status
- Developer Name

---

# PART 2: MONETIZATION & FEATURE GATING

## 7. Pricing Tiers

| Tier | Price | Target User |
|------|-------|-------------|
| **Free** | $0/mo | Agents exploring, tire kickers |
| **Pro** | $79/mo | Active agents, small investors |
| **Team** | $149/mo per seat | Brokerages, investment firms |
| **Enterprise** | Custom | Developers, PE funds, large shops |

### Tool Access Matrix

| Tool | Free | Pro | Team | Enterprise |
|------|------|-----|------|------------|
| **Market Intel** (building search) | 10 searches/day | Unlimited | Unlimited | Unlimited |
| **Ownership Analysis** (AI owner ID) | 3/day | Unlimited | Unlimited | Unlimited |
| **Contact Intelligence** (phones, Apollo) | View only, no export | Full access | Full + export | Full + API |
| **New Development Pipeline** | View 5 results | Full access | Full access | Full + alerts |
| **On-Market Listings** | Locked (paywall) | 20 results/day | Unlimited + comps | Full + bulk export |
| **Prospecting** | 10 contacts | Unlimited | Unlimited + sequences | Unlimited + sequences |
| **Deal Modeler** | Locked | 5 models/mo | Unlimited | Unlimited + templates |
| **One-Click LOI** | Locked | Locked | 10/mo | Unlimited |
| **Capital Raise / GP Tools** | Locked | Locked | Locked | Full access |
| **Outreach Automation** | Locked | 100 emails/mo | 500/mo | Unlimited |
| **Deal Pipeline (Kanban)** | 3 active deals | Unlimited | Unlimited + team | Unlimited + team |
| **Apollo Enrichment Credits** | 0 | 100/mo | 500/mo | 2000/mo |
| **PDF Exports** | Locked | Watermarked | Clean | White-label |
| **Team Collaboration** | Locked | Locked | Full | Full + roles |

---

## 8. Feature Gating Implementation

### Schema Addition

```prisma
model User {
  // ... existing fields
  plan          Plan      @default(free)
  planStartDate DateTime?
  planEndDate   DateTime?
  stripeCustomerId String?
  stripeSubscriptionId String?
  
  // Usage tracking
  usageCounters  Json?    // { searchesToday: 5, ownershipAnalysesToday: 2, dealsThisMonth: 3, ... }
  usageResetDate DateTime?
}

enum Plan {
  free
  pro
  team
  enterprise
}
```

### Feature Gate Utility

Create `src/lib/feature-gate.ts`:

```typescript
export interface FeatureLimits {
  marketIntelSearches: number;      // per day
  ownershipAnalyses: number;        // per day  
  newDevResults: number;            // per search
  onMarketResults: number;          // per day, -1 = unlimited
  prospectContacts: number;         // total
  dealModels: number;               // per month, -1 = unlimited
  loisPerMonth: number;             // -1 = unlimited
  outreachEmails: number;           // per month
  apolloCredits: number;            // per month
  activeDeals: number;              // total active, -1 = unlimited
  canExportContacts: boolean;
  canUseLOI: boolean;
  canUseCapitalRaise: boolean;
  canUseTeamFeatures: boolean;
  canUseSequences: boolean;
  canUseOnMarket: boolean;
  canUseComps: boolean;
  pdfWatermark: boolean;
}

export const PLAN_LIMITS: Record<string, FeatureLimits> = {
  free: {
    marketIntelSearches: 10,
    ownershipAnalyses: 3,
    newDevResults: 5,
    onMarketResults: 0,
    prospectContacts: 10,
    dealModels: 0,
    loisPerMonth: 0,
    outreachEmails: 0,
    apolloCredits: 0,
    activeDeals: 3,
    canExportContacts: false,
    canUseLOI: false,
    canUseCapitalRaise: false,
    canUseTeamFeatures: false,
    canUseSequences: false,
    canUseOnMarket: false,
    canUseComps: false,
    pdfWatermark: true,
  },
  pro: {
    marketIntelSearches: -1,
    ownershipAnalyses: -1,
    newDevResults: -1,
    onMarketResults: 20,
    prospectContacts: -1,
    dealModels: 5,
    loisPerMonth: 0,
    outreachEmails: 100,
    apolloCredits: 100,
    activeDeals: -1,
    canExportContacts: true,
    canUseLOI: false,
    canUseCapitalRaise: false,
    canUseTeamFeatures: false,
    canUseSequences: false,
    canUseOnMarket: true,
    canUseComps: false,
    pdfWatermark: true,
  },
  team: {
    marketIntelSearches: -1,
    ownershipAnalyses: -1,
    newDevResults: -1,
    onMarketResults: -1,
    prospectContacts: -1,
    dealModels: -1,
    loisPerMonth: 10,
    outreachEmails: 500,
    apolloCredits: 500,
    activeDeals: -1,
    canExportContacts: true,
    canUseLOI: true,
    canUseCapitalRaise: false,
    canUseTeamFeatures: true,
    canUseSequences: true,
    canUseOnMarket: true,
    canUseComps: true,
    pdfWatermark: false,
  },
  enterprise: {
    marketIntelSearches: -1,
    ownershipAnalyses: -1,
    newDevResults: -1,
    onMarketResults: -1,
    prospectContacts: -1,
    dealModels: -1,
    loisPerMonth: -1,
    outreachEmails: -1,
    apolloCredits: 2000,
    activeDeals: -1,
    canExportContacts: true,
    canUseLOI: true,
    canUseCapitalRaise: true,
    canUseTeamFeatures: true,
    canUseSequences: true,
    canUseOnMarket: true,
    canUseComps: true,
    pdfWatermark: false,
  },
};

// Usage check helper
export async function checkFeatureAccess(
  userId: string, 
  feature: keyof FeatureLimits
): Promise<{ allowed: boolean; remaining?: number; upgradeRequired?: string }> {
  // Query user's plan and usage counters
  // Compare against PLAN_LIMITS
  // Return access decision
}

// Increment usage counter
export async function incrementUsage(
  userId: string,
  counter: string
): Promise<void> {
  // Increment the counter in usageCounters JSON
  // Reset daily counters if usageResetDate < today
  // Reset monthly counters if usageResetDate < first of month
}
```

### Paywall UI Component

Create `src/components/ui/paywall.tsx`:

```typescript
// Shows when a user tries to access a gated feature
// Props: feature name, current plan, required plan, CTA
// Example: "Deal Modeler is a Pro feature. Upgrade to unlock."
// Blurred preview of the feature behind it
// "Upgrade to Pro — $79/mo" button → links to billing page
```

### Stripe Integration

- Use Stripe Checkout for subscription management
- Webhook endpoint: `/api/webhooks/stripe`
- On successful payment: update user.plan + planStartDate
- On cancellation: set planEndDate, downgrade at period end
- Stripe Customer Portal for self-service billing

---

# PART 3: ON-MARKET LISTINGS

## 9. On-Market Listings Toggle

### Positioning

VettdRE is the BEST tool for sourcing and closing OFF-MARKET deals. On-market listings are a complementary feature — toggled on/off — so users have a complete picture of any market without leaving VettdRE.

### On-Market vs Off-Market Toggle

In Market Intel, add a toggle in the search bar area:

```
[* Off-Market] [On-Market] [Both]
```

- **Off-Market (default):** existing building search + ownership + contact intel (core product)
- **On-Market:** active listings from MLS/listing feeds
- **Both:** overlay listings on top of building intelligence

### Data Source: Mashvisor API (recommended for MVP)

Mashvisor provides:
- Active MLS listings with price, beds, baths, sqft, photos, days on market
- Investment metrics: cap rate, cash-on-cash, rent estimates, occupancy
- Comps: recent sales in the area (feeds into Deal Modeler)
- Inactive/sold listings for historical analysis
- Cost: ~$100-300/mo depending on volume
- Endpoint: `/client/marketplace-listings-search` for bulk listings
- Endpoint: `/client/get-property` for full property profile with comps

Alternative sources (if Mashvisor doesn't work out):
- **Apify MLS Aggregator** (~$50/mo) — scrapes Zillow, Realtor.com, Zumper into unified JSON
- **RapidAPI Zillow scrapers** (~$20-50/mo) — cheaper but less reliable
- **IDX/RETS via REBNY** — direct MLS feed, requires brokerage membership
- **Bridge Interactive API** — official MLS API, requires vendor approval

### On-Market Listing Card

When toggled to "On-Market" or "Both," on-market properties appear in search results with a green **"LISTED"** badge:

```
+------------------------------------------------------+
| LISTED                                  $4,800,000   |
| 456 Atlantic Ave, Brooklyn                           |
| 45 units - 6 stories - Built 1965                    |
|                                                      |
| Listed: 23 days ago - Price cut: -$200K (Jan 15)     |
| Agent: Jane Smith - Compass                          |
|                                                      |
| Cap Rate: 5.8% - Price/Unit: $106K                   |
|                                                      |
| [View Details] [Model This Deal] [Compare Off-Market]|
+------------------------------------------------------+
```

### On-Market Detail Panel

Clicking "View Details" shows:
- Listing photos carousel
- Full listing description
- Listing price + price history
- Listing agent name, brokerage, phone
- Days on market
- Investment metrics from Mashvisor (cap rate, rent estimate, CoC)
- [Model This Deal] → opens Deal Modeler pre-filled with listing data

### On-Market + Off-Market Overlay (the killer feature)

When a building shows up as BOTH on-market AND in your off-market intelligence:

```
+------------------------------------------------------+
| LISTED + OFF-MARKET INTEL                            |
| 456 Atlantic Ave, Brooklyn                           |
|                                                      |
| +------------------+------------------+              |
| | ON-MARKET         | OFF-MARKET       |              |
| | Listed: $4.8M     | Assessed: $3.2M  |              |
| | Agent: Jane Smith  | Owner: D. Chase  |              |
| | Compass            | Phone: (718) ... |              |
| | 23 days on market  | Confidence: 78 B |              |
| |                    | Distress: Medium  |              |
| |                    | 12 HPD violations |              |
| +------------------+------------------+              |
|                                                      |
| INSIGHT: Listed at $4.8M but assessed at $3.2M      |
|    and last sold for $2.9M in 2019. Owner has 12     |
|    open violations. May be motivated.                |
|                                                      |
| [Model This Deal] [Contact Owner Directly]           |
+------------------------------------------------------+
```

The insight here: Zillow shows the listing. VettdRE shows you the listing AND who actually owns it, their direct phone number, and why they might be desperate to sell. No other tool does this.

### On-Market Map Markers

On the map:
- Blue markers = off-market buildings (existing)
- Green markers = on-market listings
- Yellow markers = buildings that are BOTH listed AND have off-market intel
- Orange markers = new developments (from DOB)

### Comps Integration with Deal Modeler

On-market data feeds the Deal Modeler:
- Auto-suggest offer price based on recent comps in the area
- Show comp sales table in the deal summary
- Calculate price per unit / price per sqft vs market average
- Show "Your offer is X% below/above market" indicator

### Feature Gating for On-Market

| Tier | Access |
|------|--------|
| Free | See that the on-market toggle exists but it's locked (paywall blur) |
| Pro | On-market search with 20 results/day, no comps |
| Team | Unlimited on-market + comps + overlay insights |
| Enterprise | Full access + bulk export + API |

---

# PART 4: DEAL PLATFORM

## 10. Deal Modeler

### Overview

The Deal Modeler is an interactive underwriting tool that lets users analyze whether a deal makes financial sense. It lives at `/deals/new` or can be opened from a building profile with "Model This Deal" button.

### Data Flow

```
Building Profile → [Model This Deal] → Deal Modeler (pre-filled) → Save Deal → Deal Pipeline
On-Market Listing → [Model This Deal] → Deal Modeler (pre-filled) → Save Deal → Deal Pipeline
New Development → [Model This Deal] → Deal Modeler (pre-filled) → Save Deal → Deal Pipeline
Manual → /deals/new → Deal Modeler (blank) → Save Deal → Deal Pipeline
```

### Auto-Populated Fields (from existing data)

When opened from a building profile, pre-fill from VettdRE data:

| Field | Source |
|-------|--------|
| Address | PLUTO / user selection |
| Borough, Block, Lot | PLUTO BBL |
| Building Class | PLUTO BldgClass |
| Year Built | PLUTO YearBuilt |
| Lot Size (sqft) | PLUTO LotArea |
| Building Size (sqft) | PLUTO BldgArea |
| Total Units | PLUTO/HPD UnitsTotal |
| Residential Units | PLUTO UnitsRes |
| Commercial Units | PLUTO computed |
| Floors | PLUTO NumFloors |
| Zoning | PLUTO ZoneDist1 |
| FAR (used / max) | PLUTO BuiltFAR / ResidFAR |
| Last Sale Price | ACRIS deed amount |
| Last Sale Date | ACRIS deed date |
| Assessed Value (total) | DOF property tax |
| Market Value (DOF) | DOF market value |
| Annual Tax | DOF annual tax |
| Rent Stabilized Units | DHCR / HPD |
| Owner Name | AI Ownership Analysis |
| Violation Count | HPD violations |
| Active Permits | DOB filings |
| Confidence Score | Lead verification score |
| Listing Price | On-market data (if listed) |
| Rent Estimates | Mashvisor (if available) |
| Market Comps | Mashvisor (if available) |

### User Input Fields

#### Acquisition
- **Offer Price** — editable, defaults to last sale, listing price, or assessed value
- **Closing Costs** — default 3% of purchase price
- **Acquisition Fee** — optional %

#### Financing
- **Down Payment %** — default 25%
- **Loan Amount** — auto-calculated
- **Interest Rate %** — default current market rate
- **Loan Term (years)** — default 30
- **Amortization (years)** — default 30
- **IO Period (years)** — optional interest-only period
- **Loan Origination Fee %** — default 1%

#### Income (Current)
- **Gross Potential Rent (monthly)** — editable per unit or bulk
  - Unit mix table: Studio / 1BR / 2BR / 3BR+ with count + monthly rent
  - Default: estimate from HPD registration + Mashvisor rent data + neighborhood comps
- **Commercial Income (monthly)** — if mixed use
- **Other Income** — laundry, parking, storage
- **Vacancy Rate %** — default 5%
- **Bad Debt %** — default 2%

#### Income (Pro Forma) — for value-add deals
- **Target Rent (per unit type)** — post-renovation rents
- **Renovation Budget (per unit)** — cost to upgrade
- **Total Renovation Budget** — auto-calculated or override
- **Renovation Timeline (months)** — for cash flow timing
- **Stabilization Period (months)** — time to reach target occupancy

#### Expenses
- **Real Estate Taxes** — auto-filled from DOF
- **Insurance** — default $750/unit/yr (editable)
- **Water & Sewer** — default $500/unit/yr
- **Fuel/Heat** — default based on fuel type + building size
- **Electric (common area)** — default $300/unit/yr
- **Repairs & Maintenance** — default $500/unit/yr
- **Management Fee %** — default 5% of EGI
- **Super/Staff** — buildings 10+ units
- **Legal & Accounting** — default $2,000/yr
- **Misc/Reserve** — default 3% of EGI

#### Exit Assumptions
- **Hold Period (years)** — default 5
- **Exit Cap Rate %** — default same as going-in
- **Sale Costs %** — default 5% (broker + transfer tax)
- **Appreciation Rate %/yr** — optional for sensitivity

### Calculated Outputs

#### Key Metrics Dashboard (shown as cards at top)

```
[Cap Rate ] [Cash/Cash] [  IRR   ] [ DSCR   ] [Equity  ]
[ 6.2%    ] [ 8.4%    ] [ 14.7%  ] [ 1.35x  ] [Multiple]
[Going-In ] [Year 1   ] [5-Year  ] [Year 1  ] [ 1.82x  ]
```

#### Full Calculations

**Net Operating Income (NOI):**
```
Gross Potential Rent (annual)
+ Commercial Income
+ Other Income
= Gross Potential Income (GPI)
- Vacancy Loss (vacancy% x GPI)
- Bad Debt (badDebt% x GPI)
= Effective Gross Income (EGI)
- Total Operating Expenses
= Net Operating Income (NOI)
```

**Cap Rate:**
```
Going-In Cap Rate = NOI / Purchase Price
Exit Cap Rate = Pro Forma NOI / Exit Price
```

**Debt Service:**
```
Annual Debt Service = monthly payment x 12
(using standard amortization formula with IO period if applicable)
DSCR = NOI / Annual Debt Service
```

**Cash Flow:**
```
Before-Tax Cash Flow = NOI - Annual Debt Service
Cash-on-Cash Return = BTCF / Total Equity Invested
```

**IRR Calculation:**
```
Year 0: -Total Equity (down payment + closing costs + renovation)
Year 1-N: Annual Cash Flow (after debt service)
Year N: + Net Sale Proceeds (exit price - sale costs - loan balance)
IRR = internal rate of return solving for discount rate
```

**Equity Multiple:**
```
Total Distributions (all cash flows + sale proceeds) / Total Equity Invested
```

#### Cash Flow Waterfall Table

| Year | NOI | Debt Service | Cash Flow | Cumulative | Cash/Cash |
|------|-----|-------------|-----------|------------|-----------|
| 1 | $180,000 | $120,000 | $60,000 | $60,000 | 8.4% |
| 2 | $185,400 | $120,000 | $65,400 | $125,400 | 9.2% |
| ... | | | | | |
| 5 | $198,000 | $120,000 | $78,000 | $348,000 | 10.9% |
| Exit | | | +$450,000 | $798,000 | |

#### Sensitivity Tables

**IRR sensitivity: Purchase Price vs Exit Cap Rate**
```
           Exit Cap: 5.0%   5.5%   6.0%   6.5%   7.0%
Price -5%          18.2%  15.8%  13.7%  11.9%  10.3%
Price 0%           16.1%  13.8%  11.8%  10.1%   8.6%
Price +5%          14.3%  12.1%  10.2%   8.6%   7.2%
```

### Deal Modeler UI Layout

```
+-------------------------------------------------------------+
| Deal Modeler                          [Save] [Export PDF]    |
| 456 Atlantic Ave, Brooklyn, NY                               |
| 45 units - Built 1965 - R7A - Last sale $4.2M (2019)       |
+---------------------------+----------------------------------+
|                           |                                  |
|  INPUTS (left panel)      |  OUTPUTS (right panel)           |
|                           |                                  |
|  > Acquisition            |  [6.2%] [8.4%] [14.7%]          |
|    Offer Price            |  Cap    CoC    IRR               |
|    Closing Costs          |                                  |
|                           |  > Cash Flow Waterfall           |
|  > Financing              |  [Year 1] [Year 2] ... [Exit]   |
|    Down Payment           |                                  |
|    Interest Rate          |  > Sensitivity Analysis          |
|    Loan Term              |  [IRR matrix]                    |
|                           |                                  |
|  > Income                 |  > Sources & Uses                |
|    Unit Mix Table         |  [Table]                         |
|    Commercial             |                                  |
|    Vacancy                |  > Pro Forma P&L                 |
|                           |  [NOI breakdown]                 |
|  > Expenses               |                                  |
|    Taxes                  |  > Comps (if on-market data)     |
|    Insurance              |  [Recent sales in area]          |
|    Utilities              |                                  |
|                           |                                  |
|  > Exit                   |                                  |
|    Hold Period            |                                  |
|    Exit Cap Rate          |                                  |
|                           |                                  |
+---------------------------+----------------------------------+
```

**Key UX details:**
- Left panel scrolls independently from right panel
- Outputs update in real-time as inputs change (no "Calculate" button)
- Collapsible sections in left panel
- Key metrics cards are sticky at top of right panel
- Mobile: inputs and outputs stack vertically with tabs

### Deal Model Schema

```prisma
model Deal {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  
  // Property reference
  address       String
  borough       String?
  block         String?
  lot           String?
  bbl           String?
  
  // Link to contact (owner)
  contactId     String?
  contact       Contact? @relation(fields: [contactId], references: [id])
  
  // Deal status
  status        DealStatus @default(analyzing)
  
  // All model inputs stored as JSON
  inputs        Json      // DealModelInputs interface
  
  // Calculated outputs cached
  outputs       Json?     // DealModelOutputs interface
  
  // Metadata
  name          String?   // User-friendly name: "456 Atlantic Ave Value-Add"
  dealType      DealType  @default(acquisition)
  dealSource    DealSource @default(off_market)
  notes         String?
  
  // LOI tracking
  loiSent       Boolean   @default(false)
  loiSentDate   DateTime?
  loiAccepted   Boolean?
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum DealStatus {
  analyzing     // Just modeling
  prospecting   // Reaching out to owner
  loi_sent      // LOI submitted
  under_contract // In due diligence
  closed        // Deal done
  dead          // Passed or lost
}

enum DealType {
  acquisition
  value_add
  new_development
  mixed_use
  ground_up
}

enum DealSource {
  off_market
  on_market
  new_development
  referral
  other
}
```

### TypeScript Interfaces

```typescript
interface DealModelInputs {
  // Acquisition
  offerPrice: number;
  closingCostsPct: number;       // default 3%
  acquisitionFeePct?: number;
  
  // Financing
  downPaymentPct: number;        // default 25%
  interestRate: number;          // default current market
  loanTermYears: number;         // default 30
  amortizationYears: number;     // default 30
  ioPeriodYears?: number;        // interest-only period
  loanOriginationFeePct: number; // default 1%
  
  // Income
  unitMix: UnitMixEntry[];
  commercialIncomeMonthly: number;
  otherIncomeMonthly: number;
  vacancyPct: number;            // default 5%
  badDebtPct: number;            // default 2%
  rentGrowthPct: number;         // default 3% annual
  
  // Pro forma (value-add)
  proFormaUnitMix?: UnitMixEntry[];  // target rents
  renovationPerUnit?: number;
  totalRenovationBudget?: number;
  renovationMonths?: number;
  stabilizationMonths?: number;
  
  // Expenses
  realEstateTaxes: number;       // annual, from DOF
  insurance: number;             // annual
  waterSewer: number;
  fuel: number;
  electric: number;
  repairsMaintenance: number;
  managementFeePct: number;      // default 5% of EGI
  superStaff: number;
  legalAccounting: number;
  miscReservePct: number;        // default 3% of EGI
  expenseGrowthPct: number;      // default 2% annual
  
  // Exit
  holdPeriodYears: number;       // default 5
  exitCapRatePct: number;
  saleCostsPct: number;          // default 5%
}

interface UnitMixEntry {
  type: string;            // "Studio" | "1BR" | "2BR" | "3BR" | "4BR+"
  count: number;
  monthlyRent: number;
}

interface DealModelOutputs {
  // Income
  grossPotentialRent: number;
  grossPotentialIncome: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  
  // Expenses
  totalOperatingExpenses: number;
  expenseRatio: number;
  
  // NOI
  noi: number;
  noiPerUnit: number;
  
  // Returns
  goingInCapRate: number;
  cashOnCashReturn: number;     // year 1
  irr: number;                  // over hold period
  equityMultiple: number;
  dscr: number;                 // year 1
  breakEvenOccupancy: number;
  
  // Financing
  loanAmount: number;
  annualDebtService: number;
  monthlyPayment: number;
  
  // Cash flow
  totalEquityRequired: number;
  yearOneCashFlow: number;
  cashFlowWaterfall: YearCashFlow[];
  
  // Exit
  exitPrice: number;
  netSaleProceeds: number;
  totalProfit: number;
  
  // Pro forma (if value-add)
  proFormaNOI?: number;
  proFormaCapRate?: number;
  proFormaCashOnCash?: number;
  
  // Sensitivity
  irrSensitivity: number[][];   // matrix
  cocSensitivity: number[][];
  
  // Comps (from on-market data)
  comparables?: CompSale[];
  pricePerUnitVsMarket?: number;  // % above/below
  pricePerSqftVsMarket?: number;
}

interface YearCashFlow {
  year: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  cumulativeCashFlow: number;
  cashOnCash: number;
  exitProceeds?: number;        // only on final year
}

interface CompSale {
  address: string;
  salePrice: number;
  saleDate: string;
  units: number;
  pricePerUnit: number;
  capRate?: number;
  distance?: number;            // miles from subject property
}
```

### Calculation Engine

Create `src/lib/deal-calculator.ts`:

Core functions:
- `calculateNOI(inputs)` — NOI breakdown
- `calculateDebtService(inputs)` — loan payment, DSCR
- `calculateReturns(inputs)` — cap rate, CoC, IRR, equity multiple
- `calculateCashFlowWaterfall(inputs)` — year-by-year cash flows
- `calculateSensitivity(inputs)` — IRR/CoC sensitivity matrices
- `calculateAll(inputs)` — full DealModelOutputs

IRR calculation: use Newton's method (iterative) since there's no closed-form solution.

### PDF Export

Generate a professional deal summary PDF:

**Page 1: Executive Summary**
- Property photo (Google Street View)
- Address, units, building class, year built
- Key metrics: Cap Rate, IRR, CoC, DSCR, Equity Multiple
- Sources & Uses table
- Deal source badge: Off-Market / On-Market / New Development

**Page 2: Financial Analysis**
- Pro Forma P&L
- Cash Flow Waterfall
- Debt Service Schedule

**Page 3: Sensitivity Analysis**
- IRR sensitivity matrix
- Cap Rate sensitivity matrix

**Page 4: Property Details & Comps**
- Building specs from PLUTO
- Ownership from AI Analysis
- Violation summary from HPD
- Recent permit activity from DOB
- Comparable sales (from Mashvisor if available)

Free/Pro: VettdRE watermark. Team+: clean PDF. Enterprise: white-label.

---

## 11. One-Click LOI Generator

### Overview

After modeling a deal, the user clicks "Send LOI" to generate and send a Letter of Intent.

### LOI Template Fields (auto-filled from deal model)

```
LETTER OF INTENT

Date: [today]

To: [Owner name from contact] 
    [Owner mailing address from HPD/ACRIS]

Re: [Property address]
    Block [block], Lot [lot], [Borough], New York

Dear [Owner name],

[Buyer entity name] ("Buyer") hereby submits this non-binding Letter of 
Intent to acquire the above-referenced property on the following terms:

PURCHASE PRICE: $[offer price from deal model]

EARNEST MONEY DEPOSIT: $[2% of purchase price], to be deposited within 
[5] business days of execution of a Purchase and Sale Agreement.

DUE DILIGENCE PERIOD: [45] calendar days from the effective date of the 
Purchase and Sale Agreement.

FINANCING CONTINGENCY: This offer is contingent upon Buyer obtaining 
financing on commercially reasonable terms. Buyer shall have [30] days 
from the expiration of the Due Diligence Period to obtain a financing 
commitment.

CLOSING: Closing shall occur within [30] days after satisfaction of all 
contingencies.

INSPECTIONS: Buyer shall have the right to conduct physical inspections, 
environmental assessments, title review, and such other due diligence as 
Buyer deems necessary.

EXISTING LEASES: Buyer shall acquire the property subject to all 
existing leases. Seller shall provide copies of all leases and rent roll 
within [5] business days of acceptance.

BROKER: [User's brokerage or "N/A"]

This Letter of Intent is non-binding and is intended solely to set forth 
the principal terms upon which the parties may negotiate a definitive 
Purchase and Sale Agreement.

Sincerely,

[User name]
[User entity / brokerage]
[User email]
[User phone]
```

### LOI Customization

Before sending, the user can:
- Edit any field in the LOI
- Adjust deposit %, DD period, financing period, closing timeline
- Add custom terms/conditions
- Toggle sections on/off
- Add contingencies (financing, inspection, environmental)

### LOI Output Formats

1. **PDF** — professional formatted document for email attachment
2. **DOCX** — editable Word document
3. **Email** — send directly from VettdRE to the owner contact

### LOI Tracking

After sending:
- Deal status → `loi_sent`
- Track: sent date, opened (if emailed via VettdRE), response
- Follow-up reminders: "LOI to 456 Atlantic sent 5 days ago — no response. Follow up?"
- If accepted: Deal status → `under_contract`

---

## 12. Deal Pipeline (Kanban Board)

### Overview

Central deal tracking view. Every deal model can be tracked through stages.

### Stages (Columns)

```
[Analyzing] → [Prospecting] → [LOI Sent] → [Under Contract] → [Closing] → [Closed]
                                                                              |
                                                                          [Dead/Passed]
```

### Deal Card (on Kanban)

```
+-------------------------------+
| 456 Atlantic Ave              |
| Brooklyn - 45 units           |
| Source: Off-Market            |
|                               |
| Offer: $4.8M                 |
| Cap: 6.2% - IRR: 14.7%      |
|                               |
| Owner: Dorothy Chasewood      |
| LOI sent 3 days ago          |
|                               |
| [View Deal] [Contact Owner]  |
+-------------------------------+
```

### Pipeline View Options
- **Kanban** (default) — drag cards between stages
- **Table** — sortable list with all deal metrics
- **Map** — deals plotted on NYC map by location

### Pipeline Feature Gating

| Tier | Access |
|------|--------|
| Free | 3 active deals max |
| Pro | Unlimited deals |
| Team | Unlimited + team visibility + assignment |
| Enterprise | Unlimited + team + roles + reporting |

---

# PART 5: CAPITAL RAISE (ENTERPRISE)

## 13. Waterfall Structure Builder

Interactive tool to model GP/LP economics:

**Common Structures:**
- Simple split (e.g., 70/30 LP/GP)
- Preferred return + promote (e.g., 8% pref, then 70/30)
- Multi-tier (8% pref → 80/20, 12% → 70/30, 15%+ → 60/40)
- European waterfall (return of capital first)
- American waterfall (deal-by-deal)

**Inputs:**
- Total equity needed (from deal model)
- GP co-invest amount and %
- LP capital (auto-calculated)
- Preferred return % (default 8%)
- Promote tiers: at what IRR threshold does GP split change?
- Catch-up provision? (Y/N, %)
- Clawback provision? (Y/N)

**Outputs:**
- LP IRR at various scenarios (base, upside, downside)
- GP IRR / GP promote dollars
- Distribution waterfall chart (stacked bar by year)
- Return sensitivity: "If we exit at X cap rate, LP gets Y%, GP gets Z%"

---

## 14. Investment Memo Generator

Auto-generate a professional investment deck from the deal model:

**Sections:**
1. Executive Summary
2. Property Overview (photos, specs, location)
3. Investment Thesis (why this deal)
4. Financial Summary (from deal model)
5. Market Overview (neighborhood data, comps)
6. Renovation Plan (if value-add)
7. Risk Factors
8. GP Track Record (user inputs)
9. Terms & Structure (from waterfall builder)
10. Appendix (full pro forma, sensitivity tables)

Output: PDF or PPTX

---

## 15. Investor Contact Type

Add a 5th contact type: **Investor (LP)**

```typescript
interface InvestorTypeData {
  investorType: 'individual' | 'family_office' | 'fund' | 'institution';
  accreditedStatus: 'accredited' | 'qualified_purchaser' | 'unknown';
  investmentRange: { min: number; max: number };
  preferredReturns: { minIRR?: number; minCoC?: number; minEquityMultiple?: number };
  preferredDealTypes: string[];    // ['multifamily', 'value_add', 'ground_up']
  preferredMarkets: string[];      // ['Brooklyn', 'Queens']
  previousInvestments: number;     // count with you
  totalCommitted: number;          // total $ invested with you
  kycCompleted: boolean;
  kycDate?: string;
  notes: string;
}
```

**Investor Pipeline:**
```
lead → qualified → pitched → committed → funded → active → exited
```

---

## 16. Deal Room (Future — v2)

Shared portal for LP investors:
- View deal package
- Track capital calls
- View distributions
- E-sign subscription docs (DocuSign/HelloSign API)
- Download K-1s

Focus on the memo generator and waterfall builder first.

---

# PART 6: OUTREACH AUTOMATION

## 17. Email Sequences
- Multi-step drip campaigns for prospecting
- Templates: Cold intro, follow-up 1, follow-up 2, break-up email
- Personalization variables from Apollo + Market Intel data
- Send via connected Gmail

## 18. AI Compose
- "Write a cold email to this landlord" — AI drafts using:
  - Contact data (name, title, company)
  - Building data (units, violations, distress score)
  - New development data (if applicable)
  - User's pitch/value prop
  - Deal model summary (if exists)

## 19. Tracking
- Open tracking
- Reply detection (from Gmail sync)
- Auto-move to "Engaged" when owner replies

### Outreach Feature Gating

| Tier | Access |
|------|--------|
| Free | Locked |
| Pro | 100 emails/mo, no sequences |
| Team | 500/mo + sequences |
| Enterprise | Unlimited + sequences |

---

# PART 7: NAVIGATION & BUILD ORDER

## 20. Navigation Updates

Update sidebar and bottom nav to reflect the deal-centric product:

```
Dashboard
Market Intel (FIND)
  - Off-Market Search
  - On-Market Listings
  - New Development
  - Map
Deals (MODEL + CLOSE)
  - Pipeline (Kanban)
  - New Deal Model
  - LOI Tracker
Contacts (REACH)
  - All Contacts
  - Prospecting
  - Investors (Enterprise)
Outreach (REACH)
  - Compose
  - Sequences
  - Templates
Capital (RAISE - Enterprise)
  - Waterfall Builder
  - Investment Memos
  - Investor Portal
Messages
Calendar
Settings
  - Profile
  - Billing & Plan
  - Team (Team+)
  - Integrations
```

"Deals" is the new center of gravity — it's where intelligence turns into action.

---

## 21. Build Order (Priority)

### Phase 1: Intelligence (Steps 1-6 — some already done)
1. Confidence Score restructure (DONE)
2. New Development search — new tab in Market Intel, server action for DOB NB filings
3. New Development map integration — orange markers
4. Apollo auto-enrich on contact creation
5. Apollo org intelligence card in landlord dossier
6. Apollo find decision makers in landlord dossier
7. Bulk enrich prospect list
8. Leasing pitch template
9. Prospecting source filter

### Phase 2: Foundation
10. Feature gate system (schema + utility + paywall component)
11. Stripe integration (checkout, webhook, portal)
12. Settings/Billing page
13. Update navigation structure

### Phase 3: Deal Modeler
14. Deal schema + calculation engine (`deal-calculator.ts`)
15. Deal Modeler UI (inputs + outputs, real-time calculation)
16. Pre-fill from building profile + on-market listing
17. PDF export (deal summary)
18. Deal pipeline Kanban

### Phase 4: On-Market Integration
19. Mashvisor API integration (or alternative)
20. On-market / off-market toggle in Market Intel
21. On-market listing cards + detail panel
22. Overlay view (listed + off-market intel combined)
23. Comps feed into Deal Modeler

### Phase 5: LOI
24. LOI template + customization UI
25. PDF/DOCX generation
26. Send via email from VettdRE
27. LOI tracking in deal pipeline

### Phase 6: Outreach
28. Email sequence builder
29. AI compose with context from Market Intel + Deal Model
30. Send + track via Gmail

### Phase 7: Capital Raise (Enterprise)
31. Waterfall structure builder
32. Investment memo generator (PDF/PPTX)
33. Investor contact type + pipeline
34. Deal room portal (v2)
