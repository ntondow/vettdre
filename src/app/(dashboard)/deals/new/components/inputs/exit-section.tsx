"use client";

import React from "react";
import { useDealModeler } from "../../deal-modeler-context";
import { Section, Field, SliderField } from "../shared/field";
import { fmt, fmtPct, fmtX } from "../shared/format-utils";

export function ExitSection() {
  const {
    inputs,
    update,
    isAi,
    clearAi,
    marketCapRate,
    structureAnalysis,
  } = useDealModeler();

  return (
    <Section title="Exit Assumptions" summary={`${inputs.holdPeriodYears}yr hold, ${inputs.exitCapRate}% exit cap`}>
      <div className="grid grid-cols-2 gap-3">
        <SliderField label="Hold Period (yrs)" value={inputs.holdPeriodYears} onChange={v => update({ holdPeriodYears: Math.max(1, Math.round(v)) })} min={1} max={30} step={1} suffix="yr" />
        <SliderField label="Exit Cap Rate" value={inputs.exitCapRate} onChange={v => { update({ exitCapRate: v }); clearAi("exitCapRate"); }} min={1} max={15} step={0.25} />
      </div>

      {/* Market Cap Rate Visual */}
      {marketCapRate && marketCapRate.compCount > 0 && (
        <div className="bg-gradient-to-r from-violet-500/5 to-indigo-500/5 border border-violet-500/10 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400">Market Cap Rate</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                marketCapRate.confidence === "high" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                marketCapRate.confidence === "medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                "bg-slate-500/10 text-slate-400 border border-slate-500/20"
              }`}>{marketCapRate.confidence}</span>
            </div>
            <span className="text-[10px] text-slate-500">{marketCapRate.compCount} comps</span>
          </div>

          {/* Range bar with markers */}
          <div className="relative pt-3 pb-1">
            {/* Cap rate range bar */}
            {(() => {
              const barMin = Math.max(1, Math.floor(marketCapRate.range.low - 1));
              const barMax = Math.ceil(marketCapRate.range.high + 1);
              const span = barMax - barMin;
              const pctOf = (v: number) => Math.max(0, Math.min(100, ((v - barMin) / span) * 100));
              const lowPct = pctOf(marketCapRate.range.low);
              const highPct = pctOf(marketCapRate.range.high);
              const mktPct = pctOf(marketCapRate.marketCapRate);
              const exitPct = pctOf(inputs.exitCapRate);

              return (
                <div className="relative h-8">
                  {/* Background track */}
                  <div className="absolute top-3 inset-x-0 h-2 bg-white/5 rounded-full" />
                  {/* Range highlight */}
                  <div
                    className="absolute top-3 h-2 bg-violet-500/20 rounded-full"
                    style={{ left: `${lowPct}%`, width: `${Math.max(1, highPct - lowPct)}%` }}
                  />
                  {/* Market average marker */}
                  <div
                    className="absolute top-1.5 flex flex-col items-center"
                    style={{ left: `${mktPct}%`, transform: "translateX(-50%)" }}
                  >
                    <span className="text-[8px] font-bold text-violet-400 whitespace-nowrap">{marketCapRate.marketCapRate.toFixed(2)}%</span>
                    <div className="w-0.5 h-4 bg-violet-400 rounded-full" />
                  </div>
                  {/* Exit cap marker (user's selection) */}
                  <div
                    className="absolute top-1.5 flex flex-col items-center"
                    style={{ left: `${exitPct}%`, transform: "translateX(-50%)" }}
                  >
                    <span className="text-[8px] font-bold text-blue-400 whitespace-nowrap">{inputs.exitCapRate.toFixed(2)}%</span>
                    <div className="w-2 h-2 mt-0.5 bg-blue-400 rounded-full border-2 border-slate-900" />
                  </div>
                  {/* Scale labels */}
                  <div className="absolute top-7 left-0 text-[8px] text-slate-600">{barMin}%</div>
                  <div className="absolute top-7 right-0 text-[8px] text-slate-600">{barMax}%</div>
                </div>
              );
            })()}
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[9px] text-slate-500 uppercase">Entry Cap</p>
              <p className="text-sm font-bold text-white">{structureAnalysis ? fmtPct(structureAnalysis.capRate) : "—"}</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 uppercase">Market Avg</p>
              <p className="text-sm font-bold text-violet-400">{marketCapRate.marketCapRate.toFixed(2)}%</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-500 uppercase">Trend</p>
              <p className={`text-sm font-bold ${
                marketCapRate.trend === "compressing" ? "text-emerald-400" :
                marketCapRate.trend === "expanding" ? "text-red-400" : "text-slate-400"
              }`}>
                {marketCapRate.trend === "compressing" ? "↓" : marketCapRate.trend === "expanding" ? "↑" : "→"} {Math.abs(marketCapRate.trendBpsPerYear)}bp/yr
              </p>
            </div>
          </div>

          {/* Suggested exit cap */}
          {Math.abs(inputs.exitCapRate - marketCapRate.suggestedExitCap) > 0.25 && (
            <button
              onClick={() => update({ exitCapRate: marketCapRate.suggestedExitCap })}
              className="w-full text-[10px] text-violet-400 hover:text-violet-300 bg-violet-500/5 hover:bg-violet-500/10 rounded py-1.5 transition-colors"
            >
              Apply suggested exit cap: {marketCapRate.suggestedExitCap.toFixed(2)}% (market + 25bp)
            </button>
          )}

          <p className="text-[9px] text-slate-600">{marketCapRate.methodology}</p>
        </div>
      )}

      {/* Exit Sensitivity (from structure analysis) */}
      {structureAnalysis?.exitSensitivity && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {(["optimistic", "base", "conservative"] as const).map(sc => {
            const s = structureAnalysis.exitSensitivity![sc];
            return (
              <div key={sc} className={`rounded-lg p-2 ${sc === "base" ? "bg-blue-500/10 border border-blue-500/20" : "bg-white/[0.02] border border-white/5"}`}>
                <p className="text-[9px] text-slate-500 uppercase">{sc}</p>
                <p className="text-[10px] text-slate-400">{s.capRate.toFixed(2)}% cap</p>
                <p className="text-sm font-bold text-white">{fmt(s.salePrice)}</p>
                <p className={`text-[10px] font-medium ${s.irr >= 15 ? "text-emerald-400" : s.irr >= 8 ? "text-amber-400" : "text-red-400"}`}>
                  {isFinite(s.irr) ? `${s.irr.toFixed(1)}% IRR` : "N/A"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Field label="Selling Costs" value={inputs.sellingCostPercent} onChange={v => update({ sellingCostPercent: v })} suffix="%" step="0.5" aiAssumed={isAi("sellingCostPercent")} onClearAi={() => clearAi("sellingCostPercent")} />
    </Section>
  );
}
