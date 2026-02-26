"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAgentProductionReport, exportReportCSV } from "../actions";
import type { AgentProductionReport } from "@/lib/bms-types";
import {
  ArrowLeft,
  DollarSign,
  Users,
  TrendingUp,
  Building2,
  Download,
  Trophy,
  Hash,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function rankBadge(rank: number): string {
  if (rank === 1) return "\u{1F947}";
  if (rank === 2) return "\u{1F948}";
  if (rank === 3) return "\u{1F949}";
  return String(rank);
}

function rankBorderColor(rank: number): string {
  if (rank === 1) return "border-l-4 border-l-amber-400";
  if (rank === 2) return "border-l-4 border-l-slate-400";
  if (rank === 3) return "border-l-4 border-l-amber-600";
  return "";
}

const INPUT = "border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

type SortBy = "volume" | "deals" | "earnings";

// ── Component ─────────────────────────────────────────────────

export default function AgentProductionPage() {
  const [report, setReport] = useState<AgentProductionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [sortBy, setSortBy] = useState<SortBy>("volume");
  const [exporting, setExporting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getAgentProductionReport(startDate, endDate, sortBy);
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, sortBy]);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportReportCSV("agent_production", { startDate, endDate, sortBy });
      if (result.csv) {
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-6 w-32 bg-slate-200 animate-pulse rounded mb-6" />
        <div className="h-8 w-56 bg-slate-200 animate-pulse rounded mb-2" />
        <div className="h-5 w-72 bg-slate-100 animate-pulse rounded mb-6" />
        <div className="grid md:grid-cols-5 gap-4 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-20 bg-slate-100 animate-pulse rounded-xl mb-6" />
        <div className="h-64 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  const agents = report?.agents || [];
  const totals = report?.orgTotals || {
    totalDeals: 0,
    totalVolume: 0,
    totalCommission: 0,
    totalAgentPayouts: 0,
    totalHouseRevenue: 0,
  };
  const topAgent = agents.length > 0 ? agents[0] : null;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Back link */}
      <Link
        href="/brokerage/reports"
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent Production</h1>
          <p className="text-sm text-slate-500 mt-1">Individual agent performance and rankings</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={INPUT}
          />
          <span className="text-sm text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={INPUT}
          />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className={INPUT + " ml-1"}
          >
            <option value="volume">Sort: Volume</option>
            <option value="deals">Sort: Deals</option>
            <option value="earnings">Sort: Earnings</option>
          </select>

          <button
            onClick={handleExport}
            disabled={exporting || agents.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors ml-1"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* ── Org Totals Cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <SummaryCard
          icon={<Hash className="h-5 w-5" />}
          iconBg="bg-violet-100 text-violet-600"
          label="Total Deals"
          value={String(totals.totalDeals)}
        />
        <SummaryCard
          icon={<Building2 className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Total Volume"
          value={fmt(totals.totalVolume)}
        />
        <SummaryCard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-amber-100 text-amber-600"
          label="Total Commission"
          value={fmt(totals.totalCommission)}
        />
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          iconBg="bg-green-100 text-green-600"
          label="Agent Payouts"
          value={fmt(totals.totalAgentPayouts)}
        />
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          iconBg="bg-emerald-100 text-emerald-600"
          label="House Revenue"
          value={fmt(totals.totalHouseRevenue)}
        />
      </div>

      {/* ── Empty State ───────────────────────────────────── */}
      {agents.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center mb-8">
          <Trophy className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No agent production data in this date range</p>
          <p className="text-sm text-slate-400 mt-1">Adjust the date range or check that invoices have been marked as paid</p>
        </div>
      )}

      {/* ── Top Agent Highlight ───────────────────────────── */}
      {topAgent && (
        <div className="bg-gradient-to-r from-amber-50 to-amber-100/50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center text-lg font-bold shrink-0">
              {topAgent.agentName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900 truncate">{topAgent.agentName}</span>
                <span className="text-amber-600 text-lg">{"\u{1F947}"}</span>
              </div>
              <p className="text-sm text-slate-500">Top Producer</p>
            </div>
            <div className="hidden sm:flex items-center gap-6">
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Deals</p>
                <p className="text-lg font-bold text-slate-900">{topAgent.dealCount}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Volume</p>
                <p className="text-lg font-bold text-slate-900">{fmt(topAgent.totalVolume)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Earnings</p>
                <p className="text-lg font-bold text-green-600">{fmt(topAgent.agentEarnings)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Agent Leaderboard Table ──────────────────────── */}
      {agents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-800">Agent Leaderboard</h2>
            <span className="text-xs text-slate-400 ml-auto">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Rank</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Deals</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Volume</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Commission</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent Earnings</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">House Earnings</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Avg Deal</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">Avg Split</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => (
                  <tr
                    key={agent.agentId || agent.agentEmail}
                    className={`hover:bg-slate-50/50 transition-colors ${rankBorderColor(agent.rank)}`}
                  >
                    <td className="px-3 py-2.5 text-center text-sm">
                      <span className={agent.rank <= 3 ? "text-lg" : "text-slate-500 font-medium"}>
                        {rankBadge(agent.rank)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {agent.agentId ? (
                        <Link
                          href={`/brokerage/agents/${agent.agentId}`}
                          className="group"
                        >
                          <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                            {agent.agentName}
                          </p>
                          <p className="text-xs text-slate-400">{agent.agentEmail}</p>
                        </Link>
                      ) : (
                        <div>
                          <p className="text-sm font-medium text-slate-900">{agent.agentName}</p>
                          <p className="text-xs text-slate-400">{agent.agentEmail}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-700 font-medium">
                      {agent.dealCount}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-700 font-medium">
                      {fmt(agent.totalVolume)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-700 font-medium">
                      {fmt(agent.totalCommission)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-green-600 font-medium">
                      {fmt(agent.agentEarnings)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600 hidden lg:table-cell">
                      {fmt(agent.houseEarnings)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600 hidden lg:table-cell">
                      {fmt(agent.avgDealSize)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600 hidden lg:table-cell">
                      {agent.avgSplitPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="px-3 py-3" />
                  <td className="px-4 py-3 text-sm font-bold text-slate-900">Totals</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">
                    {totals.totalDeals}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">
                    {fmt(totals.totalVolume)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">
                    {fmt(totals.totalCommission)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-green-700">
                    {fmt(totals.totalAgentPayouts)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-900 hidden lg:table-cell">
                    {fmt(totals.totalHouseRevenue)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell" />
                  <td className="px-4 py-3 hidden lg:table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
