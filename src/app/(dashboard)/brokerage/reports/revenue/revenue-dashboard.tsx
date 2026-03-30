"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getAgentEarningsReport,
  getRevenuePipeline,
  getRevenueByMonth,
  get1099Data,
} from "./actions";
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Building2,
  Download,
  BarChart3,
  FileText,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Clock,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────

interface AgentEarning {
  agentId: string;
  agentName: string;
  agentEmail: string;
  dealCount: number;
  totalCommission: number;
  totalAgentPayout: number;
  totalHousePayout: number;
  paidOut: number;
  pendingPayout: number;
  avgDealSize: number;
  totalTransactionValue: number;
  dealsByType: Record<string, number>;
  dealsByExclusive: { exclusive: number; coBroke: number };
}

interface OrgTotals {
  totalCommission: number;
  totalAgentPayout: number;
  totalHousePayout: number;
  paidOut: number;
  pendingPayout: number;
  totalDeals: number;
  totalTransactionValue: number;
  avgDealSize: number;
}

interface PipelineStage {
  count: number;
  totalCommission: number;
  totalAgentPayout: number;
  totalHousePayout: number;
}

interface PipelineData {
  stages: Record<string, PipelineStage>;
  totalRevenueCollected: number;
  totalAgentPayoutsCompleted: number;
  pendingInvoicing: number;
  pendingPayment: number;
}

interface MonthEntry {
  month: number;
  label: string;
  totalCommission: number;
  houseRevenue: number;
  agentPayouts: number;
  dealCount: number;
}

interface Agent1099 {
  agentId: string;
  agentName: string;
  agentEmail: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  w9OnFile: boolean;
  totalPaid: number;
  dealCount: number;
  meetsThreshold: boolean;
}

interface Summary1099 {
  year: number;
  totalAgents: number;
  agentsAboveThreshold: number;
  agentsBelowThreshold: number;
  totalPaidOut: number;
  missingW9Count: number;
}

interface Props {
  initialEarnings: { agents: AgentEarning[]; orgTotals: OrgTotals | null };
  initialPipeline: PipelineData | null;
  initialMonthly: MonthEntry[];
  canView1099: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const pct = (n: number) => `${n.toFixed(1)}%`;

type SortKey = "agentName" | "dealCount" | "totalCommission" | "totalAgentPayout" | "totalHousePayout" | "paidOut" | "pendingPayout" | "avgDealSize";

// ── Main Component ────────────────────────────────────────────

export default function RevenueDashboard({
  initialEarnings,
  initialPipeline,
  initialMonthly,
  canView1099,
}: Props) {
  // State
  const [earnings, setEarnings] = useState(initialEarnings);
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [monthly, setMonthly] = useState(initialMonthly);
  const [monthlyYear, setMonthlyYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("totalAgentPayout");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // 1099 section
  const [show1099, setShow1099] = useState(false);
  const [data1099, setData1099] = useState<{ agents: Agent1099[]; summary: Summary1099 | null } | null>(null);
  const [year1099, setYear1099] = useState(new Date().getFullYear());
  const [loading1099, setLoading1099] = useState(false);

  // ── Load monthly on year change ─────────────────────────────

  const loadMonthly = useCallback(async (year: number) => {
    setLoading(true);
    try {
      const data = await getRevenueByMonth(year);
      setMonthly(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (monthlyYear !== new Date().getFullYear()) {
      loadMonthly(monthlyYear);
    }
  }, [monthlyYear, loadMonthly]);

  // ── Load 1099 data ──────────────────────────────────────────

  const load1099 = useCallback(async (year: number) => {
    setLoading1099(true);
    try {
      const data = await get1099Data(year);
      setData1099(data);
    } catch {
      setData1099(null);
    } finally {
      setLoading1099(false);
    }
  }, []);

  useEffect(() => {
    if (show1099) {
      load1099(year1099);
    }
  }, [show1099, year1099, load1099]);

  // ── Sorting ─────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedAgents = [...(earnings.agents || [])].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    const aNum = Number(aVal) || 0;
    const bNum = Number(bVal) || 0;
    return sortDir === "asc" ? aNum - bNum : bNum - aNum;
  });

  // ── CSV Export: Earnings ────────────────────────────────────

  function exportEarningsCSV() {
    const header = ["Rank", "Agent", "Email", "Deals", "Total Commission", "Agent Payout", "House Payout", "Paid Out", "Pending", "Avg Deal Size"];
    const rows = sortedAgents.map((a, i) => [
      i + 1,
      a.agentName,
      a.agentEmail,
      a.dealCount,
      fmtFull(a.totalCommission),
      fmtFull(a.totalAgentPayout),
      fmtFull(a.totalHousePayout),
      fmtFull(a.paidOut),
      fmtFull(a.pendingPayout),
      fmtFull(a.avgDealSize),
    ]);
    downloadCSV([header, ...rows], "agent-earnings-report.csv");
  }

  // ── CSV Export: 1099 ────────────────────────────────────────

  function export1099CSV() {
    if (!data1099?.agents) return;
    const header = ["Agent", "Email", "Address", "City", "State", "ZIP", "Total Paid", "Deals", "W-9 On File", "Meets $600 Threshold"];
    const rows = data1099.agents
      .filter((a) => a.meetsThreshold)
      .map((a) => [
        a.agentName,
        a.agentEmail,
        a.address,
        a.city,
        a.state,
        a.zipCode,
        fmtFull(a.totalPaid),
        a.dealCount,
        a.w9OnFile ? "Yes" : "No",
        a.meetsThreshold ? "Yes" : "No",
      ]);
    downloadCSV([header, ...rows], `1099-report-${year1099}.csv`);
  }

  // ── Derived values ──────────────────────────────────────────

  const totals = earnings.orgTotals;
  const stages = pipeline?.stages;
  const maxMonthly = Math.max(...monthly.map((m) => m.agentPayouts + m.houseRevenue), 1);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/brokerage/reports"
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Revenue Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Commission revenue, agent payouts, and financial overview</p>
      </div>

      {/* ── Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Total Commission"
          value={fmt(totals?.totalCommission || 0)}
        />
        <SummaryCard
          icon={<Building2 className="h-5 w-5" />}
          iconBg="bg-emerald-100 text-emerald-600"
          label="Brokerage Revenue"
          value={fmt(totals?.totalHousePayout || 0)}
          valueColor="text-emerald-700"
          highlight
        />
        <SummaryCard
          icon={<TrendingUp className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Agent Payouts"
          value={fmt(totals?.totalAgentPayout || 0)}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5" />}
          iconBg={(totals?.pendingPayout || 0) > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}
          label="Pending Payouts"
          value={fmt(totals?.pendingPayout || 0)}
          valueColor={(totals?.pendingPayout || 0) > 0 ? "text-amber-700" : undefined}
          highlight={(totals?.pendingPayout || 0) > 0}
          highlightColor="border-amber-300"
        />
      </div>

      {/* ── Revenue Pipeline ──────────────────────────────── */}
      {stages && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Revenue Pipeline</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {(["submitted", "approved", "invoiced", "paid"] as const).map((stage, i) => {
              const data = stages[stage];
              if (!data) return null;
              const colors = [
                "border-l-slate-400 bg-slate-50",
                "border-l-blue-400 bg-blue-50",
                "border-l-amber-400 bg-amber-50",
                "border-l-emerald-400 bg-emerald-50",
              ];
              const labels = ["Submitted", "Approved", "Invoiced", "Paid"];
              return (
                <div
                  key={stage}
                  className={`border-l-4 rounded-lg p-4 ${colors[i]}`}
                >
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{labels[i]}</p>
                  <p className="text-lg font-bold text-slate-900">{fmt(data.totalCommission)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {data.count} deal{data.count !== 1 ? "s" : ""}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Pipeline summary row */}
          <div className="flex flex-wrap gap-4 text-sm border-t border-slate-100 pt-4">
            <span className="text-slate-500">
              Revenue collected: <strong className="text-emerald-700">{fmt(pipeline.totalRevenueCollected)}</strong>
            </span>
            <span className="text-slate-500">
              Agent payouts completed: <strong className="text-blue-700">{fmt(pipeline.totalAgentPayoutsCompleted)}</strong>
            </span>
            <span className="text-slate-500">
              Pending invoicing: <strong className="text-amber-700">{fmt(pipeline.pendingInvoicing)}</strong>
            </span>
            <span className="text-slate-500">
              Pending payment: <strong className="text-amber-700">{fmt(pipeline.pendingPayment)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* ── Monthly Revenue Chart ─────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Monthly Revenue</h2>

          {/* Year selector */}
          <select
            value={monthlyYear}
            onChange={(e) => setMonthlyYear(Number(e.target.value))}
            className="ml-auto border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Legend */}
          <div className="flex items-center gap-4 ml-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-500" />
              <span className="text-xs text-slate-500">Agent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-indigo-500" />
              <span className="text-xs text-slate-500">House</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 min-w-0" style={{ minHeight: 200 }}>
              {monthly.map((m) => {
                const total = m.agentPayouts + m.houseRevenue;
                const agentH = maxMonthly > 0 ? (m.agentPayouts / maxMonthly) * 180 : 0;
                const houseH = maxMonthly > 0 ? (m.houseRevenue / maxMonthly) * 180 : 0;
                return (
                  <div
                    key={m.month}
                    className="flex-1 min-w-[40px] flex flex-col items-center"
                  >
                    {/* Stacked bars */}
                    <div className="flex flex-col items-center w-full justify-end" style={{ height: 180 }}>
                      <div
                        className="bg-indigo-500 rounded-t-sm w-full max-w-[28px] transition-all"
                        style={{ height: Math.max(houseH, total > 0 ? 2 : 0) }}
                        title={`House: ${fmtFull(m.houseRevenue)}`}
                      />
                      <div
                        className="bg-blue-500 w-full max-w-[28px] transition-all"
                        style={{ height: Math.max(agentH, total > 0 ? 2 : 0) }}
                        title={`Agent: ${fmtFull(m.agentPayouts)}`}
                      />
                    </div>

                    {/* Month label */}
                    <span className="text-[10px] text-slate-400 mt-1.5 text-center">
                      {m.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Agent Earnings Table ──────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Agent Earnings</h2>
          <button
            onClick={exportEarningsCSV}
            disabled={sortedAgents.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {sortedAgents.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No agent earnings data</p>
            <p className="text-sm text-slate-400 mt-1">Approved, invoiced, or paid deals will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-10">#</th>
                  <SortableHeader label="Agent" sortKey="agentName" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Deals" sortKey="dealCount" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Commission" sortKey="totalCommission" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Agent Payout" sortKey="totalAgentPayout" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="House Payout" sortKey="totalHousePayout" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Paid Out" sortKey="paidOut" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Pending" sortKey="pendingPayout" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Avg Deal" sortKey="avgDealSize" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAgents.map((agent, i) => {
                  const rank = i + 1;
                  const medal = rank === 1 ? "\uD83E\uDD47" : rank === 2 ? "\uD83E\uDD48" : rank === 3 ? "\uD83E\uDD49" : String(rank);
                  return (
                    <tr key={agent.agentId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-center">{medal}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-medium text-slate-900">{agent.agentName}</div>
                        <div className="text-xs text-slate-400">{agent.agentEmail}</div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-slate-700 font-medium">{agent.dealCount}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-slate-700 font-medium">{fmt(agent.totalCommission)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-blue-600 font-medium">{fmt(agent.totalAgentPayout)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-emerald-600 font-medium">{fmt(agent.totalHousePayout)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-green-600 font-medium">{fmt(agent.paidOut)}</td>
                      <td className={`px-4 py-2.5 text-sm text-right font-medium ${agent.pendingPayout > 0 ? "text-amber-600" : "text-slate-400"}`}>
                        {fmt(agent.pendingPayout)}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-slate-600">{fmt(agent.avgDealSize)}</td>
                    </tr>
                  );
                })}

                {/* Org Totals footer */}
                {totals && (
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-sm font-bold text-slate-900">Org Total</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">{totals.totalDeals}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">{fmt(totals.totalCommission)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-blue-700">{fmt(totals.totalAgentPayout)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-emerald-700">{fmt(totals.totalHousePayout)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-green-700">{fmt(totals.paidOut)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-amber-700">{fmt(totals.pendingPayout)}</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">{fmt(totals.avgDealSize)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 1099 Section ──────────────────────────────────── */}
      {canView1099 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-8">
          <button
            onClick={() => setShow1099(!show1099)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">1099 Tax Reporting</h2>
            </div>
            {show1099 ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {show1099 && (
            <div className="border-t border-slate-100">
              {/* Warning notice */}
              <div className="mx-5 mt-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">IRS Reporting Requirement</p>
                    <p className="text-xs text-yellow-700 mt-1">
                      You must file a 1099-NEC for each independent contractor paid $600 or more during the tax year. Ensure W-9 forms are on file before filing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Year selector + export */}
              <div className="flex items-center justify-between px-5 mb-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-600">Tax Year:</label>
                  <select
                    value={year1099}
                    onChange={(e) => setYear1099(Number(e.target.value))}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={export1099CSV}
                  disabled={!data1099?.agents?.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export 1099 CSV
                </button>
              </div>

              {/* Summary */}
              {data1099?.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 mb-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Total Agents</p>
                    <p className="text-lg font-bold text-slate-900">{data1099.summary.totalAgents}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Above $600</p>
                    <p className="text-lg font-bold text-slate-900">{data1099.summary.agentsAboveThreshold}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Total Paid Out</p>
                    <p className="text-lg font-bold text-slate-900">{fmt(data1099.summary.totalPaidOut)}</p>
                  </div>
                  <div className={`rounded-lg p-3 ${data1099.summary.missingW9Count > 0 ? "bg-red-50" : "bg-green-50"}`}>
                    <p className="text-xs text-slate-500">Missing W-9</p>
                    <p className={`text-lg font-bold ${data1099.summary.missingW9Count > 0 ? "text-red-700" : "text-green-700"}`}>
                      {data1099.summary.missingW9Count}
                    </p>
                  </div>
                </div>
              )}

              {/* Loading */}
              {loading1099 && (
                <div className="py-8 flex items-center justify-center">
                  <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Table */}
              {!loading1099 && data1099?.agents && data1099.agents.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-t border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Total Paid</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Deals</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">W-9</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">1099 Required</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data1099.agents
                        .filter((a) => a.meetsThreshold)
                        .map((agent) => (
                          <tr key={agent.agentId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{agent.agentName}</td>
                            <td className="px-4 py-2.5 text-sm text-slate-500">{agent.agentEmail}</td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium text-slate-700">{fmt(agent.totalPaid)}</td>
                            <td className="px-4 py-2.5 text-sm text-right text-slate-600">{agent.dealCount}</td>
                            <td className="px-4 py-2.5 text-sm text-center">
                              {agent.w9OnFile ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Yes</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Missing</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-center">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Yes</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Empty state */}
              {!loading1099 && (!data1099?.agents || data1099.agents.filter((a) => a.meetsThreshold).length === 0) && (
                <div className="py-12 text-center">
                  <FileText className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No agents meet the $600 threshold for {year1099}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-Components ────────────────────────────────────────────

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
  valueColor,
  highlight,
  highlightColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
  highlight?: boolean;
  highlightColor?: string;
}) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${highlight ? (highlightColor || "border-emerald-300") : "border-slate-200"}`}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueColor || "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey: key,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = currentKey === key;

  return (
    <th
      className={`px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentDir === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ── CSV Download Utility ──────────────────────────────────────

function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? "");
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
