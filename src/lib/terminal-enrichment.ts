/**
 * Terminal Event Enrichment Pipeline
 *
 * Takes raw TerminalEvent records and assembles structured data packages
 * by performing BBL-keyed lookups via the existing data-fusion-engine.
 * The enrichment package is later passed to AI synthesis (Prompt 4).
 *
 * REUSES: fetchBuildingCritical, fetchBuildingStandard, fetchBuildingBackground
 * from data-fusion-engine.ts — no duplicated NYC Open Data logic.
 */

import {
  fetchBuildingCritical,
  fetchBuildingStandard,
  fetchBuildingBackground,
} from "./data-fusion-engine";
import { searchComps } from "./comps-engine";
import { getNeighborhoodByZip } from "./neighborhoods";

// ── Types ─────────────────────────────────────────────────────

export interface EnrichmentPackage {
  event_core: {
    eventType: string;
    detectedAt: string;
    rawFields: Record<string, any>;
  };
  property_profile: {
    address: string;
    borough: string;
    neighborhood: string;
    ntaCode: string | null;
    zoningDistricts: string[];
    buildingClass: string;
    landUse: string;
    lotArea: number | null;
    buildingArea: number | null;
    residentialUnits: number | null;
    commercialUnits: number | null;
    floors: number | null;
    yearBuilt: number | null;
    ownerName: string | null;
    zipCode: string | null;
    builtFAR: number | null;
    maxFAR: number | null;
    unusedFAR: number | null;
    unusedSqFt: number | null;
  } | null;
  valuation_context: {
    dofMarketValue: number | null;
    dofAssessedValue: number | null;
    taxClass: string | null;
    recentComps: Array<{
      address: string;
      saleDate: string;
      salePrice: number;
      units: number | null;
      pricePerUnit: number | null;
      pricePerSqFt: number | null;
    }>;
    ntaMedianPricePerUnit: number | null;
    ntaMedianPricePerSqFt: number | null;
    ntaTransactionCount: number | null;
  } | null;
  violation_profile: {
    openHpdViolations: { classA: number; classB: number; classC: number; classI: number };
    openDobViolations: number;
    activeStopWorkOrders: number;
    ecbPenaltyBalance: number | null;
    hpdLitigationCount: number;
    isAepEnrolled: boolean;
  } | null;
  permit_history: {
    activePermits: Array<{
      jobType: string;
      workType: string;
      estimatedCost: number | null;
      filingDate: string;
      status: string;
    }>;
    recentCOs: number;
  } | null;
  ownership_chain: {
    deedHistory: Array<{
      documentId: string;
      docType: string;
      recordedDate: string;
      amount: number | null;
      buyerName: string | null;
      sellerName: string | null;
    }>;
    holdPeriodYears: number | null;
    acquisitionPrice: number | null;
    currentOwnerLLC: string | null;
    dosRegisteredAgent: string | null;
  } | null;
  portfolio_intel: {
    otherProperties: Array<{
      bbl: string;
      address: string;
      recentActivity: string | null;
    }>;
  } | null;
}

// ── Borough Names ─────────────────────────────────────────────

const BORO_NAMES: Record<number, string> = {
  1: "Manhattan", 2: "Bronx", 3: "Brooklyn", 4: "Queens", 5: "Staten Island",
};

// ── Main Enrichment Function ──────────────────────────────────

interface TerminalEventInput {
  id: string;
  eventType: string;
  bbl: string;
  borough: number;
  tier: number;
  detectedAt: Date;
  metadata: any;
}

/**
 * Enrich a TerminalEvent by assembling BBL-keyed data from NYC Open Data.
 * Pure function — returns the package, caller handles DB writes.
 *
 * Tier 1: Full enrichment (property + violations + permits + ownership + comps)
 * Tier 2: Partial (property + violations + permits)
 * Tier 3: No enrichment (returns minimal package)
 */
export async function enrichTerminalEvent(
  event: TerminalEventInput,
): Promise<{ enrichmentPackage: EnrichmentPackage; ntaCode: string | null }> {
  const { eventType, bbl, borough, tier, detectedAt, metadata } = event;

  // Event core — always present
  const event_core: EnrichmentPackage["event_core"] = {
    eventType,
    detectedAt: detectedAt.toISOString(),
    rawFields: extractRawFields(eventType, metadata),
  };

  // Tier 3: minimal enrichment
  if (tier >= 3) {
    return {
      enrichmentPackage: {
        event_core,
        property_profile: null,
        valuation_context: null,
        violation_profile: null,
        permit_history: null,
        ownership_chain: null,
        portfolio_intel: null,
      },
      ntaCode: null,
    };
  }

  // Phase 1: Critical data (PLUTO + HPD violations + registrations)
  let property_profile: EnrichmentPackage["property_profile"] = null;
  let violation_profile: EnrichmentPackage["violation_profile"] = null;
  let ntaCode: string | null = null;

  try {
    const critical = await fetchBuildingCritical(bbl);

    if (critical.pluto) {
      const p = critical.pluto;
      const builtFAR = p.builtFAR || 0;
      const maxFAR = Math.max(p.residFAR || 0, p.commFAR || 0, p.facilFAR || 0);
      const unusedFAR = maxFAR > 0 ? Math.max(0, maxFAR - builtFAR) : null;
      const lotArea = p.lotArea || 0;

      // Resolve NTA from zip code
      let neighborhoodName = "";
      if (p.zipCode) {
        const nh = getNeighborhoodByZip(p.zipCode);
        ntaCode = nh?.ntaCode || null;
        neighborhoodName = nh?.name || "";
      }

      property_profile = {
        address: p.address || "",
        borough: BORO_NAMES[borough] || "",
        neighborhood: neighborhoodName,
        ntaCode,
        zoningDistricts: [p.zoneDist1, p.zoneDist2].filter(Boolean),
        buildingClass: p.bldgClass || "",
        landUse: p.landUse || "",
        lotArea: lotArea || null,
        buildingArea: p.bldgArea || null,
        residentialUnits: p.unitsRes || null,
        commercialUnits: (p.unitsTot || 0) - (p.unitsRes || 0) || null,
        floors: p.numFloors || null,
        yearBuilt: p.yearBuilt || null,
        ownerName: p.ownerName || null,
        zipCode: p.zipCode || null,
        builtFAR: builtFAR || null,
        maxFAR: maxFAR || null,
        unusedFAR,
        unusedSqFt: unusedFAR != null && lotArea ? Math.round(unusedFAR * lotArea) : null,
      };
    }

    // Violation profile from critical data
    const vs = critical.violationSummary;
    violation_profile = {
      openHpdViolations: {
        classA: vs.classA,
        classB: vs.classB,
        classC: vs.classC,
        classI: critical.violations.filter((v: any) => v.class === "I").length,
      },
      openDobViolations: 0, // Filled in Phase 2
      activeStopWorkOrders: 0, // Filled in Phase 2
      ecbPenaltyBalance: null, // Filled in Phase 2
      hpdLitigationCount: 0, // Filled in Phase 2
      isAepEnrolled: false,
    };
  } catch (err) {
    console.error(`[Terminal Enrichment] Phase 1 failed for bbl=${bbl}:`, err);
  }

  // Phase 2: Standard data (DOB permits, complaints, litigation, ECB, sales)
  let permit_history: EnrichmentPackage["permit_history"] = null;
  let valuation_context: EnrichmentPackage["valuation_context"] = null;

  try {
    const standard = await fetchBuildingStandard(bbl);

    // Permits (processed fields from data-fusion-engine: permitType, permitStatus, filingDate, jobDescription, ownerName)
    permit_history = {
      activePermits: standard.permits
        .filter((p: any) => p.permitStatus !== "WITHDRAWN" && p.permitStatus !== "DISAPPROVED")
        .slice(0, 10)
        .map((p: any) => ({
          jobType: p.permitType || "",
          workType: p.jobDescription || "",
          estimatedCost: null, // Not in processed permit object
          filingDate: p.filingDate || "",
          status: p.permitStatus || "",
        })),
      recentCOs: standard.dobFilings.filter((f: any) =>
        (f.jobType || "").toUpperCase().includes("CO"),
      ).length,
    };

    // Update violation profile with ECB + litigation data
    if (violation_profile) {
      violation_profile.openDobViolations = standard.ecbSummary.active;
      violation_profile.activeStopWorkOrders = standard.ecbViolations.filter((v: any) =>
        (v.violationType || "").toUpperCase().includes("SWO"),
      ).length;
      violation_profile.ecbPenaltyBalance = standard.ecbSummary.totalPenalty || null;
      violation_profile.hpdLitigationCount = standard.litigationSummary.total;
    }

    // Valuation context (from rolling sales — processed fields: price, date, units, sqft)
    const recentSales = standard.rollingSales
      .filter((s: any) => s.price > 1000)
      .slice(0, 5);

    valuation_context = {
      dofMarketValue: null,
      dofAssessedValue: null,
      taxClass: null,
      recentComps: recentSales.map((s: any) => ({
        address: "", // Rolling sales from fusion engine don't include address
        saleDate: s.date || "",
        salePrice: s.price || 0,
        units: s.units || null,
        pricePerUnit: s.units > 0 ? Math.round(s.price / s.units) : null,
        pricePerSqFt: s.sqft > 0 ? Math.round(s.price / s.sqft) : null,
      })),
      ntaMedianPricePerUnit: null,
      ntaMedianPricePerSqFt: null,
      ntaTransactionCount: null,
    };

    // Tier 1 only: fetch real comps
    if (tier === 1 && property_profile) {
      try {
        const zip = property_profile.zipCode;
        if (zip) {
          const boroCode = String(event.borough);
          const compResult = await searchComps({
            zip,
            borough: boroCode,
            minUnits: property_profile.residentialUnits
              ? Math.max(1, Math.floor(property_profile.residentialUnits * 0.5))
              : undefined,
          });
          valuation_context.recentComps = compResult.comps.slice(0, 5).map(c => ({
            address: c.address,
            saleDate: c.saleDate,
            salePrice: c.salePrice,
            units: c.totalUnits ?? null,
            pricePerUnit: c.pricePerUnit ?? null,
            pricePerSqFt: c.pricePerSqft ?? null,
          }));
          valuation_context.ntaMedianPricePerUnit = compResult.summary.medianPricePerUnit ?? null;
          valuation_context.ntaMedianPricePerSqFt = compResult.summary.medianPricePerSqft ?? null;
          valuation_context.ntaTransactionCount = compResult.summary.count ?? null;
        }
      } catch {
        // Comps are optional — continue without
      }
    }
  } catch (err) {
    console.error(`[Terminal Enrichment] Phase 2 failed for bbl=${bbl}:`, err);
  }

  // Phase 3 (Tier 1 only): Ownership chain
  let ownership_chain: EnrichmentPackage["ownership_chain"] = null;
  let portfolio_intel: EnrichmentPackage["portfolio_intel"] = null;

  if (tier === 1) {
    try {
      const bg = await fetchBuildingBackground(bbl);

      // Build deed history from metadata if ACRIS event
      const rawMetadata = metadata || {};
      const parties = rawMetadata._parties || [];
      const buyers = parties.filter((p: any) => String(p.type) === "2").map((p: any) => p.name).filter(Boolean);
      const sellers = parties.filter((p: any) => String(p.type) === "1").map((p: any) => p.name).filter(Boolean);

      ownership_chain = {
        deedHistory: rawMetadata.document_id
          ? [{
              documentId: rawMetadata.document_id,
              docType: rawMetadata.doc_type || "",
              recordedDate: rawMetadata.good_through_date || rawMetadata.recorded_datetime || "",
              amount: rawMetadata.doc_amount ? parseFloat(rawMetadata.doc_amount) : null,
              buyerName: buyers[0] || null,
              sellerName: sellers[0] || null,
            }]
          : [],
        holdPeriodYears: null,
        acquisitionPrice: null,
        currentOwnerLLC: property_profile?.ownerName || null,
        dosRegisteredAgent: bg.speculation?.[0]?.process_name || null,
      };

      // Portfolio intel is expensive — just reference other properties from PLUTO owner
      portfolio_intel = { otherProperties: [] };
    } catch (err) {
      console.error(`[Terminal Enrichment] Phase 3 failed for bbl=${bbl}:`, err);
    }
  }

  return {
    enrichmentPackage: {
      event_core,
      property_profile,
      valuation_context,
      violation_profile,
      permit_history,
      ownership_chain,
      portfolio_intel,
    },
    ntaCode,
  };
}

// ── Raw Field Extraction ──────────────────────────────────────

/**
 * Extract key human-readable fields from the raw metadata based on event type.
 * These become the "headline" fields in the AI brief.
 */
function extractRawFields(eventType: string, metadata: any): Record<string, any> {
  if (!metadata) return {};
  switch (eventType) {
    case "SALE_RECORDED":
      return {
        documentId: metadata.document_id,
        docType: metadata.doc_type,
        amount: metadata.doc_amount,
        recordedDate: metadata.good_through_date || metadata.recorded_datetime,
        buyers: (metadata._parties || []).filter((p: any) => String(p.type) === "2").map((p: any) => p.name),
        sellers: (metadata._parties || []).filter((p: any) => String(p.type) === "1").map((p: any) => p.name),
      };
    case "LOAN_RECORDED":
      return {
        documentId: metadata.document_id,
        docType: metadata.doc_type,
        amount: metadata.doc_amount,
        recordedDate: metadata.good_through_date,
        parties: (metadata._parties || []).map((p: any) => ({ name: p.name, type: p.type })),
      };
    case "NEW_BUILDING_PERMIT":
    case "MAJOR_ALTERATION":
      return {
        jobNumber: metadata.job__ || metadata.job_filing_number,
        jobType: metadata.job_type,
        jobDescription: metadata.job_description || metadata.job_type_desc,
        estimatedCost: metadata.estimated_job_cost,
        filingDate: metadata.filing_date || metadata.approved_date,
        ownerName: metadata.owner_s_business_name || metadata.owner_name,
      };
    case "HPD_VIOLATION":
      return {
        violationId: metadata.violationid,
        class: metadata.class || metadata.violationclass,
        inspectionDate: metadata.inspectiondate,
        description: metadata.novdescription,
        status: metadata.violationstatus || metadata.currentstatus,
      };
    case "DOB_STOP_WORK":
      return {
        violationNumber: metadata.isn_dob_bis_viol || metadata.violation_number,
        issueDate: metadata.issue_date,
        description: metadata.description || metadata.violation_type,
        disposition: metadata.disposition_comments,
      };
    case "ECB_HIGH_PENALTY":
      return {
        violationNumber: metadata.ecb_violation_number || metadata.isn_dob_bis_gid,
        violationDate: metadata.violation_date,
        penaltyAmount: metadata.penalty_balance_due || metadata.amount_paid,
        description: metadata.violation_description,
      };
    case "STALLED_SITE":
      return {
        jobNumber: metadata.job__,
        stalledDate: metadata.stalled_date || metadata.last_action_date,
        buildingType: metadata.building_type || metadata.occupancy_classification,
      };
    default:
      return { sourceRecordId: metadata.document_id || metadata.job__ || metadata.violationid || "unknown" };
  }
}
