// ============================================================
// Building Condition Engine — Violations → Expense/Cap Rate Adjustments
//
// Combines HPD violations, DOB permits, building age, and rent
// stabilization data to produce a condition score (0-100) and
// concrete adjustment factors for deal analysis tools.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export interface BuildingConditionInput {
  // HPD data
  hpdViolationCount: number;
  hpdClassACount?: number;    // non-hazardous
  hpdClassBCount?: number;    // hazardous
  hpdClassCCount?: number;    // immediately hazardous
  hpdComplaintCount?: number;
  hpdLitigationCount?: number;

  // DOB data
  dobPermitCount?: number;
  dobViolationCount?: number;
  recentPermits?: number;      // permits filed in last 2 years
  hasActiveSWO?: boolean;      // stop work order

  // Building fundamentals
  yearBuilt: number;
  numFloors: number;
  hasElevator: boolean;
  unitsRes: number;
  bldgArea: number;

  // Rent stabilization
  rentStabilizedUnits?: number;
}

export interface BuildingConditionScore {
  /** Overall condition score (0=worst, 100=best) */
  overallScore: number;
  /** Letter grade A-F */
  grade: "A" | "B" | "C" | "D" | "F";
  /** Component scores */
  components: {
    violationScore: number;       // 0-25 (lower violations = higher score)
    ageScore: number;             // 0-20
    maintenanceScore: number;     // 0-25 (DOB permits, complaints)
    complianceScore: number;      // 0-15 (litigation, SWOs)
    stabilityScore: number;       // 0-15 (RS ratio, tenure)
  };
  /** Adjustment factors for deal analysis */
  adjustments: ConditionAdjustments;
  /** Flags and warnings */
  flags: string[];
}

export interface ConditionAdjustments {
  /** Expense multiplier (1.0 = no change, 1.15 = 15% higher expenses) */
  expenseMultiplier: number;
  /** Cap rate spread adjustment in bps (positive = wider cap rate) */
  capRateSpreadBps: number;
  /** R&M reserve multiplier (1.0 = standard, 1.5 = 50% more reserves) */
  rmReserveMultiplier: number;
  /** Vacancy rate adder (percentage points to add to base vacancy) */
  vacancyAdderPct: number;
  /** Insurance premium multiplier */
  insuranceMultiplier: number;
  /** Methodology notes */
  notes: string[];
}

// ── Main Scoring Function ────────────────────────────────────

export function assessBuildingCondition(input: BuildingConditionInput): BuildingConditionScore {
  const flags: string[] = [];
  const adjustmentNotes: string[] = [];

  // ── 1. Violation Score (0-25) ──
  const violationsPerUnit = input.unitsRes > 0
    ? input.hpdViolationCount / input.unitsRes
    : input.hpdViolationCount;

  let violationScore = 25;
  if (violationsPerUnit > 5) violationScore = 0;
  else if (violationsPerUnit > 3) violationScore = 5;
  else if (violationsPerUnit > 2) violationScore = 10;
  else if (violationsPerUnit > 1) violationScore = 15;
  else if (violationsPerUnit > 0.5) violationScore = 20;

  // Class C (immediately hazardous) violations are especially bad
  const classCCount = input.hpdClassCCount ?? 0;
  if (classCCount > 5) {
    violationScore = Math.max(0, violationScore - 10);
    flags.push(`${classCCount} Class C (immediately hazardous) violations`);
  }

  // ── 2. Age Score (0-20) ──
  const age = Math.max(0, new Date().getFullYear() - input.yearBuilt);
  let ageScore = 20;
  if (age > 100) ageScore = 5;
  else if (age > 80) ageScore = 8;
  else if (age > 60) ageScore = 12;
  else if (age > 40) ageScore = 15;
  else if (age > 20) ageScore = 18;

  // Elevator buildings age differently
  if (input.hasElevator && age > 50) {
    ageScore = Math.max(0, ageScore - 3);
    adjustmentNotes.push("Elevator building >50yr: mechanical systems risk");
  }

  // ── 3. Maintenance Score (0-25) ──
  // Recent permits = positive signal (active maintenance)
  const recentPermits = input.recentPermits ?? 0;
  const complaints = input.hpdComplaintCount ?? 0;
  const complaintsPerUnit = input.unitsRes > 0 ? complaints / input.unitsRes : complaints;

  let maintenanceScore = 15; // neutral baseline
  if (recentPermits > 3) maintenanceScore += 5; // active capex
  if (recentPermits > 0) maintenanceScore += 3;
  if (complaintsPerUnit > 2) maintenanceScore -= 10;
  else if (complaintsPerUnit > 1) maintenanceScore -= 5;
  maintenanceScore = Math.max(0, Math.min(25, maintenanceScore));

  // ── 4. Compliance Score (0-15) ──
  const litigationCount = input.hpdLitigationCount ?? 0;
  let complianceScore = 15;
  if (input.hasActiveSWO) {
    complianceScore = 0;
    flags.push("Active Stop Work Order — construction halted");
  }
  if (litigationCount > 3) {
    complianceScore = Math.max(0, complianceScore - 10);
    flags.push(`${litigationCount} HPD litigation cases`);
  } else if (litigationCount > 0) {
    complianceScore = Math.max(0, complianceScore - 5);
  }

  // DOB violations
  const dobViolations = input.dobViolationCount ?? 0;
  if (dobViolations > 10) complianceScore = Math.max(0, complianceScore - 5);

  // ── 5. Stability Score (0-15) ──
  const rsRatio = (input.rentStabilizedUnits ?? 0) / Math.max(1, input.unitsRes);
  let stabilityScore = 15;
  // High RS ratio = stable tenancy but constrained income growth
  if (rsRatio > 0.8) stabilityScore = 12;
  else if (rsRatio > 0.5) stabilityScore = 14;
  // Low RS = market-rate flexibility but more turnover
  if (rsRatio === 0 && input.unitsRes > 10) stabilityScore = 13;

  // ── Aggregate ──
  const overallScore = violationScore + ageScore + maintenanceScore + complianceScore + stabilityScore;

  const grade: BuildingConditionScore["grade"] =
    overallScore >= 80 ? "A" :
    overallScore >= 65 ? "B" :
    overallScore >= 50 ? "C" :
    overallScore >= 35 ? "D" : "F";

  // ── Compute Adjustments ──
  const adjustments = computeAdjustments(overallScore, grade, violationsPerUnit, classCCount, age, input.hasElevator, flags, adjustmentNotes);

  return {
    overallScore,
    grade,
    components: {
      violationScore,
      ageScore,
      maintenanceScore,
      complianceScore,
      stabilityScore,
    },
    adjustments,
    flags,
  };
}

// ── Adjustment Computation ───────────────────────────────────

function computeAdjustments(
  score: number,
  grade: string,
  violationsPerUnit: number,
  classCCount: number,
  age: number,
  hasElevator: boolean,
  flags: string[],
  notes: string[],
): ConditionAdjustments {
  let expenseMultiplier = 1.0;
  let capRateSpreadBps = 0;
  let rmReserveMultiplier = 1.0;
  let vacancyAdderPct = 0;
  let insuranceMultiplier = 1.0;

  // Grade-based base adjustments
  switch (grade) {
    case "A":
      notes.push("Well-maintained — standard underwriting assumptions");
      break;
    case "B":
      expenseMultiplier = 1.05;
      capRateSpreadBps = 15;
      rmReserveMultiplier = 1.1;
      notes.push("Good condition — minor expense uplift (+5%)");
      break;
    case "C":
      expenseMultiplier = 1.12;
      capRateSpreadBps = 35;
      rmReserveMultiplier = 1.25;
      vacancyAdderPct = 1;
      insuranceMultiplier = 1.1;
      notes.push("Average condition — moderate expense uplift (+12%), +35bp cap rate spread");
      break;
    case "D":
      expenseMultiplier = 1.20;
      capRateSpreadBps = 60;
      rmReserveMultiplier = 1.5;
      vacancyAdderPct = 2;
      insuranceMultiplier = 1.2;
      notes.push("Below average — significant expense uplift (+20%), +60bp cap rate spread, value-add likely needed");
      break;
    case "F":
      expenseMultiplier = 1.30;
      capRateSpreadBps = 100;
      rmReserveMultiplier = 2.0;
      vacancyAdderPct = 3;
      insuranceMultiplier = 1.35;
      flags.push("Distressed building — major capital needs likely");
      notes.push("Distressed — heavy expense uplift (+30%), +100bp cap rate spread, aggressive renovation assumed");
      break;
  }

  // Additional Class C violation penalty
  if (classCCount > 10) {
    expenseMultiplier += 0.05;
    insuranceMultiplier += 0.1;
    notes.push(`High Class C violations (${classCCount}): +5% expenses, +10% insurance`);
  }

  // Old elevator building surcharge
  if (hasElevator && age > 60) {
    rmReserveMultiplier += 0.15;
    notes.push("Pre-1965 elevator: +15% R&M reserve for mechanical systems");
  }

  return {
    expenseMultiplier: Math.round(expenseMultiplier * 100) / 100,
    capRateSpreadBps: Math.round(capRateSpreadBps),
    rmReserveMultiplier: Math.round(rmReserveMultiplier * 100) / 100,
    vacancyAdderPct: Math.round(vacancyAdderPct * 10) / 10,
    insuranceMultiplier: Math.round(insuranceMultiplier * 100) / 100,
    notes,
  };
}
