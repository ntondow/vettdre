"use client";

import React from "react";
import { useDealModeler } from "../../deal-modeler-context";
import { fmt } from "../shared/format-utils";

const T12_EXPENSE_ROWS = [
  { field: "realEstateTaxes", label: "Real Estate Taxes" },
  { field: "insurance", label: "Property Insurance" },
  { field: "licenseFees", label: "License/Permit/Insp." },
  { field: "fireMeter", label: "Fire Meter Service" },
  { field: "electricityGas", label: "Electricity + Gas" },
  { field: "waterSewer", label: "Water / Sewer" },
  { field: "payroll", label: "Payroll" },
  { field: "accounting", label: "Accounting" },
  { field: "legal", label: "Legal" },
  { field: "marketing", label: "Marketing / Leasing" },
  { field: "rmGeneral", label: "R&M General" },
  { field: "rmCapexReserve", label: "R&M CapEx/Reserve" },
  { field: "generalAdmin", label: "General Admin" },
  { field: "exterminating", label: "Exterminating" },
  { field: "landscaping", label: "Landscaping" },
  { field: "snowRemoval", label: "Snow Removal" },
  { field: "elevator", label: "Elevator" },
  { field: "alarmMonitoring", label: "Alarm Monitoring" },
  { field: "telephoneInternet", label: "Telephone/Internet" },
  { field: "cleaning", label: "Cleaning" },
  { field: "trashRemoval", label: "Trash Removal" },
] as const;

export function T12Modal() {
  const { showT12Modal, setShowT12Modal, t12Draft, setT12Draft, t12GrowthDraft, setT12GrowthDraft, applyT12 } = useDealModeler();

  if (!showT12Modal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => setShowT12Modal(false)} />
      <div className="relative bg-[#0B0F19] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-[modal-in_0.2s_ease-out]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white">Enter T-12 Actuals</h2>
            <p className="text-xs text-slate-500 mt-0.5">Enter trailing 12-month actual expenses. Year 1 Budget = T-12 x Growth Factor.</p>
          </div>
          <button onClick={() => setShowT12Modal(false)} className="text-slate-500 hover:text-slate-300 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_110px_80px_100px] gap-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider pb-1">
              <span>Expense</span>
              <span className="text-right">T-12 Actual</span>
              <span className="text-center">Growth</span>
              <span className="text-right">Yr 1 Budget</span>
            </div>
            {T12_EXPENSE_ROWS.map(({ field, label }) => {
              const t12Val = t12Draft[field] || 0;
              const gf = t12GrowthDraft[field] || 1.03;
              const budgeted = t12Val > 0 ? Math.round(t12Val * gf) : 0;
              return (
                <div key={field} className="grid grid-cols-[1fr_110px_80px_100px] gap-2 items-center py-1 border-t border-white/[0.03]">
                  <span className="text-xs text-slate-400">{label}</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">$</span>
                    <input
                      type="number"
                      value={t12Val || ""}
                      onChange={e => setT12Draft(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }))}
                      className="w-full pl-5 pr-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-right text-white"
                      placeholder="0"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={Math.round((gf - 1) * 100)}
                      onChange={e => setT12GrowthDraft(prev => ({ ...prev, [field]: 1 + (parseFloat(e.target.value) || 0) / 100 }))}
                      className="w-full px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-center text-white"
                      step="1"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span>
                  </div>
                  <span className="text-xs text-right text-slate-200 font-medium">{budgeted > 0 ? fmt(budgeted) : "\u2014"}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-2">
          <button onClick={() => setShowT12Modal(false)} className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg">Cancel</button>
          <button onClick={applyT12} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Apply T-12 to Budget</button>
        </div>
      </div>
    </div>
  );
}
