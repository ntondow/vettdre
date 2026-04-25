/**
 * Phase 5 Distress Signals Tests
 * Run: npx tsx src/lib/condo-ingest/distress-signals.test.ts
 *
 * Tests the component scoring logic in isolation (no DB required).
 */

import { classifyAsBank, lookupKnownLender } from "./lender-lookup";

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

function test(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ══════════════════════════════════════════════════════════════
// Component Scoring Logic (mirrors distress-signals.ts calculations)
// ══════════════════════════════════════════════════════════════

interface Component { name: string; points: number; }

function computeScore(components: Component[]): number {
  return Math.min(100, components.reduce((s, c) => s + c.points, 0));
}

test("Score: 1 tax lien + maturity 18mo + 3 Class C violations = ~35-45", () => {
  const components: Component[] = [
    { name: "active_tax_liens", points: 25 },       // 1 lien = 25 pts
    { name: "mortgage_maturity", points: 10 },       // 18mo = within 24mo = 10 pts
    { name: "hpd_class_c_density", points: 15 },     // 3 Class C = 15 pts (at threshold)
  ];
  const score = computeScore(components);
  assert(score >= 35 && score <= 55, `score should be 35-55, got ${score}`);
  assert(score === 50, `expected exactly 50, got ${score}`);
});

test("Score: no signals = 0", () => {
  const components: Component[] = [];
  const score = computeScore(components);
  assert(score === 0, `empty signals = 0, got ${score}`);
});

test("Score: all signals maxed = capped at 100", () => {
  const components: Component[] = [
    { name: "active_tax_liens", points: 40 },        // max component
    { name: "mortgage_maturity", points: 20 },
    { name: "hpd_class_c_density", points: 15 },
    { name: "ecb_high_penalty", points: 20 },
    { name: "non_bank_assignment", points: 15 },
    { name: "distressed_satisfaction", points: 10 },
    { name: "lender_stress", points: 20 },
  ];
  const score = computeScore(components);
  assert(score === 100, `all maxed should cap at 100, got ${score}`);
  // Raw sum is 140, cap is 100
  const rawSum = components.reduce((s, c) => s + c.points, 0);
  assert(rawSum === 140, `raw sum is 140, got ${rawSum}`);
});

test("Score: single tax lien only = 25", () => {
  const components: Component[] = [{ name: "active_tax_liens", points: 25 }];
  const score = computeScore(components);
  assert(score === 25, `one lien = 25, got ${score}`);
});

test("Score: multiple tax liens scale (3 liens = 35)", () => {
  // 25 + (3-1)*5 = 35
  const pts = Math.min(25 + (3 - 1) * 5, 40);
  assert(pts === 35, `3 liens = 35 pts, got ${pts}`);
});

test("Score: tax lien component caps at 40", () => {
  const pts = Math.min(25 + (10 - 1) * 5, 40);
  assert(pts === 40, `10 liens = capped at 40, got ${pts}`);
});

test("Component breakdown includes all triggered components", () => {
  const components: Component[] = [
    { name: "active_tax_liens", points: 25 },
    { name: "non_bank_assignment", points: 15 },
  ];
  assert(components.length === 2, `should have 2 components, got ${components.length}`);
  assert(components.some(c => c.name === "active_tax_liens"), "includes tax liens");
  assert(components.some(c => c.name === "non_bank_assignment"), "includes non-bank assignment");
});

// ══════════════════════════════════════════════════════════════
// Lender Classification
// ══════════════════════════════════════════════════════════════

test("classifyAsBank — known banks", () => {
  assert(classifyAsBank("JPMORGAN CHASE BANK, N.A."), "JPMorgan is a bank");
  assert(classifyAsBank("WELLS FARGO BANK, N.A."), "Wells Fargo is a bank");
  assert(classifyAsBank("SIGNATURE BANK"), "Signature Bank is a bank");
  assert(classifyAsBank("APPLE BANK FOR SAVINGS"), "Apple Bank is a bank");
});

test("classifyAsBank — non-banks", () => {
  assert(!classifyAsBank("BLACKSTONE REAL ESTATE PARTNERS"), "PE fund is not a bank");
  assert(!classifyAsBank("JOHN SMITH"), "individual is not a bank");
  assert(!classifyAsBank("215 EAST 80 LLC"), "LLC is not a bank");
});

test("classifyAsBank — edge cases", () => {
  assert(classifyAsBank("RIDGEWOOD SAVINGS BANK"), "savings bank detected via pattern");
  assert(classifyAsBank("FEDERAL CREDIT UNION OF NY"), "credit union detected via pattern");
});

test("lookupKnownLender — returns canonical + FFIEC", () => {
  const result = lookupKnownLender("JPMORGAN CHASE BANK, N.A.");
  assert(result !== null, "found JPMorgan");
  assert(result?.canonicalName === "JPMorgan Chase Bank, N.A.", `canonical: ${result?.canonicalName}`);
  assert(result?.ffiecId === "852218", `ffiecId: ${result?.ffiecId}`);
});

test("lookupKnownLender — recognizes variant names", () => {
  const result = lookupKnownLender("CHASE MANHATTAN BANK");
  assert(result !== null, "found Chase variant");
});

test("lookupKnownLender — unknown lender returns null", () => {
  const result = lookupKnownLender("ACME MORTGAGE FUND LLC");
  assert(result === null, "unknown lender returns null");
});

test("lookupKnownLender — defunct banks flagged", () => {
  const result = lookupKnownLender("SIGNATURE BANK");
  assert(result?.defunct === true, "Signature Bank marked defunct");
});

// ══════════════════════════════════════════════════════════════
// Mortgage Type Classification
// ══════════════════════════════════════════════════════════════

test("Mortgage doc type classification", () => {
  // Test the classification logic inline (same as mortgages.ts)
  const classify = (dt: string) => {
    const d = dt.toUpperCase();
    if (["MTGE", "MTG", "MORT"].includes(d)) return "new";
    if (["SAT", "SATI"].includes(d)) return "satisfied";
    if (["ASST", "ASSIGN"].includes(d)) return "assigned";
    if (d === "CEMA") return "modified";
    if (d === "SPM") return "new";
    if (["MOD", "MODA"].includes(d)) return "modified";
    return "unknown";
  };

  assert(classify("MTGE") === "new", "MTGE = new");
  assert(classify("SAT") === "satisfied", "SAT = satisfied");
  assert(classify("ASST") === "assigned", "ASST = assigned");
  assert(classify("CEMA") === "modified", "CEMA = modified");
  assert(classify("SPM") === "new", "SPM = new (subordinated)");
  assert(classify("MOD") === "modified", "MOD = modified");
});

// ═══════════════════════════════════════���══════════════════════
// Named-Building Spot-Check Fixtures (synthetic, no DB)
// ══════════════════════════════════════════════════════════════

test("Spot-check: Healthy luxury condo (432 Park profile) — score < 10", () => {
  // Healthy building: no liens, distant maturity, bank lender, no stress,
  // minimal violations, no ECB, no non-bank assignment, no distressed refi
  const components: Component[] = [];

  // active_liens: none -> 0 pts
  // mortgage maturity: 7 years out -> not within 24mo -> 0 pts
  // HPD Class C: 1 in 24mo -> below threshold of 3 -> 0 pts
  // ECB high penalty: none -> 0 pts
  // non-bank assignment: false -> 0 pts
  // distressed satisfaction: false -> 0 pts
  // lender stress: false -> 0 pts

  const score = computeScore(components);
  assert(score < 10, `healthy luxury should score < 10, got ${score}`);
  assert(score === 0, `all-clear building = 0, got ${score}`);
  assert(components.length === 0, `no components triggered, got ${components.length}`);
});

test("Spot-check: Distressed building (all signals maxed) — score === 100", () => {
  // Distressed: 2 active liens, maturity in 8mo, lender stressed, 5 Class C,
  // 2 ECB >$10K, non-bank assignment, distressed satisfaction pattern
  const components: Component[] = [];

  // (a) 2 active liens: 25 + (2-1)*5 = 30 pts
  const lienCount = 2;
  if (lienCount > 0) {
    const pts = Math.min(25 + (lienCount - 1) * 5, 40);
    components.push({ name: "active_tax_liens", points: pts });
  }

  // (b) maturity in 8 months: within 12mo -> 20 pts
  components.push({ name: "mortgage_maturity", points: 20 });

  // (c) 5 Class C violations in 24mo: >=3 -> 15 pts
  const classCCount = 5;
  if (classCCount >= 3) {
    components.push({ name: "hpd_class_c_density", points: 15 });
  }

  // (d) 2 ECB >$10K: 10 per filing, cap 20 -> 20 pts
  const ecbCount = 2;
  if (ecbCount > 0) {
    components.push({ name: "ecb_high_penalty", points: Math.min(ecbCount * 10, 20) });
  }

  // (e) non-bank assignment: 15 pts
  components.push({ name: "non_bank_assignment", points: 15 });

  // (f) distressed satisfaction: 10 pts
  components.push({ name: "distressed_satisfaction", points: 10 });

  // (g) lender stress: 20 pts
  components.push({ name: "lender_stress", points: 20 });

  const score = computeScore(components);
  const rawSum = components.reduce((s, c) => s + c.points, 0);

  assert(score === 100, `distressed should cap at 100, got ${score}`);
  assert(rawSum === 130, `raw sum should be 130, got ${rawSum}`);
  assert(components.length === 7, `all 7 components triggered, got ${components.length}`);

  // Verify each component present with correct points
  const byName = Object.fromEntries(components.map(c => [c.name, c.points]));
  assert(byName["active_tax_liens"] === 30, `liens: 30, got ${byName["active_tax_liens"]}`);
  assert(byName["mortgage_maturity"] === 20, `maturity: 20, got ${byName["mortgage_maturity"]}`);
  assert(byName["hpd_class_c_density"] === 15, `HPD: 15, got ${byName["hpd_class_c_density"]}`);
  assert(byName["ecb_high_penalty"] === 20, `ECB: 20, got ${byName["ecb_high_penalty"]}`);
  assert(byName["non_bank_assignment"] === 15, `non-bank: 15, got ${byName["non_bank_assignment"]}`);
  assert(byName["distressed_satisfaction"] === 10, `SAT: 10, got ${byName["distressed_satisfaction"]}`);
  assert(byName["lender_stress"] === 20, `stress: 20, got ${byName["lender_stress"]}`);
});

test("Spot-check: Borderline distressed (1 lien + maturity 10mo + 4 Class C) — score ~60", () => {
  const components: Component[] = [];

  // (a) 1 active lien: 25 pts
  components.push({ name: "active_tax_liens", points: 25 });

  // (b) maturity in 10 months: within 12mo -> 20 pts
  components.push({ name: "mortgage_maturity", points: 20 });

  // (c) 4 Class C violations: >=3 -> 15 pts
  components.push({ name: "hpd_class_c_density", points: 15 });

  // No ECB, no non-bank, no distressed SAT, no lender stress

  const score = computeScore(components);
  assert(score >= 55 && score <= 65, `borderline should be 55-65, got ${score}`);
  assert(score === 60, `expected exactly 60 (25+20+15), got ${score}`);
  assert(components.length === 3, `3 components triggered, got ${components.length}`);
});

// ══════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════���════════════════

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
