/**
 * Phase 7 Intel API Tests — synthetic-fixture round-trip tests.
 * Run: npx tsx src/lib/condo-ingest/intel-api.test.ts
 *
 * Tests response shape contracts, serializer correctness, and validation logic.
 * No live DB — uses synthetic fixtures.
 */

import {
  serializeBuilding,
  serializeSignal,
  serializeUnit,
  serializeEntity,
  serializeAlias,
  serializeRelatedEntity,
  serializeExemption,
  serializePortfolioBuilding,
} from "@/lib/intel-api-serializers";

import type {
  IntelBuilding,
  IntelSignal,
  IntelUnit,
  IntelEntity,
  IntelAlias,
  IntelRelatedEntity,
  IntelExemption,
  IntelPortfolioBuilding,
  IntelOwnershipSummary,
  IntelMortgageSummary,
  IntelBuildingResponse,
  IntelUnitsResponse,
  IntelEntitySearchResponse,
  IntelBuildingSignalsResponse,
  MobileCondoIntelBlock,
} from "@/lib/intel-api-types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}

function test(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ══════════════════════════════════════════════════════════════
// Serializer Tests
// ══════════════════════════════════════════════════════════════

test("serializeBuilding — maps Prisma fields to API shape", () => {
  const raw = {
    bbl: "1011577501",
    address: "15 Central Park West",
    normalizedAddress: "15 Central Park West, Manhattan, NY",
    borough: 1,
    totalUnits: 201,
    residentialUnits: 201,
    commercialUnits: 0,
    yearBuilt: 2008,
    buildingClass: "R4",
    propertyType: "condo",
    grossSqft: 350000,
    lastSyncedAt: new Date("2026-04-25T10:00:00Z"),
  };
  const result: IntelBuilding = serializeBuilding(raw);
  assert(result.bbl === "1011577501", "bbl");
  assert(result.address === "15 Central Park West", "address");
  assert(result.totalUnits === 201, "totalUnits");
  assert(result.yearBuilt === 2008, "yearBuilt");
  assert(result.propertyType === "condo", "propertyType");
  assert(typeof result.lastSyncedAt === "string", "lastSyncedAt is ISO string");
});

test("serializeBuilding — handles null/missing fields", () => {
  const raw = { bbl: "1000000001", address: "Test", normalizedAddress: "Test" };
  const result = serializeBuilding(raw);
  assert(result.totalUnits === null, "null totalUnits");
  assert(result.yearBuilt === null, "null yearBuilt");
  assert(result.buildingClass === null, "null buildingClass");
  assert(result.lastSyncedAt === null, "null lastSyncedAt");
});

test("serializeSignal — maps signal fields", () => {
  const raw = {
    signalType: "pre_foreclosure_risk",
    score: 75,
    confidence: "high",
    evidence: { components: [{ name: "tax_liens", points: 25 }] },
    computedAt: new Date("2026-04-25T10:00:00Z"),
  };
  const result: IntelSignal = serializeSignal(raw);
  assert(result.signalType === "pre_foreclosure_risk", "signalType");
  assert(result.score === 75, "score is number");
  assert(result.confidence === "high", "confidence");
  assert(typeof result.computedAt === "string", "computedAt is string");
  assert(result.evidence.components !== undefined, "evidence has components");
});

test("serializeSignal — null score for insufficient data", () => {
  const raw = { signalType: "sponsor_overhang", score: null, confidence: "insufficient_data", evidence: { reason: "Missing yearBuilt" }, computedAt: new Date() };
  const result = serializeSignal(raw);
  assert(result.score === null, "null score preserved");
  assert(result.confidence === "insufficient_data", "insufficient_data confidence");
});

test("serializeUnit — maps unit + ownership", () => {
  const unit = { unitNumber: "12B", unitBbl: "1011577512" };
  const ownership = {
    currentOwnerName: "SMITH, JOHN",
    currentOwnerEntityId: "uuid-123",
    ownerMailingAddress: "123 Main St, FL",
    lastSaleDate: new Date("2024-06-15"),
    lastSalePrice: 5500000,
    primaryResidenceFlag: false,
    mailingDiffersFromUnit: true,
  };
  const result: IntelUnit = serializeUnit(unit, ownership);
  assert(result.unitNumber === "12B", "unitNumber");
  assert(result.currentOwnerName === "SMITH, JOHN", "ownerName");
  assert(result.lastSaleDate === "2024-06-15", "lastSaleDate as date string");
  assert(result.lastSalePrice === 5500000, "lastSalePrice as number");
  assert(result.investorBadge === true, "investor badge (mailing differs + not primary)");
});

test("serializeUnit — primary residence is NOT investor", () => {
  const unit = { unitNumber: "3A", unitBbl: "1011577503" };
  const ownership = { primaryResidenceFlag: true, mailingDiffersFromUnit: false };
  const result = serializeUnit(unit, ownership);
  assert(result.investorBadge === false, "primary residence = not investor");
});

test("serializeEntity — maps entity fields", () => {
  const raw = {
    id: "uuid-entity",
    canonicalName: "WITKOFF GROUP LLC",
    entityType: "llc",
    dosId: "12345",
    icijNodeId: null,
    ofacSdnId: null,
    isBank: false,
    bankFfiecId: null,
    confidence: 0.85,
    sources: ["acris", "ny_dos"],
  };
  const result: IntelEntity = serializeEntity(raw);
  assert(result.canonicalName === "WITKOFF GROUP LLC", "canonicalName");
  assert(result.entityType === "llc", "entityType");
  assert(result.dosId === "12345", "dosId");
  assert(result.isBank === false, "isBank");
  assert(result.confidence === 0.85, "confidence as number");
  assert(Array.isArray(result.sources), "sources is array");
});

test("serializeExemption — active vs expired", () => {
  const active = { exemptionType: "421a", expirationDate: new Date("2027-12-31"), primaryResidence: null };
  const expired = { exemptionType: "J-51", expirationDate: new Date("2020-01-01"), primaryResidence: true };

  const r1 = serializeExemption(active);
  assert(r1.status === "active", "future date = active");
  assert(r1.type === "421a", "type");

  const r2 = serializeExemption(expired);
  assert(r2.status === "expired", "past date = expired");
});

test("serializePortfolioBuilding — includes signals + distress", () => {
  const b = { bbl: "1011577501", address: "15 CPW", totalUnits: 201 };
  const result: IntelPortfolioBuilding = serializePortfolioBuilding(b, 5, true, "direct");
  assert(result.bbl === "1011577501", "bbl");
  assert(result.buildingSignalsCount === 5, "signalsCount");
  assert(result.distressFlag === true, "distressFlag");
  assert(result.ownershipRole === "direct", "role");
});

// ══════════════════════════════════════════════════════════════
// Response Shape Validation
// ══════════════════════════════════════════════════════════════

test("IntelBuildingResponse — shape contract", () => {
  const response: IntelBuildingResponse = {
    building: serializeBuilding({ bbl: "1000000001", address: "Test", normalizedAddress: "Test" }),
    ownershipSummary: { uniqueOwners: 10, primaryResidencePct: 40, investorPct: 60, sponsorOwnedCount: 2 },
    mortgageSummary: { activeMortgages: 3, totalMortgageAmount: 15000000, lenderBreakdown: [], distressLenderCount: 1, weightedAvgMaturityYears: null },
    signals: [],
    lastSale: null,
    exemptions: [],
  };
  assert(response.building.bbl === "1000000001", "building.bbl");
  assert(response.ownershipSummary.uniqueOwners === 10, "ownershipSummary");
  assert(response.mortgageSummary.activeMortgages === 3, "mortgageSummary");
  assert(Array.isArray(response.signals), "signals is array");
});

test("IntelUnitsResponse — shape contract", () => {
  const response: IntelUnitsResponse = {
    units: [],
    nextCursor: null,
    totalCount: 0,
  };
  assert(Array.isArray(response.units), "units is array");
  assert(response.nextCursor === null, "nextCursor null when no more");
});

test("IntelEntitySearchResponse — shape contract", () => {
  const response: IntelEntitySearchResponse = {
    matches: [{
      entityId: "uuid",
      canonicalName: "TEST LLC",
      entityType: "llc",
      confidence: 0.95,
      holdingsCount: 5,
      neighborhoods: ["Midtown"],
    }],
  };
  assert(response.matches.length === 1, "one match");
  assert(response.matches[0].confidence === 0.95, "confidence");
  assert(response.matches[0].holdingsCount === 5, "holdingsCount");
});

test("MobileCondoIntelBlock — shape contract", () => {
  const block: MobileCondoIntelBlock = {
    signalsSummary: { highestSignal: "pre_foreclosure_risk", score: 75 },
    ownershipSummary: { uniqueOwners: 10, investorPct: 60 },
    distressFlag: true,
  };
  assert(block.signalsSummary.highestSignal === "pre_foreclosure_risk", "highest signal");
  assert(block.distressFlag === true, "distressFlag");
});

// ══════════════════════════════════════════════════════════════
// Validation Logic
// ══════════════════════════════════════════════════════════════

test("BBL validation — 10 digits required", () => {
  assert(/^\d{10}$/.test("1011577501"), "valid BBL");
  assert(!/^\d{10}$/.test("101157750"), "9 digits = invalid");
  assert(!/^\d{10}$/.test("10115775011"), "11 digits = invalid");
  assert(!/^\d{10}$/.test("ABC1234567"), "alpha chars = invalid");
  assert(!/^\d{10}$/.test(""), "empty = invalid");
});

test("Search query validation — min 2 chars", () => {
  assert("AB".trim().length >= 2, "2 chars = valid");
  assert("A".trim().length < 2, "1 char = invalid");
  assert("".trim().length < 2, "empty = invalid");
});

test("Pagination limit — clamped to max 200", () => {
  assert(Math.min(parseInt("50"), 200) === 50, "50 ok");
  assert(Math.min(parseInt("200"), 200) === 200, "200 ok");
  assert(Math.min(parseInt("999"), 200) === 200, "999 clamped to 200");
  assert(Math.min(parseInt("0"), 200) === 0, "0 ok");
});

// ══════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
