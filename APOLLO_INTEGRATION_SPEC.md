# VettdRE — Apollo.io Paid Plan Integration Spec

Read CLAUDE.md for project context. Now that Apollo is on a paid plan, integrate their full API suite into both CRM contacts and building intelligence.

---

## Overview

Apollo's paid plan unlocks:
- **People Search** — find people by name, title, company, location (FREE, no credits)
- **People Enrichment** — get email, phone, LinkedIn, title, company for a person (costs credits)
- **Bulk People Enrichment** — enrich up to 10 people per call (costs credits)
- **Organization Enrichment** — get company data: industry, revenue, employee count, phone, address (costs credits)
- **Organization Search** — find companies by name, industry, location (costs credits)

API Base: `https://api.apollo.io/api/v1`
Auth: `X-Api-Key` header with APOLLO_API_KEY

---

## 1. Building Profile Enhancement

### Current State:
Building profiles already call Apollo in `market-intel/lead-verification.ts` but it was returning 403 on the free plan. Now it should work.

### New: Multi-Source Owner Intelligence

When a building profile loads and we identify the likely owner (from HPD + DOB + ACRIS), run Apollo enrichment in parallel with PDL:

#### Step 1: People Enrichment on Owner
```typescript
// In building-profile-actions.ts, after AI ownership analysis identifies the owner

async function apolloEnrichPerson(name: string, location?: string, domain?: string) {
  const [firstName, ...lastParts] = name.trim().split(/\s+/);
  const lastName = lastParts.join(" ");
  
  const res = await fetch("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      organization_name: domain || undefined,
      city: location || "New York",
      state: "New York",
      country: "United States",
      reveal_personal_emails: true,
      reveal_phone_number: true,
    }),
  });
  
  if (!res.ok) {
    console.error("[APOLLO] Enrichment failed:", res.status);
    return null;
  }
  
  const data = await res.json();
  const person = data.person;
  
  if (!person) return null;
  
  return {
    source: "apollo",
    firstName: person.first_name,
    lastName: person.last_name,
    title: person.title,
    email: person.email,
    personalEmails: person.personal_emails || [],
    phone: person.phone_numbers?.[0]?.sanitized_number || person.organization?.primary_phone?.sanitized_number || null,
    phones: (person.phone_numbers || []).map((p: any) => p.sanitized_number),
    linkedinUrl: person.linkedin_url,
    photoUrl: person.photo_url,
    company: person.organization?.name,
    companyWebsite: person.organization?.website_url,
    companyIndustry: person.organization?.industry,
    companySize: person.organization?.estimated_num_employees,
    companyRevenue: person.organization?.annual_revenue_printed,
    companyPhone: person.organization?.primary_phone?.sanitized_number,
    companyAddress: person.organization?.raw_address,
    city: person.city,
    state: person.state,
    country: person.country,
    seniority: person.seniority,
    departments: person.departments,
  };
}
```

#### Step 2: Organization Enrichment on LLC/Company
When the owner is an LLC or corporation (from HPD/ACRIS), also enrich the organization:

```typescript
async function apolloEnrichOrganization(companyName: string) {
  const res = await fetch("https://api.apollo.io/api/v1/organizations/enrich", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.APOLLO_API_KEY!,
    },
    // Use query params
    // Try domain first if available, otherwise name
  });
  
  // Alternative: POST to organization search
  const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      organization_name: companyName,
      organization_locations: ["New York, New York, United States"],
      per_page: 1,
    }),
  });
  
  if (!searchRes.ok) return null;
  const data = await searchRes.json();
  const org = data.organizations?.[0] || data.accounts?.[0];
  
  if (!org) return null;
  
  return {
    source: "apollo_org",
    name: org.name,
    website: org.website_url,
    industry: org.industry,
    subIndustry: org.sub_industry,
    employeeCount: org.estimated_num_employees,
    revenue: org.annual_revenue_printed,
    phone: org.primary_phone?.sanitized_number,
    address: org.raw_address,
    city: org.city,
    state: org.state,
    linkedinUrl: org.linkedin_url,
    logoUrl: org.logo_url,
    foundedYear: org.founded_year,
    shortDescription: org.short_description,
    seoDescription: org.seo_description,
  };
}
```

#### Step 3: Find Key People at the Organization
Use People Search (FREE — no credits) to find decision-makers at the property management company:

```typescript
async function apolloFindPeopleAtOrg(orgName: string) {
  const res = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      organization_name: [orgName],
      person_titles: [
        "Owner", "Principal", "Managing Director", "CEO", "President",
        "Property Manager", "Director of Operations", "VP of Real Estate",
        "Managing Partner", "Founder"
      ],
      person_locations: ["New York, New York, United States"],
      per_page: 5,
    }),
  });
  
  if (!res.ok) return [];
  const data = await res.json();
  
  return (data.people || []).map((p: any) => ({
    apolloId: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    title: p.title,
    seniority: p.seniority,
    hasEmail: p.has_email,
    hasPhone: p.has_direct_phone === "Yes",
    orgName: p.organization?.name,
  }));
}
```

Then use Bulk People Enrichment to get their contact details:
```typescript
async function apolloBulkEnrich(apolloIds: string[]) {
  const res = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      reveal_personal_emails: true,
      reveal_phone_number: true,
      details: apolloIds.map(id => ({ id })),
    }),
  });
  
  if (!res.ok) return [];
  const data = await res.json();
  return data.matches || [];
}
```

### Updated Building Profile UI:

Add an "🏢 Organization Intelligence" card (if LLC/corp owner) showing:
```
┌──────────────────────────────────────────────────────┐
│ 🏢 Organization Intelligence          via Apollo.io  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [Logo]  SHOREFRONT APARTMENTS LLC                   │
│          Real Estate · 15 employees · Est. 2005      │
│          Revenue: $2M - $5M                          │
│          📞 (718) 336-1416                           │
│          🌐 shorefrontapts.com                       │
│          📍 2250 East 4th St, Brooklyn, NY           │
│                                                      │
│  KEY PEOPLE                                          │
│  ┌─────────────────────────────────────────────┐     │
│  │ 👤 Alan Polen · Owner & Principal           │     │
│  │    📧 alan@shorefrontapts.com               │     │
│  │    📞 (718) 336-1416  ← Best Number ✅       │     │
│  │    🔗 linkedin.com/in/alanpolen             │     │
│  │    [Add to Contacts]                        │     │
│  ├─────────────────────────────────────────────┤     │
│  │ 👤 David Polen · VP Operations              │     │
│  │    📧 david@shorefrontapts.com              │     │
│  │    📞 (718) 523-8100                        │     │
│  │    [Add to Contacts]                        │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Confidence Score Enhancement:
Feed Apollo data into the AI ownership analysis prompt. Update the confidence scoring:

```
Current confidence inputs:
- HPD Registration (name, role) → 20 pts
- DOB Filings (phone numbers) → 20 pts  
- ACRIS Records (ownership transfers) → 20 pts
- PDL Match (identity verification) → 20 pts
- Litigation Records (name matches) → 10 pts
- Multiple source corroboration → 10 pts

NEW Apollo inputs:
- Apollo person match found → +10 pts
- Apollo phone matches DOB phone → +15 pts (HUGE confirmation)
- Apollo email found → +5 pts
- Apollo org matches HPD entity → +10 pts
- Apollo org has website → +5 pts
- Apollo found key people at org → +5 pts

This means confidence can now reach near 100% when Apollo confirms what HPD + DOB + PDL already found.
```

Update the AI prompt in building-profile-actions.ts to include Apollo data in its analysis.

---

## 2. CRM Contact Enrichment Enhancement

### Current State:
Contact enrichment uses PDL (primary) in `contacts/[id]/enrich-actions.ts`. Apollo was secondary but limited to org lookup on free plan.

### New: Dual-Source Enrichment Pipeline

Update the "Verify & Enrich" button flow:

```
1. PDL Person Search (name + location)
   ↓ get: phones, emails, job, company, LinkedIn
2. Apollo People Enrichment (name + company OR email from PDL)
   ↓ get: verified email, direct phone, title, seniority, LinkedIn photo
3. Apollo Organization Enrichment (company name from PDL/Apollo)
   ↓ get: industry, revenue, employee count, company phone, website
4. NYC PLUTO (existing)
   ↓ get: owned properties
5. Merge all sources → AI scoring
```

### Merge Logic:
```typescript
function mergeEnrichmentData(pdl: any, apollo: any, apolloOrg: any) {
  return {
    // Identity — prefer Apollo if available (more recent data)
    firstName: apollo?.firstName || pdl?.firstName,
    lastName: apollo?.lastName || pdl?.lastName,
    title: apollo?.title || pdl?.title,
    company: apollo?.company || pdl?.company,
    
    // Contact — deduplicate, prefer verified
    emails: deduplicateEmails([
      ...(pdl?.emails || []),
      apollo?.email,
      ...(apollo?.personalEmails || []),
    ].filter(Boolean)),
    
    phones: deduplicatePhones([
      ...(pdl?.phones || []),
      ...(apollo?.phones || []),
      apolloOrg?.phone,
    ].filter(Boolean)),
    
    // Professional
    linkedinUrl: apollo?.linkedinUrl || pdl?.linkedinUrl,
    photoUrl: apollo?.photoUrl || pdl?.photoUrl,
    seniority: apollo?.seniority,
    departments: apollo?.departments,
    
    // Company details (from Apollo Org)
    companyIndustry: apolloOrg?.industry || apollo?.companyIndustry,
    companySize: apolloOrg?.employeeCount || apollo?.companySize,
    companyRevenue: apolloOrg?.revenue || apollo?.companyRevenue,
    companyWebsite: apolloOrg?.website || apollo?.companyWebsite,
    companyPhone: apolloOrg?.phone,
    companyAddress: apolloOrg?.address,
    companyLinkedin: apolloOrg?.linkedinUrl,
    companyLogo: apolloOrg?.logoUrl,
    companyDescription: apolloOrg?.shortDescription,
    companyFoundedYear: apolloOrg?.foundedYear,
    
    // Sources
    dataSources: ["pdl", "apollo", apolloOrg ? "apollo_org" : null].filter(Boolean),
  };
}
```

### Updated Contact Dossier UI:

Enhance the AI Lead Intelligence card with Apollo data:

```
┌──────────────────────────────────────────────────────┐
│ 🤖 AI Lead Intelligence       Score: 82 / A         │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [Photo]  ALAN POLEN                                 │
│           Owner & Principal                          │
│           Shorefront Apartments LLC                  │
│           Real Estate · 15 employees · $2-5M rev     │
│                                                      │
│  📧 Emails                    📞 Phones              │
│  alan@shorefrontapts.com ✓    (718) 336-1416 ✓      │
│  apolen@gmail.com             (718) 523-8100         │
│  Source: Apollo + PDL          Source: DOB + Apollo   │
│                                                      │
│  🔗 LinkedIn  🌐 Website                             │
│  linkedin.com/in/alanpolen    shorefrontapts.com     │
│                                                      │
│  🏠 NYC Properties Owned: 3                          │
│  2250 East 4 St (12 units)                          │
│  1735 East 13 St (8 units)                          │
│  890 Ocean Pkwy (24 units)                          │
│                                                      │
│  ✅ PDL Match (likelihood: 8)                        │
│  ✅ Apollo Match (verified email + phone)             │
│  ✅ HPD Registration confirms ownership              │
│  ✅ DOB phone matches Apollo phone                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Source Verification Badges:
When a piece of data is confirmed by multiple sources, show verification:
- 📧 Email with ✓ = found in both PDL and Apollo
- 📞 Phone with ✓ = found in both DOB filings and Apollo/PDL
- Single source only = show without checkmark

---

## 3. Bulk Enrichment (New Feature)

### On the Contacts list page, add a "Bulk Enrich" button:

```typescript
async function bulkEnrichContacts(contactIds: string[]) {
  // 1. Fetch all contacts
  // 2. Batch into groups of 10
  // 3. For each batch, call Apollo Bulk People Enrichment
  // 4. Also run PDL for each (already have this)
  // 5. Merge results
  // 6. Update contact records + enrichment profiles
  // 7. Return summary: X enriched, Y new phones found, Z new emails found
}
```

### UI:
- Select contacts with checkboxes (already built)
- "Enrich Selected" button in bulk actions bar
- Progress indicator: "Enriching 5 of 23 contacts..."
- Results toast: "23 contacts enriched: 18 new phones, 21 new emails found"
- Warning: "This will use approximately 23 Apollo credits. Continue?"

---

## 4. Apollo in Smart Contact Directory (Building Profiles)

### Current:
Contact Intelligence card shows DOB + HPD contacts. PDL enrichment runs on top contact.

### Enhanced Flow:
1. Identify all unique people from HPD + DOB (existing)
2. For each person with a name, run Apollo People Search (FREE) to check if they exist
3. For the top-ranked owner, run full Apollo People Enrichment (costs credits)
4. For the LLC/company, run Organization Enrichment (costs credits)
5. Run People Search for key people at that org (FREE)
6. Display all data in enriched contact cards

### Credit-Conscious Strategy:
- People Search is FREE — use it liberally to find/verify people
- People Enrichment costs credits — only run on the #1 ranked owner automatically
- Organization Enrichment costs credits — only run when LLC/corp is identified
- Bulk Enrichment costs credits — only run on user click ("Enrich All Contacts")
- Show "Enrich" button on non-primary contacts for manual enrichment

---

## 5. Updated API Keys Settings

In `/settings/api-keys`, update the Apollo card:
- Show plan status: "Organization Plan — Active"
- Show credit usage: "Credits used: 234 / 10,000 this month"
- Test connection: verify People Search works (free endpoint)
- Show available endpoints

---

## Build Order:
1. Update `market-intel/lead-verification.ts` to use new Apollo endpoints (People Enrichment with reveal_phone_number=true, reveal_personal_emails=true)
2. Create `src/lib/apollo.ts` with all Apollo helper functions (search, enrich person, enrich org, bulk enrich, find people at org)
3. Integrate Apollo into building-profile-actions.ts (enrich owner + org + find key people)
4. Update AI ownership analysis prompt to include Apollo data in confidence scoring
5. Add Organization Intelligence card to building profile UI
6. Update contact enrichment pipeline in enrich-actions.ts (PDL + Apollo dual source)
7. Add merge logic for multi-source enrichment data
8. Update contact dossier UI with enhanced enrichment display + source badges
9. Build bulk enrichment feature on contacts list page
10. Update API Keys settings page with Apollo plan info
11. Add credit usage warning/tracking

## Important Reminders:
- Apollo API key header is `X-Api-Key` (not `Authorization`)
- People Search endpoint does NOT consume credits — use it freely for prospecting
- People Enrichment DOES consume credits — be strategic
- Set `reveal_personal_emails: true` and `reveal_phone_number: true` on enrichment calls
- Bulk People Enrichment max 10 people per call
- Apollo rate limits vary by plan — add retry logic with exponential backoff
- Deduplicate phones and emails when merging PDL + Apollo results
- Log all Apollo calls: `[APOLLO] Enriched: Alan Polen | Phone: found | Email: found | Credits: 1`
- Don't auto-enrich every contact on building profiles — only the #1 ranked owner. Show "Enrich" button for others.
