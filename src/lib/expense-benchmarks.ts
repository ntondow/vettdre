// ============================================================
// Expense Benchmark Engine — NYC RGB Income & Expense Study
// Building-category-specific operating expense benchmarks
// ============================================================

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

export function getExpenseBenchmark(params: ExpenseBenchmarkParams): ExpenseBenchmark {
  const category = classifyBuildingCategory({
    yearBuilt: params.yearBuilt,
    hasElevator: params.hasElevator,
    numFloors: params.numFloors,
    bldgClass: params.bldgClass,
  });

  const base = CATEGORY_BENCHMARKS[category];
  const units = Math.max(1, params.unitsRes);
  const boroughFactor = BOROUGH_FACTORS[params.borough] ?? 1.0;
  const sizeFactor = getSizeFactor(units);
  const fuelAdj = FUEL_ADJUSTMENTS[params.fuelType || "gas"] || 0;

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

  return {
    category,
    categoryLabel: CATEGORY_LABELS[category],
    lineItems,
    totalPerUnit,
    totalAnnual: totalPerUnit * units,
    adjustmentNotes,
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
