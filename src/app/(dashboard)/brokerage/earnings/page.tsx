"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getEarningsSummary } from "./actions";
import type { EarningsSummary, EarningsPeriod } from "./actions";
import {
  DollarSign,
  Clock,
  TrendingUp,
  BarChart3,
  ArrowUpRight,
  ChevronRight,
  Wallet,
  Receipt,
  Target,
  Briefcase,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
};

const PERIOD_LABELS: Record<EarningsPeriod, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
  year: "This Year",
  all: "All Time",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  invoiced: "Invoiced",
  paid: "Paid",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  invoiced: "bg-purple-100 text-purple-700",
  paid: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const DEAL_TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  lease: "Lease",
  rental: "Rental",
  commercial_sale: "Commercial Sale",
  commercial_lease: "Commercial Lease",
};

// ── Chart Component ─────────────────────────────────────────

function EarningsChart({ data, maxHeight = 140 }: { data: EarningsSummary["earningsByPeriod"]; maxHeight?: number }) {
  const maxEarned = Math.max(...data.map((d) => d.earned), 1);
  const hasData = data.some((d) => d.earned > 0);

  return (
    <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: maxHeight }} role="img" aria-label="Earnings over time chart">
      {data.map((item, i) => {
        const pct = (item.earned / maxEarned) * 100;
        const barHeight = hasData ? Math.max(pct, 2) : 0;
        const isLast = i === data.length - 1;

        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
              <div className="bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                <div className="font-medium">{fmt(item.earned)}</div>
                <div className="text-slate-400">{item.deals} deal{item.deals !== 1 ? "s" : ""}</div>
              </div>
            </div>

            {/* Bar */}
            <div className="w-full flex items-end justify-center" style={{ height: maxHeight - 20 }}>
              <div
                aria-label={`${item.label}: ${fmt(item.earned)} from ${item.deals} deal${item.deals !== 1 ? "s" : ""}`}
                className={`w-full max-w-[32px] rounded-t-md transition-all duration-300 ${
                  isLast ? "bg-green-500" : item.earned > 0 ? "bg-blue-500" : "bg-slate-200"
                } group-hover:opacity-80`}
                style={{ height: `${barHeight}%`, minHeight: item.earned > 0 ? 4 : 2 }}
              />
            </div>

            {/* Label */}
            <span className="text-[10px] text-slate-400 truncate w-full text-center">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function AgentEarningsPage() {
  const [data, setData] = useState<EarningsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<EarningsPeriod>("month");
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (p: EarningsPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getEarningsSummary(p);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load earnings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(period);
  }, [period, loadData]);

  function handlePeriodChange(p: EarningsPeriod) {
    setPeriod(p);
  }

  // ── Loading ────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-48 bg-slate-100 rounded-2xl" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-24 bg-slate-100 rounded-xl" />
            <div className="h-24 bg-slate-100 rounded-xl" />
          </div>
          <div className="h-48 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Wallet className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium mb-4">{error}</p>
        <button
          onClick={() => loadData(period)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8 space-y-4 pb-safe">

      {/* ── Hero: Balance Card ──────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
        </div>

        <div className="relative">
          {/* Greeting */}
          <p className="text-sm text-slate-400 mb-1">
            {data.agentName ? `${data.agentName}'s Earnings` : "Your Earnings"}
          </p>

          {/* Big number — Total Earned */}
          <div className="mb-5">
            <div className="text-4xl sm:text-5xl font-bold tracking-tight mb-1">
              {fmt(data.totalEarned)}
            </div>
            <p className="text-sm text-slate-400">Total earned</p>
          </div>

          {/* Pending + This Month */}
          <div className="flex gap-6">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wider">Pending</span>
              </div>
              <span className="text-xl font-semibold text-amber-300">
                {fmt(data.pendingPayout)}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wider">This Month</span>
              </div>
              <span className="text-xl font-semibold text-green-300">
                {fmt(data.thisMonthEarned)}
              </span>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5 mb-0.5">
                <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs text-slate-400 uppercase tracking-wider">This Week</span>
              </div>
              <span className="text-xl font-semibold text-blue-300">
                {fmt(data.thisWeekEarned)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Period Selector (pill tabs) ────────────────────── */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar" role="tablist">
        {(["week", "month", "quarter", "year", "all"] as EarningsPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePeriodChange(p)}
            role="tab"
            aria-selected={period === p}
            aria-label={`View earnings for ${PERIOD_LABELS[p].toLowerCase()}`}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
              period === p
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* ── Period Stats Grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-green-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Earned</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{fmtCompact(data.periodEarned)}</div>
          <p className="text-xs text-slate-400 mt-0.5">{PERIOD_LABELS[period].toLowerCase()}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-100 rounded-lg">
              <Briefcase className="h-4 w-4 text-blue-600" />
            </div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Deals</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{data.periodDeals}</div>
          <p className="text-xs text-slate-400 mt-0.5">{PERIOD_LABELS[period].toLowerCase()}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-purple-100 rounded-lg">
              <Target className="h-4 w-4 text-purple-600" />
            </div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Avg Deal</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{fmtCompact(data.periodAvgDeal)}</div>
          <p className="text-xs text-slate-400 mt-0.5">deal size</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <Receipt className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Volume</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{fmtCompact(data.periodVolume)}</div>
          <p className="text-xs text-slate-400 mt-0.5">total volume</p>
        </div>
      </div>

      {/* ── Earnings Chart ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800">Earnings Over Time</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Past
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Current
            </span>
          </div>
        </div>
        <EarningsChart data={data.earningsByPeriod} />
      </div>

      {/* ── Deal Pipeline Summary ──────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Deal Status</h3>
        <div className="flex items-center gap-3">
          {[
            { label: "Submitted", count: data.submittedCount, color: "bg-blue-500" },
            { label: "Pending Payout", count: data.pendingCount, color: "bg-amber-500" },
            { label: "Paid", count: data.paidCount, color: "bg-green-500" },
          ].map((item) => (
            <div key={item.label} className="flex-1 text-center">
              <div className={`mx-auto w-10 h-10 rounded-full ${item.color} flex items-center justify-center mb-1.5`}>
                <span className="text-sm font-bold text-white">{item.count}</span>
              </div>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {(data.paidCount + data.pendingCount + data.submittedCount) > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden mt-4 bg-slate-100">
            {data.paidCount > 0 && (
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(data.paidCount / (data.paidCount + data.pendingCount + data.submittedCount)) * 100}%` }}
              />
            )}
            {data.pendingCount > 0 && (
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${(data.pendingCount / (data.paidCount + data.pendingCount + data.submittedCount)) * 100}%` }}
              />
            )}
            {data.submittedCount > 0 && (
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${(data.submittedCount / (data.paidCount + data.pendingCount + data.submittedCount)) * 100}%` }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Recent Deals ───────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Recent Deals</h3>
          <Link
            href="/brokerage/my-deals"
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {data.recentDeals.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Briefcase className="h-10 w-10 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No deals yet</p>
            <Link
              href="/brokerage/my-deals/submit"
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              Submit Your First Deal
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {data.recentDeals.map((deal) => (
              <Link
                key={deal.id}
                href="/brokerage/my-deals"
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  deal.status === "paid" ? "bg-green-500" :
                  deal.status === "invoiced" || deal.status === "approved" ? "bg-amber-500" :
                  deal.status === "rejected" ? "bg-red-500" :
                  "bg-blue-500"
                }`} />

                {/* Deal info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {deal.address}{deal.unit ? ` ${deal.unit}` : ""}
                    </p>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${STATUS_COLORS[deal.status] || "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABELS[deal.status] || deal.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {DEAL_TYPE_LABELS[deal.dealType] || deal.dealType}
                    {deal.clientName ? ` · ${deal.clientName}` : ""}
                  </p>
                </div>

                {/* Payout amount */}
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold ${
                    deal.status === "paid" ? "text-green-600" :
                    deal.status === "rejected" ? "text-slate-400 line-through" :
                    "text-slate-800"
                  }`}>
                    {deal.status === "rejected" ? fmt(deal.agentPayout) : `+${fmt(deal.agentPayout)}`}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {fmtFull(deal.totalCommission)} total
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick Info ─────────────────────────────────────── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Your default split</p>
            <p className="text-lg font-bold text-slate-800">
              <span className="text-green-600">{data.defaultSplit}%</span>
              <span className="text-slate-300 mx-1">/</span>
              <span className="text-blue-600">{100 - data.defaultSplit}%</span>
            </p>
          </div>
          <Link
            href="/brokerage/my-deals/submit"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Submit Deal
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
