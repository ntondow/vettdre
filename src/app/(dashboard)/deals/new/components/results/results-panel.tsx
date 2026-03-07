"use client";

import React from "react";
import { Info } from "lucide-react";
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
  Cell,
  ReferenceLine,
} from "recharts";
import { useDealModeler } from "../../deal-modeler-context";
import { MetricGauge, PnlRow, PnlRowFull, Section } from "../shared/field";
import { fmt, fmtPct, fmtX } from "../shared/format-utils";

export function ResultsPanel() {
  const {
    inputs,
    outputs,
    totalUnits,
    structureAnalysis,
    activeStructure,
    mergedStructureInputs,
    showComparison,
    setShowComparison,
    comparisonResults,
    fredRate,
    closingCostBreakdown,
    expenseFlags,
    getFlagForField,
    applySuggestedAmount,
    ll97Projection,
    marketCapRate,
    expenseBenchmark,
    comps,
    compSummary,
    compsLoading,
    compRadius,
    setCompRadius,
    compYears,
    setCompYears,
    compMinUnits,
    setCompMinUnits,
    loadComps,
    propertyDetails,
    update,
    isAi,
  } = useDealModeler();

  return (
    <div className="flex-1 min-w-0 space-y-6 lg:max-h-[calc(100vh-65px)] lg:overflow-y-auto lg:sticky lg:top-[65px] no-scrollbar">

      {/* ==================== Structure Analysis ==================== */}
      {structureAnalysis && (
        <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">{structureAnalysis.label} Structure Analysis</h3>
            <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">Deal Structure Engine</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "CoC Return", value: fmtPct(structureAnalysis.cashOnCash), color: structureAnalysis.cashOnCash >= 8 ? "text-green-400" : structureAnalysis.cashOnCash >= 4 ? "text-amber-400" : "text-red-400" },
                { label: "IRR", value: isFinite(structureAnalysis.irr) ? fmtPct(structureAnalysis.irr) : "N/A", color: structureAnalysis.irr >= 15 ? "text-green-400" : structureAnalysis.irr >= 8 ? "text-amber-400" : "text-red-400" },
                { label: "Equity Multiple", value: fmtX(structureAnalysis.equityMultiple), color: structureAnalysis.equityMultiple >= 2 ? "text-green-400" : structureAnalysis.equityMultiple >= 1.5 ? "text-amber-400" : "text-red-400" },
                { label: "DSCR", value: structureAnalysis.dscr > 0 ? fmtX(structureAnalysis.dscr) : "N/A", color: structureAnalysis.dscr >= 1.25 ? "text-green-400" : structureAnalysis.dscr >= 1.0 ? "text-amber-400" : "text-red-400" },
              ].map(m => (
                <div key={m.label} className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{m.label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div className="flex justify-between py-1"><span className="text-slate-500">Total Equity</span><span className="font-medium text-white">{fmt(structureAnalysis.totalEquity)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">Total Debt</span><span className="font-medium text-white">{fmt(structureAnalysis.totalDebt)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">Year 1 Cash Flow</span><span className={`font-medium ${structureAnalysis.cashFlow >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(structureAnalysis.cashFlow)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">Break-even Occ.</span><span className="font-medium text-white">{fmtPct(structureAnalysis.breakEvenOccupancy)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">Projected Sale</span><span className="font-medium text-white">{fmt(structureAnalysis.projectedSalePrice)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">Total Profit</span><span className={`font-medium ${structureAnalysis.totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(structureAnalysis.totalProfit)}</span></div>
            </div>

            {/* BRRRR-specific */}
            {structureAnalysis.structure === "bridge_refi" && structureAnalysis.cashOutOnRefi != null && (
              <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-emerald-500/20">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">BRRRR Metrics</p>
                  {(structureAnalysis.cashLeftInDeal || 0) <= 0 && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">Infinite Return</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500">Cash-Out on Refi</span><span className="font-medium text-emerald-400">{fmt(structureAnalysis.cashOutOnRefi)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Cash Left in Deal</span><span className={`font-medium ${(structureAnalysis.cashLeftInDeal || 0) <= 0 ? "text-emerald-400" : "text-white"}`}>{fmt(structureAnalysis.cashLeftInDeal || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Refi Loan</span><span className="font-medium text-white">{fmt(structureAnalysis.refiLoanAmount || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Bridge Cost</span><span className="font-medium text-red-400">{fmt(structureAnalysis.totalBridgeCost || 0)}</span></div>
                </div>
              </div>
            )}

            {/* Pre-Stabilization Timeline */}
            {structureAnalysis.structure === "bridge_refi" && (structureAnalysis as any).preStabSummary && (
              <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-blue-500/20">
                <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wider mb-2">Pre-Stabilization Timeline</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center bg-white/[0.03] rounded p-2">
                    <p className="text-[10px] text-slate-500">J-Curve Depth</p>
                    <p className="text-sm font-bold text-red-400">{fmt((structureAnalysis as any).preStabSummary.totalNegativeCashFlow)}</p>
                  </div>
                  <div className="text-center bg-white/[0.03] rounded p-2">
                    <p className="text-[10px] text-slate-500">Breakeven</p>
                    <p className="text-sm font-bold text-amber-400">{(structureAnalysis as any).preStabSummary.monthsToBreakeven}mo</p>
                  </div>
                  <div className="text-center bg-white/[0.03] rounded p-2">
                    <p className="text-[10px] text-slate-500">Stabilized</p>
                    <p className="text-sm font-bold text-emerald-400">{(structureAnalysis as any).preStabSummary.monthsToStabilization}mo</p>
                  </div>
                </div>
                {/* J-Curve Mini Chart */}
                {(() => {
                  const months = (structureAnalysis as any).preStabSummary.months as { month: number; phase: string; occupancy: number; grossIncome: number; expenses: number; bridgeInterest: number; netCashFlow: number; cumulativeCashFlow: number; renovationDraw: number }[];
                  const maxAbs = Math.max(...months.map(m => Math.abs(m.cumulativeCashFlow)), 1);
                  const chartH = 48;
                  return (
                    <div className="mb-3">
                      <div className="flex items-end gap-px" style={{ height: chartH }}>
                        {months.map((m, i) => {
                          const h = Math.abs(m.cumulativeCashFlow) / maxAbs * chartH;
                          const isNeg = m.cumulativeCashFlow < 0;
                          return (
                            <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: chartH }}>
                              {isNeg ? (
                                <React.Fragment>
                                  <div style={{ flex: 1 }} />
                                  <div className="bg-red-500/40 rounded-t-[1px]" style={{ height: h }} title={`Month ${m.month}: ${fmt(m.cumulativeCashFlow)}`} />
                                </React.Fragment>
                              ) : (
                                <React.Fragment>
                                  <div style={{ flex: 1 }} />
                                  <div className="bg-emerald-500/40 rounded-t-[1px]" style={{ height: h }} title={`Month ${m.month}: ${fmt(m.cumulativeCashFlow)}`} />
                                </React.Fragment>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                        <span>Month 1</span>
                        <span>Month {months.length}</span>
                      </div>
                    </div>
                  );
                })()}
                {/* Monthly Detail Table (collapsible) */}
                <details className="group">
                  <summary className="text-[10px] text-blue-400 cursor-pointer hover:text-blue-300 font-medium">Monthly Detail</summary>
                  <div className="mt-2 max-h-48 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-slate-500 border-b border-white/5">
                          <th className="text-left py-1 font-medium">Mo</th>
                          <th className="text-left py-1 font-medium">Phase</th>
                          <th className="text-right py-1 font-medium">Occ%</th>
                          <th className="text-right py-1 font-medium">Income</th>
                          <th className="text-right py-1 font-medium">Net CF</th>
                          <th className="text-right py-1 font-medium">Cumul.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((structureAnalysis as any).preStabSummary.months as { month: number; phase: string; occupancy: number; grossIncome: number; netCashFlow: number; cumulativeCashFlow: number }[]).map((m) => (
                          <tr key={m.month} className="border-b border-white/[0.03]">
                            <td className="py-0.5 text-slate-400">{m.month}</td>
                            <td className="py-0.5"><span className={`px-1 py-0.5 rounded text-[9px] ${m.phase === 'construction' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>{m.phase === 'construction' ? 'Reno' : 'Lease'}</span></td>
                            <td className="py-0.5 text-right text-slate-300 font-mono">{m.occupancy}%</td>
                            <td className="py-0.5 text-right text-slate-300 font-mono">{fmt(m.grossIncome)}</td>
                            <td className={`py-0.5 text-right font-mono ${m.netCashFlow < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(m.netCashFlow)}</td>
                            <td className={`py-0.5 text-right font-mono ${m.cumulativeCashFlow < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(m.cumulativeCashFlow)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            {/* Assumable-specific */}
            {structureAnalysis.structure === "assumable" && structureAnalysis.annualRateSavings != null && (
              <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-green-500/20">
                <p className="text-[10px] text-green-400 font-medium uppercase tracking-wider mb-2">Rate Advantage</p>
                {/* Visual rate comparison */}
                {(() => {
                  const assumed = structureAnalysis.blendedRate || ((mergedStructureInputs as any).existingRate || 3.5);
                  const market = fredRate || 7;
                  const maxR = Math.max(assumed, market, 1);
                  return (
                    <div className="space-y-2 mb-3">
                      <div>
                        <div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-500">Blended Rate</span><span className="text-emerald-400 font-mono font-medium">{fmtPct(assumed)}</span></div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(assumed / maxR) * 100}%` }} /></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-500">Market Rate</span><span className="text-amber-400 font-mono font-medium">{fmtPct(market)}</span></div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${(market / maxR) * 100}%` }} /></div>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase">Annual</p>
                    <p className="font-bold text-emerald-400">{fmt(structureAnalysis.annualRateSavings)}</p>
                  </div>
                  <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase">Total</p>
                    <p className="font-bold text-emerald-400">{fmt(structureAnalysis.totalRateSavings || 0)}</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                    <p className="text-[9px] text-slate-500 uppercase">Blended</p>
                    <p className="font-bold text-white">{fmtPct(structureAnalysis.blendedRate || 0)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Syndication waterfall visualization */}
            {structureAnalysis.structure === "syndication" && structureAnalysis.gpIrr != null && (() => {
              const gpPct = (mergedStructureInputs as any).gpEquityPct ?? 10;
              const lpPct = (mergedStructureInputs as any).lpEquityPct ?? 90;
              const prefReturn = (mergedStructureInputs as any).preferredReturn ?? 8;
              const gpPromotePref = (mergedStructureInputs as any).gpPromoteAbovePref ?? 20;
              const irrHurdle = (mergedStructureInputs as any).irrHurdle ?? 15;
              const gpPromoteHurdle = (mergedStructureInputs as any).gpPromoteAboveHurdle ?? 30;
              const gpTotal = structureAnalysis.gpTotalReturn || 0;
              const lpTotal = structureAnalysis.lpTotalReturn || 0;
              const totalReturns = gpTotal + lpTotal;
              const gpPctOfReturns = totalReturns > 0 ? (gpTotal / totalReturns * 100) : 0;
              const lpPctOfReturns = totalReturns > 0 ? (lpTotal / totalReturns * 100) : 0;
              const tiers = [
                { label: `Preferred Return (${prefReturn}%)`, lpSplit: 100, gpSplit: 0, shade: "bg-violet-500/20" },
                { label: "Above Pref", lpSplit: 100 - gpPromotePref, gpSplit: gpPromotePref, shade: "bg-violet-500/40" },
                { label: `Above ${irrHurdle}% IRR`, lpSplit: 100 - gpPromoteHurdle, gpSplit: gpPromoteHurdle, shade: "bg-violet-500/60" },
              ];
              return (
                <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-violet-500/20">
                  <p className="text-[10px] text-violet-400 font-medium uppercase tracking-wider mb-3">Promote Waterfall</p>
                  <div className="space-y-2 mb-3">
                    {tiers.map((t, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-slate-400">{t.label}</span>
                          <span className="text-slate-500">{t.lpSplit}% LP / {t.gpSplit}% GP</span>
                        </div>
                        <div className="h-3 bg-white/5 rounded-full overflow-hidden flex">
                          <div className="h-full bg-blue-500/60 transition-all" style={{ width: `${t.lpSplit}%` }} />
                          <div className={`h-full ${t.shade} transition-all`} style={{ width: `${t.gpSplit}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-slate-500 mb-3">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500/60" /> LP</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-500/40" /> GP Promote</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-violet-500/10 rounded-lg p-2.5 text-center border border-violet-500/20">
                      <p className="text-[9px] text-slate-500 uppercase mb-0.5">GP Total</p>
                      <p className="text-sm font-bold text-violet-400">{fmt(gpTotal)}</p>
                      <p className="text-[10px] text-slate-500">{gpPctOfReturns.toFixed(0)}% of returns</p>
                      <div className="flex justify-center gap-3 mt-1 text-[10px]">
                        <span className="text-slate-400">IRR: <span className="text-violet-400 font-medium">{fmtPct(structureAnalysis.gpIrr || 0)}</span></span>
                        <span className="text-slate-400">{fmtX(structureAnalysis.gpEquityMultiple || 0)}</span>
                      </div>
                    </div>
                    <div className="bg-blue-500/10 rounded-lg p-2.5 text-center border border-blue-500/20">
                      <p className="text-[9px] text-slate-500 uppercase mb-0.5">LP Total</p>
                      <p className="text-sm font-bold text-blue-400">{fmt(lpTotal)}</p>
                      <p className="text-[10px] text-slate-500">{lpPctOfReturns.toFixed(0)}% of returns</p>
                      <div className="flex justify-center gap-3 mt-1 text-[10px]">
                        <span className="text-slate-400">IRR: <span className="text-blue-400 font-medium">{fmtPct(structureAnalysis.lpIrr || 0)}</span></span>
                        <span className="text-slate-400">{fmtX(structureAnalysis.lpEquityMultiple || 0)}</span>
                      </div>
                    </div>
                  </div>
                  {(structureAnalysis as any).feeSchedule && (
                    <div className="mt-3 border-t border-white/10 pt-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">Sponsor Fee Schedule</p>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between"><span className="text-slate-500">Acquisition Fee <span className="text-slate-600">(at close)</span></span><span className="text-white font-mono">{fmt((structureAnalysis as any).feeSchedule.acquisitionFee)}</span></div>
                        {(structureAnalysis as any).feeSchedule.constructionMgmtFee > 0 && (
                          <div className="flex justify-between"><span className="text-slate-500">Construction Mgmt <span className="text-slate-600">(at close)</span></span><span className="text-white font-mono">{fmt((structureAnalysis as any).feeSchedule.constructionMgmtFee)}</span></div>
                        )}
                        <div className="flex justify-between"><span className="text-slate-500">Asset Mgmt <span className="text-slate-600">(annual)</span></span><span className="text-white font-mono">{fmt((structureAnalysis as any).feeSchedule.assetMgmtFeeAnnual)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Disposition Fee <span className="text-slate-600">(at exit)</span></span><span className="text-white font-mono">{fmt((structureAnalysis as any).feeSchedule.dispositionFee)}</span></div>
                        <div className="flex justify-between pt-1 border-t border-white/5"><span className="text-slate-400 font-medium">Total Fees (over hold)</span><span className="text-white font-bold font-mono">{fmt((structureAnalysis as any).feeSchedule.totalFees)}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ==================== Comparison Table ==================== */}
      {showComparison && comparisonResults.length > 0 && (
        <div className="bg-slate-800/20 border border-violet-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 bg-white/[0.03] flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Structure Comparison</h3>
            <button onClick={() => setShowComparison(false)} className="text-xs text-violet-400 hover:text-violet-300">Close</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500">Metric</th>
                  {comparisonResults.map(r => (
                    <th key={r.structure} className={`text-center px-3 py-3 font-semibold ${r.structure === activeStructure ? "text-blue-400 bg-blue-500/10" : "text-slate-500"}`}>
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  { key: "cashOnCash", label: "Cash-on-Cash", format: fmtPct, best: "max" as const },
                  { key: "irr", label: "IRR", format: fmtPct, best: "max" as const },
                  { key: "equityMultiple", label: "Equity Multiple", format: fmtX, best: "max" as const },
                  { key: "totalEquity", label: "Total Equity", format: fmt, best: "min" as const },
                  { key: "totalDebt", label: "Total Debt", format: fmt, best: "min" as const },
                  { key: "dscr", label: "DSCR", format: fmtX, best: "max" as const },
                  { key: "cashFlow", label: "Year 1 Cash Flow", format: fmt, best: "max" as const },
                  { key: "breakEvenOccupancy", label: "Break-even Occ.", format: fmtPct, best: "min" as const },
                  { key: "totalProfit", label: "Total Profit", format: fmt, best: "max" as const },
                ]).map(({ key, label, format, best }) => {
                  const values = comparisonResults.map(r => (r as unknown as Record<string, number>)[key]);
                  const validValues = values.filter(v => isFinite(v) && v !== 0);
                  const bestVal = validValues.length > 0 ? (best === "max" ? Math.max(...validValues) : Math.min(...validValues)) : null;
                  return (
                    <tr key={key} className="border-t border-white/5">
                      <td className="px-4 py-2 font-medium text-slate-400">{label}</td>
                      {comparisonResults.map(r => {
                        const val = (r as unknown as Record<string, number>)[key];
                        const isBest = bestVal !== null && isFinite(val) && val !== 0 && val === bestVal;
                        return (
                          <td key={r.structure} className={`text-center px-3 py-2 font-medium ${isBest ? "text-green-400 bg-green-500/10" : r.structure === activeStructure ? "text-blue-400 bg-blue-500/5" : "text-slate-200"}`}>
                            {isFinite(val) ? format(val) : "N/A"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== KPI Cards with Semi-Circular Gauges ==================== */}
      {(() => {
        const hasData = inputs.purchasePrice > 0 && outputs.noi !== 0;
        const beOcc = outputs.totalIncome > 0 ? ((outputs.totalExpenses + outputs.annualDebtService) / outputs.totalIncome) * 100 : 0;
        const kpis = [
          { label: "Cash-on-Cash", value: outputs.cashOnCashAmort, display: fmtPct(outputs.cashOnCashAmort), min: 0, max: 20, thresholds: [8, 4], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "Annual cash flow \u00f7 total equity invested. Target: 8-12% for stabilized multifamily." },
          { label: "IRR", value: outputs.irr, display: isFinite(outputs.irr) ? fmtPct(outputs.irr) : "N/A", min: 0, max: 30, thresholds: [15, 8], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "Internal Rate of Return \u2014 time-weighted annualized return over hold period. Target: 15%+ for value-add." },
          { label: "Equity Multiple", value: outputs.equityMultiple, display: fmtX(outputs.equityMultiple), min: 0, max: 4, thresholds: [2, 1.5], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "Total profit \u00f7 equity invested. 2.0x = you doubled your money. Target: 1.5-2.5x over 5-7 years." },
          { label: "Cap Rate", value: outputs.capRate, display: fmtPct(outputs.capRate), min: 0, max: 12, thresholds: [5, 3], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "NOI \u00f7 purchase price. Higher = better yield. NYC multifamily: 4-6% typical." },
          { label: "DSCR", value: outputs.dscr, display: fmtX(outputs.dscr), min: 0, max: 3, thresholds: [1.25, 1.0], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "NOI \u00f7 annual debt service. Lenders require 1.20-1.25x minimum. Below 1.0x = negative cash flow." },
          { label: "Break-Even Occ.", value: beOcc, display: `${beOcc.toFixed(1)}%`, min: 0, max: 100, thresholds: [75, 90], hex: ["#34d399", "#fbbf24", "#f87171"], invert: true, tip: "Occupancy needed to cover expenses + debt service. Below 75% = strong cushion. Above 90% = risky." },
          { label: "Cap on Cost", value: outputs.capRateOnCost, display: fmtPct(outputs.capRateOnCost), min: 0, max: 12, thresholds: [6, 4], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "NOI \u00f7 total project cost (purchase + closing + reno). Shows yield on all-in basis. Higher than going-in cap = value creation." },
        ];
        return (
          <div className="sticky top-0 z-10 bg-[#0B0F19]/95 backdrop-blur-sm pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {kpis.map(k => {
                if (!hasData) {
                  return (
                    <div key={k.label} className="border border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center">
                      <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider mb-1">{k.label}</p>
                      <div className="w-20 -mb-3 opacity-20">
                        <MetricGauge value={0} min={k.min} max={k.max} color="rgba(255,255,255,0.1)" />
                      </div>
                      <p className="text-lg font-bold text-slate-700">&mdash;</p>
                    </div>
                  );
                }
                const hexColor = k.invert
                  ? (k.value <= k.thresholds[0] ? k.hex[0] : k.value <= k.thresholds[1] ? k.hex[1] : k.hex[2])
                  : (k.value >= k.thresholds[0] ? k.hex[0] : k.value >= k.thresholds[1] ? k.hex[1] : k.hex[2]);
                const textColor = k.invert
                  ? (k.value <= k.thresholds[0] ? "text-emerald-400" : k.value <= k.thresholds[1] ? "text-amber-400" : "text-red-400")
                  : (k.value >= k.thresholds[0] ? "text-emerald-400" : k.value >= k.thresholds[1] ? "text-amber-400" : "text-red-400");
                return (
                  <div key={k.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col items-center relative group">
                    <div className="flex items-center gap-1 mb-1">
                      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{k.label}</p>
                      <Info className="w-3 h-3 text-slate-600 cursor-help" />
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 p-2.5 bg-[#0B0F19] border border-white/10 rounded-lg shadow-xl text-[10px] text-slate-300 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
                        {k.tip}
                      </div>
                    </div>
                    <div className="w-20 -mb-3">
                      <MetricGauge value={k.value} min={k.min} max={k.max} color={hexColor} />
                    </div>
                    <p className={`text-lg font-bold transition-all duration-200 ${textColor}`}>{k.display}</p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ==================== Year 1 Budget P&L ==================== */}
      <div className="bg-slate-800/20 border border-blue-500/20 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 bg-white/[0.03] flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Year 1 Budget P&L</h3>
          {expenseFlags.length > 0 && (
            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">
              {expenseFlags.length} flag{expenseFlags.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="p-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                <th className="text-left py-1 font-medium">Line Item</th>
                <th className="text-right py-1 font-medium">Year 1 Budget</th>
                <th className="text-right py-1 font-medium">Per Unit</th>
                <th className="text-right py-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {/* RESIDENTIAL INCOME */}
              <tr className="border-t border-white/5"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-400">Residential Income</td></tr>
              <PnlRowFull label="Gross Potential Residential Rent" value={outputs.grossPotentialResidentialRent} perUnit={totalUnits > 0 ? Math.round(outputs.grossPotentialResidentialRent / totalUnits) : undefined} />
              <PnlRowFull label="Less: Residential Vacancy" value={-outputs.residentialVacancyLoss} indent note={`${inputs.residentialVacancyRate}%`} />
              {outputs.concessionsLoss > 0 && <PnlRowFull label="Less: Concessions" value={-outputs.concessionsLoss} indent />}
              <PnlRowFull label="Net Residential Rental Income" value={outputs.netResidentialIncome} bold border />

              {/* COMMERCIAL INCOME */}
              {outputs.grossPotentialCommercialRent > 0 && (
                <>
                  <tr className="border-t border-white/5"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-400">Commercial Income</td></tr>
                  <PnlRowFull label="Gross Potential Commercial Rent" value={outputs.grossPotentialCommercialRent} />
                  <PnlRowFull label="Less: Commercial Vacancy" value={-outputs.commercialVacancyLoss} indent note={`${inputs.commercialVacancyRate}%`} />
                  {outputs.commercialConcessionsLoss > 0 && <PnlRowFull label="Less: Concessions" value={-outputs.commercialConcessionsLoss} indent />}
                  <PnlRowFull label="Net Commercial Rental Income" value={outputs.netCommercialIncome} bold border />
                </>
              )}

              {/* OTHER INCOME */}
              {outputs.totalOtherIncome > 0 && (
                <>
                  <tr className="border-t border-white/5"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-400">Other Income</td></tr>
                  <PnlRowFull label="Total Other Income" value={outputs.totalOtherIncome} />
                </>
              )}

              {/* TOTAL INCOME */}
              <tr className="border-t-2 border-white/10">
                <td className="py-2 font-bold text-white">TOTAL INCOME</td>
                <td className="py-2 text-right font-bold text-white">{fmt(outputs.totalIncome)}</td>
                <td className="py-2 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.totalIncome / totalUnits)) : ""}</td>
                <td></td>
              </tr>

              {/* OPERATING EXPENSES */}
              <tr><td colSpan={4} className="pt-4 pb-1 text-[10px] uppercase tracking-wider font-bold text-red-400">Operating Expenses</td></tr>
              {outputs.expenseDetails.filter(d => d.amount > 0).map((d, i) => {
                const flag = d.field ? getFlagForField(d.field) : undefined;
                return (
                  <tr key={i} className={`border-t border-white/[0.03] ${flag ? "bg-amber-500/5" : ""}`}>
                    <td className="py-1.5 text-slate-400 flex items-center gap-1">
                      {flag && <span className="text-amber-400 cursor-help" title={flag.message}>&#9888;</span>}
                      {d.label}
                      {d.source && (
                        <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${d.source === 't12' ? 'bg-blue-500/10 text-blue-400' : d.source === 'ai_estimate' ? 'bg-purple-500/10 text-purple-400' : 'bg-white/5 text-slate-500'}`}>
                          {d.methodology || d.source}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right text-slate-200">{fmt(d.amount)}</td>
                    <td className="py-1.5 text-right text-xs text-slate-500">{d.perUnit != null && d.perUnit > 0 ? fmt(d.perUnit) : ""}</td>
                    <td className="py-1.5 text-right">
                      {flag && flag.suggestedAmount != null && (
                        <button
                          onClick={() => applySuggestedAmount(flag)}
                          className="text-[9px] text-blue-400 hover:text-blue-300 underline"
                        >
                          Use {fmt(flag.suggestedAmount)}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-white/5">
                <td className="py-2 font-semibold text-white">Total Operating Expenses</td>
                <td className="py-2 text-right font-semibold text-red-400">{fmt(outputs.totalExpenses)}</td>
                <td className="py-2 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.totalExpenses / totalUnits)) : ""}</td>
                <td></td>
              </tr>

              {/* NOI */}
              <tr className="border-t-2 border-double border-white/10">
                <td className="py-3 font-bold text-lg text-white">NET OPERATING INCOME</td>
                <td className={`py-3 text-right font-bold text-lg ${outputs.noi >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(outputs.noi)}</td>
                <td className="py-3 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.noi / totalUnits)) : ""}</td>
                <td></td>
              </tr>

              {/* Below NOI */}
              <PnlRowFull label="IO Debt Service" value={-outputs.ioAnnualPayment} />
              <PnlRowFull label="Net Income (IO)" value={outputs.netIncomeIO} bold border />
              <PnlRowFull label="Amort Debt Service (30yr)" value={-outputs.annualDebtService} />
              <PnlRowFull label="Net Income (Amort)" value={outputs.netIncomeAmort} bold border />
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== Analysis ==================== */}
      <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Analysis</h3></div>
        <div className="p-5">
          <table className="w-full text-sm">
            <tbody>
              <PnlRow label="Purchase Price" value={inputs.purchasePrice} />
              <PnlRow label="Cap Rate" value={0} customValue={fmtPct(outputs.capRate)} />
              <PnlRow label={`Loan Size (${inputs.ltvPercent}% LTV)`} value={outputs.loanAmount} />
              <PnlRow label="Equity In + Closing" value={outputs.totalEquity} />
              <PnlRow label="Interest Rate" value={0} customValue={`${inputs.interestRate}%`} />
              <PnlRow label="IO Payment (Annual)" value={outputs.ioAnnualPayment} />
              <PnlRow label="Amort Payment (30yr)" value={outputs.annualDebtService} />
              <PnlRow label="Net Income (IO Loan)" value={outputs.netIncomeIO} bold border />
              <PnlRow label="Net Income (Amort Loan)" value={outputs.netIncomeAmort} bold border />
              <PnlRow label="Cash-on-Cash (IO)" value={0} customValue={fmtPct(outputs.cashOnCashIO)} />
              <PnlRow label="Cash-on-Cash (Amort)" value={0} customValue={fmtPct(outputs.cashOnCashAmort)} />
              <PnlRow label="Loan-to-Value" value={0} customValue={fmtPct(inputs.ltvPercent)} />
              <PnlRow label="DSCR (30yr Amort)" value={0} customValue={fmtX(outputs.dscr)} />
              <PnlRow label="Debt Yield" value={0} customValue={fmtPct(outputs.debtYield)} />
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== Cash Flow Chart ==================== */}
      <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-semibold text-slate-200">Cash Flow</h3>
        </div>
        <div className="px-4 py-3" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={[
              ...outputs.cashFlows.map(cf => ({
                name: `Yr ${cf.year}`,
                cashFlow: cf.cashFlow,
                cumulative: cf.cumulativeCashFlow,
                isExit: false,
              })),
              {
                name: "Exit",
                cashFlow: outputs.exitProceeds,
                cumulative: outputs.cashFlows.length > 0 ? outputs.cashFlows[outputs.cashFlows.length - 1].cumulativeCashFlow + outputs.exitProceeds : outputs.exitProceeds,
                isExit: true,
              },
            ]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "rgba(255,255,255,0.05)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 || v <= -1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 || v <= -1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`} width={55} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0B0F19", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value?: number, name?: string) => [fmt(Math.round(value ?? 0)), name === "cashFlow" ? "Cash Flow" : "Cumulative"]}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
              <Bar dataKey="cashFlow" radius={[3, 3, 0, 0]} maxBarSize={28}>
                {[...outputs.cashFlows.map(cf => ({ isExit: false, cashFlow: cf.cashFlow })), { isExit: true, cashFlow: outputs.exitProceeds }].map((entry, i) => (
                  <Cell key={i} fill={entry.isExit ? "#3b82f6" : entry.cashFlow >= 0 ? "#34d399" : "#f87171"} fillOpacity={entry.isExit ? 0.8 : 0.6} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="cumulative" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ==================== Year-by-Year Projections ==================== */}
      <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
        <Section title="Year-by-Year Projections" defaultOpen={false} summary={`${outputs.cashFlows.length} years + exit`}>
          <div className="overflow-x-auto -mx-4 -mb-3">
            <table className="w-full text-xs font-mono min-w-[700px]">
              <thead className="bg-white/[0.03] sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-slate-500 tabular-nums">Year</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Income</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Vacancy</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">NOI</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Debt Svc</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Cash Flow</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Value</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-500">Equity</th>
                </tr>
              </thead>
              <tbody>
                {outputs.cashFlows.map((cf, i) => {
                  const projValue = inputs.exitCapRate > 0 ? cf.noi / (inputs.exitCapRate / 100) : 0;
                  const loanBal = outputs.loanAmount; // simplified -- principal paydown ignored for projection
                  const equity = projValue - loanBal;
                  return (
                    <tr key={cf.year} className={`border-t border-white/5 ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}>
                      <td className="px-4 py-1.5 font-medium text-slate-300 tabular-nums">{cf.year}</td>
                      <td className="text-right px-3 py-1.5 text-slate-400 tabular-nums">{fmt(cf.egi)}</td>
                      <td className="text-right px-3 py-1.5 text-red-400/70 tabular-nums">({fmt(cf.vacancy)})</td>
                      <td className="text-right px-3 py-1.5 font-medium text-white tabular-nums">{fmt(cf.noi)}</td>
                      <td className="text-right px-3 py-1.5 text-red-400/70 tabular-nums">({fmt(cf.debtService)})</td>
                      <td className={`text-right px-3 py-1.5 font-medium tabular-nums ${cf.cashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(cf.cashFlow)}</td>
                      <td className="text-right px-3 py-1.5 text-slate-400 tabular-nums">{projValue > 0 ? fmt(Math.round(projValue)) : "\u2014"}</td>
                      <td className={`text-right px-3 py-1.5 tabular-nums ${equity >= 0 ? "text-blue-400" : "text-red-400"}`}>{projValue > 0 ? fmt(Math.round(equity)) : "\u2014"}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-white/10 bg-blue-500/5">
                  <td className="px-4 py-2 font-semibold text-slate-200">Exit</td>
                  <td colSpan={2} className="text-right px-3 py-2 text-[10px] text-slate-500">Sale @ {fmtPct(inputs.exitCapRate)} Cap</td>
                  <td className="text-right px-3 py-2 font-medium text-white tabular-nums">{fmt(outputs.exitValue)}</td>
                  <td className="text-right px-3 py-2 text-red-400 tabular-nums">({fmt(outputs.loanBalanceAtExit)})</td>
                  <td className="text-right px-3 py-2 font-bold text-blue-400 tabular-nums">{fmt(outputs.exitProceeds)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* ==================== Sensitivity Matrix ==================== */}
      <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Sensitivity Analysis &mdash; IRR</h3></div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-slate-500 font-medium">{outputs.sensitivity.rowParam} \ {outputs.sensitivity.colParam}</th>
                {outputs.sensitivity.colLabels.map((cl, i) => (
                  <th key={i} className={`px-3 py-2 text-center font-medium ${cl === "Base" ? "text-blue-400 bg-blue-500/10" : "text-slate-500"}`}>{cl}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outputs.sensitivity.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-white/5">
                  <td className={`px-3 py-2 font-medium ${outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%` ? "text-blue-400 bg-blue-500/10" : "text-slate-400"}`}>
                    {outputs.sensitivity.rowLabels[ri]}
                  </td>
                  {row.map((val, ci) => {
                    const isBase = outputs.sensitivity.colLabels[ci] === "Base" && outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%`;
                    return (
                      <td key={ci} className={`px-3 py-2 text-center font-medium ${isBase ? "bg-blue-500/20 text-blue-300 font-bold" : val >= 15 ? "text-green-400" : val >= 8 ? "text-amber-400" : "text-red-400"}`}>
                        {isFinite(val) ? `${val.toFixed(1)}%` : "N/A"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== Sources & Uses ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Sources</h3>
          </div>
          <div className="px-4 py-2">
            {outputs.sources.map((s, i) => (
              <div key={i} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                <span className="text-xs text-slate-400">{s.label}</span>
                <span className="text-xs font-mono tabular-nums font-medium text-white">{fmt(s.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1.5 mt-0.5 border-t border-white/10">
              <span className="text-xs font-semibold text-white">Total</span>
              <span className="text-xs font-mono tabular-nums font-bold text-white">{fmt(outputs.sources.reduce((s, r) => s + r.amount, 0))}</span>
            </div>
          </div>
        </div>
        <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Uses</h3>
          </div>
          <div className="px-4 py-2">
            {outputs.uses.map((u, i) => {
              // Expand "Closing Costs" line item if we have NYC breakdown
              if (u.label === "Closing Costs" && closingCostBreakdown && inputs.closingCosts === closingCostBreakdown.totalBuyerCosts) {
                return (
                  <div key={i}>
                    <div className="flex justify-between py-1 border-b border-white/5">
                      <span className="text-xs text-slate-400 font-medium">Closing Costs</span>
                      <span className="text-xs font-mono tabular-nums font-medium text-white">{fmt(u.amount)}</span>
                    </div>
                    {closingCostBreakdown.nycTransferTax > 0 && (
                      <div className="flex justify-between py-0.5 pl-3 border-b border-white/[0.02]">
                        <span className="text-[10px] text-slate-500">NYC RPT</span>
                        <span className="text-[10px] font-mono tabular-nums text-slate-400">{fmt(closingCostBreakdown.nycTransferTax)}</span>
                      </div>
                    )}
                    {closingCostBreakdown.nysTransferTax > 0 && (
                      <div className="flex justify-between py-0.5 pl-3 border-b border-white/[0.02]">
                        <span className="text-[10px] text-slate-500">NYS Transfer</span>
                        <span className="text-[10px] font-mono tabular-nums text-slate-400">{fmt(closingCostBreakdown.nysTransferTax)}</span>
                      </div>
                    )}
                    {closingCostBreakdown.mansionTax > 0 && (
                      <div className="flex justify-between py-0.5 pl-3 border-b border-white/[0.02]">
                        <span className="text-[10px] text-slate-500">Mansion Tax</span>
                        <span className="text-[10px] font-mono tabular-nums text-slate-400">{fmt(closingCostBreakdown.mansionTax)}</span>
                      </div>
                    )}
                    {closingCostBreakdown.mortgageRecordingTax > 0 && (
                      <div className="flex justify-between py-0.5 pl-3 border-b border-white/[0.02]">
                        <span className="text-[10px] text-slate-500">MRT</span>
                        <span className="text-[10px] font-mono tabular-nums text-slate-400">{fmt(closingCostBreakdown.mortgageRecordingTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-0.5 pl-3 border-b border-white/5">
                      <span className="text-[10px] text-slate-500">Title + Legal</span>
                      <span className="text-[10px] font-mono tabular-nums text-slate-400">{fmt(closingCostBreakdown.titleInsurance + (closingCostBreakdown.buyerAttorneyFee + closingCostBreakdown.bankAttorneyFee) + closingCostBreakdown.appraisalFee + closingCostBreakdown.environmentalReport + closingCostBreakdown.surveyFee + closingCostBreakdown.miscFees)}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={i} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                  <span className="text-xs text-slate-400">{u.label}</span>
                  <span className="text-xs font-mono tabular-nums font-medium text-white">{fmt(u.amount)}</span>
                </div>
              );
            })}
            <div className="flex justify-between py-1.5 mt-0.5 border-t border-white/10">
              <span className="text-xs font-semibold text-white">Total</span>
              <span className="text-xs font-mono tabular-nums font-bold text-white">{fmt(outputs.uses.reduce((s, r) => s + r.amount, 0))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CEMA Savings Callout ==================== */}
      {closingCostBreakdown && closingCostBreakdown.cemaSavings > 0 && activeStructure === "assumable" && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">&#128176;</span>
            <span className="text-sm font-bold text-emerald-400">CEMA Savings: {fmt(closingCostBreakdown.cemaSavings)}</span>
          </div>
          <p className="text-[11px] text-emerald-300/70 leading-relaxed">
            Mortgage recording tax avoided by assuming the existing mortgage. You only pay MRT on the new financing above the assumed balance.
          </p>
          {closingCostBreakdown.mrtSavings > 0 && closingCostBreakdown.mrtSavings !== closingCostBreakdown.cemaSavings && (
            <p className="text-[10px] text-slate-500 mt-1">Total MRT savings: {fmt(closingCostBreakdown.mrtSavings)}</p>
          )}
        </div>
      )}

      {/* ==================== Exit Analysis ==================== */}
      <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Exit Analysis</h3></div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-slate-500 uppercase">Exit NOI</p><p className="text-lg font-bold text-white">{fmt(outputs.exitNoi)}</p></div>
            <div><p className="text-xs text-slate-500 uppercase">Exit Value</p><p className="text-lg font-bold text-white">{fmt(outputs.exitValue)}</p></div>
            <div><p className="text-xs text-slate-500 uppercase">Loan Balance</p><p className="text-lg font-bold text-red-400">{fmt(outputs.loanBalanceAtExit)}</p></div>
            <div><p className="text-xs text-slate-500 uppercase">Net Proceeds</p><p className="text-lg font-bold text-green-400">{fmt(outputs.exitProceeds)}</p></div>
          </div>
        </div>
      </div>

      {/* ==================== Live Comps ==================== */}
      <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Live Comps</h3>
          {!compsLoading && comps.length === 0 && propertyDetails && (
            <button
              onClick={() => {
                const zip = propertyDetails.bbl?.substring(0, 5) || "";
                if (zip) loadComps(zip);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              Load Comps
            </button>
          )}
        </div>
        <div className="p-5">
          {compsLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full" />
              Searching comparable sales...
            </div>
          ) : comps.length > 0 && compSummary ? (
            <>
              {/* Market comparison */}
              {inputs.purchasePrice > 0 && totalUnits > 0 && compSummary.avgPricePerUnit > 0 && (
                <div className={`mb-4 rounded-lg p-3 ${
                  inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
                }`}>
                  <p className={`text-sm font-medium ${inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "text-green-400" : "text-red-400"}`}>
                    Your offer: {fmt(Math.round(inputs.purchasePrice / totalUnits))}/unit &mdash; Market avg: {fmt(compSummary.avgPricePerUnit)}/unit
                    {" "}({Math.abs(Math.round(((inputs.purchasePrice / totalUnits) / compSummary.avgPricePerUnit - 1) * 100))}% {inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "below" : "above"})
                  </p>
                  {inputs.purchasePrice / totalUnits > compSummary.avgPricePerUnit && (
                    <button
                      onClick={() => update({ purchasePrice: compSummary.avgPricePerUnit * totalUnits })}
                      className="mt-1 text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Use Market Avg as Offer
                    </button>
                  )}
                </div>
              )}

              {/* Summary stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/[0.03] rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase">Comps Found</p>
                  <p className="text-sm font-bold text-white">{compSummary.count}</p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase">Avg $/Unit</p>
                  <p className="text-sm font-bold text-white">{fmt(compSummary.avgPricePerUnit)}</p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase">Median $/Unit</p>
                  <p className="text-sm font-bold text-white">{fmt(compSummary.medianPricePerUnit)}</p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2.5">
                  <p className="text-[10px] text-slate-500 uppercase">Avg $/SqFt</p>
                  <p className="text-sm font-bold text-white">{compSummary.avgPricePerSqft > 0 ? fmt(compSummary.avgPricePerSqft) : "\u2014"}</p>
                </div>
              </div>

              {/* Filter controls */}
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <label className="text-[10px] text-slate-500 flex items-center gap-1">
                  Radius:
                  <select value={compRadius} onChange={e => setCompRadius(parseFloat(e.target.value))} className="bg-slate-800/40 border border-white/5 rounded px-1 py-0.5 text-xs text-white">
                    <option value="0.5">0.5 mi</option>
                    <option value="1">1 mi</option>
                    <option value="2">2 mi</option>
                    <option value="5">5 mi</option>
                    <option value="10">10 mi</option>
                  </select>
                </label>
                <label className="text-[10px] text-slate-500 flex items-center gap-1">
                  Years:
                  <select value={compYears} onChange={e => setCompYears(parseInt(e.target.value))} className="bg-slate-800/40 border border-white/5 rounded px-1 py-0.5 text-xs text-white">
                    <option value="1">1 yr</option>
                    <option value="2">2 yr</option>
                    <option value="3">3 yr</option>
                    <option value="5">5 yr</option>
                  </select>
                </label>
                <label className="text-[10px] text-slate-500 flex items-center gap-1">
                  Min Units:
                  <select value={compMinUnits} onChange={e => setCompMinUnits(parseInt(e.target.value))} className="bg-slate-800/40 border border-white/5 rounded px-1 py-0.5 text-xs text-white">
                    <option value="3">3+</option>
                    <option value="5">5+</option>
                    <option value="10">10+</option>
                    <option value="20">20+</option>
                  </select>
                </label>
                {propertyDetails && (
                  <button
                    onClick={() => {
                      const zip = propertyDetails.bbl?.substring(0, 5) || "";
                      if (zip) loadComps(zip);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Refresh
                  </button>
                )}
              </div>

              {/* Comps table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[700px]">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Address</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-500">Boro</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-500">Units</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-500">SqFt</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-500">Built</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Sale Price</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-500">$/Unit</th>
                      <th className="text-right px-2 py-2 font-medium text-slate-500">$/SqFt</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-500">Date</th>
                      <th className="text-center px-2 py-2 font-medium text-slate-500">Dist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps.slice(0, 20).map((c, i) => (
                      <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                        <td className="px-3 py-1.5 text-slate-200 max-w-[180px] truncate" title={c.address}>{c.address}</td>
                        <td className="text-center px-2 py-1.5 text-slate-400">{c.borough.substring(0, 3)}</td>
                        <td className="text-center px-2 py-1.5 text-white">{c.totalUnits}</td>
                        <td className="text-right px-2 py-1.5 text-slate-400">{c.grossSqft > 0 ? c.grossSqft.toLocaleString() : "\u2014"}</td>
                        <td className="text-center px-2 py-1.5 text-slate-400">{c.yearBuilt || "\u2014"}</td>
                        <td className="text-right px-3 py-1.5 font-medium text-white">{fmt(c.salePrice)}</td>
                        <td className="text-right px-2 py-1.5 text-slate-200">{c.pricePerUnit > 0 ? fmt(c.pricePerUnit) : "\u2014"}</td>
                        <td className="text-right px-2 py-1.5 text-slate-400">{c.pricePerSqft > 0 ? `$${c.pricePerSqft}` : "\u2014"}</td>
                        <td className="text-center px-2 py-1.5 text-slate-400">{c.saleDate ? new Date(c.saleDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : "\u2014"}</td>
                        <td className="text-center px-2 py-1.5 text-slate-500">{c.distance} mi</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">{propertyDetails ? "Click Load Comps to search comparable sales." : "Pre-fill a property to enable comps search."}</p>
          )}
        </div>
      </div>

      {/* ==================== LL97 Carbon Penalty Projection ==================== */}
      {ll97Projection && (
        <div className={`border rounded-xl overflow-hidden ${
          ll97Projection.complianceStatus === "compliant" ? "border-emerald-500/20 bg-emerald-500/5" :
          ll97Projection.complianceStatus === "at_risk_2030" ? "border-amber-500/20 bg-amber-500/5" :
          "border-red-500/20 bg-red-500/5"
        }`}>
          <div className="px-5 py-4 border-b border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">LL97 Carbon Penalties</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                ll97Projection.complianceStatus === "compliant" ? "bg-emerald-500/20 text-emerald-400" :
                ll97Projection.complianceStatus === "at_risk_2030" ? "bg-amber-500/20 text-amber-400" :
                "bg-red-500/20 text-red-400"
              }`}>
                {ll97Projection.complianceStatus === "compliant" ? "Compliant" :
                 ll97Projection.complianceStatus === "at_risk_2030" ? "At Risk 2030" : "Non-Compliant"}
              </span>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-white/[0.03] rounded-lg p-3">
                <p className="text-[10px] text-slate-500 uppercase">Total Over Hold</p>
                <p className={`text-lg font-bold ${ll97Projection.totalPenaltyOverHold > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {ll97Projection.totalPenaltyOverHold > 0 ? fmt(ll97Projection.totalPenaltyOverHold) : "$0"}
                </p>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-3">
                <p className="text-[10px] text-slate-500 uppercase">Avg Annual</p>
                <p className={`text-lg font-bold ${ll97Projection.avgAnnualPenalty > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {ll97Projection.avgAnnualPenalty > 0 ? fmt(ll97Projection.avgAnnualPenalty) : "$0"}
                </p>
              </div>
            </div>

            {/* Year-by-year penalty table */}
            {ll97Projection.totalPenaltyOverHold > 0 && (
              <div className="border border-white/5 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.03]">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-500">Year</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Period</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Excess tCO2</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-500">Penalty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ll97Projection.yearlyPenalties.map(yp => (
                      <tr key={yp.year} className="border-t border-white/[0.03]">
                        <td className="px-3 py-1.5 text-slate-400">{yp.calendarYear}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">P{yp.period}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-300">{yp.excessEmissions > 0 ? yp.excessEmissions.toFixed(1) : "\u2014"}</td>
                        <td className={`px-3 py-1.5 text-right font-mono tabular-nums font-medium ${yp.annualPenalty > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {yp.annualPenalty > 0 ? fmt(yp.annualPenalty) : "$0"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Retrofit options */}
            {ll97Projection.totalPenaltyOverHold > 0 && ll97Projection.retrofitOptions.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Retrofit Options</p>
                <div className="space-y-1">
                  {ll97Projection.retrofitOptions.map(r => (
                    <div key={r.measure} className="flex items-center justify-between py-1 border-t border-white/[0.03]">
                      <div className="min-w-0">
                        <p className="text-[11px] text-white truncate">{r.measure}</p>
                        <p className="text-[10px] text-slate-500">{r.costRange} | -{r.emissionReductionPct}% emissions</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-[11px] font-mono tabular-nums text-white">{fmt(r.estimatedCost)}</p>
                        <p className="text-[10px] text-slate-500">{r.paybackYears < 99 ? `${r.paybackYears}yr payback` : "N/A"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-500">LL97 penalty: $268/metric ton CO2e over limit</p>
          </div>
        </div>
      )}

      {/* ==================== Property Details ==================== */}
      {propertyDetails && (
        <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Property Details</h3></div>
          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              <div><p className="text-xs text-slate-500">Address</p><p className="font-medium text-white">{propertyDetails.address}</p></div>
              <div><p className="text-xs text-slate-500">Borough</p><p className="font-medium text-white">{propertyDetails.borough}</p></div>
              <div><p className="text-xs text-slate-500">Block / Lot</p><p className="font-medium text-white">{propertyDetails.block} / {propertyDetails.lot}</p></div>
              <div><p className="text-xs text-slate-500">BBL</p><p className="font-medium text-white">{propertyDetails.bbl}</p></div>
              <div><p className="text-xs text-slate-500">Res Units</p><p className="font-medium text-white">{propertyDetails.unitsRes || "\u2014"}</p></div>
              <div><p className="text-xs text-slate-500">Total Units</p><p className="font-medium text-white">{propertyDetails.unitsTotal || "\u2014"}</p></div>
              <div><p className="text-xs text-slate-500">Year Built</p><p className="font-medium text-white">{propertyDetails.yearBuilt || "\u2014"}</p></div>
              <div><p className="text-xs text-slate-500">Stories</p><p className="font-medium text-white">{propertyDetails.numFloors || "\u2014"}</p></div>
              <div><p className="text-xs text-slate-500">Building Area</p><p className="font-medium text-white">{propertyDetails.bldgArea > 0 ? `${propertyDetails.bldgArea.toLocaleString()} sqft` : "\u2014"}</p></div>
              <div><p className="text-xs text-slate-500">Lot Area</p><p className="font-medium text-white">{propertyDetails.lotArea > 0 ? `${propertyDetails.lotArea.toLocaleString()} sqft` : "\u2014"}</p></div>
              <div><p className="text-xs text-slate-500">Zoning</p><p className="font-medium text-white">{propertyDetails.zoneDist || "\u2014"}</p></div>
              <div><p className="text-xs text-slate-500">Building Class</p><p className="font-medium text-white">{propertyDetails.bldgClass || "\u2014"}</p></div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
