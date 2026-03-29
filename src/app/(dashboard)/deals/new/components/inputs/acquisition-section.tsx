"use client";

import { ChevronDown } from "lucide-react";
import { useDealModeler } from "../../deal-modeler-context";
import { Section, Field, SliderField } from "../shared/field";
import { fmt } from "../shared/format-utils";

// ============================================================
// AcquisitionInputs — Deal Info, Linked Contact, Acquisition,
// Financing, and Structure-Specific sections (all_cash,
// bridge_refi, assumable, syndication)
// ============================================================
export function AcquisitionInputs() {
  const {
    // Core state
    inputs,
    outputs,
    dealType,
    setDealType,
    dealSource,
    setDealSource,
    update,
    isAi,
    clearAi,

    // Contact picker
    linkedContact,
    contactSearch,
    contactResults,
    contactDropdownOpen,
    setContactDropdownOpen,
    handleContactSearch,
    selectContact,
    unlinkContact,

    // Closing costs
    itemizeClosing,
    setItemizeClosing,
    closingCostBreakdown,
    showCostDetail,
    setShowCostDetail,
    useCEMA,
    setUseCEMA,

    // Market data
    compValuation,
    renoEstimate,
    fredRate,

    // Deal structure
    activeStructure,
    mergedStructureInputs,
    structureAnalysis,
    updateStructureParam,
  } = useDealModeler();

  // Default acquisition costs shape for spreading into updates
  const defaultAcqCosts = {
    titleInsurance: 0,
    mortgageRecordingTax: 0,
    mansionTax: 0,
    transferTax: 0,
    legalFees: 0,
    inspections: 0,
    appraisal: 0,
    miscClosing: 0,
  };

  return (
    <>
      {/* Deal Info */}
      <Section title="Deal Info">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Deal Type</label>
            <select value={dealType} onChange={e => setDealType(e.target.value)} className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white">
              <option value="acquisition">Acquisition</option>
              <option value="value_add">Value-Add</option>
              <option value="new_development">New Development</option>
              <option value="mixed_use">Mixed Use</option>
              <option value="ground_up">Ground Up</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Source</label>
            <select value={dealSource} onChange={e => setDealSource(e.target.value)} className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white">
              <option value="off_market">Off-Market</option>
              <option value="on_market">On-Market</option>
              <option value="new_development">New Development</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Linked Contact */}
      <Section title="Linked Contact" defaultOpen={!!linkedContact}>
        {linkedContact ? (
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{linkedContact.firstName} {linkedContact.lastName}</p>
              {linkedContact.email && <p className="text-xs text-slate-400 truncate">{linkedContact.email}</p>}
            </div>
            <button onClick={unlinkContact} className="text-slate-500 hover:text-red-400 text-lg leading-none" title="Unlink contact">&times;</button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={contactSearch}
              onChange={e => handleContactSearch(e.target.value)}
              onFocus={() => { if (contactResults.length > 0) setContactDropdownOpen(true); }}
              onBlur={() => setTimeout(() => setContactDropdownOpen(false), 200)}
              placeholder="Search contacts by name or email..."
              className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {contactDropdownOpen && contactResults.length > 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-[#0B0F19] border border-white/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {contactResults.map(c => (
                  <button
                    key={c.id}
                    onMouseDown={e => { e.preventDefault(); selectContact(c); }}
                    className="w-full text-left px-3 py-2 hover:bg-white/[0.05] transition-colors"
                  >
                    <p className="text-sm font-medium text-white">{c.firstName} {c.lastName}</p>
                    <p className="text-xs text-slate-400">{c.email || "No email"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Acquisition */}
      <Section title="Acquisition">
        <Field label="Purchase Price" value={inputs.purchasePrice} onChange={v => update({ purchasePrice: v })} prefix="$" aiAssumed={isAi("purchasePrice")} onClearAi={() => clearAi("purchasePrice")} />
        {compValuation && (
          <div className="flex items-center justify-between -mt-1 mb-1">
            <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full font-medium border border-emerald-500/20">
              Comp Estimate: ${(compValuation.estimatedValue / 1e6).toFixed(2)}M
              <span className={`text-[10px] px-1 py-0.5 rounded ${compValuation.confidence === "high" ? "bg-emerald-500/20 text-emerald-400" : compValuation.confidence === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-slate-400"}`}>
                {compValuation.confidence}
              </span>
            </span>
            <button onClick={() => update({ purchasePrice: compValuation.estimatedValue })}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">
              Apply to deal
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {!itemizeClosing ? (
            <Field label="Closing Costs" value={inputs.closingCosts} onChange={v => update({ closingCosts: v })} prefix="$" aiAssumed={isAi("closingCosts")} onClearAi={() => clearAi("closingCosts")} />
          ) : (
            <div className="col-span-2 border border-white/5 rounded-lg p-3 space-y-2">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Itemized Acquisition Costs</span>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Title Insurance" value={inputs.acquisitionCosts?.titleInsurance || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), titleInsurance: v } })} prefix="$" />
                <Field label="Mortgage Recording Tax" value={inputs.acquisitionCosts?.mortgageRecordingTax || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), mortgageRecordingTax: v } })} prefix="$" />
                <Field label="Mansion Tax" value={inputs.acquisitionCosts?.mansionTax || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), mansionTax: v } })} prefix="$" />
                <Field label="Transfer Tax" value={inputs.acquisitionCosts?.transferTax || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), transferTax: v } })} prefix="$" />
                <Field label="Legal Fees" value={inputs.acquisitionCosts?.legalFees || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), legalFees: v } })} prefix="$" />
                <Field label="Inspections" value={inputs.acquisitionCosts?.inspections || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), inspections: v } })} prefix="$" />
                <Field label="Appraisal" value={inputs.acquisitionCosts?.appraisal || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), appraisal: v } })} prefix="$" />
                <Field label="Misc Closing" value={inputs.acquisitionCosts?.miscClosing || 0} onChange={v => update({ acquisitionCosts: { ...(inputs.acquisitionCosts || defaultAcqCosts), miscClosing: v } })} prefix="$" />
              </div>
              {inputs.acquisitionCosts && (
                <div className="flex justify-between text-xs pt-1 border-t border-white/5">
                  <span className="text-slate-500">Itemized Total</span>
                  <span className="font-semibold text-white">{fmt(Object.values(inputs.acquisitionCosts).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0))}</span>
                </div>
              )}
            </div>
          )}
          {!itemizeClosing && <Field label="Renovation Budget" value={inputs.renovationBudget} onChange={v => update({ renovationBudget: v })} prefix="$" badge="Reno" />}
        </div>
        {itemizeClosing && <Field label="Renovation Budget" value={inputs.renovationBudget} onChange={v => update({ renovationBudget: v })} prefix="$" badge="Reno" />}
        <button
          onClick={() => {
            if (itemizeClosing && inputs.acquisitionCosts) {
              // Switching back to flat: sync the total
              const total = Object.values(inputs.acquisitionCosts).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
              update({ closingCosts: total, acquisitionCosts: undefined });
            }
            setItemizeClosing(!itemizeClosing);
          }}
          className="text-xs text-blue-400 hover:text-blue-300 font-medium"
        >
          {itemizeClosing ? "Switch to flat amount" : "Itemize closing costs"}
        </button>
        {/* NYC Acquisition Cost Breakdown */}
        {closingCostBreakdown && inputs.purchasePrice > 0 && (
          <div className="rounded-lg border border-white/5 overflow-hidden">
            <button
              onClick={() => setShowCostDetail(!showCostDetail)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">NYC Acquisition Costs</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">NYC</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono tabular-nums font-semibold text-white">{fmt(closingCostBreakdown.totalBuyerCosts)}</span>
                <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${showCostDetail ? "rotate-180" : ""}`} />
              </div>
            </button>
            {showCostDetail && (
              <div className="px-3 py-2 space-y-0.5 bg-white/[0.01]">
                {closingCostBreakdown.nycTransferTax > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[11px] text-slate-400">NYC Transfer Tax ({(closingCostBreakdown.nycTransferTax / inputs.purchasePrice * 100).toFixed(3)}%)</span>
                    <span className="text-[11px] font-mono tabular-nums text-white">{fmt(closingCostBreakdown.nycTransferTax)}</span>
                  </div>
                )}
                {closingCostBreakdown.nysTransferTax > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[11px] text-slate-400">NYS Transfer Tax (0.4%)</span>
                    <span className="text-[11px] font-mono tabular-nums text-white">{fmt(closingCostBreakdown.nysTransferTax)}</span>
                  </div>
                )}
                {closingCostBreakdown.mansionTax > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[11px] text-slate-400">Mansion Tax</span>
                    <span className="text-[11px] font-mono tabular-nums text-white">{fmt(closingCostBreakdown.mansionTax)}</span>
                  </div>
                )}
                {closingCostBreakdown.mortgageRecordingTax > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-[11px] text-slate-400">Mortgage Recording Tax</span>
                    <span className="text-[11px] font-mono tabular-nums text-white">{fmt(closingCostBreakdown.mortgageRecordingTax)}</span>
                  </div>
                )}
                {/* Bridge -> Refi double MRT detail */}
                {activeStructure === "bridge_refi" && closingCostBreakdown.bridgeMrt != null && closingCostBreakdown.bridgeMrt > 0 && (
                  <div className="mt-1 pt-1 border-t border-white/5">
                    <div className="flex justify-between py-0.5">
                      <span className="text-[11px] text-amber-400">Bridge MRT</span>
                      <span className="text-[11px] font-mono tabular-nums text-amber-400">{fmt(closingCostBreakdown.bridgeMrt)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-[11px] text-amber-400">Refi MRT{useCEMA ? " (CEMA)" : ""}</span>
                      <span className="text-[11px] font-mono tabular-nums text-amber-400">{fmt(closingCostBreakdown.refiMrt ?? 0)}</span>
                    </div>
                    {closingCostBreakdown.cemaSavings != null && closingCostBreakdown.cemaSavings > 0 && (
                      <div className="flex justify-between py-0.5">
                        <span className="text-[11px] text-emerald-400">CEMA Savings</span>
                        <span className="text-[11px] font-mono tabular-nums text-emerald-400">-{fmt(closingCostBreakdown.cemaSavings)}</span>
                      </div>
                    )}
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                      <input type="checkbox" checked={useCEMA} onChange={e => setUseCEMA(e.target.checked)}
                        className="rounded border-white/20 bg-slate-800/40 text-blue-500 focus:ring-blue-500/30 w-3 h-3" />
                      <span className="text-[10px] text-slate-400">Use CEMA for refi</span>
                    </label>
                  </div>
                )}
                {/* Assumable MRT savings */}
                {activeStructure === "assumable" && closingCostBreakdown.mrtSavings != null && closingCostBreakdown.mrtSavings > 0 && (
                  <div className="flex justify-between py-0.5 mt-1 pt-1 border-t border-white/5">
                    <span className="text-[11px] text-emerald-400">MRT Savings (assumed)</span>
                    <span className="text-[11px] font-mono tabular-nums text-emerald-400">-{fmt(closingCostBreakdown.mrtSavings)}</span>
                  </div>
                )}
                <div className="flex justify-between py-0.5">
                  <span className="text-[11px] text-slate-400">Title Insurance</span>
                  <span className="text-[11px] font-mono tabular-nums text-white">{fmt(closingCostBreakdown.titleInsurance)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[11px] text-slate-400">Legal & Professional</span>
                  <span className="text-[11px] font-mono tabular-nums text-white">{fmt((closingCostBreakdown.buyerAttorneyFee + closingCostBreakdown.bankAttorneyFee) + closingCostBreakdown.appraisalFee + closingCostBreakdown.environmentalReport + closingCostBreakdown.surveyFee + closingCostBreakdown.miscFees)}</span>
                </div>
                <div className="flex justify-between pt-1 mt-1 border-t border-white/10">
                  <span className="text-[11px] font-semibold text-white">Total Buyer Costs</span>
                  <span className="text-[11px] font-mono tabular-nums font-bold text-white">{fmt(closingCostBreakdown.totalBuyerCosts)}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-[10px] text-slate-500">as % of purchase price</span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-500">{(closingCostBreakdown.totalBuyerCosts / inputs.purchasePrice * 100).toFixed(2)}%</span>
                </div>
                <button
                  onClick={() => update({ closingCosts: closingCostBreakdown.totalBuyerCosts })}
                  className="w-full mt-1 text-xs text-blue-400 hover:text-blue-300 font-medium py-1 rounded bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
                >
                  Apply NYC costs to deal
                </button>
              </div>
            )}
          </div>
        )}
        {renoEstimate && (
          <div className="flex items-center justify-between -mt-1 mb-1">
            <span className="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full font-medium border border-amber-500/20">
              {renoEstimate.recommendedLevel.charAt(0).toUpperCase() + renoEstimate.recommendedLevel.slice(1)} Rehab: ${renoEstimate.totalCost[renoEstimate.recommendedLevel] >= 1e6 ? (renoEstimate.totalCost[renoEstimate.recommendedLevel] / 1e6).toFixed(2) + "M" : Math.round(renoEstimate.totalCost[renoEstimate.recommendedLevel] / 1000) + "K"}
              {renoEstimate.arv[renoEstimate.recommendedLevel] > 0 && (
                <span className="text-amber-300 font-normal">ARV ${(renoEstimate.arv[renoEstimate.recommendedLevel] / 1e6).toFixed(1)}M</span>
              )}
            </span>
            <button onClick={() => update({ renovationBudget: renoEstimate.totalCost[renoEstimate.recommendedLevel] })}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium">
              Apply to deal
            </button>
          </div>
        )}
        <div className="bg-blue-500/10 rounded-lg p-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total Equity Required</span>
            <span className="font-semibold text-blue-400">{fmt(outputs.totalEquity)}</span>
          </div>
        </div>
      </Section>

      {/* Financing */}
      <Section title="Financing" summary={`${inputs.ltvPercent}% LTV at ${inputs.interestRate}%`}>
        {fredRate && (
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full font-medium border border-blue-500/20">
              30yr Fixed: {fredRate.toFixed(2)}%
              <span className="text-blue-500/60 font-normal">FRED</span>
            </span>
            <button onClick={() => update({ interestRate: fredRate })}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium">
              Apply to deal
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <SliderField label="LTV" value={inputs.ltvPercent} onChange={v => update({ ltvPercent: v })} min={0} max={100} step={1} badge="FRED" />
          <SliderField label="Interest Rate" value={inputs.interestRate} onChange={v => update({ interestRate: v })} min={0} max={15} step={0.125} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amortization (yrs)" value={inputs.amortizationYears} onChange={v => update({ amortizationYears: v })} step="1" />
          <Field label="Loan Term (yrs)" value={inputs.loanTermYears} onChange={v => update({ loanTermYears: v })} step="1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Origination Fee" value={inputs.originationFeePercent} onChange={v => update({ originationFeePercent: v })} suffix="%" step="0.25" aiAssumed={isAi("originationFeePercent")} onClearAi={() => clearAi("originationFeePercent")} />
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={inputs.interestOnly} onChange={e => update({ interestOnly: e.target.checked })} className="rounded border-white/10 bg-slate-800/40 text-blue-500" />
              Interest Only
            </label>
          </div>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 space-y-1">
          <div className="flex justify-between text-xs"><span className="text-slate-500">Loan Amount</span><span className="font-medium text-white">{fmt(outputs.loanAmount)}</span></div>
          <div className="flex justify-between text-xs"><span className="text-slate-500">IO Annual Payment</span><span className="font-medium text-white">{fmt(outputs.ioAnnualPayment)}</span></div>
          <div className="flex justify-between text-xs"><span className="text-slate-500">Amort Annual Payment</span><span className="font-medium text-white">{fmt(outputs.annualDebtService)}</span></div>
        </div>
      </Section>

      {/* Structure-Specific Financing */}
      {activeStructure === "all_cash" && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
          <p className="text-xs text-emerald-400 font-medium">All Cash — No leverage</p>
          <p className="text-[10px] text-emerald-500/60 mt-0.5">100% equity. Financing section above is ignored for structure analysis.</p>
        </div>
      )}

      {activeStructure === "bridge_refi" && (
        <Section title="Bridge → Refi (BRRRR)">
          {/* Visual Timeline */}
          <div className="flex items-stretch gap-0 mb-4 overflow-x-auto no-scrollbar">
            {[
              { phase: "ACQUIRE", detail: "Bridge Loan", time: "Month 0", color: "border-amber-500/30 bg-amber-500/5", dot: "bg-amber-400" },
              { phase: "RENOVATE &\nSTABILIZE", detail: "Value-Add", time: `Month 1\u2013${(mergedStructureInputs as any).bridgeTermMonths ?? 24}`, color: "border-blue-500/30 bg-blue-500/5", dot: "bg-blue-400" },
              { phase: "REFINANCE", detail: "Permanent", time: `Month ${(mergedStructureInputs as any).bridgeTermMonths ?? 24}+`, color: "border-emerald-500/30 bg-emerald-500/5", dot: "bg-emerald-400" },
            ].map((step, i) => (
              <div key={i} className="flex items-center">
                <div className={`border rounded-lg p-2.5 min-w-[100px] text-center ${step.color}`}>
                  <div className={`w-2 h-2 rounded-full mx-auto mb-1.5 ${step.dot}`} />
                  <p className="text-[10px] font-bold text-white leading-tight whitespace-pre-line">{step.phase}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{step.detail}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{step.time}</p>
                </div>
                {i < 2 && (
                  <div className="flex items-center px-1 text-slate-600">
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Phase 1: Bridge Loan</p>
          {/* LTV / LTC Toggle */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-slate-500">Sizing:</span>
            <div className="flex bg-white/5 rounded-md p-0.5">
              <button onClick={() => updateStructureParam("useLtc", false)} className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${!(mergedStructureInputs as any).useLtc ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}>LTV</button>
              <button onClick={() => updateStructureParam("useLtc", true)} className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${(mergedStructureInputs as any).useLtc ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}>LTC</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(mergedStructureInputs as any).useLtc ? (
              <Field label="LTC %" value={(mergedStructureInputs as any).ltcPercent ?? 80} onChange={v => updateStructureParam("ltcPercent", v)} suffix="%" step="1" />
            ) : (
              <Field label="Bridge LTV" value={(mergedStructureInputs as any).bridgeLtvPct ?? 80} onChange={v => updateStructureParam("bridgeLtvPct", v)} suffix="%" step="1" />
            )}
            <Field label="Bridge Rate" value={(mergedStructureInputs as any).bridgeRate ?? 10} onChange={v => updateStructureParam("bridgeRate", v)} suffix="%" step="0.25" />
            <Field label="Term (months)" value={(mergedStructureInputs as any).bridgeTermMonths ?? 24} onChange={v => updateStructureParam("bridgeTermMonths", v)} step="1" />
            <Field label="Origination Pts" value={(mergedStructureInputs as any).bridgeOriginationPts ?? 2} onChange={v => updateStructureParam("bridgeOriginationPts", v)} suffix="%" step="0.25" />
            <Field label="Interest Reserve (mo)" value={(mergedStructureInputs as any).interestReserveMonths ?? 0} onChange={v => updateStructureParam("interestReserveMonths", v)} step="1" />
            <Field label="Exit Fee" value={(mergedStructureInputs as any).bridgeExitFee ?? 0} onChange={v => updateStructureParam("bridgeExitFee", v)} suffix="%" step="0.25" />
          </div>
          {/* Bridge Cost Summary */}
          {structureAnalysis && (structureAnalysis as any).interestReserve != null && (
            <div className="bg-white/[0.03] rounded-lg p-3 space-y-1 mt-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Bridge Cost Breakdown</p>
              {(structureAnalysis as any).ltcBasis != null && <div className="flex justify-between text-xs"><span className="text-slate-500">Total Cost Basis</span><span className="font-medium text-white">{fmt((structureAnalysis as any).ltcBasis)}</span></div>}
              <div className="flex justify-between text-xs"><span className="text-slate-500">Bridge Loan</span><span className="font-medium text-white">{fmt((structureAnalysis as any).bridgeLoan ?? 0)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Interest Reserve</span><span className="font-medium text-white">{fmt((structureAnalysis as any).interestReserve)}</span></div>
              {(structureAnalysis as any).bridgeExitFee > 0 && <div className="flex justify-between text-xs"><span className="text-slate-500">Exit Fee</span><span className="font-medium text-white">{fmt((structureAnalysis as any).bridgeExitFee)}</span></div>}
              <div className="flex justify-between text-xs pt-1 border-t border-white/10"><span className="text-slate-400 font-medium">Total Bridge Cost</span><span className="font-bold text-white">{fmt((structureAnalysis as any).totalBridgeCost ?? 0)}</span></div>
            </div>
          )}
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Phase 2: Stabilization</p>
          <Field label="Post-Rehab Rent Bump" value={(mergedStructureInputs as any).postRehabRentBump ?? 20} onChange={v => updateStructureParam("postRehabRentBump", v)} suffix="%" step="1" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Renovation (months)" value={(mergedStructureInputs as any).renovationMonths ?? 0} onChange={v => updateStructureParam("renovationMonths", v)} step="1" />
            <Field label="Lease-Up (months)" value={(mergedStructureInputs as any).leaseUpMonths ?? 0} onChange={v => updateStructureParam("leaseUpMonths", v)} step="1" />
            <Field label="Starting Occupancy" value={(mergedStructureInputs as any).startingOccupancy ?? 0} onChange={v => updateStructureParam("startingOccupancy", v)} suffix="%" step="5" />
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Lease-Up Curve</label>
              <select
                value={(mergedStructureInputs as any).leaseUpCurve ?? "linear"}
                onChange={e => updateStructureParam("leaseUpCurve", e.target.value)}
                className="w-full bg-slate-800/40 border border-white/10 rounded-md text-sm text-white px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="linear">Linear</option>
                <option value="front_loaded">Front-Loaded</option>
                <option value="back_loaded">Back-Loaded</option>
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Phase 3: Permanent Refi</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Refi LTV (of ARV)" value={(mergedStructureInputs as any).refiLtvPct ?? 75} onChange={v => updateStructureParam("refiLtvPct", v)} suffix="%" step="1" />
            <Field label="Refi Rate" value={(mergedStructureInputs as any).refiRate ?? (fredRate || 7)} onChange={v => updateStructureParam("refiRate", v)} suffix="%" step="0.125" />
            <Field label="Amortization (yrs)" value={(mergedStructureInputs as any).refiAmortization ?? 30} onChange={v => updateStructureParam("refiAmortization", v)} step="1" />
            <Field label="Refi Term (yrs)" value={(mergedStructureInputs as any).refiTermYears ?? 10} onChange={v => updateStructureParam("refiTermYears", v)} step="1" />
          </div>
          <Field label="ARV Override" value={(mergedStructureInputs as any).arvOverride ?? 0} onChange={v => updateStructureParam("arvOverride", v)} prefix="$" />
        </Section>
      )}

      {activeStructure === "assumable" && (
        <Section title="Assumable Mortgage">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Existing Loan</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Loan Balance" value={(mergedStructureInputs as any).existingLoanBalance ?? 0} onChange={v => updateStructureParam("existingLoanBalance", v)} prefix="$" />
            <Field label="Locked Rate" value={(mergedStructureInputs as any).existingRate ?? 3.5} onChange={v => updateStructureParam("existingRate", v)} suffix="%" step="0.125" />
            <Field label="Remaining (months)" value={(mergedStructureInputs as any).existingTermRemaining ?? 300} onChange={v => updateStructureParam("existingTermRemaining", v)} step="1" />
            <Field label="Original Amort (yrs)" value={(mergedStructureInputs as any).existingAmortization ?? 30} onChange={v => updateStructureParam("existingAmortization", v)} step="1" />
          </div>
          <Field label="Assumption Fee" value={(mergedStructureInputs as any).assumptionFee ?? 1} onChange={v => updateStructureParam("assumptionFee", v)} suffix="%" step="0.25" />
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Supplemental Loan (Optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supp. Amount" value={(mergedStructureInputs as any).supplementalLoanAmount ?? 0} onChange={v => updateStructureParam("supplementalLoanAmount", v)} prefix="$" />
            <Field label="Supp. Rate" value={(mergedStructureInputs as any).supplementalRate ?? 0} onChange={v => updateStructureParam("supplementalRate", v)} suffix="%" step="0.125" />
          </div>
          {fredRate != null && (() => {
            const assumedRate = (mergedStructureInputs as any).existingRate || 3.5;
            const marketRate = fredRate;
            const maxRate = Math.max(assumedRate, marketRate, 1);
            const savings = marketRate - assumedRate;
            const loanBal = (mergedStructureInputs as any).existingLoanBalance || 0;
            const annualSavings = loanBal > 0 ? Math.round(loanBal * (savings / 100)) : 0;
            return (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 mt-2 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Your Assumed Rate</span>
                    <span className="text-xs font-bold text-emerald-400 font-mono">{assumedRate.toFixed(2)}%</span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${(assumedRate / maxRate) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Today&apos;s Market Rate</span>
                    <span className="text-xs font-bold text-amber-400 font-mono">{marketRate.toFixed(2)}% <span className="text-[9px] font-normal text-slate-500 ml-1 px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">FRED</span></span>
                  </div>
                  <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${(marketRate / maxRate) * 100}%` }} />
                  </div>
                </div>
                {savings > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                    <p className="text-xs font-bold text-emerald-400">You Save: {savings.toFixed(2)}%{annualSavings > 0 ? ` \u2192 ${fmt(annualSavings)}/year` : ""}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </Section>
      )}

      {activeStructure === "syndication" && (
        <Section title="Syndication Structure">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Debt Terms</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="LTV" value={(mergedStructureInputs as any).ltvPct ?? 65} onChange={v => updateStructureParam("ltvPct", v)} suffix="%" step="1" />
            <Field label="Rate" value={(mergedStructureInputs as any).interestRate ?? (fredRate || 7)} onChange={v => updateStructureParam("interestRate", v)} suffix="%" step="0.125" />
            <Field label="Amortization" value={(mergedStructureInputs as any).amortizationYears ?? 30} onChange={v => updateStructureParam("amortizationYears", v)} step="1" />
            <Field label="Loan Term" value={(mergedStructureInputs as any).loanTermYears ?? 10} onChange={v => updateStructureParam("loanTermYears", v)} step="1" />
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Equity Split</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="GP Equity %" value={(mergedStructureInputs as any).gpEquityPct ?? 10} onChange={v => updateStructureParam("gpEquityPct", v)} suffix="%" step="1" />
            <Field label="LP Equity %" value={(mergedStructureInputs as any).lpEquityPct ?? 90} onChange={v => updateStructureParam("lpEquityPct", v)} suffix="%" step="1" />
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Sponsor Fees</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Acquisition Fee" value={(mergedStructureInputs as any).acquisitionFeePct ?? 2} onChange={v => updateStructureParam("acquisitionFeePct", v)} suffix="%" step="0.25" />
            <Field label="Asset Mgmt Fee" value={(mergedStructureInputs as any).assetManagementFeePct ?? 1.5} onChange={v => updateStructureParam("assetManagementFeePct", v)} suffix="%" step="0.25" />
            <Field label="Disposition Fee" value={(mergedStructureInputs as any).dispositionFeePct ?? 1} onChange={v => updateStructureParam("dispositionFeePct", v)} suffix="%" step="0.25" />
            <Field label="Construction Mgmt" value={(mergedStructureInputs as any).constructionMgmtFeePct ?? 5} onChange={v => updateStructureParam("constructionMgmtFeePct", v)} suffix="%" step="1" />
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Waterfall</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred Return" value={(mergedStructureInputs as any).preferredReturn ?? 8} onChange={v => updateStructureParam("preferredReturn", v)} suffix="%" step="0.5" />
            <Field label="GP Promote (Pref)" value={(mergedStructureInputs as any).gpPromoteAbovePref ?? 20} onChange={v => updateStructureParam("gpPromoteAbovePref", v)} suffix="%" step="5" />
            <Field label="IRR Hurdle" value={(mergedStructureInputs as any).irrHurdle ?? 15} onChange={v => updateStructureParam("irrHurdle", v)} suffix="%" step="1" />
            <Field label="GP Promote (Hurdle)" value={(mergedStructureInputs as any).gpPromoteAboveHurdle ?? 30} onChange={v => updateStructureParam("gpPromoteAboveHurdle", v)} suffix="%" step="5" />
          </div>
        </Section>
      )}
    </>
  );
}
