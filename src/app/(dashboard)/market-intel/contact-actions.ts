"use server";

import { runCachedEnrichmentPipeline } from "@/lib/contact-enrichment-pipeline";
import type { EnrichmentRequest, EnrichmentResult, ContactResult } from "@/lib/contact-enrichment-pipeline";

/**
 * Enriches building contacts using the waterfall pipeline.
 * Called from building-profile.tsx after ownership intelligence resolves.
 *
 * Priority: HPD (free) → Apollo (pierced person) → Apollo (owner) → PDL (fallback)
 * Results are cached 7 days by BBL + name to avoid burning API credits.
 */
export async function enrichBuildingContacts(
  bbl: string,
  ownerName: string,
  piercedPersonName?: string,
  entityName?: string,
  registeredAgentName?: string,
  registeredAgentAddress?: string,
  hpdContacts?: any[],
  propertyAddress?: string,
  borough?: string,
  piercingChain?: { fromEntity: string; toEntity: string; relationship: string }[],
): Promise<EnrichmentResult> {
  if (!ownerName || ownerName.length < 3) {
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

  const request: EnrichmentRequest = {
    ownerName,
    piercedPersonName: piercedPersonName || undefined,
    entityName: entityName || undefined,
    registeredAgentName: registeredAgentName || undefined,
    registeredAgentAddress: registeredAgentAddress || undefined,
    propertyAddress: propertyAddress || undefined,
    borough: borough || undefined,
    hpdContacts: hpdContacts || [],
    piercingChain: piercingChain || undefined,
  };

  const result = await runCachedEnrichmentPipeline(request);

  // Serialize for client (strip functions, etc.)
  return JSON.parse(JSON.stringify(result));
}
