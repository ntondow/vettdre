"use client";

import React, { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { useDealModeler } from "../../deal-modeler-context";
import { Section, Field, SliderField, Sparkle } from "../shared/field";
import { fmt } from "../shared/format-utils";
import type { DealInputs } from "@/lib/deal-calculator";
import { getRGBExpenseBenchmarkMapped } from "@/lib/ai-assumptions";
import type { RGBExpenseBenchmark } from "@/lib/ai-assumptions";

export function ExpenseSection() {
  const {
    inputs,
    outputs,
    update,
    isAi,
    clearAi,
    expenseEntryMode,
    setExpenseEntryMode,
    addCustomExpense,
    removeCustomExpense,
    updateCustomExpense,
    openT12Modal,
    expenseBenchmark,
    showBenchmarkDetail,
    setShowBenchmarkDetail,
    expenseFlags,
    getFlagForField,
    applySuggestedAmount,
    totalUnits,
    taxReassessment,
    borough,
    propertyDetails,
  } = useDealModeler();

  // RGB benchmark for per-row comparison (annual total for building)
  const rgbBenchmark = useMemo<RGBExpenseBenchmark | null>(() => {
    if (!borough || totalUnits < 2) return null;
    const yearBuilt = propertyDetails?.yearBuilt ?? null;
    return getRGBExpenseBenchmarkMapped(borough, yearBuilt, totalUnits);
  }, [borough, totalUnits, propertyDetails?.yearBuilt]);

  const warnings = inputs._expenseWarnings;
  const benchComp = inputs._rgbBenchmarkComparison;

  return (
    <>
      {/* T-12 + Custom Expense Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={openT12Modal}
          className="flex-1 px-3 py-2 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg transition-colors text-center"
        >
          Enter T-12 Actuals
        </button>
        <button
          onClick={addCustomExpense}
          className="flex-1 px-3 py-2 border border-white/10 hover:bg-white/[0.05] text-slate-400 text-xs font-medium rounded-lg transition-colors text-center"
        >
          + Add Expense Line
        </button>
      </div>

      {/* AI Expense Correction Warnings */}
      {warnings && warnings.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-xs font-semibold text-blue-400">AI Expenses Adjusted</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">RGB I&E</span>
          </div>
          {benchComp && (
            <div className="flex gap-4 mb-2 text-[10px]">
              <span className="text-slate-400">
                Expense Ratio: <span className="text-white font-mono">{(benchComp.expenseRatio.ai * 100).toFixed(1)}%</span>
                <span className="text-slate-600 mx-1">vs</span>
                <span className="text-emerald-400 font-mono">{(benchComp.expenseRatio.benchmark * 100).toFixed(1)}%</span> benchmark
              </span>
              <span className="text-slate-400">
                $/Unit: <span className="text-white font-mono">${benchComp.totalPerUnit.ai.toLocaleString()}</span>
                <span className="text-slate-600 mx-1">vs</span>
                <span className="text-emerald-400 font-mono">${benchComp.totalPerUnit.benchmark.toLocaleString()}</span>
              </span>
            </div>
          )}
          <ul className="space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-[10px] text-blue-300/80 flex items-start gap-1">
                <span className="text-blue-400 mt-px shrink-0">&#8227;</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expense Flags Summary */}
      {expenseFlags.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-400 mb-1">{expenseFlags.length} expense flag{expenseFlags.length !== 1 ? "s" : ""} detected</p>
          <p className="text-[10px] text-amber-500/60">Review flagged items in the P&L section on the right panel.</p>
        </div>
      )}

      {/* Expense Benchmark Card */}
      {expenseBenchmark && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
          <button
            onClick={() => setShowBenchmarkDetail(!showBenchmarkDetail)}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-emerald-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Expense Benchmark</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">RGB I&E</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono tabular-nums text-emerald-400">{expenseBenchmark.categoryLabel}</span>
              <span className="text-xs font-mono tabular-nums font-semibold text-white">${expenseBenchmark.totalPerUnit.toLocaleString()}/unit</span>
              <ChevronDown className={`w-3 h-3 text-emerald-500 transition-transform ${showBenchmarkDetail ? "rotate-180" : ""}`} />
            </div>
          </button>
          {showBenchmarkDetail && (
            <div className="px-3 py-2 space-y-1 bg-white/[0.01] border-t border-emerald-500/10">
              <div className="grid grid-cols-[1fr_80px_80px] gap-1 text-[10px] font-medium text-slate-500 uppercase tracking-wider pb-1">
                <span>Line Item</span>
                <span className="text-right">$/Unit</span>
                <span className="text-right">Annual</span>
              </div>
              {expenseBenchmark.lineItems.map(item => (
                <div key={item.field} className="grid grid-cols-[1fr_80px_80px] gap-1 py-0.5 border-t border-white/[0.03]">
                  <span className="text-[11px] text-slate-400">{item.label}</span>
                  <span className="text-[11px] font-mono tabular-nums text-white text-right">${item.perUnit.toLocaleString()}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400 text-right">${item.totalAnnual.toLocaleString()}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_80px_80px] gap-1 pt-1 border-t border-white/10">
                <span className="text-[11px] font-semibold text-white">Total</span>
                <span className="text-[11px] font-mono tabular-nums font-bold text-white text-right">${expenseBenchmark.totalPerUnit.toLocaleString()}</span>
                <span className="text-[11px] font-mono tabular-nums font-bold text-white text-right">${expenseBenchmark.totalAnnual.toLocaleString()}</span>
              </div>
              {expenseBenchmark.adjustmentNotes.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">{expenseBenchmark.adjustmentNotes.join(" | ")}</p>
              )}
              <button
                onClick={() => {
                  const updates: Partial<DealInputs> = {};
                  for (const item of expenseBenchmark.lineItems) {
                    if (item.field in inputs) {
                      (updates as any)[item.field] = item.totalAnnual;
                    }
                  }
                  update(updates);
                }}
                className="w-full mt-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium py-1.5 rounded bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors"
              >
                Apply benchmark to all expenses
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unified Per-Unit Expense Grid */}
      <Section title="Operating Expenses" summary={`Total ${fmt(outputs.totalExpenses)}${totalUnits > 0 ? ` · ${fmt(Math.round(outputs.totalExpenses / totalUnits))}/unit` : ""}`}>
        {/* Entry mode toggle */}
        <div className="flex items-center gap-1 mb-3">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mr-2">Entry Mode</span>
          {(["annual", "monthly", "perUnit"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setExpenseEntryMode(mode)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${expenseEntryMode === mode ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/[0.03] text-slate-500 border border-white/5 hover:bg-white/[0.05]"}`}
            >
              {mode === "annual" ? "Annual" : mode === "monthly" ? "Monthly" : "$/Unit"}
            </button>
          ))}
        </div>

        {/* Expense table */}
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Line Item</th>
                <th className="text-right px-2 py-2 font-medium text-slate-500 w-24">{expenseEntryMode === "monthly" ? "Monthly" : expenseEntryMode === "perUnit" ? "$/Unit" : "Annual"}</th>
                <th className="text-right px-2 py-2 font-medium text-slate-500 w-20">Annual</th>
                <th className="text-right px-2 py-2 font-medium text-slate-500 w-16">$/Unit</th>
                {rgbBenchmark && (
                  <th className="text-right px-2 py-2 font-medium text-emerald-500 w-16">RGB</th>
                )}
                {inputs.t12Actuals && Object.keys(inputs.t12Actuals).length > 0 && (
                  <th className="text-right px-2 py-2 font-medium text-blue-400 w-16">T-12</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const hasT12 = inputs.t12Actuals && Object.keys(inputs.t12Actuals).length > 0;
                const expenseRows: { label: string; field: string; value: number; category: string; isPercent?: boolean; percentBase?: number }[] = [
                  { label: "Real Estate Taxes", field: "realEstateTaxes", value: inputs.realEstateTaxes, category: "fixed" },
                  { label: "Property Insurance", field: "insurance", value: inputs.insurance, category: "fixed" },
                  { label: "License/Permit/Insp.", field: "licenseFees", value: inputs.licenseFees, category: "fixed" },
                  { label: "Fire Meter Service", field: "fireMeter", value: inputs.fireMeter, category: "fixed" },
                  { label: "Electricity + Gas", field: "electricityGas", value: inputs.electricityGas, category: "utilities" },
                  { label: "Water / Sewer", field: "waterSewer", value: inputs.waterSewer, category: "utilities" },
                  { label: "Management Fee", field: "managementFee", value: outputs.managementFee, category: "management", isPercent: true, percentBase: inputs.managementFeePercent },
                  { label: "Payroll", field: "payroll", value: inputs.payroll, category: "management" },
                  { label: "Accounting", field: "accounting", value: inputs.accounting, category: "professional" },
                  { label: "Legal", field: "legal", value: inputs.legal, category: "professional" },
                  { label: "Marketing / Leasing", field: "marketing", value: inputs.marketing, category: "professional" },
                  { label: "R&M General", field: "rmGeneral", value: inputs.rmGeneral, category: "maintenance" },
                  { label: "R&M CapEx/Reserve", field: "rmCapexReserve", value: inputs.rmCapexReserve, category: "maintenance" },
                  { label: "General Admin", field: "generalAdmin", value: inputs.generalAdmin, category: "admin" },
                  { label: "Exterminating", field: "exterminating", value: inputs.exterminating, category: "contract" },
                  { label: "Landscaping", field: "landscaping", value: inputs.landscaping, category: "contract" },
                  { label: "Snow Removal", field: "snowRemoval", value: inputs.snowRemoval, category: "contract" },
                  { label: "Elevator", field: "elevator", value: inputs.elevator, category: "contract" },
                  { label: "Alarm Monitoring", field: "alarmMonitoring", value: inputs.alarmMonitoring, category: "contract" },
                  { label: "Telephone/Internet", field: "telephoneInternet", value: inputs.telephoneInternet, category: "contract" },
                  { label: "Cleaning", field: "cleaning", value: inputs.cleaning, category: "contract" },
                  { label: "Trash Removal", field: "trashRemoval", value: inputs.trashRemoval, category: "contract" },
                  { label: "Other Contract Svcs", field: "otherContractServices", value: inputs.otherContractServices, category: "contract" },
                ];

                // Group by category with headers
                const categoryLabels: Record<string, string> = { fixed: "Taxes & Insurance", utilities: "Utilities", management: "Management", professional: "Professional", maintenance: "Repairs & Maintenance", admin: "Admin", contract: "Contract Services" };
                let lastCat = "";

                // Compute colSpan dynamically
                const colCount = 4 + (rgbBenchmark ? 1 : 0) + (hasT12 ? 1 : 0);

                return expenseRows.map((row, i) => {
                  const showCatHeader = row.category !== lastCat;
                  lastCat = row.category;
                  const flag = getFlagForField(row.field);
                  const t12Val = hasT12 ? inputs.t12Actuals?.[row.field] : undefined;
                  const t12Variance = t12Val && t12Val > 0 && row.value > 0 ? Math.round(((row.value - t12Val) / t12Val) * 100) : undefined;
                  const annualVal = row.value;
                  const monthlyVal = Math.round(annualVal / 12);
                  const perUnitVal = totalUnits > 0 ? Math.round(annualVal / totalUnits) : 0;

                  // RGB benchmark for this field (annual per-unit from RGB, convert to building total)
                  const rgbPerUnit = rgbBenchmark && row.field !== "managementFee" && row.field !== "otherContractServices"
                    ? (rgbBenchmark as any)[row.field] as number | undefined
                    : undefined;
                  const rgbAnnual = rgbPerUnit != null && rgbPerUnit > 0 ? rgbPerUnit * totalUnits : undefined;
                  // Color code: green <=130%, amber 130-200%, red >200%
                  const rgbDelta = rgbAnnual && rgbAnnual > 0 && annualVal > 0 ? annualVal / rgbAnnual : undefined;
                  const rgbColor = rgbDelta == null ? "text-slate-500"
                    : rgbDelta <= 1.3 ? "text-emerald-400"
                    : rgbDelta <= 2.0 ? "text-amber-400"
                    : "text-red-400";

                  // Determine display/edit value based on mode
                  const displayVal = expenseEntryMode === "monthly" ? monthlyVal : expenseEntryMode === "perUnit" ? perUnitVal : annualVal;

                  const handleChange = (v: number) => {
                    if (row.isPercent) return; // management fee is computed
                    let newAnnual = v;
                    if (expenseEntryMode === "monthly") newAnnual = v * 12;
                    if (expenseEntryMode === "perUnit") newAnnual = v * Math.max(1, totalUnits);
                    update({ [row.field]: newAnnual } as any);
                    clearAi(row.field);
                  };

                  return (
                    <React.Fragment key={row.field}>
                      {showCatHeader && (
                        <tr className={i > 0 ? "border-t border-white/10" : ""}>
                          <td colSpan={colCount} className="px-3 pt-2.5 pb-1 text-[9px] uppercase tracking-widest font-bold text-slate-600">{categoryLabels[row.category]}</td>
                        </tr>
                      )}
                      <tr className={`border-t border-white/[0.03] ${flag ? "bg-amber-500/5" : ""}`}>
                        <td className="px-3 py-1 text-slate-400">
                          <span className="flex items-center gap-1">
                            {flag && <span className="text-amber-400 cursor-help" title={flag.message}>&#9888;</span>}
                            {row.label}
                            {isAi(row.field) && <Sparkle />}
                            {row.isPercent && <span className="text-[9px] text-slate-600 ml-0.5">({row.percentBase}%)</span>}
                          </span>
                        </td>
                        <td className="px-1 py-1">
                          {row.isPercent ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={inputs.managementFeePercent}
                                onChange={e => update({ managementFeePercent: parseFloat(e.target.value) || 0 })}
                                step="0.5"
                                className="w-full text-right px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white"
                              />
                              <span className="text-[10px] text-slate-500">%</span>
                            </div>
                          ) : (
                            <input
                              type="number"
                              value={displayVal}
                              onChange={e => handleChange(parseFloat(e.target.value) || 0)}
                              className={`w-full text-right px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white ${isAi(row.field) ? "bg-amber-500/10 border-amber-500/20" : ""}`}
                            />
                          )}
                        </td>
                        <td className="px-2 py-1 text-right text-slate-400 font-mono tabular-nums text-[11px]">{fmt(annualVal)}</td>
                        <td className="px-2 py-1 text-right text-slate-500 font-mono tabular-nums text-[11px]">{totalUnits > 0 ? fmt(perUnitVal) : "—"}</td>
                        {rgbBenchmark && (
                          <td className="px-2 py-1 text-right">
                            {rgbAnnual != null ? (
                              <span className={`text-[10px] font-mono tabular-nums ${rgbColor}`} title={`RGB benchmark: ${fmt(rgbAnnual)}/yr`}>
                                {fmt(Math.round(rgbPerUnit!))}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600">—</span>
                            )}
                          </td>
                        )}
                        {hasT12 && (
                          <td className="px-2 py-1 text-right">
                            {t12Val && t12Val > 0 ? (
                              <span className={`text-[10px] font-mono tabular-nums ${t12Variance != null && Math.abs(t12Variance) > 15 ? "text-amber-400" : "text-slate-500"}`}>
                                {t12Variance != null ? `${t12Variance > 0 ? "+" : ""}${t12Variance}%` : ""}
                              </span>
                            ) : null}
                          </td>
                        )}
                      </tr>
                      {flag && flag.suggestedAmount != null && (
                        <tr className="bg-amber-500/5">
                          <td colSpan={colCount} className="px-3 py-1">
                            <button onClick={() => applySuggestedAmount(flag)} className="text-[9px] text-blue-400 hover:text-blue-300 underline">
                              Suggested: {fmt(flag.suggestedAmount)} — {flag.message}
                            </button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
            <tfoot className="bg-white/[0.03] border-t border-white/10">
              <tr>
                <td className="px-3 py-2 font-semibold text-white">Total Expenses</td>
                <td></td>
                <td className="px-2 py-2 text-right font-bold text-red-400 font-mono tabular-nums">{fmt(outputs.totalExpenses)}</td>
                <td className="px-2 py-2 text-right font-semibold text-slate-400 font-mono tabular-nums text-[11px]">{totalUnits > 0 ? fmt(Math.round(outputs.totalExpenses / totalUnits)) : "—"}</td>
                {rgbBenchmark && (
                  <td className="px-2 py-2 text-right font-semibold text-emerald-400 font-mono tabular-nums text-[10px]">{fmt(Math.round(rgbBenchmark.totalPerUnitYear))}</td>
                )}
                {inputs.t12Actuals && Object.keys(inputs.t12Actuals).length > 0 && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>

        <SliderField label="Annual Expense Growth" value={inputs.annualExpenseGrowth} onChange={v => update({ annualExpenseGrowth: v })} min={-5} max={15} step={0.5} />

        {/* Tax Reassessment Card */}
        {taxReassessment && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">Post-Acquisition Tax Estimate</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">PLUTO</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Current</span>
                <span className="text-[11px] font-mono tabular-nums text-white">{fmt(taxReassessment.currentTaxBill)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Year {Math.min(5, taxReassessment.yearByYearTax.length)}</span>
                <span className="text-[11px] font-mono tabular-nums text-amber-400">{fmt(taxReassessment.yearByYearTax[Math.min(4, taxReassessment.yearByYearTax.length - 1)] ?? taxReassessment.estimatedNewTaxBill)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Stabilized</span>
                <span className="text-[11px] font-mono tabular-nums text-red-400">{fmt(taxReassessment.estimatedNewTaxBill)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">Increase</span>
                <span className="text-[11px] font-mono tabular-nums text-red-400">+{taxReassessment.taxIncreasePct.toFixed(0)}%</span>
              </div>
            </div>
            {taxReassessment.caveats && taxReassessment.caveats.length > 0 && (
              <p className="text-[10px] text-slate-500 mt-1.5">{taxReassessment.caveats[0]}</p>
            )}
            <button
              onClick={() => update({ realEstateTaxes: taxReassessment.estimatedNewTaxBill })}
              className="w-full mt-2 text-xs text-amber-400 hover:text-amber-300 font-medium py-1 rounded bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
            >
              Apply stabilized tax to deal
            </button>
          </div>
        )}
      </Section>

      {/* Custom Expense Items */}
      {inputs.customExpenseItems && inputs.customExpenseItems.length > 0 && (
        <Section title="Custom Expense Items" defaultOpen={true}>
          <div className="space-y-2">
            {inputs.customExpenseItems.map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  value={item.name}
                  onChange={e => updateCustomExpense(item.id, "name", e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-white"
                  placeholder="Expense name"
                />
                <div className="relative w-28">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    value={item.amount}
                    onChange={e => updateCustomExpense(item.id, "amount", parseFloat(e.target.value) || 0)}
                    className="w-full pl-5 pr-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-right text-white"
                  />
                </div>
                <button onClick={() => removeCustomExpense(item.id)} className="text-slate-500 hover:text-red-400 text-sm">&times;</button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
