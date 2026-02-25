// ============================================================
// Cap Rate Engine — Market-Derived Cap Rates from Comp Sales
// Derives actual cap rates from comparable sales using the comps
// engine + expense benchmarks, with weighted averaging and trend
// analysis. Provides intelligent defaults for the deal modeler.
// ============================================================

import type { CompProperty } from "./comps-engine";
import {
  getExpenseBenchmark,
  classifyBuildingCategory,
} from "./expense-benchmarks";
import type { ExpenseBenchmark } from "./expense-benchmarks";

// ── Types ────────────────────────────────────────────────────

export interface CapRateAnalysis {
  /** Weighted average cap rate from comps (%) */
  marketCapRate: number;
  /** Range of observed cap rates */
  range: { low: number; high: number };
  /** Median cap rate */
  median: number;
  /** Suggested exit cap rate (market + 25bp spread) */
  suggestedExitCap: number;
  /** Number of comps used in derivation */
  compCount: number;
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Trend direction over the comp period */
  trend: "compressing" | "stable" | "expanding";
  /** Annualized basis point change */
  trendBpsPerYear: number;
  /** Individual comp cap rates for visualization */
  compCapRates: CompCapRate[];
  /** Methodology description */
  methodology: string;
}

export interface CompCapRate {
  address: string;
  salePrice: number;
  saleDate: string;
  units: number;
  estimatedNOI: number;
  capRate: number;
  weight: number;
  distanceMiles: number;
  similarityScore: number;
}

export interface CapRateParams {
  /** Subject property details */
  subject: {
    yearBuilt: number;
    hasElevator: boolean;
    numFloors: number;
    bldgClass: string;
    bldgArea: number;
    unitsRes: number;
    borough: string;
  };
  /** Comparable sales from comps engine */
  comps: CompProperty[];
  /** Optional: known expense ratio override (opex / EGI) */
  expenseRatioOverride?: number;
}

export interface ExitSensitivity {
  optimistic: { capRate: number; salePrice: number; irr: number };
  base: { capRate: number; salePrice: number; irr: number };
  conservative: { capRate: number; salePrice: number; irr: number };
}

// ── Fallback Cap Rates by Borough/Submarket ─────────────────

const FALLBACK_CAP_RATES: Record<string, number> = {
  Manhattan: 4.50,
  Brooklyn: 5.25,
  Queens: 5.75,
  Bronx: 6.50,
  "Staten Island": 6.75,
  // NYS / NJ defaults
  Westchester: 5.50,
  Nassau: 5.75,
  Hudson: 5.00,
  _default: 5.75,
};

// ── Expense Ratios by Building Type ─────────────────────────
// Typical opex-to-EGI ratios when benchmark data is unavailable

const EXPENSE_RATIO_BY_CLASS: Record<string, number> = {
  C: 0.48, // walkups
  D: 0.55, // elevator
  S: 0.50, // SRO / mixed
  _default: 0.50,
};

// ── Main Derivation Function ────────────────────────────────

export function deriveMarketCapRate(params: CapRateParams): CapRateAnalysis {
  const { subject, comps, expenseRatioOverride } = params;

  if (comps.length === 0) {
    return buildFallbackResult(subject.borough);
  }

  // Get expense benchmark for the subject to estimate NOI from sale prices
  let benchmark: ExpenseBenchmark | null = null;
  try {
    benchmark = getExpenseBenchmark({
      yearBuilt: subject.yearBuilt,
      hasElevator: subject.hasElevator,
      numFloors: subject.numFloors,
      bldgClass: subject.bldgClass,
      bldgArea: subject.bldgArea,
      unitsRes: subject.unitsRes,
      borough: subject.borough,
    });
  } catch {
    // Non-critical — fall back to ratio-based approach
  }

  // For each comp, estimate NOI and derive implied cap rate
  const compCapRates: CompCapRate[] = [];

  for (const comp of comps) {
    if (comp.salePrice <= 0 || comp.units <= 0) continue;

    // Estimate NOI for this comp
    const estimatedNOI = estimateCompNOI(comp, benchmark, subject, expenseRatioOverride);
    if (estimatedNOI <= 0) continue;

    const capRate = (estimatedNOI / comp.salePrice) * 100;

    // Sanity filter: cap rates outside 2-15% are likely bad data
    if (capRate < 2 || capRate > 15) continue;

    // Calculate weight: combination of similarity, recency, and distance
    const weight = calculateWeight(comp);

    compCapRates.push({
      address: comp.address,
      salePrice: comp.salePrice,
      saleDate: comp.saleDate,
      units: comp.units,
      estimatedNOI: Math.round(estimatedNOI),
      capRate: Math.round(capRate * 100) / 100,
      weight: Math.round(weight * 100) / 100,
      distanceMiles: comp.distanceMiles,
      similarityScore: comp.similarityScore,
    });
  }

  // If too few valid comps after filtering, use fallback
  if (compCapRates.length < 2) {
    const fallback = buildFallbackResult(subject.borough);
    // If we have 1 comp, blend it with fallback
    if (compCapRates.length === 1) {
      const blended = compCapRates[0].capRate * 0.6 + fallback.marketCapRate * 0.4;
      return {
        ...fallback,
        marketCapRate: round2(blended),
        suggestedExitCap: round2(blended + 0.25),
        compCount: 1,
        compCapRates,
        confidence: "low",
        methodology: `Blended: 1 comp (${compCapRates[0].capRate.toFixed(2)}%) with ${subject.borough} submarket average`,
      };
    }
    return fallback;
  }

  // Weighted average cap rate
  let weightedSum = 0;
  let totalWeight = 0;
  for (const ccr of compCapRates) {
    weightedSum += ccr.capRate * ccr.weight;
    totalWeight += ccr.weight;
  }
  const marketCapRate = totalWeight > 0 ? weightedSum / totalWeight : compCapRates[0].capRate;

  // Sort for range/median
  const sortedRates = compCapRates.map(c => c.capRate).sort((a, b) => a - b);
  const low = sortedRates[0];
  const high = sortedRates[sortedRates.length - 1];
  const mid = Math.floor(sortedRates.length / 2);
  const median = sortedRates.length % 2 !== 0
    ? sortedRates[mid]
    : (sortedRates[mid - 1] + sortedRates[mid]) / 2;

  // Trend analysis: split comps into older half and newer half by sale date
  const trend = analyzeTrend(compCapRates);

  // Confidence based on comp count, weight spread, and rate dispersion
  const confidence = assessConfidence(compCapRates, sortedRates);

  // Suggested exit cap: market + 25bp (cap rate drift during hold period)
  const suggestedExitCap = round2(marketCapRate + 0.25);

  return {
    marketCapRate: round2(marketCapRate),
    range: { low: round2(low), high: round2(high) },
    median: round2(median),
    suggestedExitCap,
    compCount: compCapRates.length,
    confidence,
    trend: trend.direction,
    trendBpsPerYear: trend.bpsPerYear,
    compCapRates,
    methodology: `Derived from ${compCapRates.length} comparable sales using ${benchmark ? "RGB benchmark expenses" : "estimated expense ratios"} (wtd avg: ${round2(marketCapRate)}%, range: ${round2(low)}–${round2(high)}%)`,
  };
}

// ── Exit Sensitivity Builder ────────────────────────────────

export function buildExitSensitivity(
  marketCapRate: number,
  exitNOI: number,
  irrCalculator: (salePrice: number) => number,
): ExitSensitivity {
  // Optimistic: 50bp compression from market
  const optCap = Math.max(2, marketCapRate - 0.50);
  const optPrice = exitNOI / (optCap / 100);
  // Base: market + 25bp (standard exit spread)
  const baseCap = marketCapRate + 0.25;
  const basePrice = exitNOI / (baseCap / 100);
  // Conservative: market + 75bp
  const conCap = marketCapRate + 0.75;
  const conPrice = exitNOI / (conCap / 100);

  return {
    optimistic: { capRate: round2(optCap), salePrice: Math.round(optPrice), irr: round2(irrCalculator(optPrice)) },
    base: { capRate: round2(baseCap), salePrice: Math.round(basePrice), irr: round2(irrCalculator(basePrice)) },
    conservative: { capRate: round2(conCap), salePrice: Math.round(conPrice), irr: round2(irrCalculator(conPrice)) },
  };
}

// ── NOI Estimation for a Comp Sale ──────────────────────────

function estimateCompNOI(
  comp: CompProperty,
  benchmark: ExpenseBenchmark | null,
  subject: { borough: string; bldgClass: string },
  expenseRatioOverride?: number,
): number {
  // Strategy 1: Use expense benchmark if available
  if (benchmark && comp.units > 0) {
    // Scale benchmark expenses by comp unit count (not subject)
    // Adjust for comp building category if it differs significantly
    const compBenchmarkTotal = benchmark.totalPerUnit * comp.units;

    // Estimate gross income: price/unit × GIM inverse
    // Typical multifamily GIM in NYC: 10-15x → income ≈ price / 12
    const estimatedGrossIncome = comp.salePrice / 12;

    // Vacancy: 5% standard
    const egi = estimatedGrossIncome * 0.95;

    // NOI = EGI - benchmark expenses
    return egi - compBenchmarkTotal;
  }

  // Strategy 2: Use expense ratio
  const expenseRatio = expenseRatioOverride
    || EXPENSE_RATIO_BY_CLASS[subject.bldgClass?.[0] || ""]
    || EXPENSE_RATIO_BY_CLASS._default;

  // Estimate gross income from GIM
  const estimatedGrossIncome = comp.salePrice / 12;
  const egi = estimatedGrossIncome * 0.95;
  return egi * (1 - expenseRatio);
}

// ── Weight Calculation ──────────────────────────────────────

function calculateWeight(comp: CompProperty): number {
  let weight = 0;

  // Similarity score contribution (0-40)
  weight += (comp.similarityScore / 100) * 40;

  // Recency contribution (0-35)
  if (comp.saleDate) {
    const monthsAgo = Math.max(0, (Date.now() - new Date(comp.saleDate).getTime()) / (30.44 * 24 * 60 * 60 * 1000));
    if (monthsAgo <= 6) weight += 35;
    else if (monthsAgo <= 12) weight += 28;
    else if (monthsAgo <= 18) weight += 18;
    else if (monthsAgo <= 24) weight += 10;
    else weight += 5;
  }

  // Distance contribution (0-25)
  if (comp.distanceMiles <= 0.1) weight += 25;
  else if (comp.distanceMiles <= 0.25) weight += 20;
  else if (comp.distanceMiles <= 0.5) weight += 15;
  else if (comp.distanceMiles <= 1) weight += 10;
  else weight += 5;

  return weight;
}

// ── Trend Analysis ──────────────────────────────────────────

function analyzeTrend(compCapRates: CompCapRate[]): { direction: "compressing" | "stable" | "expanding"; bpsPerYear: number } {
  // Sort by date ascending
  const dated = compCapRates
    .filter(c => c.saleDate)
    .sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());

  if (dated.length < 3) return { direction: "stable", bpsPerYear: 0 };

  // Split into older and newer halves
  const midIdx = Math.floor(dated.length / 2);
  const older = dated.slice(0, midIdx);
  const newer = dated.slice(midIdx);

  const olderAvg = older.reduce((s, c) => s + c.capRate, 0) / older.length;
  const newerAvg = newer.reduce((s, c) => s + c.capRate, 0) / newer.length;

  // Time span in years
  const firstDate = new Date(dated[0].saleDate).getTime();
  const lastDate = new Date(dated[dated.length - 1].saleDate).getTime();
  const yearsSpan = Math.max(0.5, (lastDate - firstDate) / (365.25 * 24 * 60 * 60 * 1000));

  const totalBpChange = (newerAvg - olderAvg) * 100; // basis points
  const bpsPerYear = Math.round(totalBpChange / yearsSpan);

  let direction: "compressing" | "stable" | "expanding";
  if (bpsPerYear < -10) direction = "compressing";
  else if (bpsPerYear > 10) direction = "expanding";
  else direction = "stable";

  return { direction, bpsPerYear };
}

// ── Confidence Assessment ───────────────────────────────────

function assessConfidence(compCapRates: CompCapRate[], sortedRates: number[]): "high" | "medium" | "low" {
  // Factor 1: count
  const countScore = compCapRates.length >= 7 ? 3 : compCapRates.length >= 4 ? 2 : 1;

  // Factor 2: rate dispersion (coefficient of variation)
  const mean = sortedRates.reduce((s, v) => s + v, 0) / sortedRates.length;
  const variance = sortedRates.reduce((s, v) => s + (v - mean) ** 2, 0) / sortedRates.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  const spreadScore = cv < 0.10 ? 3 : cv < 0.20 ? 2 : 1;

  // Factor 3: average weight (quality of comps)
  const avgWeight = compCapRates.reduce((s, c) => s + c.weight, 0) / compCapRates.length;
  const weightScore = avgWeight >= 60 ? 3 : avgWeight >= 40 ? 2 : 1;

  const total = countScore + spreadScore + weightScore;
  if (total >= 8) return "high";
  if (total >= 5) return "medium";
  return "low";
}

// ── Fallback Result ─────────────────────────────────────────

function buildFallbackResult(borough: string): CapRateAnalysis {
  const rate = FALLBACK_CAP_RATES[borough] || FALLBACK_CAP_RATES._default;
  return {
    marketCapRate: rate,
    range: { low: rate - 0.75, high: rate + 0.75 },
    median: rate,
    suggestedExitCap: round2(rate + 0.25),
    compCount: 0,
    confidence: "low",
    trend: "stable",
    trendBpsPerYear: 0,
    compCapRates: [],
    methodology: `${borough} submarket average (no comparable sales available)`,
  };
}

// ── Utility ─────────────────────────────────────────────────

function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
