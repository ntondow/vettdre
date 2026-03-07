// ============================================================
// AI Deal Assumptions — One-Click Underwrite
// Generates full DealInputs from building data (PLUTO, DOF, ACRIS, HPD, DOB)
// Uses benchmark engine (expense-benchmarks.ts) and deal cost engine (nyc-deal-costs.ts)
// ============================================================

import type { DealInputs, UnitMixRow, CommercialTenant } from "./deal-calculator";
import type { HudFmrData } from "./hud";
import type { MarketAppreciation } from "./fhfa";
import type { RedfinMetrics } from "./redfin-market";
import { getExpenseBenchmark, classifyBuildingCategory, CATEGORY_LABELS } from "./expense-benchmarks";
import type { BenchmarkLineItem } from "./expense-benchmarks";
import { getBlendedRGBRate } from "./rent-stabilization";
import type { CapRateAnalysis } from "./cap-rate-engine";
import { calculateNYCClosingCosts, estimatePostAcquisitionTax } from "./nyc-deal-costs";
import type { ClosingCostBreakdown, TaxReassessment } from "./nyc-deal-costs";
import type { DealStructureType } from "./deal-structure-engine";

// ============================================================
// Building data from various NYC Open Data sources
// ============================================================
export interface BuildingData {
  // PLUTO
  address: string;
  borough: string;
  boroCode: string;
  block: string;
  lot: string;
  bbl: string;
  unitsRes: number;
  unitsTotal: number;
  yearBuilt: number;
  numFloors: number;
  assessTotal: number;
  bldgArea: number;
  lotArea: number;
  zoneDist: string;
  bldgClass: string;
  builtFar: number;
  residFar: number;
  ownerName: string;
  // ACRIS / Sales
  lastSalePrice: number;
  lastSaleDate: string;      // ISO date
  // HPD
  hpdUnits: number;
  hpdViolationCount: number;
  rentStabilizedUnits: number;
  // DOF
  marketValue: number;        // DOF market value
  annualTaxes: number;
  // DOB
  hasElevator: boolean;
  // Commercial (optional — from PLUTO comArea or building profile)
  commercialSqft?: number;
  commercialUnits?: number;
}

// ============================================================
// Rent estimates by borough + unit type (monthly) — NYC
// ============================================================
const MARKET_RENTS: Record<string, Record<string, number>> = {
  Manhattan: { Studio: 2800, "1BR": 3500, "2BR": 4800, "3BR": 6500 },
  Brooklyn: { Studio: 2200, "1BR": 2800, "2BR": 3600, "3BR": 4500 },
  Queens: { Studio: 1800, "1BR": 2200, "2BR": 2800, "3BR": 3400 },
  Bronx: { Studio: 1400, "1BR": 1700, "2BR": 2100, "3BR": 2500 },
  "Staten Island": { Studio: 1300, "1BR": 1600, "2BR": 2000, "3BR": 2400 },
};

// ============================================================
// Rent estimates by county — NYS (outside NYC)
// ============================================================
const NYS_MARKET_RENTS: Record<string, Record<string, number>> = {
  Westchester: { Studio: 1800, "1BR": 2200, "2BR": 2800, "3BR": 3500 },
  Nassau: { Studio: 1700, "1BR": 2100, "2BR": 2700, "3BR": 3300 },
  Suffolk: { Studio: 1500, "1BR": 1900, "2BR": 2400, "3BR": 3000 },
  Rockland: { Studio: 1400, "1BR": 1800, "2BR": 2300, "3BR": 2800 },
  Orange: { Studio: 1200, "1BR": 1500, "2BR": 1900, "3BR": 2300 },
  Dutchess: { Studio: 1100, "1BR": 1400, "2BR": 1800, "3BR": 2200 },
  Albany: { Studio: 900, "1BR": 1100, "2BR": 1400, "3BR": 1700 },
  Erie: { Studio: 700, "1BR": 900, "2BR": 1200, "3BR": 1500 },
  Monroe: { Studio: 800, "1BR": 1000, "2BR": 1300, "3BR": 1600 },
  Onondaga: { Studio: 700, "1BR": 900, "2BR": 1200, "3BR": 1500 },
  _default: { Studio: 800, "1BR": 1000, "2BR": 1300, "3BR": 1600 },
};

export function getNYSMarketRents(county: string): Record<string, number> {
  return NYS_MARKET_RENTS[county] || NYS_MARKET_RENTS._default;
}

// ============================================================
// Rent estimates by county — NJ
// ============================================================
const NJ_MARKET_RENTS: Record<string, Record<string, number>> = {
  Hudson: { Studio: 2000, "1BR": 2500, "2BR": 3200, "3BR": 4000 },
  Essex: { Studio: 1200, "1BR": 1500, "2BR": 1900, "3BR": 2300 },
  Bergen: { Studio: 1400, "1BR": 1800, "2BR": 2300, "3BR": 2800 },
  Passaic: { Studio: 1100, "1BR": 1400, "2BR": 1800, "3BR": 2200 },
  Middlesex: { Studio: 1300, "1BR": 1600, "2BR": 2100, "3BR": 2600 },
  Union: { Studio: 1200, "1BR": 1500, "2BR": 2000, "3BR": 2400 },
  Monmouth: { Studio: 1300, "1BR": 1600, "2BR": 2100, "3BR": 2600 },
  Ocean: { Studio: 1100, "1BR": 1400, "2BR": 1800, "3BR": 2200 },
  _default: { Studio: 1200, "1BR": 1500, "2BR": 1900, "3BR": 2300 },
};

export function getNJMarketRents(county: string): Record<string, number> {
  return NJ_MARKET_RENTS[county] || NJ_MARKET_RENTS._default;
}

// ============================================================
// SHARED HELPER: Estimate Purchase Price
// Extracted from inline code — used by NYC, NYS, NJ generators
// ============================================================
function estimatePurchasePrice(opts: {
  lastSalePrice: number;
  lastSaleDate: string;
  assessTotal?: number;
  fullMarketValue?: number;
  marketValue?: number;
  fallback?: number;
}): { price: number; assumed: boolean } {
  const { lastSalePrice, lastSaleDate, assessTotal = 0, fullMarketValue = 0, marketValue = 0, fallback = 5000000 } = opts;
  let price = 0;
  let assumed = false;

  if (lastSalePrice > 100000 && lastSaleDate) {
    const saleDate = new Date(lastSaleDate);
    const yearsAgo = Math.max(0, (Date.now() - saleDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (yearsAgo < 3) {
      price = Math.round(lastSalePrice * 1.15);
    } else {
      price = Math.round(lastSalePrice * (1 + yearsAgo * 0.04));
    }
    assumed = true;
  } else if (fullMarketValue > 0) {
    price = fullMarketValue;
    assumed = true;
  } else if (assessTotal > 0) {
    price = Math.round(assessTotal * 1.4);
    assumed = true;
  }

  // Floor at market value
  if (marketValue > 0 && price < marketValue) {
    price = marketValue;
  }

  if (price === 0) price = fallback;
  return { price, assumed };
}

// ============================================================
// SHARED HELPER: Calculate Vacancy Rate
// Nuanced with violation count, borough, and RS ratio
// ============================================================
function calculateVacancyRate(opts: {
  rsRatio: number;
  hpdViolationCount?: number;
  borough?: string;
}): number {
  const { rsRatio, hpdViolationCount = 0, borough } = opts;

  // Base vacancy by RS ratio
  let vacancy = rsRatio > 0.5 ? 3 : 5;

  // High violations = higher vacancy (distressed building)
  if (hpdViolationCount > 40) vacancy += 2;
  else if (hpdViolationCount > 20) vacancy += 1;

  // Borough adjustments (Manhattan = lower vacancy)
  if (borough === "Manhattan") vacancy = Math.max(2, vacancy - 1);
  else if (borough === "Bronx") vacancy += 1;

  return Math.max(2, Math.min(15, vacancy));
}

// ============================================================
// SHARED HELPER: Estimate Unit Mix with Sqft
// Enhanced with sqft calculation from bldgArea
// ============================================================
const DEFAULT_SQFT: Record<string, number> = {
  pre_war_walkup: 750,
  pre_war_elevator: 750,
  post_war_walkup: 650,
  post_war_elevator: 650,
  modern: 600,
  new_construction: 550,
};

const SQFT_RATIOS: Record<string, number> = {
  Studio: 0.55,
  "1BR": 0.85,
  "2BR": 1.15,
  "3BR": 1.45,
};

function estimateUnitMixDetailed(
  totalUnits: number,
  rents: Record<string, number>,
  multiplier: number,
  bldgArea?: number,
  numFloors?: number,
  yearBuilt?: number,
): UnitMixRow[] {
  const mix: UnitMixRow[] = [];

  // Determine building category for default sqft
  let categoryKey = "post_war_walkup";
  if (yearBuilt) {
    if (yearBuilt >= 2015) categoryKey = "new_construction";
    else if (yearBuilt >= 2000) categoryKey = "modern";
    else if (yearBuilt >= 1947) categoryKey = (numFloors && numFloors > 5) ? "post_war_elevator" : "post_war_walkup";
    else categoryKey = (numFloors && numFloors > 5) ? "pre_war_elevator" : "pre_war_walkup";
  }

  const avgSqftPerUnit = bldgArea && bldgArea > 0 && totalUnits > 0
    ? Math.round(bldgArea / totalUnits)
    : DEFAULT_SQFT[categoryKey] || 650;

  const addRow = (type: string, count: number) => {
    if (count > 0) {
      const marketRent = rents[type] || 0;
      const ratio = SQFT_RATIOS[type] || 1.0;
      mix.push({
        type,
        count,
        monthlyRent: Math.round(marketRent * multiplier),
        marketRent,
        sqft: Math.round(avgSqftPerUnit * ratio),
      });
    }
  };

  if (totalUnits < 10) {
    const oneBr = Math.max(1, Math.round(totalUnits * 0.3));
    const threeBr = Math.round(totalUnits * 0.2);
    const twoBr = totalUnits - oneBr - threeBr;
    addRow("1BR", oneBr);
    addRow("2BR", twoBr);
    addRow("3BR", threeBr);
  } else if (totalUnits <= 30) {
    const studios = Math.round(totalUnits * 0.2);
    const oneBr = Math.round(totalUnits * 0.4);
    const threeBr = Math.round(totalUnits * 0.1);
    const twoBr = totalUnits - studios - oneBr - threeBr;
    addRow("Studio", studios);
    addRow("1BR", oneBr);
    addRow("2BR", twoBr);
    addRow("3BR", threeBr);
  } else {
    const studios = Math.round(totalUnits * 0.25);
    const oneBr = Math.round(totalUnits * 0.35);
    const threeBr = Math.round(totalUnits * 0.1);
    const twoBr = totalUnits - studios - oneBr - threeBr;
    addRow("Studio", studios);
    addRow("1BR", oneBr);
    addRow("2BR", twoBr);
    addRow("3BR", threeBr);
  }

  return mix;
}

// Backward-compat wrapper (NYS/NJ without sqft data)
function estimateUnitMix(totalUnits: number, rents: Record<string, number>, multiplier: number): UnitMixRow[] {
  return estimateUnitMixDetailed(totalUnits, rents, multiplier);
}

// ============================================================
// SHARED HELPER: Generate Expenses from Benchmark Engine
// Replaces 25 hardcoded per-unit lines with RGB I&E data
// ============================================================
const BOROUGH_EXPENSE_FACTORS: Record<string, number> = {
  Manhattan: 1.15,
  Brooklyn: 1.05,
  Queens: 0.95,
  Bronx: 0.90,
  "Staten Island": 0.85,
};

interface ExpenseResult {
  realEstateTaxes: number;
  insurance: number;
  licenseFees: number;
  fireMeter: number;
  electricityGas: number;
  waterSewer: number;
  payroll: number;
  rmGeneral: number;
  rmCapexReserve: number;
  exterminating: number;
  landscaping: number;
  elevator: number;
  cleaning: number;
  trashRemoval: number;
  accounting: number;
  legal: number;
  marketing: number;
  generalAdmin: number;
  snowRemoval: number;
  alarmMonitoring: number;
  telephoneInternet: number;
  benchmarkNote: string;
}

function generateExpensesFromBenchmark(
  building: {
    yearBuilt: number;
    hasElevator: boolean;
    numFloors: number;
    bldgClass: string;
    bldgArea: number;
    hpdViolationCount?: number;
    annualTaxes?: number;
    assessTotal?: number;
    rentStabilizedUnits?: number;
  },
  units: number,
  borough: string,
): ExpenseResult {
  const boroughFactor = BOROUGH_EXPENSE_FACTORS[borough] || 1.0;
  const violationSurcharge = (building.hpdViolationCount || 0) > 20 ? 1.10 : 1.0;

  // Get benchmark data from RGB I&E engine
  let benchmarkItems: BenchmarkLineItem[] = [];
  let benchmarkNote = "";
  let categoryLabel = "";

  try {
    const benchmark = getExpenseBenchmark({
      yearBuilt: building.yearBuilt,
      hasElevator: building.hasElevator,
      numFloors: building.numFloors,
      bldgClass: building.bldgClass,
      bldgArea: building.bldgArea,
      unitsRes: units,
      borough,
      rentStabilizedUnits: building.rentStabilizedUnits,
    });
    benchmarkItems = benchmark.lineItems;
    categoryLabel = benchmark.categoryLabel;
    benchmarkNote = `RGB benchmark (${benchmark.categoryLabel}): $${benchmark.totalPerUnit.toLocaleString()}/unit/yr`;
  } catch {
    // Fallback to empty — will use per-unit defaults below
  }

  // Build lookup from benchmark items
  const bmLookup: Record<string, number> = {};
  for (const item of benchmarkItems) {
    bmLookup[item.field] = item.totalAnnual;
  }

  // Map benchmark fields to expenses (use benchmark when available, else per-unit estimate)
  const insurance = bmLookup.insurance || Math.round(1600 * units * boroughFactor);
  const electricityGas = bmLookup.electricityGas || Math.round(1200 * units * boroughFactor);
  const waterSewer = bmLookup.waterSewer || Math.round(750 * units * boroughFactor);
  const payroll = bmLookup.payroll || Math.round(1200 * units * boroughFactor);
  const rmGeneral = bmLookup.rmGeneral || Math.round(1800 * units * boroughFactor);
  const cleaning = bmLookup.cleaning || Math.round(600 * units * boroughFactor);
  const trashRemoval = bmLookup.trashRemoval || Math.round(850 * units * boroughFactor);
  const elevator = bmLookup.elevator || ((building.hasElevator || building.numFloors > 5) ? Math.round(10000 * boroughFactor) : 0);
  const exterminating = bmLookup.exterminating || Math.round(130 * units * boroughFactor);
  const legal = bmLookup.legal || Math.round(2000 * boroughFactor);
  const accounting = bmLookup.accounting || Math.round(4000 * boroughFactor);

  // Non-benchmark fields: borough-scaled per-unit estimates
  const realEstateTaxes = (building.annualTaxes && building.annualTaxes > 0)
    ? building.annualTaxes
    : Math.round((building.assessTotal || 0) * 0.123);
  const licenseFees = Math.round((borough === "Manhattan" ? 550 : borough === "Brooklyn" ? 500 : 400) * units * boroughFactor);
  const fireMeter = Math.round((borough === "Manhattan" ? 200 : 150) * units * boroughFactor);
  const rmCapexReserve = Math.round(325 * units);
  const marketing = borough === "Manhattan" ? 15000 : 10000;
  const generalAdmin = borough === "Manhattan" ? 3500 : 2500;
  const landscaping = Math.min(Math.round(900 * units), 25000);
  const snowRemoval = borough === "Manhattan" ? 10000 : 8000;
  const alarmMonitoring = borough === "Manhattan" ? 5000 : 3500;
  const telephoneInternet = borough === "Manhattan" ? 9000 : 6000;

  // Apply violation surcharge to relevant fields
  const applyViolationSurcharge = (val: number) => Math.round(val * violationSurcharge);

  return {
    realEstateTaxes,
    insurance: applyViolationSurcharge(insurance),
    licenseFees,
    fireMeter,
    electricityGas: applyViolationSurcharge(electricityGas),
    waterSewer: applyViolationSurcharge(waterSewer),
    payroll,
    rmGeneral: applyViolationSurcharge(rmGeneral),
    rmCapexReserve,
    exterminating: applyViolationSurcharge(exterminating),
    landscaping,
    elevator,
    cleaning: applyViolationSurcharge(cleaning),
    trashRemoval,
    accounting,
    legal,
    marketing,
    generalAdmin,
    snowRemoval,
    alarmMonitoring,
    telephoneInternet,
    benchmarkNote: benchmarkNote + (categoryLabel ? "" : " (fallback: per-unit estimates)"),
  };
}

// ============================================================
// SHARED HELPER: Generate Acquisition Costs (NYC)
// Calls calculateNYCClosingCosts for itemized breakdown
// ============================================================
function generateAcquisitionCosts(
  purchasePrice: number,
  loanAmount: number,
  structure: DealStructureType,
  units: number,
  borough?: string,
): { closingCosts: number; acquisitionCosts: DealInputs["acquisitionCosts"] } {
  try {
    const breakdown = calculateNYCClosingCosts({
      purchasePrice,
      loanAmount,
      structure,
      units,
      isNewLoan: structure !== "assumable",
      propertyType: units >= 4 ? "commercial" : "residential",
      borough,
    });

    const acqCosts = {
      titleInsurance: breakdown.titleInsurance,
      mortgageRecordingTax: breakdown.mortgageRecordingTax,
      mansionTax: breakdown.mansionTax,
      transferTax: breakdown.nycTransferTax + breakdown.nysTransferTax,
      legalFees: breakdown.buyerAttorneyFee + breakdown.bankAttorneyFee,
      inspections: breakdown.engineeringInspection + breakdown.environmentalReport,
      appraisal: breakdown.appraisalFee,
      miscClosing: breakdown.miscFees + breakdown.titleSearchFee + breakdown.surveyFee + breakdown.organizationalCosts,
    };

    // Sum for flat closingCosts (backward compat)
    const total = breakdown.totalBuyerCosts;

    return { closingCosts: total, acquisitionCosts: acqCosts };
  } catch {
    // Fallback to flat estimate
    const flat = Math.round(purchasePrice * 0.035);
    return { closingCosts: flat, acquisitionCosts: undefined };
  }
}

// ============================================================
// SHARED HELPER: Select Deal Structure
// Scores building signals to recommend a structure
// ============================================================
function selectDealStructure(
  building: { hpdViolationCount?: number; rentStabilizedUnits?: number; lastSaleDate?: string; yearBuilt?: number },
  units: number,
  purchasePrice: number,
): { structure: DealStructureType; reasoning: string } {
  const rsRatio = (building.rentStabilizedUnits || 0) > 0 ? (building.rentStabilizedUnits || 0) / units : 0;
  const violations = building.hpdViolationCount || 0;

  // High violations + heavy RS → bridge/value-add play
  if (violations > 25 && rsRatio > 0.5) {
    return { structure: "bridge_refi", reasoning: `${violations} HPD violations + ${Math.round(rsRatio * 100)}% rent-stabilized → value-add candidate (BRRRR strategy)` };
  }

  // Small deal → all cash
  if (purchasePrice < 2000000) {
    return { structure: "all_cash", reasoning: `Purchase price under $2M → all-cash structure recommended for speed and simplicity` };
  }

  // Clean building, low RS → conventional
  if (violations < 10 && rsRatio < 0.3) {
    return { structure: "conventional", reasoning: `Low violations (${violations}) + low RS (${Math.round(rsRatio * 100)}%) → standard conventional financing` };
  }

  // Recent sale within 2 years + moderate distress → could be assumable
  if (building.lastSaleDate) {
    const saleDate = new Date(building.lastSaleDate);
    const yearsAgo = (Date.now() - saleDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsAgo < 2 && purchasePrice > 5000000) {
      return { structure: "assumable", reasoning: `Recent sale (${yearsAgo.toFixed(1)}yr ago) → check for assumable below-market-rate debt` };
    }
  }

  return { structure: "conventional", reasoning: "Standard multifamily profile → conventional financing" };
}

// ============================================================
// SHARED HELPER: Generate Financing Assumptions
// Structure-aware defaults for LTV, rate, amort, term
// ============================================================
function generateFinancingAssumptions(
  purchasePrice: number,
  structure: DealStructureType,
  baseRate: number,
): { ltvPercent: number; interestRate: number; amortizationYears: number; loanTermYears: number; interestOnly: boolean; originationFeePercent: number } {
  switch (structure) {
    case "all_cash":
      return { ltvPercent: 0, interestRate: 0, amortizationYears: 0, loanTermYears: 0, interestOnly: false, originationFeePercent: 0 };

    case "bridge_refi":
      return {
        ltvPercent: 75,
        interestRate: Math.max(9, baseRate + 2.5),
        amortizationYears: 0,
        loanTermYears: 3,
        interestOnly: true,
        originationFeePercent: 2,
      };

    case "assumable":
      return {
        ltvPercent: 65,
        interestRate: Math.max(3.5, baseRate - 2),
        amortizationYears: 30,
        loanTermYears: 30,
        interestOnly: false,
        originationFeePercent: 0.5,
      };

    case "syndication":
      return {
        ltvPercent: 65,
        interestRate: baseRate,
        amortizationYears: 30,
        loanTermYears: 7,
        interestOnly: false,
        originationFeePercent: 1,
      };

    case "conventional":
    default:
      return {
        ltvPercent: purchasePrice > 10000000 ? 70 : 75,
        interestRate: baseRate,
        amortizationYears: 30,
        loanTermYears: purchasePrice > 10000000 ? 10 : 5,
        interestOnly: false,
        originationFeePercent: 1,
      };
  }
}

// ============================================================
// SHARED HELPER: Generate Lease-Up / Value-Add Assumptions
// Detects renovation/lease-up signals from building data
// ============================================================
function generateLeaseUpAssumptions(
  building: {
    hpdViolationCount?: number;
    rentStabilizedUnits?: number;
    lastSaleDate?: string;
    yearBuilt?: number;
  },
  units: number,
): { renovationBudget: number; renovationMonths: number; leaseUpMonths: number; startingOccupancy: number } | null {
  let score = 0;
  const rsRatio = (building.rentStabilizedUnits || 0) > 0 ? (building.rentStabilizedUnits || 0) / units : 0;

  if ((building.hpdViolationCount || 0) > 40) score += 2;
  else if ((building.hpdViolationCount || 0) > 15) score += 3;

  if (building.lastSaleDate) {
    const yearsAgo = (Date.now() - new Date(building.lastSaleDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (yearsAgo < 2) score += 2;
  }

  if (rsRatio > 0.7 && (building.yearBuilt || 2000) < 1970) score += 2;
  if ((building.yearBuilt || 2000) < 1947) score += 1;

  if (score < 4) return null;

  // Value-add detected
  const perUnitReno = score >= 6 ? 50000 : score >= 5 ? 40000 : 30000;
  return {
    renovationBudget: perUnitReno * units,
    renovationMonths: score >= 6 ? 12 : score >= 5 ? 9 : 6,
    leaseUpMonths: Math.min(18, Math.round(units * 0.5)),
    startingOccupancy: score >= 6 ? 30 : 40,
  };
}

// ============================================================
// SHARED HELPER: Rent Growth from Market Appreciation
// ============================================================
function getRentGrowth(marketAppreciation?: MarketAppreciation): number {
  let rentGrowth = 3;
  if (marketAppreciation?.localAppreciation1Yr != null) {
    const appr = marketAppreciation.localAppreciation1Yr;
    if (appr > 7) rentGrowth = 4;
    else if (appr > 5) rentGrowth = 3.5;
    else if (appr < -2) rentGrowth = 2;
    else if (appr < 0) rentGrowth = 2.5;
  }
  return rentGrowth;
}

// ============================================================
// SHARED HELPER: Calculate Going-In Cap & Exit Cap
// ============================================================
function calculateExitCap(gpr: number, vacancyRate: number, mgmtPct: number, totalFixedExpenses: number, purchasePrice: number): number {
  const vacLoss = gpr * (vacancyRate / 100);
  const totalIncome = gpr - vacLoss;
  const mgmtFee = totalIncome * (mgmtPct / 100);
  const estNoi = totalIncome - mgmtFee - totalFixedExpenses;
  const goingInCap = purchasePrice > 0 ? (estNoi / purchasePrice) * 100 : 5.5;
  return Math.max(3, Math.round((goingInCap - 0.25) * 100) / 100);
}

// ============================================================
// RGB I&E Study 2024 Benchmark Data
// Per dwelling unit per MONTH — from NYC RGB Income & Expense Study
// (Based on 2022 RPIE filings, 15,110 buildings, 702,010 units)
// ============================================================

interface RGBBenchmarkRow {
  taxes: number; labor: number; fuel: number; waterSewer: number;
  lightPower: number; maintenance: number; admin: number;
  insurance: number; misc: number; total: number;
}

type RGBSizeBucket = "11-19" | "20-99" | "100+";

export const RGB_BENCHMARKS: Record<string, Record<RGBSizeBucket, RGBBenchmarkRow>> = {
  brooklyn_pre74: {
    "11-19": { taxes: 277, labor: 76, fuel: 96, waterSewer: 70, lightPower: 25, maintenance: 230, admin: 116, insurance: 68, misc: 54, total: 1013 },
    "20-99": { taxes: 270, labor: 72, fuel: 77, waterSewer: 81, lightPower: 24, maintenance: 179, admin: 116, insurance: 75, misc: 51, total: 944 },
    "100+":  { taxes: 310, labor: 141, fuel: 63, waterSewer: 74, lightPower: 32, maintenance: 191, admin: 137, insurance: 78, misc: 41, total: 1066 },
  },
  brooklyn_post73: {
    "11-19": { taxes: 153, labor: 78, fuel: 64, waterSewer: 63, lightPower: 51, maintenance: 251, admin: 229, insurance: 59, misc: 97, total: 1046 },
    "20-99": { taxes: 134, labor: 114, fuel: 39, waterSewer: 51, lightPower: 60, maintenance: 240, admin: 197, insurance: 58, misc: 98, total: 991 },
    "100+":  { taxes: 120, labor: 219, fuel: 47, waterSewer: 43, lightPower: 62, maintenance: 216, admin: 187, insurance: 66, misc: 72, total: 1032 },
  },
  manhattan_pre74: {
    "11-19": { taxes: 521, labor: 115, fuel: 134, waterSewer: 79, lightPower: 45, maintenance: 260, admin: 178, insurance: 89, misc: 83, total: 1504 },
    "20-99": { taxes: 427, labor: 110, fuel: 115, waterSewer: 75, lightPower: 37, maintenance: 237, admin: 161, insurance: 84, misc: 78, total: 1324 },
    "100+":  { taxes: 752, labor: 365, fuel: 98, waterSewer: 62, lightPower: 60, maintenance: 241, admin: 235, insurance: 81, misc: 88, total: 1981 },
  },
  manhattan_post73: {
    "11-19": { taxes: 301, labor: 119, fuel: 77, waterSewer: 51, lightPower: 71, maintenance: 206, admin: 182, insurance: 86, misc: 104, total: 1195 },
    "20-99": { taxes: 360, labor: 147, fuel: 64, waterSewer: 52, lightPower: 66, maintenance: 215, admin: 250, insurance: 72, misc: 115, total: 1341 },
    "100+":  { taxes: 741, labor: 410, fuel: 77, waterSewer: 48, lightPower: 64, maintenance: 259, admin: 281, insurance: 71, misc: 121, total: 2074 },
  },
  bronx_pre74: {
    "11-19": { taxes: 166, labor: 81, fuel: 145, waterSewer: 77, lightPower: 35, maintenance: 245, admin: 97, insurance: 87, misc: 23, total: 957 },
    "20-99": { taxes: 178, labor: 80, fuel: 117, waterSewer: 85, lightPower: 32, maintenance: 187, admin: 106, insurance: 96, misc: 34, total: 915 },
    "100+":  { taxes: 193, labor: 116, fuel: 97, waterSewer: 79, lightPower: 38, maintenance: 181, admin: 113, insurance: 99, misc: 47, total: 963 },
  },
  queens_pre74: {
    "11-19": { taxes: 270, labor: 81, fuel: 118, waterSewer: 64, lightPower: 26, maintenance: 208, admin: 87, insurance: 54, misc: 49, total: 957 },
    "20-99": { taxes: 315, labor: 91, fuel: 95, waterSewer: 72, lightPower: 29, maintenance: 187, admin: 113, insurance: 66, misc: 50, total: 1017 },
    "100+":  { taxes: 345, labor: 163, fuel: 74, waterSewer: 70, lightPower: 32, maintenance: 186, admin: 141, insurance: 71, misc: 73, total: 1155 },
  },
  citywide: {
    "11-19": { taxes: 348, labor: 92, fuel: 122, waterSewer: 74, lightPower: 34, maintenance: 242, admin: 132, insurance: 77, misc: 60, total: 1181 },
    "20-99": { taxes: 282, labor: 87, fuel: 103, waterSewer: 80, lightPower: 31, maintenance: 197, admin: 123, insurance: 83, misc: 51, total: 1037 },
    "100+":  { taxes: 446, labor: 218, fuel: 84, waterSewer: 70, lightPower: 42, maintenance: 205, admin: 167, insurance: 80, misc: 67, total: 1377 },
  },
};

export const RGB_EXPENSE_RATIOS = {
  citywide_adjusted: 0.629,
  brooklyn: 0.60,
  manhattan: 0.62,
  bronx: 0.73,
  queens: 0.67,
  taxes_share_of_costs: 0.278,
} as const;

// ============================================================
// RGB Benchmark Lookup
// Returns the per-unit-per-MONTH benchmark for a building's
// borough, age, and size class. Falls back to citywide.
// ============================================================
export function getRGBBenchmark(borough: string, yearBuilt: number | null, units: number): RGBBenchmarkRow {
  const age = (yearBuilt && yearBuilt >= 1974) ? "post73" : "pre74";
  const sizeBucket: RGBSizeBucket = units >= 100 ? "100+" : units >= 20 ? "20-99" : "11-19";

  const boroughMap: Record<string, string> = {
    Brooklyn: "brooklyn",
    Manhattan: "manhattan",
    Bronx: "bronx",
    Queens: "queens",
    "Staten Island": "queens", // fall back to Queens data for SI
  };

  const boroughKey = boroughMap[borough] || "citywide";
  // Not all borough+age combos exist (no post73 data for Bronx/Queens)
  const key = `${boroughKey}_${age}`;
  return RGB_BENCHMARKS[key]?.[sizeBucket] ?? RGB_BENCHMARKS.citywide[sizeBucket];
}

// ============================================================
// RGB Benchmark → DealInputs field mapping
// Converts monthly per-unit RGB categories to annual totals
// for the 23 DealInputs expense fields
// ============================================================
export interface RGBExpenseBenchmark {
  realEstateTaxes: number;
  insurance: number;
  electricityGas: number;
  waterSewer: number;
  payroll: number;
  rmGeneral: number;
  cleaning: number;
  trashRemoval: number;
  exterminating: number;
  elevator: number;
  licenseFees: number;
  fireMeter: number;
  rmCapexReserve: number;
  accounting: number;
  legal: number;
  marketing: number;
  generalAdmin: number;
  landscaping: number;
  snowRemoval: number;
  alarmMonitoring: number;
  telephoneInternet: number;
  totalPerUnitYear: number;
  label: string;
}

export function getRGBExpenseBenchmarkMapped(borough: string, yearBuilt: number | null, units: number): RGBExpenseBenchmark {
  const bm = getRGBBenchmark(borough, yearBuilt, units);
  const u = Math.max(1, units);
  // Monthly per-unit → annual per-unit
  const taxesAnn = bm.taxes * 12;
  const laborAnn = bm.labor * 12;
  const fuelAnn = bm.fuel * 12;
  const waterAnn = bm.waterSewer * 12;
  const elecAnn = bm.lightPower * 12;
  const maintAnn = bm.maintenance * 12;
  const adminAnn = bm.admin * 12;
  const insAnn = bm.insurance * 12;
  const miscAnn = bm.misc * 12;

  // Map RGB categories → DealInputs fields (annual total for building)
  // RGB "maintenance" → rmGeneral + cleaning portion
  // RGB "misc" → exterminating, trash, landscaping, snow, alarm, phone, elevator portion
  // RGB "admin" → accounting, legal, marketing, generalAdmin, licenseFees, fireMeter
  // RGB "labor" → payroll
  return {
    realEstateTaxes: taxesAnn,    // per unit — caller must × units for total
    insurance: insAnn,
    electricityGas: fuelAnn + elecAnn,
    waterSewer: waterAnn,
    payroll: laborAnn,
    rmGeneral: Math.round(maintAnn * 0.70),    // ~70% of maintenance → R&M general
    cleaning: Math.round(maintAnn * 0.20),      // ~20% of maintenance → cleaning
    trashRemoval: Math.round(miscAnn * 0.35),   // ~35% of misc → trash
    exterminating: Math.round(miscAnn * 0.10),   // ~10% of misc → exterminating
    elevator: Math.round(miscAnn * 0.20),        // ~20% of misc → elevator (0 for walkups)
    licenseFees: Math.round(adminAnn * 0.15),    // ~15% of admin → license/permits
    fireMeter: Math.round(adminAnn * 0.05),      // ~5% of admin → fire meter
    rmCapexReserve: Math.round(maintAnn * 0.10), // ~10% of maintenance → capex reserve
    accounting: Math.round(adminAnn * 0.15),     // ~15% of admin → accounting
    legal: Math.round(adminAnn * 0.10),          // ~10% of admin → legal
    marketing: Math.round(adminAnn * 0.15),      // ~15% of admin → marketing
    generalAdmin: Math.round(adminAnn * 0.15),   // ~15% of admin → general admin
    landscaping: Math.round(miscAnn * 0.10),     // ~10% of misc → landscaping
    snowRemoval: Math.round(miscAnn * 0.10),     // ~10% of misc → snow
    alarmMonitoring: Math.round(miscAnn * 0.08), // ~8% of misc → alarm
    telephoneInternet: Math.round(miscAnn * 0.07), // ~7% of misc → phone/internet
    totalPerUnitYear: bm.total * 12,
    label: `RGB ${borough} ${yearBuilt && yearBuilt >= 1974 ? "post-73" : "pre-74"} ${units >= 100 ? "100+" : units >= 20 ? "20-99" : "11-19"} units`,
  };
}

// ============================================================
// Expense Validation & Correction
// Runs after AI generates expenses, caps outliers against RGB benchmarks
// ============================================================
export interface ExpenseValidationResult {
  warnings: string[];
  benchmarkComparison: {
    expenseRatio: { ai: number; benchmark: number };
    taxesPerUnit: { ai: number; benchmark: number };
    totalPerUnit: { ai: number; benchmark: number };
  };
}

function sumExpenses(inputs: DealInputs): number {
  return (
    inputs.realEstateTaxes + inputs.insurance + inputs.licenseFees + inputs.fireMeter +
    inputs.electricityGas + inputs.waterSewer + inputs.payroll +
    inputs.accounting + inputs.legal + inputs.marketing +
    inputs.rmGeneral + inputs.rmCapexReserve + inputs.generalAdmin +
    inputs.exterminating + inputs.landscaping + inputs.snowRemoval +
    inputs.elevator + inputs.alarmMonitoring + inputs.telephoneInternet +
    inputs.cleaning + inputs.trashRemoval + inputs.otherContractServices
  );
}

function validateAndCorrectExpenses(
  inputs: DealInputs,
  borough: string,
  yearBuilt: number | null,
  units: number,
): ExpenseValidationResult {
  const warnings: string[] = [];
  const bm = getRGBExpenseBenchmarkMapped(borough, yearBuilt, units);
  const u = Math.max(1, units);

  // Calculate EGI for ratio checks
  const gpr = inputs.unitMix.reduce((s, r) => s + r.count * r.monthlyRent * 12, 0);
  const commercialIncome = inputs.commercialTenants
    ? inputs.commercialTenants.reduce((s, t) => s + t.rentAnnual, 0)
    : inputs.commercialRentAnnual;
  const vacLoss = gpr * (inputs.residentialVacancyRate / 100);
  const egi = gpr - vacLoss + commercialIncome;

  // ── 1. TAX SANITY CHECK ──
  const taxPerUnit = inputs.realEstateTaxes / u;
  const benchmarkTaxAnnual = bm.realEstateTaxes; // already annual per unit
  const maxTaxPerUnit = benchmarkTaxAnnual * 3;
  const taxAsShareOfEGI = egi > 0 ? inputs.realEstateTaxes / egi : 0;

  if (taxPerUnit > maxTaxPerUnit && maxTaxPerUnit > 0) {
    const capped = Math.round(maxTaxPerUnit * u);
    warnings.push(`RE Taxes capped: AI $${Math.round(taxPerUnit).toLocaleString()}/unit → $${Math.round(maxTaxPerUnit).toLocaleString()}/unit (3× RGB benchmark $${Math.round(benchmarkTaxAnnual).toLocaleString()}/unit)`);
    inputs.realEstateTaxes = capped;
  }
  if (taxAsShareOfEGI > 0.40 && egi > 0) {
    const cappedTax = Math.round(egi * 0.35);
    if (cappedTax < inputs.realEstateTaxes) {
      warnings.push(`RE Taxes capped at 35% of EGI (was ${(taxAsShareOfEGI * 100).toFixed(1)}%)`);
      inputs.realEstateTaxes = cappedTax;
    }
  }

  // ── 2. PER-CATEGORY BOUNDS CHECK ──
  // No single non-tax category should exceed 3× its RGB benchmark
  const categoryChecks: { field: keyof DealInputs; bmField: keyof RGBExpenseBenchmark; label: string }[] = [
    { field: "insurance", bmField: "insurance", label: "Insurance" },
    { field: "electricityGas", bmField: "electricityGas", label: "Electric/Gas" },
    { field: "waterSewer", bmField: "waterSewer", label: "Water/Sewer" },
    { field: "payroll", bmField: "payroll", label: "Payroll" },
    { field: "rmGeneral", bmField: "rmGeneral", label: "R&M General" },
    { field: "cleaning", bmField: "cleaning", label: "Cleaning" },
    { field: "trashRemoval", bmField: "trashRemoval", label: "Trash Removal" },
    { field: "exterminating", bmField: "exterminating", label: "Exterminating" },
    { field: "accounting", bmField: "accounting", label: "Accounting" },
    { field: "legal", bmField: "legal", label: "Legal" },
    { field: "licenseFees", bmField: "licenseFees", label: "License/Permit" },
  ];

  for (const check of categoryChecks) {
    const aiVal = (inputs[check.field] as number) / u;
    const benchVal = bm[check.bmField] as number; // annual per unit
    if (benchVal > 0 && aiVal > benchVal * 3) {
      const capped = Math.round(benchVal * 2.5 * u);
      warnings.push(`${check.label} capped: $${Math.round(aiVal).toLocaleString()}/unit → $${Math.round(benchVal * 2.5).toLocaleString()}/unit (2.5× RGB benchmark)`);
      (inputs as any)[check.field] = capped;
    }
  }

  // ── 3. MISC CATEGORY AGGREGATE CAP ──
  // RGB "misc" is one category — individual items shouldn't collectively exceed 3× misc benchmark
  const miscBenchmarkAnnual = (getRGBBenchmark(borough, yearBuilt, units).misc * 12) * u;
  const miscTotal = inputs.trashRemoval + inputs.exterminating + inputs.landscaping +
    inputs.snowRemoval + inputs.elevator + inputs.alarmMonitoring + inputs.telephoneInternet;
  if (miscBenchmarkAnnual > 0 && miscTotal > miscBenchmarkAnnual * 3) {
    const scaleFactor = (miscBenchmarkAnnual * 2.5) / miscTotal;
    inputs.trashRemoval = Math.round(inputs.trashRemoval * scaleFactor);
    inputs.exterminating = Math.round(inputs.exterminating * scaleFactor);
    inputs.landscaping = Math.round(inputs.landscaping * scaleFactor);
    inputs.snowRemoval = Math.round(inputs.snowRemoval * scaleFactor);
    inputs.elevator = Math.round(inputs.elevator * scaleFactor);
    inputs.alarmMonitoring = Math.round(inputs.alarmMonitoring * scaleFactor);
    inputs.telephoneInternet = Math.round(inputs.telephoneInternet * scaleFactor);
    warnings.push(`Misc expenses scaled: collective $${Math.round(miscTotal / u).toLocaleString()}/unit exceeded 3× RGB misc ($${Math.round(miscBenchmarkAnnual / u).toLocaleString()}/unit)`);
  }

  // ── 4. TOTAL EXPENSE RATIO CHECK ──
  const totalExpenses = sumExpenses(inputs);
  const mgmtFee = egi > 0 ? egi * (inputs.managementFeePercent / 100) : 0;
  const allInExpenses = totalExpenses + mgmtFee;
  const expenseRatio = egi > 0 ? allInExpenses / egi : 0;

  if (expenseRatio > 0.80 && egi > 0) {
    const targetRatio = 0.70;
    const targetTotal = egi * targetRatio - mgmtFee;
    if (targetTotal > 0 && targetTotal < totalExpenses) {
      const scaleFactor = targetTotal / totalExpenses;
      // Scale all non-tax expenses proportionally (taxes already validated above)
      const taxShare = inputs.realEstateTaxes;
      const nonTaxTotal = totalExpenses - taxShare;
      const nonTaxTarget = targetTotal - taxShare;
      if (nonTaxTotal > 0 && nonTaxTarget > 0) {
        const nonTaxScale = nonTaxTarget / nonTaxTotal;
        inputs.insurance = Math.round(inputs.insurance * nonTaxScale);
        inputs.licenseFees = Math.round(inputs.licenseFees * nonTaxScale);
        inputs.fireMeter = Math.round(inputs.fireMeter * nonTaxScale);
        inputs.electricityGas = Math.round(inputs.electricityGas * nonTaxScale);
        inputs.waterSewer = Math.round(inputs.waterSewer * nonTaxScale);
        inputs.payroll = Math.round(inputs.payroll * nonTaxScale);
        inputs.accounting = Math.round(inputs.accounting * nonTaxScale);
        inputs.legal = Math.round(inputs.legal * nonTaxScale);
        inputs.marketing = Math.round(inputs.marketing * nonTaxScale);
        inputs.rmGeneral = Math.round(inputs.rmGeneral * nonTaxScale);
        inputs.rmCapexReserve = Math.round(inputs.rmCapexReserve * nonTaxScale);
        inputs.generalAdmin = Math.round(inputs.generalAdmin * nonTaxScale);
        inputs.exterminating = Math.round(inputs.exterminating * nonTaxScale);
        inputs.landscaping = Math.round(inputs.landscaping * nonTaxScale);
        inputs.snowRemoval = Math.round(inputs.snowRemoval * nonTaxScale);
        inputs.elevator = Math.round(inputs.elevator * nonTaxScale);
        inputs.alarmMonitoring = Math.round(inputs.alarmMonitoring * nonTaxScale);
        inputs.telephoneInternet = Math.round(inputs.telephoneInternet * nonTaxScale);
        inputs.cleaning = Math.round(inputs.cleaning * nonTaxScale);
        inputs.trashRemoval = Math.round(inputs.trashRemoval * nonTaxScale);
        warnings.push(`Expense ratio ${(expenseRatio * 100).toFixed(1)}% exceeded 80% — non-tax expenses scaled to target 70% ratio (RGB avg: 62.9%)`);
      }
    }
  }

  // Build comparison data
  const finalTotal = sumExpenses(inputs);
  const finalRatio = egi > 0 ? (finalTotal + mgmtFee) / egi : 0;

  return {
    warnings,
    benchmarkComparison: {
      expenseRatio: { ai: finalRatio, benchmark: RGB_EXPENSE_RATIOS[borough === "Brooklyn" ? "brooklyn" : borough === "Manhattan" ? "manhattan" : borough === "Bronx" ? "bronx" : borough === "Queens" ? "queens" : "citywide_adjusted"] ?? RGB_EXPENSE_RATIOS.citywide_adjusted },
      taxesPerUnit: { ai: inputs.realEstateTaxes / u, benchmark: bm.realEstateTaxes },
      totalPerUnit: { ai: finalTotal / u, benchmark: bm.totalPerUnitYear },
    },
  };
}

// ============================================================
// SHARED HELPER: Build Assumption Flags
// Marks all standard fields as AI-assumed
// ============================================================
function buildStandardAssumptionFlags(): Record<string, boolean> {
  return {
    purchasePrice: true,
    unitMix: true,
    residentialVacancyRate: true,
    insurance: true,
    licenseFees: true,
    fireMeter: true,
    electricityGas: true,
    waterSewer: true,
    payroll: true,
    rmGeneral: true,
    rmCapexReserve: true,
    exterminating: true,
    landscaping: true,
    elevator: true,
    cleaning: true,
    trashRemoval: true,
    accounting: true,
    legal: true,
    marketing: true,
    generalAdmin: true,
    snowRemoval: true,
    alarmMonitoring: true,
    telephoneInternet: true,
    closingCosts: true,
    exitCapRate: true,
    sellingCostPercent: true,
    holdPeriodYears: true,
    annualRentGrowth: true,
    annualExpenseGrowth: true,
    ltvPercent: true,
    interestRate: true,
    managementFeePercent: true,
    originationFeePercent: true,
    commercialVacancyRate: true,
    concessions: true,
    commercialRentAnnual: true,
  };
}

// ============================================================
// Generate full deal assumptions from building data (NYC)
// ============================================================
export function generateDealAssumptions(
  building: BuildingData,
  options?: { liveInterestRate?: number; hudFmr?: HudFmrData; marketAppreciation?: MarketAppreciation; redfinMetrics?: RedfinMetrics; capRateAnalysis?: CapRateAnalysis },
): DealInputs {
  const units = building.unitsRes || building.hpdUnits || building.unitsTotal || 1;
  const borough = building.borough || "Brooklyn";
  const rents = MARKET_RENTS[borough] || MARKET_RENTS["Brooklyn"];
  const assumptions = buildStandardAssumptionFlags();

  // -- OFFER PRICE --
  const { price: purchasePrice } = estimatePurchasePrice({
    lastSalePrice: building.lastSalePrice,
    lastSaleDate: building.lastSaleDate,
    assessTotal: building.assessTotal,
    marketValue: building.marketValue,
    fallback: 5000000,
  });

  // -- RENT ADJUSTMENTS --
  let rentMultiplier = 1.0;
  if (building.yearBuilt > 0 && building.yearBuilt < 1950) rentMultiplier *= 0.90;
  if (building.yearBuilt >= 2000) rentMultiplier *= 1.10;

  const rsRatio = building.rentStabilizedUnits > 0 ? building.rentStabilizedUnits / units : 0;
  const rsMultiplier = 0.60;
  const blendedMultiplier = rentMultiplier * (1 - rsRatio + rsRatio * rsMultiplier);

  // -- UNIT MIX (enhanced with sqft) --
  const unitMix = estimateUnitMixDetailed(units, rents, blendedMultiplier, building.bldgArea, building.numFloors, building.yearBuilt);

  // -- COMMERCIAL TENANTS --
  let commercialTenants: CommercialTenant[] | undefined;
  if (building.commercialSqft && building.commercialSqft > 0) {
    const commercialUnits = building.commercialUnits || Math.max(1, Math.round(building.commercialSqft / 1500));
    const sqftPerSpace = Math.round(building.commercialSqft / commercialUnits);
    const rentPerSqft: Record<string, number> = { Manhattan: 55, Brooklyn: 40, Queens: 30, Bronx: 25, "Staten Island": 22 };
    const psfRent = rentPerSqft[borough] || 30;
    commercialTenants = Array.from({ length: commercialUnits }, (_, i) => ({
      id: `ai-comm-${i + 1}`,
      name: `Commercial Space ${i + 1}`,
      rentAnnual: Math.round(sqftPerSpace * psfRent),
      sqft: sqftPerSpace,
      leaseType: (i === 0 ? 'NNN' : 'gross') as 'NNN' | 'gross',
      escalation: 3,
      vacancyRate: 10,
    }));
    assumptions.commercialTenants = true;
  }

  // -- VACANCY (nuanced) --
  const residentialVacancyRate = calculateVacancyRate({
    rsRatio,
    hpdViolationCount: building.hpdViolationCount,
    borough,
  });

  // -- EXPENSES (benchmark-driven) --
  const expenses = generateExpensesFromBenchmark(
    {
      yearBuilt: building.yearBuilt,
      hasElevator: building.hasElevator,
      numFloors: building.numFloors,
      bldgClass: building.bldgClass,
      bldgArea: building.bldgArea,
      hpdViolationCount: building.hpdViolationCount,
      annualTaxes: building.annualTaxes,
      assessTotal: building.assessTotal,
      rentStabilizedUnits: building.rentStabilizedUnits,
    },
    units,
    borough,
  );
  if (building.annualTaxes > 0) delete assumptions.realEstateTaxes;

  // -- TAX REASSESSMENT PROJECTION --
  // Post-acquisition taxes are typically higher than current taxes because NYC reassesses
  // property value after sale. Use projected taxes for more accurate proforma.
  let taxReassessmentNote: string | undefined;
  try {
    if (building.assessTotal > 0 && building.annualTaxes > 0 && purchasePrice > 0) {
      // Determine tax class from building class (Class 2 = 4+ unit residential)
      const taxClass: "1" | "2" | "2a" | "2b" | "4" =
        units >= 4 ? "2" : building.bldgClass.startsWith("A") ? "1" : "4";

      const reassessment = estimatePostAcquisitionTax({
        currentAssessedValue: building.assessTotal,
        currentTaxBill: building.annualTaxes,
        purchasePrice,
        taxClass,
        units,
        borough,
        yearBuilt: building.yearBuilt,
      });

      // Use Year 3 projected tax (middle of phase-in) for proforma if it's higher
      const projectedTax = reassessment.yearByYearTax.length >= 3
        ? reassessment.yearByYearTax[2]
        : reassessment.estimatedNewTaxBill;

      if (projectedTax > expenses.realEstateTaxes * 1.05) {
        // Only override if projected is meaningfully higher (>5%)
        expenses.realEstateTaxes = Math.round(projectedTax);
        taxReassessmentNote = `Tax reassessed: current $${building.annualTaxes.toLocaleString()} → projected Yr3 $${Math.round(projectedTax).toLocaleString()} (+${reassessment.taxIncreasePct.toFixed(0)}%)`;
        delete assumptions.realEstateTaxes; // Not purely AI-assumed — based on reassessment model
      }
    }
  } catch {
    // Non-blocking — fall through to original tax value
  }

  // -- STRUCTURE RECOMMENDATION --
  const { structure: recommendedStructure, reasoning: structureReasoning } = selectDealStructure(
    building,
    units,
    purchasePrice,
  );

  // -- FINANCING (structure-aware) --
  const baseRate = options?.liveInterestRate ?? 7.0;
  const financing = generateFinancingAssumptions(purchasePrice, recommendedStructure, baseRate);

  // -- ACQUISITION COSTS (itemized via nyc-deal-costs) --
  const loanAmount = purchasePrice * (financing.ltvPercent / 100);
  const { closingCosts, acquisitionCosts } = generateAcquisitionCosts(
    purchasePrice, loanAmount, recommendedStructure, units, borough,
  );

  // -- VALUE-ADD / LEASE-UP --
  const leaseUp = generateLeaseUpAssumptions(building, units);
  const renovationBudget = leaseUp?.renovationBudget || 0;

  // -- RENT GROWTH --
  const rentGrowth = getRentGrowth(options?.marketAppreciation);

  // -- MANAGEMENT FEE --
  const managementFeePercent = borough === "Manhattan" ? 3 : units > 50 ? 3 : 4;

  const inputs: DealInputs = {
    purchasePrice,
    closingCosts,
    renovationBudget,
    acquisitionCosts,

    ...financing,

    unitMix,
    residentialVacancyRate,
    concessions: 0,

    commercialRentAnnual: commercialTenants
      ? commercialTenants.reduce((s, t) => s + t.rentAnnual, 0)
      : 0,
    commercialTenants,
    commercialVacancyRate: 10,
    commercialConcessions: 0,

    lateFees: 0,
    parkingIncome: 0,
    storageIncome: 0,
    petDeposits: 0,
    petRent: 0,
    evCharging: 0,
    trashRubs: 0,
    waterRubs: 0,
    otherMiscIncome: 0,

    annualRentGrowth: rentGrowth,
    annualExpenseGrowth: 2,

    realEstateTaxes: expenses.realEstateTaxes,
    insurance: expenses.insurance,
    licenseFees: expenses.licenseFees,
    fireMeter: expenses.fireMeter,
    electricityGas: expenses.electricityGas,
    waterSewer: expenses.waterSewer,
    managementFeePercent,
    payroll: expenses.payroll,
    accounting: expenses.accounting,
    legal: expenses.legal,
    marketing: expenses.marketing,
    rmGeneral: expenses.rmGeneral,
    rmCapexReserve: expenses.rmCapexReserve,
    generalAdmin: expenses.generalAdmin,
    exterminating: expenses.exterminating,
    landscaping: expenses.landscaping,
    snowRemoval: expenses.snowRemoval,
    elevator: expenses.elevator,
    alarmMonitoring: expenses.alarmMonitoring,
    telephoneInternet: expenses.telephoneInternet,
    cleaning: expenses.cleaning,
    trashRemoval: expenses.trashRemoval,
    otherContractServices: 0,

    holdPeriodYears: 5,
    exitCapRate: 0,
    sellingCostPercent: 5,

    _assumptions: assumptions,
  };

  // ── RGB EXPENSE VALIDATION ──
  const validationResult = validateAndCorrectExpenses(inputs, borough, building.yearBuilt, units);

  // Calculate exit cap rate (using validated expenses)
  const gpr = unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
  const totalFixedExpenses = sumExpenses(inputs);
  inputs.exitCapRate = calculateExitCap(gpr, residentialVacancyRate, managementFeePercent, totalFixedExpenses, purchasePrice);

  // Attach context notes
  const rsNote = building.rentStabilizedUnits > 0
    ? ` | Stabilized: ${building.rentStabilizedUnits} units at RGB ${getBlendedRGBRate().toFixed(2)}% blend`
    : "";
  if (expenses.benchmarkNote) {
    (inputs as any)._benchmarkNote = expenses.benchmarkNote + rsNote;
  }

  if (options?.capRateAnalysis) {
    const cr = options.capRateAnalysis;
    (inputs as any)._capRateNote = `Market cap rate: ${cr.marketCapRate.toFixed(2)}% (${cr.confidence}, ${cr.compCount} comps, ${cr.trend} ${Math.abs(cr.trendBpsPerYear)}bp/yr)`;
  }

  // Attach structure recommendation
  (inputs as any)._recommendedStructure = recommendedStructure;
  (inputs as any)._structureReasoning = structureReasoning;

  // Attach lease-up context if value-add detected
  if (leaseUp) {
    (inputs as any)._valueAddDetected = true;
    (inputs as any)._leaseUpContext = `Value-add: $${Math.round(leaseUp.renovationBudget / units).toLocaleString()}/unit reno, ${leaseUp.renovationMonths}mo construction, ${leaseUp.leaseUpMonths}mo lease-up, ${leaseUp.startingOccupancy}% starting occupancy`;
  }

  // Attach validation warnings and benchmark comparison
  if (validationResult.warnings.length > 0) {
    (inputs as any)._expenseWarnings = validationResult.warnings;
  }
  (inputs as any)._rgbBenchmarkComparison = validationResult.benchmarkComparison;

  // Attach tax reassessment context
  if (taxReassessmentNote) {
    (inputs as any)._taxReassessmentNote = taxReassessmentNote;
  }

  return inputs;
}

// ============================================================
// NYS Building Data (assessment rolls, no PLUTO/HPD/DOB)
// ============================================================
export interface NYSBuildingData {
  address: string;
  municipality: string;
  county: string;
  swisCode: string;
  printKey: string;
  ownerName: string;
  unitsRes: number;
  yearBuilt: number;
  numFloors: number;
  bldgArea: number;
  fullMarketValue: number;
  totalAssessedValue: number;
  landValue: number;
  lastSalePrice: number;
  lastSaleDate: string;
  annualTaxes: number;
  propertyClass: string;
}

// ============================================================
// Generate Deal Assumptions for NYS Properties
// Uses shared helpers — no rent stabilization, no HPD
// ============================================================
export function generateNYSDealAssumptions(
  building: NYSBuildingData,
  options?: { liveInterestRate?: number; hudFmr?: HudFmrData; marketAppreciation?: MarketAppreciation; redfinMetrics?: RedfinMetrics },
): DealInputs {
  const units = building.unitsRes || 1;
  const county = building.county || "Westchester";
  const rents = NYS_MARKET_RENTS[county] || NYS_MARKET_RENTS._default;
  const assumptions = buildStandardAssumptionFlags();

  // -- OFFER PRICE (shared helper) --
  const { price: purchasePrice } = estimatePurchasePrice({
    lastSalePrice: building.lastSalePrice,
    lastSaleDate: building.lastSaleDate,
    assessTotal: building.totalAssessedValue,
    fullMarketValue: building.fullMarketValue,
    fallback: 2000000,
  });

  // -- RENT ADJUSTMENTS --
  let rentMultiplier = 1.0;
  if (building.yearBuilt > 0 && building.yearBuilt < 1950) rentMultiplier *= 0.90;
  if (building.yearBuilt >= 2000) rentMultiplier *= 1.10;

  // -- UNIT MIX (shared helper) --
  const unitMix = estimateUnitMix(units, rents, rentMultiplier);

  // -- VACANCY --
  const residentialVacancyRate = 5;

  // -- EXPENSES (NYS generally lower per-unit than NYC) --
  const realEstateTaxes = building.annualTaxes > 0 ? building.annualTaxes : Math.round(building.fullMarketValue * 0.025);
  if (building.annualTaxes > 0) delete assumptions.realEstateTaxes;

  const insurance = Math.round(1200 * units);
  const licenseFees = Math.round(300 * units);
  const fireMeter = Math.round(150 * units);
  const electricityGas = Math.round(500 * units);
  const waterSewer = Math.round(600 * units);
  const payroll = Math.round(900 * units);
  const rmGeneral = Math.round(1500 * units);
  const rmCapexReserve = Math.round(300 * units);
  const exterminating = Math.round(100 * units);
  const landscaping = Math.min(Math.round(800 * units), 20000);
  const elevator = building.numFloors > 3 ? 8000 : 0;
  const cleaning = Math.round(400 * units);
  const trashRemoval = Math.round(700 * units);
  const accounting = 3500;
  const legal = 1500;
  const marketing = 10000;
  const generalAdmin = 2500;
  const snowRemoval = 8000;
  const alarmMonitoring = 3500;
  const telephoneInternet = 6000;

  // -- CLOSING COSTS (NYS outside NYC) --
  // NYS Transfer Tax: 0.4% (≤$3M) or 0.65% (>$3M)
  // Mansion Tax: 1% on purchases ≥$1M (residential, NYS-wide)
  // MRT: ~1.3% (varies by county, lower than NYC)
  // No NYC city transfer tax outside NYC
  const ltvPercent = 65;
  const loanAmount = purchasePrice * (ltvPercent / 100);
  const nysTransferTax = purchasePrice > 3_000_000
    ? Math.round(purchasePrice * 0.0065)
    : Math.round(purchasePrice * 0.004);
  const nysMansionTax = purchasePrice >= 1_000_000 ? Math.round(purchasePrice * 0.01) : 0;
  const nysMrt = Math.round(loanAmount * 0.013);  // ~1.3% typical NYS county MRT
  const nysLegalMisc = Math.round(Math.max(15000, purchasePrice * 0.002));
  const closingCosts = nysTransferTax + nysMansionTax + nysMrt + nysLegalMisc;
  const acquisitionCosts: DealInputs["acquisitionCosts"] = {
    titleInsurance: Math.round(Math.max(5000, purchasePrice * 0.0005)),
    mortgageRecordingTax: nysMrt,
    mansionTax: nysMansionTax,
    transferTax: nysTransferTax,
    legalFees: Math.round(nysLegalMisc * 0.6),
    inspections: Math.round(nysLegalMisc * 0.2),
    appraisal: Math.round(Math.min(15000, Math.max(3000, purchasePrice * 0.0001))),
    miscClosing: Math.round(nysLegalMisc * 0.2),
  };

  // -- RENT GROWTH (shared helper) --
  const rentGrowth = getRentGrowth(options?.marketAppreciation);

  const inputs: DealInputs = {
    purchasePrice,
    closingCosts,
    renovationBudget: 0,
    acquisitionCosts,

    ltvPercent: 65,
    interestRate: options?.liveInterestRate ?? 7.0,
    amortizationYears: 30,
    loanTermYears: 30,
    interestOnly: false,
    originationFeePercent: 1,

    unitMix,
    residentialVacancyRate,
    concessions: 0,

    commercialRentAnnual: 0,
    commercialVacancyRate: 10,
    commercialConcessions: 0,

    lateFees: 0,
    parkingIncome: 0,
    storageIncome: 0,
    petDeposits: 0,
    petRent: 0,
    evCharging: 0,
    trashRubs: 0,
    waterRubs: 0,
    otherMiscIncome: 0,

    annualRentGrowth: rentGrowth,
    annualExpenseGrowth: 2,

    realEstateTaxes,
    insurance,
    licenseFees,
    fireMeter,
    electricityGas,
    waterSewer,
    managementFeePercent: 4,
    payroll,
    accounting,
    legal,
    marketing,
    rmGeneral,
    rmCapexReserve,
    generalAdmin,
    exterminating,
    landscaping,
    snowRemoval,
    elevator,
    alarmMonitoring,
    telephoneInternet,
    cleaning,
    trashRemoval,
    otherContractServices: 0,

    holdPeriodYears: 5,
    exitCapRate: 0,
    sellingCostPercent: 5,

    _assumptions: assumptions,
  };

  // Calculate exit cap (shared logic)
  const gpr = unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
  const totalFixedExpenses = realEstateTaxes + insurance + licenseFees + fireMeter +
    electricityGas + waterSewer + (gpr * 0.04) + payroll + accounting + legal +
    marketing + rmGeneral + rmCapexReserve + generalAdmin + exterminating +
    landscaping + snowRemoval + elevator + alarmMonitoring + telephoneInternet +
    cleaning + trashRemoval;
  const vacLoss = gpr * (residentialVacancyRate / 100);
  const estNoi = gpr - vacLoss - totalFixedExpenses;
  const goingInCap = purchasePrice > 0 ? (estNoi / purchasePrice) * 100 : 6.0;
  inputs.exitCapRate = Math.max(3, Math.round((goingInCap - 0.25) * 100) / 100);

  return inputs;
}

// ============================================================
// NJ Building Data (MOD-IV / ArcGIS)
// ============================================================
export interface NJBuildingData {
  address: string;
  municipality: string;
  county: string;
  block: string;
  lot: string;
  ownerName: string;
  unitsRes: number;
  yearBuilt: number;
  numFloors: number;
  bldgArea: number;
  assessedTotal: number;
  lastSalePrice: number;
  lastSaleDate: string;
  annualTaxes: number;
  propertyClass: string;
}

// ============================================================
// Generate Deal Assumptions for NJ Properties
// Uses shared helpers
// ============================================================
export function generateNJDealAssumptions(
  building: NJBuildingData,
  options?: { liveInterestRate?: number; hudFmr?: HudFmrData; marketAppreciation?: MarketAppreciation; redfinMetrics?: RedfinMetrics },
): DealInputs {
  const units = building.unitsRes || 1;
  const county = building.county || "Hudson";
  const rents = NJ_MARKET_RENTS[county] || NJ_MARKET_RENTS._default;
  const assumptions = buildStandardAssumptionFlags();

  // -- OFFER PRICE (shared helper) --
  const { price: purchasePrice } = estimatePurchasePrice({
    lastSalePrice: building.lastSalePrice,
    lastSaleDate: building.lastSaleDate,
    assessTotal: building.assessedTotal,
    fallback: 2000000,
  });

  // -- RENTS --
  let rentMultiplier = 1.0;
  if (building.yearBuilt > 0 && building.yearBuilt < 1950) rentMultiplier *= 0.90;
  if (building.yearBuilt >= 2000) rentMultiplier *= 1.10;

  // -- UNIT MIX (shared helper) --
  const unitMix = estimateUnitMix(units, rents, rentMultiplier);

  const residentialVacancyRate = 5;

  // -- EXPENSES --
  const realEstateTaxes = building.annualTaxes > 0 ? building.annualTaxes : Math.round(building.assessedTotal * 0.028);
  if (building.annualTaxes > 0) delete assumptions.realEstateTaxes;

  const insurance = Math.round(1300 * units);
  const licenseFees = Math.round(350 * units);
  const fireMeter = Math.round(160 * units);
  const electricityGas = Math.round(520 * units);
  const waterSewer = Math.round(650 * units);
  const payroll = Math.round(950 * units);
  const rmGeneral = Math.round(1600 * units);
  const rmCapexReserve = Math.round(320 * units);
  const exterminating = Math.round(110 * units);
  const landscaping = Math.min(Math.round(900 * units), 22000);
  const elevator = building.numFloors > 3 ? 9000 : 0;
  const cleaning = Math.round(450 * units);
  const trashRemoval = Math.round(750 * units);
  const accounting = 3500;
  const legal = 1800;
  const marketing = 12000;
  const generalAdmin = 3000;
  const snowRemoval = 9000;
  const alarmMonitoring = 4000;
  const telephoneInternet = 7000;

  // -- CLOSING COSTS (NJ) --
  // NJ Realty Transfer Fee: ~1% (tiered, roughly 1% for most prices)
  // No MRT equivalent, no mansion tax
  // NJ Mansion Tax ("supplemental fee"): 1% on purchases ≥$1M
  const njLtvPercent = 65;
  const njLoanAmount = purchasePrice * (njLtvPercent / 100);
  const njRealtyTransferFee = Math.round(purchasePrice * 0.01);
  const njMansionSurcharge = purchasePrice >= 1_000_000 ? Math.round(purchasePrice * 0.01) : 0;
  const njLegalMisc = Math.round(Math.max(12000, purchasePrice * 0.0015));
  const closingCosts = njRealtyTransferFee + njMansionSurcharge + njLegalMisc;
  const njAcquisitionCosts: DealInputs["acquisitionCosts"] = {
    titleInsurance: Math.round(Math.max(4000, purchasePrice * 0.0004)),
    mortgageRecordingTax: 0, // NJ has no MRT
    mansionTax: njMansionSurcharge,
    transferTax: njRealtyTransferFee,
    legalFees: Math.round(njLegalMisc * 0.6),
    inspections: Math.round(njLegalMisc * 0.2),
    appraisal: Math.round(Math.min(12000, Math.max(2500, purchasePrice * 0.0001))),
    miscClosing: Math.round(njLegalMisc * 0.2),
  };

  // -- RENT GROWTH (shared helper) --
  const rentGrowth = getRentGrowth(options?.marketAppreciation);

  const inputs: DealInputs = {
    purchasePrice, closingCosts, renovationBudget: 0, acquisitionCosts: njAcquisitionCosts,
    ltvPercent: njLtvPercent, interestRate: options?.liveInterestRate ?? 7.0, amortizationYears: 30, loanTermYears: 30, interestOnly: false, originationFeePercent: 1,
    unitMix, residentialVacancyRate, concessions: 0,
    commercialRentAnnual: 0, commercialVacancyRate: 10, commercialConcessions: 0,
    lateFees: 0, parkingIncome: 0, storageIncome: 0, petDeposits: 0, petRent: 0, evCharging: 0, trashRubs: 0, waterRubs: 0, otherMiscIncome: 0,
    annualRentGrowth: rentGrowth, annualExpenseGrowth: 2,
    realEstateTaxes, insurance, licenseFees, fireMeter, electricityGas, waterSewer,
    managementFeePercent: 4, payroll, accounting, legal, marketing, rmGeneral, rmCapexReserve, generalAdmin,
    exterminating, landscaping, snowRemoval, elevator, alarmMonitoring, telephoneInternet, cleaning, trashRemoval, otherContractServices: 0,
    holdPeriodYears: 5, exitCapRate: 0, sellingCostPercent: 5, _assumptions: assumptions,
  };

  // Calculate exit cap
  const gpr = unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
  const totalFixedExpenses = realEstateTaxes + insurance + licenseFees + fireMeter +
    electricityGas + waterSewer + (gpr * 0.04) + payroll + accounting + legal +
    marketing + rmGeneral + rmCapexReserve + generalAdmin + exterminating +
    landscaping + snowRemoval + elevator + alarmMonitoring + telephoneInternet +
    cleaning + trashRemoval;
  const vacLoss = gpr * (residentialVacancyRate / 100);
  const estNoi = gpr - vacLoss - totalFixedExpenses;
  const goingInCap = purchasePrice > 0 ? (estNoi / purchasePrice) * 100 : 6.5;
  inputs.exitCapRate = Math.max(3, Math.round((goingInCap - 0.25) * 100) / 100);

  return inputs;
}

// ============================================================
// Census Data Calibration — adjust assumptions with tract-level data
// ============================================================
export interface CensusCalibration {
  medianRent?: number;
  medianContractRent?: number;
  vacancyRate?: number;
  medianHouseholdIncome?: number;
  rentBurdenPct?: number;
  renterPct?: number;
}

export function calibrateWithCensusData(
  inputs: DealInputs,
  census: CensusCalibration,
  hudFmr?: HudFmrData,
  marketTrends?: { appreciation?: MarketAppreciation; redfin?: RedfinMetrics; fannieMae?: { isOwnedByFannieMae: boolean; servicerName?: string }; renovation?: { recommendedLevel: string; totalCost: number; costPerUnit: number; arv: number; roi: number }; strProjection?: { monthlySTRPerUnit: number; monthlyLTRPerUnit: number; strPremium: number; neighborhood: string; occupancyRate: number; avgNightlyRate: number } },
): DealInputs {
  const updated = { ...inputs };
  const assumptions = { ...(updated._assumptions || {}) };

  if (census.vacancyRate != null && census.vacancyRate > 0) {
    const censusVac = Math.max(2, Math.min(15, census.vacancyRate));
    updated.residentialVacancyRate = Math.round(
      (censusVac * 0.6 + updated.residentialVacancyRate * 0.4) * 10
    ) / 10;
    delete assumptions.residentialVacancyRate;
  }

  if (census.medianRent && census.medianRent > 0 && updated.unitMix.length > 0) {
    const currentWeightedRent = updated.unitMix.reduce(
      (s, u) => s + u.count * u.monthlyRent, 0
    ) / updated.unitMix.reduce((s, u) => s + u.count, 0);

    const ratio = census.medianRent / currentWeightedRent;
    if (ratio < 0.8 || ratio > 1.2) {
      const adjFactor = Math.max(0.85, Math.min(1.15, (ratio + 1) / 2));
      updated.unitMix = updated.unitMix.map(u => ({
        ...u,
        monthlyRent: Math.round(u.monthlyRent * adjFactor),
      }));
    }
  }

  if (census.rentBurdenPct && census.rentBurdenPct > 35) {
    updated.concessions = Math.max(updated.concessions, 1);
  }

  updated._assumptions = assumptions;
  updated._censusContext = buildCensusNote(census, hudFmr, marketTrends);
  return updated;
}

function buildCensusNote(c: CensusCalibration, hudFmr?: HudFmrData, marketTrends?: { appreciation?: MarketAppreciation; redfin?: RedfinMetrics; fannieMae?: { isOwnedByFannieMae: boolean; servicerName?: string }; renovation?: { recommendedLevel: string; totalCost: number; costPerUnit: number; arv: number; roi: number }; strProjection?: { monthlySTRPerUnit: number; monthlyLTRPerUnit: number; strPremium: number; neighborhood: string; occupancyRate: number; avgNightlyRate: number } }): string {
  const parts: string[] = [];
  if (c.medianRent) parts.push(`Census median rent: $${c.medianRent.toLocaleString()}/mo`);
  if (c.vacancyRate != null) parts.push(`Census vacancy: ${c.vacancyRate.toFixed(1)}%`);
  if (c.medianHouseholdIncome) parts.push(`Median income: $${c.medianHouseholdIncome.toLocaleString()}`);
  if (c.rentBurdenPct) parts.push(`Rent burden: ${c.rentBurdenPct.toFixed(0)}%`);
  if (c.medianHouseholdIncome) {
    const maxRent = Math.round(c.medianHouseholdIncome / 12 * 0.30);
    parts.push(`Affordability ceiling (30%): $${maxRent.toLocaleString()}/mo`);
  }
  if (hudFmr) {
    parts.push(`HUD FMR (${hudFmr.source}): 1BR $${hudFmr.oneBr} | 2BR $${hudFmr.twoBr} | 3BR $${hudFmr.threeBr}`);
    if (c.medianRent && hudFmr.twoBr > c.medianRent * 1.2) {
      parts.push(`Rent gap: HUD FMR exceeds census median by ${Math.round((hudFmr.twoBr / c.medianRent - 1) * 100)}%`);
    }
  }
  if (marketTrends?.appreciation) {
    const a = marketTrends.appreciation;
    const localStr = a.localAppreciation1Yr != null ? `Local: ${a.localAppreciation1Yr > 0 ? "+" : ""}${a.localAppreciation1Yr}%/yr` : "";
    const metroStr = `Metro: +${a.metroAppreciation1Yr}%/yr`;
    parts.push(`Appreciation — ${localStr ? localStr + " | " : ""}${metroStr} (FHFA ${a.fhfaQuarter})`);
  }
  if (marketTrends?.redfin) {
    const r = marketTrends.redfin;
    parts.push(`Market: ${r.medianDaysOnMarket} DOM, ${(r.avgSaleToListRatio * 100).toFixed(0)}% sale/list, ${r.monthsOfSupply} mo supply`);
  }
  if (marketTrends?.fannieMae) {
    const fm = marketTrends.fannieMae;
    parts.push(`Fannie Mae: ${fm.isOwnedByFannieMae ? "GSE-backed loan" : "Non-agency loan"}${fm.servicerName ? ` (${fm.servicerName})` : ""}`);
  }
  if (marketTrends?.renovation) {
    const r = marketTrends.renovation;
    parts.push(`Renovation (${r.recommendedLevel}): $${Math.round(r.totalCost / 1000)}K ($${Math.round(r.costPerUnit / 1000)}K/unit)${r.arv > 0 ? ` | ARV $${Math.round(r.arv / 1000)}K (ROI ${r.roi}%)` : ""}`);
  }
  if (marketTrends?.strProjection) {
    const s = marketTrends.strProjection;
    parts.push(`Short-term rental comparable: $${s.avgNightlyRate}/night at ${Math.round(s.occupancyRate * 100)}% occupancy = $${s.monthlySTRPerUnit.toLocaleString()}/mo per unit vs LTR at $${s.monthlyLTRPerUnit.toLocaleString()}/mo (${s.strPremium}% premium). Note: NYC LL18 restricts STR.`);
  }
  return parts.join(" | ");
}

// ============================================================
// Structure-Specific AI Guidance for Deal Modeler
// ============================================================

export const STRUCTURE_AI_GUIDANCE: Record<DealStructureType, string> = {
  all_cash: "Conservative baseline. Focus on NOI accuracy and rent growth. No leverage risk — returns driven entirely by property performance and exit value.",
  conventional: "Standard leverage play. Key risks: rate environment, refinance at balloon. Focus on DSCR adequacy and interest rate sensitivity.",
  bridge_refi: "Value-add strategy. Critical assumptions: renovation timeline, post-rehab rents, ARV, refi terms. Use conservative rent bump estimate. Bridge period interest costs reduce overall returns.",
  assumable: "Rate arbitrage play. Key advantage: locked-in below-market rate. Main risk: assumption approval timeline and lender consent. Quantify annual savings vs current market rate.",
  syndication: "Institutional structure. Model fees accurately — they significantly impact LP returns. Preferred return creates a cash flow floor for LPs. Waterfall splits affect GP promote economics.",
};

export function getStructureAIContext(
  structure: DealStructureType,
  extras?: { currentRate?: number; assumedRate?: number; renovationBudget?: number; postRehabRentBump?: number },
): string {
  const parts: string[] = [`Structure: ${structure.replace("_", " ").replace("bridge refi", "Bridge \u2192 Refi (BRRRR)")}.`];
  parts.push(STRUCTURE_AI_GUIDANCE[structure]);

  if (structure === "bridge_refi" && extras?.renovationBudget) {
    parts.push(`Renovation budget: $${extras.renovationBudget.toLocaleString()}.`);
    if (extras.postRehabRentBump) {
      parts.push(`Post-rehab rent increase estimate: ${extras.postRehabRentBump}%.`);
    }
  }
  if (structure === "assumable" && extras?.assumedRate && extras?.currentRate) {
    parts.push(`Assumed rate: ${extras.assumedRate}% vs current market: ${extras.currentRate}%.`);
  }
  return parts.join(" ");
}

// ============================================================
// LL84 Utility Override — use actual LL84 data instead of estimates
// ============================================================
export function applyLL84UtilityOverride(
  inputs: DealInputs,
  ll84Utilities: { electricityCost: number; gasCost: number; waterCost: number; fuelOilCost: number; totalAnnualUtility: number }
): DealInputs {
  const updated = { ...inputs };
  const assumptions = { ...(updated._assumptions || {}) };
  updated.electricityGas = ll84Utilities.electricityCost + ll84Utilities.gasCost + ll84Utilities.fuelOilCost;
  updated.waterSewer = ll84Utilities.waterCost;
  delete assumptions.electricityGas;
  delete assumptions.waterSewer;
  updated._assumptions = assumptions;
  return updated;
}
