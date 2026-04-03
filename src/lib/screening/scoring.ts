/**
 * VettdRE Risk Score Algorithm
 *
 * Weighted composite score (0-100) from permissible factors only.
 * Fair Housing compliant: does NOT factor in race, color, religion,
 * national origin, sex, familial status, or disability.
 */

export interface RiskScoreInputs {
  creditScore: number | null;            // 300-850 (null if not available)
  financialHealthScore: number | null;   // 0-100
  monthlyIncome: number | null;
  monthlyRent: number;
  documentFraudScore: number | null;     // 0-100 (0=clean, 100=fraud)
  rentPaymentConsistency: string | null; // excellent/good/fair/poor/no_history
  evictionCount: number;
  hasActiveBankruptcy: boolean;
}

export interface RiskScoreResult {
  score: number;
  recommendation: "approve" | "conditional" | "decline";
  factors: string[];
  componentScores: {
    credit: number;
    financialHealth: number;
    incomeRatio: number;
    documentIntegrity: number;
    rentHistory: number;
  };
}

const RENT_HISTORY_MAP: Record<string, number> = {
  excellent: 100,
  good: 80,
  fair: 60,
  poor: 30,
  no_history: 50,
};

export function computeRiskScore(data: RiskScoreInputs): RiskScoreResult {
  const factors: string[] = [];

  // ── Component: Credit Score (30%) ───────────────────────────
  // Normalize 300-850 → 0-100
  let creditComponent: number;
  if (data.creditScore != null) {
    creditComponent = Math.max(0, Math.min(100, ((data.creditScore - 300) / 550) * 100));
  } else {
    creditComponent = 40; // No credit data = moderate default
    factors.push("Credit data unavailable — scored conservatively");
  }

  // ── Component: Financial Health (30%) ───────────────────────
  let healthComponent: number;
  if (data.financialHealthScore != null) {
    healthComponent = data.financialHealthScore;
  } else {
    healthComponent = 50; // Default if Plaid was skipped
    factors.push("Bank verification not completed");
  }

  // ── Component: Income-to-Rent Ratio (20%) ───────────────────
  // 3x+ rent = 100, scales down linearly
  let incomeComponent: number;
  if (data.monthlyIncome != null && data.monthlyRent > 0) {
    const ratio = data.monthlyIncome / data.monthlyRent;
    incomeComponent = Math.min(100, (ratio / 3) * 100);
  } else {
    incomeComponent = 30; // No income data
    factors.push("Income not verified");
  }

  // ── Component: Document Integrity (10%) ─────────────────────
  // Invert fraud score: clean (0) → 100, fraud (100) → 0
  let fraudComponent: number;
  if (data.documentFraudScore != null) {
    fraudComponent = 100 - data.documentFraudScore;
  } else {
    fraudComponent = 70; // No documents = moderate default
  }

  // ── Component: Rent Payment History (10%) ───────────────────
  const rentComponent = RENT_HISTORY_MAP[data.rentPaymentConsistency || "no_history"] || 50;

  // ── Weighted Composite ──────────────────────────────────────
  let score =
    creditComponent * 0.30 +
    healthComponent * 0.30 +
    incomeComponent * 0.20 +
    fraudComponent  * 0.10 +
    rentComponent   * 0.10;

  // ── Hard Penalties ──────────────────────────────────────────
  // Active evictions are a severe risk signal
  if (data.evictionCount > 0) {
    score = Math.max(0, score - 20);
    factors.push(`${data.evictionCount} eviction record(s) found`);
  }

  // Active bankruptcy
  if (data.hasActiveBankruptcy) {
    score = Math.max(0, score - 15);
    factors.push("Active bankruptcy on record");
  }

  // ── Generate Risk Factors ───────────────────────────────────
  if (creditComponent < 50 && data.creditScore != null) {
    factors.push(`Below-average credit score (${data.creditScore})`);
  }
  if (incomeComponent < 70 && data.monthlyIncome != null) {
    const ratio = (data.monthlyIncome / data.monthlyRent).toFixed(1);
    factors.push(`Income-to-rent ratio ${ratio}x (below recommended 3x)`);
  }
  if (healthComponent < 50 && data.financialHealthScore != null) {
    factors.push("Financial health concerns detected");
  }
  if (fraudComponent < 70 && data.documentFraudScore != null) {
    factors.push("Document verification flags present");
  }
  if (rentComponent < 60) {
    factors.push("Limited or poor rent payment history");
  }

  // ── Round + Recommendation ──────────────────────────────────
  score = Math.round(score * 100) / 100;

  let recommendation: "approve" | "conditional" | "decline";
  if (score >= 75) recommendation = "approve";
  else if (score >= 50) recommendation = "conditional";
  else recommendation = "decline";

  return {
    score,
    recommendation,
    factors,
    componentScores: {
      credit: Math.round(creditComponent * 100) / 100,
      financialHealth: Math.round(healthComponent * 100) / 100,
      incomeRatio: Math.round(incomeComponent * 100) / 100,
      documentIntegrity: Math.round(fraudComponent * 100) / 100,
      rentHistory: Math.round(rentComponent * 100) / 100,
    },
  };
}
