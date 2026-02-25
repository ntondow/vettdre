"use server";

import {
  calculateNYCClosingCosts,
  estimatePostAcquisitionTax,
} from "@/lib/nyc-deal-costs";
import type {
  ClosingCostBreakdown,
  TaxReassessment,
  ClosingCostParams,
} from "@/lib/nyc-deal-costs";
import type { DealStructureType } from "@/lib/deal-structure-engine";

// ── Fetch Itemized Closing Costs ────────────────────────────

export async function fetchClosingCosts(params: {
  purchasePrice: number;
  loanAmount: number;
  structure: DealStructureType;
  units: number;
  assumedBalance?: number;
  supplementalLoan?: number;
  bridgeLoanAmount?: number;
  refiLoanAmount?: number;
  useCEMA?: boolean;
  borough?: string;
}): Promise<ClosingCostBreakdown> {
  const {
    purchasePrice,
    loanAmount,
    structure,
    units,
    assumedBalance = 0,
    supplementalLoan = 0,
    bridgeLoanAmount = 0,
    refiLoanAmount = 0,
    useCEMA = true,
    borough,
  } = params;

  // Multifamily 4+ units is always commercial for NYC tax purposes
  const propertyType: "residential" | "commercial" = units >= 4 ? "commercial" : "residential";
  const isNewLoan = structure !== "assumable";

  const costParams: ClosingCostParams = {
    purchasePrice,
    loanAmount,
    structure,
    units,
    isNewLoan,
    assumedLoanBalance: assumedBalance,
    supplementalLoanAmount: supplementalLoan,
    propertyType,
    borough,
    isCondoOrCoop: false, // multifamily buildings are not condo/coop
    bridgeLoanAmount,
    refiLoanAmount,
    useCEMA,
  };

  return calculateNYCClosingCosts(costParams);
}

// ── Fetch Tax Reassessment ──────────────────────────────────

export async function fetchTaxReassessment(params: {
  bbl: string;
  purchasePrice: number;
  currentTaxBill?: number;
  currentAssessedValue?: number;
  units?: number;
  yearBuilt?: number;
}): Promise<TaxReassessment | null> {
  const { bbl, purchasePrice, units = 10, yearBuilt = 1960 } = params;

  try {
    // Try to fetch PLUTO data for assessed value and tax class
    let assessedValue = params.currentAssessedValue || 0;
    let taxBill = params.currentTaxBill || 0;
    let taxClass: "1" | "2" | "2a" | "2b" | "4" = "2";
    let borough = "MANHATTAN";

    if (bbl && bbl.length >= 10) {
      // Parse BBL: first digit is borough
      const boroCode = bbl.charAt(0);
      const boroMap: Record<string, string> = {
        "1": "MANHATTAN",
        "2": "BRONX",
        "3": "BROOKLYN",
        "4": "QUEENS",
        "5": "STATEN ISLAND",
      };
      borough = boroMap[boroCode] || "MANHATTAN";

      // Fetch from PLUTO for assessed value
      const block = bbl.substring(1, 6);
      const lot = bbl.substring(6, 10);
      const plutoUrl = new URL("https://data.cityofnewyork.us/resource/64uk-42ks.json");
      plutoUrl.searchParams.set("$where", `block = '${block}' AND lot = '${lot}' AND borocode = '${boroCode}'`);
      plutoUrl.searchParams.set("$limit", "1");
      plutoUrl.searchParams.set("$select", "assesstot,taxclass,yearbuilt");

      const resp = await fetch(plutoUrl.toString(), { next: { revalidate: 3600 } });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          const rec = data[0];
          if (rec.assesstot) assessedValue = parseFloat(rec.assesstot) || assessedValue;
          if (rec.taxclass) {
            const tc = rec.taxclass.toLowerCase();
            if (tc === "1" || tc === "2" || tc === "2a" || tc === "2b" || tc === "4") {
              taxClass = tc as typeof taxClass;
            }
          }
        }
      }
    }

    // If we don't have assessed value, estimate from typical NYC ratios
    if (assessedValue <= 0) {
      assessedValue = purchasePrice * 0.45; // Class 2 default
    }
    if (taxBill <= 0) {
      // Estimate from assessed value * default rate
      taxBill = Math.round(assessedValue * 0.123); // ~12.3% Class 2 rate
    }

    return estimatePostAcquisitionTax({
      currentAssessedValue: assessedValue,
      currentTaxBill: taxBill,
      purchasePrice,
      taxClass,
      units,
      borough,
      yearBuilt: yearBuilt || 1960,
    });
  } catch (error) {
    console.error("Tax reassessment fetch error:", error);
    return null;
  }
}
