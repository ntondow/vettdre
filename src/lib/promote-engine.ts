// ============================================================
// GP/LP Promote Engine — Waterfall Distribution Calculator
// Pure TypeScript, no "use server"
// ============================================================

import { calculateIRR } from "./deal-calculator";
import type { DealInputs, DealOutputs } from "./deal-calculator";
import { calculateAll } from "./deal-calculator";

// ============================================================
// Interfaces
// ============================================================

export interface WaterfallTier {
  name: string;
  prefRate?: number;        // LP preferred return % (e.g. 8 for 8%)
  catchUpPct?: number;      // GP catch-up % of remaining (e.g. 50 for 50%)
  gpSplitPct: number;       // GP share of remaining (e.g. 30 for 30%)
  lpSplitPct: number;       // LP share of remaining (e.g. 70 for 70%)
  irrHurdle?: number;       // LP IRR threshold to activate this tier (e.g. 15 for 15%)
}

export interface PromoteInputs {
  gpEquityPct: number;      // e.g. 10 for 10%
  lpEquityPct: number;      // e.g. 90 for 90%
  waterfallTiers: WaterfallTier[];
}

export interface YearDistribution {
  year: number;
  distributableCash: number;
  lpPref: number;
  gpCatchUp: number;
  lpShare: number;
  gpShare: number;
  gpPromote: number;        // GP share above pro-rata
  lpTotal: number;
  gpTotal: number;
  prefShortfall: number;    // Unpaid LP pref rolling to next year
  lpCumulative: number;
  gpCumulative: number;
}

export interface PromoteOutputs {
  gpIrr: number;
  lpIrr: number;
  gpEquityMultiple: number;
  lpEquityMultiple: number;
  gpPromoteEarned: number;
  gpEquity: number;
  lpEquity: number;
  yearDistributions: YearDistribution[];
  gpCashFlows: number[];    // [-gpEquity, yr1, yr2, ...]
  lpCashFlows: number[];    // [-lpEquity, yr1, yr2, ...]
}

export interface SensitivityCell {
  gpIrr: number;
  lpIrr: number;
  gpMultiple: number;
  lpMultiple: number;
}

export interface PromoteSensitivity {
  rows: SensitivityCell[][];
  exitCapLabels: string[];
  rentGrowthLabels: string[];
}

// ============================================================
// Waterfall Templates
// ============================================================

export interface WaterfallTemplate {
  name: string;
  gpEquityPct: number;
  lpEquityPct: number;
  tiers: WaterfallTier[];
}

export const WATERFALL_TEMPLATES: WaterfallTemplate[] = [
  {
    name: "Standard 70/30",
    gpEquityPct: 10,
    lpEquityPct: 90,
    tiers: [
      { name: "LP Preferred Return", prefRate: 8, gpSplitPct: 0, lpSplitPct: 100 },
      { name: "GP Catch-Up", catchUpPct: 50, gpSplitPct: 100, lpSplitPct: 0 },
      { name: "Profit Split", gpSplitPct: 30, lpSplitPct: 70 },
    ],
  },
  {
    name: "Conservative 80/20",
    gpEquityPct: 5,
    lpEquityPct: 95,
    tiers: [
      { name: "LP Preferred Return", prefRate: 10, gpSplitPct: 0, lpSplitPct: 100 },
      { name: "Profit Split", gpSplitPct: 20, lpSplitPct: 80 },
    ],
  },
  {
    name: "Aggressive GP",
    gpEquityPct: 20,
    lpEquityPct: 80,
    tiers: [
      { name: "LP Preferred Return", prefRate: 6, gpSplitPct: 0, lpSplitPct: 100 },
      { name: "GP Catch-Up", catchUpPct: 100, gpSplitPct: 100, lpSplitPct: 0 },
      { name: "Profit Split", gpSplitPct: 40, lpSplitPct: 60 },
      { name: "Above 15% IRR", gpSplitPct: 50, lpSplitPct: 50, irrHurdle: 15 },
    ],
  },
  {
    name: "Simple Pro-Rata",
    gpEquityPct: 10,
    lpEquityPct: 90,
    tiers: [
      { name: "Pro-Rata Split", gpSplitPct: 10, lpSplitPct: 90 },
    ],
  },
  {
    name: "JV 50/50",
    gpEquityPct: 50,
    lpEquityPct: 50,
    tiers: [
      { name: "Preferred Return", prefRate: 8, gpSplitPct: 0, lpSplitPct: 100 },
      { name: "Profit Split", gpSplitPct: 50, lpSplitPct: 50 },
    ],
  },
];

// ============================================================
// Core Promote Calculation
// ============================================================

export function calculatePromote(
  dealInputs: DealInputs,
  dealOutputs: DealOutputs,
  promoteInputs: PromoteInputs
): PromoteOutputs {
  const { gpEquityPct, lpEquityPct, waterfallTiers } = promoteInputs;
  const totalEquity = dealOutputs.totalEquity;
  const gpEquity = totalEquity * (gpEquityPct / 100);
  const lpEquity = totalEquity * (lpEquityPct / 100);
  const holdYears = dealInputs.holdPeriodYears;
  const cashFlows = dealOutputs.cashFlows;

  const yearDistributions: YearDistribution[] = [];
  let cumulativePrefOwed = 0;
  let lpCumulative = 0;
  let gpCumulative = 0;
  let totalGpPromote = 0;

  // Track running LP cash flows for IRR hurdle checks
  const runningLpFlows: number[] = [-lpEquity];

  for (let y = 0; y < holdYears; y++) {
    const cf = cashFlows[y]?.cashFlow || 0;
    const isExitYear = y === holdYears - 1;
    const exitCash = isExitYear ? dealOutputs.exitProceeds : 0;
    const distributable = Math.max(0, cf + exitCash);

    let lpPref = 0;
    let gpCatchUp = 0;
    let lpShare = 0;
    let gpShare = 0;
    let remaining = distributable;

    // Calculate LP IRR so far (for IRR hurdle tiers)
    const lpIrrSoFar = runningLpFlows.length > 1
      ? calculateIRR([...runningLpFlows]) * 100
      : -100;

    for (const tier of waterfallTiers) {
      if (remaining <= 0) break;

      // IRR hurdle check — skip this tier if LP IRR hasn't reached the hurdle
      if (tier.irrHurdle !== undefined) {
        if (lpIrrSoFar < tier.irrHurdle) continue;
      }

      // Preferred Return tier
      if (tier.prefRate !== undefined && tier.prefRate > 0) {
        const annualPref = lpEquity * (tier.prefRate / 100);
        const totalPrefDue = annualPref + cumulativePrefOwed;
        const prefPaid = Math.min(remaining, totalPrefDue);
        lpPref += prefPaid;
        cumulativePrefOwed = totalPrefDue - prefPaid;
        remaining -= prefPaid;
        continue;
      }

      // Catch-Up tier
      if (tier.catchUpPct !== undefined && tier.catchUpPct > 0) {
        const catchUpAmount = remaining * (tier.catchUpPct / 100);
        const gpCatchUpAmt = Math.min(remaining, catchUpAmount);
        gpCatchUp += gpCatchUpAmt;
        remaining -= gpCatchUpAmt;
        continue;
      }

      // Profit Split tier (default)
      const gpAmt = remaining * (tier.gpSplitPct / 100);
      const lpAmt = remaining * (tier.lpSplitPct / 100);
      gpShare += gpAmt;
      lpShare += lpAmt;
      remaining = 0;
    }

    // If any remaining after all tiers, split pro-rata
    if (remaining > 0) {
      gpShare += remaining * (gpEquityPct / 100);
      lpShare += remaining * (lpEquityPct / 100);
    }

    const lpTotal = lpPref + lpShare;
    const gpTotal = gpCatchUp + gpShare;

    // GP promote = what GP gets above their pro-rata equity share
    const gpProRata = distributable * (gpEquityPct / 100);
    const gpPromote = Math.max(0, gpTotal - gpProRata);
    totalGpPromote += gpPromote;

    lpCumulative += lpTotal;
    gpCumulative += gpTotal;

    runningLpFlows.push(lpTotal);

    yearDistributions.push({
      year: y + 1,
      distributableCash: distributable,
      lpPref,
      gpCatchUp,
      lpShare,
      gpShare,
      gpPromote,
      lpTotal,
      gpTotal,
      prefShortfall: cumulativePrefOwed,
      lpCumulative,
      gpCumulative,
    });
  }

  // Build IRR cash flow arrays
  const gpCashFlowArr = [-gpEquity, ...yearDistributions.map(d => d.gpTotal)];
  const lpCashFlowArr = [-lpEquity, ...yearDistributions.map(d => d.lpTotal)];

  let gpIrr = 0;
  let lpIrr = 0;
  if (gpEquity > 0) gpIrr = calculateIRR(gpCashFlowArr) * 100;
  if (lpEquity > 0) lpIrr = calculateIRR(lpCashFlowArr) * 100;

  const gpTotalReceived = yearDistributions.reduce((s, d) => s + d.gpTotal, 0);
  const lpTotalReceived = yearDistributions.reduce((s, d) => s + d.lpTotal, 0);
  const gpEquityMultiple = gpEquity > 0 ? gpTotalReceived / gpEquity : 0;
  const lpEquityMultiple = lpEquity > 0 ? lpTotalReceived / lpEquity : 0;

  return {
    gpIrr,
    lpIrr,
    gpEquityMultiple,
    lpEquityMultiple,
    gpPromoteEarned: totalGpPromote,
    gpEquity,
    lpEquity,
    yearDistributions,
    gpCashFlows: gpCashFlowArr,
    lpCashFlows: lpCashFlowArr,
  };
}

// ============================================================
// Sensitivity Analysis — 5x5 Matrix
// ============================================================

export function calculatePromoteSensitivity(
  dealInputs: DealInputs,
  promoteInputs: PromoteInputs,
  exitCapDeltas: number[] = [-1, -0.5, 0, 0.5, 1],
  rentGrowthDeltas: number[] = [-1, -0.5, 0, 0.5, 1]
): PromoteSensitivity {
  const rows: SensitivityCell[][] = [];
  const exitCapLabels: string[] = [];
  const rentGrowthLabels: string[] = [];

  for (const d of exitCapDeltas) {
    exitCapLabels.push(`${(dealInputs.exitCapRate + d).toFixed(1)}%`);
  }
  for (const d of rentGrowthDeltas) {
    rentGrowthLabels.push(`${(dealInputs.annualRentGrowth + d).toFixed(1)}%`);
  }

  for (const capDelta of exitCapDeltas) {
    const row: SensitivityCell[] = [];
    for (const rentDelta of rentGrowthDeltas) {
      const tweakedInputs: DealInputs = {
        ...dealInputs,
        exitCapRate: dealInputs.exitCapRate + capDelta,
        annualRentGrowth: dealInputs.annualRentGrowth + rentDelta,
      };
      const tweakedOutputs = calculateAll(tweakedInputs);
      const result = calculatePromote(tweakedInputs, tweakedOutputs, promoteInputs);
      row.push({
        gpIrr: result.gpIrr,
        lpIrr: result.lpIrr,
        gpMultiple: result.gpEquityMultiple,
        lpMultiple: result.lpEquityMultiple,
      });
    }
    rows.push(row);
  }

  return { rows, exitCapLabels, rentGrowthLabels };
}
