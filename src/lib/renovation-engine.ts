// ============================================================
// Renovation Cost Estimator Engine
// Uses existing building data (year built, building class, sqft,
// units, DOB permits, HPD violations, LL84 energy grade) + cost
// tables to generate rehab estimates and After Repair Value.
// Pure library (NOT "use server")
// ============================================================

// ============================================================
// Types
// ============================================================

export interface RenovationEstimate {
  buildingCategory: string;
  recommendedLevel: "light" | "moderate" | "gut";
  conditionSignals: string[];

  // Cost breakdown
  unitRenovation: { light: number; moderate: number; gut: number };
  commonAreaCosts: { item: string; cost: number }[];
  softCosts: number;
  totalCost: { light: number; moderate: number; gut: number };
  costPerUnit: { light: number; moderate: number; gut: number };
  costPerSqft: { light: number; moderate: number; gut: number };

  // After Repair Value
  currentEstimatedValue: number;
  arv: { light: number; moderate: number; gut: number };
  renovationROI: { light: number; moderate: number; gut: number };
  profitMargin: { light: number; moderate: number; gut: number };

  // Metadata
  confidence: "high" | "medium" | "low";
  methodology: string;
}

export interface RenovationParams {
  units: number;
  sqft: number;
  yearBuilt: number;
  buildingClass: string;
  floors: number;
  hasElevator: boolean;
  hpdViolations: number;
  dobPermitsRecent: number;
  ll84Grade?: string;
  lastRenovation?: number;
  currentValue?: number; // from comps or assessed
  assessedValue?: number;
}

// ============================================================
// Cost Tables — NYC market (per unit / per item)
// ============================================================

const REHAB_COST_PER_UNIT: Record<string, { light: number; moderate: number; gut: number }> = {
  "pre-war-walkup":    { light: 8000,  moderate: 22000, gut: 55000 },
  "pre-war-elevator":  { light: 10000, moderate: 28000, gut: 65000 },
  "post-war-walkup":   { light: 6000,  moderate: 18000, gut: 45000 },
  "post-war-elevator": { light: 8000,  moderate: 24000, gut: 55000 },
  "modern":            { light: 5000,  moderate: 15000, gut: 40000 },
  "new-construction":  { light: 3000,  moderate: 10000, gut: 30000 },
};

const COMMON_AREA_COSTS: Record<string, { light: number; moderate: number; gut: number }> = {
  "lobby":      { light: 15000, moderate: 45000,  gut: 120000 },
  "hallways":   { light: 5000,  moderate: 15000,  gut: 40000 },   // per floor
  "roof":       { light: 0,     moderate: 25000,  gut: 80000 },
  "boiler":     { light: 0,     moderate: 15000,  gut: 75000 },
  "elevator":   { light: 5000,  moderate: 50000,  gut: 250000 },  // per elevator
  "facade":     { light: 0,     moderate: 30000,  gut: 150000 },  // Local Law 11
  "electrical": { light: 0,     moderate: 20000,  gut: 80000 },
  "plumbing":   { light: 0,     moderate: 30000,  gut: 100000 },
  "windows":    { light: 0,     moderate: 0,      gut: 1500 },    // per window
};

// ARV premium factors by rehab level
const RENOVATION_PREMIUM: Record<string, { low: number; high: number }> = {
  light:    { low: 1.05, high: 1.10 },
  moderate: { low: 1.15, high: 1.25 },
  gut:      { low: 1.30, high: 1.50 },
};

// Soft cost multiplier: arch/eng 10% + permits 4% + contingency 12% ≈ 1.26
const SOFT_COST_MULTIPLIER = 1.26;

// ============================================================
// Building Category Classifier
// ============================================================

export function getBuildingCategory(
  yearBuilt: number,
  buildingClass: string,
  hasElevator: boolean,
): string {
  const cls = (buildingClass || "").toUpperCase();
  const isElevator = hasElevator || cls.startsWith("D") || cls === "R1" || cls === "R2";
  const isWalkup = cls.startsWith("C") || cls === "S1" || cls === "S2";

  if (yearBuilt >= 2000) return "new-construction";
  if (yearBuilt >= 1980) return "modern";

  if (yearBuilt >= 1940) {
    return isElevator ? "post-war-elevator" : "post-war-walkup";
  }

  // Pre-1940
  return isElevator ? "pre-war-elevator" : "pre-war-walkup";
}

// ============================================================
// Condition Assessment
// ============================================================

function assessCondition(params: RenovationParams): {
  level: "light" | "moderate" | "gut";
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0; // 0-10 scale: <3 = light, 3-6 = moderate, >6 = gut

  const age = new Date().getFullYear() - params.yearBuilt;
  const category = getBuildingCategory(params.yearBuilt, params.buildingClass, params.hasElevator);

  // Age-based signals
  if (age > 80) {
    signals.push(`Built ${params.yearBuilt} — ${age} years old (${category.replace(/-/g, " ")})`);
    score += 3;
  } else if (age > 50) {
    signals.push(`Built ${params.yearBuilt} — ${age} years old`);
    score += 2;
  } else if (age > 30) {
    signals.push(`Built ${params.yearBuilt} — ${age} years old`);
    score += 1;
  } else {
    signals.push(`Built ${params.yearBuilt} — relatively modern (${age} years)`);
  }

  // Recent renovation reduces score
  if (params.lastRenovation) {
    const yearsSinceReno = new Date().getFullYear() - params.lastRenovation;
    if (yearsSinceReno <= 5) {
      signals.push(`Major DOB permit in ${params.lastRenovation} — recent renovation`);
      score -= 2;
    } else if (yearsSinceReno <= 10) {
      signals.push(`Last major permit ${yearsSinceReno} years ago`);
      score -= 1;
    }
  } else if (age > 30) {
    signals.push("No major DOB permits on record — may need updates");
    score += 1;
  }

  // Recent DOB permits signal active maintenance
  if (params.dobPermitsRecent > 3) {
    signals.push(`${params.dobPermitsRecent} DOB permits in last 5 years — actively maintained`);
    score -= 1;
  } else if (params.dobPermitsRecent === 0 && age > 30) {
    signals.push("No recent permit activity — deferred maintenance likely");
    score += 1;
  }

  // HPD violations
  if (params.hpdViolations > 50) {
    signals.push(`${params.hpdViolations} open HPD violations — significant building issues`);
    score += 3;
  } else if (params.hpdViolations > 20) {
    signals.push(`${params.hpdViolations} open HPD violations — maintenance concerns`);
    score += 2;
  } else if (params.hpdViolations > 5) {
    signals.push(`${params.hpdViolations} open HPD violations`);
    score += 1;
  } else if (params.hpdViolations === 0) {
    signals.push("No open HPD violations — well-maintained");
  }

  // LL84 energy grade
  if (params.ll84Grade === "F") {
    signals.push("LL84 Grade F — energy systems need overhaul");
    score += 2;
  } else if (params.ll84Grade === "D") {
    signals.push("LL84 Grade D — energy improvements needed");
    score += 1;
  } else if (params.ll84Grade === "A" || params.ll84Grade === "B") {
    signals.push(`LL84 Grade ${params.ll84Grade} — energy efficient`);
  } else if (params.ll84Grade === "C") {
    signals.push("LL84 Grade C — average energy performance");
  }

  // Clamp
  score = Math.max(0, Math.min(10, score));

  let level: "light" | "moderate" | "gut";
  if (score <= 2) level = "light";
  else if (score <= 6) level = "moderate";
  else level = "gut";

  return { level, signals };
}

// ============================================================
// Common Area Cost Calculator
// ============================================================

function calculateCommonAreaCosts(
  params: RenovationParams,
  level: "light" | "moderate" | "gut",
): { item: string; cost: number }[] {
  const items: { item: string; cost: number }[] = [];

  // Always include lobby + hallways + roof
  items.push({ item: "Lobby renovation", cost: COMMON_AREA_COSTS.lobby[level] });
  items.push({ item: `Hallway updates (${params.floors} floors)`, cost: COMMON_AREA_COSTS.hallways[level] * params.floors });

  const roofCost = COMMON_AREA_COSTS.roof[level];
  if (roofCost > 0) items.push({ item: "Roof replacement", cost: roofCost });

  // Elevator modernization (if applicable)
  if (params.hasElevator && params.yearBuilt < 1980) {
    const elevatorCount = Math.max(1, Math.ceil(params.units / 30)); // ~1 per 30 units
    items.push({ item: `Elevator modernization (${elevatorCount})`, cost: COMMON_AREA_COSTS.elevator[level] * elevatorCount });
  }

  // Pre-1960: facade, electrical, plumbing likely needed
  if (params.yearBuilt < 1960) {
    const facadeCost = COMMON_AREA_COSTS.facade[level];
    if (facadeCost > 0) items.push({ item: "Facade restoration (LL11)", cost: facadeCost });

    const electricalCost = COMMON_AREA_COSTS.electrical[level];
    if (electricalCost > 0) items.push({ item: "Electrical service upgrade", cost: electricalCost });

    const plumbingCost = COMMON_AREA_COSTS.plumbing[level];
    if (plumbingCost > 0) items.push({ item: "Plumbing riser replacement", cost: plumbingCost });
  }

  // Boiler
  const boilerCost = COMMON_AREA_COSTS.boiler[level];
  if (boilerCost > 0) items.push({ item: "Boiler upgrade/replacement", cost: boilerCost });

  // LL84 D/F energy retrofit: insulation + windows + boiler
  if (params.ll84Grade === "D" || params.ll84Grade === "F") {
    const energyPerUnit = params.ll84Grade === "F" ? 15000 : 8000;
    items.push({ item: "Energy retrofit (insulation, windows, systems)", cost: energyPerUnit * params.units });
  }

  // Windows (gut only — estimate ~8 windows per unit for pre-war)
  if (level === "gut" && params.yearBuilt < 1980) {
    const windowCount = params.units * 8;
    items.push({ item: `Window replacement (~${windowCount} windows)`, cost: COMMON_AREA_COSTS.windows[level] * windowCount });
  }

  return items.filter(i => i.cost > 0);
}

// ============================================================
// Main Estimation Function
// ============================================================

export function estimateRenovationCost(params: RenovationParams): RenovationEstimate {
  const category = getBuildingCategory(params.yearBuilt, params.buildingClass, params.hasElevator);
  const { level: recommendedLevel, signals } = assessCondition(params);

  const costTable = REHAB_COST_PER_UNIT[category] || REHAB_COST_PER_UNIT["post-war-walkup"];

  // Unit renovation costs
  const unitRenovation = {
    light: costTable.light * params.units,
    moderate: costTable.moderate * params.units,
    gut: costTable.gut * params.units,
  };

  // Common area costs for each level
  const commonAreaLight = calculateCommonAreaCosts(params, "light");
  const commonAreaModerate = calculateCommonAreaCosts(params, "moderate");
  const commonAreaGut = calculateCommonAreaCosts(params, "gut");

  // Use the recommended level's common area breakdown for display
  const commonAreaCosts =
    recommendedLevel === "light" ? commonAreaLight :
    recommendedLevel === "gut" ? commonAreaGut :
    commonAreaModerate;

  const commonAreaTotal = {
    light: commonAreaLight.reduce((s, i) => s + i.cost, 0),
    moderate: commonAreaModerate.reduce((s, i) => s + i.cost, 0),
    gut: commonAreaGut.reduce((s, i) => s + i.cost, 0),
  };

  // Hard costs
  const hardCosts = {
    light: unitRenovation.light + commonAreaTotal.light,
    moderate: unitRenovation.moderate + commonAreaTotal.moderate,
    gut: unitRenovation.gut + commonAreaTotal.gut,
  };

  // Soft costs (architecture, permits, contingency)
  const softCostRecommended = Math.round(hardCosts[recommendedLevel] * (SOFT_COST_MULTIPLIER - 1));

  // Total all-in
  const totalCost = {
    light: Math.round(hardCosts.light * SOFT_COST_MULTIPLIER),
    moderate: Math.round(hardCosts.moderate * SOFT_COST_MULTIPLIER),
    gut: Math.round(hardCosts.gut * SOFT_COST_MULTIPLIER),
  };

  const costPerUnit = {
    light: params.units > 0 ? Math.round(totalCost.light / params.units) : 0,
    moderate: params.units > 0 ? Math.round(totalCost.moderate / params.units) : 0,
    gut: params.units > 0 ? Math.round(totalCost.gut / params.units) : 0,
  };

  const costPerSqft = {
    light: params.sqft > 0 ? Math.round(totalCost.light / params.sqft) : 0,
    moderate: params.sqft > 0 ? Math.round(totalCost.moderate / params.sqft) : 0,
    gut: params.sqft > 0 ? Math.round(totalCost.gut / params.sqft) : 0,
  };

  // Current estimated value: prefer comp estimate, then assessed × 2.5
  const currentEstimatedValue =
    (params.currentValue && params.currentValue > 0)
      ? params.currentValue
      : (params.assessedValue && params.assessedValue > 0)
        ? Math.round(params.assessedValue * 2.5)
        : 0;

  // ARV calculation
  const arv = { light: 0, moderate: 0, gut: 0 };
  const renovationROI = { light: 0, moderate: 0, gut: 0 };
  const profitMargin = { light: 0, moderate: 0, gut: 0 };

  if (currentEstimatedValue > 0) {
    for (const lvl of ["light", "moderate", "gut"] as const) {
      const premium = RENOVATION_PREMIUM[lvl];
      const avgPremium = (premium.low + premium.high) / 2;
      arv[lvl] = Math.round(currentEstimatedValue * avgPremium);

      const profit = arv[lvl] - currentEstimatedValue - totalCost[lvl];
      renovationROI[lvl] = totalCost[lvl] > 0 ? Math.round((profit / totalCost[lvl]) * 100) : 0;
      profitMargin[lvl] = arv[lvl] > 0 ? Math.round((profit / arv[lvl]) * 100) : 0;
    }
  }

  // Confidence: based on data completeness
  let confidence: "high" | "medium" | "low" = "medium";
  let dataPoints = 0;
  if (params.yearBuilt > 0) dataPoints++;
  if (params.buildingClass) dataPoints++;
  if (params.sqft > 0) dataPoints++;
  if (params.units > 0) dataPoints++;
  if (params.hpdViolations >= 0) dataPoints++;
  if (params.ll84Grade) dataPoints++;
  if (currentEstimatedValue > 0) dataPoints++;

  if (dataPoints >= 6) confidence = "high";
  else if (dataPoints <= 3) confidence = "low";

  const methodology = [
    `Building category: ${category.replace(/-/g, " ")}`,
    `Cost basis: NYC ${new Date().getFullYear()} market rates`,
    `Soft costs: ${Math.round((SOFT_COST_MULTIPLIER - 1) * 100)}% (arch/eng, permits, contingency)`,
    currentEstimatedValue > 0
      ? `ARV based on ${params.currentValue ? "comp" : "assessed value"} estimate`
      : "No ARV — insufficient valuation data",
  ].join(". ");

  return {
    buildingCategory: category,
    recommendedLevel,
    conditionSignals: signals,
    unitRenovation,
    commonAreaCosts,
    softCosts: softCostRecommended,
    totalCost,
    costPerUnit,
    costPerSqft,
    currentEstimatedValue,
    arv,
    renovationROI,
    profitMargin,
    confidence,
    methodology,
  };
}
