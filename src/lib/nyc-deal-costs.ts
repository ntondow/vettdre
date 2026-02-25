// ============================================================
// NYC Deal Cost Engine
// Accurate, itemized acquisition costs for NYC multifamily
// Transfer taxes, MRT, mansion tax, professional fees, tax reassessment
// ============================================================

import type { DealStructureType } from "./deal-structure-engine";

// ── Interfaces ──────────────────────────────────────────────

export interface ClosingCostBreakdown {
  // Transfer Taxes (paid by seller typically, modeled for buyer awareness)
  nycTransferTax: number;       // NYC Real Property Transfer Tax
  nysTransferTax: number;       // NYS transfer tax (0.4%)
  mansionTax: number;           // NYS mansion tax (tiered, may not apply to commercial)
  mansionTaxApplies: boolean;   // false for 4+ unit commercial buildings
  totalTransferTax: number;

  // Mortgage-Related (paid by buyer)
  mortgageRecordingTax: number; // NYC MRT — 2.05% on loans >$500K
  bankAttorneyFee: number;
  titleInsurance: number;
  titleSearchFee: number;

  // Professional Fees
  buyerAttorneyFee: number;
  environmentalReport: number;  // Phase I ESA
  appraisalFee: number;
  surveyFee: number;
  engineeringInspection: number;

  // Misc
  miscFees: number;             // UCC filing, recording fees, etc.

  // Structure-specific
  organizationalCosts: number;  // syndication PPM/SEC
  bridgeMrt: number;            // MRT on bridge loan (BRRRR)
  refiMrt: number;              // MRT on refi loan (BRRRR)
  cemaSavings: number;          // CEMA savings on refi (BRRRR)
  mrtSavings: number;           // MRT avoided by assuming (assumable)

  // Totals
  totalBuyerCosts: number;      // what the buyer actually pays at closing
  totalSellerCosts: number;     // transfer taxes (informational)
  totalAllInCosts: number;
  effectivePct: number;         // totalBuyerCosts / purchasePrice × 100
}

export interface ClosingCostParams {
  purchasePrice: number;
  loanAmount: number;
  structure: DealStructureType;
  units: number;
  isNewLoan: boolean;             // true for conventional/bridge, false for assumed
  assumedLoanBalance?: number;    // for assumable — exempt from MRT
  supplementalLoanAmount?: number;
  propertyType: "residential" | "commercial"; // 4+ units = commercial
  borough?: string;
  isCondoOrCoop?: boolean;
  // BRRRR-specific
  bridgeLoanAmount?: number;
  refiLoanAmount?: number;
  useCEMA?: boolean;              // default true — reduce refi MRT
}

export interface TaxReassessment {
  currentAssessedValue: number;
  currentTaxBill: number;
  currentEffectiveRate: number;       // %
  estimatedNewAssessedValue: number;
  estimatedNewTaxBill: number;
  taxIncreasePct: number;             // %
  reassessmentMethod: string;
  phaseInYears: number;
  yearByYearTax: number[];            // projected tax for each phase-in year
  caveats: string[];
}

export interface TaxReassessmentParams {
  currentAssessedValue: number;
  currentTaxBill: number;
  purchasePrice: number;
  taxClass: "1" | "2" | "2a" | "2b" | "4";
  units: number;
  borough: string;
  yearBuilt: number;
}

// ── NYC Transfer Tax Rates ──────────────────────────────────

function calcNYCTransferTax(price: number, isCommercial: boolean): number {
  // Commercial (4+ units): 1.425% up to $500K, 2.625% above
  // Residential (1-3): 1.0% up to $500K, 1.425% above
  if (isCommercial) {
    if (price <= 500_000) return price * 0.01425;
    return 500_000 * 0.01425 + (price - 500_000) * 0.02625;
  }
  if (price <= 500_000) return price * 0.01;
  return 500_000 * 0.01 + (price - 500_000) * 0.01425;
}

function calcNYSTransferTax(price: number): number {
  // 0.4% flat
  return price * 0.004;
}

function calcMansionTax(price: number): number {
  // Tiered — applies to FULL price once threshold met
  if (price < 1_000_000) return 0;
  if (price < 2_000_000) return price * 0.01;
  if (price < 3_000_000) return price * 0.0125;
  if (price < 5_000_000) return price * 0.015;
  if (price < 10_000_000) return price * 0.0175;
  if (price < 15_000_000) return price * 0.02;
  if (price < 20_000_000) return price * 0.0225;
  if (price < 25_000_000) return price * 0.025;
  return price * 0.029;
}

function calcMRT(loanAmount: number): number {
  // NYC MRT: 1.75% up to $500K, 2.05% above
  if (loanAmount <= 0) return 0;
  if (loanAmount <= 500_000) return loanAmount * 0.0175;
  return loanAmount * 0.0205;
}

// ── Professional Fee Estimates ──────────────────────────────

function estimateBuyerAttorney(price: number): number {
  if (price < 5_000_000) return 15_000;
  if (price < 15_000_000) return 20_000;
  return 25_000;
}

function estimateAppraisal(units: number): number {
  if (units < 20) return 5_000;
  if (units < 50) return 10_000;
  return 15_000;
}

function estimateTitleInsurance(price: number): number {
  // Roughly 0.45% of purchase price (TIRSA rates)
  return Math.round(price * 0.0045);
}

function estimateBankAttorney(price: number): number {
  if (price < 5_000_000) return 5_000;
  return 10_000;
}

// ── Main Calculator ─────────────────────────────────────────

export function calculateNYCClosingCosts(params: ClosingCostParams): ClosingCostBreakdown {
  const {
    purchasePrice,
    loanAmount,
    structure,
    units,
    isNewLoan,
    assumedLoanBalance = 0,
    supplementalLoanAmount = 0,
    propertyType,
    isCondoOrCoop = false,
    bridgeLoanAmount = 0,
    refiLoanAmount = 0,
    useCEMA = true,
  } = params;

  const isCommercial = propertyType === "commercial" || units >= 4;

  // ── Transfer Taxes (seller typically pays, but model for awareness)
  const nycTransferTax = Math.round(calcNYCTransferTax(purchasePrice, isCommercial));
  const nysTransferTax = Math.round(calcNYSTransferTax(purchasePrice));
  // Mansion tax: generally residential only (condo/coop units), not commercial multifamily
  const mansionTaxApplies = !isCommercial || isCondoOrCoop;
  const mansionTax = mansionTaxApplies ? Math.round(calcMansionTax(purchasePrice)) : 0;
  const totalTransferTax = nycTransferTax + nysTransferTax + mansionTax;

  // ── Mortgage Recording Tax (structure-dependent)
  let mortgageRecordingTax = 0;
  let bridgeMrt = 0;
  let refiMrt = 0;
  let cemaSavings = 0;
  let mrtSavings = 0;

  switch (structure) {
    case "all_cash":
      // No MRT — no loan
      mortgageRecordingTax = 0;
      break;

    case "conventional":
      mortgageRecordingTax = Math.round(calcMRT(loanAmount));
      break;

    case "bridge_refi": {
      // MRT on bridge loan
      bridgeMrt = Math.round(calcMRT(bridgeLoanAmount || loanAmount));
      // MRT on refi — if CEMA, only on NEW money
      const refiAmount = refiLoanAmount || loanAmount;
      const bridgePayoff = bridgeLoanAmount || loanAmount;
      if (useCEMA) {
        const newMoney = Math.max(0, refiAmount - bridgePayoff);
        refiMrt = Math.round(calcMRT(newMoney));
        cemaSavings = Math.round(calcMRT(refiAmount)) - refiMrt;
      } else {
        refiMrt = Math.round(calcMRT(refiAmount));
      }
      mortgageRecordingTax = bridgeMrt + refiMrt;
      break;
    }

    case "assumable":
      // MRT only on supplemental (new loan), NOT on assumed balance
      mortgageRecordingTax = Math.round(calcMRT(supplementalLoanAmount));
      // Savings = what MRT would have been on the assumed balance
      mrtSavings = Math.round(calcMRT(assumedLoanBalance));
      break;

    case "syndication":
      // Same as conventional
      mortgageRecordingTax = Math.round(calcMRT(loanAmount));
      break;
  }

  // ── Professional Fees
  const isFinanced = structure !== "all_cash";
  const buyerAttorneyFee = estimateBuyerAttorney(purchasePrice);
  const titleInsurance = estimateTitleInsurance(purchasePrice);
  const titleSearchFee = 1_500;
  const environmentalReport = 3_500; // Phase I ESA
  const appraisalFee = isFinanced ? estimateAppraisal(units) : 0;
  const surveyFee = 3_000;
  const engineeringInspection = 5_000;
  const bankAttorneyFee = isFinanced ? estimateBankAttorney(purchasePrice) : 0;
  const miscFees = 3_000; // UCC filing, recording fees

  // Syndication organizational costs
  const organizationalCosts = structure === "syndication" ? 15_000 : 0;

  // ── Totals
  // Buyer pays: MRT, professional fees, title, misc, organizational
  const totalBuyerCosts =
    mortgageRecordingTax +
    bankAttorneyFee +
    titleInsurance +
    titleSearchFee +
    buyerAttorneyFee +
    environmentalReport +
    appraisalFee +
    surveyFee +
    engineeringInspection +
    miscFees +
    organizationalCosts;

  // Seller pays: transfer taxes (informational for modeling)
  const totalSellerCosts = totalTransferTax;

  const totalAllInCosts = totalBuyerCosts + totalSellerCosts;
  const effectivePct = purchasePrice > 0 ? (totalBuyerCosts / purchasePrice) * 100 : 0;

  return {
    nycTransferTax,
    nysTransferTax,
    mansionTax,
    mansionTaxApplies,
    totalTransferTax,
    mortgageRecordingTax,
    bankAttorneyFee,
    titleInsurance,
    titleSearchFee,
    buyerAttorneyFee,
    environmentalReport,
    appraisalFee,
    surveyFee,
    engineeringInspection,
    miscFees,
    organizationalCosts,
    bridgeMrt,
    refiMrt,
    cemaSavings,
    mrtSavings,
    totalBuyerCosts,
    totalSellerCosts,
    totalAllInCosts,
    effectivePct: Math.round(effectivePct * 100) / 100,
  };
}

// ── NYC Property Tax Reassessment Model ─────────────────────

// Default NYC tax rates by class (approximate FY2025)
const NYC_TAX_RATES: Record<string, number> = {
  "1": 20.3,
  "2": 12.3,
  "2a": 12.3,
  "2b": 12.3,
  "4": 10.7,
};

// Assessment ratios by class
const ASSESSMENT_RATIOS: Record<string, number> = {
  "1": 0.06,   // Class 1: 6% of market value
  "2": 0.45,   // Class 2: 45% of transitional value
  "2a": 0.45,
  "2b": 0.45,
  "4": 0.45,   // Class 4: 45%
};

export function estimatePostAcquisitionTax(params: TaxReassessmentParams): TaxReassessment {
  const {
    currentAssessedValue,
    currentTaxBill,
    purchasePrice,
    taxClass,
    units,
    borough,
    yearBuilt,
  } = params;

  const effectiveRate = currentAssessedValue > 0
    ? (currentTaxBill / currentAssessedValue) * 100
    : NYC_TAX_RATES[taxClass] || 12.3;

  const assessmentRatio = ASSESSMENT_RATIOS[taxClass] || 0.45;
  const impliedNewAssessed = purchasePrice * assessmentRatio;

  // Class 2 caps: 8% per year, 30% over 5 years
  const isClass2 = taxClass === "2" || taxClass === "2a" || taxClass === "2b";
  const phaseInYears = isClass2 ? 5 : 1;

  let targetAssessed: number;
  if (isClass2) {
    // Cap at 30% increase over 5 years
    const maxAssessed = currentAssessedValue * 1.30;
    targetAssessed = Math.min(impliedNewAssessed, maxAssessed);
  } else {
    targetAssessed = impliedNewAssessed;
  }

  // Apply tax rate (use actual effective rate if available, else default)
  const taxRate = effectiveRate > 0 ? effectiveRate / 100 : (NYC_TAX_RATES[taxClass] || 12.3) / 100;

  // Build year-by-year phase-in
  const yearByYearTax: number[] = [];
  let currentAV = currentAssessedValue;

  for (let y = 1; y <= phaseInYears; y++) {
    if (isClass2) {
      // Annual cap: 8% increase per year
      const annualTarget = currentAssessedValue + (targetAssessed - currentAssessedValue) * (y / phaseInYears);
      const maxThisYear = currentAV * 1.08;
      currentAV = Math.min(annualTarget, maxThisYear);
    } else {
      currentAV = targetAssessed;
    }
    yearByYearTax.push(Math.round(currentAV * taxRate));
  }

  const estimatedNewTaxBill = yearByYearTax[yearByYearTax.length - 1];
  const taxIncreasePct = currentTaxBill > 0
    ? ((estimatedNewTaxBill - currentTaxBill) / currentTaxBill) * 100
    : 0;

  // Caveats
  const caveats: string[] = [
    `Estimate based on standard ${isClass2 ? "Class 2" : `Class ${taxClass}`} assessment rules`,
    "Actual reassessment may vary based on Tax Commission adjustments",
  ];
  if (isClass2) {
    caveats.push("Class 2 increases capped at 8%/year or 30%/5 years");
  }
  if (yearBuilt > 2000) {
    caveats.push("Newer construction may have tax abatements (421-a) that could expire");
  }
  if (purchasePrice > currentAssessedValue * 3) {
    caveats.push("Large gap between assessed value and purchase price — reassessment likely");
  }

  return {
    currentAssessedValue,
    currentTaxBill,
    currentEffectiveRate: Math.round(effectiveRate * 100) / 100,
    estimatedNewAssessedValue: Math.round(targetAssessed),
    estimatedNewTaxBill,
    taxIncreasePct: Math.round(taxIncreasePct * 10) / 10,
    reassessmentMethod: isClass2
      ? "NYC Class 2 transitional assessment with 8%/yr cap"
      : `NYC Class ${taxClass} market value assessment`,
    phaseInYears,
    yearByYearTax,
    caveats,
  };
}

// ── NJ Tax Reassessment (simpler model) ─────────────────────

export function estimateNJPostAcquisitionTax(params: {
  currentAssessedValue: number;
  currentTaxBill: number;
  purchasePrice: number;
  municipality: string;
}): TaxReassessment {
  const { currentAssessedValue, currentTaxBill, purchasePrice, municipality } = params;

  const effectiveRate = currentAssessedValue > 0
    ? (currentTaxBill / currentAssessedValue) * 100
    : 2.5; // NJ average ~2.5%

  const taxRate = effectiveRate / 100;
  const estimatedNewTaxBill = Math.round(purchasePrice * taxRate);
  const taxIncreasePct = currentTaxBill > 0
    ? ((estimatedNewTaxBill - currentTaxBill) / currentTaxBill) * 100
    : 0;

  const riskOfReassessment = purchasePrice > currentAssessedValue * 1.15;

  const caveats: string[] = [
    `Based on ${municipality} effective tax rate of ${effectiveRate.toFixed(2)}%`,
    "NJ municipalities do not automatically reassess upon sale",
  ];
  if (riskOfReassessment) {
    caveats.push(`Purchase price ${Math.round(((purchasePrice / currentAssessedValue) - 1) * 100)}% above assessed value — risk of added assessment`);
  }

  return {
    currentAssessedValue,
    currentTaxBill,
    currentEffectiveRate: Math.round(effectiveRate * 100) / 100,
    estimatedNewAssessedValue: Math.round(purchasePrice), // NJ assesses at market
    estimatedNewTaxBill,
    taxIncreasePct: Math.round(taxIncreasePct * 10) / 10,
    reassessmentMethod: "NJ market value with constant effective rate",
    phaseInYears: 1, // NJ: immediate
    yearByYearTax: [estimatedNewTaxBill],
    caveats,
  };
}
