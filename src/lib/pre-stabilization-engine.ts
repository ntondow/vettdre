/**
 * Pre-Stabilization Engine
 * Models monthly cashflows during construction and lease-up phases
 * before a value-add property reaches stabilized occupancy.
 */

export interface PreStabInputs {
  renovationMonths: number;
  leaseUpMonths: number;
  startingOccupancy: number;       // % at start of lease-up (default 0)
  targetOccupancy: number;         // % at stabilization (default 95)
  leaseUpCurve: 'linear' | 'front_loaded' | 'back_loaded';
  monthlyBridgeInterest: number;
  monthlyOpex: number;             // fixed costs during reno
  monthlyStabilizedGross: number;  // target monthly income at full occupancy
  renovationBudget: number;
  renovationDrawSchedule?: 'front_loaded' | 'even' | 'back_loaded';
}

export interface PreStabMonth {
  month: number;
  phase: 'construction' | 'lease_up' | 'stabilized';
  occupancy: number;
  grossIncome: number;
  expenses: number;
  bridgeInterest: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  renovationDraw: number;
}

export interface PreStabSummary {
  months: PreStabMonth[];
  totalNegativeCashFlow: number;
  monthsToBreakeven: number;
  monthsToStabilization: number;
}

function getOccupancyAtMonth(
  month: number,
  totalMonths: number,
  start: number,
  target: number,
  curve: 'linear' | 'front_loaded' | 'back_loaded'
): number {
  if (totalMonths <= 0) return target;
  const t = Math.min(month / totalMonths, 1);
  let progress: number;
  switch (curve) {
    case 'front_loaded':
      progress = 1 - Math.pow(1 - t, 2);
      break;
    case 'back_loaded':
      progress = Math.pow(t, 2);
      break;
    default:
      progress = t;
  }
  return start + (target - start) * progress;
}

function getRenovationDraw(
  month: number,
  totalMonths: number,
  budget: number,
  schedule: 'front_loaded' | 'even' | 'back_loaded'
): number {
  if (totalMonths <= 0) return 0;
  if (month > totalMonths) return 0;

  // Compute weight for this month
  const t = (month - 0.5) / totalMonths; // midpoint of month
  let weight: number;
  switch (schedule) {
    case 'front_loaded': weight = 2 * (1 - t); break;
    case 'back_loaded': weight = 2 * t; break;
    default: weight = 1; break;
  }

  // Normalize: sum of all weights across months
  let totalWeight = 0;
  for (let m = 1; m <= totalMonths; m++) {
    const mt = (m - 0.5) / totalMonths;
    switch (schedule) {
      case 'front_loaded': totalWeight += 2 * (1 - mt); break;
      case 'back_loaded': totalWeight += 2 * mt; break;
      default: totalWeight += 1; break;
    }
  }

  return totalWeight > 0 ? Math.round(budget * (weight / totalWeight)) : 0;
}

export function calculatePreStabilization(inputs: PreStabInputs): PreStabSummary {
  const {
    renovationMonths,
    leaseUpMonths,
    startingOccupancy,
    targetOccupancy,
    leaseUpCurve,
    monthlyBridgeInterest,
    monthlyOpex,
    monthlyStabilizedGross,
    renovationBudget,
    renovationDrawSchedule = 'even',
  } = inputs;

  const totalMonths = renovationMonths + leaseUpMonths;
  const months: PreStabMonth[] = [];
  let cumulative = 0;
  let totalNegative = 0;
  let breakevenMonth = 0;
  let breakevenFound = false;

  for (let m = 1; m <= totalMonths; m++) {
    const isConstruction = m <= renovationMonths;
    const phase: PreStabMonth['phase'] = isConstruction ? 'construction' : 'lease_up';

    // Occupancy
    let occupancy: number;
    if (isConstruction) {
      occupancy = 0;
    } else {
      const leaseUpMonth = m - renovationMonths;
      occupancy = getOccupancyAtMonth(leaseUpMonth, leaseUpMonths, startingOccupancy, targetOccupancy, leaseUpCurve);
    }

    // Income
    const grossIncome = Math.round(monthlyStabilizedGross * (occupancy / 100));

    // Expenses: partial during construction, full during lease-up
    const expenses = isConstruction ? Math.round(monthlyOpex * 0.5) : monthlyOpex;

    // Renovation draws
    const renovationDraw = isConstruction
      ? getRenovationDraw(m, renovationMonths, renovationBudget, renovationDrawSchedule)
      : 0;

    // Net cash flow (renovation draws are capital expenditure, not operating)
    const netCashFlow = grossIncome - expenses - monthlyBridgeInterest;
    cumulative += netCashFlow;

    if (netCashFlow < 0) {
      totalNegative += Math.abs(netCashFlow);
    }

    if (!breakevenFound && cumulative >= 0 && m > 1) {
      breakevenMonth = m;
      breakevenFound = true;
    }

    months.push({
      month: m,
      phase,
      occupancy: Math.round(occupancy * 10) / 10,
      grossIncome,
      expenses,
      bridgeInterest: monthlyBridgeInterest,
      netCashFlow,
      cumulativeCashFlow: cumulative,
      renovationDraw,
    });
  }

  return {
    months,
    totalNegativeCashFlow: totalNegative,
    monthsToBreakeven: breakevenFound ? breakevenMonth : totalMonths,
    monthsToStabilization: totalMonths,
  };
}
