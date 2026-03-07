// Seller Motivation Scoring Engine — pure, synchronous, no "use server"
// Analyzes BuildingIntelligence data to score 0-100 seller motivation

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type MotivationLevel = "very_high" | "high" | "moderate" | "low" | "minimal";
export type MotivationConfidence = "high" | "medium" | "low";

export type SignalCategory =
  | "financial_distress"
  | "physical_distress"
  | "legal_pressure"
  | "ownership_lifecycle"
  | "market_squeeze"
  | "speculation";

export interface MotivationSignal {
  id: string;
  category: SignalCategory;
  name: string;
  description: string;
  score: number;
  weight: number;
  weightedScore: number;
  dataSource: string;
  rawValue?: string | number;
}

export interface MotivationScore {
  overall: number;
  confidence: MotivationConfidence;
  level: MotivationLevel;
  signals: MotivationSignal[];
  topSignal: string;
  calculatedAt: string;
}

export interface MotivationLevelConfig {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_WEIGHTS: Record<SignalCategory, number> = {
  financial_distress: 1.0,
  physical_distress: 0.85,
  legal_pressure: 0.9,
  ownership_lifecycle: 0.7,
  market_squeeze: 0.75,
  speculation: 0.65,
};

export const MOTIVATION_LEVEL_CONFIG: Record<MotivationLevel, MotivationLevelConfig> = {
  very_high: {
    label: "Very High",
    color: "#EF4444",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    description: "Strong distress signals detected — owner very likely motivated to sell",
  },
  high: {
    label: "High",
    color: "#F97316",
    bgColor: "bg-orange-50",
    textColor: "text-orange-700",
    description: "Multiple pressure signals — owner likely open to offers",
  },
  moderate: {
    label: "Moderate",
    color: "#F59E0B",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    description: "Some motivation signals — worth exploring with the right offer",
  },
  low: {
    label: "Low",
    color: "#3B82F6",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    description: "Few motivation signals — owner likely not actively seeking to sell",
  },
  minimal: {
    label: "Minimal",
    color: "#94A3B8",
    bgColor: "bg-slate-50",
    textColor: "text-slate-600",
    description: "No distress detected — well-maintained property with stable ownership",
  },
};

const SIGNAL_CATEGORY_COLORS: Record<SignalCategory, { bg: string; text: string }> = {
  financial_distress: { bg: "bg-red-100", text: "text-red-700" },
  physical_distress: { bg: "bg-orange-100", text: "text-orange-700" },
  legal_pressure: { bg: "bg-purple-100", text: "text-purple-700" },
  ownership_lifecycle: { bg: "bg-blue-100", text: "text-blue-700" },
  market_squeeze: { bg: "bg-amber-100", text: "text-amber-700" },
  speculation: { bg: "bg-pink-100", text: "text-pink-700" },
};

const SIGNAL_CATEGORY_LABELS: Record<SignalCategory, string> = {
  financial_distress: "Financial",
  physical_distress: "Physical",
  legal_pressure: "Legal",
  ownership_lifecycle: "Lifecycle",
  market_squeeze: "Squeeze",
  speculation: "Speculation",
};

/* ------------------------------------------------------------------ */
/*  Subset type — what the engine actually reads                      */
/* ------------------------------------------------------------------ */

/** Minimal subset of BuildingIntelligence the engine needs */
export interface MotivationInput {
  compliance?: {
    hpdViolations?: { open?: number; classB?: number; classC?: number; recentViolations?: any[] };
    dobViolations?: { open?: number; ecb?: number; ecbPenalty?: number };
    dobPermits?: { active?: number; recent?: any[] };
    hpdComplaints?: number;
    complaints311?: number;
    recentComplaints?: number;
    litigationCount?: number;
    openLitigation?: number;
    harassmentFinding?: boolean;
    rpieStatus?: string;
  };
  energy?: {
    energyStarScore?: number;
    siteEUI?: number;
    ll97Status?: string;
    ll97PenaltyEstimate?: number;
  } | null;
  property?: {
    yearBuilt?: { value: number } | null;
    units?: { value: number } | null;
    residentialUnits?: { value: number } | null;
    rentStabilizedUnits?: { value: number } | null;
    buildingClass?: { value: string } | null;
  };
  financials?: {
    lastSale?: { date: string; price: number } | null;
    allSales?: { date: string; price: number; docType?: string; buyer?: string; seller?: string }[];
  };
  ownership?: {
    likelyOwner?: { entityName?: string };
    hpdRegistration?: { agentAddress?: string };
    corporateAffiliations?: string[];
  };
  distressSignals?: {
    score?: number;
  };
  raw?: {
    pluto?: any;
    rentStabilized?: any;
    speculation?: any;
    litigation?: any[];
    ecbViolations?: any[];
    violations?: any[];
    permits?: any[];
  };
  dataSources?: string[];
}

/* ------------------------------------------------------------------ */
/*  Signal evaluators                                                  */
/* ------------------------------------------------------------------ */

type SignalEvaluator = (data: MotivationInput) => MotivationSignal | null;

function makeSignal(
  id: string,
  category: SignalCategory,
  name: string,
  description: string,
  score: number,
  dataSource: string,
  rawValue?: string | number,
): MotivationSignal {
  const weight = CATEGORY_WEIGHTS[category];
  return {
    id,
    category,
    name,
    description,
    score: Math.min(score, 100),
    weight,
    weightedScore: Math.round(score * weight),
    dataSource,
    rawValue,
  };
}

// ---- Financial Distress ----

const evalEcbPenalties: SignalEvaluator = (data) => {
  const penalty = data.compliance?.dobViolations?.ecbPenalty || 0;
  if (penalty <= 0) {
    // Check raw ECB violations for penalties
    const ecbs = data.raw?.ecbViolations || [];
    const totalPenalty = ecbs.reduce((sum: number, v: any) => {
      const p = parseFloat(v.penaltybalance || v.penalty_balance || v.amount_baldue || "0");
      return sum + (isNaN(p) ? 0 : p);
    }, 0);
    if (totalPenalty <= 10000) return null;
    const score = totalPenalty > 100000 ? 90 : totalPenalty > 50000 ? 80 : 60;
    return makeSignal("ecb_penalties", "financial_distress", "ECB Penalties", `$${Math.round(totalPenalty).toLocaleString()} in outstanding ECB penalties`, score, "DOB ECB", totalPenalty);
  }
  if (penalty <= 10000) return null;
  const score = penalty > 100000 ? 90 : penalty > 50000 ? 80 : 60;
  return makeSignal("ecb_penalties", "financial_distress", "ECB Penalties", `$${Math.round(penalty).toLocaleString()} in outstanding penalties`, score, "DOB ECB", penalty);
};

const evalLisPendens: SignalEvaluator = (data) => {
  const sales = data.financials?.allSales || [];
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const recent = sales.filter(
    (s) => s.docType && /lis.pendens/i.test(s.docType) && new Date(s.date) >= twoYearsAgo,
  );
  if (recent.length === 0) return null;
  return makeSignal("lis_pendens", "financial_distress", "Lis Pendens Filed", `Lis pendens filed ${recent.length > 1 ? `${recent.length} times` : ""} in last 2 years`, 85, "ACRIS", recent.length);
};

const evalMortgageDefault: SignalEvaluator = (data) => {
  const sales = data.financials?.allSales || [];
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const assignments = sales.filter(
    (s) => s.docType && /assign.*mortgage|mortgage.*modif/i.test(s.docType) && new Date(s.date) >= threeYearsAgo,
  );
  if (assignments.length === 0) return null;
  return makeSignal("mortgage_default", "financial_distress", "Mortgage Assignment/Modification", `Recent mortgage ${assignments.length > 1 ? "changes" : "change"} may indicate financial pressure`, 70, "ACRIS", assignments.length);
};

const evalTaxLiens: SignalEvaluator = (data) => {
  const sales = data.financials?.allSales || [];
  const liens = sales.filter((s) => s.docType && /tax.lien/i.test(s.docType));
  if (liens.length === 0) return null;
  const score = liens.length > 1 ? 95 : 90;
  return makeSignal("tax_liens", "financial_distress", "Tax Liens", `${liens.length} tax lien${liens.length > 1 ? "s" : ""} on record`, score, "ACRIS", liens.length);
};

// ---- Physical Distress ----

const evalHpdViolationsC: SignalEvaluator = (data) => {
  const classC = data.compliance?.hpdViolations?.classC || 0;
  if (classC === 0) return null;
  const score = classC >= 20 ? 95 : classC >= 10 ? 80 : classC >= 4 ? 60 : 40;
  return makeSignal("hpd_violations_c", "physical_distress", "Critical HPD Violations", `${classC} Class C (immediately hazardous) violations`, score, "HPD Violations", classC);
};

const evalHpdViolationsB: SignalEvaluator = (data) => {
  const classB = data.compliance?.hpdViolations?.classB || 0;
  if (classB < 5) return null;
  const score = classB >= 30 ? 70 : classB >= 15 ? 50 : 30;
  return makeSignal("hpd_violations_b", "physical_distress", "Hazardous HPD Violations", `${classB} Class B (hazardous) violations`, score, "HPD Violations", classB);
};

const evalDobViolations: SignalEvaluator = (data) => {
  const open = data.compliance?.dobViolations?.open || 0;
  if (open === 0) return null;
  const score = open >= 10 ? 70 : open >= 4 ? 50 : 25;
  return makeSignal("dob_violations", "physical_distress", "DOB Violations", `${open} active DOB violations`, score, "DOB Violations", open);
};

const evalNoRecentPermits: SignalEvaluator = (data) => {
  const yearBuilt = data.property?.yearBuilt?.value || 0;
  if (yearBuilt > 1960) return null; // Only flag pre-war buildings
  const permits = data.raw?.permits || [];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const recent = permits.filter((p: any) => {
    const d = p.issuance_date || p.filing_date || "";
    return d && new Date(d) >= fiveYearsAgo;
  });
  if (recent.length > 0) return null;
  return makeSignal("no_recent_permits", "physical_distress", "No Recent Permits", `Pre-war building (${yearBuilt}) with no permits in 5+ years — likely deferred maintenance`, 45, "DOB Permits", yearBuilt);
};

const evalComplaintVolume: SignalEvaluator = (data) => {
  const recent = data.compliance?.recentComplaints || data.compliance?.complaints311 || 0;
  if (recent < 20) return null;
  const score = recent >= 50 ? 70 : 50;
  return makeSignal("hpd_complaints_volume", "physical_distress", "High Complaint Volume", `${recent} complaints — indicates persistent building issues`, score, "HPD Complaints", recent);
};

// ---- Legal Pressure ----

const evalHpdLitigation: SignalEvaluator = (data) => {
  const total = data.compliance?.litigationCount || 0;
  const open = data.compliance?.openLitigation || 0;
  if (total === 0 && open === 0) return null;
  // Check for HP actions (tenant-initiated)
  const lit = data.raw?.litigation || [];
  const hasHP = lit.some((l: any) => /hp.action|hp.proceeding/i.test(l.casetype || l.case_type || ""));
  const harassment = data.compliance?.harassmentFinding || false;
  const score = harassment ? 90 : hasHP ? 85 : open > 1 ? 80 : 65;
  const desc = harassment
    ? "Harassment finding — severe legal pressure on owner"
    : hasHP
      ? "HP Action (tenant-initiated) — court-ordered repairs likely"
      : `${open > 0 ? `${open} open` : `${total} total`} HPD litigation case${total > 1 ? "s" : ""}`;
  return makeSignal("hpd_litigation", "legal_pressure", "HPD Litigation", desc, score, "HPD Litigation", open || total);
};

const evalVacateOrder: SignalEvaluator = (data) => {
  const violations = data.raw?.violations || [];
  const hasVacate = violations.some(
    (v: any) => /vacate/i.test(v.novdescription || v.description || v.violationstatus || ""),
  );
  if (!hasVacate) return null;
  return makeSignal("dob_vacate_order", "legal_pressure", "Vacate Order", "Active vacate order — building partially or fully vacated", 90, "DOB Violations");
};

// ---- Ownership Lifecycle ----

const evalLongOwnership: SignalEvaluator = (data) => {
  const lastSale = data.financials?.lastSale;
  if (!lastSale?.date) return null;
  const saleDate = new Date(lastSale.date);
  const years = (Date.now() - saleDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 15) return null;
  const score = years >= 30 ? 65 : years >= 20 ? 50 : 35;
  return makeSignal("long_ownership", "ownership_lifecycle", "Long-Term Ownership", `Owner has held property for ${Math.floor(years)} years`, score, "ACRIS", Math.floor(years));
};

const evalEstateTransfer: SignalEvaluator = (data) => {
  const sales = data.financials?.allSales || [];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const estate = sales.filter(
    (s) =>
      new Date(s.date) >= fiveYearsAgo &&
      (/estate|executor|trust|decedent|heir/i.test(s.buyer || "") ||
        /estate|executor|trust|decedent|heir/i.test(s.seller || "") ||
        /estate|executor|trust/i.test(s.docType || "")),
  );
  if (estate.length === 0) return null;
  return makeSignal("estate_transfer", "ownership_lifecycle", "Estate/Trust Transfer", "Recent estate or trust transfer — potential motivated seller", 80, "ACRIS", estate.length);
};

const evalAbsenteeOwner: SignalEvaluator = (data) => {
  const agentAddr = data.ownership?.hpdRegistration?.agentAddress || "";
  if (!agentAddr) return null;
  const isOutOfState = agentAddr.length > 5 && !/\bNY\b|new\s*york/i.test(agentAddr);
  if (!isOutOfState) return null;
  const isOutOfCountry = /[A-Z]{2}\s+\d{4,}|abroad|foreign/i.test(agentAddr);
  const score = isOutOfCountry ? 55 : 40;
  return makeSignal("absentee_owner", "ownership_lifecycle", "Absentee Owner", `Owner address outside NYC${isOutOfCountry ? " (out of country)" : ""}`, score, "HPD Registration");
};

const evalEntityComplexity: SignalEvaluator = (data) => {
  const affiliations = data.ownership?.corporateAffiliations?.length || 0;
  if (affiliations < 3) return null;
  return makeSignal("entity_complexity", "ownership_lifecycle", "Complex Entity Structure", `${affiliations} related LLCs/entities — may indicate exit planning`, 30, "Entity Resolver", affiliations);
};

// ---- Market Squeeze ----

const evalRentStabSqueeze: SignalEvaluator = (data) => {
  const totalUnits = data.property?.units?.value || data.property?.residentialUnits?.value || 0;
  const rsUnits = data.property?.rentStabilizedUnits?.value || 0;
  if (totalUnits <= 0 || rsUnits <= 0) return null;
  const rsRatio = rsUnits / totalUnits;
  if (rsRatio < 0.6) return null;
  return makeSignal("rent_stab_squeeze", "market_squeeze", "Rent Stabilization Squeeze", `${Math.round(rsRatio * 100)}% of units rent-stabilized (${rsUnits}/${totalUnits}) — limited income growth`, 55, "Rent Stabilization", Math.round(rsRatio * 100));
};

const evalLL97Risk: SignalEvaluator = (data) => {
  if (!data.energy) return null;
  const status = data.energy.ll97Status;
  const penalty = data.energy.ll97PenaltyEstimate || 0;
  if (status === "compliant" && penalty <= 0) return null;
  const score = penalty > 50000 ? 70 : status === "non_compliant" ? 60 : 50;
  const desc = penalty > 0
    ? `Facing ~$${Math.round(penalty).toLocaleString()}/yr in LL97 carbon penalties`
    : "At risk of LL97 carbon penalties by 2030";
  return makeSignal("ll97_penalty_risk", "market_squeeze", "LL97 Penalty Risk", desc, score, "LL84 Energy", penalty || status);
};

const evalHighEUI: SignalEvaluator = (data) => {
  if (!data.energy?.siteEUI) return null;
  const eui = data.energy.siteEUI;
  if (eui < 150) return null;
  const score = eui > 200 ? 50 : 35;
  return makeSignal("high_eui", "market_squeeze", "High Energy Use", `Site EUI of ${Math.round(eui)} — expensive to operate`, score, "LL84 Energy", Math.round(eui));
};

const evalLowEnergyStar: SignalEvaluator = (data) => {
  if (!data.energy?.energyStarScore) return null;
  const score_ = data.energy.energyStarScore;
  if (score_ >= 25) return null;
  return makeSignal("low_energy_star", "market_squeeze", "Low Energy Star Score", `Energy Star score of ${score_} (bottom quartile) — high utility costs`, 40, "LL84 Energy", score_);
};

const evalRpieNoncompliance: SignalEvaluator = (data) => {
  if (data.compliance?.rpieStatus !== "non_compliant") return null;
  return makeSignal("rpie_noncompliance", "market_squeeze", "RPIE Non-Compliance", "Non-compliant with RPIE filings — may indicate absentee/negligent owner", 30, "RPIE");
};

// ---- Speculation ----

const evalSpeculationWatch: SignalEvaluator = (data) => {
  const spec = data.raw?.speculation;
  if (!spec || (Array.isArray(spec) && spec.length === 0)) return null;
  return makeSignal("speculation_watch", "speculation", "Speculation Watch List", "Building is on NYC Speculation Watch List", 60, "Speculation Watch List");
};

const evalRapidFlip: SignalEvaluator = (data) => {
  const sales = data.financials?.allSales || [];
  if (sales.length < 2) return null;
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const recentDeeds = sales.filter(
    (s) => new Date(s.date) >= threeYearsAgo && /deed|convey/i.test(s.docType || ""),
  );
  if (recentDeeds.length < 2) return null;
  return makeSignal("rapid_flip", "speculation", "Rapid Flip Pattern", `${recentDeeds.length} ownership transfers in 3 years`, 55, "ACRIS", recentDeeds.length);
};

/* ------------------------------------------------------------------ */
/*  All signal evaluators                                              */
/* ------------------------------------------------------------------ */

const ALL_EVALUATORS: SignalEvaluator[] = [
  // Financial
  evalTaxLiens, evalLisPendens, evalMortgageDefault, evalEcbPenalties,
  // Physical
  evalHpdViolationsC, evalHpdViolationsB, evalDobViolations, evalNoRecentPermits, evalComplaintVolume,
  // Legal
  evalHpdLitigation, evalVacateOrder,
  // Ownership
  evalLongOwnership, evalEstateTransfer, evalAbsenteeOwner, evalEntityComplexity,
  // Market Squeeze
  evalRentStabSqueeze, evalLL97Risk, evalHighEUI, evalLowEnergyStar, evalRpieNoncompliance,
  // Speculation
  evalSpeculationWatch, evalRapidFlip,
];

/* ------------------------------------------------------------------ */
/*  Core scoring function                                              */
/* ------------------------------------------------------------------ */

export function calculateMotivationScore(data: MotivationInput): MotivationScore {
  // 1. Evaluate all signals
  const firedSignals: MotivationSignal[] = [];
  for (const evaluator of ALL_EVALUATORS) {
    try {
      const signal = evaluator(data);
      if (signal && signal.score > 0) {
        firedSignals.push(signal);
      }
    } catch {
      // Skip failed evaluators gracefully
    }
  }

  // 2. Sort by weightedScore descending
  firedSignals.sort((a, b) => b.weightedScore - a.weightedScore);

  // 3. Calculate overall: top 5 signals
  const top5 = firedSignals.slice(0, 5);
  let overall = 0;
  if (top5.length > 0) {
    const sumWeighted = top5.reduce((s, sig) => s + sig.weightedScore, 0);
    // Max possible: 5 signals × 100 score × 1.0 weight = 500
    const maxPossible = top5.reduce((s, sig) => s + 100 * sig.weight, 0);
    overall = Math.min(100, Math.round((sumWeighted / maxPossible) * 100));
  }

  // 4. Determine confidence
  const sourceCount = data.dataSources?.length || 0;
  const hasViolations = (data.compliance?.hpdViolations?.open ?? -1) >= 0;
  const hasAcris = (data.financials?.allSales?.length || 0) > 0;
  const hasEnergy = !!data.energy;
  const hasPluto = !!data.raw?.pluto;
  const dataFields = [hasPluto, hasViolations, hasAcris, hasEnergy].filter(Boolean).length + Math.min(sourceCount, 6);
  const confidence: MotivationConfidence =
    dataFields >= 10 ? "high" : dataFields >= 5 ? "medium" : "low";

  // 5. Determine level
  const level = getMotivationLevel(overall);

  // 6. Generate topSignal summary
  const topSignal = top5.length > 0
    ? top5[0].description
    : "No significant seller motivation signals detected";

  return {
    overall,
    confidence,
    level,
    signals: firedSignals,
    topSignal,
    calculatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Quick estimate from PLUTO-only data (for map markers)             */
/* ------------------------------------------------------------------ */

export function quickMotivationEstimate(pluto: any): number {
  if (!pluto) return 0;
  let score = 0;

  // Year built: older = higher base motivation (deferred maintenance likelihood)
  const yearBuilt = parseInt(pluto.yearbuilt || pluto.YearBuilt || "0", 10);
  if (yearBuilt > 0 && yearBuilt < 1940) score += 15;
  else if (yearBuilt > 0 && yearBuilt < 1960) score += 10;
  else if (yearBuilt > 0 && yearBuilt < 1980) score += 5;

  // Building class: walk-up multifamily (C-class) and old law tenements
  const bldgClass = (pluto.bldgclass || pluto.BldgClass || "").toUpperCase();
  if (/^C[0-9]/.test(bldgClass)) score += 10; // Walk-up apartments
  if (/^S/.test(bldgClass)) score += 15; // Mixed-use

  // Assessed value vs market (low ratio → possible underperformance)
  const assessed = parseFloat(pluto.assesstot || pluto.AssessTot || "0");
  const land = parseFloat(pluto.assessland || pluto.AssessLand || "0");
  if (assessed > 0 && land > 0 && land / assessed > 0.6) score += 10; // Land > 60% of total = underbuilt

  // Many units but low floor count = deferred maintenance risk
  const units = parseInt(pluto.unitsres || pluto.UnitsRes || "0", 10);
  const floors = parseInt(pluto.numfloors || pluto.NumFloors || "0", 10);
  if (units > 20 && floors <= 6) score += 5;

  return Math.min(score, 100);
}

/* ------------------------------------------------------------------ */
/*  Utility functions                                                  */
/* ------------------------------------------------------------------ */

export function getMotivationLevel(score: number): MotivationLevel {
  if (score >= 75) return "very_high";
  if (score >= 55) return "high";
  if (score >= 35) return "moderate";
  if (score >= 15) return "low";
  return "minimal";
}

export function getMotivationColor(level: MotivationLevel): string {
  return MOTIVATION_LEVEL_CONFIG[level].color;
}

export function getMotivationLabel(level: MotivationLevel): string {
  return MOTIVATION_LEVEL_CONFIG[level].label;
}

export function getSignalCategoryColor(category: SignalCategory): { bg: string; text: string } {
  return SIGNAL_CATEGORY_COLORS[category];
}

export function getSignalCategoryLabel(category: SignalCategory): string {
  return SIGNAL_CATEGORY_LABELS[category];
}
