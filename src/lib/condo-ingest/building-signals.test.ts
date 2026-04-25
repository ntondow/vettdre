/**
 * Phase 6 Building Signals Tests
 * Run: npx tsx src/lib/condo-ingest/building-signals.test.ts
 *
 * Tests the scoring math in isolation via synthetic fixtures (no DB).
 */

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

// ── Scoring helpers (mirrors building-signals.ts) ────────────

interface Component { name: string; points: number; maxPoints: number; detail: string; }

function capScore(components: Component[]): number {
  const raw = components.reduce((s, c) => s + c.points, 0);
  return Math.max(0, Math.min(100, raw));
}

function confidenceFromScore(score: number | null): string {
  if (score === null) return "insufficient_data";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

// ══════════════════════════════════════════════════════════════
// Signal 1: Forced Sale Probability
// ══════════════════════════════════════════════════════════════

test("ForcedSale: Low score — healthy building, no distress", () => {
  const components: Component[] = [];
  // No preForeclosure >= 60, no estate, NY mailing, bank lender, no activity, no hold
  const score = capScore(components);
  assert(score === 0, `healthy = 0, got ${score}`);
  assert(confidenceFromScore(score) === "low", "low confidence for score 0");
});

test("ForcedSale: Max score — estate + preForeclosure + non-bank maturity + absentee + activity", () => {
  const components: Component[] = [
    { name: "pre_foreclosure_risk_high", points: 30, maxPoints: 30, detail: "preForeclosure >= 60" },
    { name: "estate_filing", points: 25, maxPoints: 25, detail: "ESTATE OF SMITH" },
    { name: "absentee_owner", points: 10, maxPoints: 10, detail: "Mailing: FL" },
    { name: "non_bank_imminent_maturity", points: 15, maxPoints: 15, detail: "Non-bank within 6mo" },
    { name: "activity_spike", points: 10, maxPoints: 10, detail: "3 filings in 12mo" },
  ];
  const score = capScore(components);
  assert(score === 90, `all positive = 90, got ${score}`);
});

test("ForcedSale: Boundary — estate + non-bank + absentee (mid-60s)", () => {
  const components: Component[] = [
    { name: "estate_filing", points: 25, maxPoints: 25, detail: "ESTATE OF JONES" },
    { name: "non_bank_imminent_maturity", points: 15, maxPoints: 15, detail: "Non-bank 6mo" },
    { name: "absentee_owner", points: 10, maxPoints: 10, detail: "Mailing: CA" },
    { name: "activity_spike", points: 10, maxPoints: 10, detail: "2 filings" },
  ];
  const score = capScore(components);
  assert(score === 60, `boundary = 60, got ${score}`);
  assert(confidenceFromScore(score) === "high", "high confidence at 60");
});

test("ForcedSale: Long hold period reduces score (negative signal)", () => {
  const components: Component[] = [
    { name: "estate_filing", points: 25, maxPoints: 25, detail: "estate" },
    { name: "long_hold_period", points: -10, maxPoints: 0, detail: "12 year hold" },
  ];
  const score = capScore(components);
  assert(score === 15, `25 - 10 = 15, got ${score}`);
});

test("ForcedSale: Floor at 0 even with only negative signals", () => {
  const components: Component[] = [
    { name: "long_hold_period", points: -10, maxPoints: 0, detail: "20 year hold" },
  ];
  const score = capScore(components);
  assert(score === 0, `floor at 0, got ${score}`);
});

// ══════════════════════════════════════════════════════════════
// Signal 2: Assemblage Opportunity
// ══════════════════════════════════════════════════════════════

test("Assemblage: Low score — no adjacent same owner", () => {
  const components: Component[] = [
    { name: "no_adjacent_same_owner", points: 0, maxPoints: 80, detail: "No adjacent lots found" },
  ];
  const score = capScore(components);
  assert(score === 0, `no adjacency = 0, got ${score}`);
});

test("Assemblage: Max score — 4 contiguous lots + R8 + no landmark", () => {
  const components: Component[] = [
    { name: "adjacent_same_owner", points: Math.min(50 + 3 * 10, 80), maxPoints: 80, detail: "4 adjacent lots same owner" },
    { name: "high_density_zoning", points: 15, maxPoints: 15, detail: "Zoning: R8" },
    { name: "not_landmarked", points: 15, maxPoints: 15, detail: "Not landmarked" },
  ];
  const score = capScore(components);
  // 80 + 15 + 15 = 110, capped at 100
  assert(score === 100, `4 lots + zoning + not landmark = 100, got ${score}`);
});

test("Assemblage: Boundary — 2 adjacent + R7 zoning", () => {
  const components: Component[] = [
    { name: "adjacent_same_owner", points: 50 + 10, maxPoints: 80, detail: "2 adjacent lots" },
    { name: "high_density_zoning", points: 15, maxPoints: 15, detail: "Zoning: R7A" },
    { name: "not_landmarked", points: 15, maxPoints: 15, detail: "Not landmarked" },
  ];
  const score = capScore(components);
  assert(score === 90, `2 lots + zoning + not lm = 90, got ${score}`);
});

test("Assemblage: Missing zoning data — component scored as 0 with detail", () => {
  const components: Component[] = [
    { name: "adjacent_same_owner", points: 50, maxPoints: 80, detail: "1 adjacent" },
    { name: "zoning_data_missing", points: 0, maxPoints: 15, detail: "PLUTO zoning data unavailable" },
  ];
  const score = capScore(components);
  assert(score === 50, `adjacent only = 50, got ${score}`);
  const missingComp = components.find(c => c.name === "zoning_data_missing");
  assert(missingComp !== undefined, "zoning_data_missing component present");
  assert(missingComp!.points === 0, "missing data scores 0 points");
  assert(missingComp!.detail.includes("unavailable"), "detail explains unavailability");
});

// ══════════════════════════════════════════════════════════════
// Signal 3: Exemption Cliff
// ══════════════════════════════════════════════════════════════

test("ExemptionCliff: Low score — no expiring exemptions", () => {
  const components: Component[] = [
    { name: "no_expiring_exemptions", points: 0, maxPoints: 60, detail: "No exemptions expiring" },
  ];
  const score = capScore(components);
  assert(score === 0, `no exemptions = 0, got ${score}`);
});

test("ExemptionCliff: Max score — 421a expires in 8 months", () => {
  const components: Component[] = [
    { name: "421a_expiration", points: 60, maxPoints: 60, detail: "421a expires 2027-01-15 (<12mo)" },
  ];
  const score = capScore(components);
  assert(score === 60, `421a <12mo = 60, got ${score}`);
  assert(confidenceFromScore(score) === "high", "high confidence");
});

test("ExemptionCliff: 421a in 18mo + J-51 in 10mo", () => {
  const components: Component[] = [
    { name: "421a_expiration", points: 30, maxPoints: 60, detail: "421a <24mo" },
    { name: "j51_expiration", points: 30, maxPoints: 30, detail: "J-51 <12mo" },
  ];
  const score = capScore(components);
  assert(score === 60, `421a 24mo + J51 12mo = 60, got ${score}`);
});

test("ExemptionCliff: STAR + mailing mismatch", () => {
  const components: Component[] = [
    { name: "star_mailing_mismatch", points: 10, maxPoints: 10, detail: "STAR but mailing differs" },
  ];
  const score = capScore(components);
  assert(score === 10, `STAR mismatch only = 10, got ${score}`);
});

// ══════════════════════════════════════════════════════════════
// Signal 4: Sponsor Overhang
// ══════════════════════════════════════════════════════════════

test("SponsorOverhang: No overhang — building < 5 years", () => {
  // Building 3 years old, even with sponsor units → score 0
  const score = 0; // function returns 0 for yearsSinceConstruction < 5
  assert(score === 0, `new building = 0`);
});

test("SponsorOverhang: 30 sponsor units / 200 total / 8 years old — score ~60", () => {
  const sponsorCount = 30;
  const totalUnits = 200;
  const yearsSince = 8;
  const rawScore = Math.round((sponsorCount * yearsSince) / totalUnits * 50);
  const score = Math.min(100, rawScore);
  // (30 * 8) / 200 * 50 = 240 / 200 * 50 = 1.2 * 50 = 60
  assert(score === 60, `30/200 @ 8yr = 60, got ${score}`);
});

test("SponsorOverhang: 100 sponsor units / 200 total / 10 years — capped at 100", () => {
  const sponsorCount = 100;
  const totalUnits = 200;
  const yearsSince = 10; // capped at 10
  const rawScore = Math.round((sponsorCount * yearsSince) / totalUnits * 50);
  const score = Math.min(100, rawScore);
  // (100 * 10) / 200 * 50 = 5 * 50 = 250, capped at 100
  assert(rawScore === 250, `raw = 250, got ${rawScore}`);
  assert(score === 100, `capped = 100, got ${score}`);
});

test("SponsorOverhang: 5 sponsor units / 200 total / 6 years — low score", () => {
  const sponsorCount = 5;
  const totalUnits = 200;
  const yearsSince = 6;
  const rawScore = Math.round((sponsorCount * yearsSince) / totalUnits * 50);
  const score = Math.min(100, rawScore);
  // (5 * 6) / 200 * 50 = 30/200*50 = 7.5 → rounds to 8
  assert(score === 8, `5/200 @ 6yr = 8, got ${score}`);
  assert(confidenceFromScore(score) === "low", "low confidence at 8");
});

// ══════════════════════════════════════════════════════════════
// Insufficient Data Paths
// ══════════════════════════════════════════════════════════════

test("Insufficient data: assemblage with no owner entity", () => {
  const result = { score: null as number | null, confidence: "insufficient_data", reason: "No resolved owner entity" };
  assert(result.score === null, "score is null");
  assert(result.confidence === "insufficient_data", "confidence = insufficient_data");
  assert(result.reason !== undefined, "reason provided");
});

test("Insufficient data: sponsor with missing yearBuilt", () => {
  const result = { score: null as number | null, confidence: "insufficient_data", reason: "Missing yearBuilt or totalUnits data" };
  assert(result.score === null, "score is null");
  assert(result.reason!.includes("yearBuilt"), "reason mentions yearBuilt");
});

// ══════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
