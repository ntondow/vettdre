/**
 * Intel API Response Types — Phase 7
 *
 * These types are CONTRACTS. The frontend (Phase 8) relies on them.
 * Do not break backward compatibility without a migration plan.
 */

// ── Endpoint 1: GET /api/intel/buildings/[bbl] ───────────────

export interface IntelBuildingResponse {
  building: IntelBuilding;
  ownershipSummary: IntelOwnershipSummary;
  mortgageSummary: IntelMortgageSummary;
  signals: IntelSignal[];
  lastSale: IntelLastSale | null;
  exemptions: IntelExemption[];
}

export interface IntelBuilding {
  bbl: string;
  address: string;
  normalizedAddress: string;
  borough: number;
  totalUnits: number | null;
  residentialUnits: number | null;
  commercialUnits: number | null;
  yearBuilt: number | null;
  buildingClass: string | null;
  propertyType: string | null;
  grossSqft: number | null;
  lastSyncedAt: string | null;
}

export interface IntelOwnershipSummary {
  uniqueOwners: number;
  primaryResidencePct: number;
  investorPct: number;
  sponsorOwnedCount: number;
}

export interface IntelMortgageSummary {
  activeMortgages: number;
  totalMortgageAmount: number;
  lenderBreakdown: { lenderName: string; amount: number; isBank: boolean }[];
  distressLenderCount: number;
  weightedAvgMaturityYears: number | null;
}

export interface IntelSignal {
  signalType: string;
  score: number | null;
  confidence: string;
  evidence: Record<string, any>;
  computedAt: string;
}

export interface IntelLastSale {
  date: string;
  price: number | null;
  docId: string | null;
  grantor: string | null;
  grantee: string | null;
}

export interface IntelExemption {
  type: string | null;
  expiresAt: string | null;
  status: string;
  primaryResidence: boolean | null;
}

// ── Endpoint 2: GET /api/intel/buildings/[bbl]/units ─────────

export interface IntelUnitsResponse {
  units: IntelUnit[];
  nextCursor: string | null;
  totalCount: number;
}

export interface IntelUnit {
  unitNumber: string | null;
  unitBbl: string | null;
  currentOwnerName: string | null;
  ownerEntityId: string | null;
  mailingAddress: string | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  primaryResidence: boolean | null;
  investorBadge: boolean;
  exemptions: string[];
}

// ── Endpoint 3: GET /api/intel/entities/[entity_id] ──────────

export interface IntelEntityResponse {
  entity: IntelEntity;
  aliases: IntelAlias[];
  holdings: IntelHoldings;
  relatedEntities: IntelRelatedEntity[];
  flags: IntelEntityFlags;
}

export interface IntelEntity {
  id: string;
  canonicalName: string;
  entityType: string;
  dosId: string | null;
  icijNodeId: string | null;
  ofacSdnId: string | null;
  isBank: boolean;
  bankFfiecId: string | null;
  confidence: number;
  sources: string[];
}

export interface IntelAlias {
  alias: string;
  source: string;
}

export interface IntelHoldings {
  buildingsCount: number;
  unitsCount: number;
  totalAssessedValue: number;
  oldestAcquisition: string | null;
  newestAcquisition: string | null;
  neighborhoods: string[];
}

export interface IntelRelatedEntity {
  entityId: string;
  name: string;
  edgeType: string;
  confidence: number;
}

export interface IntelEntityFlags {
  offshore: boolean;
  sanctioned: boolean;
  inDistressPortfolio: boolean;
}

// ── Endpoint 4: GET /api/intel/entities/search ───────────────

export interface IntelEntitySearchResponse {
  matches: IntelEntityMatch[];
}

export interface IntelEntityMatch {
  entityId: string;
  canonicalName: string;
  entityType: string;
  confidence: number;
  holdingsCount: number;
  neighborhoods: string[];
}

// ── Endpoint 5: GET /api/intel/portfolios/[entity_id] ────────

export interface IntelPortfolioResponse {
  primaryEntity: IntelEntity;
  relatedEntities: IntelRelatedEntity[];
  buildings: IntelPortfolioBuilding[];
  summary: IntelPortfolioSummary;
}

export interface IntelPortfolioBuilding {
  bbl: string;
  address: string;
  totalUnits: number | null;
  buildingSignalsCount: number;
  distressFlag: boolean;
  ownershipRole: "direct" | "via_related_llc";
}

export interface IntelPortfolioSummary {
  directBuildings: number;
  relatedBuildings: number;
  totalUnits: number;
  distressCount: number;
  totalOutstandingMortgage: number;
}

// ── Endpoint 6: GET /api/intel/buildings/[bbl]/signals ───────

export interface IntelBuildingSignalsResponse {
  signals: IntelSignal[];
  computedAt: string | null;
}

// ── Mobile API extensions ────────────────────────────────────

export interface MobileCondoIntelBlock {
  signalsSummary: { highestSignal: string | null; score: number | null };
  ownershipSummary: { uniqueOwners: number; investorPct: number } | null;
  distressFlag: boolean;
}
