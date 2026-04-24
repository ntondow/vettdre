/**
 * Unit tests for terminal brief templates.
 * Run: npx tsx src/lib/terminal-brief-templates.test.ts
 */

import { generateTemplateBrief, titleCase, sentenceCase, cleanField, truncateAtWord } from "./terminal-brief-templates";

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

function assertEq(actual: string | null, expected: string | null, name: string) {
  assert(actual === expected, name, actual !== expected ? `expected "${expected}", got "${actual}"` : undefined);
}

function test(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ── Fixtures ─────────────────────────────────────────────────

const baseProfile = {
  address: "320 BEACH 67 STREET",
  borough: "Queens",
  neighborhood: "Far Rockaway",
  ntaCode: "QN72",
  zoningDistricts: ["R5"],
  buildingClass: "C4",
  landUse: "02",
  lotArea: 4000,
  buildingArea: 6000,
  residentialUnits: 3,
  commercialUnits: 0,
  floors: 3,
  yearBuilt: 1930,
  ownerName: "BEACH 67 LLC",
  zipCode: "11692",
  builtFAR: null,
  maxFAR: null,
  unusedFAR: null,
  unusedSqFt: null,
};

const baseEnrichment = {
  event_core: { eventType: "HPD_VIOLATION", detectedAt: "2026-04-22T10:00:00Z", rawFields: {} },
  property_profile: baseProfile,
  valuation_context: null,
  violation_profile: null,
  permit_history: null,
  ownership_chain: null,
  portfolio_intel: null,
};

// ══════════════════════════════════════════════════════════════
// titleCase Tests
// ══════════════════════════════════════════════════════════════

test("titleCase — plain address", () => {
  assertEq(titleCase("320 BEACH 67 STREET"), "320 Beach 67 Street");
});

test("titleCase — party name with LLC", () => {
  assertEq(titleCase("ALEM ENTERPRISES, LLC"), "Alem Enterprises, LLC");
});

test("titleCase — party name with N.A.", () => {
  assertEq(titleCase("JPMORGAN CHASE BANK, N.A."), "Jpmorgan Chase Bank, N.A.");
});

test("titleCase — hyphenated address", () => {
  assertEq(titleCase("214-02 HILLSIDE AVENUE"), "214-02 Hillside Avenue");
});

test("titleCase — ordinal street", () => {
  assertEq(titleCase("67TH STREET"), "67th Street");
});

test("titleCase — preserves ESQ", () => {
  const result = titleCase("PRYOR, ESQ., REFEREE, EDMOND");
  assert(result.includes("ESQ"), `expected ESQ preserved, got "${result}"`);
});

test("titleCase — empty string", () => {
  assertEq(titleCase(""), "");
});

// Fix 1: lowercase prepositions/articles
test("titleCase — lowercase 'of' mid-string", () => {
  assertEq(titleCase("ESTATE OF ANNA I. SILVA"), "Estate of Anna I. Silva");
});

test("titleCase — leading 'The' stays capitalized", () => {
  assertEq(titleCase("THE BANK OF NEW YORK"), "The Bank of New York");
});

test("titleCase — leading 'Of' stays capitalized", () => {
  assertEq(titleCase("OF COUNSEL"), "Of Counsel");
});

test("titleCase — multiple prepositions", () => {
  const result = titleCase("BANK OF THE CITY OF NEW YORK");
  assertEq(result, "Bank of the City of New York");
});

// Fix 2: short-acronym heuristic
test("titleCase — NYC REO LLC preserved", () => {
  assertEq(titleCase("NYC REO LLC"), "NYC REO LLC");
});

test("titleCase — YYY preserved, WEST title-cased", () => {
  assertEq(titleCase("YYY WEST 36TH STREET LLC"), "YYY West 36th Street LLC");
});

test("titleCase — NEW is common 3-letter word, title-cased", () => {
  assertEq(titleCase("NEW YORK BANK"), "New York Bank");
});

test("titleCase — THE is common, title-cased at start", () => {
  assertEq(titleCase("THE BANK"), "The Bank");
});

// Fix 3: INC/LTD normalized
test("titleCase — INC. normalized to Inc.", () => {
  assertEq(titleCase("ALEM ENTERPRISES, INC."), "Alem Enterprises, Inc.");
});

test("titleCase — INC (no period) gets period added", () => {
  assertEq(titleCase("ALEM ENTERPRISES, INC"), "Alem Enterprises, Inc.");
});

test("titleCase — LTD. normalized to Ltd.", () => {
  assertEq(titleCase("SMITH LTD."), "Smith Ltd.");
});

test("titleCase — CO normalized to Co.", () => {
  assertEq(titleCase("JONES & CO"), "Jones & Co.");
});

test("titleCase — LLC untouched by suffix normalizer", () => {
  assertEq(titleCase("CORPORATION LLC"), "Corporation LLC");
});

// ══════════════════════════════════════════════════════════════
// sentenceCase Tests
// ══════════════════════════════════════════════════════════════

test("sentenceCase — NOV preserved", () => {
  assertEq(sentenceCase("NOV SENT OUT"), "NOV sent out");
});

test("sentenceCase — plain status", () => {
  assertEq(sentenceCase("VIOLATION DISMISSED"), "Violation dismissed");
});

test("sentenceCase — multi-word status", () => {
  assertEq(sentenceCase("PLAN EXAMINER REVIEW"), "Plan examiner review");
});

test("sentenceCase — single word", () => {
  assertEq(sentenceCase("APPROVED"), "Approved");
});

// ══════════════════════════════════════════════════════════════
// cleanField Tests
// ══════════════════════════════════════════════════════════════

test("cleanField — normal value passes through", () => {
  assertEq(cleanField("Approved"), "Approved");
});

test("cleanField — 'other' returns null", () => {
  assert(cleanField("other") === null, "'other'");
  assert(cleanField("Other") === null, "'Other'");
  assert(cleanField("OTHER") === null, "'OTHER'");
});

test("cleanField — 'unknown', 'n/a', 'none' return null", () => {
  assert(cleanField("unknown") === null, "'unknown'");
  assert(cleanField("N/A") === null, "'N/A'");
  assert(cleanField("none") === null, "'none'");
});

test("cleanField — empty/null/undefined return null", () => {
  assert(cleanField("") === null, "empty string");
  assert(cleanField(null) === null, "null");
  assert(cleanField(undefined) === null, "undefined");
});

// ══════════════════════════════════════════════════════════════
// truncateAtWord Tests
// ══════════════════════════════════════════════════════════════

test("truncateAtWord — short string unchanged", () => {
  assertEq(truncateAtWord("hello world", 50), "hello world");
});

test("truncateAtWord — cuts at word boundary", () => {
  const result = truncateAtWord("the quick brown fox jumps over the lazy dog", 15);
  assert(result.endsWith("\u2026"), `should end with ellipsis, got "${result}"`);
  assert(result.length <= 16, `length should be <= maxLen+1 (ellipsis), got ${result.length}`);
  const textBeforeEllipsis = result.slice(0, -1).trimEnd();
  const lastChar = textBeforeEllipsis[textBeforeEllipsis.length - 1];
  assert(lastChar === " " || /[a-z0-9]/i.test(lastChar), `must end cleanly, got "${result}"`);
});

test("truncateAtWord — uses single-char ellipsis", () => {
  const result = truncateAtWord("a".repeat(100), 10);
  assert(result.endsWith("\u2026"), "uses unicode ellipsis");
  assert(!result.includes("..."), "does not use three dots");
});

// ══════════════════════════════════════════════════════════════
// HPD_VIOLATION Tests
// ══════════════════════════════════════════════════════════════

test("HPD_VIOLATION — happy path, no description leaked", () => {
  const event = {
    eventType: "HPD_VIOLATION",
    bbl: "4072650001",
    borough: 4,
    detectedAt: new Date().toISOString(),
    metadata: {
      class: "C",
      novdescription: "D26-10.01 ADM CODE PROPERLY REPAIR WITH SIMILAR MATERIAL THE BROKEN OR DEFECTIVE PLASTERED SURFACES",
      currentstatus: "Open",
    },
    enrichmentPackage: baseEnrichment,
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief !== null, "returns a brief");
  assert(brief.includes("Class C"), "contains violation class");
  assert(brief.includes("immediately hazardous"), "contains class description");
  assert(brief.includes("320 Beach 67 Street"), "title-cased address");
  assert(!/320 BEACH/.test(brief), "no ALL CAPS address");
  assert(!/d\d+-\d+\.\d+/.test(brief), "no regulatory code pattern");
  assert(!/adm code/i.test(brief), "no 'adm code' text");
  assert(!brief.includes("properly repair"), "no raw HPD description");
  assert(!brief.includes("Status:"), "omits 'Open' status");
  console.log(`    Output: "${brief}"`);
});

test("HPD_VIOLATION — NOV status preserved as acronym", () => {
  const event = {
    eventType: "HPD_VIOLATION",
    bbl: "4072650001",
    borough: 4,
    detectedAt: new Date().toISOString(),
    metadata: { class: "C", currentstatus: "NOV SENT OUT" },
    enrichmentPackage: baseEnrichment,
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief.includes("Status: NOV sent out"), `expected "Status: NOV sent out", got "${brief}"`);
  console.log(`    Output: "${brief}"`);
});

test("HPD_VIOLATION — non-open status shown (sentence-cased)", () => {
  const event = {
    eventType: "HPD_VIOLATION",
    bbl: "4072650001",
    borough: 4,
    detectedAt: new Date().toISOString(),
    metadata: { class: "B", currentstatus: "VIOLATION DISMISSED" },
    enrichmentPackage: baseEnrichment,
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief.includes("Status: Violation dismissed"), `expected "Violation dismissed", got "${brief}"`);
});

test("HPD_VIOLATION — missing class returns null", () => {
  const event = {
    eventType: "HPD_VIOLATION",
    bbl: "4072650001",
    borough: 4,
    detectedAt: new Date().toISOString(),
    metadata: { novdescription: "SOME ISSUE" },
    enrichmentPackage: baseEnrichment,
  };
  assert(generateTemplateBrief(event) === null, "returns null when class missing");
});

test("HPD_VIOLATION — missing address returns null", () => {
  const event = {
    eventType: "HPD_VIOLATION",
    bbl: "4072650001",
    borough: 4,
    detectedAt: new Date().toISOString(),
    metadata: { class: "B" },
    enrichmentPackage: { ...baseEnrichment, property_profile: null },
  };
  assert(generateTemplateBrief(event) === null, "returns null when no property profile");
});

// ══════════════════════════════════════════════════════════════
// NEW_BUILDING_PERMIT Tests
// ══════════════════════════════════════════════════════════════

test("NEW_BUILDING_PERMIT — happy path", () => {
  const event = {
    eventType: "NEW_BUILDING_PERMIT",
    bbl: "3072650001",
    borough: 3,
    detectedAt: new Date().toISOString(),
    metadata: {
      job_type: "NB",
      proposed_no_of_stories: "12",
      proposed_dwelling_units: "48",
      initial_cost: "15000000",
      building_type: "Residential",
      filing_status: "Approved",
    },
    enrichmentPackage: {
      ...baseEnrichment,
      property_profile: { ...baseProfile, address: "500 ATLANTIC AVE", borough: "Brooklyn", neighborhood: "Boerum Hill", residentialUnits: 48 },
    },
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief !== null, "returns a brief");
  assert(brief.includes("500 Atlantic Ave"), "title-cased address");
  assert(brief.includes("12-story"), "contains stories");
  assert(brief.includes("residential"), "contains building type (lowercased)");
  assert(brief.includes("48 dwelling units"), "contains units");
  assert(brief.includes("$15M"), "contains cost");
  assert(!/500 ATLANTIC/.test(brief), "no ALL CAPS address");
  console.log(`    Output: "${brief}"`);
});

test("NEW_BUILDING_PERMIT — building_type 'other' is dropped", () => {
  const event = {
    eventType: "NEW_BUILDING_PERMIT",
    bbl: "3072650001",
    borough: 3,
    detectedAt: new Date().toISOString(),
    metadata: {
      job_type: "NB",
      proposed_no_of_stories: "8",
      proposed_dwelling_units: "55",
      building_type: "Other",
      filing_status: "Approved",
    },
    enrichmentPackage: {
      ...baseEnrichment,
      property_profile: { ...baseProfile, address: "159 NEWPORT STREET", neighborhood: "East Flatbush" },
    },
  };
  const brief = generateTemplateBrief(event)!;
  assert(!brief.toLowerCase().includes("other"), `"other" should not appear: "${brief}"`);
  assert(brief.includes("8-story"), "still contains stories");
  assert(brief.includes("55 dwelling units"), "still contains units");
  console.log(`    Output: "${brief}"`);
});

test("NEW_BUILDING_PERMIT — status uses sentenceCase", () => {
  const event = {
    eventType: "NEW_BUILDING_PERMIT",
    bbl: "3072650001",
    borough: 3,
    detectedAt: new Date().toISOString(),
    metadata: {
      job_type: "NB",
      proposed_no_of_stories: "5",
      filing_status: "PLAN EXAMINER REVIEW",
    },
    enrichmentPackage: {
      ...baseEnrichment,
      property_profile: { ...baseProfile, address: "100 MAIN ST" },
    },
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief.includes("Status: Plan examiner review"), `expected sentence-cased status, got "${brief}"`);
});

test("NEW_BUILDING_PERMIT — null filing_status is dropped", () => {
  const event = {
    eventType: "NEW_BUILDING_PERMIT",
    bbl: "3072650001",
    borough: 3,
    detectedAt: new Date().toISOString(),
    metadata: { job_type: "NB", proposed_no_of_stories: "5", filing_status: null },
    enrichmentPackage: { ...baseEnrichment, property_profile: { ...baseProfile, address: "100 MAIN ST" } },
  };
  const brief = generateTemplateBrief(event)!;
  assert(!brief.includes("Status:"), "no status clause when null");
});

test("NEW_BUILDING_PERMIT — missing metadata returns null", () => {
  const event = {
    eventType: "NEW_BUILDING_PERMIT",
    bbl: "3072650001",
    borough: 3,
    detectedAt: new Date().toISOString(),
    metadata: null,
    enrichmentPackage: baseEnrichment,
  };
  assert(generateTemplateBrief(event) === null, "returns null when no metadata");
});

// ══════════════════════════════════════════════════════════════
// LOAN_RECORDED Tests
// ══════════════════════════════════════════════════════════════

test("LOAN_RECORDED — happy path", () => {
  const event = {
    eventType: "LOAN_RECORDED",
    bbl: "1012340001",
    borough: 1,
    detectedAt: new Date().toISOString(),
    metadata: {
      document_amt: "8500000",
      _parties: [
        { name: "MANHATTAN HOLDINGS LLC", type: "1" },
        { name: "SIGNATURE BANK", type: "2" },
      ],
    },
    enrichmentPackage: {
      ...baseEnrichment,
      property_profile: { ...baseProfile, address: "100 PARK AVE", borough: "Manhattan", neighborhood: "Murray Hill", residentialUnits: 20 },
    },
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief !== null, "returns a brief");
  assert(brief.startsWith("$8.5M mortgage"), "amount leads");
  assert(brief.includes("from Signature Bank"), "title-cased lender after 'from'");
  assert(brief.includes("to Manhattan Holdings LLC"), "title-cased borrower after 'to'");
  assert(brief.includes("against 100 Park Ave"), "'against' before address");
  assert(brief.includes("Murray Hill"), "contains neighborhood");
  assert(!/100 PARK/.test(brief), "no ALL CAPS address");
  assert(!/SIGNATURE BANK/.test(brief), "no ALL CAPS party name");
  console.log(`    Output: "${brief}"`);
});

test("LOAN_RECORDED — INC normalized in party name", () => {
  const event = {
    eventType: "LOAN_RECORDED",
    bbl: "1012340001",
    borough: 1,
    detectedAt: new Date().toISOString(),
    metadata: {
      document_amt: "500000",
      _parties: [
        { name: "ALEM ENTERPRISES, INC.", type: "1" },
        { name: "CHASE BANK", type: "2" },
      ],
    },
    enrichmentPackage: baseEnrichment,
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief.includes("Alem Enterprises, Inc."), `expected "Inc.", got "${brief}"`);
});

test("LOAN_RECORDED — zero amount returns null", () => {
  const event = {
    eventType: "LOAN_RECORDED",
    bbl: "1012340001",
    borough: 1,
    detectedAt: new Date().toISOString(),
    metadata: { document_amt: "0" },
    enrichmentPackage: baseEnrichment,
  };
  assert(generateTemplateBrief(event) === null, "returns null when amount is zero");
});

test("LOAN_RECORDED — no parties still produces brief", () => {
  const event = {
    eventType: "LOAN_RECORDED",
    bbl: "1012340001",
    borough: 1,
    detectedAt: new Date().toISOString(),
    metadata: { document_amt: "500000", _parties: [] },
    enrichmentPackage: baseEnrichment,
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief !== null, "still generates brief without parties");
  assert(brief.startsWith("$500K mortgage"), "amount leads");
  assert(!brief.includes(" from "), "no ' from ' without lender");
});

// ══════════════════════════════════════════════════════════════
// SALE_RECORDED Tests
// ══════════════════════════════════════════════════════════════

test("SALE_RECORDED — happy path with prepositions lowered", () => {
  const event = {
    eventType: "SALE_RECORDED",
    bbl: "2056780001",
    borough: 2,
    detectedAt: new Date().toISOString(),
    metadata: {
      document_amt: "3200000",
      _parties: [
        { name: "ESTATE OF ANNA I. SILVA", type: "1" },
        { name: "BRONX REALTY INC", type: "2" },
      ],
    },
    enrichmentPackage: {
      ...baseEnrichment,
      property_profile: { ...baseProfile, address: "2250 WEBSTER AVE", borough: "Bronx", neighborhood: "Tremont", residentialUnits: 20 },
    },
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief !== null, "returns a brief");
  assert(brief.includes("2250 Webster Ave"), "title-cased address");
  assert(brief.includes("$3.2M"), "contains formatted amount");
  assert(brief.includes("Estate of Anna"), "lowercase 'of' in buyer name");
  assert(brief.includes("Bronx Realty Inc."), "INC normalized to Inc. in seller");
  assert(!/2250 WEBSTER/.test(brief), "no ALL CAPS address");
  console.log(`    Output: "${brief}"`);
});

test("SALE_RECORDED — NYC REO LLC acronyms preserved", () => {
  const event = {
    eventType: "SALE_RECORDED",
    bbl: "3056780001",
    borough: 3,
    detectedAt: new Date().toISOString(),
    metadata: {
      document_amt: "500000",
      _parties: [
        { name: "SMITH, DAMION", type: "1" },
        { name: "NYC REO LLC", type: "2" },
      ],
    },
    enrichmentPackage: {
      ...baseEnrichment,
      property_profile: { ...baseProfile, address: "499 MILFORD STREET", neighborhood: "East New York", residentialUnits: 5 },
    },
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief.includes("NYC REO LLC"), `expected "NYC REO LLC", got "${brief}"`);
  assert(brief.includes("Smith, Damion"), "buyer title-cased");
  console.log(`    Output: "${brief}"`);
});

test("SALE_RECORDED — zero amount returns null", () => {
  const event = {
    eventType: "SALE_RECORDED",
    bbl: "2056780001",
    borough: 2,
    detectedAt: new Date().toISOString(),
    metadata: { document_amt: "0" },
    enrichmentPackage: baseEnrichment,
  };
  assert(generateTemplateBrief(event) === null, "returns null when amount is zero");
});

test("SALE_RECORDED — only buyer, no seller", () => {
  const event = {
    eventType: "SALE_RECORDED",
    bbl: "2056780001",
    borough: 2,
    detectedAt: new Date().toISOString(),
    metadata: {
      document_amt: "500000",
      _parties: [{ name: "ACME LLC", type: "1" }],
    },
    enrichmentPackage: baseEnrichment,
  };
  const brief = generateTemplateBrief(event)!;
  assert(brief.includes("to Acme LLC"), "shows buyer with 'to'");
});

// ══════════════════════════════════════════════════════════════
// Unknown event type
// ══════════════════════════════════════════════════════════════

test("Unknown event type returns null", () => {
  const event = {
    eventType: "UNKNOWN_TYPE",
    bbl: "1000000001",
    borough: 1,
    detectedAt: new Date().toISOString(),
    metadata: {},
    enrichmentPackage: baseEnrichment,
  };
  assert(generateTemplateBrief(event) === null, "returns null for unknown event types");
});

// ══════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
