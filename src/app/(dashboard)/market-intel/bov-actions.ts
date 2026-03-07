"use server";

// ============================================================
// BOV (Broker Opinion of Value) — Data Assembly Server Actions
// Aggregates property data from all available sources into a
// typed BovPayload ready for client-side PDF generation.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { checkFeatureAccess } from "@/lib/feature-gate-server";
import { fetchBuildingIntelligence } from "@/lib/data-fusion-engine";
import { fetchCompsWithValuation } from "./comps-actions";
import { deriveMarketCapRate } from "@/lib/cap-rate-engine";
import { getExpenseBenchmark, classifyBuildingCategory } from "@/lib/expense-benchmarks";
import { fetchNeighborhoodProfile } from "./neighborhood-actions";
import { getNeighborhoodNameByZip } from "@/lib/neighborhoods";
import type {
  BovPayload,
  BovBranding,
  BovBrokerInfo,
  BovPropertyData,
  BovOwnershipData,
  BovFinancialData,
  BovCompData,
  BovCompSummary,
  BovCapRateData,
  BovViolationSummary,
  BovPermitSummary,
  BovPermitItem,
  BovEnergyData,
  BovLitigationSummary,
  BovLitigationCase,
  BovNeighborhoodData,
  BovRentStabData,
  BovValuationEstimate,
  BovExpenseLineItem,
} from "@/lib/bov-types";

// ── Borough lookup ───────────────────────────────────────────

const BORO_NAMES: Record<string, string> = {
  "1": "Manhattan",
  "2": "Bronx",
  "3": "Brooklyn",
  "4": "Queens",
  "5": "Staten Island",
};

// ── Market rents by borough (monthly, avg 1BR) ──────────────

const AVG_MARKET_RENT_PER_UNIT: Record<string, number> = {
  Manhattan: 3500,
  Brooklyn: 2800,
  Queens: 2200,
  Bronx: 1700,
  "Staten Island": 1600,
};

// ── Main Assembly ────────────────────────────────────────────

export async function assembleBovData(
  bbl: string,
  options?: { includeComps?: boolean; includeAiAnalysis?: boolean }
): Promise<BovPayload> {
  const includeComps = options?.includeComps !== false;

  // ── Auth + user/org lookup ────────────────────────────────
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      organization: {
        include: { brandSettings: true },
      },
    },
  });
  if (!user) throw new Error("User not found");

  // ── Feature gate ────────────────────────────────────────
  const { allowed } = await checkFeatureAccess(user.id, "bov_generation");
  if (!allowed) throw new Error("Upgrade required: BOV generation requires a Pro plan or higher");

  const org = user.organization;
  const brand = org.brandSettings;

  // ── Build branding ────────────────────────────────────────
  const branding: BovBranding = {
    companyName: brand?.companyName || org.name || "Brokerage",
    logoUrl: brand?.logoUrl || org.logoUrl || null,
    primaryColor: brand?.primaryColor || "#1E40AF",
    accentColor: brand?.accentColor || "#6B5B95",
    address: org.address || "",
    phone: org.phone || "",
    email: user.email,
    website: org.website || null,
  };

  // ── Build broker info ─────────────────────────────────────
  const brokerInfo: BovBrokerInfo = {
    name: user.fullName || "Agent",
    title: user.title || null,
    phone: user.phone || "",
    email: user.email,
    licenseNumber: user.licenseNumber || null,
  };

  // ── Parse BBL ─────────────────────────────────────────────
  const boroCode = bbl[0];
  const borough = BORO_NAMES[boroCode] || "";

  // ── Parallel data fetch ───────────────────────────────────
  const [intelResult, compsResult, neighborhoodResult] = await Promise.allSettled([
    fetchBuildingIntelligence(bbl),
    includeComps ? fetchCompsWithValuation(bbl) : Promise.resolve(null),
    fetchNeighborhoodProfile(borough ? `${borough}, NY` : "New York, NY"),
  ]);

  const intel = intelResult.status === "fulfilled" ? intelResult.value : null;
  const compResult = compsResult.status === "fulfilled" ? compsResult.value : null;
  const neighborhoodProfile = neighborhoodResult.status === "fulfilled" ? neighborhoodResult.value : null;

  if (!intel) {
    throw new Error("Failed to load building data. Please try again.");
  }

  // ── Extract PLUTO data ────────────────────────────────────
  const raw = intel.raw || {};
  const p = raw.pluto || {};
  const units = parseInt(p.unitsres || p.unitstotal || "0") || 0;
  const sqft = parseInt(p.bldgarea || "0") || 0;
  const yearBuilt = parseInt(p.yearbuilt || "0") || 0;
  const stories = parseInt(p.numfloors || "0") || 0;
  const lotSqft = parseInt(p.lotarea || "0") || 0;
  const assessTotal = parseInt(p.assesstot || "0") || 0;
  const assessLand = parseInt(p.assessland || "0") || 0;
  const bldgClass = p.bldgclass || "";
  const zoneDist = p.zonedist1 || "";
  const builtFAR = parseFloat(p.builtfar || "0") || 0;
  const residFAR = parseFloat(p.residfar || "0") || 0;
  const zip = p.zipcode || "";
  const address = p.address || intel.address?.raw || "";
  const ownerName = p.ownername || "";
  const neighborhood = getNeighborhoodNameByZip(zip) || null;
  const unitsRes = parseInt(p.unitsres || "0") || 0;
  const unitsComm = Math.max(0, units - unitsRes);
  const hasElevator = stories > 5 || bldgClass.startsWith("D");

  // ── Property data ─────────────────────────────────────────
  const property: BovPropertyData = {
    address,
    bbl,
    borough,
    neighborhood,
    zip,
    buildingClass: bldgClass,
    buildingClassDescription: getBuildingClassDescription(bldgClass),
    stories,
    unitsTotal: units,
    unitsResidential: unitsRes,
    unitsCommercial: unitsComm,
    grossSqft: sqft,
    yearBuilt,
    lotSqft,
    builtFAR,
    maxFAR: residFAR || builtFAR,
    zoning: zoneDist,
    landmarkStatus: p.landmark || null,
    assessedLandValue: assessLand,
    assessedTotalValue: assessTotal,
    marketValue: intel.financials?.marketValue?.value || assessTotal * 4,
    taxClass: p.taxclass || null,
    ownerName,
    lastSalePrice: intel.financials?.lastSale?.price || null,
    lastSaleDate: intel.financials?.lastSale?.date || null,
  };

  // ── Ownership ─────────────────────────────────────────────
  let ownership: BovOwnershipData | null = null;
  try {
    const ow = intel.ownership;
    if (ow) {
      ownership = {
        registeredOwner: ow.registeredOwner || ownerName,
        managingAgent: ow.hpdRegistration?.managingAgent || null,
        aiOwnerAnalysis: ow.likelyOwner?.entityName || null,
        ownerConfidence: ow.confidence || null,
        entityType: ow.likelyOwner?.llcName ? "LLC/Corp" : "Individual",
        portfolioSize: ow.ownerPortfolio?.length || null,
      };
    }
  } catch { /* graceful */ }

  // ── Expense Benchmark ─────────────────────────────────────
  let financials: BovFinancialData | null = null;
  try {
    if (units > 0) {
      const benchmark = getExpenseBenchmark({
        yearBuilt,
        hasElevator,
        numFloors: stories,
        bldgClass,
        bldgArea: sqft,
        unitsRes: Math.max(1, unitsRes),
        borough,
        rentStabilizedUnits: intel.property?.rentStabilizedUnits?.value || 0,
      });

      const avgRent = AVG_MARKET_RENT_PER_UNIT[borough] || 2200;
      const grossIncome = unitsRes * avgRent * 12;
      const vacancyRate = 0.05;
      const egi = grossIncome * (1 - vacancyRate);
      const totalExpenses = benchmark.totalAnnual;
      const noi = egi - totalExpenses;

      const expenseLineItems: BovExpenseLineItem[] = benchmark.lineItems.map(li => ({
        label: li.label,
        perUnit: li.perUnit,
        totalAnnual: li.totalAnnual,
      }));

      const lastSalePrice = property.lastSalePrice;

      financials = {
        estimatedGrossIncome: grossIncome,
        vacancyRate,
        effectiveGrossIncome: egi,
        expenseCategory: benchmark.categoryLabel,
        expenseLineItems,
        totalExpenses,
        expensePerUnit: benchmark.totalPerUnit,
        expenseAdjustmentNotes: benchmark.adjustmentNotes,
        estimatedNOI: noi,
        expenseRatio: egi > 0 ? totalExpenses / egi : 0,
        pricePerUnit: lastSalePrice && units > 0 ? lastSalePrice / units : null,
        pricePerSqft: lastSalePrice && sqft > 0 ? lastSalePrice / sqft : null,
        grm: lastSalePrice && grossIncome > 0 ? lastSalePrice / grossIncome : null,
      };
    }
  } catch { /* graceful */ }

  // ── Comps ─────────────────────────────────────────────────
  let comps: BovCompData[] | null = null;
  let compSummary: BovCompSummary | null = null;

  try {
    if (compResult && compResult.comps && compResult.comps.length > 0) {
      const topComps = compResult.comps.slice(0, 8);
      comps = topComps.map(c => ({
        address: c.address || "",
        saleDate: c.saleDate || "",
        salePrice: c.salePrice || 0,
        pricePerUnit: c.pricePerUnit || 0,
        pricePerSqft: c.pricePerSqft || null,
        units: c.units || 0,
        sqft: c.sqft || null,
        estimatedCapRate: null,
        similarityScore: c.similarityScore || 0,
        distanceMiles: c.distanceMiles || 0,
      }));

      const prices = topComps.map(c => c.pricePerUnit || 0).filter(p => p > 0).sort((a, b) => a - b);
      const sqftPrices = topComps.map(c => c.pricePerSqft || 0).filter(p => p > 0).sort((a, b) => a - b);

      compSummary = {
        count: topComps.length,
        medianPricePerUnit: prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0,
        medianPricePerSqft: sqftPrices.length > 0 ? sqftPrices[Math.floor(sqftPrices.length / 2)] : null,
        priceRangeLow: prices[0] || 0,
        priceRangeHigh: prices[prices.length - 1] || 0,
        avgCapRate: null,
        methodology: compResult.valuation?.methodology || "",
        confidence: compResult.valuation?.confidence || "low",
        confidenceScore: compResult.valuation?.confidenceScore || 0,
      };
    }
  } catch { /* graceful */ }

  // ── Cap Rate Analysis ─────────────────────────────────────
  let capRate: BovCapRateData | null = null;
  try {
    if (compResult && compResult.comps && compResult.comps.length >= 3) {
      const capAnalysis = deriveMarketCapRate({
        subject: {
          yearBuilt,
          hasElevator,
          numFloors: stories,
          bldgClass,
          bldgArea: sqft,
          unitsRes: Math.max(1, unitsRes),
          borough,
        },
        comps: compResult.comps,
      });

      capRate = {
        marketCapRate: capAnalysis.marketCapRate,
        rangeLow: capAnalysis.range.low,
        rangeHigh: capAnalysis.range.high,
        median: capAnalysis.median,
        suggestedExitCap: capAnalysis.suggestedExitCap,
        compCount: capAnalysis.compCount,
        confidence: capAnalysis.confidence,
        trend: capAnalysis.trend,
        trendBpsPerYear: capAnalysis.trendBpsPerYear,
        methodology: capAnalysis.methodology,
      };

      // Backfill comp cap rates
      if (comps && capAnalysis.compCapRates) {
        for (const ccr of capAnalysis.compCapRates) {
          const match = comps.find(c => c.address === ccr.address);
          if (match) match.estimatedCapRate = ccr.capRate;
        }
      }

      // Update comp summary avg cap rate
      if (compSummary && capAnalysis.compCapRates.length > 0) {
        const rates = capAnalysis.compCapRates.map(c => c.capRate);
        compSummary.avgCapRate = rates.reduce((s, r) => s + r, 0) / rates.length;
      }
    }
  } catch { /* graceful */ }

  // ── Violations ────────────────────────────────────────────
  let violations: BovViolationSummary | null = null;
  try {
    const vs = raw.violationSummary;
    const ecb = raw.ecbSummary;
    const dobViolCount = Array.isArray(raw.dobFilings) ? raw.dobFilings.filter((d: any) => d.jobType === "VIOLATION").length : 0;

    if (vs || ecb) {
      const hpdTotal = vs?.total || 0;
      const hpdOpen = vs?.open || 0;
      const classA = vs?.classA || 0;
      const classB = vs?.classB || 0;
      const classC = vs?.classC || 0;
      const ecbTotal = ecb?.total || 0;
      const ecbPenalty = ecb?.totalPenalty || 0;

      let signal: "green" | "yellow" | "red" = "green";
      if (classC > 5 || ecbPenalty > 50000 || hpdOpen > 20) signal = "red";
      else if (classC > 0 || hpdOpen > 5 || ecbTotal > 3) signal = "yellow";

      violations = {
        hpdClassA: classA,
        hpdClassB: classB,
        hpdClassC: classC,
        hpdOpen,
        hpdTotal,
        dobViolations: dobViolCount,
        ecbViolations: ecbTotal,
        ecbPenalties: ecbPenalty,
        conditionSignal: signal,
      };
    }
  } catch { /* graceful */ }

  // ── Permits ───────────────────────────────────────────────
  let permits: BovPermitSummary | null = null;
  try {
    const perms = raw.permits || [];
    if (Array.isArray(perms) && perms.length > 0) {
      const recentPermits: BovPermitItem[] = perms.slice(0, 5).map((pm: any) => ({
        type: pm.job_type || pm.jobType || "",
        description: pm.job_description || pm.description || "",
        filingDate: pm.filing_date || pm.filingDate || "",
        status: pm.filing_status || pm.status || "",
      }));
      permits = {
        totalPermits: perms.length,
        recentPermits,
      };
    }
  } catch { /* graceful */ }

  // ── Energy ────────────────────────────────────────────────
  let energy: BovEnergyData | null = null;
  try {
    const e = intel.energy;
    if (e && (e.siteEUI || e.energyStarScore)) {
      energy = {
        siteEUI: e.siteEUI || null,
        sourceEUI: e.sourceEUI || null,
        ghgTons: e.ghgEmissions || null,
        energyStarScore: e.energyStarScore || null,
        grade: e.energyStarGrade || null,
        ll97Status: e.ll97Status || null,
        ll97PenaltyEstimate: e.ll97PenaltyEstimate || null,
      };
    }
  } catch { /* graceful */ }

  // ── Litigation ────────────────────────────────────────────
  let litigation: BovLitigationSummary | null = null;
  try {
    const litSum = raw.litigationSummary;
    const litArr = raw.litigation || [];
    if (litSum) {
      const recentCases: BovLitigationCase[] = (Array.isArray(litArr) ? litArr : []).slice(0, 5).map((c: any) => ({
        caseType: c.casetype || c.case_type || "",
        status: c.status || "",
        filingDate: c.caseopendate || c.case_open_date || "",
      }));
      litigation = {
        activeCases: litSum.open || 0,
        totalCases: litSum.total || 0,
        recentCases,
      };
    }
  } catch { /* graceful */ }

  // ── Neighborhood ──────────────────────────────────────────
  let neighborhoodData: BovNeighborhoodData | null = null;
  try {
    if (neighborhoodProfile && neighborhoodProfile.quickStats) {
      const qs = neighborhoodProfile.quickStats;
      neighborhoodData = {
        name: neighborhood,
        population: qs.totalPopulation || null,
        medianHouseholdIncome: qs.medianHouseholdIncome || null,
        medianAge: qs.medianAge || null,
        ownerOccupiedPct: qs.renterOccupiedPct != null ? 100 - qs.renterOccupiedPct : null,
        renterOccupiedPct: qs.renterOccupiedPct || null,
        medianHomeValue: qs.medianHomeValue || null,
        medianRent: qs.medianRent || null,
        summary: null,
      };
    }
  } catch { /* graceful */ }

  // ── Rent Stabilization ────────────────────────────────────
  let rentStabilization: BovRentStabData | null = null;
  try {
    const rsUnits = intel.property?.rentStabilizedUnits?.value || 0;
    if (rsUnits > 0) {
      const pct = units > 0 ? (rsUnits / units) * 100 : 0;
      const notes: string[] = [];
      if (pct > 50) notes.push("Majority rent stabilized — HSTPA limits deregulation");
      if (pct > 0 && pct <= 50) notes.push("Partial rent stabilization — mixed income potential");
      rentStabilization = {
        stabilizedUnits: rsUnits,
        totalUnits: units,
        stabilizedPct: Math.round(pct * 10) / 10,
        rgbBlendedRate: 2.5, // Current RGB blended
        notes,
      };
    }
  } catch { /* graceful */ }

  // ── Valuation Estimate ────────────────────────────────────
  let valuation: BovValuationEstimate | null = null;
  try {
    const salesCompValue = compResult?.valuation?.estimatedValue || null;
    const noi = financials?.estimatedNOI || null;
    const marketCap = capRate?.marketCapRate || null;
    const incomeValue = noi && marketCap && marketCap > 0 ? noi / (marketCap / 100) : null;

    if (salesCompValue || incomeValue) {
      let reconciledLikely: number;
      if (salesCompValue && incomeValue) {
        // 60% income, 40% sales comparison for multifamily
        reconciledLikely = incomeValue * 0.6 + salesCompValue * 0.4;
      } else {
        reconciledLikely = incomeValue || salesCompValue || 0;
      }

      const reconciledLow = Math.round(reconciledLikely * 0.9);
      const reconciledHigh = Math.round(reconciledLikely * 1.1);
      reconciledLikely = Math.round(reconciledLikely);

      valuation = {
        salesCompValue: salesCompValue ? Math.round(salesCompValue) : null,
        salesCompBasis: compSummary
          ? `Based on ${compSummary.count} comparable sales, median $${Math.round(compSummary.medianPricePerUnit).toLocaleString()}/unit`
          : null,
        incomeValue: incomeValue ? Math.round(incomeValue) : null,
        incomeBasis: marketCap
          ? `Estimated NOI of $${Math.round(noi!).toLocaleString()} capitalized at ${marketCap.toFixed(2)}%`
          : null,
        reconciledLow,
        reconciledLikely,
        reconciledHigh,
        suggestedListingLow: Math.round(reconciledLikely * 0.95),
        suggestedListingHigh: Math.round(reconciledLikely * 1.05),
        disclaimer:
          "This Broker Opinion of Value is provided for informational purposes only and does not constitute a formal appraisal. " +
          "The estimated values are based on publicly available data, comparable sales, and standard income capitalization methods. " +
          "Actual market value may differ based on property condition, tenant leases, market conditions, and other factors not " +
          "reflected in this analysis. This opinion should not be relied upon for lending, legal, or tax purposes. " +
          "A formal appraisal by a licensed appraiser is recommended for definitive valuation.",
      };
    }
  } catch { /* graceful */ }

  // ── Assemble payload ──────────────────────────────────────
  const payload: BovPayload = {
    generatedAt: new Date().toISOString(),
    generatedBy: brokerInfo,
    branding,
    property,
    ownership,
    financials,
    comps,
    compSummary,
    capRate,
    violations,
    permits,
    energy,
    litigation,
    neighborhood: neighborhoodData,
    rentStabilization,
    valuation,
  };

  // Ensure clean serialization (no Dates/Decimals)
  return JSON.parse(JSON.stringify(payload));
}

// ── Branding-Only Fetch ─────────────────────────────────────

export async function getBovBranding(): Promise<BovBranding> {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      organization: {
        include: { brandSettings: true },
      },
    },
  });
  if (!user) throw new Error("User not found");

  const org = user.organization;
  const brand = org.brandSettings;

  return {
    companyName: brand?.companyName || org.name || "Brokerage",
    logoUrl: brand?.logoUrl || org.logoUrl || null,
    primaryColor: brand?.primaryColor || "#1E40AF",
    accentColor: brand?.accentColor || "#6B5B95",
    address: org.address || "",
    phone: org.phone || "",
    email: user.email,
    website: org.website || null,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function getBuildingClassDescription(cls: string): string | null {
  const MAP: Record<string, string> = {
    A0: "Cape Cod",
    A1: "Two Stories, Detached",
    A2: "One Story, Attached",
    A3: "Large Residence",
    A4: "City Residence",
    A5: "Converted",
    A6: "Country Residence",
    A7: "Mansion Type",
    A9: "Misc One Family",
    B1: "Two Family, Detached",
    B2: "Two Family, Attached",
    B3: "Two Family, Converted",
    B9: "Misc Two Family",
    C0: "Walk-up, Three Families",
    C1: "Walk-up, Over Six Families (No Store)",
    C2: "Walk-up (Mixed Residential & Commercial)",
    C3: "Walk-up (Mixed w/ Professional)",
    C4: "Walk-up, Over Six Families",
    C5: "Converted Walk-up",
    C6: "Cooperative Walk-up",
    C7: "Walk-up, Over Six (Fireproof)",
    C8: "Walk-up, Over Six (Non-Fireproof)",
    C9: "Walk-up, Garden Apartments",
    D0: "Elevator Co-op",
    D1: "Elevator, Semi-Fireproof",
    D2: "Elevator, Fireproof w/ Stores",
    D3: "Elevator, Fireproof w/o Stores",
    D4: "Elevator, Cooperative",
    D5: "Elevator, Converted",
    D6: "Elevator, Fireproof, Garden",
    D7: "Elevator, Semi-Fireproof (Large)",
    D8: "Elevator, Fireproof (Large)",
    D9: "Elevator, Misc",
    R1: "Condominiums (Residential)",
    R2: "Condominiums (Residential, Bilevel)",
    R3: "Condominiums (Residential, Walkup)",
    R4: "Condominiums (Residential, Elevator)",
    R6: "Condominiums (Residential, Co-op)",
    R9: "Condominiums (Residential, Misc)",
    S1: "Primarily 1 Family w/ Stores",
    S2: "Primarily 2 Family w/ Stores",
    S3: "Primarily 3 Family w/ Stores",
    S4: "Mixed Residential & Commercial (10+ units)",
    S5: "Mixed Residential & Commercial (Converted)",
    S9: "Mixed Residential & Commercial (Misc)",
  };
  return MAP[cls] || (cls ? `Class ${cls}` : null);
}
