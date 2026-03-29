"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Zap } from "lucide-react";

// ── Props ────────────────────────────────────────────────────

interface ROICalculatorProps {
  tier: string;
  showingConversionRate: number; // 0-100
  avgRent: number | null;
  activeListingsCount: number;
  unitsLeasedThisMonth: number;
  onUpgrade?: () => void;
}

// ── Subscription costs ───────────────────────────────────────

function getSubscriptionCost(tier: string): number {
  if (tier === "pro") return 149;
  if (tier === "team") return 399;
  return 0;
}

// ── Format helpers ───────────────────────────────────────────

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ══════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════

export default function ROICalculator({
  tier,
  showingConversionRate,
  avgRent,
  activeListingsCount,
  unitsLeasedThisMonth,
  onUpgrade,
}: ROICalculatorProps) {
  // ── Editable inputs ────────────────────────────────────────

  const [monthlyRent, setMonthlyRent] = useState(avgRent || 3200);
  const [daysToLease, setDaysToLease] = useState(45);
  const [listings, setListings] = useState(Math.max(activeListingsCount, 1));
  const [showAssumptions, setShowAssumptions] = useState(false);

  // ── Calculations ───────────────────────────────────────────

  const calc = useMemo(() => {
    const vacancyCostPerDay = (monthlyRent * listings) / 30;
    const improvementRate = Math.min((showingConversionRate / 100) * 0.5, 0.40);
    const aiDaysToLease = daysToLease * (1 - improvementRate);
    const effectiveUnits = Math.max(unitsLeasedThisMonth, 1);
    const vacancyDaysSaved = (daysToLease - aiDaysToLease) * effectiveUnits;
    const monthlyValue = vacancyDaysSaved * vacancyCostPerDay;
    const subscriptionCost = getSubscriptionCost(tier);
    const roiMultiple = subscriptionCost > 0 ? monthlyValue / subscriptionCost : null;

    return { vacancyDaysSaved, monthlyValue, roiMultiple, subscriptionCost };
  }, [monthlyRent, daysToLease, listings, showingConversionRate, unitsLeasedThisMonth, tier]);

  // ── ROI card styling ───────────────────────────────────────

  let roiColor = "bg-slate-50 border-slate-200 text-slate-700";
  let roiValue = "—";

  if (tier === "free") {
    roiColor = "bg-blue-50 border-blue-200 text-blue-700";
    roiValue = "∞";
  } else if (calc.roiMultiple !== null) {
    roiValue = `${calc.roiMultiple.toFixed(1)}×`;
    if (calc.roiMultiple >= 2) {
      roiColor = "bg-emerald-50 border-emerald-200 text-emerald-700";
    } else if (calc.roiMultiple >= 1) {
      roiColor = "bg-amber-50 border-amber-200 text-amber-700";
    } else {
      roiColor = "bg-slate-50 border-slate-200 text-slate-500";
    }
  }

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════

  return (
    <div>
      {/* Three metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {/* Vacancy Days Saved */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
          <p className="text-xs font-medium text-slate-500 mb-1">Vacancy Days Saved</p>
          <p className="text-3xl font-bold text-slate-900">{calc.vacancyDaysSaved.toFixed(1)}</p>
          <p className="text-xs text-slate-400 mt-1">days</p>
        </div>

        {/* Monthly Value */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-center">
          <p className="text-xs font-medium text-slate-500 mb-1">Monthly Value</p>
          <p className="text-3xl font-bold text-slate-900">${formatCurrency(calc.monthlyValue)}</p>
          <p className="text-xs text-slate-400 mt-1">estimated savings</p>
        </div>

        {/* ROI */}
        <div className={`rounded-xl p-5 text-center border ${roiColor}`}>
          <p className="text-xs font-medium opacity-80 mb-1">ROI</p>
          <div className="relative inline-block">
            <p className="text-3xl font-bold">{roiValue}</p>
            {tier === "free" && (
              <span className="absolute -top-1 -right-6 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                Free
              </span>
            )}
          </div>
          <p className="text-xs opacity-60 mt-1">
            {tier === "free" ? "free plan" : `vs $${calc.subscriptionCost}/mo`}
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[11px] text-slate-400 text-center mb-4">
        Estimates based on your conversation data and NYC market benchmarks. Actual results vary.
      </p>

      {/* Free tier CTA */}
      {tier === "free" && (
        <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
          <p className="text-sm text-blue-800">
            At your current inquiry volume, Pro would pay for itself in under a month.
          </p>
          <button
            onClick={onUpgrade}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors ml-4"
          >
            <Zap className="w-3.5 h-3.5" />
            Upgrade to Pro
          </button>
        </div>
      )}

      {/* Collapsible assumptions */}
      <button
        onClick={() => setShowAssumptions(!showAssumptions)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        {showAssumptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Edit assumptions
      </button>

      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: showAssumptions ? "200px" : "0px", opacity: showAssumptions ? 1 : 0 }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Avg Monthly Rent</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input
                type="number"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(Math.max(0, parseInt(e.target.value) || 0))}
                min={0}
                max={50000}
                className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Days to Lease (without AI)</label>
            <input
              type="number"
              value={daysToLease}
              onChange={(e) => setDaysToLease(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={365}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Active Listings</label>
            <input
              type="number"
              value={listings}
              onChange={(e) => setListings(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={500}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
