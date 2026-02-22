# VettdRE — Intelligence Enhancements: New Development Pipeline, Apollo Expansion, Confidence Score

Read CLAUDE.md for project context.

---

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
┌──────────────────────────────────────────────────────────┐
│ 🏗️ New Development Search                                │
│                                                          │
│ Borough: [All ▼]  Min Units: [10___]  Status: [All ▼]   │
│                                                          │
│ Job Type: [🔘 New Building] [🔘 Major Alteration] [🔘 Both] │
│                                                          │
│ Min Est. Cost: [$________]   Filed After: [____-__-__]   │
│                                                          │
│                          [Search]                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 📊 147 new developments found                            │
│                                                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 🏗️ 456 Atlantic Ave, Brooklyn          NB │ 120 units │
│ │ Developer: Atlantic Realty Partners LLC              │   │
│ │ Contact: John Smith · (718) 555-0123                │   │
│ │ Est. Cost: $45M · Filed: Jan 2025 · Status: Approved│   │
│ │ 12 stories · R7A zoning                             │   │
│ │                                                     │   │
│ │          [View Details] [+ Add to CRM] [📋 Prospect]│   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 🏗️ 789 Flatbush Ave, Brooklyn          NB │ 85 units  │
│ │ Developer: Flatbush Development Group               │   │
│ │ Contact: Jane Doe · (917) 555-0456                  │   │
│ │ Est. Cost: $32M · Filed: Mar 2025 · Status: In Process │
│ │ 9 stories · C4-4A zoning                            │   │
│ │                                                     │   │
│ │          [View Details] [+ Add to CRM] [📋 Prospect]│   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
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
- [🔍 Apollo Lookup] button to enrich the developer

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
- [📋 Add to Prospect List] → adds to prospecting
- [📧 Draft Pitch] → opens compose with leasing pitch template

### Prospecting Filter for New Developments

On the Prospecting page, add a filter:
```
Source: [All ▼] [Market Intel] [New Development] [Manual]
```

When source = "New Development", show additional columns:
- Proposed Units
- Est. Cost  
- Filing Status
- Developer Name

### Leasing Pitch Template

Auto-create a new email template:
```
Subject: Leasing Services for [Address]

Hi [Developer Name],

I noticed your new [units]-unit development at [address] in [neighborhood] recently received [approval status]. 

I specialize in lease-up services for new developments in [borough] and would love to discuss how I can help fill your building quickly and at optimal rents.

My recent lease-up track record includes:
- [Customizable section]

Would you have 15 minutes this week to discuss?

Best,
[Your Name]
```

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
  
  const url = `https://data.cityofnewyork.us/resource/ic3t-wcy2.json?$where=${encodeURIComponent(whereClause)}&$order=proposed_dwelling_units DESC&$limit=200`;
  
  const res = await fetch(url, {
    headers: { 'X-App-Token': process.env.NYC_OPEN_DATA_TOKEN || '' }
  });
  
  return res.json();
}
```

---

## 2. Confidence Score (Replace "AI Lead Score")

### What's Changing
The building profile currently shows "AI Lead Score" with a 0-100 number and A-F grade. This is misleading — it's not scoring a lead, it's scoring the reliability of the ownership data. Rename and recalculate.

### Rename
- Old: "🎯 AI Lead Score" + "✓ Verified" badge
- New: "🔒 Data Confidence Score" (no "Verified" badge unless score > 80)

### New Scoring Logic

The confidence score measures: **How sure are we that we've identified the right owner and have accurate contact info?**

```typescript
interface ConfidenceScoreBreakdown {
  total: number;        // 0-100
  grade: string;        // A/B/C/D/F
  factors: ConfidenceFactor[];
}

interface ConfidenceFactor {
  name: string;
  points: number;
  maxPoints: number;
  source: string;
  matched: boolean;
}
```

**Scoring Rubric:**

| Factor | Points | Condition |
|--------|--------|-----------|
| **HPD Registration Match** | +15 | Owner name found in HPD registration for this BBL |
| **ACRIS Deed Match** | +15 | Owner name matches most recent deed holder in ACRIS |
| **PLUTO Owner Match** | +10 | Owner name matches PLUTO owner field |
| **DOB Filing Match** | +5 | Owner name appears in DOB permit filings for this BBL |
| **Phone Found (any source)** | +5 | At least one phone number found for identified owner |
| **Phone Verified (2+ sources)** | +10 | Same phone confirmed by PDL + DOB, or PDL + HPD, etc. |
| **Email Found** | +5 | Email address found via PDL or Apollo |
| **Email Verified (Apollo)** | +5 | Apollo returned a verified email |
| **Apollo Person Match** | +10 | Apollo People Enrichment matched the person |
| **Apollo Org Match** | +5 | Apollo Org Enrichment matched the company/LLC |
| **PDL Person Match** | +5 | People Data Labs returned a match |
| **LinkedIn Found** | +5 | LinkedIn profile URL found |
| **Mailing Address Matches** | +5 | HPD mailing address matches PLUTO or ACRIS address |

**Max possible: 100 points**

**Grade Thresholds:**
- A (85-100): High confidence — multiple sources confirm owner + verified contact
- B (70-84): Good confidence — owner identified, some contact info verified
- C (50-69): Moderate — owner likely identified but contact info unverified
- D (30-49): Low — limited data, owner identification uncertain
- F (0-29): Insufficient — not enough data to reliably identify owner

### UI Changes in Building Profile

Replace the current "AI Lead Score" card:

```
┌──────────────────────────────────────────────────┐
│ 🔒 Data Confidence Score                    78 B │
│                                                  │
│ ✅ HPD Registration         Owner name match  +15│
│ ✅ ACRIS Deed               Deed holder match +15│
│ ✅ PLUTO Owner              Owner field match +10│
│ ✅ Phone Found              (718) 336-1416     +5│
│ ✅ Phone Verified           PDL + DOB match   +10│
│ ✅ Apollo Person Match      Person found       +10│
│ ✅ Email Found              alan@shore.com      +5│
│ ⬜ Email Verified           Not confirmed       0│
│ ⬜ LinkedIn Found           Not found            0│
│ ✅ Mailing Address Match    Addresses match     +5│
│ ⬜ Apollo Org Match         Not checked          0│
│ ⬜ DOB Filing Match         Not checked          0│
│ ⬜ PDL Match                Not checked          0│
└──────────────────────────────────────────────────┘
```

- Green checkmark (✅) for matched/confirmed factors
- Gray box (⬜) for unmatched or unchecked
- Each row: factor name + description + points
- Score + grade badge in header (color-coded: green A/B, yellow C, red D/F)
- Remove the "✓ Verified" badge — it's misleading. Instead show grade badge only.

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
- Remove "✓ Verified" text from the header

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

Show a toast: "✅ Contact created + enriched with Apollo data"

### 3B. Find Decision Makers (Landlord Dossier)

Add a section to the landlord contact dossier:

**"People at [Company]" section:**
```
┌──────────────────────────────────────────────────┐
│ 👥 People at 97 Dupont LLC                       │
│                                                  │
│ 📷 Dorothy Chasewood — Owner (this contact)       │
│    dorothy@97dupont.com · (718) 336-1416         │
│                                                  │
│ 📷 Michael Torres — Property Manager         [+] │
│    m.torres@97dupont.com · (718) 336-1420        │
│                                                  │
│ 📷 Sarah Kim — Leasing Agent                 [+] │
│    s.kim@97dupont.com                            │
│                                                  │
│            [Find More People] (FREE)             │
└──────────────────────────────────────────────────┘
```

Implementation — use Apollo People Search (FREE, no credits):
```typescript
const people = await findPeopleAtOrg({
  organization_name: contact.typeData.entityName,
  // Or by domain if known
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

### 3C. Organization Intelligence Card (Landlord Dossier)

When a landlord contact has org data (from 3A), show:

```
┌──────────────────────────────────────────────────┐
│ 🏢 Organization Intelligence                     │
│                                                  │
│ [LOGO] 97 Dupont LLC                             │
│                                                  │
│ Industry:    Real Estate                         │
│ Founded:     2008                                │
│ Employees:   12                                  │
│ Revenue:     $5M - $10M                          │
│ Website:     97dupont.com                        │
│ Phone:       (718) 336-1400                      │
│ Address:     97 Dupont St, Brooklyn, NY 11222    │
│                                                  │
│ Source: Apollo.io                                │
└──────────────────────────────────────────────────┘
```

### 3D. Apollo Scoring Integration

Update the confidence score calculation to include Apollo signals:

Already covered in Section 2 above — Apollo Person Match (+10), Apollo Org Match (+5), Apollo Email Verified (+5).

### 3E. Bulk Enrich Prospect List

On the Prospecting page:
- Add "🔄 Enrich All" button in the toolbar
- Selects all prospects that haven't been enriched yet
- Runs Apollo Bulk People Enrichment (max 10 per API call)
- Shows progress: "Enriching 23 prospects... 10/23"
- Batches into groups of 10
- Updates each prospect's owner data with Apollo results
- Summary toast: "✅ 23 prospects enriched. 18 matched, 5 no match."
- Shows credit usage: "Used 23 credits (9,977 remaining)"

### 3F. Email Personalization with Apollo Data

When composing an email to a landlord contact that has Apollo data, auto-suggest personalizations:

In the compose modal, if the selected contact has Apollo enrichment:
- Auto-fill merge variables: `{title}`, `{company}`, `{industry}`
- Show a "✨ Personalize" button that uses AI to draft an opening line using their title, company, and portfolio context

---

## 4. Map Integration for New Developments

Add new development markers to the existing map search:

### Map Filter Addition
Add a toggle/checkbox to the map filter panel:
```
[✓] Show existing buildings
[✓] Show new developments  (🏗️ markers)
```

### New Development Markers
- Icon: 🏗️ or a crane icon — distinct from existing building markers
- Color: orange/amber (vs blue for existing buildings)
- On click: show popup with address, units, developer, status, cost
- Click "View Details" opens the new development detail panel

### Implementation
In `map-search.tsx` or `map-actions.ts`:
- When "Show new developments" is checked, query DOB filings for NB jobs in the visible map bounds
- Use the block/lot from DOB filings + PLUTO geocoding to place markers
- Or use the house_number + street_name + borough to geocode

---

## Build Order

1. **Confidence Score** — rename AI Lead Score, implement new scoring rubric with all data sources, update building profile UI
2. **New Development search** — new tab in Market Intel, server action for DOB NB filings, results list with developer contact info, detail panel
3. **New Development map integration** — orange markers on map for new buildings
4. **Apollo auto-enrich** — enrich on contact creation from building profile
5. **Apollo org intelligence** — org enrichment card in landlord dossier
6. **Apollo find decision makers** — people search in landlord dossier
7. **Bulk enrich** — enrich all button on prospecting page
8. **Leasing pitch template** — new email template for new development outreach
9. **Prospecting source filter** — filter by Market Intel vs New Development vs Manual
