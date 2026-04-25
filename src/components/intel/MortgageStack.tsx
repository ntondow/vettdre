"use client";

import { AlertTriangle, Landmark } from "lucide-react";
import type { IntelMortgageSummary } from "@/lib/intel-api-types";

interface Props {
  summary: IntelMortgageSummary;
  compact?: boolean;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${n.toLocaleString()}`;
}

export default function MortgageStack({ summary, compact = false }: Props) {
  if (summary.activeMortgages === 0) {
    return (
      <div className="text-xs text-slate-400 py-2">No active mortgages recorded</div>
    );
  }

  const maxLenderAmount = Math.max(...summary.lenderBreakdown.map(l => l.amount), 1);
  const topLenders = summary.lenderBreakdown
    .sort((a, b) => b.amount - a.amount)
    .slice(0, compact ? 3 : 5);

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark size={14} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-700">
            {summary.activeMortgages} active mortgage{summary.activeMortgages !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-sm font-bold text-slate-900">
          {formatAmount(summary.totalMortgageAmount)}
        </span>
      </div>

      {/* Distress lender warning */}
      {summary.distressLenderCount > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
          <AlertTriangle size={10} />
          {summary.distressLenderCount} non-bank lender{summary.distressLenderCount !== 1 ? "s" : ""} (distress signal)
        </div>
      )}

      {/* Lender breakdown bar chart */}
      {topLenders.length > 0 && (
        <div className="space-y-1.5">
          {topLenders.map((lender, i) => (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-600 truncate max-w-[180px]">
                  {lender.lenderName}
                  {!lender.isBank && (
                    <span className="ml-1 text-amber-600">(non-bank)</span>
                  )}
                </span>
                <span className="font-mono text-slate-500">{formatAmount(lender.amount)}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${lender.isBank ? "bg-blue-400" : "bg-amber-400"}`}
                  style={{ width: `${(lender.amount / maxLenderAmount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Maturity */}
      {summary.weightedAvgMaturityYears != null && (
        <p className="text-[10px] text-slate-400">
          Weighted avg. maturity: {summary.weightedAvgMaturityYears.toFixed(1)} years
        </p>
      )}
    </div>
  );
}
