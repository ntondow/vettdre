// ============================================================
// Contact Enrichment Pipeline
// Waterfall enrichment: HPD (free) → Apollo (credits) → PDL (credits)
// Stops early when high-confidence direct contact is found.
// Results cached for 7 days to avoid burning API credits.
// ============================================================

import { cacheManager } from "./cache-manager";
import { normalizeName, isEntityName, isPersonName } from "./entity-resolver";
import { apolloEnrichPerson } from "./apollo";
import type { ApolloPersonResult } from "./apollo";

// ============================================================
// Types
// ============================================================

export interface ScoredContact {
  value: string;
  type: "direct" | "work" | "office" | "generic" | "unknown";
  confidence: number;        // 0-100
  source: string;            // "apollo", "pdl", "hpd", "brave"
  sourceDetail?: string;     // more specific: "Apollo (verified email)", "HPD Owner", etc.
  lastVerified?: string;     // ISO date string
  isPrimary: boolean;
  confirmedBy?: string[];    // other sources that confirm this value
}

export interface ScoredAddress {
  value: string;
  type: "mailing" | "business" | "residential" | "registered_agent";
  confidence: number;
  source: string;
}

export interface ContactResult {
  name: string;
  emails: ScoredContact[];
  phones: ScoredContact[];
  addresses: ScoredAddress[];
  linkedIn?: string;
  title?: string;
  company?: string;
  photoUrl?: string;
  source: string;               // primary enrichment source that provided the most data
  enrichedAt: string;           // ISO date string
  piercingPath?: string;        // e.g. "184 KENT AVE LLC → John Smith (Registered Agent)"
  sourcesChecked: string[];     // which enrichment sources ran
  sourcesWithResults: string[]; // which returned data
}

export interface EnrichmentRequest {
  ownerName: string;
  piercedPersonName?: string;
  entityName?: string;
  registeredAgentName?: string;
  registeredAgentAddress?: string;
  propertyAddress?: string;
  borough?: string;
  hpdContacts?: any[];
  piercingChain?: { fromEntity: string; toEntity: string; relationship: string }[];
}

export interface EnrichmentResult {
  contacts: ContactResult[];
  primaryContact: ContactResult | null;
  totalPhones: number;
  totalEmails: number;
  bestPhoneConfidence: number;
  bestEmailConfidence: number;
  sourcesChecked: string[];
  fromCache: boolean;
}

// ============================================================
// Phone / Email helpers
// ============================================================

function cleanPhone(ph: string): string {
  return (ph || "").replace(/\D/g, "").slice(-10);
}

function isValidPhone(ph: string): boolean {
  const clean = cleanPhone(ph);
  return clean.length === 10 && !clean.startsWith("0") && !clean.startsWith("1");
}

function isValidEmail(em: string): boolean {
  return !!em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
}

// ============================================================
// Confidence scoring
// ============================================================

function scoreApolloEmail(email: string | null, isVerified: boolean): ScoredContact | null {
  if (!email || !isValidEmail(email)) return null;
  return {
    value: email.toLowerCase(),
    type: email.includes("gmail") || email.includes("yahoo") || email.includes("hotmail") || email.includes("aol") ? "direct" : "work",
    confidence: isVerified ? 90 : 70,
    source: "apollo",
    sourceDetail: isVerified ? "Apollo (verified)" : "Apollo",
    isPrimary: false,
  };
}

function scoreApolloPhone(phone: string | null, isDirectPhone: boolean): ScoredContact | null {
  if (!phone || !isValidPhone(phone)) return null;
  return {
    value: cleanPhone(phone),
    type: isDirectPhone ? "direct" : "work",
    confidence: isDirectPhone ? 75 : 55,
    source: "apollo",
    sourceDetail: isDirectPhone ? "Apollo (direct)" : "Apollo (corporate)",
    isPrimary: false,
  };
}

function scorePdlEmail(email: string): ScoredContact | null {
  if (!email || !isValidEmail(email)) return null;
  return {
    value: email.toLowerCase(),
    type: email.includes("gmail") || email.includes("yahoo") || email.includes("hotmail") || email.includes("aol") ? "direct" : "work",
    confidence: 65,
    source: "pdl",
    sourceDetail: "People Data Labs",
    isPrimary: false,
  };
}

function scorePdlPhone(phone: string, phoneType: string): ScoredContact | null {
  if (!phone || !isValidPhone(phone)) return null;
  const isMobile = phoneType.toLowerCase().includes("mobile");
  return {
    value: cleanPhone(phone),
    type: isMobile ? "direct" : "unknown",
    confidence: isMobile ? 70 : 45,
    source: "pdl",
    sourceDetail: `PDL (${phoneType || "phone"})`,
    isPrimary: false,
  };
}

function scoreHpdPhone(phone: string, contactType: string): ScoredContact | null {
  if (!phone || !isValidPhone(phone)) return null;
  const isOwnerType = contactType.includes("Owner") || contactType.includes("Head");
  return {
    value: cleanPhone(phone),
    type: "office",
    confidence: isOwnerType ? 60 : 45,
    source: "hpd",
    sourceDetail: isOwnerType ? "HPD (owner)" : "HPD (agent)",
    isPrimary: false,
  };
}

// ============================================================
// Deduplication — merge same phone/email from multiple sources
// ============================================================

function deduplicateContacts(contacts: ScoredContact[]): ScoredContact[] {
  const map = new Map<string, ScoredContact>();

  for (const c of contacts) {
    const key = c.source === "apollo" || c.source === "pdl"
      ? c.value.toLowerCase()
      : cleanPhone(c.value) || c.value.toLowerCase();

    const normalizedKey = key.replace(/\D/g, "").length >= 7 ? key.replace(/\D/g, "").slice(-10) : key;

    if (map.has(normalizedKey)) {
      const existing = map.get(normalizedKey)!;
      // Merge: take highest confidence, note confirmed sources
      if (!existing.confirmedBy) existing.confirmedBy = [existing.source];
      if (!existing.confirmedBy.includes(c.source)) existing.confirmedBy.push(c.source);
      if (c.confidence > existing.confidence) {
        existing.confidence = c.confidence;
        existing.type = c.type;
        existing.source = c.source;
        existing.sourceDetail = c.sourceDetail;
      }
      // Confirmed by multiple sources → confidence boost (cap at 95)
      existing.confidence = Math.min(95, existing.confidence + 5);
    } else {
      map.set(normalizedKey, { ...c });
    }
  }

  const result = Array.from(map.values());
  result.sort((a, b) => b.confidence - a.confidence);

  // Mark the best one as primary
  if (result.length > 0) result[0].isPrimary = true;

  return result;
}

// ============================================================
// HPD Contact Extraction (free, already fetched)
// ============================================================

function extractHpdContacts(hpdContacts: any[]): {
  phones: ScoredContact[];
  addresses: ScoredAddress[];
  names: { name: string; type: string; phone?: string }[];
} {
  const phones: ScoredContact[] = [];
  const addresses: ScoredAddress[] = [];
  const names: { name: string; type: string; phone?: string }[] = [];

  if (!Array.isArray(hpdContacts)) return { phones, addresses, names };

  for (const c of hpdContacts) {
    const contactType = c.type || c.contactDescription || "";
    const name = c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" ");

    if (name) {
      names.push({ name, type: contactType, phone: undefined });
    }

    // HPD doesn't typically have phone numbers directly, but ownerContacts from fusion engine do
    // The phone extraction happens through the rankedContacts/ownerContacts path in building-profile-actions.ts

    // Extract addresses
    if (c.businessAddress || c.businessCity) {
      const addr = [c.businessAddress, c.businessCity, c.businessState, c.businessZip].filter(Boolean).join(", ");
      if (addr.length > 5) {
        const isOwner = contactType.includes("Owner") || contactType.includes("Head");
        addresses.push({
          value: addr,
          type: isOwner ? "business" : "mailing",
          confidence: isOwner ? 70 : 50,
          source: "hpd",
        });
      }
    }
  }

  return { phones, addresses, names };
}

// ============================================================
// Apollo Enrichment Step
// ============================================================

async function enrichViaApollo(
  personName: string,
  companyContext?: string,
  addressContext?: string,
): Promise<{
  result: ApolloPersonResult | null;
  phones: ScoredContact[];
  emails: ScoredContact[];
  addresses: ScoredAddress[];
}> {
  const phones: ScoredContact[] = [];
  const emails: ScoredContact[] = [];
  const addresses: ScoredAddress[] = [];

  if (!personName || !isPersonName(personName)) {
    return { result: null, phones, emails, addresses };
  }

  try {
    const result = await apolloEnrichPerson(personName, addressContext || "New York", companyContext);
    if (!result) return { result: null, phones, emails, addresses };

    // Score emails
    const mainEmail = scoreApolloEmail(result.email, true);
    if (mainEmail) emails.push(mainEmail);
    for (const pe of result.personalEmails || []) {
      const scored = scoreApolloEmail(pe, false);
      if (scored) {
        scored.confidence = 65; // personal emails slightly lower
        scored.type = "direct";
        emails.push(scored);
      }
    }

    // Score phones — first phone is typically direct
    if (result.phones && result.phones.length > 0) {
      const directPhone = scoreApolloPhone(result.phones[0], true);
      if (directPhone) phones.push(directPhone);
      for (let i = 1; i < result.phones.length; i++) {
        const ph = scoreApolloPhone(result.phones[i], false);
        if (ph) phones.push(ph);
      }
    }
    // Company phone as fallback
    if (result.companyPhone) {
      const compPh = scoreApolloPhone(result.companyPhone, false);
      if (compPh) {
        compPh.type = "work";
        compPh.confidence = 50;
        compPh.sourceDetail = "Apollo (company)";
        phones.push(compPh);
      }
    }

    // Address from Apollo
    if (result.companyAddress) {
      addresses.push({
        value: result.companyAddress,
        type: "business",
        confidence: 65,
        source: "apollo",
      });
    }

    return { result, phones, emails, addresses };
  } catch (err) {
    console.error("[ContactPipeline] Apollo enrichment error:", err);
    return { result: null, phones, emails, addresses };
  }
}

// ============================================================
// PDL Enrichment Step
// ============================================================

async function enrichViaPdl(
  personName: string,
  address?: string,
  borough?: string,
): Promise<{
  phones: ScoredContact[];
  emails: ScoredContact[];
  addresses: ScoredAddress[];
  title?: string;
  company?: string;
  linkedIn?: string;
}> {
  const phones: ScoredContact[] = [];
  const emails: ScoredContact[] = [];
  const addresses: ScoredAddress[] = [];

  if (!personName || !isPersonName(personName) || isEntityName(personName)) {
    return { phones, emails, addresses };
  }

  try {
    // Dynamic import to avoid circular dependencies (tracerfy is a server action file)
    const { skipTrace } = await import("@/app/(dashboard)/market-intel/tracerfy");

    const city = borough || "New York";
    const result = await skipTrace(personName, address || "", city, "NY", "");

    if ("error" in result) {
      return { phones, emails, addresses };
    }

    // Score phones
    for (const ph of result.phones || []) {
      const scored = scorePdlPhone(ph.number, ph.type);
      if (scored) phones.push(scored);
    }

    // Score emails
    for (const em of result.emails || []) {
      const scored = scorePdlEmail(em);
      if (scored) emails.push(scored);
    }

    // Mailing address
    if (result.mailingAddress) {
      addresses.push({
        value: result.mailingAddress,
        type: "residential",
        confidence: 70,
        source: "pdl",
      });
    }

    return {
      phones,
      emails,
      addresses,
      title: result.jobTitle || undefined,
      company: result.jobCompany || undefined,
      linkedIn: result.linkedin || undefined,
    };
  } catch (err) {
    console.error("[ContactPipeline] PDL enrichment error:", err);
    return { phones, emails, addresses };
  }
}

// ============================================================
// Main Pipeline — Waterfall enrichment
// ============================================================

export async function runEnrichmentPipeline(request: EnrichmentRequest): Promise<EnrichmentResult> {
  const sourcesChecked: string[] = [];
  const sourcesWithResults: string[] = [];
  const allPhones: ScoredContact[] = [];
  const allEmails: ScoredContact[] = [];
  const allAddresses: ScoredAddress[] = [];
  let title: string | undefined;
  let company: string | undefined;
  let linkedIn: string | undefined;
  let photoUrl: string | undefined;
  let apolloResult: ApolloPersonResult | null = null;
  const enrichedAt = new Date().toISOString();

  // Build piercing path string for UI context
  let piercingPath: string | undefined;
  if (request.piercingChain && request.piercingChain.length > 0 && request.piercedPersonName) {
    const chain = request.piercingChain;
    piercingPath = chain[0].fromEntity + " → " + request.piercedPersonName + " (" + chain[chain.length - 1].relationship + ")";
  }

  // Determine primary search name — pierced person is highest priority
  const primaryName = request.piercedPersonName || (isPersonName(request.ownerName) ? request.ownerName : undefined);

  // ---- Step 1: HPD Contacts (free, already fetched) ----
  sourcesChecked.push("HPD");
  const hpd = extractHpdContacts(request.hpdContacts || []);
  if (hpd.phones.length > 0 || hpd.addresses.length > 0) {
    sourcesWithResults.push("HPD");
    allPhones.push(...hpd.phones);
    allAddresses.push(...hpd.addresses);
  }

  // Also extract phones from ownerContacts if passed via hpdContacts
  if (request.hpdContacts) {
    for (const c of request.hpdContacts) {
      // ownerContacts from fusion engine have phone field
      if (c.phone && isValidPhone(c.phone)) {
        const contactType = c.type || c.contactDescription || c.source || "";
        const scored = scoreHpdPhone(c.phone, contactType);
        if (scored) {
          allPhones.push(scored);
          if (!sourcesWithResults.includes("HPD")) sourcesWithResults.push("HPD");
        }
      }
    }
  }

  // Registered agent address from ownership piercing
  if (request.registeredAgentAddress) {
    allAddresses.push({
      value: request.registeredAgentAddress,
      type: "registered_agent",
      confidence: 60,
      source: "ny_dos",
    });
  }

  // Check if we already have high-confidence direct contact
  const hasGoodPhone = () => allPhones.some(p => p.confidence >= 70 && (p.type === "direct" || p.type === "work"));
  const hasGoodEmail = () => allEmails.some(e => e.confidence >= 70);

  // ---- Step 2: Apollo — Pierced Person (highest value) ----
  if (request.piercedPersonName && isPersonName(request.piercedPersonName)) {
    sourcesChecked.push("Apollo");
    const apollo = await enrichViaApollo(
      request.piercedPersonName,
      request.entityName,
      request.propertyAddress,
    );
    if (apollo.result) {
      apolloResult = apollo.result;
      sourcesWithResults.push("Apollo");
      allPhones.push(...apollo.phones);
      allEmails.push(...apollo.emails);
      allAddresses.push(...apollo.addresses);
      title = apollo.result.title || undefined;
      company = apollo.result.company || undefined;
      linkedIn = apollo.result.linkedinUrl || undefined;
      photoUrl = apollo.result.photoUrl || undefined;
    }

    // If we have both good phone + good email, we can stop
    if (hasGoodPhone() && hasGoodEmail()) {
      return buildResult(request, primaryName, allPhones, allEmails, allAddresses, title, company, linkedIn, photoUrl, piercingPath, sourcesChecked, sourcesWithResults, enrichedAt, false);
    }
  }

  // ---- Step 3: Apollo — Owner Name (if person, not entity) ----
  if (!apolloResult && isPersonName(request.ownerName) && !isEntityName(request.ownerName)) {
    if (!sourcesChecked.includes("Apollo")) sourcesChecked.push("Apollo");
    const apollo = await enrichViaApollo(request.ownerName, undefined, request.propertyAddress);
    if (apollo.result) {
      apolloResult = apollo.result;
      if (!sourcesWithResults.includes("Apollo")) sourcesWithResults.push("Apollo");
      allPhones.push(...apollo.phones);
      allEmails.push(...apollo.emails);
      allAddresses.push(...apollo.addresses);
      if (!title) title = apollo.result.title || undefined;
      if (!company) company = apollo.result.company || undefined;
      if (!linkedIn) linkedIn = apollo.result.linkedinUrl || undefined;
      if (!photoUrl) photoUrl = apollo.result.photoUrl || undefined;
    }

    if (hasGoodPhone() && hasGoodEmail()) {
      return buildResult(request, primaryName, allPhones, allEmails, allAddresses, title, company, linkedIn, photoUrl, piercingPath, sourcesChecked, sourcesWithResults, enrichedAt, false);
    }
  }

  // ---- Step 4: Apollo — Registered Agent (if person, not a service) ----
  if (!apolloResult && request.registeredAgentName && isPersonName(request.registeredAgentName) && !isEntityName(request.registeredAgentName)) {
    if (!sourcesChecked.includes("Apollo")) sourcesChecked.push("Apollo");
    const apollo = await enrichViaApollo(request.registeredAgentName, request.entityName);
    if (apollo.result) {
      apolloResult = apollo.result;
      if (!sourcesWithResults.includes("Apollo")) sourcesWithResults.push("Apollo");
      // Registered agent phones/emails have lower confidence (might be attorney, not owner)
      for (const p of apollo.phones) p.confidence = Math.round(p.confidence * 0.8);
      for (const e of apollo.emails) e.confidence = Math.round(e.confidence * 0.8);
      allPhones.push(...apollo.phones);
      allEmails.push(...apollo.emails);
      allAddresses.push(...apollo.addresses);
      if (!title) title = apollo.result.title || undefined;
      if (!company) company = apollo.result.company || undefined;
      if (!linkedIn) linkedIn = apollo.result.linkedinUrl || undefined;
    }

    if (hasGoodPhone() && hasGoodEmail()) {
      return buildResult(request, primaryName, allPhones, allEmails, allAddresses, title, company, linkedIn, photoUrl, piercingPath, sourcesChecked, sourcesWithResults, enrichedAt, false);
    }
  }

  // ---- Step 5: PDL — Pierced Person (fallback) ----
  if (request.piercedPersonName && isPersonName(request.piercedPersonName) && (!hasGoodPhone() || !hasGoodEmail())) {
    sourcesChecked.push("PDL");
    const pdl = await enrichViaPdl(request.piercedPersonName, request.propertyAddress, request.borough);
    if (pdl.phones.length > 0 || pdl.emails.length > 0) {
      sourcesWithResults.push("PDL");
      allPhones.push(...pdl.phones);
      allEmails.push(...pdl.emails);
      allAddresses.push(...pdl.addresses);
      if (!title) title = pdl.title;
      if (!company) company = pdl.company;
      if (!linkedIn) linkedIn = pdl.linkedIn;
    }

    if (hasGoodPhone() && hasGoodEmail()) {
      return buildResult(request, primaryName, allPhones, allEmails, allAddresses, title, company, linkedIn, photoUrl, piercingPath, sourcesChecked, sourcesWithResults, enrichedAt, false);
    }
  }

  // ---- Step 6: PDL — Owner Name (fallback) ----
  if (isPersonName(request.ownerName) && !isEntityName(request.ownerName) && request.ownerName !== request.piercedPersonName && (!hasGoodPhone() || !hasGoodEmail())) {
    if (!sourcesChecked.includes("PDL")) sourcesChecked.push("PDL");
    const pdl = await enrichViaPdl(request.ownerName, request.propertyAddress, request.borough);
    if (pdl.phones.length > 0 || pdl.emails.length > 0) {
      if (!sourcesWithResults.includes("PDL")) sourcesWithResults.push("PDL");
      allPhones.push(...pdl.phones);
      allEmails.push(...pdl.emails);
      allAddresses.push(...pdl.addresses);
      if (!title) title = pdl.title;
      if (!company) company = pdl.company;
      if (!linkedIn) linkedIn = pdl.linkedIn;
    }
  }

  return buildResult(request, primaryName, allPhones, allEmails, allAddresses, title, company, linkedIn, photoUrl, piercingPath, sourcesChecked, sourcesWithResults, enrichedAt, false);
}

// ============================================================
// Build final result with deduplication
// ============================================================

function buildResult(
  request: EnrichmentRequest,
  primaryName: string | undefined,
  allPhones: ScoredContact[],
  allEmails: ScoredContact[],
  allAddresses: ScoredAddress[],
  title: string | undefined,
  company: string | undefined,
  linkedIn: string | undefined,
  photoUrl: string | undefined,
  piercingPath: string | undefined,
  sourcesChecked: string[],
  sourcesWithResults: string[],
  enrichedAt: string,
  fromCache: boolean,
): EnrichmentResult {
  const dedupedPhones = deduplicateContacts(allPhones);
  const dedupedEmails = deduplicateContacts(allEmails);

  // Dedup addresses
  const addrMap = new Map<string, ScoredAddress>();
  for (const a of allAddresses) {
    const key = a.value.toUpperCase().replace(/\s+/g, " ").trim();
    if (!addrMap.has(key) || a.confidence > addrMap.get(key)!.confidence) {
      addrMap.set(key, a);
    }
  }
  const dedupedAddresses = Array.from(addrMap.values()).sort((a, b) => b.confidence - a.confidence);

  const displayName = primaryName || request.piercedPersonName || request.ownerName;

  const contact: ContactResult = {
    name: displayName,
    emails: dedupedEmails,
    phones: dedupedPhones,
    addresses: dedupedAddresses,
    linkedIn,
    title,
    company,
    photoUrl,
    source: sourcesWithResults[0] || "none",
    enrichedAt,
    piercingPath,
    sourcesChecked,
    sourcesWithResults,
  };

  return {
    contacts: [contact],
    primaryContact: contact,
    totalPhones: dedupedPhones.length,
    totalEmails: dedupedEmails.length,
    bestPhoneConfidence: dedupedPhones[0]?.confidence || 0,
    bestEmailConfidence: dedupedEmails[0]?.confidence || 0,
    sourcesChecked,
    fromCache,
  };
}

// ============================================================
// Cached Pipeline Entry Point
// ============================================================

export async function runCachedEnrichmentPipeline(request: EnrichmentRequest): Promise<EnrichmentResult> {
  // Build cache key from the most specific name available
  const nameForKey = request.piercedPersonName || request.ownerName;
  if (!nameForKey || nameForKey.length < 3) {
    return {
      contacts: [],
      primaryContact: null,
      totalPhones: 0,
      totalEmails: 0,
      bestPhoneConfidence: 0,
      bestEmailConfidence: 0,
      sourcesChecked: [],
      fromCache: false,
    };
  }

  const cacheKey = "contact:" + normalizeName(nameForKey);
  const cached = cacheManager.getSource(cacheKey, "CONTACT_ENRICHMENT") as EnrichmentResult | null;
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const result = await runEnrichmentPipeline(request);

  // Cache the result (7 days) — only if we found something
  if (result.totalPhones > 0 || result.totalEmails > 0) {
    cacheManager.setSource(cacheKey, "CONTACT_ENRICHMENT", result);
  }

  return result;
}
