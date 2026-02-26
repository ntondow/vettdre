"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getDealPipelineReport } from "../actions";
import type { PipelineReport } from "@/lib/bms-types";
import { DEAL_TYPE_LABELS } from "@/lib/bms-types";
import {
  ArrowLeft,
  ArrowDown,
  Filter,
  Clock,
  TrendingUp,
  Building2,
  AlertCircle,
  XCircle,
  CheckCircle2,
  FileText,
  Zap,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const INPUT = "border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

const DEAL_TYPE_COLORS: Record<string, string> = {
  sale: "bg-blue-100 text-blue-700",
  lease: "bg-violet-100 text-violet-700",
  rental: "bg-amber-100 text-amber-700",
};

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: typeof Building2 }> = {
  internal: { label: "Internal", color: "bg-blue-100 text-blue-700", icon: Building2 },
  external: { label: "External", color: "bg-violet-100 text-violet-700", icon: Zap },
};

// ── Component ─────────────────────────────────────────────────

export default function PipelineReportPage() {
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getDealPipelineReport(startDate, endDate);
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
  }, [startDate, endDate]);

  // ── Loading ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-6 w-32 bg-slate-200 animate-pulse rounded mb-6" />
        <div className="h-8 w-48 bg-slate-200 animate-pulse rounded mb-2" />
        <div className="h-5 w-80 bg-slate-100 animate-pulse rounded mb-6" />
        <div className="h-72 bg-slate-100 animate-pulse rounded-xl mb-6" />
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-40 bg-slate-100 animate-pulse rounded-xl" />
          <div className="h-40 bg-slate-100 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  const sc = report?.statusCounts || {};
  const cr = report?.conversionRates || {
    submittedToApproved: 0, approvedToInvoiced: 0, invoicedToPaid: 0, overallConversion: 0,
  };
  const totalSubmissions =
    (sc.submitted || 0) + (sc.under_review || 0) + (sc.approved || 0) +
    (sc.invoiced || 0) + (sc.paid || 0) + (sc.rejected || 0);
  const totalApproved = (sc.approved || 0) + (sc.invoiced || 0) + (sc.paid || 0);
  const totalInvoiced = (sc.invoiced || 0) + (sc.paid || 0);
  const totalPaid = sc.paid || 0;
  const totalRejected = sc.rejected || 0;

  const bySource = report?.bySource || {};
  const byDealType = report?.byDealType || {};
  const rejections = report?.recentRejections || [];
  const sourceTotal = Object.values(bySource).reduce((s, v) => s + v.count, 0);

  const isEmpty = totalSubmissions === 0;

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
          <h1 className="text-2xl font-bold text-slate-900">Deal Pipeline</h1>
          <p className="text-sm text-slate-500 mt-1">Submission funnel and conversion analysis</p>
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
        </div>
      </div>

      {/* ── Empty State ──────────────────────────────── */}
      {isEmpty && (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center mb-8">
          <Filter className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No deal submissions in this date range</p>
          <p className="text-sm text-slate-400 mt-1">Adjust the date range or submit deals to see pipeline data</p>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* ── Funnel Visualization ──────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-2 mb-5">
              <Filter className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">Submission Funnel</h2>
            </div>

            <div className="flex flex-col items-center gap-0">
              {/* Submitted */}
              <FunnelStage
                label="Submitted"
                count={totalSubmissions}
                widthPct={100}
                bgColor="bg-slate-100"
                textColor="text-slate-700"
                borderColor="border-slate-200"
              />

              {/* Arrow: Submitted → Approved */}
              <FunnelArrow rate={cr.submittedToApproved} />

              {/* Approved */}
              <FunnelStage
                label="Approved"
                count={totalApproved}
                widthPct={totalSubmissions > 0 ? Math.max((totalApproved / totalSubmissions) * 100, 30) : 30}
                bgColor="bg-green-50"
                textColor="text-green-700"
                borderColor="border-green-200"
              />

              {/* Arrow: Approved → Invoiced */}
              <FunnelArrow rate={cr.approvedToInvoiced} />

              {/* Invoiced */}
              <FunnelStage
                label="Invoiced"
                count={totalInvoiced}
                widthPct={totalSubmissions > 0 ? Math.max((totalInvoiced / totalSubmissions) * 100, 20) : 20}
                bgColor="bg-blue-50"
                textColor="text-blue-700"
                borderColor="border-blue-200"
              />

              {/* Arrow: Invoiced → Paid */}
              <FunnelArrow rate={cr.invoicedToPaid} />

              {/* Paid */}
              <FunnelStage
                label="Paid"
                count={totalPaid}
                widthPct={totalSubmissions > 0 ? Math.max((totalPaid / totalSubmissions) * 100, 15) : 15}
                bgColor="bg-emerald-50"
                textColor="text-emerald-700"
                borderColor="border-emerald-200"
              />

              {/* Rejected branch */}
              {totalRejected > 0 && (
                <div className="mt-4 pt-4 border-t border-dashed border-slate-200 w-full flex justify-center">
                  <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-sm font-medium text-red-700">
                      {totalRejected} Rejected
                    </span>
                    <span className="text-xs text-red-500">
                      ({totalSubmissions > 0 ? fmtPct((totalRejected / totalSubmissions) * 100) : "0%"} of submitted)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Conversion Rate Cards ──────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <ConversionCard
              label="Submitted \u2192 Approved"
              rate={cr.submittedToApproved}
              color="text-green-600"
            />
            <ConversionCard
              label="Approved \u2192 Invoiced"
              rate={cr.approvedToInvoiced}
              color="text-blue-600"
            />
            <ConversionCard
              label="Invoiced \u2192 Paid"
              rate={cr.invoicedToPaid}
              color="text-emerald-600"
            />
            <ConversionCard
              label="Overall Conversion"
              rate={cr.overallConversion}
              color="text-violet-600"
              highlight
            />
          </div>

          {/* ── Speed Metrics ──────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Days to Approval</span>
                <div className="text-xl font-bold text-slate-900">
                  {report?.avgDaysToApproval ?? 0}
                  <span className="text-sm font-normal text-slate-400 ml-1">days</span>
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Avg Days to Payment</span>
                <div className="text-xl font-bold text-slate-900">
                  {report?.avgDaysToPayment ?? 0}
                  <span className="text-sm font-normal text-slate-400 ml-1">days</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Breakdown Section ──────────────────────── */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">

            {/* By Source */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-800">By Source</h2>
              </div>
              <div className="space-y-3">
                {Object.entries(bySource).map(([key, val]) => {
                  const cfg = SOURCE_CONFIG[key] || { label: key, color: "bg-slate-100 text-slate-700" };
                  const pct = sourceTotal > 0 ? (val.count / sourceTotal) * 100 : 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-md ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <div className="flex-1">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${key === "internal" ? "bg-blue-500" : "bg-violet-500"}`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-32">
                        <span className="text-sm font-medium text-slate-700">{val.count} deal{val.count !== 1 ? "s" : ""}</span>
                        <span className="text-xs text-slate-400 ml-1.5">{fmt(val.volume)}</span>
                      </div>
                    </div>
                  );
                })}
                {Object.keys(bySource).length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-2">No source data</p>
                )}
              </div>
            </div>

            {/* By Deal Type */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-800">By Deal Type</h2>
              </div>
              <div className="space-y-3">
                {Object.entries(byDealType).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                    <span className={`text-xs font-medium px-2 py-1 rounded-md ${DEAL_TYPE_COLORS[key] || "bg-slate-100 text-slate-700"}`}>
                      {DEAL_TYPE_LABELS[key] || key}
                    </span>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{val.count} deal{val.count !== 1 ? "s" : ""}</p>
                        <p className="text-xs text-slate-400">{fmt(val.volume)} vol</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Avg</p>
                        <p className="text-sm font-medium text-slate-700">{fmt(val.avgValue)}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {Object.keys(byDealType).length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-2">No deal type data</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Recent Rejections ──────────────────────── */}
          {rejections.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-8">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <h2 className="text-sm font-semibold text-slate-800">Recent Rejections</h2>
                <span className="text-xs text-slate-400 ml-auto">{rejections.length} rejection{rejections.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {rejections.map((r, idx) => (
                  <div key={idx} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{r.propertyAddress}</p>
                      <p className="text-xs text-slate-400">{r.agentName}</p>
                    </div>
                    <p className="text-sm text-red-600 flex-1 min-w-0 truncate">{r.reason}</p>
                    <span className="text-xs text-slate-400 shrink-0">{formatDate(r.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Funnel Stage ──────────────────────────────────────────────

function FunnelStage({
  label,
  count,
  widthPct,
  bgColor,
  textColor,
  borderColor,
}: {
  label: string;
  count: number;
  widthPct: number;
  bgColor: string;
  textColor: string;
  borderColor: string;
}) {
  return (
    <div
      className={`${bgColor} border ${borderColor} rounded-lg py-3 px-4 text-center transition-all`}
      style={{ width: `${widthPct}%`, minWidth: 160 }}
    >
      <span className={`text-sm font-semibold ${textColor}`}>{label}</span>
      <span className={`text-lg font-bold ${textColor} ml-2`}>{count}</span>
    </div>
  );
}

// ── Funnel Arrow ──────────────────────────────────────────────

function FunnelArrow({ rate }: { rate: number }) {
  return (
    <div className="flex flex-col items-center py-1">
      <ArrowDown className="h-4 w-4 text-slate-300" />
      <span className="text-xs font-medium text-slate-400">{fmtPct(rate)}</span>
    </div>
  );
}

// ── Conversion Card ───────────────────────────────────────────

function ConversionCard({
  label,
  rate,
  color,
  highlight,
}: {
  label: string;
  rate: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${highlight ? "border-violet-200 ring-1 ring-violet-100" : "border-slate-200"}`}>
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider leading-tight block">{label}</span>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{fmtPct(rate)}</div>
    </div>
  );
}
