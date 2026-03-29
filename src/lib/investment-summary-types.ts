// ============================================================
// Investment Summary Types
// All interfaces for assembling and rendering an Investment Summary PDF.
// Imports branding/broker types from bov-types.ts (shared with BOV).
// ============================================================

import type { BovBranding, BovBrokerInfo } from "./bov-types";

// ── Main Payload ─────────────────────────────────────────────

export interface InvestmentSummaryPayload {
  generatedAt: string;
  generatedBy: BovBrokerInfo;
  branding: BovBranding;
  property: InvestmentPropertyData;
  dealStructure: InvestmentDealStructure;
  income: InvestmentIncomeData;
  expenses: InvestmentExpenseData;
  financing: InvestmentFinancingData | null;
  returns: InvestmentReturnMetrics;
  cashFlows: InvestmentCashFlowYear[];
  exitAnalysis: InvestmentExitAnalysis;
  sourcesAndUses: InvestmentSourcesUses;
  riskFactors: InvestmentRiskFactor[];
  // Optional enrichments (graceful nulls)
  sensitivity: InvestmentSensitivity | null;
  bridgeDetails: InvestmentBridgeDetails | null;
  assumableDetails: InvestmentAssumableDetails | null;
  syndicationDetails: InvestmentSyndicationDetails | null;
  benchmarks: InvestmentBenchmarks | null;
  // Sprint 2-5 enrichments
  commercialTenants?: { name: string; sqft?: number; rentAnnual: number; leaseType?: string; vacancyRate?: number }[];
  acquisitionCostBreakdown?: { label: string; amount: number }[];
  preStabilizationSummary?: { totalNegativeCashFlow: number; monthsToBreakeven: number; monthsToStabilization: number };
  feeSchedule?: { acquisitionFee: number; assetMgmtFeeAnnual: number; dispositionFee: number; constructionMgmtFee: number; totalFees: number };
}

// ── Property ─────────────────────────────────────────────────

export interface InvestmentPropertyData {
  address: string;
  bbl: string | null;
  borough: string | null;
  units: number;
  sqft: number | null;
  yearBuilt: number | null;
  stories: number | null;
  buildingClass: string | null;
  zoning: string | null;
  lotSqft: number | null;
  assessedValue: number | null;
}

// ── Deal Structure ───────────────────────────────────────────

export interface InvestmentDealStructure {
  /** "all_cash" | "conventional" | "bridge_refi" | "assumable" | "syndication" | custom string */
  type: string;
  label: string;
  purchasePrice: number;
  holdPeriod: number;
  exitCapRate: number;
}

// ── Income ───────────────────────────────────────────────────

export interface InvestmentIncomeData {
  grossPotentialRent: number;
  otherIncome: number;
  vacancyRate: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
}

// ── Expenses ─────────────────────────────────────────────────

export interface InvestmentExpenseLineItem {
  label: string;
  amount: number;
  perUnit?: number;
  category?: string;
}

export interface InvestmentExpenseData {
  lineItems: InvestmentExpenseLineItem[];
  totalExpenses: number;
  expenseRatio: number;
  expensePerUnit: number;
}

// ── Financing ────────────────────────────────────────────────

export interface InvestmentFinancingData {
  loanAmount: number;
  ltv: number;
  interestRate: number;
  amortization: number;
  loanTerm: number;
  annualDebtService: number;
  totalEquity: number;
  isInterestOnly: boolean;
}

// ── Return Metrics ───────────────────────────────────────────

export interface InvestmentReturnMetrics {
  noi: number;
  capRate: number;
  cashOnCash: number;
  irr: number;
  dscr: number;
  debtYield: number;
  equityMultiple: number;
  annualizedReturn: number;
  breakEvenOccupancy: number;
}

// ── Cash Flow Year ───────────────────────────────────────────

export interface InvestmentCashFlowYear {
  year: number;
  grossIncome: number;
  vacancy: number;
  effectiveIncome: number;
  expenses: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  cumulativeCashFlow: number;
}

// ── Exit Analysis ────────────────────────────────────────────

export interface InvestmentExitAnalysis {
  exitNoi: number;
  exitCapRate: number;
  projectedSalePrice: number;
  sellingCosts: number;
  loanBalanceAtExit: number;
  netSaleProceeds: number;
  totalProfit: number;
}

// ── Sources & Uses ───────────────────────────────────────────

export interface InvestmentSourcesUses {
  sources: { label: string; amount: number }[];
  uses: { label: string; amount: number }[];
  totalSources: number;
  totalUses: number;
}

// ── Risk Factors ─────────────────────────────────────────────

export interface InvestmentRiskFactor {
  category: "market" | "financial" | "operational" | "regulatory" | "structural";
  severity: "low" | "medium" | "high";
  label: string;
  description: string;
}

// ── Sensitivity ──────────────────────────────────────────────

export interface InvestmentSensitivity {
  exitCapRateScenarios: { capRate: number; salePrice: number; irr: number }[];
  vacancyScenarios: { vacancyRate: number; noi: number; cashOnCash: number }[] | null;
}

// ── Bridge → Refi Details ────────────────────────────────────

export interface InvestmentBridgeDetails {
  bridgeLoanAmount: number;
  bridgeRate: number;
  bridgeTermMonths: number;
  totalBridgeCost: number;
  refiLoanAmount: number;
  cashOutOnRefi: number;
  cashLeftInDeal: number;
}

// ── Assumable Mortgage Details ───────────────────────────────

export interface InvestmentAssumableDetails {
  existingLoanBalance: number;
  existingRate: number;
  blendedRate: number;
  annualRateSavings: number;
  totalRateSavings: number;
}

// ── Syndication Details ──────────────────────────────────────

export interface InvestmentSyndicationDetails {
  gpEquityPct: number;
  lpEquityPct: number;
  preferredReturn: number;
  gpIrr: number;
  lpIrr: number;
  gpEquityMultiple: number;
  lpEquityMultiple: number;
  gpTotalReturn: number;
  lpTotalReturn: number;
  totalFees: number;
}

// ── Benchmark Enrichments ────────────────────────────────────

export interface InvestmentBenchmarks {
  stabilizedUnitImpact: { stabilizedPct: number; blendedGrowthRate: number } | null;
  ll97Exposure: { totalPenaltyOverHold: number; avgAnnualPenalty: number; complianceStatus: string } | null;
  exitSensitivity: {
    optimistic: { capRate: number; salePrice: number; irr: number };
    base: { capRate: number; salePrice: number; irr: number };
    conservative: { capRate: number; salePrice: number; irr: number };
  } | null;
  marketCapRateMeta: { marketCapRate: number; confidence: string; trend: string } | null;
}
