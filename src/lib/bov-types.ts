// ============================================================
// BOV (Broker Opinion of Value) Types
// Separated from server actions — safe for client import
// ============================================================

// ── Top-Level Payload ────────────────────────────────────────

export interface BovPayload {
  // Meta
  generatedAt: string;
  generatedBy: BovBrokerInfo;
  branding: BovBranding;

  // Property
  property: BovPropertyData;

  // Analysis
  ownership: BovOwnershipData | null;
  financials: BovFinancialData | null;
  comps: BovCompData[] | null;
  compSummary: BovCompSummary | null;
  capRate: BovCapRateData | null;

  // Condition
  violations: BovViolationSummary | null;
  permits: BovPermitSummary | null;
  energy: BovEnergyData | null;
  litigation: BovLitigationSummary | null;

  // Market
  neighborhood: BovNeighborhoodData | null;
  rentStabilization: BovRentStabData | null;

  // Valuation
  valuation: BovValuationEstimate | null;
}

// ── Branding & Broker ────────────────────────────────────────

export interface BovBranding {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  address: string;
  phone: string;
  email: string;
  website: string | null;
}

export interface BovBrokerInfo {
  name: string;
  title: string | null;
  phone: string;
  email: string;
  licenseNumber: string | null;
}

// ── Property ─────────────────────────────────────────────────

export interface BovPropertyData {
  address: string;
  bbl: string;
  borough: string;
  neighborhood: string | null;
  zip: string;

  // Building
  buildingClass: string;
  buildingClassDescription: string | null;
  stories: number;
  unitsTotal: number;
  unitsResidential: number;
  unitsCommercial: number;
  grossSqft: number;
  yearBuilt: number;

  // Lot
  lotSqft: number;
  builtFAR: number;
  maxFAR: number;
  zoning: string;
  landmarkStatus: string | null;

  // Tax / Assessment
  assessedLandValue: number;
  assessedTotalValue: number;
  marketValue: number;
  taxClass: string | null;

  // Owner (public record)
  ownerName: string;

  // Last Sale
  lastSalePrice: number | null;
  lastSaleDate: string | null;
}

// ── Ownership ────────────────────────────────────────────────

export interface BovOwnershipData {
  registeredOwner: string;
  managingAgent: string | null;
  aiOwnerAnalysis: string | null;
  ownerConfidence: number | null;
  entityType: string | null;
  portfolioSize: number | null;
}

// ── Financial Analysis ───────────────────────────────────────

export interface BovFinancialData {
  // Income
  estimatedGrossIncome: number;
  vacancyRate: number;
  effectiveGrossIncome: number;

  // Expenses (benchmark)
  expenseCategory: string;
  expenseLineItems: BovExpenseLineItem[];
  totalExpenses: number;
  expensePerUnit: number;
  expenseAdjustmentNotes: string[];

  // NOI
  estimatedNOI: number;

  // Ratios
  expenseRatio: number;
  pricePerUnit: number | null;
  pricePerSqft: number | null;
  grm: number | null;
}

export interface BovExpenseLineItem {
  label: string;
  perUnit: number;
  totalAnnual: number;
}

// ── Comparable Sales ─────────────────────────────────────────

export interface BovCompData {
  address: string;
  saleDate: string;
  salePrice: number;
  pricePerUnit: number;
  pricePerSqft: number | null;
  units: number;
  sqft: number | null;
  estimatedCapRate: number | null;
  similarityScore: number;
  distanceMiles: number;
}

export interface BovCompSummary {
  count: number;
  medianPricePerUnit: number;
  medianPricePerSqft: number | null;
  priceRangeLow: number;
  priceRangeHigh: number;
  avgCapRate: number | null;
  methodology: string;
  confidence: string;
  confidenceScore: number;
}

// ── Cap Rate ─────────────────────────────────────────────────

export interface BovCapRateData {
  marketCapRate: number;
  rangeLow: number;
  rangeHigh: number;
  median: number;
  suggestedExitCap: number;
  compCount: number;
  confidence: string;
  trend: string;
  trendBpsPerYear: number;
  methodology: string;
}

// ── Violations & Condition ───────────────────────────────────

export interface BovViolationSummary {
  hpdClassA: number;
  hpdClassB: number;
  hpdClassC: number;
  hpdOpen: number;
  hpdTotal: number;
  dobViolations: number;
  ecbViolations: number;
  ecbPenalties: number;
  conditionSignal: "green" | "yellow" | "red";
}

export interface BovPermitSummary {
  totalPermits: number;
  recentPermits: BovPermitItem[];
}

export interface BovPermitItem {
  type: string;
  description: string;
  filingDate: string;
  status: string;
}

export interface BovEnergyData {
  siteEUI: number | null;
  sourceEUI: number | null;
  ghgTons: number | null;
  energyStarScore: number | null;
  grade: string | null;
  ll97Status: string | null;
  ll97PenaltyEstimate: number | null;
}

export interface BovLitigationSummary {
  activeCases: number;
  totalCases: number;
  recentCases: BovLitigationCase[];
}

export interface BovLitigationCase {
  caseType: string;
  status: string;
  filingDate: string;
}

// ── Market & Neighborhood ────────────────────────────────────

export interface BovNeighborhoodData {
  name: string | null;
  population: number | null;
  medianHouseholdIncome: number | null;
  medianAge: number | null;
  ownerOccupiedPct: number | null;
  renterOccupiedPct: number | null;
  medianHomeValue: number | null;
  medianRent: number | null;
  summary: string | null;
}

export interface BovRentStabData {
  stabilizedUnits: number;
  totalUnits: number;
  stabilizedPct: number;
  rgbBlendedRate: number | null;
  notes: string[];
}

// ── Valuation ────────────────────────────────────────────────

export interface BovValuationEstimate {
  // Sales comparison
  salesCompValue: number | null;
  salesCompBasis: string | null;

  // Income approach
  incomeValue: number | null;
  incomeBasis: string | null;

  // Reconciled
  reconciledLow: number;
  reconciledLikely: number;
  reconciledHigh: number;

  // Suggested listing
  suggestedListingLow: number | null;
  suggestedListingHigh: number | null;

  disclaimer: string;
}
