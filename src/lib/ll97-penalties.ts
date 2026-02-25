// ============================================================
// LL97 Penalty Projection Engine
// Hold-period year-by-year carbon penalty + retrofit analysis
// ============================================================

// ── LL97 Emission Limits (tCO2e/sqft/year) ──────────────────

const LL97_LIMITS: Record<string, { limit2024: number; limit2030: number }> = {
  multifamily: { limit2024: 0.00675, limit2030: 0.00407 },
  office: { limit2024: 0.00846, limit2030: 0.00453 },
  retail: { limit2024: 0.01181, limit2030: 0.00687 },
  hotel: { limit2024: 0.00987, limit2030: 0.00526 },
  healthcare: { limit2024: 0.02381, limit2030: 0.01275 },
  education: { limit2024: 0.00758, limit2030: 0.00407 },
  warehouse: { limit2024: 0.00574, limit2030: 0.00344 },
};

const LL97_PENALTY_PER_TON = 268;

// CO2 emission factors: kgCO2/kBtu by fuel source
const EUI_TO_CO2: Record<string, number> = {
  gas: 0.053,
  oil: 0.074,
  electric: 0.084,
  blended: 0.059,
};

// ── Types ────────────────────────────────────────────────────

export interface LL97ProjectionParams {
  ghgEmissions: number;         // metric tons CO2e (from LL84)
  grossFloorArea: number;       // sqft
  buildingType?: string;        // maps to LL97_LIMITS key
  holdPeriodYears: number;
  currentYear?: number;
}

export interface LL97YearPenalty {
  year: number;
  calendarYear: number;
  period: 1 | 2;
  emissionLimit: number;        // tCO2e for the building
  currentEmissions: number;     // tCO2e
  excessEmissions: number;      // tCO2e over limit
  annualPenalty: number;        // $
}

export interface RetrofitEstimate {
  measure: string;
  costRange: string;            // e.g. "$2-5/sqft"
  estimatedCost: number;        // $ for this building
  emissionReductionPct: number; // estimated % reduction
  paybackYears: number;         // simple payback in years
}

export interface LL97Projection {
  complianceStatus: "compliant" | "at_risk_2030" | "non_compliant";
  yearlyPenalties: LL97YearPenalty[];
  totalPenaltyOverHold: number;
  avgAnnualPenalty: number;
  currentEmissionsIntensity: number; // kgCO2e/sqft
  limit2024: number;                // tCO2e total for building
  limit2030: number;                // tCO2e total for building
  retrofitOptions: RetrofitEstimate[];
}

// ── Helper: resolve building type to LL97 key ────────────────

function resolveLL97Type(buildingType?: string): string {
  if (!buildingType) return "multifamily";
  const lower = buildingType.toLowerCase();
  if (lower.includes("multifamily") || lower.includes("residential") || lower.includes("housing"))
    return "multifamily";
  if (lower.includes("office")) return "office";
  if (lower.includes("retail") || lower.includes("store")) return "retail";
  if (lower.includes("hotel") || lower.includes("lodging")) return "hotel";
  if (lower.includes("health") || lower.includes("hospital")) return "healthcare";
  if (lower.includes("education") || lower.includes("school")) return "education";
  if (lower.includes("warehouse") || lower.includes("storage")) return "warehouse";
  return "multifamily";
}

// ── Main Projection Function ─────────────────────────────────

export function projectLL97Penalty(params: LL97ProjectionParams): LL97Projection {
  const {
    ghgEmissions,
    grossFloorArea,
    buildingType,
    holdPeriodYears,
    currentYear = new Date().getFullYear(),
  } = params;

  const typeKey = resolveLL97Type(buildingType);
  const limits = LL97_LIMITS[typeKey] || LL97_LIMITS.multifamily;

  const limit2024Total = limits.limit2024 * grossFloorArea / 1000; // convert to metric tons
  const limit2030Total = limits.limit2030 * grossFloorArea / 1000;
  const emissionsIntensity = grossFloorArea > 0 ? (ghgEmissions * 1000) / grossFloorArea : 0; // kgCO2e/sqft

  // Determine compliance status
  let complianceStatus: LL97Projection["complianceStatus"];
  if (ghgEmissions > limit2024Total) {
    complianceStatus = "non_compliant";
  } else if (ghgEmissions > limit2030Total) {
    complianceStatus = "at_risk_2030";
  } else {
    complianceStatus = "compliant";
  }

  // Year-by-year projections
  const yearlyPenalties: LL97YearPenalty[] = [];
  let totalPenalty = 0;

  for (let y = 1; y <= holdPeriodYears; y++) {
    const calYear = currentYear + y;
    const period: 1 | 2 = calYear < 2030 ? 1 : 2;
    const limit = period === 1 ? limit2024Total : limit2030Total;
    const excess = Math.max(0, ghgEmissions - limit);
    const penalty = Math.round(excess * LL97_PENALTY_PER_TON);
    totalPenalty += penalty;

    yearlyPenalties.push({
      year: y,
      calendarYear: calYear,
      period,
      emissionLimit: Math.round(limit * 10) / 10,
      currentEmissions: Math.round(ghgEmissions * 10) / 10,
      excessEmissions: Math.round(excess * 10) / 10,
      annualPenalty: penalty,
    });
  }

  const avgAnnualPenalty = holdPeriodYears > 0 ? Math.round(totalPenalty / holdPeriodYears) : 0;

  // Generate retrofit estimates
  const retrofitOptions = generateRetrofitEstimates(grossFloorArea, ghgEmissions, totalPenalty, holdPeriodYears);

  return {
    complianceStatus,
    yearlyPenalties,
    totalPenaltyOverHold: totalPenalty,
    avgAnnualPenalty,
    currentEmissionsIntensity: Math.round(emissionsIntensity * 100) / 100,
    limit2024: Math.round(limit2024Total * 10) / 10,
    limit2030: Math.round(limit2030Total * 10) / 10,
    retrofitOptions,
  };
}

// ── Retrofit Estimates ───────────────────────────────────────

function generateRetrofitEstimates(
  sqft: number,
  emissions: number,
  totalPenalty: number,
  holdYears: number,
): RetrofitEstimate[] {
  const estimates: RetrofitEstimate[] = [];

  // LED lighting retrofit
  const ledCost = Math.round(sqft * 3.5); // $2-5/sqft midpoint
  const ledReduction = 7.5; // 5-10% midpoint
  const ledSavings = totalPenalty * (ledReduction / 100);
  estimates.push({
    measure: "LED Lighting Retrofit",
    costRange: "$2–5/sqft",
    estimatedCost: ledCost,
    emissionReductionPct: ledReduction,
    paybackYears: ledSavings > 0 ? Math.round((ledCost / (ledSavings / holdYears)) * 10) / 10 : 99,
  });

  // Boiler replacement
  const boilerCost = Math.round(75000 + sqft * 0.5); // $50-100K range
  const boilerReduction = 20; // 15-25% midpoint
  const boilerSavings = totalPenalty * (boilerReduction / 100);
  estimates.push({
    measure: "Boiler Replacement (High-Eff)",
    costRange: "$50K–100K",
    estimatedCost: boilerCost,
    emissionReductionPct: boilerReduction,
    paybackYears: boilerSavings > 0 ? Math.round((boilerCost / (boilerSavings / holdYears)) * 10) / 10 : 99,
  });

  // Building envelope
  const envelopeCost = Math.round(sqft * 45); // $30-60/sqft midpoint
  const envelopeReduction = 15; // 10-20% midpoint
  const envelopeSavings = totalPenalty * (envelopeReduction / 100);
  estimates.push({
    measure: "Building Envelope Upgrade",
    costRange: "$30–60/sqft",
    estimatedCost: envelopeCost,
    emissionReductionPct: envelopeReduction,
    paybackYears: envelopeSavings > 0 ? Math.round((envelopeCost / (envelopeSavings / holdYears)) * 10) / 10 : 99,
  });

  // Heat pump conversion
  const heatPumpCost = Math.round(115000 + sqft * 1); // $80-150K range
  const heatPumpReduction = 40; // 30-50% midpoint
  const heatPumpSavings = totalPenalty * (heatPumpReduction / 100);
  estimates.push({
    measure: "Heat Pump Conversion",
    costRange: "$80K–150K",
    estimatedCost: heatPumpCost,
    emissionReductionPct: heatPumpReduction,
    paybackYears: heatPumpSavings > 0 ? Math.round((heatPumpCost / (heatPumpSavings / holdYears)) * 10) / 10 : 99,
  });

  return estimates;
}
