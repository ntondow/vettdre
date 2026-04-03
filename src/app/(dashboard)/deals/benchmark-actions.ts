"use server";

import { getExpenseBenchmark } from "@/lib/expense-benchmarks";
import type { ExpenseBenchmark, ExpenseBenchmarkParams } from "@/lib/expense-benchmarks";
import { modelRentGrowth } from "@/lib/rent-stabilization";
import type { RentProjection } from "@/lib/rent-stabilization";
import { projectLL97Penalty } from "@/lib/ll97-penalties";
import type { LL97Projection } from "@/lib/ll97-penalties";

const NYC_BASE = "https://data.cityofnewyork.us/resource";
// NOTE: Old rent stab dataset 35ss-ekc5 was removed from NYC Open Data.
// Using heuristic (pre-1974 + 6+ units) instead.

// ── Fetch Expense Benchmark ─────────────────────────────────

export async function fetchExpenseBenchmark(params: {
  bbl: string;
  yearBuilt: number;
  numFloors: number;
  bldgClass: string;
  bldgArea: number;
  unitsRes: number;
  borough: string;
  hasElevator?: boolean;
  rentStabilizedUnits?: number;
}): Promise<ExpenseBenchmark | null> {
  try {
    let { hasElevator, rentStabilizedUnits } = params;

    // Derive elevator from floors / building class if not provided
    if (hasElevator == null) {
      hasElevator = params.numFloors > 5 || params.bldgClass.startsWith("D");
    }

    // Rent stabilized units — heuristic (old dataset 35ss-ekc5 is dead)
    if (rentStabilizedUnits == null) {
      rentStabilizedUnits = (params.yearBuilt > 0 && params.yearBuilt < 1974 && params.unitsRes >= 6)
        ? params.unitsRes
        : 0;
    }

    const benchmarkParams: ExpenseBenchmarkParams = {
      yearBuilt: params.yearBuilt,
      hasElevator,
      numFloors: params.numFloors,
      bldgClass: params.bldgClass,
      bldgArea: params.bldgArea,
      unitsRes: params.unitsRes,
      borough: params.borough,
      rentStabilizedUnits: rentStabilizedUnits || 0,
    };

    return getExpenseBenchmark(benchmarkParams);
  } catch (error) {
    console.error("Expense benchmark fetch error:", error);
    return null;
  }
}

// ── Fetch Rent Projection ───────────────────────────────────

export async function fetchRentProjection(params: {
  bbl: string;
  totalUnits: number;
  holdPeriodYears: number;
  marketRentGrowthPct: number;
  avgMarketRent: number;
  renovationBudget?: number;
}): Promise<RentProjection | null> {
  try {
    // Rent stabilized units — heuristic (old dataset 35ss-ekc5 is dead)
    // Pre-1974 buildings with 6+ units are generally rent stabilized in NYC
    const stabilizedUnits = (params.totalUnits >= 6) ? params.totalUnits : 0;
    // Note: Without BBL-level year-built data here, we conservatively estimate
    // based on unit count alone. Callers should pass accurate data when available.

    if (stabilizedUnits <= 0) return null;

    // Estimate stabilized rent as 60% of market rent (existing pattern from ai-assumptions.ts)
    const avgStabilizedRent = Math.round(params.avgMarketRent * 0.60);

    return modelRentGrowth({
      totalUnits: params.totalUnits,
      stabilizedUnits,
      avgMarketRent: params.avgMarketRent,
      avgStabilizedRent,
      holdPeriodYears: params.holdPeriodYears,
      marketRentGrowthPct: params.marketRentGrowthPct,
      renovationBudget: params.renovationBudget,
    });
  } catch (error) {
    console.error("Rent projection fetch error:", error);
    return null;
  }
}

// ── Fetch LL97 Projection ───────────────────────────────────

export async function fetchLL97Projection(params: {
  bbl: string;
  holdPeriodYears: number;
  buildingArea?: number;
  buildingType?: string;
}): Promise<LL97Projection | null> {
  try {
    // Import and call fetchLL84Data from building-profile-actions
    const { fetchLL84Data } = await import("@/app/(dashboard)/market-intel/building-profile-actions");
    const ll84 = await fetchLL84Data(params.bbl);
    if (!ll84 || !ll84.ghgEmissions || ll84.ghgEmissions <= 0 || !ll84.grossFloorArea || ll84.grossFloorArea <= 0) {
      return null;
    }

    return projectLL97Penalty({
      ghgEmissions: ll84.ghgEmissions,
      grossFloorArea: ll84.grossFloorArea,
      buildingType: params.buildingType || ll84.primaryUse || "multifamily",
      holdPeriodYears: params.holdPeriodYears,
    });
  } catch (error) {
    console.error("LL97 projection fetch error:", error);
    return null;
  }
}
