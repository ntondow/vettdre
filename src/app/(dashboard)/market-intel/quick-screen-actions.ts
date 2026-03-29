"use server";

import {
  classifyBuildingCategory,
  getExpenseBenchmark,
  CATEGORY_LABELS,
} from "@/lib/expense-benchmarks";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface QuickScreenInput {
  // Required
  purchasePrice: number;

  // Building data (auto-filled from PLUTO)
  address: string;
  borough: string;
  totalUnits: number;
  grossSqft: number;
  yearBuilt: number;
  numFloors: number;
  buildingClass: string;
  assessedValue?: number;

  // User overrides (optional — system estimates if blank)
  annualGrossRent?: number;
  avgMonthlyRent?: number;
  vacancyRate?: number;
  annualExpenses?: number;
  expenseRatio?: number;
  capRate?: number;

  // Financing (smart defaults)
  downPaymentPct?: number;
  interestRate?: number;
  loanTermYears?: number;

  // Analysis
  holdPeriodYears?: number;
  annualRentGrowth?: number;
  annualExpenseGrowth?: number;
  exitCapRate?: number;
}

export interface QuickScreenResult {
  // The 6 headline metrics
  capRate: number;
  cashOnCash: number;
  irr: number;
  equityMultiple: number;
  dscr: number;
  monthlyCashFlow: number;

  // Supporting numbers
  annualGrossRent: number;
  effectiveGrossIncome: number;
  annualExpenses: number;
  noi: number;
  annualDebtService: number;
  loanAmount: number;
  equityRequired: number;
  exitValue: number;
  totalProfit: number;
  pricePerUnit: number;
  pricePerSqft: number;
  expenseRatio: number;
  vacancyRate: number;

  // Context
  marketCapRate?: number;
  marketCapRateTrend?: string;
  expenseBenchmark?: number;
  buildingCategory?: string;

  // Assumptions used
  assumptions: {
    avgMonthlyRent: number;
    vacancyRate: number;
    expensePerUnit: number;
    downPaymentPct: number;
    interestRate: number;
    loanTermYears: number;
    holdPeriodYears: number;
    rentGrowth: number;
    expenseGrowth: number;
    exitCapRate: number;
  };

  // Verdict
  verdict: "strong_buy" | "buy" | "hold" | "pass" | "hard_pass";
  verdictReason: string;
}

/* ------------------------------------------------------------------ */
/*  Borough rent heuristics (conservative $/unit/mo)                   */
/* ------------------------------------------------------------------ */

const BOROUGH_RENT_BASE: Record<string, number> = {
  Manhattan: 3500,
  Brooklyn: 2800,
  Queens: 2200,
  Bronx: 1800,
  "Staten Island": 1600,
};

function estimateMonthlyRent(
  borough: string,
  yearBuilt: number,
  numFloors: number,
  buildingClass: string,
): number {
  const base = BOROUGH_RENT_BASE[borough] ?? 2200;
  let adj = 0;
  // Post-war / modern premium
  if (yearBuilt >= 2000) adj += 300;
  else if (yearBuilt >= 1947) adj += 100;
  else adj -= 200; // pre-war discount (walkup)
  // Elevator buildings command higher rents
  if (numFloors > 5 || buildingClass.startsWith("D")) adj += 200;
  return Math.max(800, base + adj);
}

/* ------------------------------------------------------------------ */
/*  Fallback cap rates by borough                                      */
/* ------------------------------------------------------------------ */

const FALLBACK_CAP_RATES: Record<string, number> = {
  Manhattan: 4.5,
  Brooklyn: 5.25,
  Queens: 5.75,
  Bronx: 6.5,
  "Staten Island": 6.75,
};

/* ------------------------------------------------------------------ */
/*  PMT — standard mortgage payment calculation                        */
/* ------------------------------------------------------------------ */

function pmt(monthlyRate: number, nPeriods: number, principal: number): number {
  if (monthlyRate === 0) return principal / nPeriods;
  const factor = Math.pow(1 + monthlyRate, nPeriods);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/* ------------------------------------------------------------------ */
/*  IRR solver — Newton-Raphson method                                 */
/* ------------------------------------------------------------------ */

function solveIRR(cashFlows: number[], guess = 0.1, maxIter = 50): number {
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashFlows[t] / denom;
      if (t > 0) dnpv -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < 0.01) return rate;
    if (dnpv === 0) break;
    rate -= npv / dnpv;
    if (rate < -0.5 || rate > 5) return NaN; // diverged
  }
  return rate;
}

/* ------------------------------------------------------------------ */
/*  Main Quick Screen calculation                                      */
/* ------------------------------------------------------------------ */

export async function runQuickScreen(
  input: QuickScreenInput,
): Promise<QuickScreenResult> {
  const {
    purchasePrice,
    borough,
    totalUnits,
    grossSqft,
    yearBuilt,
    numFloors,
    buildingClass,
    assessedValue,
  } = input;

  const units = Math.max(1, totalUnits);

  // ── 1. Estimate rent ─────────────────────────────────────────
  let avgMonthlyRent: number;
  if (input.avgMonthlyRent && input.avgMonthlyRent > 0) {
    avgMonthlyRent = input.avgMonthlyRent;
  } else {
    avgMonthlyRent = estimateMonthlyRent(borough, yearBuilt, numFloors, buildingClass);
  }

  let annualGrossRent: number;
  if (input.annualGrossRent && input.annualGrossRent > 0) {
    annualGrossRent = input.annualGrossRent;
  } else {
    annualGrossRent = avgMonthlyRent * units * 12;
  }

  // ── 2. Estimate expenses ─────────────────────────────────────
  const category = classifyBuildingCategory({
    yearBuilt,
    numFloors,
    bldgClass: buildingClass,
  });
  const categoryLabel = CATEGORY_LABELS[category];

  let annualExpenses: number;
  let expensePerUnit: number;
  let benchmarkPerUnit: number | undefined;

  if (input.annualExpenses && input.annualExpenses > 0) {
    annualExpenses = input.annualExpenses;
    expensePerUnit = annualExpenses / units;
  } else if (input.expenseRatio && input.expenseRatio > 0) {
    annualExpenses = annualGrossRent * input.expenseRatio;
    expensePerUnit = annualExpenses / units;
  } else {
    // Use RGB I&E benchmarks
    try {
      const hasElevator = numFloors > 5 || buildingClass.startsWith("D");
      const bm = getExpenseBenchmark({
        yearBuilt,
        hasElevator,
        numFloors,
        bldgClass: buildingClass,
        bldgArea: grossSqft,
        unitsRes: units,
        borough,
      });
      expensePerUnit = bm.totalPerUnit;
      annualExpenses = bm.totalAnnual;
      benchmarkPerUnit = bm.totalPerUnit;
    } catch {
      // Fallback: 45% expense ratio
      annualExpenses = annualGrossRent * 0.45;
      expensePerUnit = annualExpenses / units;
    }
  }

  // ── 3. Vacancy ───────────────────────────────────────────────
  const vacancyRate = input.vacancyRate ?? 0.05;

  // ── 4. Calculate NOI ─────────────────────────────────────────
  const egi = annualGrossRent * (1 - vacancyRate);
  const noi = egi - annualExpenses;

  // ── 5. Financing ─────────────────────────────────────────────
  const downPaymentPct = input.downPaymentPct ?? 0.25;
  const interestRate = input.interestRate ?? 0.07;
  const loanTermYears = input.loanTermYears ?? 30;

  const loanAmount = purchasePrice * (1 - downPaymentPct);
  const monthlyPayment = pmt(interestRate / 12, loanTermYears * 12, loanAmount);
  const annualDebtService = monthlyPayment * 12;

  // Equity = down payment + estimated closing costs (~3%)
  const closingCostPct = 0.03;
  const equityRequired = purchasePrice * downPaymentPct + purchasePrice * closingCostPct;

  // ── 6. Core metrics ──────────────────────────────────────────
  const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;
  const annualCashFlow = noi - annualDebtService;
  const monthlyCashFlow = annualCashFlow / 12;
  const cashOnCash = equityRequired > 0 ? (annualCashFlow / equityRequired) * 100 : 0;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;

  // ── 7. IRR + Equity Multiple ─────────────────────────────────
  const holdPeriodYears = input.holdPeriodYears ?? 5;
  const annualRentGrowth = input.annualRentGrowth ?? 0.025;
  const annualExpenseGrowth = input.annualExpenseGrowth ?? 0.03;
  const exitCapRateDecimal = input.exitCapRate ?? (capRate / 100 + 0.0025); // entry cap + 25bp

  // Build cash flow series
  const cashFlows: number[] = [-equityRequired];
  let cumCashFlow = 0;
  let yearNoi = noi;
  let yearRent = annualGrossRent;
  let yearExp = annualExpenses;

  for (let yr = 1; yr <= holdPeriodYears; yr++) {
    if (yr > 1) {
      yearRent *= 1 + annualRentGrowth;
      yearExp *= 1 + annualExpenseGrowth;
      const yearEgi = yearRent * (1 - vacancyRate);
      yearNoi = yearEgi - yearExp;
    }
    const yearCf = yearNoi - annualDebtService;
    cumCashFlow += yearCf;

    if (yr < holdPeriodYears) {
      cashFlows.push(yearCf);
    } else {
      // Terminal year: cash flow + sale proceeds - remaining loan balance
      const exitNoi = yearRent * (1 + annualRentGrowth) * (1 - vacancyRate) - yearExp * (1 + annualExpenseGrowth);
      const exitValue = exitCapRateDecimal > 0 ? exitNoi / exitCapRateDecimal : 0;
      // Approximate remaining loan balance
      const monthsPaid = holdPeriodYears * 12;
      const monthlyR = interestRate / 12;
      const totalMonths = loanTermYears * 12;
      const remainingBalance = monthlyR > 0
        ? loanAmount * (Math.pow(1 + monthlyR, totalMonths) - Math.pow(1 + monthlyR, monthsPaid))
            / (Math.pow(1 + monthlyR, totalMonths) - 1)
        : loanAmount * (1 - monthsPaid / totalMonths);
      const sallingCosts = exitValue * 0.03; // 3% selling costs
      const saleProceeds = exitValue - remainingBalance - sallingCosts;
      cashFlows.push(yearCf + saleProceeds);
    }
  }

  const irr = solveIRR(cashFlows) * 100;

  // Exit value for display
  const exitNoi = yearRent * (1 + annualRentGrowth) * (1 - vacancyRate) - yearExp * (1 + annualExpenseGrowth);
  const exitValue = exitCapRateDecimal > 0 ? exitNoi / exitCapRateDecimal : 0;

  // Equity multiple
  const totalCashReceived = cashFlows.slice(1).reduce((s, v) => s + v, 0);
  const equityMultiple = equityRequired > 0 ? (totalCashReceived + equityRequired) / equityRequired : 0;
  const totalProfit = totalCashReceived;

  // ── 8. Market context ────────────────────────────────────────
  const marketCapRate = FALLBACK_CAP_RATES[borough] ?? 5.75;

  // ── 9. Verdict ───────────────────────────────────────────────
  let verdict: QuickScreenResult["verdict"];
  let verdictReason: string;

  if (capRate >= 7 && cashOnCash >= 10 && dscr >= 1.25) {
    verdict = "strong_buy";
    verdictReason = `${capRate.toFixed(1)}% cap rate with ${dscr.toFixed(2)}x coverage and strong cash flow`;
  } else if (capRate >= 5.5 && cashOnCash >= 7 && dscr >= 1.15) {
    verdict = "buy";
    verdictReason = `${capRate.toFixed(1)}% cap with ${dscr.toFixed(2)}x coverage — solid fundamentals`;
  } else if (capRate >= 4 && cashOnCash >= 4 && dscr >= 1.0) {
    verdict = "hold";
    verdictReason = `${capRate.toFixed(1)}% cap rate — workable margins, look for upside or better basis`;
  } else if (capRate >= 3 || (cashOnCash >= 2 && dscr >= 0.9)) {
    verdict = "pass";
    verdictReason = `Sub-${Math.ceil(capRate)}% cap rate with thin margins — would need significant rent growth`;
  } else {
    verdict = "hard_pass";
    verdictReason = noi <= 0
      ? "Negative NOI — expenses exceed income at this price"
      : `${capRate.toFixed(1)}% cap rate in a rising rate environment — does not pencil`;
  }

  // ── 10. Per-unit / per-sqft metrics ──────────────────────────
  const pricePerUnit = units > 0 ? purchasePrice / units : 0;
  const pricePerSqft = grossSqft > 0 ? purchasePrice / grossSqft : 0;
  const expRatio = egi > 0 ? annualExpenses / egi : 0;

  return {
    capRate,
    cashOnCash,
    irr: isNaN(irr) ? 0 : irr,
    equityMultiple,
    dscr,
    monthlyCashFlow,

    annualGrossRent,
    effectiveGrossIncome: egi,
    annualExpenses,
    noi,
    annualDebtService,
    loanAmount,
    equityRequired,
    exitValue,
    totalProfit,
    pricePerUnit,
    pricePerSqft,
    expenseRatio: expRatio,
    vacancyRate,

    marketCapRate,
    marketCapRateTrend: "stable",
    expenseBenchmark: benchmarkPerUnit,
    buildingCategory: categoryLabel,

    assumptions: {
      avgMonthlyRent,
      vacancyRate,
      expensePerUnit,
      downPaymentPct,
      interestRate,
      loanTermYears,
      holdPeriodYears,
      rentGrowth: annualRentGrowth,
      expenseGrowth: annualExpenseGrowth,
      exitCapRate: exitCapRateDecimal * 100,
    },

    verdict,
    verdictReason,
  };
}
