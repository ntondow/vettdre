"use client";

// Condition summary card with color-coded signals

import { SkeletonConditionCard } from "./skeleton-components";

interface ConditionRow {
  label: string;
  value: string;
  signal: "green" | "yellow" | "red" | "neutral";
}

interface Props {
  data: any;
  loading: boolean;
  onNavigate?: () => void;
}

export default function ConditionSignal({ data, loading, onNavigate }: Props) {
  if (loading) return <SkeletonConditionCard />;
  if (!data) return null;

  const vs = data.violationSummary || {};
  const ecb = data.ecbSummary || {};
  const cs = data.complaintSummary || {};
  const litSum = data.litigationSummary || {};
  const permits = Array.isArray(data.permits) ? data.permits : [];

  const hpdOpen = vs.open || 0;
  const classC = vs.classC || 0;
  const ecbActive = ecb.active || ecb.total || 0;
  const ecbPenalty = ecb.totalPenalty || 0;
  const complaints = cs.total || 0;
  const litActive = litSum.open || 0;

  // Overall signal
  let overall: "green" | "yellow" | "red" = "green";
  let overallLabel = "GOOD";
  if (classC > 5 || ecbPenalty > 50000 || hpdOpen > 20) {
    overall = "red";
    overallLabel = "CONCERN";
  } else if (classC > 0 || hpdOpen > 5 || ecbActive > 3 || litActive > 0) {
    overall = "yellow";
    overallLabel = "FAIR";
  }

  function sig(val: number, threshYellow: number, threshRed: number): "green" | "yellow" | "red" {
    if (val >= threshRed) return "red";
    if (val >= threshYellow) return "yellow";
    return "green";
  }

  const rows: ConditionRow[] = [
    { label: "HPD Violations", value: `${hpdOpen} open${classC > 0 ? ` (${classC} Class C)` : ""}`, signal: sig(classC, 1, 5) },
    { label: "DOB Violations", value: `${data.dobFilings?.filter?.((d: any) => d.jobType === "VIOLATION")?.length || 0} open`, signal: "green" },
    { label: "ECB Penalties", value: ecbPenalty > 0 ? `$${ecbPenalty.toLocaleString()}` : "$0", signal: sig(ecbPenalty, 1, 25000) },
    { label: "Complaints", value: `${complaints} total`, signal: sig(complaints, 10, 30) },
    { label: "Litigation", value: `${litActive} active`, signal: sig(litActive, 1, 3) },
    { label: "Permits", value: `${permits.length} recent`, signal: "neutral" as const },
  ];

  const signalColors = {
    green: "text-emerald-600",
    yellow: "text-amber-600",
    red: "text-red-600",
    neutral: "text-slate-500",
  };

  const badgeColors = {
    green: "bg-emerald-100 text-emerald-700",
    yellow: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Building Condition</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeColors[overall]}`}>
          {overallLabel}
        </span>
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{row.label}</span>
            <span className={`text-xs font-medium ${signalColors[row.signal]}`}>{row.value}</span>
          </div>
        ))}
      </div>
      {onNavigate && (
        <button
          onClick={onNavigate}
          className="mt-2.5 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
        >
          View details on Condition tab &rarr;
        </button>
      )}
    </div>
  );
}
