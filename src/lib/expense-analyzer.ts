// ============================================================
// Expense Analyzer — Anomaly Detection for Multifamily Underwriting
// Checks each expense against per-unit market benchmarks
// ============================================================

export type FlagType =
  | "ABOVE_MARKET"
  | "BELOW_MARKET"
  | "MISSING_CATEGORY"
  | "POSSIBLE_DUPLICATE"
  | "ONE_TIME_CHARGE";

export interface ExpenseFlag {
  type: FlagType;
  field: string;        // expense field key
  label: string;        // human-readable name
  message: string;      // plain English explanation
  currentAmount: number;
  suggestedAmount?: number;
  perUnit?: number;
  benchmarkRange?: { min: number; max: number };
}

// Per-unit annual benchmarks for NYC multifamily
const BENCHMARKS: Record<string, { min: number; max: number; label: string }> = {
  insurance:        { min: 1200, max: 2000, label: "Property Insurance" },
  electricityGas:   { min: 800,  max: 1800, label: "Electricity + Gas" },
  waterSewer:       { min: 500,  max: 1000, label: "Water / Sewer" },
  rmGeneral:        { min: 800,  max: 2500, label: "R&M General" },
  payroll:          { min: 800,  max: 2000, label: "Payroll" },
  cleaning:         { min: 400,  max: 1000, label: "Cleaning" },
  trashRemoval:     { min: 500,  max: 1200, label: "Trash Removal" },
  landscaping:      { min: 500,  max: 1500, label: "Landscaping" },
};

// Flat annual benchmarks (not per-unit)
const FLAT_BENCHMARKS: Record<string, { min: number; max: number; label: string }> = {
  elevator:     { min: 8000,  max: 15000, label: "Elevator" },
  snowRemoval:  { min: 5000,  max: 15000, label: "Snow Removal" },
};

// Standard categories that should typically exist
const STANDARD_CATEGORIES = [
  { field: "realEstateTaxes", label: "Real Estate Taxes" },
  { field: "insurance", label: "Property Insurance" },
  { field: "waterSewer", label: "Water / Sewer" },
  { field: "electricityGas", label: "Electricity + Gas" },
  { field: "rmGeneral", label: "R&M General" },
  { field: "cleaning", label: "Cleaning" },
  { field: "trashRemoval", label: "Trash Removal" },
];

export interface AnalyzeExpensesParams {
  expenses: Record<string, number>;
  totalUnits: number;
  totalIncome: number;
  managementFeePercent: number;
  customExpenses?: { id: string; name: string; amount: number }[];
}

export function analyzeExpenses(params: AnalyzeExpensesParams): ExpenseFlag[] {
  const { expenses, totalUnits, totalIncome, managementFeePercent, customExpenses } = params;
  const flags: ExpenseFlag[] = [];

  if (totalUnits <= 0) return flags;

  // 1. Check per-unit benchmarks
  for (const [field, bench] of Object.entries(BENCHMARKS)) {
    const amount = expenses[field] || 0;
    if (amount <= 0) continue;

    const perUnit = amount / totalUnits;

    if (perUnit > bench.max) {
      flags.push({
        type: "ABOVE_MARKET",
        field,
        label: bench.label,
        message: `${bench.label} is $${Math.round(perUnit).toLocaleString()}/unit — above the typical NYC range of $${bench.min.toLocaleString()}-$${bench.max.toLocaleString()}/unit. This may indicate deferred maintenance costs or billing issues.`,
        currentAmount: amount,
        suggestedAmount: Math.round(bench.max * totalUnits),
        perUnit: Math.round(perUnit),
        benchmarkRange: bench,
      });
    } else if (perUnit < bench.min && amount > 0) {
      flags.push({
        type: "BELOW_MARKET",
        field,
        label: bench.label,
        message: `${bench.label} is $${Math.round(perUnit).toLocaleString()}/unit — below the typical NYC range of $${bench.min.toLocaleString()}-$${bench.max.toLocaleString()}/unit. The owner may be deferring maintenance or this cost may be bundled elsewhere.`,
        currentAmount: amount,
        suggestedAmount: Math.round(bench.min * totalUnits),
        perUnit: Math.round(perUnit),
        benchmarkRange: bench,
      });
    }
  }

  // 2. Check flat benchmarks (elevator, snow)
  for (const [field, bench] of Object.entries(FLAT_BENCHMARKS)) {
    const amount = expenses[field] || 0;
    if (amount <= 0) continue;

    if (amount > bench.max) {
      const reason = field === "elevator"
        ? "This is above the typical annual service contract range — it may include a one-time repair or modernization cost that should be capitalized, not expensed."
        : `${bench.label} cost of $${amount.toLocaleString()}/year exceeds the typical range of $${bench.min.toLocaleString()}-$${bench.max.toLocaleString()}/year.`;

      flags.push({
        type: amount > bench.max * 2 ? "ONE_TIME_CHARGE" : "ABOVE_MARKET",
        field,
        label: bench.label,
        message: reason,
        currentAmount: amount,
        suggestedAmount: Math.round((bench.min + bench.max) / 2),
        benchmarkRange: bench,
      });
    }
  }

  // 3. Check management fee
  if (managementFeePercent > 0 && totalIncome > 0) {
    if (managementFeePercent > 5) {
      flags.push({
        type: "ABOVE_MARKET",
        field: "managementFeePercent",
        label: "Management Fee",
        message: `Management fee of ${managementFeePercent}% is above the typical NYC range of 3-5% of income. Consider negotiating a lower rate or self-managing.`,
        currentAmount: Math.round(totalIncome * (managementFeePercent / 100)),
        suggestedAmount: Math.round(totalIncome * 0.05),
      });
    } else if (managementFeePercent < 3) {
      flags.push({
        type: "BELOW_MARKET",
        field: "managementFeePercent",
        label: "Management Fee",
        message: `Management fee of ${managementFeePercent}% is below the typical 3-5% range. This may not be sustainable — budget at least 3% for professional management.`,
        currentAmount: Math.round(totalIncome * (managementFeePercent / 100)),
        suggestedAmount: Math.round(totalIncome * 0.03),
      });
    }
  }

  // 4. Check for missing standard categories
  for (const cat of STANDARD_CATEGORIES) {
    const amount = expenses[cat.field] || 0;
    if (amount === 0) {
      flags.push({
        type: "MISSING_CATEGORY",
        field: cat.field,
        label: cat.label,
        message: `No ${cat.label} expense found. This is a standard operating cost — it may be hidden in another line item or missing from the budget.`,
        currentAmount: 0,
      });
    }
  }

  // 5. Check for possible duplicates in custom expenses
  if (customExpenses && customExpenses.length > 1) {
    const names = customExpenses.map(e => e.name.toLowerCase().trim());
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (names[i] === names[j] || levenshteinSimilar(names[i], names[j])) {
          flags.push({
            type: "POSSIBLE_DUPLICATE",
            field: `custom_${customExpenses[i].id}`,
            label: customExpenses[i].name,
            message: `"${customExpenses[i].name}" and "${customExpenses[j].name}" may be duplicate entries. Verify these are separate expenses.`,
            currentAmount: customExpenses[i].amount + customExpenses[j].amount,
          });
        }
      }
    }
  }

  return flags;
}

// Simple similarity check for duplicate detection
function levenshteinSimilar(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.includes(b) || b.includes(a)) return true;

  // Normalized word overlap
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w) && w.length > 2) overlap++;
  }
  return overlap >= Math.min(wordsA.size, wordsB.size) * 0.7;
}

// Helper: get per-unit benchmark for a field
export function getBenchmarkForField(field: string): { min: number; max: number } | null {
  return BENCHMARKS[field] || null;
}

// Helper: get methodology string based on source
export function getMethodologyLabel(source: string, growthFactor?: number): string {
  switch (source) {
    case "t12": return growthFactor ? `T-12 + ${Math.round((growthFactor - 1) * 100)}%` : "T-12 Actual";
    case "ai_estimate": return "AI Estimate";
    case "market_benchmark": return "Market Benchmark";
    case "manual": return "Manual Entry";
    default: return "Manual Entry";
  }
}
