"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDashboardSummary } from "../reports/actions";
import type { DashboardSummary, ReportPeriod } from "@/lib/bms-types";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DEAL_TYPE_LABELS,
} from "@/lib/bms-types";
import {
  DollarSign,
  TrendingUp,
  Users,
  FileText,
  Receipt,
  ArrowUpRight,
  BarChart3,
  PieChart,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

const DEAL_TYPE_COLORS: Record<string, string> = {
  sale: "bg-blue-500",
  lease: "bg-violet-500",
  rental: "bg-amber-500",
};

// Status ordering for consistent display
const SUBMISSION_STATUS_ORDER = ["submitted", "under_review", "approved", "invoiced", "paid", "rejected"];
const INVOICE_STATUS_ORDER = ["draft", "sent", "paid", "void"];

// ── Component ─────────────────────────────────────────────────

export default function BrokerageDashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<ReportPeriod>("month");

  async function loadData() {
    setLoading(true);
    try {
      const data = await getDashboardSummary(period);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-52 bg-slate-200 animate-pulse rounded" />
          <div className="h-9 w-56 bg-slate-100 animate-pulse rounded-lg" />
        </div>
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-56 bg-slate-100 animate-pulse rounded-xl" />
          <div className="h-56 bg-slate-100 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <BarChart3 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">Unable to load dashboard</p>
      </div>
    );
  }

  // Computed
  const submissionTotal = Object.values(summary.submissionsByStatus).reduce((s, c) => s + c, 0);
  const invoiceTotal = Object.values(summary.invoicesByStatus).reduce((s, c) => s + c, 0);
  const dealTypeTotal = Object.values(summary.dealsByType).reduce((s, c) => s + c, 0);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Brokerage Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Performance snapshot for your brokerage</p>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {(Object.keys(PERIOD_LABELS) as ReportPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p ? "bg-blue-100 text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top Stats Row ─────────────────────────────────── */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          iconBg="bg-violet-100 text-violet-600"
          label="Total Volume"
          value={fmt(summary.totalVolume)}
          sub={`${summary.approvedDeals} approved deal${summary.approvedDeals !== 1 ? "s" : ""}`}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-green-100 text-green-600"
          label="House Revenue"
          value={fmt(summary.houseRevenue)}
          sub="From paid invoices"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Agent Payouts"
          value={fmt(summary.agentPayouts)}
          sub="From paid invoices"
        />
        <StatCard
          icon={<Receipt className="h-5 w-5" />}
          iconBg={summary.pendingPayouts > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}
          label="Pending Payouts"
          value={fmt(summary.pendingPayouts)}
          sub="Draft + sent invoices"
        />
      </div>

      {/* ── Secondary Stats ───────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Deal Size</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{fmt(summary.avgDealSize)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Commission Rate</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{fmtPct(summary.avgCommissionRate)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Approved Deals</span>
          <div className="text-xl font-bold text-slate-900 mt-1">
            {summary.approvedDeals}
            <span className="text-sm font-normal text-slate-400 ml-1">/ {summary.totalDeals} total</span>
          </div>
        </div>
      </div>

      {/* ── Charts Section ────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">

        {/* Deal Status Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Deal Status Breakdown</h2>
            {submissionTotal > 0 && (
              <span className="text-xs text-slate-400 ml-auto">{submissionTotal} total</span>
            )}
          </div>

          {submissionTotal > 0 ? (
            <div className="space-y-2.5">
              {SUBMISSION_STATUS_ORDER.map((status) => {
                const count = summary.submissionsByStatus[status] || 0;
                if (count === 0) return null;
                const pct = (count / submissionTotal) * 100;
                // Extract just the bg color from SUBMISSION_STATUS_COLORS
                const colorClass = SUBMISSION_STATUS_COLORS[status] || "bg-slate-100 text-slate-600";
                const bgColor = colorClass.split(" ")[0];
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-600">
                        {SUBMISSION_STATUS_LABELS[status] || status}
                      </span>
                      <span className="text-xs text-slate-500">
                        {count} ({fmtPct(pct)})
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${bgColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No submissions this period</p>
            </div>
          )}
        </div>

        {/* Deal Types */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Deal Types</h2>
            {dealTypeTotal > 0 && (
              <span className="text-xs text-slate-400 ml-auto">{dealTypeTotal} total</span>
            )}
          </div>

          {dealTypeTotal > 0 ? (
            <>
              {/* Stacked bar */}
              <div className="h-8 bg-slate-100 rounded-lg overflow-hidden flex mb-4">
                {["sale", "lease", "rental"].map((type) => {
                  const count = summary.dealsByType[type] || 0;
                  if (count === 0) return null;
                  const pct = (count / dealTypeTotal) * 100;
                  return (
                    <div
                      key={type}
                      className={`${DEAL_TYPE_COLORS[type]} transition-all flex items-center justify-center`}
                      style={{ width: `${pct}%` }}
                      title={`${DEAL_TYPE_LABELS[type] || type}: ${count}`}
                    >
                      {pct >= 15 && (
                        <span className="text-[10px] font-bold text-white">{fmtPct(pct)}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="space-y-2">
                {["sale", "lease", "rental"].map((type) => {
                  const count = summary.dealsByType[type] || 0;
                  if (count === 0) return null;
                  const pct = (count / dealTypeTotal) * 100;
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-sm ${DEAL_TYPE_COLORS[type]}`} />
                      <span className="text-sm text-slate-700 flex-1">
                        {DEAL_TYPE_LABELS[type] || type}
                      </span>
                      <span className="text-sm font-medium text-slate-900">{count}</span>
                      <span className="text-xs text-slate-400 w-12 text-right">{fmtPct(pct)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="py-8 text-center">
              <PieChart className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No deals this period</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Invoice Status ────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Invoice Status</h2>
          {invoiceTotal > 0 && (
            <span className="text-xs text-slate-400 ml-auto">{invoiceTotal} total</span>
          )}
        </div>

        {invoiceTotal > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {INVOICE_STATUS_ORDER.map((status) => {
              const count = summary.invoicesByStatus[status] || 0;
              const pct = invoiceTotal > 0 ? (count / invoiceTotal) * 100 : 0;
              const colorClass = INVOICE_STATUS_COLORS[status] || "bg-slate-100 text-slate-600";
              return (
                <div key={status} className="text-center p-3 rounded-lg bg-slate-50">
                  <div className="text-2xl font-bold text-slate-900">{count}</div>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}>
                    {INVOICE_STATUS_LABELS[status] || status}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-1">{fmtPct(pct)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center">
            <Receipt className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No invoices this period</p>
          </div>
        )}
      </div>

      {/* ── Quick Links ───────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-4">
        <QuickLinkCard
          href="/brokerage/deal-submissions"
          icon={<FileText className="h-5 w-5 text-blue-600" />}
          label="Deal Submissions"
          count={summary.totalDeals}
          countLabel="submissions"
        />
        <QuickLinkCard
          href="/brokerage/invoices"
          icon={<Receipt className="h-5 w-5 text-purple-600" />}
          label="Invoices"
          count={invoiceTotal}
          countLabel="invoices"
        />
        <QuickLinkCard
          href="/brokerage/reports"
          icon={<BarChart3 className="h-5 w-5 text-emerald-600" />}
          label="Reports"
          count={null}
          countLabel="P&L, Production, 1099"
        />
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────

function StatCard({
  icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}

// ── Quick Link Card ───────────────────────────────────────────

function QuickLinkCard({
  href,
  icon,
  label,
  count,
  countLabel,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number | null;
  countLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <div className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">
              {label}
            </div>
            <div className="text-xs text-slate-400">
              {count !== null && <span className="font-medium text-slate-600">{count}</span>}{" "}
              {countLabel}
            </div>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
      </div>
    </Link>
  );
}
