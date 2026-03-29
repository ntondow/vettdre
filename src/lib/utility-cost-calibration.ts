// ============================================================
// Utility Cost Calibration Engine — LL84 Energy → Expense Adjustments
//
// Uses NYC LL84 energy benchmarking data (Energy Star scores,
// site EUI, actual utility usage) to calibrate utility expense
// assumptions in deal analysis. Buildings with poor energy
// performance get higher utility cost projections.
// ============================================================

import type { BenchmarkLineItem } from "./expense-benchmarks";

// ── Types ────────────────────────────────────────────────────

export type EnergyGrade = "A" | "B" | "C" | "D" | "F" | "unknown";

export interface LL84EnergyData {
  energyStarScore: number;       // 1-100 (0 = not available)
  energyStarGrade: string;       // letter grade or certification string
  siteEUI: number;               // kBtu/sqft (site energy use intensity)
  sourceEUI: number;             // kBtu/sqft (source energy use intensity)
  electricityKwh: number;        // annual electricity usage
  gasTherms: number;             // annual natural gas usage
  waterKgal: number;             // annual water usage
  fuelOilGal: number;            // annual fuel oil usage
  grossFloorArea: number;        // sqft
  reportingYear: number;
}

export interface UtilityCostCalibration {
  /** Energy grade derived from Energy Star score or EUI */
  energyGrade: EnergyGrade;
  /** Multiplier for electricity + gas costs (1.0 = benchmark, >1 = higher) */
  electricityGasMultiplier: number;
  /** Multiplier for water/sewer costs */
  waterSewerMultiplier: number;
  /** Estimated annual utility cost from actual LL84 data (if available) */
  estimatedActualUtilityCost: number | null;
  /** Adjusted benchmark line items (if provided) */
  adjustedLineItems?: BenchmarkLineItem[];
  /** Methodology notes */
  notes: string[];
}

// ── Energy Star Score → Grade Mapping ────────────────────────

/**
 * Derive an energy grade from Energy Star score or site EUI.
 * Energy Star 1-100 maps: ≥85 = A, 65-84 = B, 50-64 = C, 25-49 = D, <25 = F
 * Site EUI fallback for multifamily: <80 = A, 80-120 = B, 120-160 = C, 160-200 = D, >200 = F
 */
export function deriveEnergyGrade(data: {
  energyStarScore?: number;
  siteEUI?: number;
  energyStarGrade?: string;
}): EnergyGrade {
  // Try explicit grade first (from LL84 letter_grade field)
  if (data.energyStarGrade) {
    const grade = data.energyStarGrade.toUpperCase().trim();
    if (grade === "A" || grade === "B" || grade === "C" || grade === "D" || grade === "F") {
      return grade;
    }
  }

  // Energy Star score (1-100, higher = better)
  const score = data.energyStarScore ?? 0;
  if (score >= 85) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 25) return "D";
  if (score > 0) return "F";

  // Fallback: site EUI (kBtu/sqft) — NYC multifamily benchmarks
  const eui = data.siteEUI ?? 0;
  if (eui > 0) {
    if (eui < 80) return "A";
    if (eui < 120) return "B";
    if (eui < 160) return "C";
    if (eui < 200) return "D";
    return "F";
  }

  return "unknown";
}

// ── Grade → Multiplier Mapping ───────────────────────────────

const GRADE_MULTIPLIERS: Record<EnergyGrade, { elecGas: number; water: number }> = {
  A: { elecGas: 0.80, water: 0.90 },   // Efficient: -20% elec/gas, -10% water
  B: { elecGas: 0.92, water: 0.95 },   // Good: -8% elec/gas, -5% water
  C: { elecGas: 1.00, water: 1.00 },   // Baseline: benchmark as-is
  D: { elecGas: 1.15, water: 1.05 },   // Below average: +15% elec/gas, +5% water
  F: { elecGas: 1.40, water: 1.10 },   // Poor: +40% elec/gas, +10% water
  unknown: { elecGas: 1.00, water: 1.00 }, // No data: use benchmark
};

// ── Utility Cost Rates ($/unit) ──────────────────────────────
// Aligned with data-fusion-engine.ts UTILITY_RATES

const UTILITY_RATES = {
  electricity: 0.22,   // $/kWh (NYC average commercial)
  gas: 1.20,           // $/therm
  water: 0.015,        // $/kgal → $/gal
  fuelOil: 3.50,       // $/gallon
};

// ── Main Calibration Function ────────────────────────────────

/**
 * Calibrate utility cost assumptions using LL84 energy benchmarking data.
 *
 * If actual LL84 usage data is available, computes real utility costs.
 * Always produces a multiplier adjustment based on energy grade for
 * benchmark-based projections.
 */
export function calibrateUtilityCosts(
  energyData: LL84EnergyData | null,
  benchmarkLineItems?: BenchmarkLineItem[],
  units?: number,
): UtilityCostCalibration {
  const notes: string[] = [];

  // No LL84 data available
  if (!energyData) {
    return {
      energyGrade: "unknown",
      electricityGasMultiplier: 1.0,
      waterSewerMultiplier: 1.0,
      estimatedActualUtilityCost: null,
      notes: ["No LL84 energy data available — using benchmark defaults"],
    };
  }

  // Derive energy grade
  const energyGrade = deriveEnergyGrade({
    energyStarScore: energyData.energyStarScore,
    siteEUI: energyData.siteEUI,
    energyStarGrade: energyData.energyStarGrade,
  });

  const multipliers = GRADE_MULTIPLIERS[energyGrade];
  notes.push(`LL84 Energy Grade: ${energyGrade}`);

  if (energyData.energyStarScore > 0) {
    notes.push(`Energy Star Score: ${energyData.energyStarScore}/100`);
  }
  if (energyData.siteEUI > 0) {
    notes.push(`Site EUI: ${energyData.siteEUI.toFixed(1)} kBtu/sqft`);
  }

  if (energyGrade !== "C" && energyGrade !== "unknown") {
    const elecPct = Math.round((multipliers.elecGas - 1) * 100);
    const sign = elecPct > 0 ? "+" : "";
    notes.push(`Utility adjustment: ${sign}${elecPct}% electricity/gas`);
  }

  // Compute actual utility costs from LL84 data
  let estimatedActualUtilityCost: number | null = null;
  if (energyData.electricityKwh > 0 || energyData.gasTherms > 0) {
    const elecCost = Math.round(energyData.electricityKwh * UTILITY_RATES.electricity);
    const gasCost = Math.round(energyData.gasTherms * UTILITY_RATES.gas);
    const waterCost = Math.round(energyData.waterKgal * UTILITY_RATES.water);
    const fuelCost = Math.round(energyData.fuelOilGal * UTILITY_RATES.fuelOil);
    estimatedActualUtilityCost = elecCost + gasCost + waterCost + fuelCost;
    notes.push(`LL84 actual utility cost estimate: $${estimatedActualUtilityCost.toLocaleString()}/yr (${energyData.reportingYear})`);
  }

  // Adjust benchmark line items if provided
  let adjustedLineItems: BenchmarkLineItem[] | undefined;
  if (benchmarkLineItems && units && units > 0) {
    adjustedLineItems = benchmarkLineItems.map(item => {
      if (item.field === "electricityGas") {
        // Use actual data if available and reasonable, otherwise apply multiplier
        if (estimatedActualUtilityCost && estimatedActualUtilityCost > 0) {
          // LL84 gives total building utility cost — extract elec+gas portion
          const elecGasCost = Math.round(
            (energyData.electricityKwh * UTILITY_RATES.electricity +
             energyData.gasTherms * UTILITY_RATES.gas) / units,
          );
          // Sanity check: use actual if within 3x of benchmark (avoid bad data)
          if (elecGasCost > item.perUnit * 0.3 && elecGasCost < item.perUnit * 3) {
            return {
              ...item,
              perUnit: elecGasCost,
              totalAnnual: elecGasCost * units,
            };
          }
        }
        // Fall back to grade-based multiplier
        const adjusted = Math.round(item.perUnit * multipliers.elecGas);
        return { ...item, perUnit: adjusted, totalAnnual: adjusted * units };
      }

      if (item.field === "waterSewer") {
        if (estimatedActualUtilityCost && energyData.waterKgal > 0) {
          const waterCostPerUnit = Math.round(
            (energyData.waterKgal * UTILITY_RATES.water) / units,
          );
          if (waterCostPerUnit > item.perUnit * 0.3 && waterCostPerUnit < item.perUnit * 3) {
            return {
              ...item,
              perUnit: waterCostPerUnit,
              totalAnnual: waterCostPerUnit * units,
            };
          }
        }
        const adjusted = Math.round(item.perUnit * multipliers.water);
        return { ...item, perUnit: adjusted, totalAnnual: adjusted * units };
      }

      return item;
    });
  }

  return {
    energyGrade,
    electricityGasMultiplier: multipliers.elecGas,
    waterSewerMultiplier: multipliers.water,
    estimatedActualUtilityCost,
    adjustedLineItems,
    notes,
  };
}

// ── Per-Unit Utility Cost from LL84 ──────────────────────────

/**
 * Quick helper: get per-unit annual utility cost from LL84 data.
 * Returns null if data is insufficient.
 */
export function getLL84UtilityCostPerUnit(
  energyData: LL84EnergyData,
  units: number,
): number | null {
  if (units <= 0) return null;
  const total =
    energyData.electricityKwh * UTILITY_RATES.electricity +
    energyData.gasTherms * UTILITY_RATES.gas +
    energyData.waterKgal * UTILITY_RATES.water +
    energyData.fuelOilGal * UTILITY_RATES.fuelOil;
  if (total <= 0) return null;
  return Math.round(total / units);
}
