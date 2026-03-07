"use client";

import React from "react";
import { useDealModeler } from "../../deal-modeler-context";
import { Section, Field, SliderField, Sparkle } from "../shared/field";
import { fmt } from "../shared/format-utils";

export function IncomeSection() {
  const {
    inputs,
    outputs,
    update,
    updateUnit,
    addUnitType,
    removeUnitType,
    isAi,
    clearAi,
    addCommercialTenant,
    removeCommercialTenant,
    updateCommercialTenant,
    addCustomIncome,
    removeCustomIncome,
    updateCustomIncome,
    incomeView,
    setIncomeView,
    strProjection,
    totalUnits,
    rentProjection,
    propertyDetails,
  } = useDealModeler();

  return (
    <>
      {/* Income -- Residential */}
      <Section title="Income — Residential" summary={`GPR ${fmt(outputs.grossPotentialResidentialRent)}, ${inputs.residentialVacancyRate}% vacancy`}>
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Unit Mix ({totalUnits} units){isAi("unitMix") && <Sparkle />}</span>
            <div className="flex items-center gap-2">
              {inputs.unitMix.some(u => u.marketRent && u.marketRent > 0) && (
                <div className="flex items-center gap-0.5 bg-white/[0.03] rounded border border-white/5 p-0.5">
                  <button onClick={() => setIncomeView("current")} className={`px-2 py-0.5 text-[9px] font-medium rounded transition-colors ${incomeView === "current" ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-400"}`}>Current</button>
                  <button onClick={() => setIncomeView("stabilized")} className={`px-2 py-0.5 text-[9px] font-medium rounded transition-colors ${incomeView === "stabilized" ? "bg-emerald-500/20 text-emerald-400" : "text-slate-500 hover:text-slate-400"}`}>Stabilized</button>
                </div>
              )}
              <button onClick={addUnitType} className="text-xs text-blue-400 hover:text-blue-300 font-medium">+ Add Type</button>
            </div>
          </div>
          <div className="border border-white/5 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.03]">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-slate-500">Type</th>
                  <th className="text-center px-2 py-2 font-medium text-slate-500">Ct</th>
                  <th className="text-right px-2 py-2 font-medium text-slate-500">Rent/Mo</th>
                  <th className="text-right px-2 py-2 font-medium text-emerald-500 w-20">Mkt Rent</th>
                  <th className="text-right px-3 py-2 font-medium text-slate-500">Annual</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {inputs.unitMix.map((u, i) => {
                  const effectiveRent = incomeView === "stabilized" && u.marketRent && u.marketRent > 0 ? u.marketRent : u.monthlyRent;
                  return (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-2 py-1.5">
                        <input value={u.type} onChange={e => updateUnit(i, "type", e.target.value)} className="w-full px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" value={u.count} onChange={e => updateUnit(i, "count", parseInt(e.target.value) || 0)} className="w-14 text-center px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" min="0" />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" value={u.monthlyRent} onChange={e => updateUnit(i, "monthlyRent", parseFloat(e.target.value) || 0)} className={`w-full text-right px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white ${incomeView === "stabilized" && u.marketRent ? "opacity-50" : ""}`} />
                      </td>
                      <td className="px-1 py-1.5">
                        <input type="number" value={u.marketRent || ""} onChange={e => updateUnit(i, "marketRent", parseFloat(e.target.value) || 0)} placeholder="—" className={`w-full text-right px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs ${incomeView === "stabilized" && u.marketRent ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-white"}`} />
                      </td>
                      <td className="px-3 py-1.5 text-right text-slate-400">{fmt(u.count * effectiveRent * 12)}</td>
                      <td className="pr-2">
                        {inputs.unitMix.length > 1 && (
                          <button onClick={() => removeUnitType(i)} className="text-slate-500 hover:text-red-400 text-sm">&times;</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-white/[0.03] border-t border-white/5">
                <tr>
                  <td className="px-3 py-2 font-semibold text-white">GPR</td>
                  <td className="text-center px-2 py-2 font-semibold text-white">{totalUnits}</td>
                  <td></td>
                  <td></td>
                  <td className="text-right px-3 py-2 font-semibold text-white">{fmt(outputs.grossPotentialResidentialRent)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* Stabilized vs Current delta */}
          {incomeView === "stabilized" && inputs.unitMix.some(u => u.marketRent && u.marketRent > 0) && (() => {
            const currentGPR = inputs.unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
            const stabilizedGPR = inputs.unitMix.reduce((s, u) => s + u.count * ((u.marketRent && u.marketRent > 0 ? u.marketRent : u.monthlyRent)) * 12, 0);
            const delta = stabilizedGPR - currentGPR;
            return delta !== 0 ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                <span className="text-xs font-medium text-emerald-400">Stabilized GPR vs Current: {delta > 0 ? "+" : ""}{fmt(delta)} ({delta > 0 ? "+" : ""}{currentGPR > 0 ? ((delta / currentGPR) * 100).toFixed(1) : "0"}%)</span>
              </div>
            ) : null;
          })()}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SliderField label="Vacancy Rate" value={inputs.residentialVacancyRate} onChange={v => update({ residentialVacancyRate: v })} min={0} max={30} step={0.5} />
          <Field label="Concessions (annual)" value={inputs.concessions} onChange={v => update({ concessions: v })} prefix="$" aiAssumed={isAi("concessions")} onClearAi={() => clearAi("concessions")} />
        </div>
        <SliderField label="Annual Rent Growth" value={inputs.annualRentGrowth} onChange={v => update({ annualRentGrowth: v })} min={-5} max={15} step={0.5} />
        {strProjection && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 -mt-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs text-purple-400 font-medium">
                STR Potential: ${strProjection.monthlySTRRevenue.toLocaleString()}/mo per unit
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${strProjection.strPremium > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                  {strProjection.strPremium > 0 ? "+" : ""}{strProjection.strPremium}% vs LTR
                </span>
              </span>
            </div>
            <p className="text-[10px] text-purple-500/60 mt-1">Based on {strProjection.neighborhood} Airbnb data — {strProjection.occupancyRate * 100}% occupancy, ${strProjection.avgNightlyRate}/night. NYC LL18 restricts STR.</p>
          </div>
        )}
        {/* Rent Stabilization Card */}
        {rentProjection && rentProjection.stabilizedPct > 0 && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 -mt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-400">Rent Stabilization</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">HSTPA 2019</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/[0.03] rounded-lg p-2">
                <p className="text-[10px] text-slate-500 uppercase">RGB Rate</p>
                <p className="text-sm font-bold text-blue-400">{rentProjection.rgbBlendedRate.toFixed(2)}%</p>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-2">
                <p className="text-[10px] text-slate-500 uppercase">Market Rate</p>
                <p className="text-sm font-bold text-white">{inputs.annualRentGrowth}%</p>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-2">
                <p className="text-[10px] text-slate-500 uppercase">Blended</p>
                <p className="text-sm font-bold text-emerald-400">{rentProjection.blendedAnnualGrowthPct.toFixed(2)}%</p>
              </div>
            </div>
            <p className="text-[10px] text-blue-500/60 mt-2">
              {Math.round(rentProjection.stabilizedPct)}% stabilized ({propertyDetails?.rentStabilizedUnits || 0} units).
              No vacancy bonus, no high-rent deregulation (HSTPA 2019).
            </p>
            {rentProjection.mciUpside && inputs.renovationBudget > 0 && (
              <p className="text-[10px] text-emerald-400 mt-1">
                MCI upside: +${rentProjection.mciUpside.monthlyPerUnit}/unit/mo ({rentProjection.mciUpside.note})
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Income -- Commercial */}
      <Section title="Income — Commercial" defaultOpen={inputs.commercialRentAnnual > 0 || (inputs.commercialTenants?.length || 0) > 0}>
        {/* Commercial tenants array or flat amount */}
        {inputs.commercialTenants && inputs.commercialTenants.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Commercial Spaces ({inputs.commercialTenants.length})</span>
              <button onClick={addCommercialTenant} className="text-xs text-blue-400 hover:text-blue-300 font-medium">+ Add Space</button>
            </div>
            <div className="border border-white/5 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-slate-500">Tenant</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-500 w-16">Sqft</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-500 w-24">Annual Rent</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-500 w-20">Lease</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-500 w-14">Vac%</th>
                    <th className="w-6"></th>
                  </tr>
                </thead>
                <tbody>
                  {inputs.commercialTenants.map(t => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="px-1 py-1">
                        <input value={t.name} onChange={e => updateCommercialTenant(t.id, "name", e.target.value)} className="w-full px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" value={t.sqft || ""} onChange={e => updateCommercialTenant(t.id, "sqft", parseInt(e.target.value) || 0)} className="w-full text-right px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" placeholder="—" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" value={t.rentAnnual} onChange={e => updateCommercialTenant(t.id, "rentAnnual", parseFloat(e.target.value) || 0)} className="w-full text-right px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" />
                      </td>
                      <td className="px-1 py-1">
                        <select value={t.leaseType || "gross"} onChange={e => updateCommercialTenant(t.id, "leaseType", e.target.value)} className="w-full px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white">
                          <option value="gross">Gross</option>
                          <option value="NNN">NNN</option>
                          <option value="modified_gross">Mod Gross</option>
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input type="number" value={t.vacancyRate ?? ""} onChange={e => updateCommercialTenant(t.id, "vacancyRate", parseFloat(e.target.value) || 0)} className="w-full text-right px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" placeholder={`${inputs.commercialVacancyRate}`} />
                      </td>
                      <td className="pr-1">
                        <button onClick={() => removeCommercialTenant(t.id)} className="text-slate-500 hover:text-red-400 text-sm">&times;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-white/[0.03] border-t border-white/5">
                  <tr>
                    <td className="px-2 py-2 font-semibold text-white">Total</td>
                    <td className="px-2 py-2 text-right text-slate-400">{inputs.commercialTenants.reduce((s, t) => s + (t.sqft || 0), 0).toLocaleString()}</td>
                    <td className="px-2 py-2 text-right font-semibold text-white">{fmt(inputs.commercialTenants.reduce((s, t) => s + t.rentAnnual, 0))}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <Field label="Commercial Rent (annual)" value={inputs.commercialRentAnnual} onChange={v => update({ commercialRentAnnual: v })} prefix="$" aiAssumed={isAi("commercialRentAnnual")} onClearAi={() => clearAi("commercialRentAnnual")} />
            <button onClick={addCommercialTenant} className="w-full mt-2 px-3 py-2 border border-dashed border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 text-slate-500 hover:text-blue-400 text-xs font-medium rounded-lg transition-colors">
              + Add Individual Commercial Spaces
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default Vacancy Rate" value={inputs.commercialVacancyRate} onChange={v => update({ commercialVacancyRate: v })} suffix="%" step="0.5" aiAssumed={isAi("commercialVacancyRate")} onClearAi={() => clearAi("commercialVacancyRate")} />
          <Field label="Concessions (annual)" value={inputs.commercialConcessions} onChange={v => update({ commercialConcessions: v })} prefix="$" />
        </div>
      </Section>

      {/* Income -- Other */}
      <Section title="Income — Other" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Late Fees" value={inputs.lateFees} onChange={v => update({ lateFees: v })} prefix="$" />
          <Field label="Parking" value={inputs.parkingIncome} onChange={v => update({ parkingIncome: v })} prefix="$" />
          <Field label="Storage" value={inputs.storageIncome} onChange={v => update({ storageIncome: v })} prefix="$" />
          <Field label="Pet Deposits" value={inputs.petDeposits} onChange={v => update({ petDeposits: v })} prefix="$" />
          <Field label="Pet Rent" value={inputs.petRent} onChange={v => update({ petRent: v })} prefix="$" />
          <Field label="EV Charging" value={inputs.evCharging} onChange={v => update({ evCharging: v })} prefix="$" />
          <Field label="Trash RUBS" value={inputs.trashRubs} onChange={v => update({ trashRubs: v })} prefix="$" />
          <Field label="Water/Sewer RUBS" value={inputs.waterRubs} onChange={v => update({ waterRubs: v })} prefix="$" />
          <Field label="CAM Recoveries" value={inputs.camRecoveries || 0} onChange={v => update({ camRecoveries: v })} prefix="$" />
        </div>
        <Field label="Other Misc Income" value={inputs.otherMiscIncome} onChange={v => update({ otherMiscIncome: v })} prefix="$" />
        <button
          onClick={addCustomIncome}
          className="w-full px-3 py-2 border border-dashed border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 text-slate-500 hover:text-blue-400 text-xs font-medium rounded-lg transition-colors"
        >
          + Add Income Line Item
        </button>
      </Section>

      {/* Custom Income Items */}
      {inputs.customIncomeItems && inputs.customIncomeItems.length > 0 && (
        <Section title="Custom Income Items" defaultOpen={true}>
          <div className="space-y-2">
            {inputs.customIncomeItems.map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  value={item.name}
                  onChange={e => updateCustomIncome(item.id, "name", e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-white"
                  placeholder="Income name"
                />
                <div className="relative w-28">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                  <input
                    type="number"
                    value={item.amount}
                    onChange={e => updateCustomIncome(item.id, "amount", parseFloat(e.target.value) || 0)}
                    className="w-full pl-5 pr-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-right text-white"
                  />
                </div>
                <button onClick={() => removeCustomIncome(item.id)} className="text-slate-500 hover:text-red-400 text-sm">&times;</button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
