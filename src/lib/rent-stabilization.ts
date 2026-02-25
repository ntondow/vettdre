// ============================================================
// Rent Stabilization Engine — RGB Rates, HSTPA 2019 Modeling
// Year-by-year rent projections for mixed stabilized/free-market
// ============================================================

// ── RGB Rate History ─────────────────────────────────────────

export interface RGBRate {
  year: number;
  oneYear: number;   // %
  twoYear: number;   // %
}

export const RGB_RATES: RGBRate[] = [
  { year: 2025, oneYear: 2.50, twoYear: 4.50 },  // projected
  { year: 2024, oneYear: 2.75, twoYear: 5.25 },
  { year: 2023, oneYear: 3.00, twoYear: 2.75 },
];

/** Default annual turnover rate for rent-stabilized units */
const DEFAULT_TURNOVER_PCT = 5;

// ── Types ────────────────────────────────────────────────────

export interface RentProjectionParams {
  totalUnits: number;
  stabilizedUnits: number;
  avgMarketRent: number;         // $/unit/month (free-market units)
  avgStabilizedRent: number;     // $/unit/month (stabilized units)
  holdPeriodYears: number;
  marketRentGrowthPct: number;   // annual % for free-market units
  turnoverPct?: number;          // annual % of stabilized units that turn over
  renovationBudget?: number;     // for MCI/IAI calculation
}

export interface YearlyRentProjection {
  year: number;
  stabilizedMonthlyPerUnit: number;
  freeMarketMonthlyPerUnit: number;
  blendedMonthlyPerUnit: number;
  totalAnnualRent: number;
  stabilizedGrowthPct: number;
  freeMarketGrowthPct: number;
}

export interface MCIUpside {
  monthlyPerUnit: number;      // $/unit/month increase
  annualTotal: number;         // total annual rent increase
  expirationYears: number;     // 30 years
  note: string;
}

export interface IAIUpside {
  monthlyPerUnit: number;      // $/unit/month increase per turnover unit
  annualTotal: number;         // total annual (based on turnover rate)
  perUnitCap: number;          // $15,000 cap
  note: string;
}

export interface RentProjection {
  yearlyProjections: YearlyRentProjection[];
  blendedAnnualGrowthPct: number;
  stabilizedPct: number;
  rgbBlendedRate: number;
  mciUpside: MCIUpside | null;
  iaiUpside: IAIUpside | null;
  notes: string[];
}

// ── RGB Blended Rate ─────────────────────────────────────────

export function getBlendedRGBRate(): number {
  const latest = RGB_RATES[0];
  // Blended: 70% × 1-year + 30% × 2-year (annualized)
  const twoYearAnnualized = ((1 + latest.twoYear / 100) ** 0.5 - 1) * 100;
  return latest.oneYear * 0.7 + twoYearAnnualized * 0.3;
}

// ── Rent Growth Model ────────────────────────────────────────

export function modelRentGrowth(params: RentProjectionParams): RentProjection {
  const {
    totalUnits,
    stabilizedUnits,
    avgMarketRent,
    avgStabilizedRent,
    holdPeriodYears,
    marketRentGrowthPct,
    turnoverPct = DEFAULT_TURNOVER_PCT,
    renovationBudget,
  } = params;

  const freeMarketUnits = totalUnits - stabilizedUnits;
  const stabilizedPct = totalUnits > 0 ? (stabilizedUnits / totalUnits) * 100 : 0;
  const rgbRate = getBlendedRGBRate();
  const notes: string[] = [];

  notes.push(`HSTPA 2019: No vacancy bonus, no high-rent deregulation`);
  notes.push(`RGB blended rate: ${rgbRate.toFixed(2)}% (70% 1-yr + 30% 2-yr annualized)`);

  const yearlyProjections: YearlyRentProjection[] = [];
  let stabilizedRent = avgStabilizedRent;
  let freeMarketRent = avgMarketRent;

  for (let y = 1; y <= holdPeriodYears; y++) {
    // Stabilized units grow at RGB rate
    const stabilizedGrowth = rgbRate;
    stabilizedRent = stabilizedRent * (1 + stabilizedGrowth / 100);

    // Free-market units grow at market rate
    const freeMarketGrowth = marketRentGrowthPct;
    freeMarketRent = freeMarketRent * (1 + freeMarketGrowth / 100);

    // Blended rent (weighted by unit count)
    const blended = totalUnits > 0
      ? (stabilizedRent * stabilizedUnits + freeMarketRent * freeMarketUnits) / totalUnits
      : freeMarketRent;

    const totalAnnualRent = Math.round(
      (stabilizedRent * stabilizedUnits + freeMarketRent * freeMarketUnits) * 12,
    );

    yearlyProjections.push({
      year: y,
      stabilizedMonthlyPerUnit: Math.round(stabilizedRent),
      freeMarketMonthlyPerUnit: Math.round(freeMarketRent),
      blendedMonthlyPerUnit: Math.round(blended),
      totalAnnualRent,
      stabilizedGrowthPct: stabilizedGrowth,
      freeMarketGrowthPct: freeMarketGrowth,
    });
  }

  // Calculate blended annual growth over hold period
  const firstYearRent = yearlyProjections[0]?.totalAnnualRent || 0;
  const lastYearRent = yearlyProjections[yearlyProjections.length - 1]?.totalAnnualRent || 0;
  const blendedAnnualGrowthPct = holdPeriodYears > 1 && firstYearRent > 0
    ? ((lastYearRent / firstYearRent) ** (1 / (holdPeriodYears - 1)) - 1) * 100
    : rgbRate;

  // MCI / IAI upside
  let mciUpside: MCIUpside | null = null;
  let iaiUpside: IAIUpside | null = null;

  if (renovationBudget && renovationBudget > 0 && stabilizedUnits > 0) {
    mciUpside = calculateMCIUpside(renovationBudget, totalUnits);
    iaiUpside = calculateIAIUpside(renovationBudget, stabilizedUnits, turnoverPct, totalUnits);
  }

  return {
    yearlyProjections,
    blendedAnnualGrowthPct: Math.round(blendedAnnualGrowthPct * 100) / 100,
    stabilizedPct: Math.round(stabilizedPct * 10) / 10,
    rgbBlendedRate: Math.round(rgbRate * 100) / 100,
    mciUpside,
    iaiUpside,
    notes,
  };
}

// ── MCI Upside ───────────────────────────────────────────────

export function calculateMCIUpside(
  renovationBudget: number,
  totalUnits: number,
): MCIUpside {
  // MCI: 2% of renovation cost can be added to rent roll
  // Cap: $15/unit/month, 30-year expiration
  const rawMonthly = (renovationBudget * 0.02) / totalUnits / 12;
  const cappedMonthly = Math.min(rawMonthly, 15);
  const annualTotal = Math.round(cappedMonthly * totalUnits * 12);

  return {
    monthlyPerUnit: Math.round(cappedMonthly * 100) / 100,
    annualTotal,
    expirationYears: 30,
    note: cappedMonthly >= 15
      ? `Capped at $15/unit/month (MCI max). Expires after 30 years.`
      : `$${cappedMonthly.toFixed(2)}/unit/month from MCI. Expires after 30 years.`,
  };
}

// ── IAI Upside ───────────────────────────────────────────────

export function calculateIAIUpside(
  renovationBudget: number,
  stabilizedUnits: number,
  turnoverPct: number,
  totalUnits: number,
): IAIUpside {
  // HSTPA 2019 IAI rules:
  // 35+ units: 1/168th of cost per vacant unit
  // <35 units: 1/180th of cost per vacant unit
  // $15,000 cap per unit
  const divisor = totalUnits >= 35 ? 168 : 180;
  const perUnitCap = 15000;
  const rawPerUnit = Math.min(renovationBudget / divisor, perUnitCap);
  const monthlyPerUnit = rawPerUnit / 12;

  // Annual upside based on expected turnover
  const turnoverUnits = Math.round(stabilizedUnits * (turnoverPct / 100));
  const annualTotal = Math.round(monthlyPerUnit * turnoverUnits * 12);

  return {
    monthlyPerUnit: Math.round(monthlyPerUnit * 100) / 100,
    annualTotal,
    perUnitCap,
    note: `1/${divisor}th rule (${totalUnits >= 35 ? "35+" : "<35"} units). ~${turnoverUnits} units/yr turnover at ${turnoverPct}%.`,
  };
}
