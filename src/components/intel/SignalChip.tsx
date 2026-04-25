"use client";

import { useState } from "react";
import { AlertTriangle, TrendingUp, Building2, Clock } from "lucide-react";
import type { IntelSignal } from "@/lib/intel-api-types";

const SIGNAL_LABELS: Record<string, string> = {
  pre_foreclosure_risk: "Pre-Foreclosure Risk",
  forced_sale_probability: "Forced Sale Likely",
  assemblage_opportunity: "Assemblage Opportunity",
  exemption_cliff: "Exemption Cliff",
  sponsor_overhang: "Sponsor Overhang",
};

const SIGNAL_ICONS: Record<string, typeof AlertTriangle> = {
  pre_foreclosure_risk: AlertTriangle,
  forced_sale_probability: AlertTriangle,
  assemblage_opportunity: Building2,
  exemption_cliff: Clock,
  sponsor_overhang: TrendingUp,
};

function scoreColor(score: number | null): { bg: string; text: string; border: string } {
  if (score === null) return { bg: "bg-slate-50", text: "text-slate-400", border: "border-slate-200" };
  if (score >= 70) return { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
  if (score >= 40) return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
  if (score >= 1) return { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };
  return { bg: "bg-slate-50", text: "text-slate-400", border: "border-slate-200" };
}

interface Props {
  signal: IntelSignal;
  compact?: boolean;
}

export default function SignalChip({ signal, compact = false }: Props) {
  const [showEvidence, setShowEvidence] = useState(false);
  const score = signal.score;
  if (score === null || score === 0) return null;

  const label = SIGNAL_LABELS[signal.signalType] || signal.signalType.replace(/_/g, " ");
  const Icon = SIGNAL_ICONS[signal.signalType] || AlertTriangle;
  const colors = scoreColor(score);
  const components = (signal.evidence as any)?.components as Array<{ name: string; points: number; detail: string }> | undefined;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowEvidence(!showEvidence)}
        onMouseEnter={() => !compact && setShowEvidence(true)}
        onMouseLeave={() => setShowEvidence(false)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-medium transition-colors ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80`}
        aria-label={`${label}: score ${score}`}
        aria-expanded={showEvidence}
      >
        <Icon size={compact ? 10 : 12} />
        {!compact && <span className="truncate max-w-[120px]">{label}</span>}
        <span className="font-bold">{score}</span>
      </button>

      {/* Evidence popover */}
      {showEvidence && components && components.length > 0 && (
        <div
          className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs"
          role="tooltip"
        >
          <p className="font-semibold text-slate-900 mb-2">{label} — Score {score}/100</p>
          <div className="space-y-1.5">
            {components.map((c, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <span className="text-slate-600 flex-1">{c.detail}</span>
                <span className={`font-mono font-semibold shrink-0 ${c.points > 0 ? "text-red-600" : c.points < 0 ? "text-green-600" : "text-slate-400"}`}>
                  {c.points > 0 ? "+" : ""}{c.points}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-100 flex justify-between text-[10px] text-slate-400">
            <span>Confidence: {signal.confidence}</span>
            <span>{new Date(signal.computedAt).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
