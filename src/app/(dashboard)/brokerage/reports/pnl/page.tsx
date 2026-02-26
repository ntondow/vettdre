"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getPnlReport, exportReportCSV } from "../actions";
import type { PnlReport, ReportGroupBy } from "@/lib/bms-types";
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  BarChart3,
  FileText,
  Hash,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Format a period key like "2025-03" or "2025-W12" for display */
function formatPeriodLabel(period: string, groupBy: ReportGroupBy): string {
  if (groupBy === "week") {
    // "2025-W03" → "W03 '25"
    const parts = period.split("-W");
    if (parts.length === 2) return `W${parts[1]} '${parts[0].slice(2)}`;
    return period;
  }
  // "2025-03" → "Mar '25"
  const [year, month] = period.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = parseInt(month, 10) - 1;
  if (mi >= 0 && mi < 12) return `${monthNames[mi]} '${year.slice(2)}`;
  return period;
}

const INPUT = "border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// ── Component ─────────────────────────────────────────────────

export default function PnlReportPage() {
  const [report, setReport] = useState<PnlReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("month");
  const [exporting, setExporting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getPnlReport(startDate, endDate, groupBy);
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
  }, [startDate, endDate, groupBy]);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportReportCSV("pnl", { startDate, endDate, groupBy });
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
        <div className="h-8 w-48 bg-slate-200 animate-pulse rounded mb-2" />
        <div className="h-5 w-72 bg-slate-100 animate-pulse rounded mb-6" />
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-100 animate-pulse rounded-xl mb-6" />
        <div className="h-48 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  const periods = report?.periods || [];
  const totals = report?.totals || { totalRevenue: 0, totalPayouts: 0, totalNetIncome: 0, totalDeals: 0, totalVolume: 0 };
  const maxBarValue = Math.max(...periods.map((p) => Math.max(p.revenue, p.payouts)), 1);

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
          <h1 className="text-2xl font-bold text-slate-900">Profit & Loss</h1>
          <p className="text-sm text-slate-500 mt-1">Revenue vs agent payouts over time</p>
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

          <div className="flex bg-slate-100 rounded-lg p-0.5 ml-1">
            {(["month", "week"] as ReportGroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  groupBy === g ? "bg-blue-100 text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {g === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || periods.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors ml-1"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-green-100 text-green-600"
          label="Total Revenue"
          value={fmt(totals.totalRevenue)}
        />
        <SummaryCard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Total Payouts"
          value={fmt(totals.totalPayouts)}
        />
        <SummaryCard
          icon={totals.totalNetIncome >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          iconBg={totals.totalNetIncome >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}
          label="Net Income"
          value={fmt(totals.totalNetIncome)}
          valueColor={totals.totalNetIncome >= 0 ? "text-emerald-700" : "text-red-600"}
        />
        <SummaryCard
          icon={<Hash className="h-5 w-5" />}
          iconBg="bg-violet-100 text-violet-600"
          label="Total Deals"
          value={String(totals.totalDeals)}
        />
      </div>

      {/* ── Empty State ───────────────────────────────────── */}
      {periods.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center mb-8">
          <BarChart3 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No paid invoices in this date range</p>
          <p className="text-sm text-slate-400 mt-1">Adjust the date range or check that invoices have been marked as paid</p>
        </div>
      )}

      {/* ── Bar Chart ─────────────────────────────────────── */}
      {periods.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Revenue vs Payouts</h2>
            <div className="flex items-center gap-4 ml-auto">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-green-500" />
                <span className="text-xs text-slate-500">Revenue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-blue-500" />
                <span className="text-xs text-slate-500">Payouts</span>
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="overflow-x-auto">
            <div className="flex items-end gap-1 min-w-0" style={{ minHeight: 200 }}>
              {periods.map((p) => {
                const revH = maxBarValue > 0 ? (p.revenue / maxBarValue) * 180 : 0;
                const payH = maxBarValue > 0 ? (p.payouts / maxBarValue) * 180 : 0;
                const isNegNet = p.netIncome < 0;
                return (
                  <div
                    key={p.period}
                    className="flex-1 min-w-[40px] flex flex-col items-center"
                  >
                    {/* Bars */}
                    <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 180 }}>
                      <div
                        className="bg-green-500 rounded-t-sm transition-all flex-1 max-w-[20px]"
                        style={{ height: Math.max(revH, 2) }}
                        title={`Revenue: ${fmtFull(p.revenue)}`}
                      />
                      <div
                        className="bg-blue-500 rounded-t-sm transition-all flex-1 max-w-[20px]"
                        style={{ height: Math.max(payH, 2) }}
                        title={`Payouts: ${fmtFull(p.payouts)}`}
                      />
                    </div>

                    {/* Negative net indicator */}
                    {isNegNet && (
                      <div className="w-full h-0.5 bg-red-400 rounded mt-0.5" />
                    )}

                    {/* Period label */}
                    <span
                      className="text-[10px] text-slate-400 mt-1.5 text-center leading-tight truncate w-full"
                      title={p.period}
                    >
                      {formatPeriodLabel(p.period, groupBy)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Data Table ────────────────────────────────────── */}
      {periods.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Period Detail</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Period</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Revenue</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Payouts</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Net Income</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Deals</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map((p) => (
                  <tr key={p.period} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">
                      {formatPeriodLabel(p.period, groupBy)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-green-600 font-medium">
                      {fmt(p.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-blue-600 font-medium">
                      {fmt(p.payouts)}
                    </td>
                    <td className={`px-4 py-2.5 text-sm text-right font-medium ${
                      p.netIncome >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {fmt(p.netIncome)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600">
                      {p.dealCount}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600">
                      {fmt(p.volume)}
                    </td>
                  </tr>
                ))}

                {/* Totals row */}
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="px-4 py-3 text-sm font-bold text-slate-900">Total</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-green-700">
                    {fmt(totals.totalRevenue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-blue-700">
                    {fmt(totals.totalPayouts)}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${
                    totals.totalNetIncome >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}>
                    {fmt(totals.totalNetIncome)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">
                    {totals.totalDeals}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">
                    {fmt(totals.totalVolume)}
                  </td>
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
  valueColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
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
