"use client";

import { useState, useMemo } from "react";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  AlertTriangle,
} from "lucide-react";
import { getAgentEarningsReport, getRevenueByMonth, get1099Data } from "./actions";

// ── Types ───────────────────────────────────────────────────

interface AgentEarningsRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  licenseNumber: string;
  address: string;
  dealCount: number;
  totalCommission: number;
  totalAgentPayout: number;
  totalHousePayout: number;
  paidOut: number;
  pendingPayout: number;
  avgDealSize: number;
  dealsByType: Record<string, number>;
  dealsByExclusive: Record<string, number>;
}

interface OrgTotals {
  totalDeals: number;
  totalCommission: number;
  totalAgentPayout: number;
  totalHousePayout: number;
  totalPaidOut: number;
  totalPending: number;
}

interface PipelineData {
  pipeline: Record<string, { count: number; totalCommission: number; totalAgentPayout: number; totalHousePayout: number }>;
  totalRevenueCollected: number;
  totalAgentPayoutsCompleted: number;
  pendingInvoicing: number;
  pendingPayment: number;
}

interface MonthlyRow {
  month: number;
  monthLabel: string;
  totalCommission: number;
  houseRevenue: number;
  agentPayouts: number;
  dealCount: number;
}

interface Agent1099Row {
  agentId: string;
  agentName: string;
  agentEmail: string;
  agentLicense: string;
  agentAddress: string;
  totalEarnings: number;
  invoiceCount: number;
  firstPaymentDate: string | null;
  lastPaymentDate: string | null;
  isAbove600: boolean;
}

interface Props {
  initialEarnings: { agents: AgentEarningsRow[]; orgTotals: OrgTotals } | Record<string, unknown>;
  initialPipeline: PipelineData | Record<string, unknown>;
  initialMonthly: MonthlyRow[];
}

// ── Helpers ─────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD_SHORT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function rankMedal(rank: number): string {
  if (rank === 1) return "\u{1F947}";
  if (rank === 2) return "\u{1F948}";
  if (rank === 3) return "\u{1F949}";
  return `#${rank}`;
}

const PIPELINE_STAGES = ["submitted", "approved", "invoiced", "paid"];
const PIPELINE_LABELS: Record<string, string> = { submitted: "Submitted", approved: "Approved", invoiced: "Invoiced", paid: "Paid" };
const PIPELINE_COLORS: Record<string, string> = {
  submitted: "bg-blue-50 border-blue-200 text-blue-700",
  approved: "bg-green-50 border-green-200 text-green-700",
  invoiced: "bg-purple-50 border-purple-200 text-purple-700",
  paid: "bg-emerald-50 border-emerald-300 text-emerald-800",
};

const currentYear = new Date().getFullYear();

// ── Component ───────────────────────────────────────────────

export default function RevenueDashboard({ initialEarnings, initialPipeline, initialMonthly }: Props) {
  const earnings = initialEarnings as { agents: AgentEarningsRow[]; orgTotals: OrgTotals };
  const pipeline = initialPipeline as PipelineData;

  const [monthly, setMonthly] = useState<MonthlyRow[]>(initialMonthly);
  const [chartYear, setChartYear] = useState(currentYear);
  const [sortCol, setSortCol] = useState<string>("totalAgentPayout");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [show1099, setShow1099] = useState(false);
  const [tax1099Data, setTax1099Data] = useState<{ agents: Agent1099Row[]; summary: { totalAgents: number; agentsAboveThreshold: number; totalPaid: number } } | null>(null);
  const [tax1099Year, setTax1099Year] = useState(currentYear);
  const [loading1099, setLoading1099] = useState(false);

  // Summary cards from pipeline
  const paidStage = pipeline.pipeline?.paid ?? { count: 0, totalCommission: 0, totalAgentPayout: 0, totalHousePayout: 0 };
  const totalCommissionPaid = paidStage.totalCommission;
  const brokerageRevenue = paidStage.totalHousePayout;
  const agentPayoutsPaid = paidStage.totalAgentPayout;
  const pendingPayouts = (pipeline.pipeline?.approved?.totalAgentPayout ?? 0) + (pipeline.pipeline?.invoiced?.totalAgentPayout ?? 0);

  // Sorted agents
  const sortedAgents = useMemo(() => {
    const sorted = [...earnings.agents];
    sorted.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortCol] as number ?? 0;
      const bVal = (b as Record<string, unknown>)[sortCol] as number ?? 0;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [earnings.agents, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Chart
  const maxMonthly = useMemo(() => Math.max(...monthly.map((m) => m.totalCommission), 1), [monthly]);

  const handleChartYearChange = async (y: number) => {
    setChartYear(y);
    const result = await getRevenueByMonth(y);
    if (result.success && result.data) setMonthly(result.data);
  };

  // 1099
  const load1099 = async (y: number) => {
    setLoading1099(true);
    setTax1099Year(y);
    const result = await get1099Data(y);
    if (result.success && result.data) {
      setTax1099Data(result.data as typeof tax1099Data);
    }
    setLoading1099(false);
  };

  const handle1099Toggle = () => {
    if (!show1099 && !tax1099Data) load1099(tax1099Year);
    setShow1099(!show1099);
  };

  // CSV Export
  const exportAgentsCSV = () => {
    const headers = ["Rank", "Agent", "Email", "License", "Address", "Deals", "Total Commission", "Agent Payout", "House Revenue", "Pending", "Avg Deal"];
    const rows = sortedAgents.map((a, i) => [
      i + 1, a.agentName, a.agentEmail, a.licenseNumber, `"${a.address}"`, a.dealCount,
      a.totalCommission.toFixed(2), a.totalAgentPayout.toFixed(2), a.totalHousePayout.toFixed(2),
      a.pendingPayout.toFixed(2), a.avgDealSize.toFixed(2),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-earnings-${chartYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const export1099CSV = () => {
    if (!tax1099Data) return;
    const headers = ["Agent", "Email", "License", "Address", "Total Earnings", "Deals", "First Payment", "Last Payment", "Above $600"];
    const rows = tax1099Data.agents.filter((a) => a.isAbove600).map((a) => [
      a.agentName, a.agentEmail, a.agentLicense, `"${a.agentAddress}"`, a.totalEarnings.toFixed(2),
      a.invoiceCount, a.firstPaymentDate ?? "", a.lastPaymentDate ?? "", a.isAbove600 ? "Yes" : "No",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `1099-data-${tax1099Year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <h1 className="text-xl font-semibold text-slate-900">Revenue &amp; Agent Earnings</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ── Summary Cards ──────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard icon={<DollarSign className="w-5 h-5 text-slate-400" />} label="Total Commission" value={USD.format(totalCommissionPaid)} />
          <SummaryCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} label="Brokerage Revenue" value={USD.format(brokerageRevenue)} highlight="emerald" />
          <SummaryCard icon={<Receipt className="w-5 h-5 text-blue-500" />} label="Agent Payouts" value={USD.format(agentPayoutsPaid)} />
          <SummaryCard icon={<Clock className="w-5 h-5 text-amber-500" />} label="Pending Payouts" value={USD.format(pendingPayouts)} highlight={pendingPayouts > 0 ? "amber" : undefined} />
        </div>

        {/* ── Revenue Pipeline ────────────────────────────── */}
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Revenue Pipeline</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {PIPELINE_STAGES.map((stage, i) => {
              const s = pipeline.pipeline?.[stage] ?? { count: 0, totalCommission: 0 };
              const isPaid = stage === "paid";
              return (
                <div key={stage} className="flex items-center">
                  <div className={`flex-1 rounded-lg border p-4 ${PIPELINE_COLORS[stage]} ${isPaid ? "ring-2 ring-emerald-300" : ""}`}>
                    <div className="text-xs font-medium opacity-75">{PIPELINE_LABELS[stage]}</div>
                    <div className={`text-lg font-bold ${isPaid ? "" : ""}`}>{USD_SHORT.format(s.totalCommission)}</div>
                    <div className="text-xs opacity-60">{s.count} deal{s.count !== 1 ? "s" : ""}</div>
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0 hidden lg:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Monthly Revenue Chart ──────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Monthly Revenue</h2>
            <select
              value={chartYear}
              onChange={(e) => handleChartYearChange(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {/* CSS bar chart */}
          <div className="flex items-end gap-2 h-48">
            {monthly.map((m) => {
              const pct = maxMonthly > 0 ? (m.totalCommission / maxMonthly) * 100 : 0;
              const housePct = m.totalCommission > 0 ? (m.houseRevenue / m.totalCommission) * 100 : 0;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full relative" style={{ height: `${Math.max(pct, 2)}%` }}>
                    <div className="absolute inset-0 rounded-t-sm bg-blue-500" />
                    <div className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-indigo-600" style={{ height: `${housePct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400">{m.monthLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500" /> Agent Payouts</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-600" /> Brokerage Revenue</span>
          </div>
        </div>

        {/* ── Agent Earnings Table ────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Agent Earnings</h2>
            <button onClick={exportAgentsCSV} className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500 w-12">Rank</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Agent</th>
                  <SortableHeader label="Deals" col="dealCount" current={sortCol} dir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Total Commission" col="totalCommission" current={sortCol} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Agent Payout" col="totalAgentPayout" current={sortCol} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="House Revenue" col="totalHousePayout" current={sortCol} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Pending" col="pendingPayout" current={sortCol} dir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Avg Deal" col="avgDealSize" current={sortCol} dir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((a, i) => (
                  <tr key={a.agentId} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-center text-sm">{rankMedal(i + 1)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{a.agentName}</div>
                      <div className="text-xs text-slate-400">{a.agentEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-center">{a.dealCount}</td>
                    <td className="px-4 py-3 text-slate-900 text-right font-medium">{USD.format(a.totalCommission)}</td>
                    <td className="px-4 py-3 text-emerald-700 text-right font-medium">{USD.format(a.totalAgentPayout)}</td>
                    <td className="px-4 py-3 text-slate-700 text-right">{USD.format(a.totalHousePayout)}</td>
                    <td className="px-4 py-3 text-right">
                      {a.pendingPayout > 0 ? (
                        <span className="text-amber-600 font-medium">{USD.format(a.pendingPayout)}</span>
                      ) : (
                        <span className="text-slate-300">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-right">{USD.format(a.avgDealSize)}</td>
                  </tr>
                ))}
                {/* Org Totals */}
                {earnings.orgTotals && (
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-slate-900">Org Totals</td>
                    <td className="px-4 py-3 text-slate-700 text-center">{earnings.orgTotals.totalDeals}</td>
                    <td className="px-4 py-3 text-slate-900 text-right">{USD.format(earnings.orgTotals.totalCommission)}</td>
                    <td className="px-4 py-3 text-emerald-700 text-right">{USD.format(earnings.orgTotals.totalAgentPayout)}</td>
                    <td className="px-4 py-3 text-slate-700 text-right">{USD.format(earnings.orgTotals.totalHousePayout)}</td>
                    <td className="px-4 py-3 text-amber-600 text-right">{USD.format(earnings.orgTotals.totalPending)}</td>
                    <td className="px-4 py-3 text-slate-600 text-right">--</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {sortedAgents.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">No agent earnings data for this period</div>
          )}
        </div>

        {/* ── 1099 Quick View ────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button onClick={handle1099Toggle} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">1099 Tax Prep</h2>
            {show1099 ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </button>
          {show1099 && (
            <div className="px-6 pb-6 border-t border-slate-100 pt-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800">
                  Agents earning $600+ in a calendar year require IRS Form 1099-NEC.
                </p>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <select
                  value={tax1099Year}
                  onChange={(e) => load1099(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                {tax1099Data && (
                  <button onClick={export1099CSV} className="inline-flex items-center gap-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Export 1099 Data
                  </button>
                )}
              </div>

              {loading1099 ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg animate-shimmer" />)}
                </div>
              ) : tax1099Data ? (
                <>
                  <div className="text-xs text-slate-500 mb-2">
                    {tax1099Data.summary.agentsAboveThreshold} of {tax1099Data.summary.totalAgents} agents above $600 threshold
                    &mdash; Total paid: {USD.format(tax1099Data.summary.totalPaid)}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left">
                          <th className="px-3 py-2 font-medium text-slate-500">Agent</th>
                          <th className="px-3 py-2 font-medium text-slate-500 hidden md:table-cell">Email</th>
                          <th className="px-3 py-2 font-medium text-slate-500 hidden lg:table-cell">License</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right">Earnings</th>
                          <th className="px-3 py-2 font-medium text-slate-500 text-right hidden sm:table-cell">Deals</th>
                          <th className="px-3 py-2 font-medium text-slate-500 hidden md:table-cell">First Pmt</th>
                          <th className="px-3 py-2 font-medium text-slate-500 hidden md:table-cell">Last Pmt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tax1099Data.agents
                          .filter((a) => a.isAbove600)
                          .map((a) => (
                            <tr key={a.agentId} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-3 py-2 font-medium text-slate-900">{a.agentName}</td>
                              <td className="px-3 py-2 text-slate-600 hidden md:table-cell">{a.agentEmail}</td>
                              <td className="px-3 py-2 text-slate-600 hidden lg:table-cell">{a.agentLicense || "--"}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-900">{USD.format(a.totalEarnings)}</td>
                              <td className="px-3 py-2 text-right text-slate-600 hidden sm:table-cell">{a.invoiceCount}</td>
                              <td className="px-3 py-2 text-slate-500 hidden md:table-cell">{fmtDate(a.firstPaymentDate)}</td>
                              <td className="px-3 py-2 text-slate-500 hidden md:table-cell">{fmtDate(a.lastPaymentDate)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {tax1099Data.agents.filter((a) => a.isAbove600).length === 0 && (
                    <div className="py-8 text-center text-sm text-slate-400">No agents above $600 threshold for {tax1099Year}</div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function SummaryCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: "emerald" | "amber" }) {
  const bg = highlight === "emerald" ? "bg-emerald-50 border-emerald-200" : highlight === "amber" ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200";
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${bg}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-lg font-bold text-slate-900">{value}</div>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({ label, col, current, dir, onSort, align }: {
  label: string;
  col: string;
  current: string;
  dir: "asc" | "desc";
  onSort: (col: string) => void;
  align?: "right";
}) {
  const active = current === col;
  return (
    <th
      className={`px-4 py-3 font-medium text-slate-500 cursor-pointer hover:text-slate-700 select-none ${align === "right" ? "text-right" : ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
      </span>
    </th>
  );
}
