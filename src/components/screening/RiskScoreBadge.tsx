"use client";

import { RISK_COLORS, RISK_THRESHOLDS } from "@/lib/screening/constants";

interface RiskScoreBadgeProps {
  score: number | null;
  recommendation?: string | null;
  size?: "sm" | "md" | "lg";
}

export default function RiskScoreBadge({ score, recommendation, size = "md" }: RiskScoreBadgeProps) {
  if (score == null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
        Pending
      </span>
    );
  }

  const rec = recommendation || (score >= RISK_THRESHOLDS.approve ? "approve" : score >= RISK_THRESHOLDS.conditional ? "conditional" : "decline");
  const config = RISK_COLORS[rec as keyof typeof RISK_COLORS] || RISK_COLORS.decline;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${sizeClasses[size]}`}
      style={{ backgroundColor: config.bgColor, color: config.color }}
    >
      <span className="font-bold">{Math.round(score)}</span>
      {size !== "sm" && <span className="text-[0.75em] font-medium opacity-80">{config.label}</span>}
    </span>
  );
}
