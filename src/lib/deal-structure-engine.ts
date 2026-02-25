// ============================================================
// Deal Structure Engine — Multi-Structure Deal Analysis
// Supports: All Cash, Conventional, Bridge→Refi (BRRRR),
//           Assumable Mortgage, Syndication
// ============================================================

import { calculateIRR } from "./deal-calculator";
import type { ClosingCostBreakdown, TaxReassessment } from "./nyc-deal-costs";
import { buildExitSensitivity } from "./cap-rate-engine";

// ============================================================
// Types
// ============================================================

export type DealStructureType =
  | "all_cash"
  | "conventional"
  | "bridge_refi"
  | "assumable"
  | "syndication";

export const STRUCTURE_LABELS: Record<DealStructureType, string> = {
  all_cash: "All Cash",
  conventional: "Conventional",
  bridge_refi: "Bridge \u2192 Refi",
  assumable: "Assumable",
  syndication: "Syndication",
};

export const STRUCTURE_DESCRIPTIONS: Record<DealStructureType, string> = {
  all_cash: "No leverage — 100% equity",
  conventional: "Standard bank financing",
  bridge_refi: "Value-add: acquire, renovate, refinance",
  assumable: "Take over the seller\u2019s low-rate mortgage",
  syndication: "Multi-investor partnership structure",
};

// ── Base Inputs (shared by all structures) ─────────────────

export interface DealInputsBase {
  purchasePrice: number;
  units: number;
  grossRentalIncome: number;       // annual
  otherIncome: number;             // annual (laundry, parking, storage)
  vacancyRate: number;             // % (default from census/AI)
  operatingExpenses: number;       // annual
  capexReserve: number;            // annual
  propertyTaxes: number;           // annual (from DOF assessed value)
  insurance: number;               // annual
  holdPeriod: number;              // years (default 5)
  exitCapRate: number;             // % (default from market data)
  annualRentGrowth: number;        // % (default from AI)
  annualExpenseGrowth: number;     // % (default 3%)
  renovationBudget: number;        // total (from renovation engine)
  closingCostsPct: number;         // % of purchase price (default 3%)
  // NYC itemized closing costs (replaces flat % when provided)
  closingCostBreakdown?: ClosingCostBreakdown;
  taxReassessment?: TaxReassessment;
  // Auto-populated from existing integrations
  currentMarketRate?: number;      // from FRED
  hudFmr2br?: number;             // from HUD
  compEstimate?: number;           // from comps engine
  fannieMaeBacked?: boolean;       // from Fannie Mae lookup
  // Benchmark engine data (optional — falls back to flat growth when absent)
  rentProjectionData?: { yearlyProjections: Array<{ year: number; totalAnnualRent: number }> };
  ll97AnnualPenalties?: number[];
  stabilizedUnitCount?: number;
  stabilizedUnitPct?: number;
  // Market cap rate data (optional — enriches exit analysis when available)
  capRateAnalysis?: { marketCapRate: number; range: { low: number; high: number }; median: number; suggestedExitCap: number; confidence: string; trend: string; trendBpsPerYear: number };
}

// ── Structure-Specific Inputs ──────────────────────────────

export interface AllCashInputs extends DealInputsBase {
  structure: "all_cash";
}

export interface ConventionalDebtInputs extends DealInputsBase {
  structure: "conventional";
  ltvPct: number;                  // default 75
  interestRate: number;            // % (default from FRED 30yr)
  amortizationYears: number;       // default 30
  loanTermYears: number;           // default 10
  isInterestOnly: boolean;         // default false
  ioYears?: number;
  prepaymentPenalty?: number;      // %
  loanOriginationPct: number;      // default 1%
}

export interface BridgeRefiInputs extends DealInputsBase {
  structure: "bridge_refi";
  // Phase 1: Bridge
  bridgeLtvPct: number;            // default 80
  bridgeRate: number;              // default 10
  bridgeTermMonths: number;        // default 24
  bridgeOriginationPts: number;    // default 2
  bridgeInterestOnly: boolean;     // default true
  // Phase 2: Stabilization
  stabilizationMonths: number;     // default 6
  postRehabRentBump: number;       // % increase after reno
  // Phase 3: Permanent refi
  refiLtvPct: number;              // default 75 of ARV
  refiRate: number;                // from FRED
  refiAmortization: number;        // default 30
  refiTermYears: number;           // default 10
  arvOverride?: number;            // after-repair value
  useCEMA?: boolean;               // default true — reduces MRT on refi
}

export interface AssumableMortgageInputs extends DealInputsBase {
  structure: "assumable";
  existingLoanBalance: number;
  existingRate: number;            // locked-in rate (e.g. 3.5%)
  existingTermRemaining: number;   // months remaining
  existingAmortization: number;    // original amort years
  assumptionFee: number;           // % (typically 1%)
  supplementalLoanAmount?: number;
  supplementalRate?: number;
  supplementalTermYears?: number;
  rateSavingsVsMarket?: number;    // auto-calculated
}

export interface SyndicationInputs extends DealInputsBase {
  structure: "syndication";
  // Equity
  totalEquityRequired: number;     // auto-calc
  gpEquityPct: number;             // default 10
  lpEquityPct: number;             // default 90
  // Fees
  acquisitionFeePct: number;       // default 2
  assetManagementFeePct: number;   // default 1.5
  dispositionFeePct: number;       // default 1
  refinanceFeePct: number;         // default 0.5
  constructionMgmtFeePct: number;  // default 5
  // Waterfall
  preferredReturn: number;         // default 8
  gpPromoteAbovePref: number;      // default 20
  gpPromoteAboveIrr: number;       // same as gpPromoteAboveHurdle
  irrHurdle: number;               // default 15
  gpPromoteAboveHurdle: number;    // default 30
  // Debt (conventional underneath)
  ltvPct: number;
  interestRate: number;
  amortizationYears: number;
  loanTermYears: number;
}

export type StructuredDealInputs =
  | AllCashInputs
  | ConventionalDebtInputs
  | BridgeRefiInputs
  | AssumableMortgageInputs
  | SyndicationInputs;

// ── Output Interfaces ──────────────────────────────────────

export interface YearlyProjection {
  year: number;
  grossIncome: number;
  vacancy: number;
  effectiveIncome: number;
  opex: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  cumulativeCashFlow: number;
  propertyValue: number;
  equity: number;
}

export interface DealAnalysis {
  structure: DealStructureType;
  label: string;
  // Sources & Uses
  totalProjectCost: number;
  totalDebt: number;
  totalEquity: number;
  // Annual Metrics (Year 1)
  noi: number;
  debtService: number;
  cashFlow: number;
  cashOnCash: number;           // %
  capRate: number;              // %
  dscr: number;
  // Hold Period Metrics
  projectedSalePrice: number;
  totalCashFlow: number;
  totalProfit: number;
  equityMultiple: number;
  irr: number;                  // %
  annualizedReturn: number;     // %
  breakEvenOccupancy: number;   // %
  // Bridge/BRRRR specific
  cashOutOnRefi?: number;
  cashLeftInDeal?: number;
  refiLoanAmount?: number;
  totalBridgeCost?: number;
  // Assumable specific
  annualRateSavings?: number;
  totalRateSavings?: number;
  blendedRate?: number;
  // Syndication specific
  gpTotalReturn?: number;
  lpTotalReturn?: number;
  gpIrr?: number;
  lpIrr?: number;
  gpEquityMultiple?: number;
  lpEquityMultiple?: number;
  totalFees?: number;
  // NYC Deal Costs
  closingCostDetail?: ClosingCostBreakdown;
  taxReassessment?: TaxReassessment;
  mrtSavings?: number;             // for assumable deals
  // Benchmark engine outputs
  stabilizedUnitImpact?: { stabilizedPct: number; blendedGrowthRate: number; mciUpsideAnnual: number; iaiUpsideAnnual: number };
  ll97Exposure?: { totalPenaltyOverHold: number; avgAnnualPenalty: number; complianceStatus: string };
  // Cap rate analysis outputs
  exitSensitivity?: { optimistic: { capRate: number; salePrice: number; irr: number }; base: { capRate: number; salePrice: number; irr: number }; conservative: { capRate: number; salePrice: number; irr: number } };
  marketCapRateMeta?: { marketCapRate: number; confidence: string; trend: string; trendBpsPerYear: number };
  // Timeline
  yearlyProjections: YearlyProjection[];
}

// ============================================================
// Helpers
// ============================================================

/** Monthly P&I payment */
export function calcPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** Remaining balance after monthsPaid of amortization */
export function calcRemainingBalance(
  principal: number,
  annualRate: number,
  amortYears: number,
  monthsPaid: number,
): number {
  if (principal <= 0) return 0;
  const r = annualRate / 100 / 12;
  const n = amortYears * 12;
  if (r === 0) return Math.max(0, principal - (principal / n) * monthsPaid);
  const factor = Math.pow(1 + r, n);
  const factorPaid = Math.pow(1 + r, monthsPaid);
  return Math.max(0, principal * (factor - factorPaid) / (factor - 1));
}

/** Resolve closing costs: use itemized breakdown if provided, else flat % */
function resolveClosingCosts(inputs: DealInputsBase): number {
  if (inputs.closingCostBreakdown) return inputs.closingCostBreakdown.totalBuyerCosts;
  return inputs.purchasePrice * (inputs.closingCostsPct / 100);
}

/** Compute NOI from base inputs */
function computeNOI(inputs: DealInputsBase): number {
  const egi = inputs.grossRentalIncome + inputs.otherIncome;
  const vacancyLoss = egi * (inputs.vacancyRate / 100);
  const effectiveIncome = egi - vacancyLoss;
  const totalOpex = inputs.operatingExpenses + inputs.capexReserve + inputs.propertyTaxes + inputs.insurance;
  return effectiveIncome - totalOpex;
}

/** Build year-by-year projections */
function buildProjections(
  inputs: DealInputsBase,
  annualDebtService: number,
  loanBalance: (year: number) => number,
): YearlyProjection[] {
  const projections: YearlyProjection[] = [];
  let cumCf = 0;
  const baseGross = inputs.grossRentalIncome + inputs.otherIncome;
  const baseOpex = inputs.operatingExpenses + inputs.capexReserve + inputs.propertyTaxes + inputs.insurance;

  for (let y = 1; y <= inputs.holdPeriod; y++) {
    // Use rent projection data if available, otherwise standard growth formula
    let grossIncome: number;
    if (inputs.rentProjectionData?.yearlyProjections?.[y - 1]) {
      // Rent projection provides total annual rent; add otherIncome
      grossIncome = Math.round(inputs.rentProjectionData.yearlyProjections[y - 1].totalAnnualRent + inputs.otherIncome * Math.pow(1 + inputs.annualRentGrowth / 100, y - 1));
    } else {
      const growthFactor = Math.pow(1 + inputs.annualRentGrowth / 100, y - 1);
      grossIncome = Math.round(baseGross * growthFactor);
    }
    const expGrowthFactor = Math.pow(1 + inputs.annualExpenseGrowth / 100, y - 1);
    const vacancy = Math.round(grossIncome * (inputs.vacancyRate / 100));
    const effectiveIncome = grossIncome - vacancy;
    let opex = Math.round(baseOpex * expGrowthFactor);
    // Add LL97 penalty for this year if available
    if (inputs.ll97AnnualPenalties?.[y - 1]) {
      opex += inputs.ll97AnnualPenalties[y - 1];
    }
    const noi = effectiveIncome - opex;
    const cashFlow = noi - annualDebtService;
    cumCf += cashFlow;

    const exitNoi = noi * (1 + inputs.annualRentGrowth / 100);
    const propertyValue = inputs.exitCapRate > 0 ? Math.round(exitNoi / (inputs.exitCapRate / 100)) : 0;
    const bal = loanBalance(y);
    const equity = propertyValue - bal;

    projections.push({
      year: y,
      grossIncome,
      vacancy,
      effectiveIncome,
      opex,
      noi,
      debtService: Math.round(annualDebtService),
      cashFlow: Math.round(cashFlow),
      cumulativeCashFlow: Math.round(cumCf),
      propertyValue,
      equity: Math.round(equity),
    });
  }
  return projections;
}

/** Compute exit sale price at year N */
function exitSalePrice(inputs: DealInputsBase): number {
  let grossFinal: number;
  const lastYearIdx = inputs.holdPeriod - 1;
  if (inputs.rentProjectionData?.yearlyProjections?.[lastYearIdx]) {
    grossFinal = inputs.rentProjectionData.yearlyProjections[lastYearIdx].totalAnnualRent +
      inputs.otherIncome * Math.pow(1 + inputs.annualRentGrowth / 100, inputs.holdPeriod);
  } else {
    const growthFactor = Math.pow(1 + inputs.annualRentGrowth / 100, inputs.holdPeriod);
    grossFinal = (inputs.grossRentalIncome + inputs.otherIncome) * growthFactor;
  }
  const expGrowthFactor = Math.pow(1 + inputs.annualExpenseGrowth / 100, inputs.holdPeriod);
  const vacFinal = grossFinal * (inputs.vacancyRate / 100);
  const egiFinal = grossFinal - vacFinal;
  const opexFinal = (inputs.operatingExpenses + inputs.capexReserve + inputs.propertyTaxes + inputs.insurance) * expGrowthFactor;
  const exitNoi = egiFinal - opexFinal;
  return inputs.exitCapRate > 0 ? exitNoi / (inputs.exitCapRate / 100) : 0;
}

/** Extract benchmark metadata from inputs for inclusion in analysis output */
function extractBenchmarkMeta(inputs: DealInputsBase, exitNoi?: number, equityForIrr?: number, holdCashFlows?: number[], netSaleCalc?: (salePrice: number) => number): Pick<DealAnalysis, "stabilizedUnitImpact" | "ll97Exposure" | "exitSensitivity" | "marketCapRateMeta"> {
  const result: Pick<DealAnalysis, "stabilizedUnitImpact" | "ll97Exposure" | "exitSensitivity" | "marketCapRateMeta"> = {};
  if (inputs.stabilizedUnitPct != null && inputs.stabilizedUnitPct > 0) {
    result.stabilizedUnitImpact = {
      stabilizedPct: inputs.stabilizedUnitPct,
      blendedGrowthRate: inputs.annualRentGrowth,
      mciUpsideAnnual: 0,
      iaiUpsideAnnual: 0,
    };
  }
  if (inputs.ll97AnnualPenalties && inputs.ll97AnnualPenalties.length > 0) {
    const total = inputs.ll97AnnualPenalties.reduce((s, v) => s + v, 0);
    const avg = Math.round(total / inputs.ll97AnnualPenalties.length);
    result.ll97Exposure = {
      totalPenaltyOverHold: total,
      avgAnnualPenalty: avg,
      complianceStatus: total > 0 ? "non_compliant" : "compliant",
    };
  }
  // Cap rate analysis + exit sensitivity
  if (inputs.capRateAnalysis) {
    result.marketCapRateMeta = {
      marketCapRate: inputs.capRateAnalysis.marketCapRate,
      confidence: inputs.capRateAnalysis.confidence,
      trend: inputs.capRateAnalysis.trend,
      trendBpsPerYear: inputs.capRateAnalysis.trendBpsPerYear,
    };
    // Build exit sensitivity if we have the needed exit data
    if (exitNoi && exitNoi > 0 && equityForIrr && holdCashFlows && netSaleCalc) {
      const irrCalc = (salePrice: number) => {
        const ns = netSaleCalc(salePrice);
        const flows = [-equityForIrr];
        for (let y = 0; y < holdCashFlows.length; y++) {
          let cf = holdCashFlows[y];
          if (y === holdCashFlows.length - 1) cf += ns;
          flows.push(cf);
        }
        return calculateIRR(flows) * 100;
      };
      result.exitSensitivity = buildExitSensitivity(inputs.capRateAnalysis.marketCapRate, exitNoi, irrCalc);
    }
  }
  return result;
}

/** Break-even occupancy: what % occupancy covers opex + debt service */
function breakEvenOcc(inputs: DealInputsBase, debtService: number): number {
  const grossPotential = inputs.grossRentalIncome + inputs.otherIncome;
  if (grossPotential <= 0) return 100;
  const totalOpex = inputs.operatingExpenses + inputs.capexReserve + inputs.propertyTaxes + inputs.insurance;
  const required = totalOpex + debtService;
  return Math.min(100, Math.max(0, (required / grossPotential) * 100));
}

// ============================================================
// Calculators
// ============================================================

export function calculateAllCash(inputs: AllCashInputs): DealAnalysis {
  const closingCosts = resolveClosingCosts(inputs);
  const totalProjectCost = inputs.purchasePrice + closingCosts + inputs.renovationBudget;
  const totalEquity = totalProjectCost;
  const noi = computeNOI(inputs);
  const capRate = inputs.purchasePrice > 0 ? (noi / inputs.purchasePrice) * 100 : 0;
  const cashOnCash = totalEquity > 0 ? (noi / totalEquity) * 100 : 0;
  const salePrice = exitSalePrice(inputs);
  const sellingCosts = salePrice * 0.05;
  const netSale = salePrice - sellingCosts;

  const projections = buildProjections(inputs, 0, () => 0);
  const totalCashFlow = projections.reduce((s, p) => s + p.cashFlow, 0);
  const totalProfit = netSale + totalCashFlow - totalEquity;
  const equityMultiple = totalEquity > 0 ? (totalCashFlow + netSale) / totalEquity : 0;

  // IRR
  const irrFlows = [-totalEquity];
  for (let y = 0; y < inputs.holdPeriod; y++) {
    let cf = projections[y]?.cashFlow || 0;
    if (y === inputs.holdPeriod - 1) cf += netSale;
    irrFlows.push(cf);
  }
  const irr = calculateIRR(irrFlows) * 100;
  const annualizedReturn = inputs.holdPeriod > 0 ? (Math.pow(equityMultiple, 1 / inputs.holdPeriod) - 1) * 100 : 0;

  // Exit sensitivity data
  const exitNoiForSens = projections.length > 0 ? projections[projections.length - 1].noi * (1 + inputs.annualRentGrowth / 100) : noi;
  const cashFlowsForSens = projections.map(p => p.cashFlow);
  const netSaleCalcFn = (sp: number) => sp - sp * 0.05;

  return {
    structure: "all_cash",
    label: "All Cash",
    totalProjectCost: Math.round(totalProjectCost),
    totalDebt: 0,
    totalEquity: Math.round(totalEquity),
    noi: Math.round(noi),
    debtService: 0,
    cashFlow: Math.round(noi),
    cashOnCash: round2(cashOnCash),
    capRate: round2(capRate),
    dscr: 0,
    projectedSalePrice: Math.round(salePrice),
    totalCashFlow: Math.round(totalCashFlow),
    totalProfit: Math.round(totalProfit),
    equityMultiple: round2(equityMultiple),
    irr: round2(irr),
    annualizedReturn: round2(annualizedReturn),
    breakEvenOccupancy: round2(breakEvenOcc(inputs, 0)),
    closingCostDetail: inputs.closingCostBreakdown,
    taxReassessment: inputs.taxReassessment,
    ...extractBenchmarkMeta(inputs, exitNoiForSens, totalEquity, cashFlowsForSens, netSaleCalcFn),
    yearlyProjections: projections,
  };
}

export function calculateConventional(inputs: ConventionalDebtInputs): DealAnalysis {
  const closingCosts = resolveClosingCosts(inputs);
  const loanAmount = inputs.purchasePrice * (inputs.ltvPct / 100);
  const originationFee = loanAmount * (inputs.loanOriginationPct / 100);
  const totalProjectCost = inputs.purchasePrice + closingCosts + inputs.renovationBudget + originationFee;
  const totalEquity = totalProjectCost - loanAmount;
  const noi = computeNOI(inputs);
  const capRate = inputs.purchasePrice > 0 ? (noi / inputs.purchasePrice) * 100 : 0;

  // Debt service
  let annualDS: number;
  if (inputs.isInterestOnly) {
    annualDS = loanAmount * (inputs.interestRate / 100);
  } else {
    annualDS = calcPayment(loanAmount, inputs.interestRate, inputs.amortizationYears) * 12;
  }

  const cashFlow = noi - annualDS;
  const cashOnCash = totalEquity > 0 ? (cashFlow / totalEquity) * 100 : 0;
  const dscr = annualDS > 0 ? noi / annualDS : 0;

  const balanceFn = (year: number) => {
    if (inputs.isInterestOnly) return loanAmount;
    return calcRemainingBalance(loanAmount, inputs.interestRate, inputs.amortizationYears, year * 12);
  };

  const projections = buildProjections(inputs, annualDS, balanceFn);
  const salePrice = exitSalePrice(inputs);
  const sellingCosts = salePrice * 0.05;
  const loanBalAtExit = balanceFn(inputs.holdPeriod);
  const netSale = salePrice - sellingCosts - loanBalAtExit;
  const totalCashFlow = projections.reduce((s, p) => s + p.cashFlow, 0);
  const totalProfit = netSale + totalCashFlow - totalEquity;
  const equityMultiple = totalEquity > 0 ? (totalCashFlow + netSale) / totalEquity : 0;

  const irrFlows = [-totalEquity];
  for (let y = 0; y < inputs.holdPeriod; y++) {
    let cf = projections[y]?.cashFlow || 0;
    if (y === inputs.holdPeriod - 1) cf += netSale;
    irrFlows.push(cf);
  }
  const irr = calculateIRR(irrFlows) * 100;
  const annualizedReturn = inputs.holdPeriod > 0 ? (Math.pow(Math.max(0.01, equityMultiple), 1 / inputs.holdPeriod) - 1) * 100 : 0;

  // Exit sensitivity data
  const exitNoiConv = projections.length > 0 ? projections[projections.length - 1].noi * (1 + inputs.annualRentGrowth / 100) : noi;
  const cfConv = projections.map(p => p.cashFlow);
  const netSaleConv = (sp: number) => sp - sp * 0.05 - balanceFn(inputs.holdPeriod);

  return {
    structure: "conventional",
    label: "Conventional",
    totalProjectCost: Math.round(totalProjectCost),
    totalDebt: Math.round(loanAmount),
    totalEquity: Math.round(totalEquity),
    noi: Math.round(noi),
    debtService: Math.round(annualDS),
    cashFlow: Math.round(cashFlow),
    cashOnCash: round2(cashOnCash),
    capRate: round2(capRate),
    dscr: round2(dscr),
    projectedSalePrice: Math.round(salePrice),
    totalCashFlow: Math.round(totalCashFlow),
    totalProfit: Math.round(totalProfit),
    equityMultiple: round2(equityMultiple),
    irr: round2(irr),
    annualizedReturn: round2(annualizedReturn),
    breakEvenOccupancy: round2(breakEvenOcc(inputs, annualDS)),
    closingCostDetail: inputs.closingCostBreakdown,
    taxReassessment: inputs.taxReassessment,
    ...extractBenchmarkMeta(inputs, exitNoiConv, totalEquity, cfConv, netSaleConv),
    yearlyProjections: projections,
  };
}

export function calculateBridgeRefi(inputs: BridgeRefiInputs): DealAnalysis {
  const closingCosts = resolveClosingCosts(inputs);

  // Phase 1: Bridge loan
  const bridgeLoan = inputs.purchasePrice * (inputs.bridgeLtvPct / 100);
  const bridgeOrigFee = bridgeLoan * (inputs.bridgeOriginationPts / 100);
  const bridgeMonthlyInterest = bridgeLoan * (inputs.bridgeRate / 100 / 12);
  const bridgeTermYears = inputs.bridgeTermMonths / 12;
  const totalBridgeInterest = bridgeMonthlyInterest * inputs.bridgeTermMonths;
  const totalBridgeCost = totalBridgeInterest + bridgeOrigFee;

  // Total initial investment
  const totalProjectCost = inputs.purchasePrice + closingCosts + inputs.renovationBudget + bridgeOrigFee;
  const initialEquity = totalProjectCost - bridgeLoan;

  // Phase 2: Post-rehab stabilized income
  const stabilizedGross = inputs.grossRentalIncome * (1 + inputs.postRehabRentBump / 100);
  const stabilizedInputs = { ...inputs, grossRentalIncome: stabilizedGross };

  // ARV
  const arv = inputs.arvOverride || (inputs.exitCapRate > 0
    ? computeNOI(stabilizedInputs) / (inputs.exitCapRate / 100)
    : inputs.purchasePrice + inputs.renovationBudget * 1.5);

  // Phase 3: Permanent refi
  const refiLoanAmount = arv * (inputs.refiLtvPct / 100);
  const cashOutOnRefi = refiLoanAmount - bridgeLoan; // pay off bridge, keep the rest
  const cashLeftInDeal = Math.max(0, initialEquity - Math.max(0, cashOutOnRefi));

  // Permanent debt service
  const permAnnualDS = calcPayment(refiLoanAmount, inputs.refiRate, inputs.refiAmortization) * 12;

  // Stabilized NOI
  const noi = computeNOI(stabilizedInputs);
  const capRate = inputs.purchasePrice > 0 ? (computeNOI(inputs) / inputs.purchasePrice) * 100 : 0;
  const cashFlow = noi - permAnnualDS;
  const effectiveEquity = cashLeftInDeal > 0 ? cashLeftInDeal : 1; // avoid div/0
  const cashOnCash = (cashFlow / effectiveEquity) * 100;
  const dscr = permAnnualDS > 0 ? noi / permAnnualDS : 0;

  // Projections: during bridge period (simplified), then stabilized
  const balanceFn = (year: number) => {
    return calcRemainingBalance(refiLoanAmount, inputs.refiRate, inputs.refiAmortization, year * 12);
  };
  const projections = buildProjections(stabilizedInputs, permAnnualDS, balanceFn);

  // Exit
  const salePrice = exitSalePrice(stabilizedInputs);
  const sellingCosts = salePrice * 0.05;
  const loanBalAtExit = balanceFn(inputs.holdPeriod);
  const netSale = salePrice - sellingCosts - loanBalAtExit;
  const totalCashFlow = projections.reduce((s, p) => s + p.cashFlow, 0);

  // IRR: initial equity out, bridge period negative (interest), then stabilized CFs
  const irrFlows = [-initialEquity];
  // Simplified: bridge period interest comes from the bridge loan (not additional equity)
  // but we treat year 0 as the full equity outlay and refi cash-out as a positive in year 1
  if (cashOutOnRefi > 0) {
    irrFlows.push(cashOutOnRefi + (projections[0]?.cashFlow || 0));
  } else {
    irrFlows.push(projections[0]?.cashFlow || 0);
  }
  for (let y = 1; y < inputs.holdPeriod; y++) {
    let cf = projections[y]?.cashFlow || 0;
    if (y === inputs.holdPeriod - 1) cf += netSale;
    irrFlows.push(cf);
  }
  if (inputs.holdPeriod === 1) {
    irrFlows[irrFlows.length - 1] += netSale;
  }

  const irr = calculateIRR(irrFlows) * 100;
  const totalReturns = irrFlows.slice(1).reduce((s, v) => s + v, 0);
  const equityMultiple = initialEquity > 0 ? totalReturns / initialEquity : 0;
  const annualizedReturn = inputs.holdPeriod > 0 ? (Math.pow(Math.max(0.01, equityMultiple), 1 / inputs.holdPeriod) - 1) * 100 : 0;

  return {
    structure: "bridge_refi",
    label: "Bridge \u2192 Refi",
    totalProjectCost: Math.round(totalProjectCost),
    totalDebt: Math.round(refiLoanAmount),
    totalEquity: Math.round(initialEquity),
    noi: Math.round(noi),
    debtService: Math.round(permAnnualDS),
    cashFlow: Math.round(cashFlow),
    cashOnCash: round2(cashOnCash),
    capRate: round2(capRate),
    dscr: round2(dscr),
    projectedSalePrice: Math.round(salePrice),
    totalCashFlow: Math.round(totalCashFlow),
    totalProfit: Math.round(netSale + totalCashFlow - initialEquity),
    equityMultiple: round2(equityMultiple),
    irr: round2(irr),
    annualizedReturn: round2(annualizedReturn),
    breakEvenOccupancy: round2(breakEvenOcc(stabilizedInputs, permAnnualDS)),
    cashOutOnRefi: Math.round(Math.max(0, cashOutOnRefi)),
    cashLeftInDeal: Math.round(cashLeftInDeal),
    refiLoanAmount: Math.round(refiLoanAmount),
    totalBridgeCost: Math.round(totalBridgeCost),
    closingCostDetail: inputs.closingCostBreakdown,
    taxReassessment: inputs.taxReassessment,
    ...extractBenchmarkMeta(inputs, projections.length > 0 ? projections[projections.length - 1].noi * (1 + inputs.annualRentGrowth / 100) : noi, initialEquity, projections.map(p => p.cashFlow), (sp: number) => sp - sp * 0.05 - balanceFn(inputs.holdPeriod)),
    yearlyProjections: projections,
  };
}

export function calculateAssumable(inputs: AssumableMortgageInputs): DealAnalysis {
  const closingCosts = resolveClosingCosts(inputs);
  const assumeFee = inputs.existingLoanBalance * (inputs.assumptionFee / 100);

  // Assumed loan debt service
  const assumedMonthly = calcPayment(
    inputs.existingLoanBalance,
    inputs.existingRate,
    inputs.existingAmortization,
  );
  // We need to figure out the monthly payment on remaining balance at the assumed point.
  // More accurate: the assumed payment is based on original terms
  const assumedAnnualDS = assumedMonthly * 12;

  // Supplemental loan
  const suppLoan = inputs.supplementalLoanAmount || 0;
  const suppRate = inputs.supplementalRate || 0;
  const suppTerm = inputs.supplementalTermYears || 10;
  const suppMonthly = suppLoan > 0 ? calcPayment(suppLoan, suppRate, suppTerm) : 0;
  const suppAnnualDS = suppMonthly * 12;

  const totalDebt = inputs.existingLoanBalance + suppLoan;
  const totalAnnualDS = assumedAnnualDS + suppAnnualDS;
  const totalProjectCost = inputs.purchasePrice + closingCosts + inputs.renovationBudget + assumeFee;
  const totalEquity = totalProjectCost - totalDebt;

  const noi = computeNOI(inputs);
  const capRate = inputs.purchasePrice > 0 ? (noi / inputs.purchasePrice) * 100 : 0;
  const cashFlow = noi - totalAnnualDS;
  const cashOnCash = totalEquity > 0 ? (cashFlow / totalEquity) * 100 : 0;
  const dscr = totalAnnualDS > 0 ? noi / totalAnnualDS : 0;

  // Rate savings
  const marketRate = inputs.currentMarketRate || 7;
  const marketAnnualDS = calcPayment(inputs.existingLoanBalance, marketRate, inputs.existingAmortization) * 12;
  const annualRateSavings = marketAnnualDS - assumedAnnualDS;
  const totalRateSavings = annualRateSavings * Math.min(inputs.holdPeriod, inputs.existingTermRemaining / 12);

  // Blended rate
  const blendedRate = totalDebt > 0
    ? ((inputs.existingLoanBalance * inputs.existingRate + suppLoan * suppRate) / totalDebt)
    : inputs.existingRate;

  const balanceFn = (year: number) => {
    const assumedBal = calcRemainingBalance(inputs.existingLoanBalance, inputs.existingRate, inputs.existingAmortization, year * 12);
    const suppBal = suppLoan > 0 ? calcRemainingBalance(suppLoan, suppRate, suppTerm, year * 12) : 0;
    return assumedBal + suppBal;
  };

  const projections = buildProjections(inputs, totalAnnualDS, balanceFn);
  const salePrice = exitSalePrice(inputs);
  const sellingCosts = salePrice * 0.05;
  const loanBalAtExit = balanceFn(inputs.holdPeriod);
  const netSale = salePrice - sellingCosts - loanBalAtExit;
  const totalCashFlow = projections.reduce((s, p) => s + p.cashFlow, 0);
  const equityMultiple = totalEquity > 0 ? (totalCashFlow + netSale) / totalEquity : 0;

  const irrFlows = [-totalEquity];
  for (let y = 0; y < inputs.holdPeriod; y++) {
    let cf = projections[y]?.cashFlow || 0;
    if (y === inputs.holdPeriod - 1) cf += netSale;
    irrFlows.push(cf);
  }
  const irr = calculateIRR(irrFlows) * 100;
  const annualizedReturn = inputs.holdPeriod > 0 ? (Math.pow(Math.max(0.01, equityMultiple), 1 / inputs.holdPeriod) - 1) * 100 : 0;

  return {
    structure: "assumable",
    label: "Assumable",
    totalProjectCost: Math.round(totalProjectCost),
    totalDebt: Math.round(totalDebt),
    totalEquity: Math.round(totalEquity),
    noi: Math.round(noi),
    debtService: Math.round(totalAnnualDS),
    cashFlow: Math.round(cashFlow),
    cashOnCash: round2(cashOnCash),
    capRate: round2(capRate),
    dscr: round2(dscr),
    projectedSalePrice: Math.round(salePrice),
    totalCashFlow: Math.round(totalCashFlow),
    totalProfit: Math.round(netSale + totalCashFlow - totalEquity),
    equityMultiple: round2(equityMultiple),
    irr: round2(irr),
    annualizedReturn: round2(annualizedReturn),
    breakEvenOccupancy: round2(breakEvenOcc(inputs, totalAnnualDS)),
    annualRateSavings: Math.round(annualRateSavings),
    totalRateSavings: Math.round(totalRateSavings),
    blendedRate: round2(blendedRate),
    mrtSavings: inputs.closingCostBreakdown?.mrtSavings ?? 0,
    closingCostDetail: inputs.closingCostBreakdown,
    taxReassessment: inputs.taxReassessment,
    ...extractBenchmarkMeta(inputs, projections.length > 0 ? projections[projections.length - 1].noi * (1 + inputs.annualRentGrowth / 100) : noi, totalEquity, projections.map(p => p.cashFlow), (sp: number) => sp - sp * 0.05 - balanceFn(inputs.holdPeriod)),
    yearlyProjections: projections,
  };
}

export function calculateSyndication(inputs: SyndicationInputs): DealAnalysis {
  const closingCosts = resolveClosingCosts(inputs);
  const loanAmount = inputs.purchasePrice * (inputs.ltvPct / 100);
  const acquisitionFee = inputs.purchasePrice * (inputs.acquisitionFeePct / 100);
  const constructionMgmtFee = inputs.renovationBudget * (inputs.constructionMgmtFeePct / 100);
  const totalProjectCost = inputs.purchasePrice + closingCosts + inputs.renovationBudget + acquisitionFee + constructionMgmtFee;
  const totalEquityRequired = totalProjectCost - loanAmount;
  const gpEquity = totalEquityRequired * (inputs.gpEquityPct / 100);
  const lpEquity = totalEquityRequired * (inputs.lpEquityPct / 100);

  const annualDS = calcPayment(loanAmount, inputs.interestRate, inputs.amortizationYears) * 12;
  const noi = computeNOI(inputs);
  const capRate = inputs.purchasePrice > 0 ? (noi / inputs.purchasePrice) * 100 : 0;
  const assetMgmtFee = (inputs.grossRentalIncome + inputs.otherIncome) * (inputs.assetManagementFeePct / 100);
  const cashFlowBeforeFees = noi - annualDS;
  const cashFlowAfterFees = cashFlowBeforeFees - assetMgmtFee;
  const dscr = annualDS > 0 ? noi / annualDS : 0;

  // Waterfall distribution
  const prefReturn = lpEquity * (inputs.preferredReturn / 100);
  const lpCashFromOps = Math.min(cashFlowAfterFees, prefReturn);
  const excessCash = Math.max(0, cashFlowAfterFees - prefReturn);
  const gpCashFromOps = excessCash * (inputs.gpPromoteAbovePref / 100);
  const lpExcess = excessCash - gpCashFromOps;

  const balanceFn = (year: number) => {
    return calcRemainingBalance(loanAmount, inputs.interestRate, inputs.amortizationYears, year * 12);
  };

  const projections = buildProjections(inputs, annualDS, balanceFn);

  // Exit
  const salePrice = exitSalePrice(inputs);
  const dispositionFee = salePrice * (inputs.dispositionFeePct / 100);
  const sellingCosts = salePrice * 0.05 + dispositionFee;
  const loanBalAtExit = balanceFn(inputs.holdPeriod);
  const netSaleProceeds = salePrice - sellingCosts - loanBalAtExit;

  // Total fees
  const totalFees = acquisitionFee + constructionMgmtFee + assetMgmtFee * inputs.holdPeriod + dispositionFee;

  // LP flows for IRR
  const lpFlows = [-lpEquity];
  const gpFlows = [-gpEquity];

  for (let y = 0; y < inputs.holdPeriod; y++) {
    const yrGross = (inputs.grossRentalIncome + inputs.otherIncome) * Math.pow(1 + inputs.annualRentGrowth / 100, y);
    const yrAssetFee = yrGross * (inputs.assetManagementFeePct / 100);
    const yrCf = (projections[y]?.cashFlow || 0) - yrAssetFee;

    const yrPref = lpEquity * (inputs.preferredReturn / 100);
    const lpFromPref = Math.min(Math.max(0, yrCf), yrPref);
    const excess = Math.max(0, yrCf - yrPref);
    const gpPromote = excess * (inputs.gpPromoteAbovePref / 100);
    const lpFromExcess = excess - gpPromote;

    if (y === inputs.holdPeriod - 1) {
      // Distribute exit proceeds through waterfall
      const totalDistributable = netSaleProceeds;
      // Return LP capital first
      const lpCapReturn = Math.min(totalDistributable, lpEquity);
      const gpCapReturn = Math.min(Math.max(0, totalDistributable - lpEquity), gpEquity);
      const exitExcess = Math.max(0, totalDistributable - lpEquity - gpEquity);

      // Check if IRR exceeds hurdle for higher promote
      const testLpFlows = [...lpFlows, lpFromPref + lpFromExcess + lpCapReturn + exitExcess * ((100 - inputs.gpPromoteAboveHurdle) / 100)];
      const testLpIrr = calculateIRR(testLpFlows) * 100;
      const aboveHurdle = testLpIrr > inputs.irrHurdle;
      const exitGpPct = aboveHurdle ? inputs.gpPromoteAboveHurdle / 100 : inputs.gpPromoteAbovePref / 100;
      const gpFromExit = exitExcess * exitGpPct;
      const lpFromExit = exitExcess - gpFromExit;

      lpFlows.push(lpFromPref + lpFromExcess + lpCapReturn + lpFromExit);
      gpFlows.push(gpPromote + gpCapReturn + gpFromExit + (y === 0 ? acquisitionFee : 0));
    } else {
      lpFlows.push(lpFromPref + lpFromExcess);
      gpFlows.push(gpPromote + (y === 0 ? acquisitionFee : 0));
    }
  }

  const gpIrr = calculateIRR(gpFlows) * 100;
  const lpIrr = calculateIRR(lpFlows) * 100;
  const gpTotalReturn = gpFlows.slice(1).reduce((s, v) => s + v, 0);
  const lpTotalReturn = lpFlows.slice(1).reduce((s, v) => s + v, 0);
  const gpEquityMultiple = gpEquity > 0 ? gpTotalReturn / gpEquity : 0;
  const lpEquityMultiple = lpEquity > 0 ? lpTotalReturn / lpEquity : 0;

  const totalCashFlow = projections.reduce((s, p) => s + p.cashFlow, 0);
  const equityMultiple = totalEquityRequired > 0 ? (totalCashFlow + netSaleProceeds) / totalEquityRequired : 0;

  const irrFlows = [-totalEquityRequired];
  for (let y = 0; y < inputs.holdPeriod; y++) {
    let cf = projections[y]?.cashFlow || 0;
    if (y === inputs.holdPeriod - 1) cf += netSaleProceeds;
    irrFlows.push(cf);
  }
  const irr = calculateIRR(irrFlows) * 100;
  const cashOnCash = totalEquityRequired > 0 ? (cashFlowAfterFees / totalEquityRequired) * 100 : 0;
  const annualizedReturn = inputs.holdPeriod > 0 ? (Math.pow(Math.max(0.01, equityMultiple), 1 / inputs.holdPeriod) - 1) * 100 : 0;

  return {
    structure: "syndication",
    label: "Syndication",
    totalProjectCost: Math.round(totalProjectCost),
    totalDebt: Math.round(loanAmount),
    totalEquity: Math.round(totalEquityRequired),
    noi: Math.round(noi),
    debtService: Math.round(annualDS),
    cashFlow: Math.round(cashFlowAfterFees),
    cashOnCash: round2(cashOnCash),
    capRate: round2(capRate),
    dscr: round2(dscr),
    projectedSalePrice: Math.round(salePrice),
    totalCashFlow: Math.round(totalCashFlow),
    totalProfit: Math.round(netSaleProceeds + totalCashFlow - totalEquityRequired),
    equityMultiple: round2(equityMultiple),
    irr: round2(irr),
    annualizedReturn: round2(annualizedReturn),
    breakEvenOccupancy: round2(breakEvenOcc(inputs, annualDS)),
    gpTotalReturn: Math.round(gpTotalReturn),
    lpTotalReturn: Math.round(lpTotalReturn),
    gpIrr: round2(gpIrr),
    lpIrr: round2(lpIrr),
    gpEquityMultiple: round2(gpEquityMultiple),
    lpEquityMultiple: round2(lpEquityMultiple),
    totalFees: Math.round(totalFees),
    closingCostDetail: inputs.closingCostBreakdown,
    taxReassessment: inputs.taxReassessment,
    ...extractBenchmarkMeta(inputs, projections.length > 0 ? projections[projections.length - 1].noi * (1 + inputs.annualRentGrowth / 100) : noi, totalEquityRequired, projections.map(p => p.cashFlow), (sp: number) => sp - sp * 0.05 - calcRemainingBalance(loanAmount, inputs.interestRate, inputs.amortizationYears, inputs.holdPeriod * 12)),
    yearlyProjections: projections,
  };
}

// ============================================================
// Dispatcher
// ============================================================

export function calculateDealStructure(inputs: StructuredDealInputs): DealAnalysis {
  switch (inputs.structure) {
    case "all_cash": return calculateAllCash(inputs);
    case "conventional": return calculateConventional(inputs);
    case "bridge_refi": return calculateBridgeRefi(inputs);
    case "assumable": return calculateAssumable(inputs);
    case "syndication": return calculateSyndication(inputs);
  }
}

// ============================================================
// Comparison
// ============================================================

export function compareDealStructures(
  base: DealInputsBase,
  structures: DealStructureType[],
  overrides?: Partial<Record<DealStructureType, Partial<StructuredDealInputs>>>,
): DealAnalysis[] {
  return structures.map(s => {
    const defaults = getDefaultStructureInputs(s, base);
    const merged = overrides?.[s] ? { ...defaults, ...overrides[s] } : defaults;
    return calculateDealStructure(merged as StructuredDealInputs);
  });
}

// ============================================================
// Default Templates
// ============================================================

export function getDefaultStructureInputs(
  structure: DealStructureType,
  base: DealInputsBase,
): StructuredDealInputs {
  const marketRate = base.currentMarketRate || 7;

  switch (structure) {
    case "all_cash":
      return { ...base, structure: "all_cash" };

    case "conventional":
      return {
        ...base,
        structure: "conventional",
        ltvPct: 75,
        interestRate: marketRate,
        amortizationYears: 30,
        loanTermYears: 10,
        isInterestOnly: false,
        loanOriginationPct: 1,
      };

    case "bridge_refi":
      return {
        ...base,
        structure: "bridge_refi",
        bridgeLtvPct: 80,
        bridgeRate: 10,
        bridgeTermMonths: 24,
        bridgeOriginationPts: 2,
        bridgeInterestOnly: true,
        stabilizationMonths: 6,
        postRehabRentBump: 20,
        refiLtvPct: 75,
        refiRate: marketRate,
        refiAmortization: 30,
        refiTermYears: 10,
      };

    case "assumable":
      return {
        ...base,
        structure: "assumable",
        existingLoanBalance: Math.round(base.purchasePrice * 0.6),
        existingRate: 3.5,
        existingTermRemaining: 300,
        existingAmortization: 30,
        assumptionFee: 1,
        rateSavingsVsMarket: marketRate - 3.5,
      };

    case "syndication":
      return {
        ...base,
        structure: "syndication",
        totalEquityRequired: 0, // auto-calc
        gpEquityPct: 10,
        lpEquityPct: 90,
        acquisitionFeePct: 2,
        assetManagementFeePct: 1.5,
        dispositionFeePct: 1,
        refinanceFeePct: 0.5,
        constructionMgmtFeePct: 5,
        preferredReturn: 8,
        gpPromoteAbovePref: 20,
        gpPromoteAboveIrr: 30,
        irrHurdle: 15,
        gpPromoteAboveHurdle: 30,
        ltvPct: 65,
        interestRate: marketRate,
        amortizationYears: 30,
        loanTermYears: 10,
      };
  }
}

// ============================================================
// Utility
// ============================================================

function round2(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
