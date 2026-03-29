"use client";

import { useState } from "react";
import type { MotivationScore, MotivationSignal, SignalCategory } from "@/lib/motivation-engine";
import {
  MOTIVATION_LEVEL_CONFIG,
  getMotivationLevel,
  getMotivationColor,
  getMotivationLabel,
  getSignalCategoryColor,
  getSignalCategoryLabel,
} from "@/lib/motivation-engine";
import { hasPermission, getUpgradeMessage, type UserPlan } from "@/lib/feature-gate";
import { SkeletonBlock, SkeletonLine } from "@/components/ui/skeleton-shimmer";

interface Props {
  score: MotivationScore | null;
  loading: boolean;
  userPlan?: UserPlan;
  onEnrichClick?: () => void;
  onDealClick?: () => void;
}

/* ------------------------------------------------------------------ */
/*  SVG Semicircular Gauge                                             */
/* ------------------------------------------------------------------ */

function MotivationGauge({ value, level }: { value: number; level: string }) {
  const color = MOTIVATION_LEVEL_CONFIG[level as keyof typeof MOTIVATION_LEVEL_CONFIG]?.color ?? "#94A3B8";
  // Semicircle arc parameters
  const cx = 60, cy = 55, r = 45;
  const startAngle = Math.PI; // 180° (left)
  const endAngle = 0;        // 0° (right)
  const clampedValue = Math.max(0, Math.min(100, value));
  const sweepAngle = startAngle - (clampedValue / 100) * Math.PI;

  // Background arc (full semicircle)
  const bgX1 = cx + r * Math.cos(startAngle);
  const bgY1 = cy - r * Math.sin(startAngle);
  const bgX2 = cx + r * Math.cos(endAngle);
  const bgY2 = cy - r * Math.sin(endAngle);
  const bgPath = `M ${bgX1} ${bgY1} A ${r} ${r} 0 1 1 ${bgX2} ${bgY2}`;

  // Value arc
  const valX2 = cx + r * Math.cos(sweepAngle);
  const valY2 = cy - r * Math.sin(sweepAngle);
  const largeArc = clampedValue > 50 ? 1 : 0;
  const valPath = clampedValue > 0
    ? `M ${bgX1} ${bgY1} A ${r} ${r} 0 ${largeArc} 1 ${valX2} ${valY2}`
    : "";

  return (
    <svg viewBox="0 0 120 65" className="w-full max-w-[140px]">
      {/* Background track */}
      <path d={bgPath} fill="none" stroke="#e2e8f0" strokeWidth="8" strokeLinecap="round" />
      {/* Value arc */}
      {valPath && (
        <path d={valPath} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
      )}
      {/* Score text */}
      <text x={cx} y={cy - 4} textAnchor="middle" className="text-2xl font-black" fill={color} fontSize="22">
        {value}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="500">
        / 100
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Signal Row                                                         */
/* ------------------------------------------------------------------ */

function SignalRow({ signal }: { signal: MotivationSignal }) {
  const catColor = getSignalCategoryColor(signal.category);
  const catLabel = getSignalCategoryLabel(signal.category);
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span
        className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: MOTIVATION_LEVEL_CONFIG[getMotivationLevel(signal.score)]?.color ?? "#94A3B8" }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-slate-800 truncate">{signal.name}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${catColor.bg} ${catColor.text}`}>
            {catLabel}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{signal.description}</p>
      </div>
      <span className="text-xs font-bold text-slate-700 flex-shrink-0 tabular-nums">{signal.score}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton Loading State                                             */
/* ------------------------------------------------------------------ */

function MotivationSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <SkeletonBlock width="w-5" height="h-5" />
        <SkeletonLine width="lg" height="h-4" />
      </div>
      <div className="flex gap-5 items-center">
        <SkeletonBlock width="w-[140px]" height="h-[65px]" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="md" height="h-5" />
          <SkeletonLine width="full" height="h-3" />
          <SkeletonLine width="lg" height="h-3" />
        </div>
      </div>
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <SkeletonLine width="sm" height="h-3" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <SkeletonBlock width="w-2" height="h-2" />
            <SkeletonLine width="full" height="h-3" />
            <SkeletonLine width="sm" height="h-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function MotivationScoreCard({ score, loading, userPlan = "pro", onEnrichClick, onDealClick }: Props) {
  const [showAll, setShowAll] = useState(false);

  // Feature gate: Explorer+ sees basic score, Pro+ sees full signals & hot leads
  const canSeeBasic = hasPermission(userPlan, "motivation_basic");
  const canSeeFull = hasPermission(userPlan, "motivation_scoring");

  if (!canSeeBasic) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🎯</span>
          <h3 className="text-sm font-bold text-slate-900">Seller Motivation Score</h3>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-500 mb-2">{getUpgradeMessage("motivation_basic")}</p>
          <div className="inline-flex items-center gap-1 text-[10px] text-slate-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Locked
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <MotivationSkeleton />;
  if (!score) return null; // No data available — don't render anything

  const levelConfig = MOTIVATION_LEVEL_CONFIG[score.level];
  const visibleSignals = showAll ? score.signals : score.signals.slice(0, 5);

  return (
    <div className={`rounded-xl border ${levelConfig.bgColor} border-slate-200 overflow-hidden`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <h3 className="text-sm font-bold text-slate-900">Seller Motivation</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${levelConfig.bgColor === "bg-slate-50" ? "bg-slate-200 text-slate-600" : ""}`}
              style={levelConfig.bgColor !== "bg-slate-50" ? { backgroundColor: levelConfig.color + "20", color: levelConfig.color } : undefined}>
              {levelConfig.label}
            </span>
          </div>
          {/* Confidence badge */}
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
            score.confidence === "high" ? "bg-emerald-100 text-emerald-700" :
            score.confidence === "medium" ? "bg-amber-100 text-amber-700" :
            "bg-slate-100 text-slate-500"
          }`}>
            {score.confidence === "high" ? "High confidence" :
             score.confidence === "medium" ? "Medium confidence" :
             "Low confidence"}
          </span>
        </div>

        {/* Gauge + summary */}
        <div className="flex gap-4 items-center">
          <MotivationGauge value={score.overall} level={score.level} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-600 leading-relaxed">{levelConfig.description}</p>
            {score.topSignal && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                <span className="font-semibold" style={{ color: levelConfig.color }}>Top signal:</span>{" "}
                {score.topSignal}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Signals list */}
      {canSeeFull && score.signals.length > 0 && (
        <div className="px-5 pb-4 border-t border-slate-200/60 pt-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
            Motivation Signals ({score.signals.length})
          </p>
          <div className="space-y-0.5">
            {visibleSignals.map((sig) => (
              <SignalRow key={sig.id} signal={sig} />
            ))}
          </div>
          {score.signals.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-1.5 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
            >
              {showAll ? "Show less" : `Show all ${score.signals.length} signals`}
            </button>
          )}
        </div>
      )}

      {/* Pro upgrade prompt for Explorer users */}
      {!canSeeFull && (
        <div className="px-5 pb-4 border-t border-slate-200/60 pt-3">
          <p className="text-[11px] text-slate-500">{getUpgradeMessage("motivation_scoring")}</p>
        </div>
      )}

      {/* CTA buttons */}
      {canSeeFull && score.overall >= 40 && (
        <div className="px-5 pb-4 flex gap-2">
          {onEnrichClick && (
            <button
              onClick={onEnrichClick}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Enrich Owner
            </button>
          )}
          {onDealClick && (
            <button
              onClick={onDealClick}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Underwrite Deal
            </button>
          )}
        </div>
      )}
    </div>
  );
}
