/**
 * Phase 4 Entity Resolution Tests
 * Run: npx tsx src/lib/condo-ingest/resolver.test.ts
 */

import {
  normalizeName,
  normalizeNameStrict,
  matchEntities,
  aggregateConfidence,
  isSameEntity,
  isEntityName,
  isPersonName,
  jaroWinklerSimilarity,
} from "@/lib/entity-resolver";
import {
  isRegisteredAgentName,
  isAgentServiceAddress,
  isBlacklistedAddress,
} from "./agent-blacklist";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertEq<T>(actual: T, expected: T, name: string) {
  assert(actual === expected, name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function test(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ══════════════════════════════════════════════════════════════
// Name Normalization
// ══════════════════════════════════════════════════════════════

test("normalizeName — strips LLC suffix", () => {
  const result = normalizeName("215 EAST 80 LLC");
  assert(!result.includes("LLC"), `should strip LLC, got "${result}"`);
  assert(result.includes("215 EAST 80"), `should keep address part, got "${result}"`);
});

test("normalizeName — strips INC and Corp", () => {
  assert(!normalizeName("ACME HOLDINGS INC.").includes("INC"), "strips INC");
  assert(!normalizeName("VORNADO REALTY CORP").includes("CORP"), "strips CORP");
});

test("normalizeNameStrict — strips honorifics", () => {
  const result = normalizeNameStrict("MR. JOHN A. SMITH JR.");
  assert(!result.includes("MR"), `no MR, got "${result}"`);
  assert(!result.includes("JR"), `no JR, got "${result}"`);
  // Single-letter middle initial should be stripped
  assert(!/ A /.test(result), `no middle initial, got "${result}"`);
});

test("normalizeNameStrict — preserves core name", () => {
  const result = normalizeNameStrict("DR. STEVEN WITKOFF SR.");
  assert(result.includes("STEVEN"), "keeps first name");
  assert(result.includes("WITKOFF"), "keeps last name");
});

// ══════════════════════════════════════════════════════════════
// Entity Matching
// ══════════════════════════════════════════════════════════════

test("matchEntities — exact normalized match", () => {
  const result = matchEntities("215 EAST 80 LLC", "215 EAST 80TH STREET LLC");
  // Both normalize to same core
  assert(result.confidence >= 0.80, `confidence should be high, got ${result.confidence}`);
});

test("matchEntities — blocks cross-type merge", () => {
  const result = matchEntities("JOHN SMITH", "SMITH HOLDINGS LLC", "individual", "llc");
  assert(!result.match, "should not match individual to LLC");
  assertEq(result.method, "cross_type_blocked", "method");
});

test("matchEntities — Jaro-Winkler on similar names", () => {
  const result = matchEntities("WITKOFF GROUP LLC", "WITKOFF GROUP HOLDINGS LLC");
  assert(result.confidence >= 0.85, `similar LLC names should match well, got ${result.confidence}`);
});

test("matchEntities — person name variants", () => {
  const result = matchEntities("STEVEN WITKOFF", "STEVE WITKOFF");
  // Base isSameEntity handles this via Jaro-Winkler / last-name matching
  assert(result.confidence >= 0.70, `name variants should partially match, got ${result.confidence}`);
});

// ══════════════════════════════════════════════════════════════
// Confidence Aggregation
// ══════════════════════════════════════════════════════════════

test("aggregateConfidence — single signal", () => {
  const result = aggregateConfidence([0.85]);
  assertEq(result, 0.85, "single signal passes through");
});

test("aggregateConfidence — two independent signals", () => {
  const result = aggregateConfidence([0.85, 0.80]);
  // 1 - (1-0.85)(1-0.80) = 1 - 0.15*0.20 = 1 - 0.03 = 0.97
  assert(Math.abs(result - 0.97) < 0.01, `expected ~0.97, got ${result}`);
});

test("aggregateConfidence — capped at 0.99", () => {
  const result = aggregateConfidence([0.95, 0.95, 0.95]);
  assert(result <= 0.99, `should cap at 0.99, got ${result}`);
});

test("aggregateConfidence — empty returns 0", () => {
  assertEq(aggregateConfidence([]), 0, "empty signals → 0");
});

// ══════════════════════════════════════════════════════════════
// Registered-Agent Blacklist
// ══════════════════════════════════════════════════════════════

test("isRegisteredAgentName — Cogency Global", () => {
  assert(isRegisteredAgentName("COGENCY GLOBAL INC"), "catches Cogency Global");
  assert(isRegisteredAgentName("Cogency Global Inc"), "case insensitive");
});

test("isRegisteredAgentName — CT Corporation", () => {
  assert(isRegisteredAgentName("CT CORPORATION SYSTEM"), "catches CT Corp");
  assert(isRegisteredAgentName("C T CORPORATION SYSTEM"), "catches spaced variant");
});

test("isRegisteredAgentName — LegalZoom", () => {
  assert(isRegisteredAgentName("LEGALZOOM"), "catches LegalZoom");
});

test("isRegisteredAgentName — normal company not blacklisted", () => {
  assert(!isRegisteredAgentName("WITKOFF GROUP LLC"), "Witkoff not blacklisted");
  assert(!isRegisteredAgentName("VORNADO REALTY TRUST"), "Vornado not blacklisted");
});

test("isAgentServiceAddress — Cogency Global address", () => {
  assert(isAgentServiceAddress("10 East 40th Street, Floor 10, New York, NY 10016"), "10 E 40th");
});

test("isAgentServiceAddress — PO Box", () => {
  assert(isAgentServiceAddress("P.O. Box 1234, New York, NY 10001"), "PO Box");
  assert(isAgentServiceAddress("PO BOX 567"), "PO BOX");
});

test("isAgentServiceAddress — UPS Store", () => {
  assert(isAgentServiceAddress("123 Main St, UPS Store #456"), "UPS Store");
});

test("isAgentServiceAddress — normal address not blacklisted", () => {
  assert(!isAgentServiceAddress("15 Central Park West, New York, NY 10023"), "15 CPW not blacklisted");
  assert(!isAgentServiceAddress("320 Beach 67 Street, Queens, NY"), "residential not blacklisted");
});

test("isBlacklistedAddress — combines name and address checks", () => {
  assert(isBlacklistedAddress("123 Main St", "CT CORPORATION SYSTEM"), "agent name triggers");
  assert(isBlacklistedAddress("P.O. Box 999"), "PO Box triggers without name");
  assert(!isBlacklistedAddress("15 Central Park West"), "normal address passes");
});

// ══════════════════════════════════════════════════════════════
// OFAC Match Confidence
// ══════════════════════════════════════════════════════════════

test("OFAC-level match requires high confidence", () => {
  // Two very similar names
  const jw = jaroWinklerSimilarity(
    normalizeName("RUSSIAN COMMERCIAL BANK"),
    normalizeName("RUSSIAN COMMERCIAL BANK LTD"),
  );
  assert(jw >= 0.95, `bank names should match at OFAC threshold, got ${jw}`);
});

test("OFAC — dissimilar names don't trigger", () => {
  const jw = jaroWinklerSimilarity(
    normalizeName("SMITH HOLDINGS LLC"),
    normalizeName("JONES MANAGEMENT CORP"),
  );
  assert(jw < 0.80, `different names should not approach OFAC threshold, got ${jw}`);
});

// ══════════════════════════════════════════════════════════════
// Existing entity-resolver functions still work
// ══════════════════════════════════════════════════════════════

test("Legacy isSameEntity — still works", () => {
  const result = isSameEntity("PARKWAY MANAGEMENT LLC", "PARKWAY MANAGEMENT NY LLC");
  assert(result.match, "containment match should still work");
  assert(result.confidence >= 80, `confidence should be high, got ${result.confidence}`);
});

test("Legacy isEntityName — still works", () => {
  assert(isEntityName("ACME HOLDINGS LLC"), "LLC detected");
  assert(!isEntityName("JOHN SMITH"), "individual not entity");
});

test("Legacy isPersonName — still works", () => {
  assert(isPersonName("JOHN SMITH"), "person detected");
  assert(!isPersonName("ACME LLC"), "LLC not person");
});

// ══════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
