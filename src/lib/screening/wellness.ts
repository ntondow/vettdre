/**
 * Financial Wellness Profile Computation
 *
 * Analyzes Plaid transaction data to build a comprehensive financial
 * profile: income stability, expense patterns, red flags, and an
 * overall financial health score.
 */

import { RED_FLAG_CATEGORIES } from "./constants";

export interface TransactionRow {
  date: Date;
  amount: number;       // Positive = expense, negative = income (Plaid convention)
  vettdreCategory: string | null;
  merchantName: string | null;
  name: string | null;
  isRecurring: boolean;
}

export interface WellnessResult {
  avgMonthlyIncome: number;
  incomeSources: { source: string; avgMonthly: number; count: number }[];
  incomeStabilityScore: number;     // 0-100
  incomeTrend: "increasing" | "stable" | "decreasing" | "volatile";

  avgMonthlyExpenses: number;
  recurringObligations: { name: string; amount: number; category: string }[];
  estimatedMonthlyDebt: number;

  incomeToRentRatio: number;
  debtToIncomeRatio: number;
  disposableIncome: number;

  avgBalance30d: number;
  avgBalance60d: number;
  avgBalance90d: number;
  lowestBalance90d: number;

  rentPaymentsFound: number;
  rentPaymentsOnTime: number;
  rentPaymentConsistency: "excellent" | "good" | "fair" | "poor" | "no_history";

  nsfCount90d: number;
  overdraftCount90d: number;
  lateFeeCount90d: number;
  gamblingTransactionCount: number;
  suspiciousActivityFlags: string[];

  financialHealthScore: number;     // 0-100
  healthTier: "excellent" | "good" | "fair" | "poor" | "critical";

  analysisPeriodStart: Date;
  analysisPeriodEnd: Date;
}

/**
 * Compute the financial wellness profile from parsed transactions.
 */
export function computeWellnessProfile(
  transactions: TransactionRow[],
  monthlyRent: number,
  accountBalances?: { current: number; available: number }[]
): WellnessResult {
  if (transactions.length === 0) {
    return createEmptyProfile(monthlyRent);
  }

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const d90 = new Date(now.getTime() - 90 * 86400000);

  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const periodStart = sorted[0].date;
  const periodEnd = sorted[sorted.length - 1].date;

  // ── Separate Income vs Expenses ─────────────────────────────
  // Plaid: negative amount = credit/income, positive = debit/expense
  // Exclude transfers (Venmo, Zelle, etc.) from income to avoid inflation
  const incomeTransactions = transactions.filter(t =>
    (t.amount < 0 && !t.vettdreCategory?.startsWith("transfer_")) ||
    (t.vettdreCategory?.startsWith("income_"))
  );
  const expenseTransactions = transactions.filter(t =>
    t.amount > 0 && !t.vettdreCategory?.startsWith("income_") && !t.vettdreCategory?.startsWith("transfer_")
  );

  // ── Income Analysis ─────────────────────────────────────────
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const months = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / (30 * 86400000));
  const avgMonthlyIncome = totalIncome / months;

  // Group income by source
  const incomeBySource = new Map<string, { total: number; count: number }>();
  for (const t of incomeTransactions) {
    const source = t.merchantName || t.name || "Unknown";
    const existing = incomeBySource.get(source) || { total: 0, count: 0 };
    existing.total += Math.abs(t.amount);
    existing.count++;
    incomeBySource.set(source, existing);
  }
  const incomeSources = Array.from(incomeBySource.entries())
    .map(([source, data]) => ({
      source,
      avgMonthly: data.total / months,
      count: data.count,
    }))
    .sort((a, b) => b.avgMonthly - a.avgMonthly)
    .slice(0, 10);

  // Income stability: coefficient of variation of monthly income
  const monthlyIncomes = groupByMonth(incomeTransactions.map(t => ({ date: t.date, amount: Math.abs(t.amount) })));
  const incomeStabilityScore = computeStabilityScore(monthlyIncomes);
  const incomeTrend = computeTrend(monthlyIncomes);

  // ── Expense Analysis ────────────────────────────────────────
  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
  const avgMonthlyExpenses = totalExpenses / months;

  // Recurring obligations
  const recurringTxns = expenseTransactions.filter(t => t.isRecurring);
  const recurringByName = new Map<string, { total: number; count: number; category: string }>();
  for (const t of recurringTxns) {
    const name = t.merchantName || t.name || "Unknown";
    const existing = recurringByName.get(name) || { total: 0, count: 0, category: t.vettdreCategory || "other" };
    existing.total += t.amount;
    existing.count++;
    recurringByName.set(name, existing);
  }
  const recurringObligations = Array.from(recurringByName.entries())
    .map(([name, data]) => ({
      name,
      amount: data.total / Math.max(1, data.count),
      category: data.category,
    }))
    .sort((a, b) => b.amount - a.amount);

  const debtPayments = expenseTransactions.filter(t =>
    ["debt_payment", "loan_payment", "credit_card_payment"].includes(t.vettdreCategory || "")
  );
  const estimatedMonthlyDebt = debtPayments.reduce((sum, t) => sum + t.amount, 0) / months;

  // ── Ratios ──────────────────────────────────────────────────
  const incomeToRentRatio = monthlyRent > 0 ? avgMonthlyIncome / monthlyRent : 0;
  const debtToIncomeRatio = avgMonthlyIncome > 0 ? (estimatedMonthlyDebt + monthlyRent) / avgMonthlyIncome : 1;
  const disposableIncome = avgMonthlyIncome - avgMonthlyExpenses;

  // ── Balance Analysis ────────────────────────────────────────
  // Use account balances if available, otherwise estimate from transactions
  const currentBalance = accountBalances?.reduce((sum, a) => sum + (a.current || 0), 0) || 0;
  const avgBalance30d = currentBalance; // Simplified — real implementation would track daily
  const avgBalance60d = currentBalance;
  const avgBalance90d = currentBalance;
  const lowestBalance90d = currentBalance;

  // ── Rent Payment History ────────────────────────────────────
  const rentPayments = transactions.filter(t => t.vettdreCategory === "rent_payment");
  const rentPaymentsFound = rentPayments.length;
  // Consider "on time" if payment is in first 5 days of month
  const rentPaymentsOnTime = rentPayments.filter(t => {
    const day = t.date.getDate();
    return day <= 5;
  }).length;

  let rentPaymentConsistency: WellnessResult["rentPaymentConsistency"] = "no_history";
  if (rentPaymentsFound > 0) {
    const onTimeRate = rentPaymentsOnTime / rentPaymentsFound;
    if (onTimeRate >= 0.95) rentPaymentConsistency = "excellent";
    else if (onTimeRate >= 0.80) rentPaymentConsistency = "good";
    else if (onTimeRate >= 0.60) rentPaymentConsistency = "fair";
    else rentPaymentConsistency = "poor";
  }

  // ── Red Flags ───────────────────────────────────────────────
  const last90d = transactions.filter(t => t.date >= d90);
  const nsfCount90d = last90d.filter(t => t.vettdreCategory === "nsf_fee").length;
  const overdraftCount90d = last90d.filter(t => t.vettdreCategory === "overdraft_fee").length;
  const lateFeeCount90d = last90d.filter(t => t.vettdreCategory === "late_fee").length;
  const gamblingTransactionCount = transactions.filter(t => t.vettdreCategory === "gambling").length;

  const suspiciousActivityFlags: string[] = [];
  if (nsfCount90d >= 3) suspiciousActivityFlags.push("Frequent NSF fees (3+ in 90 days)");
  if (overdraftCount90d >= 3) suspiciousActivityFlags.push("Frequent overdrafts (3+ in 90 days)");
  if (gamblingTransactionCount >= 5) suspiciousActivityFlags.push("Significant gambling activity");
  if (lateFeeCount90d >= 3) suspiciousActivityFlags.push("Multiple late fees (3+ in 90 days)");
  if (disposableIncome < 0) suspiciousActivityFlags.push("Negative disposable income");

  // ── Financial Health Score ──────────────────────────────────
  const financialHealthScore = computeHealthScore({
    incomeToRentRatio,
    debtToIncomeRatio,
    incomeStabilityScore,
    nsfCount90d,
    overdraftCount90d,
    rentPaymentConsistency,
    disposableIncome,
    avgMonthlyIncome,
  });

  let healthTier: WellnessResult["healthTier"];
  if (financialHealthScore >= 80) healthTier = "excellent";
  else if (financialHealthScore >= 65) healthTier = "good";
  else if (financialHealthScore >= 50) healthTier = "fair";
  else if (financialHealthScore >= 30) healthTier = "poor";
  else healthTier = "critical";

  return {
    avgMonthlyIncome: Math.round(avgMonthlyIncome * 100) / 100,
    incomeSources,
    incomeStabilityScore,
    incomeTrend,
    avgMonthlyExpenses: Math.round(avgMonthlyExpenses * 100) / 100,
    recurringObligations,
    estimatedMonthlyDebt: Math.round(estimatedMonthlyDebt * 100) / 100,
    incomeToRentRatio: Math.round(incomeToRentRatio * 100) / 100,
    debtToIncomeRatio: Math.round(debtToIncomeRatio * 100) / 100,
    disposableIncome: Math.round(disposableIncome * 100) / 100,
    avgBalance30d: Math.round(avgBalance30d * 100) / 100,
    avgBalance60d: Math.round(avgBalance60d * 100) / 100,
    avgBalance90d: Math.round(avgBalance90d * 100) / 100,
    lowestBalance90d: Math.round(lowestBalance90d * 100) / 100,
    rentPaymentsFound,
    rentPaymentsOnTime,
    rentPaymentConsistency,
    nsfCount90d,
    overdraftCount90d,
    lateFeeCount90d,
    gamblingTransactionCount,
    suspiciousActivityFlags,
    financialHealthScore: Math.round(financialHealthScore * 100) / 100,
    healthTier,
    analysisPeriodStart: periodStart,
    analysisPeriodEnd: periodEnd,
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function groupByMonth(items: { date: Date; amount: number }[]): number[] {
  const monthMap = new Map<string, number>();
  for (const item of items) {
    const key = `${item.date.getFullYear()}-${item.date.getMonth()}`;
    monthMap.set(key, (monthMap.get(key) || 0) + item.amount);
  }
  return Array.from(monthMap.values());
}

function computeStabilityScore(monthlyValues: number[]): number {
  if (monthlyValues.length < 2) return 50;
  const mean = monthlyValues.reduce((a, b) => a + b, 0) / monthlyValues.length;
  if (mean === 0) return 0;
  const variance = monthlyValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / monthlyValues.length;
  const cv = Math.sqrt(variance) / mean; // Coefficient of variation
  // CV of 0 = perfectly stable (100), CV of 1+ = very volatile (0)
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

function computeTrend(monthlyValues: number[]): WellnessResult["incomeTrend"] {
  if (monthlyValues.length < 3) return "stable";
  const firstHalf = monthlyValues.slice(0, Math.floor(monthlyValues.length / 2));
  const secondHalf = monthlyValues.slice(Math.floor(monthlyValues.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  if (firstAvg === 0) return "stable";
  const changeRate = (secondAvg - firstAvg) / firstAvg;

  if (changeRate > 0.15) return "increasing";
  if (changeRate < -0.15) return "decreasing";

  // Check volatility
  const cv = computeStabilityScore(monthlyValues);
  if (cv < 40) return "volatile";

  return "stable";
}

function computeHealthScore(data: {
  incomeToRentRatio: number;
  debtToIncomeRatio: number;
  incomeStabilityScore: number;
  nsfCount90d: number;
  overdraftCount90d: number;
  rentPaymentConsistency: string;
  disposableIncome: number;
  avgMonthlyIncome: number;
}): number {
  let score = 0;

  // Income-to-rent ratio (25 points)
  if (data.incomeToRentRatio >= 3) score += 25;
  else if (data.incomeToRentRatio >= 2.5) score += 20;
  else if (data.incomeToRentRatio >= 2) score += 15;
  else if (data.incomeToRentRatio >= 1.5) score += 8;
  else score += 0;

  // Debt-to-income (20 points)
  if (data.debtToIncomeRatio <= 0.3) score += 20;
  else if (data.debtToIncomeRatio <= 0.4) score += 15;
  else if (data.debtToIncomeRatio <= 0.5) score += 10;
  else score += 0;

  // Income stability (20 points)
  score += (data.incomeStabilityScore / 100) * 20;

  // Rent payment history (15 points)
  const rentMap: Record<string, number> = { excellent: 15, good: 12, fair: 8, poor: 3, no_history: 7 };
  score += rentMap[data.rentPaymentConsistency] || 7;

  // Red flag penalties (20 points base, deducted)
  let redFlagScore = 20;
  redFlagScore -= Math.min(10, data.nsfCount90d * 3);
  redFlagScore -= Math.min(10, data.overdraftCount90d * 3);
  score += Math.max(0, redFlagScore);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function createEmptyProfile(monthlyRent: number): WellnessResult {
  return {
    avgMonthlyIncome: 0,
    incomeSources: [],
    incomeStabilityScore: 0,
    incomeTrend: "stable",
    avgMonthlyExpenses: 0,
    recurringObligations: [],
    estimatedMonthlyDebt: 0,
    incomeToRentRatio: 0,
    debtToIncomeRatio: 0,
    disposableIncome: 0,
    avgBalance30d: 0,
    avgBalance60d: 0,
    avgBalance90d: 0,
    lowestBalance90d: 0,
    rentPaymentsFound: 0,
    rentPaymentsOnTime: 0,
    rentPaymentConsistency: "no_history",
    nsfCount90d: 0,
    overdraftCount90d: 0,
    lateFeeCount90d: 0,
    gamblingTransactionCount: 0,
    suspiciousActivityFlags: ["No bank data available"],
    financialHealthScore: 30,
    healthTier: "poor",
    analysisPeriodStart: new Date(),
    analysisPeriodEnd: new Date(),
  };
}
