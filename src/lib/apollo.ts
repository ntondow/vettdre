"use server";

// ============================================================
// Apollo.io API Integration — Paid Plan
// ============================================================
// People Search: FREE (no credits)
// People Enrichment: costs credits
// Bulk People Enrichment: costs credits (max 10 per call)
// Organization Enrichment: costs credits
// Organization Search: costs credits

import { normalizeName, jaroWinklerSimilarity } from "./entity-resolver";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function getHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": process.env.APOLLO_API_KEY!,
  };
}

async function apolloFetch(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`[APOLLO] Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`[APOLLO] Network error, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("[APOLLO] Max retries exceeded");
}

// ============================================================
// People Enrichment (costs credits)
// ============================================================
export interface ApolloPersonResult {
  source: "apollo";
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  personalEmails: string[];
  phone: string | null;
  phones: string[];
  linkedinUrl: string | null;
  photoUrl: string | null;
  company: string | null;
  companyWebsite: string | null;
  companyIndustry: string | null;
  companySize: number | null;
  companyRevenue: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  seniority: string | null;
  departments: string[];
}

export async function apolloEnrichPerson(
  name: string,
  location?: string,
  domain?: string,
  email?: string,
): Promise<ApolloPersonResult | null> {
  if (!process.env.APOLLO_API_KEY) return null;

  const [firstName, ...lastParts] = name.trim().split(/\s+/);
  const lastName = lastParts.join(" ");
  if (!firstName || !lastName) {
    console.log("[APOLLO] Skipping enrichment — need first + last name:", name);
    return null;
  }

  const body: any = {
    first_name: firstName,
    last_name: lastName,
    city: location || "New York",
    state: "New York",
    country: "United States",
    reveal_personal_emails: true,
    reveal_phone_number: true,
  };
  if (domain) body.organization_name = domain;
  if (email) body.email = email;

  try {
    const res = await apolloFetch(APOLLO_BASE + "/people/match", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("[APOLLO] People enrichment failed:", res.status);
      return null;
    }

    const data = await res.json();
    const person = data.person;
    if (!person) {
      console.log("[APOLLO] No person match for:", name);
      return null;
    }

    const result: ApolloPersonResult = {
      source: "apollo",
      firstName: person.first_name || firstName,
      lastName: person.last_name || lastName,
      title: person.title || null,
      email: person.email || null,
      personalEmails: person.personal_emails || [],
      phone: person.phone_numbers?.[0]?.sanitized_number || person.organization?.primary_phone?.sanitized_number || null,
      phones: (person.phone_numbers || []).map((p: any) => p.sanitized_number).filter(Boolean),
      linkedinUrl: person.linkedin_url || null,
      photoUrl: person.photo_url || null,
      company: person.organization?.name || null,
      companyWebsite: person.organization?.website_url || null,
      companyIndustry: person.organization?.industry || null,
      companySize: person.organization?.estimated_num_employees || null,
      companyRevenue: person.organization?.annual_revenue_printed || null,
      companyPhone: person.organization?.primary_phone?.sanitized_number || null,
      companyAddress: person.organization?.raw_address || null,
      city: person.city || null,
      state: person.state || null,
      country: person.country || null,
      seniority: person.seniority || null,
      departments: person.departments || [],
    };

    console.log(`[APOLLO] Enriched: ${name} | Phone: ${result.phone ? "found" : "none"} | Email: ${result.email ? "found" : "none"} | Title: ${result.title || "none"}`);
    return result;
  } catch (err) {
    console.error("[APOLLO] People enrichment error:", err);
    return null;
  }
}

// ============================================================
// Organization Search + Enrichment (costs credits)
// ============================================================
export interface ApolloOrgResult {
  source: "apollo_org";
  name: string;
  website: string | null;
  industry: string | null;
  subIndustry: string | null;
  employeeCount: number | null;
  revenue: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  foundedYear: number | null;
  shortDescription: string | null;
  seoDescription: string | null;
}

/**
 * Check if an Apollo org result is relevant to the queried company name.
 * Uses both Jaro-Winkler similarity on normalized names and word overlap.
 * Returns true if the result is likely the same organization.
 */
function isOrgResultRelevant(queryName: string, resultName: string): boolean {
  const normQuery = normalizeName(queryName);
  const normResult = normalizeName(resultName);
  if (!normQuery || !normResult) return false;

  // Jaro-Winkler similarity on normalized names
  const jwSim = jaroWinklerSimilarity(normQuery, normResult);
  if (jwSim >= 0.75) return true;

  // Word overlap check — if significant words overlap, it's likely related
  const queryWords = new Set(normQuery.split(/\s+/).filter(w => w.length > 2));
  const resultWords = new Set(normResult.split(/\s+/).filter(w => w.length > 2));
  if (queryWords.size === 0) return false;

  let overlap = 0;
  for (const word of queryWords) {
    if (resultWords.has(word)) overlap++;
  }
  const overlapRatio = overlap / queryWords.size;
  if (overlapRatio >= 0.5) return true;

  // Check if result name contains the query or vice versa
  if (normResult.includes(normQuery) || normQuery.includes(normResult)) return true;

  return false;
}

export async function apolloEnrichOrganization(companyName: string): Promise<ApolloOrgResult | null> {
  if (!process.env.APOLLO_API_KEY) return null;
  if (!companyName || companyName.trim().length < 3) return null;

  try {
    const res = await apolloFetch(APOLLO_BASE + "/mixed_companies/search", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        organization_name: companyName,
        organization_locations: ["New York, New York, United States"],
        per_page: 3,
      }),
    });

    if (!res.ok) {
      console.error("[APOLLO] Org search failed:", res.status);
      return null;
    }

    const data = await res.json();
    const orgs = [...(data.organizations || []), ...(data.accounts || [])];
    if (orgs.length === 0) {
      console.log("[APOLLO] No org match for:", companyName);
      return null;
    }

    // Find the best matching org — validate relevance before accepting
    const matchingOrg = orgs.find((org: any) => {
      const orgName = org.name || "";
      return isOrgResultRelevant(companyName, orgName);
    });

    if (!matchingOrg) {
      console.log(`[APOLLO] Org results not relevant to "${companyName}". Top result: "${orgs[0]?.name}". Discarding.`);
      return null;
    }

    const result: ApolloOrgResult = {
      source: "apollo_org",
      name: matchingOrg.name || companyName,
      website: matchingOrg.website_url || null,
      industry: matchingOrg.industry || null,
      subIndustry: matchingOrg.sub_industry || null,
      employeeCount: matchingOrg.estimated_num_employees || null,
      revenue: matchingOrg.annual_revenue_printed || null,
      phone: matchingOrg.primary_phone?.sanitized_number || null,
      address: matchingOrg.raw_address || null,
      city: matchingOrg.city || null,
      state: matchingOrg.state || null,
      linkedinUrl: matchingOrg.linkedin_url || null,
      logoUrl: matchingOrg.logo_url || null,
      foundedYear: matchingOrg.founded_year || null,
      shortDescription: matchingOrg.short_description || null,
      seoDescription: matchingOrg.seo_description || null,
    };

    console.log(`[APOLLO] Org enriched: ${result.name} | Industry: ${result.industry || "none"} | Employees: ${result.employeeCount || "?"} | Phone: ${result.phone ? "found" : "none"}`);
    return result;
  } catch (err) {
    console.error("[APOLLO] Org enrichment error:", err);
    return null;
  }
}

// ============================================================
// People Search at Organization (FREE — no credits)
// ============================================================
export interface ApolloSearchPerson {
  apolloId: string;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  email: string | null;
  phone: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  orgName: string | null;
}

export async function apolloFindPeopleAtOrg(orgName: string): Promise<ApolloSearchPerson[]> {
  if (!process.env.APOLLO_API_KEY) return [];

  try {
    const res = await apolloFetch(APOLLO_BASE + "/mixed_people/search", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        organization_name: [orgName],
        person_titles: [
          "Owner", "Principal", "CEO", "Property Manager",
          "Managing Director", "VP Operations", "Leasing Director",
        ],
        person_locations: ["New York, New York, United States"],
        per_page: 5,
      }),
    });

    if (!res.ok) {
      console.error("[APOLLO] People search failed:", res.status);
      return [];
    }

    const data = await res.json();
    const people = (data.people || []).map((p: any) => ({
      apolloId: p.id,
      firstName: p.first_name || "",
      lastName: p.last_name || "",
      title: p.title || null,
      seniority: p.seniority || null,
      email: p.email || null,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      hasEmail: !!p.email || p.email_status === "verified",
      hasPhone: p.phone_numbers?.length > 0,
      orgName: p.organization?.name || null,
    }));

    console.log(`[APOLLO] Found ${people.length} people at ${orgName}`);
    return people;
  } catch (err) {
    console.error("[APOLLO] People search error:", err);
    return [];
  }
}

// ============================================================
// People Search — Broader (no title filter, more results)
// ============================================================
export async function apolloFindMorePeopleAtOrg(orgName: string): Promise<ApolloSearchPerson[]> {
  if (!process.env.APOLLO_API_KEY) return [];

  try {
    const res = await apolloFetch(APOLLO_BASE + "/mixed_people/search", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        organization_name: [orgName],
        person_locations: ["New York, New York, United States"],
        per_page: 10,
      }),
    });

    if (!res.ok) {
      console.error("[APOLLO] Broader people search failed:", res.status);
      return [];
    }

    const data = await res.json();
    const people = (data.people || []).map((p: any) => ({
      apolloId: p.id,
      firstName: p.first_name || "",
      lastName: p.last_name || "",
      title: p.title || null,
      seniority: p.seniority || null,
      email: p.email || null,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      hasEmail: !!p.email || p.email_status === "verified",
      hasPhone: p.phone_numbers?.length > 0,
      orgName: p.organization?.name || null,
    }));

    console.log(`[APOLLO] Broader search found ${people.length} people at ${orgName}`);
    return people;
  } catch (err) {
    console.error("[APOLLO] Broader people search error:", err);
    return [];
  }
}

// ============================================================
// Bulk People Enrichment (costs credits, max 10 per call)
// ============================================================
export interface ApolloBulkMatch {
  firstName: string;
  lastName: string;
  email: string | null;
  personalEmails: string[];
  phone: string | null;
  phones: string[];
  title: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  company: string | null;
  seniority: string | null;
}

export async function apolloBulkEnrich(
  details: { id?: string; first_name?: string; last_name?: string; email?: string; organization_name?: string }[],
): Promise<ApolloBulkMatch[]> {
  if (!process.env.APOLLO_API_KEY || details.length === 0) return [];

  const batch = details.slice(0, 10);
  try {
    const res = await apolloFetch(APOLLO_BASE + "/people/bulk_match", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        reveal_personal_emails: true,
        reveal_phone_number: true,
        details: batch,
      }),
    });

    if (!res.ok) {
      console.error("[APOLLO] Bulk enrichment failed:", res.status);
      return [];
    }

    const data = await res.json();
    const matches: ApolloBulkMatch[] = (data.matches || []).filter(Boolean).map((p: any) => ({
      firstName: p.first_name || "",
      lastName: p.last_name || "",
      email: p.email || null,
      personalEmails: p.personal_emails || [],
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      phones: (p.phone_numbers || []).map((ph: any) => ph.sanitized_number).filter(Boolean),
      title: p.title || null,
      linkedinUrl: p.linkedin_url || null,
      photoUrl: p.photo_url || null,
      company: p.organization?.name || null,
      seniority: p.seniority || null,
    }));

    console.log(`[APOLLO] Bulk enriched: ${matches.length}/${batch.length} matches`);
    return matches;
  } catch (err) {
    console.error("[APOLLO] Bulk enrichment error:", err);
    return [];
  }
}

// ============================================================
// Test Connection (uses People Search — FREE)
// ============================================================
export async function apolloTestConnection(): Promise<{ success: boolean; message: string }> {
  if (!process.env.APOLLO_API_KEY) return { success: false, message: "API key not configured" };

  try {
    const res = await fetch(APOLLO_BASE + "/mixed_people/search", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        person_titles: ["CEO"],
        person_locations: ["New York, New York, United States"],
        per_page: 1,
      }),
    });

    if (res.ok) return { success: true, message: "Connected (Organization Plan)" };
    if (res.status === 403) return { success: false, message: "Forbidden — check plan level" };
    return { success: false, message: `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

// ============================================================
// Merge Logic — combine PDL + Apollo enrichment data
// ============================================================
export async function deduplicateEmails(emails: (string | null | undefined)[]): Promise<string[]> {
  const seen = new Set<string>();
  return emails
    .filter((e): e is string => !!e && e.includes("@"))
    .filter(e => {
      const lower = e.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
}

export async function deduplicatePhones(phones: (string | null | undefined)[]): Promise<string[]> {
  const seen = new Set<string>();
  return phones
    .filter((p): p is string => !!p)
    .filter(p => {
      const clean = p.replace(/\D/g, "").slice(-10);
      if (clean.length < 7 || seen.has(clean)) return false;
      seen.add(clean);
      return true;
    });
}

export interface MergedEnrichment {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  emails: string[];
  phones: string[];
  linkedinUrl: string | null;
  photoUrl: string | null;
  seniority: string | null;
  departments: string[];
  companyIndustry: string | null;
  companySize: number | null;
  companyRevenue: string | null;
  companyWebsite: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  companyLinkedin: string | null;
  companyLogo: string | null;
  companyDescription: string | null;
  companyFoundedYear: number | null;
  dataSources: string[];
}

export async function mergeEnrichmentData(
  pdl: any | null,
  apollo: ApolloPersonResult | null,
  apolloOrg: ApolloOrgResult | null,
): Promise<MergedEnrichment> {
  return {
    firstName: apollo?.firstName || pdl?.fullName?.split(" ")[0] || null,
    lastName: apollo?.lastName || pdl?.fullName?.split(" ").slice(1).join(" ") || null,
    title: apollo?.title || pdl?.jobTitle || null,
    company: apollo?.company || pdl?.jobCompany || null,

    emails: await deduplicateEmails([
      ...(pdl?.emails || []),
      apollo?.email,
      ...(apollo?.personalEmails || []),
    ]),

    phones: await deduplicatePhones([
      ...(pdl?.phones || []),
      ...(apollo?.phones || []),
      apolloOrg?.phone,
    ]),

    linkedinUrl: apollo?.linkedinUrl || pdl?.linkedin || null,
    photoUrl: apollo?.photoUrl || null,
    seniority: apollo?.seniority || null,
    departments: apollo?.departments || [],

    companyIndustry: apolloOrg?.industry || apollo?.companyIndustry || pdl?.industry || null,
    companySize: apolloOrg?.employeeCount || apollo?.companySize || null,
    companyRevenue: apolloOrg?.revenue || apollo?.companyRevenue || null,
    companyWebsite: apolloOrg?.website || apollo?.companyWebsite || null,
    companyPhone: apolloOrg?.phone || apollo?.companyPhone || null,
    companyAddress: apolloOrg?.address || apollo?.companyAddress || null,
    companyLinkedin: apolloOrg?.linkedinUrl || null,
    companyLogo: apolloOrg?.logoUrl || null,
    companyDescription: apolloOrg?.shortDescription || null,
    companyFoundedYear: apolloOrg?.foundedYear || null,

    dataSources: [
      pdl ? "pdl" : null,
      apollo ? "apollo" : null,
      apolloOrg ? "apollo_org" : null,
    ].filter(Boolean) as string[],
  };
}
