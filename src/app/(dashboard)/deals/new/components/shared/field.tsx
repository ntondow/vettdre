"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

// ============================================================
// Collapsible Section
// ============================================================
export function Section({
  title,
  defaultOpen = true,
  summary,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {title}
          </span>
          {!open && summary && (
            <span className="text-[10px] text-slate-600 truncate">{summary}</span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-500 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="p-4 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AI Sparkle indicator for assumed fields
// ============================================================
export function Sparkle() {
  return (
    <span className="inline-block ml-1 text-amber-400" title="AI-generated assumption">
      <svg className="w-3 h-3 inline" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" />
      </svg>
    </span>
  );
}

// ============================================================
// Input Field with optional AI sparkle + badge
// ============================================================
export function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  type = "number",
  step,
  min,
  className,
  aiAssumed,
  onClearAi,
  badge,
}: {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  type?: string;
  step?: string;
  min?: string;
  className?: string;
  aiAssumed?: boolean;
  onClearAi?: () => void;
  badge?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">
        {label}
        {aiAssumed && <Sparkle />}
        {badge && (
          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 normal-case tracking-normal">
            {badge}
          </span>
        )}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => {
            onChange(parseFloat(e.target.value) || 0);
            if (onClearAi) onClearAi();
          }}
          step={step || "any"}
          min={min}
          className={`w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""} ${aiAssumed ? "bg-amber-500/10 border-amber-500/20" : ""}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Slider + Text Input Field
// ============================================================
export function SliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = "%",
  badge,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  badge?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1.5">
        {label}
        {badge && (
          <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 normal-case tracking-normal">
            {badge}
          </span>
        )}
      </label>
      <div className="flex items-center gap-3">
        <div className="flex-1 relative h-6 flex items-center">
          <div className="absolute inset-x-0 h-1 bg-white/10 rounded-full" />
          <div className="absolute left-0 h-1 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute w-4 h-4 bg-white rounded-full shadow-lg pointer-events-none"
            style={{ left: `calc(${pct}% - 8px)` }}
          />
        </div>
        <div className="relative w-20">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            step={step}
            min={min}
            max={max}
            className="w-full px-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-sm font-semibold text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30 pr-6"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
            {suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Semi-circular gauge for KPI cards
// ============================================================
export function MetricGauge({
  value,
  min,
  max,
  color,
}: {
  value: number;
  min: number;
  max: number;
  color: string;
}) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = max > min ? (clamped - min) / (max - min) : 0;
  const r = 46;
  const cx = 60;
  const cy = 58;
  const circumference = Math.PI * r;
  const filled = circumference * pct;
  const gap = circumference - filled;
  return (
    <svg viewBox="0 0 120 68" className="w-full h-auto">
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${gap}`}
        className="transition-all duration-500"
      />
    </svg>
  );
}

// ============================================================
// P&L Row helper (with optional custom formatted value)
// ============================================================
export function PnlRow({
  label,
  value,
  bold,
  indent,
  border,
  customValue,
}: {
  label: string;
  value: number;
  bold?: boolean;
  indent?: boolean;
  border?: boolean;
  customValue?: string;
}) {
  const fmtVal = (n: number) =>
    n >= 0 ? `$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`;
  return (
    <tr className={border ? "border-t border-white/5" : ""}>
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold text-white" : "text-slate-400"}`}>
        {label}
      </td>
      <td className={`py-1.5 text-right ${bold ? "font-semibold text-white" : ""} ${!customValue && value < 0 ? "text-red-400" : ""}`}>
        {customValue ? customValue : value < 0 ? `(${fmtVal(Math.abs(value))})` : fmtVal(value)}
      </td>
    </tr>
  );
}

// P&L Row with Per Unit + Notes columns
export function PnlRowFull({
  label,
  value,
  bold,
  indent,
  border,
  perUnit,
  note,
}: {
  label: string;
  value: number;
  bold?: boolean;
  indent?: boolean;
  border?: boolean;
  perUnit?: number;
  note?: string;
}) {
  const fmtVal = (n: number) =>
    n >= 0 ? `$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`;
  return (
    <tr className={border ? "border-t border-white/5" : ""}>
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold text-white" : "text-slate-400"}`}>
        {label}
      </td>
      <td className={`py-1.5 text-right ${bold ? "font-semibold text-white" : ""} ${value < 0 ? "text-red-400" : ""}`}>
        {value < 0 ? `(${fmtVal(Math.abs(value))})` : fmtVal(value)}
      </td>
      <td className="py-1.5 text-right text-xs text-slate-500">
        {perUnit != null && perUnit > 0 ? fmtVal(perUnit) : ""}
      </td>
      <td className="py-1.5 text-right text-[10px] text-slate-500">{note || ""}</td>
    </tr>
  );
}
