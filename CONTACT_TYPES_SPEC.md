# VettdRE — CRM Contact Type Profiles

Read CLAUDE.md for project context. Define 4 distinct contact types with type-specific data points, pipelines, and workflows.

---

## Overview

Every contact in VettdRE has a **type** that determines:
- What data fields are collected and displayed
- Which pipeline they belong to
- What outreach templates are relevant
- How they're scored and prioritized
- What their dossier page looks like

---

## Contact Types

### 1. 🏢 Landlord / Owner / Management

**Who:** Property owners, LLCs, management companies, supers. These are your OUTBOUND prospecting targets — people you find through Market Intel and reach out to for exclusive listings.

**Source:** Market Intel building profiles, HPD registrations, DOB filings, ACRIS records, referrals, networking

**Key Data Points:**

| Field | Description | Source |
|-------|------------|--------|
| entityName | LLC or company name | HPD, ACRIS |
| entityType | Individual, LLC, Corp, Trust | ACRIS, Apollo |
| role | Owner, Manager, Agent, Super, Principal | HPD registration |
| portfolioSize | Number of buildings owned | PLUTO + ACRIS cross-ref |
| totalUnits | Total units across portfolio | PLUTO |
| buildings[] | Linked buildings (address, BBL, units, class) | Market Intel |
| mailingAddress | Where tax bills / correspondence go | HPD, PLUTO |
| managementCompany | If different from owner | HPD |
| yearsOwned | How long they've held the property | ACRIS sale date |
| lastSalePrice | What they paid | ACRIS |
| estimatedValue | Current estimated value | PLUTO assessed value |
| mortgageInfo | Lender, amount, date | ACRIS |
| violationCount | Total open violations (HPD + DOB + ECB) | NYC APIs |
| distressScore | 0-100 distress/motivation score | AI calculated |
| rentStabilized | % of units rent stabilized | Rent Stabilization DB |
| vacancyIndicators | Signs of vacancy (no utilities, complaints) | HPD complaints |
| preferredContact | Phone, email, in-person, mail | User input |
| bestTimeToReach | Morning, afternoon, evening | User input |
| decisionMaker | Is this the actual decision maker? | User assessment |
| exclusiveStatus | None, Verbal, Written, Expired | User input |
| commissionTerms | Fee structure if exclusive signed | User input |

**Qualification Scoring (Landlord):**
- Portfolio size (more units = higher value client) → 0-25 pts
- Distress signals (violations, liens, litigation) → 0-20 pts
- Ownership duration (longer = more equity, more likely to sell) → 0-15 pts
- Responsiveness (answered calls/emails) → 0-15 pts
- Market conditions (area appreciation, comparable sales) → 0-10 pts
- Vacancy signals → 0-10 pts
- Decision maker confirmed → 0-5 pts

**Pipeline Stages (Outbound):**
```
Researched → Cold Outreach → Contacted → Interested → Meeting Set → Proposal Sent → Exclusive Signed → Active Listing → Closed
```

**Key Actions:**
- Call (log outcome: voicemail, spoke, wrong number, disconnected)
- Email (cold pitch, follow-up, market report)
- Door knock / drop by (log: spoke to super, left card, building locked)
- Send comp report / market analysis
- Schedule meeting
- Send exclusive agreement
- Convert to active listing

---

### 2. 🏠 Buyer

**Who:** People looking to purchase property — investors, first-time buyers, families upgrading. These are INBOUND leads from your marketing, referrals, or StreetEasy/Zillow.

**Source:** StreetEasy inquiries, Zillow leads, open house sign-ins, referrals, website form, cold inbound

**Key Data Points:**

| Field | Description | Source |
|-------|------------|--------|
| buyerType | First-time, Investor, Upgrade, Downsize, Pied-à-terre | User input / AI parsed |
| preApproved | Yes / No / In process | User input |
| preApprovalAmount | Max loan amount | User input |
| lender | Lender name + loan officer contact | User input |
| cashBuyer | Yes / No | User input |
| budget.min / budget.max | Price range | AI parsed from email or user input |
| targetNeighborhoods[] | Preferred areas | AI parsed or user input |
| targetBoroughs[] | Manhattan, Brooklyn, etc. | User input |
| propertyType | Condo, Co-op, Townhouse, Multi-family, Land | User input |
| bedrooms.min / bedrooms.max | Bedroom count range | AI parsed |
| bathrooms.min | Minimum bathrooms | User input |
| sqftMin | Minimum square footage | User input |
| mustHaves[] | Doorman, laundry, outdoor space, parking, elevator, pet-friendly | User input / AI parsed |
| dealBreakers[] | Walk-up, no laundry, noisy street | User input |
| moveTimeline | Immediately, 1-3 months, 3-6 months, 6-12 months, Flexible | AI parsed or user input |
| currentLivingSituation | Renting, Own, Living with family, Relocating | User input |
| reasonForBuying | Investment, Primary residence, Rental income, Flip | User input |
| propertiesViewed[] | Addresses shown (linked to Showing records) | Auto from showings |
| offersSubmitted[] | Address, amount, date, status | User input |
| competingAgents | Are they working with other agents? | User input |
| exclusiveBuyer | Signed buyer's agreement? | User input |

**Qualification Scoring (Buyer):**
- Pre-approval / proof of funds → 0-30 pts
- Timeline urgency (sooner = higher) → 0-20 pts
- Budget clarity (specific range vs "looking around") → 0-15 pts
- Engagement (responding, attending showings) → 0-15 pts
- Exclusivity (working only with you) → 0-10 pts
- Motivation (must move vs casually looking) → 0-10 pts

**Pipeline Stages (Buyer Inbound):**
```
New Inquiry → Qualified → Searching → Showing → Offer Submitted → Under Contract → Due Diligence → Closing → Closed / Moved In
```

**Key Actions:**
- Send listing matches
- Schedule showing
- Submit offer
- Send comp analysis
- Coordinate with lender
- Schedule inspection
- Review contract
- Closing follow-up

---

### 3. 💰 Seller

**Who:** Property owners who want to sell. Could originate from your landlord prospecting (outbound) or come inbound. Different from a "landlord" because they have active intent to sell.

**Source:** Converted from Landlord contact, referral, past client, cold inbound, expired listing

**Key Data Points:**

| Field | Description | Source |
|-------|------------|--------|
| propertyAddress | Address of property being sold | User input / Market Intel |
| propertyType | Condo, Co-op, Townhouse, Multi-family, Land | PLUTO |
| askingPrice | Listed or desired price | User input |
| estimatedValue | Comp-based estimate | Market analysis |
| reasonForSelling | Relocating, Downsizing, Divorce, Estate, Investment exit, Distress | User input |
| sellTimeline | ASAP, 1-3 months, 3-6 months, Flexible, Testing the market | User input |
| mortgageBalance | Remaining loan amount | User input |
| equity | Estimated equity (value - mortgage) | Calculated |
| ownerOccupied | Yes / No (tenant-occupied) | User input |
| tenantSituation | Vacant, Month-to-month, Lease until [date], Rent stabilized | User input |
| condition | Excellent, Good, Fair, Needs work, Gut renovation | User input |
| renovations[] | Recent upgrades (kitchen, bath, roof, etc.) | User input |
| comparableSales[] | Recent comps used for pricing | Market analysis |
| listingStatus | Not yet listed, Coming soon, Active, Under contract, Closed | User input |
| listingPrice | Actual listing price | User input |
| listingDate | When listed | User input |
| daysOnMarket | Auto-calculated from listing date | Calculated |
| showingCount | Total showings conducted | Auto from showings |
| offerCount | Offers received | User input |
| bestOffer | Highest offer amount | User input |
| exclusiveAgreement | Yes / No + expiration date | User input |
| commissionRate | Agreed commission % | User input |
| cobrokeRate | Co-broke commission % | User input |
| openHouseDates[] | Scheduled open houses | Calendar |
| photography | Scheduled / Completed / Not needed | User input |
| staging | Scheduled / Completed / Not needed | User input |
| floorPlan | Yes / No / Ordered | User input |

**Qualification Scoring (Seller):**
- Motivation/urgency (must sell vs testing market) → 0-25 pts
- Pricing realism (asking near market value) → 0-20 pts
- Property condition & marketability → 0-15 pts
- Exclusivity (signed agreement) → 0-15 pts
- Timeline clarity → 0-10 pts
- Equity position (negative equity = harder) → 0-10 pts
- Cooperation (responsive, flexible showings) → 0-5 pts

**Pipeline Stages (Seller):**
```
Lead → Listing Appointment → CMA Presented → Agreement Signed → Pre-Market Prep → Active Listing → Showings → Offer Received → Under Contract → Closing → Closed
```

**Key Actions:**
- Schedule listing appointment
- Prepare CMA (comparative market analysis)
- Send listing agreement
- Order photography / staging / floor plan
- Create listing (MLS, StreetEasy, Zillow)
- Schedule open house
- Review offers
- Negotiate
- Coordinate closing

---

### 4. 🔑 Renter

**Who:** People looking to rent an apartment. Your highest volume inbound lead type in NYC.

**Source:** StreetEasy, Zillow, Apartments.com, RentHop, referrals, open house, website, social media

**Key Data Points:**

| Field | Description | Source |
|-------|------------|--------|
| budget.min / budget.max | Monthly rent range | AI parsed from email or user input |
| targetNeighborhoods[] | Preferred neighborhoods | AI parsed or user input |
| targetBoroughs[] | Manhattan, Brooklyn, Queens, etc. | User input |
| bedrooms | Studio, 1BR, 2BR, 3BR, 4BR+ | AI parsed |
| moveInDate | Desired move-in date | AI parsed or user input |
| leaseLength | 12 months, Flexible, Month-to-month | User input |
| currentSituation | Currently renting, Relocating, First apartment, Roommate split | User input |
| currentRent | What they pay now | User input |
| creditScore | Excellent (750+), Good (700-749), Fair (650-699), Poor (<650), Unknown | User input |
| annualIncome | Gross annual income | User input (for 40x rent rule) |
| employmentStatus | Employed, Self-employed, Student, Retired, Unemployed | User input |
| employer | Company name | User input |
| guarantor | Has guarantor? Yes / No / Using service (Insurent, Leap) | User input |
| pets | None, Dog (breed/weight), Cat, Other | AI parsed or user input |
| roommates | Solo, Couple, Roommate(s) — number | User input |
| mustHaves[] | Laundry in-unit, Dishwasher, Outdoor space, Doorman, Elevator, Natural light, Parking | AI parsed or user input |
| dealBreakers[] | Walk-up above 3rd floor, Carpet, No laundry, Street noise | User input |
| brokerFee | Willing to pay? Yes / No / Owner-pay only | User input |
| documentsReady | Application, Pay stubs, Tax returns, Bank statements, ID, Guarantor docs | Checklist |
| apartmentsViewed[] | Addresses shown | Auto from showings |
| applicationsSubmitted[] | Address, date, status (pending/approved/denied) | User input |
| urgency | Immediate (lease ending), Soon (1-2 months), Flexible | AI parsed |

**Qualification Scoring (Renter):**
- Income meets 40x rule for stated budget → 0-25 pts
- Move-in urgency (sooner = hotter lead) → 0-20 pts
- Documents ready / pre-qualified → 0-15 pts
- Engagement (responding, attending viewings) → 0-15 pts
- Budget realism (aligns with market) → 0-10 pts
- Flexibility (multiple neighborhoods, flexible dates) → 0-10 pts
- Broker fee acceptance → 0-5 pts

**Pipeline Stages (Renter Inbound):**
```
New Inquiry → Pre-Qualified → Searching → Showing → Application Submitted → Approved → Lease Signing → Move-In → Closed
```

**Key Actions:**
- Pre-qualify (income check, 40x rule)
- Send listing matches
- Schedule showing
- Submit application
- Coordinate with landlord/management
- Send lease for review
- Collect move-in funds (first, last, security, broker fee)
- Key handoff

---

## Implementation

### Database Changes

Add `contactType` enum and field to Contact model:

```prisma
enum ContactType {
  landlord    // Owner / LLC / Management
  buyer       // Property buyer
  seller      // Property seller
  renter      // Apartment renter
}

model Contact {
  // ... existing fields ...
  contactType    ContactType  @default(renter)
  
  // Type-specific data stored as JSON (flexible, no schema migration per field)
  typeData       Json?        // Stores type-specific fields as JSON
  
  // OR use a dedicated profile per type:
  landlordProfile  LandlordProfile?
  buyerProfile     BuyerProfile?
  sellerProfile    SellerProfile?
  renterProfile    RenterProfile?
}
```

**Recommendation: Use JSON `typeData` field.**

Why: You have 30+ type-specific fields per type. Creating 4 separate tables with all those columns is heavy. A JSON field lets you iterate fast, add fields without migrations, and query with Prisma's JSON filtering. You can always normalize later.

```typescript
// Type-safe interfaces for typeData
interface LandlordTypeData {
  entityName?: string;
  entityType?: 'individual' | 'llc' | 'corp' | 'trust';
  role?: string;
  portfolioSize?: number;
  totalUnits?: number;
  buildings?: { address: string; bbl: string; units: number }[];
  mailingAddress?: string;
  managementCompany?: string;
  yearsOwned?: number;
  lastSalePrice?: number;
  estimatedValue?: number;
  violationCount?: number;
  distressScore?: number;
  rentStabilizedPct?: number;
  preferredContact?: 'phone' | 'email' | 'in-person' | 'mail';
  bestTimeToReach?: string;
  decisionMaker?: boolean;
  exclusiveStatus?: 'none' | 'verbal' | 'written' | 'expired';
  commissionTerms?: string;
}

interface BuyerTypeData {
  buyerType?: 'first-time' | 'investor' | 'upgrade' | 'downsize' | 'pied-a-terre';
  preApproved?: boolean;
  preApprovalAmount?: number;
  lender?: string;
  cashBuyer?: boolean;
  budgetMin?: number;
  budgetMax?: number;
  targetNeighborhoods?: string[];
  targetBoroughs?: string[];
  propertyType?: string;
  bedroomsMin?: number;
  bedroomsMax?: number;
  bathroomsMin?: number;
  sqftMin?: number;
  mustHaves?: string[];
  dealBreakers?: string[];
  moveTimeline?: string;
  currentSituation?: string;
  reasonForBuying?: string;
  competingAgents?: boolean;
  exclusiveBuyer?: boolean;
}

interface SellerTypeData {
  propertyAddress?: string;
  propertyType?: string;
  askingPrice?: number;
  estimatedValue?: number;
  reasonForSelling?: string;
  sellTimeline?: string;
  mortgageBalance?: number;
  equity?: number;
  ownerOccupied?: boolean;
  tenantSituation?: string;
  condition?: string;
  renovations?: string[];
  listingStatus?: string;
  listingPrice?: number;
  listingDate?: string;
  daysOnMarket?: number;
  exclusiveAgreement?: boolean;
  exclusiveExpiration?: string;
  commissionRate?: number;
  cobrokeRate?: number;
  photographyStatus?: string;
  stagingStatus?: string;
}

interface RenterTypeData {
  budgetMin?: number;
  budgetMax?: number;
  targetNeighborhoods?: string[];
  targetBoroughs?: string[];
  bedrooms?: string;
  moveInDate?: string;
  leaseLength?: string;
  currentSituation?: string;
  currentRent?: number;
  creditScore?: string;
  annualIncome?: number;
  employmentStatus?: string;
  employer?: string;
  guarantor?: string;
  pets?: string;
  roommates?: string;
  mustHaves?: string[];
  dealBreakers?: string[];
  brokerFee?: boolean;
  documentsReady?: string[];
  urgency?: string;
}
```

### UI Changes

**Contact List:**
- Add type filter pills: All | 🏢 Landlords | 🏠 Buyers | 💰 Sellers | 🔑 Renters
- Type icon/badge next to each contact name
- Different card colors or subtle accent per type

**Contact Dossier:**
- Type badge in header
- Type-specific tabs/sections:
  - Landlord: Portfolio tab, Buildings tab, Violations summary
  - Buyer: Search Criteria tab, Showings tab, Offers tab
  - Seller: Listing tab, Showings tab, Offers tab
  - Renter: Search Criteria tab, Applications tab, Documents checklist
- Type-specific scoring breakdown

**Create/Edit Contact:**
- Contact type selector at top (4 buttons/pills)
- Form dynamically shows type-specific fields
- Common fields always shown: name, email, phone, source, notes

**Pipeline:**
- Each contact type can have its own default pipeline
- Or one pipeline with type indicated on deal cards
- Type filter on pipeline view

**AI Email Parsing:**
- When a new email comes in, AI should detect contact type from content:
  - "Looking for a 2BR in Brooklyn" → Renter
  - "I want to sell my property at..." → Seller
  - "Interested in purchasing..." → Buyer
  - Owner/management correspondence → Landlord
- Auto-set contactType when creating contact from email

**Market Intel → Prospecting:**
- When adding a building owner to prospects, auto-set type = landlord
- Pre-fill typeData from building profile (portfolio size, units, violations, etc.)

### Scoring Updates

Update the qualification scoring in the AI analysis to use type-specific criteria. The current single scoring algorithm should branch by contactType and use the appropriate rubric above.

---

## Build Order

1. Add `contactType` enum + `typeData` JSON field to Contact model, run `prisma db push`
2. Create TypeScript interfaces for each type's data
3. Update contact create/edit form with type selector + dynamic fields
4. Update contact list with type filter pills + type badges
5. Update contact dossier with type-specific sections
6. Update AI email parser to detect contact type
7. Update qualification scoring to use type-specific rubrics
8. Update Market Intel → Add to Prospects to auto-set landlord type + pre-fill data
9. Create type-specific pipeline defaults
