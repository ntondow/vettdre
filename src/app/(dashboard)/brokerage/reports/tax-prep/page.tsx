"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { get1099PrepData, exportReportCSV } from "../actions";
import type { Report1099Data } from "@/lib/bms-types";
import {
  ArrowLeft,
  Users,
  AlertTriangle,
  DollarSign,
  Download,
  FileText,
  Info,
  Check,
  Minus,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTaxYearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2, current - 3];
}

const INPUT = "border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// ── Component ─────────────────────────────────────────────────

export default function TaxPrepPage() {
  const [data, setData] = useState<Report1099Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1);
  const [exporting, setExporting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const result = await get1099PrepData(taxYear);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear]);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await exportReportCSV("1099", { taxYear: taxYear.toString() });
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
        <div className="h-5 w-80 bg-slate-100 animate-pulse rounded mb-6" />
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-16 bg-blue-50 animate-pulse rounded-xl mb-6" />
        <div className="h-64 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    );
  }

  const agents = data?.agents || [];
  const summary = data?.summary || { totalAgents: 0, agentsAboveThreshold: 0, totalPaid: 0 };

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
          <h1 className="text-2xl font-bold text-slate-900">1099-NEC Prep</h1>
          <p className="text-sm text-slate-500 mt-1">Annual earnings report for independent contractor filing</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={taxYear}
            onChange={(e) => setTaxYear(Number(e.target.value))}
            className={INPUT}
          >
            {getTaxYearOptions().map((y) => (
              <option key={y} value={y}>Tax Year {y}</option>
            ))}
          </select>

          <button
            onClick={handleExport}
            disabled={exporting || agents.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          icon={<Users className="h-5 w-5" />}
          iconBg="bg-blue-100 text-blue-600"
          label="Total Agents Paid"
          value={String(summary.totalAgents)}
        />
        <SummaryCard
          icon={
            summary.agentsAboveThreshold > 0
              ? <AlertTriangle className="h-5 w-5" />
              : <Users className="h-5 w-5" />
          }
          iconBg={
            summary.agentsAboveThreshold > 0
              ? "bg-amber-100 text-amber-600"
              : "bg-green-100 text-green-600"
          }
          label="Agents Above $600"
          value={String(summary.agentsAboveThreshold)}
          note={summary.agentsAboveThreshold > 0 ? "Require 1099 filing" : undefined}
        />
        <SummaryCard
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="bg-green-100 text-green-600"
          label="Total Paid Out"
          value={fmt(summary.totalPaid)}
        />
      </div>

      {/* ── IRS Threshold Notice ──────────────────────── */}
      {summary.agentsAboveThreshold > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">
              {summary.agentsAboveThreshold} agent{summary.agentsAboveThreshold !== 1 ? "s" : ""} earned $600 or more and require{summary.agentsAboveThreshold === 1 ? "s" : ""} 1099-NEC filing
            </p>
            <p className="text-xs text-blue-600 mt-1">
              The IRS requires 1099-NEC forms for payments of $600+ to independent contractors
            </p>
          </div>
        </div>
      )}

      {/* ── Empty State ──────────────────────────────── */}
      {agents.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl py-16 text-center mb-8">
          <FileText className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No paid invoices for tax year {taxYear}</p>
          <p className="text-sm text-slate-400 mt-1">Invoices must be marked as paid to appear in this report</p>
        </div>
      )}

      {/* ── Agent Earnings Table ──────────────────────── */}
      {agents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Agent Earnings — {taxYear}</h2>
            <span className="text-xs text-slate-400 ml-auto">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider hidden lg:table-cell">License #</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Total Earnings</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoices</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">First Payment</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider hidden md:table-cell">Last Payment</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">1099</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => (
                  <tr
                    key={agent.agentId || agent.agentEmail}
                    className={`hover:bg-slate-50/50 transition-colors ${
                      agent.isAbove600 ? "bg-amber-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-900">
                      {agent.agentName}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500">
                      {agent.agentEmail}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 hidden lg:table-cell">
                      {agent.agentLicense || "\u2014"}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right font-bold text-green-600">
                      {fmtFull(agent.totalEarnings)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600">
                      {agent.invoiceCount}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 hidden md:table-cell">
                      {formatDate(agent.firstPaymentDate)}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-slate-500 hidden md:table-cell">
                      {formatDate(agent.lastPaymentDate)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {agent.isAbove600 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (
                        <span className="text-slate-300">
                          <Minus className="h-4 w-4 inline" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Disclaimer ────────────────────────────────── */}
      <p className="text-xs text-slate-400 text-center">
        This report is for preparation purposes only. Consult your tax professional for filing requirements.
      </p>
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  note?: string;
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
      {note && <p className="text-xs text-amber-600 mt-1">{note}</p>}
    </div>
  );
}
