// ============================================================
// Expense Benchmark Engine — NYC RGB Income & Expense Study
// Building-category-specific operating expense benchmarks
// Now reads from ReferenceDataCatalog with hardcoded fallbacks
// ============================================================

import { getReferenceData } from "./reference-data";

// ── Building Categories ──────────────────────────────────────

export type BuildingCategory =
  | "pre_war_walkup"
  | "pre_war_elevator"
  | "post_war_walkup"
  | "post_war_elevator"
  | "modern"
  | "new_construction";

export const CATEGORY_LABELS: Record<BuildingCategory, string> = {
  pre_war_walkup: "Pre-War Walk-up",
  pre_war_elevator: "Pre-War Elevator",
  post_war_walkup: "Post-War Walk-up",
  post_war_elevator: "Post-War Elevator",
  modern: "Modern (2000–2014)",
  new_construction: "New Construction (2015+)",
};

// ── Benchmark Data ($/unit/year from RGB I&E Study) ──────────

interface CategoryBenchmarkData {
  insurance: number;
  electricityGas: number;
  waterSewer: number;
  payroll: number;
  rmGeneral: number;
  cleaning: number;
  trashRemoval: number;
  elevator: number;
  exterminating: number;
  legal: number;
  accounting: number;
}

const CATEGORY_BENCHMARKS: Record<BuildingCategory, CategoryBenchmarkData> = {
  pre_war_walkup: {
    insurance: 1800,
    electricityGas: 1200,
    waterSewer: 850,
    payroll: 600,
    rmGeneral: 2200,
    cleaning: 500,
    trashRemoval: 700,
    elevator: 0,
    exterminating: 180,
    legal: 150,
    accounting: 250,
  },
  pre_war_elevator: {
    insurance: 2200,
    electricityGas: 1500,
    waterSewer: 900,
    payroll: 3500,
    rmGeneral: 2000,
    cleaning: 800,
    trashRemoval: 800,
    elevator: 3500,
    exterminating: 200,
    legal: 200,
    accounting: 300,
  },
  post_war_walkup: {
    insurance: 1600,
    electricityGas: 1000,
    waterSewer: 750,
    payroll: 500,
    rmGeneral: 1600,
    cleaning: 450,
    trashRemoval: 650,
    elevator: 0,
    exterminating: 150,
    legal: 120,
    accounting: 220,
  },
  post_war_elevator: {
    insurance: 1800,
    electricityGas: 1200,
    waterSewer: 800,
    payroll: 2800,
    rmGeneral: 1500,
    cleaning: 700,
    trashRemoval: 750,
    elevator: 2800,
    exterminating: 180,
    legal: 180,
    accounting: 280,
  },
  modern: {
    insurance: 1500,
    electricityGas: 1100,
    waterSewer: 700,
    payroll: 2200,
    rmGeneral: 1200,
    cleaning: 600,
    trashRemoval: 600,
    elevator: 2200,
    exterminating: 120,
    legal: 100,
    accounting: 250,
  },
  new_construction: {
    insurance: 1800,
    electricityGas: 1300,
    waterSewer: 650,
    payroll: 2500,
    rmGeneral: 800,
    cleaning: 700,
    trashRemoval: 600,
    elevator: 2000,
    exterminating: 100,
    legal: 80,
    accounting: 250,
  },
};

// ── Types ────────────────────────────────────────────────────

export interface ExpenseBenchmarkParams {
  yearBuilt: number;
  hasElevator: boolean;
  numFloors: number;
  bldgClass: string;
  bldgArea: number;
  unitsRes: number;
  borough: string;
  fuelType?: "gas" | "oil" | "electric" | "steam";
  rentStabilizedUnits?: number;
}

export interface BenchmarkLineItem {
  field: string;
  label: string;
  perUnit: number;       // $/unit/year (adjusted)
  totalAnnual: number;   // perUnit * units
}

export interface ExpenseBenchmark {
  category: BuildingCategory;
  categoryLabel: string;
  lineItems: BenchmarkLineItem[];
  totalPerUnit: number;
  totalAnnual: number;
  adjustmentNotes: string[];
}

export type ComparisonStatus = "significantly_below" | "below" | "in_line" | "above" | "significantly_above";

export interface ExpenseComparison {
  field: string;
  label: string;
  actual: number;
  benchmark: number;
  delta: number;          // actual - benchmark
  deltaPct: number;       // (actual - benchmark) / benchmark * 100
  status: ComparisonStatus;
}

// ── Classification ───────────────────────────────────────────

export function classifyBuildingCategory(params: {
  yearBuilt: number;
  hasElevator?: boolean;
  numFloors?: number;
  bldgClass?: string;
}): BuildingCategory {
  const { yearBuilt, numFloors = 0, bldgClass = "" } = params;
  const hasElev = params.hasElevator ?? (numFloors > 5 || bldgClass.startsWith("D"));

  if (yearBuilt >= 2015) return "new_construction";
  if (yearBuilt >= 2000) return "modern";
  if (yearBuilt >= 1947) return hasElev ? "post_war_elevator" : "post_war_walkup";
  return hasElev ? "pre_war_elevator" : "pre_war_walkup";
}

// ── Borough adjustment factors ───────────────────────────────

const BOROUGH_FACTORS: Record<string, number> = {
  Manhattan: 1.15,
  Brooklyn: 1.05,
  Queens: 0.95,
  Bronx: 0.90,
  "Staten Island": 0.85,
};

// ── Size adjustment factors ──────────────────────────────────

function getSizeFactor(units: number): number {
  if (units < 10) return 1.15;
  if (units <= 30) return 1.0;
  if (units <= 100) return 0.95;
  return 0.90;
}

// ── Fuel type adjustments ($/unit) ───────────────────────────

const FUEL_ADJUSTMENTS: Record<string, number> = {
  gas: 0,
  oil: 400,
  electric: -200,
  steam: 600,
};

// ── Benchmark line item labels ───────────────────────────────

const LINE_ITEM_LABELS: Record<string, string> = {
  insurance: "Property Insurance",
  electricityGas: "Electricity + Gas",
  waterSewer: "Water / Sewer",
  payroll: "Payroll",
  rmGeneral: "R&M General",
  cleaning: "Cleaning",
  trashRemoval: "Trash Removal",
  elevator: "Elevator",
  exterminating: "Exterminating",
  legal: "Legal",
  accounting: "Accounting",
};

// ── Main Benchmark Function ──────────────────────────────────

/**
 * Async version — reads benchmarks from DB, falls back to hardcoded.
 * Prefer this for new code paths.
 */
export async function getExpenseBenchmarkAsync(
  params: ExpenseBenchmarkParams & { inflationRate?: number; inflationYears?: number },
): Promise<ExpenseBenchmark> {
  const category = classifyBuildingCategory({
    yearBuilt: params.yearBuilt,
    hasElevator: params.hasElevator,
    numFloors: params.numFloors,
    bldgClass: params.bldgClass,
  });

  // Try DB first, fall back to hardcoded
  const dbBenchmark = await getReferenceData<CategoryBenchmarkData>("expense_benchmarks", category);
  const base = dbBenchmark ?? CATEGORY_BENCHMARKS[category];

  // Also try DB for adjustment factors
  const dbBoroughFactors = await getReferenceData<Record<string, number>>("adjustment_factors", "borough_expense_multipliers");
  const dbFuelAdj = await getReferenceData<Record<string, number>>("adjustment_factors", "fuel_type_adjustments");

  const boroughFactors = dbBoroughFactors ?? BOROUGH_FACTORS;
  const fuelAdjustments = dbFuelAdj ?? FUEL_ADJUSTMENTS;

  return computeBenchmark(params, category, base, boroughFactors, fuelAdjustments);
}

/**
 * Sync version — uses hardcoded data only (backward compatible).
 */
export function getExpenseBenchmark(params: ExpenseBenchmarkParams): ExpenseBenchmark {
  const category = classifyBuildingCategory({
    yearBuilt: params.yearBuilt,
    hasElevator: params.hasElevator,
    numFloors: params.numFloors,
    bldgClass: params.bldgClass,
  });

  const base = CATEGORY_BENCHMARKS[category];
  return computeBenchmark(params, category, base, BOROUGH_FACTORS, FUEL_ADJUSTMENTS);
}

function computeBenchmark(
  params: ExpenseBenchmarkParams & { inflationRate?: number; inflationYears?: number },
  category: BuildingCategory,
  base: CategoryBenchmarkData,
  boroughFactors: Record<string, number>,
  fuelAdjustments: Record<string, number>,
): ExpenseBenchmark {
  const units = Math.max(1, params.unitsRes);
  const boroughFactor = boroughFactors[params.borough] ?? 1.0;
  const sizeFactor = getSizeFactor(units);
  const fuelAdj = fuelAdjustments[params.fuelType || "gas"] || 0;

  // RS compliance adjustment
  const rsRatio = params.rentStabilizedUnits != null ? params.rentStabilizedUnits / units : 0;
  const rsRmAdj = rsRatio > 0.5 ? 1.05 : 1.0;
  const rsLegalAdj = rsRatio > 0.5 ? 200 : 0; // $/unit for DHCR compliance

  const adjustmentNotes: string[] = [];
  if (boroughFactor !== 1.0) adjustmentNotes.push(`${params.borough}: ${boroughFactor > 1 ? "+" : ""}${Math.round((boroughFactor - 1) * 100)}%`);
  if (sizeFactor !== 1.0) adjustmentNotes.push(`${units} units: ${sizeFactor > 1 ? "+" : ""}${Math.round((sizeFactor - 1) * 100)}%`);
  if (fuelAdj !== 0) adjustmentNotes.push(`${params.fuelType}: ${fuelAdj > 0 ? "+" : ""}$${fuelAdj}/unit`);
  if (rsRatio > 0.5) adjustmentNotes.push(`RS >50%: +5% R&M, +$200/unit legal`);

  const lineItems: BenchmarkLineItem[] = [];
  let totalPerUnit = 0;

  for (const [field, basePerUnit] of Object.entries(base)) {
    let adjusted = basePerUnit * boroughFactor * sizeFactor;

    // Fuel adjustment on electricity/gas
    if (field === "electricityGas") adjusted += fuelAdj;

    // RS adjustments
    if (field === "rmGeneral") adjusted *= rsRmAdj;
    if (field === "legal") adjusted += rsLegalAdj;

    const perUnit = Math.round(adjusted);
    const totalAnnual = perUnit * units;

    lineItems.push({
      field,
      label: LINE_ITEM_LABELS[field] || field,
      perUnit,
      totalAnnual,
    });

    totalPerUnit += perUnit;
  }

  // Apply inflation adjustment if provided (compound growth)
  if (params.inflationRate && params.inflationYears && params.inflationYears > 0) {
    const inflationMultiplier = Math.pow(1 + params.inflationRate / 100, params.inflationYears);
    for (const item of lineItems) {
      item.perUnit = Math.round(item.perUnit * inflationMultiplier);
      item.totalAnnual = item.perUnit * units;
    }
    totalPerUnit = lineItems.reduce((sum, item) => sum + item.perUnit, 0);
    adjustmentNotes.push(`Inflation: +${params.inflationRate.toFixed(1)}%/yr × ${params.inflationYears}yr = ${((inflationMultiplier - 1) * 100).toFixed(1)}% total`);
  }

  return {
    category,
    categoryLabel: CATEGORY_LABELS[category],
    lineItems,
    totalPerUnit,
    totalAnnual: totalPerUnit * units,
    adjustmentNotes,
  };
}

// ── CPI-Adjusted Expense Growth ─────────────────────────────
// Uses FRED CPI data to derive realistic annualExpenseGrowth for deal inputs

/**
 * Compute annualized CPI inflation from FRED CPI observations.
 * Pass two observations (recent and older) to get the annualized rate.
 * Falls back to a reasonable default (2.5%) if insufficient data.
 */
export function computeAnnualizedCPI(
  recentCPI: { date: string; value: number } | null,
  olderCPI: { date: string; value: number } | null,
): { annualizedRate: number; source: "fred_cpi" | "default"; note: string } {
  if (!recentCPI || !olderCPI || recentCPI.value <= 0 || olderCPI.value <= 0) {
    return { annualizedRate: 2.5, source: "default", note: "Default 2.5% (no CPI data available)" };
  }

  const recentDate = new Date(recentCPI.date);
  const olderDate = new Date(olderCPI.date);
  const yearsSpan = Math.max(0.5, (recentDate.getTime() - olderDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

  const totalGrowth = recentCPI.value / olderCPI.value;
  const annualized = (Math.pow(totalGrowth, 1 / yearsSpan) - 1) * 100;

  // Sanity bound: 0-10%
  const bounded = Math.max(0, Math.min(10, annualized));

  return {
    annualizedRate: Math.round(bounded * 100) / 100,
    source: "fred_cpi",
    note: `CPI ${olderCPI.date.slice(0, 7)} → ${recentCPI.date.slice(0, 7)}: ${bounded.toFixed(2)}%/yr annualized (${(totalGrowth - 1) * 100 > 0 ? "+" : ""}${((totalGrowth - 1) * 100).toFixed(1)}% over ${yearsSpan.toFixed(1)}yr)`,
  };
}

/**
 * Suggest annualExpenseGrowth rate for deal calculator using CPI data.
 * Applies a real estate premium (RE expenses typically grow 0.5-1% above CPI).
 */
export function suggestExpenseGrowthRate(
  annualizedCPI: number,
  options?: { realEstatePremiumPct?: number },
): { suggestedRate: number; cpiRate: number; premium: number; note: string } {
  const premium = options?.realEstatePremiumPct ?? 0.75; // RE expenses ~0.75% above CPI
  const suggested = Math.round((annualizedCPI + premium) * 100) / 100;
  const bounded = Math.max(1, Math.min(8, suggested)); // 1-8% bounds

  return {
    suggestedRate: bounded,
    cpiRate: annualizedCPI,
    premium,
    note: `CPI ${annualizedCPI.toFixed(2)}% + ${premium.toFixed(2)}% RE premium = ${bounded.toFixed(2)}%/yr expense growth`,
  };
}

// ── Comparison Function ──────────────────────────────────────

export function compareExpenseToBenchmark(
  expenses: Record<string, number>,
  benchmark: ExpenseBenchmark,
  units: number,
): ExpenseComparison[] {
  const comparisons: ExpenseComparison[] = [];

  for (const item of benchmark.lineItems) {
    const actual = expenses[item.field];
    if (actual == null) continue;

    const actualPerUnit = units > 0 ? actual / units : 0;
    const benchmarkPerUnit = item.perUnit;
    const delta = actualPerUnit - benchmarkPerUnit;
    const deltaPct = benchmarkPerUnit > 0 ? (delta / benchmarkPerUnit) * 100 : 0;

    let status: ComparisonStatus;
    const absPct = Math.abs(deltaPct);
    if (absPct <= 15) status = "in_line";
    else if (deltaPct > 30) status = "significantly_above";
    else if (deltaPct > 15) status = "above";
    else if (deltaPct < -30) status = "significantly_below";
    else status = "below";

    comparisons.push({
      field: item.field,
      label: item.label,
      actual: actualPerUnit,
      benchmark: benchmarkPerUnit,
      delta,
      deltaPct,
      status,
    });
  }

  return comparisons;
}
