"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { calculateAll, DEFAULT_INPUTS } from "@/lib/deal-calculator";
import type { DealInputs, UnitMixRow, DealOutputs } from "@/lib/deal-calculator";
import { saveDealAnalysis, fetchDealPrefillData, getDealAnalysis } from "../actions";
import type { DealPrefillData } from "../actions";
import { generateDealPdf } from "@/lib/deal-pdf";

// ============================================================
// Collapsible Section
// ============================================================
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ============================================================
// AI Sparkle indicator for assumed fields
// ============================================================
function Sparkle() {
  return (
    <span className="inline-block ml-1 text-amber-500" title="AI-generated assumption">
      <svg className="w-3 h-3 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" /></svg>
    </span>
  );
}

// ============================================================
// Input Field with optional AI sparkle
// ============================================================
function Field({ label, value, onChange, prefix, suffix, type = "number", step, min, className, aiAssumed, onClearAi }: {
  label: string; value: number | string; onChange: (v: number) => void;
  prefix?: string; suffix?: string; type?: string; step?: string; min?: string; className?: string;
  aiAssumed?: boolean; onClearAi?: () => void;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}
        {aiAssumed && <Sparkle />}
      </label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => {
            onChange(parseFloat(e.target.value) || 0);
            if (onClearAi) onClearAi();
          }}
          step={step || "any"}
          min={min}
          className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""} ${aiAssumed ? "bg-amber-50/40" : ""}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Format helpers
// ============================================================
const fmt = (n: number) => n >= 0 ? `$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtX = (n: number) => `${n.toFixed(2)}x`;

// ============================================================
// Main Deal Modeler
// ============================================================
export default function DealModeler() {
  const searchParams = useSearchParams();
  const [inputs, setInputs] = useState<DealInputs>({ ...DEFAULT_INPUTS });
  const [dealName, setDealName] = useState("");
  const [dealType, setDealType] = useState("acquisition");
  const [dealSource, setDealSource] = useState("off_market");
  const [address, setAddress] = useState("");
  const [borough, setBorough] = useState("");
  const [block, setBlock] = useState("");
  const [lot, setLot] = useState("");
  const [bbl, setBbl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [propertyDetails, setPropertyDetails] = useState<DealPrefillData | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [assumptions, setAssumptions] = useState<Record<string, boolean>>({});
  const [isAiGenerated, setIsAiGenerated] = useState(false);

  // Load existing deal or pre-fill from query params
  useEffect(() => {
    if (prefilled) return;
    const dealId = searchParams.get("id");

    if (dealId) {
      setPrefillLoading(true);
      getDealAnalysis(dealId).then(deal => {
        setSavedId(deal.id);
        setDealName(deal.name || "");
        setAddress(deal.address || "");
        setBorough(deal.borough || "");
        setBlock(deal.block || "");
        setLot(deal.lot || "");
        setBbl(deal.bbl || "");
        setDealType(deal.dealType || "acquisition");
        setDealSource(deal.dealSource || "off_market");
        setNotes(deal.notes || "");
        if (deal.inputs) {
          const loaded = deal.inputs as unknown as DealInputs;
          setInputs(loaded);
          if (loaded._assumptions) {
            setAssumptions(loaded._assumptions);
            setIsAiGenerated(true);
          }
        }
        setPrefillLoading(false);
      }).catch(() => setPrefillLoading(false));
      setPrefilled(true);
      return;
    }

    const addr = searchParams.get("address");
    const qBbl = searchParams.get("bbl");
    const qBorough = searchParams.get("borough");
    const qBlock = searchParams.get("block");
    const qLot = searchParams.get("lot");

    if (addr) { setAddress(addr); setDealName(addr); }
    if (qBorough) setBorough(qBorough);
    if (qBlock) setBlock(qBlock);
    if (qLot) setLot(qLot);

    if (qBbl) {
      setBbl(qBbl);
      setPrefillLoading(true);
      fetchDealPrefillData(qBbl).then(p => {
        if (!p) { setPrefillLoading(false); return; }
        setPropertyDetails(p);
        if (!addr && p.address) { setAddress(p.address); setDealName(p.address); }
        if (!qBorough && p.borough) setBorough(p.borough);
        if (!qBlock && p.block) setBlock(p.block);
        if (!qLot && p.lot) setLot(p.lot);
        setInputs(prev => ({
          ...prev,
          purchasePrice: p.lastSalePrice > 100000 ? p.lastSalePrice : (p.assessTotal > 0 ? p.assessTotal : prev.purchasePrice),
          realEstateTaxes: p.annualTaxes > 0 ? p.annualTaxes : prev.realEstateTaxes,
          insurance: p.unitsRes > 0 ? p.unitsRes * 1600 : prev.insurance,
          unitMix: p.suggestedUnitMix.length > 0 ? p.suggestedUnitMix : prev.unitMix,
        }));
        setPrefillLoading(false);
      }).catch(() => setPrefillLoading(false));
    }
    setPrefilled(true);
  }, [searchParams, prefilled]);

  const outputs: DealOutputs = useMemo(() => calculateAll(inputs), [inputs]);

  const update = useCallback((partial: Partial<DealInputs>) => {
    setInputs(prev => ({ ...prev, ...partial }));
  }, []);

  const clearAi = useCallback((field: string) => {
    setAssumptions(prev => { const next = { ...prev }; delete next[field]; return next; });
  }, []);

  const isAi = useCallback((field: string) => !!assumptions[field], [assumptions]);

  const updateUnit = useCallback((index: number, field: keyof UnitMixRow, value: number | string) => {
    setInputs(prev => {
      const unitMix = [...prev.unitMix];
      unitMix[index] = { ...unitMix[index], [field]: value };
      return { ...prev, unitMix };
    });
    clearAi("unitMix");
  }, [clearAi]);

  const addUnitType = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      unitMix: [...prev.unitMix, { type: "New", count: 1, monthlyRent: 2000 }],
    }));
    clearAi("unitMix");
  }, [clearAi]);

  const removeUnitType = useCallback((index: number) => {
    setInputs(prev => ({
      ...prev,
      unitMix: prev.unitMix.filter((_, i) => i !== index),
    }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await saveDealAnalysis({
        id: savedId || undefined,
        name: dealName || address || "Untitled Deal",
        address: address || undefined,
        borough: borough || undefined,
        block: block || undefined,
        lot: lot || undefined,
        bbl: bbl || undefined,
        dealType,
        dealSource,
        inputs: { ...inputs, _assumptions: assumptions },
        outputs,
        notes: notes || undefined,
      });
      setSavedId(result.id);
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      setSaveMsg("Error: " + (err.message || "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const totalUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <a href="/deals" className="text-sm text-slate-500 hover:text-blue-600">&larr; Back</a>
            <div>
              <input
                value={dealName}
                onChange={e => setDealName(e.target.value)}
                placeholder="Deal name..."
                className="text-lg font-bold text-slate-900 border-none focus:outline-none bg-transparent placeholder:text-slate-300 w-full max-w-md"
              />
              {address && <p className="text-xs text-slate-500">{address}{borough ? `, ${borough}` : ""}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveMsg && <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>{saveMsg}</span>}
            <button
              onClick={() => generateDealPdf({ dealName: dealName || address || "Deal Analysis", address, borough, inputs, outputs, propertyDetails, notes })}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              Export PDF
            </button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {saving ? "Saving..." : savedId ? "Update" : "Save Deal"}
            </button>
          </div>
        </div>
      </div>

      {prefillLoading && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-blue-700">
            <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
            Loading deal data...
          </div>
        </div>
      )}

      {isAiGenerated && !prefillLoading && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-amber-800">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" /></svg>
            <span><strong>AI-Generated Assumptions</strong> — Review and adjust inputs as needed. Fields marked with <Sparkle /> were auto-calculated.</span>
          </div>
        </div>
      )}

      {propertyDetails && !prefillLoading && !isAiGenerated && (
        <div className="bg-green-50 border-b border-green-100 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto text-sm text-green-700">
            Pre-filled from {propertyDetails.address}, {propertyDetails.borough} — {propertyDetails.unitsRes} units, built {propertyDetails.yearBuilt}
            {propertyDetails.lastSalePrice > 0 && ` — Last sale: ${fmt(propertyDetails.lastSalePrice)}`}
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ======================== LEFT PANEL — INPUTS ======================== */}
          <div className="w-full lg:w-[440px] flex-shrink-0 space-y-4">

            {/* Deal Info */}
            <Section title="Deal Info">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Deal Type</label>
                  <select value={dealType} onChange={e => setDealType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                    <option value="acquisition">Acquisition</option>
                    <option value="value_add">Value-Add</option>
                    <option value="new_development">New Development</option>
                    <option value="mixed_use">Mixed Use</option>
                    <option value="ground_up">Ground Up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Source</label>
                  <select value={dealSource} onChange={e => setDealSource(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                    <option value="off_market">Off-Market</option>
                    <option value="on_market">On-Market</option>
                    <option value="new_development">New Development</option>
                    <option value="referral">Referral</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </Section>

            {/* Acquisition */}
            <Section title="Acquisition">
              <Field label="Purchase Price" value={inputs.purchasePrice} onChange={v => update({ purchasePrice: v })} prefix="$" aiAssumed={isAi("purchasePrice")} onClearAi={() => clearAi("purchasePrice")} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Closing Costs" value={inputs.closingCosts} onChange={v => update({ closingCosts: v })} prefix="$" aiAssumed={isAi("closingCosts")} onClearAi={() => clearAi("closingCosts")} />
                <Field label="Renovation Budget" value={inputs.renovationBudget} onChange={v => update({ renovationBudget: v })} prefix="$" />
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total Equity Required</span>
                  <span className="font-semibold text-blue-700">{fmt(outputs.totalEquity)}</span>
                </div>
              </div>
            </Section>

            {/* Financing */}
            <Section title="Financing">
              <div className="grid grid-cols-2 gap-3">
                <Field label="LTV" value={inputs.ltvPercent} onChange={v => update({ ltvPercent: v })} suffix="%" step="1" aiAssumed={isAi("ltvPercent")} onClearAi={() => clearAi("ltvPercent")} />
                <Field label="Interest Rate" value={inputs.interestRate} onChange={v => update({ interestRate: v })} suffix="%" step="0.125" aiAssumed={isAi("interestRate")} onClearAi={() => clearAi("interestRate")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amortization (yrs)" value={inputs.amortizationYears} onChange={v => update({ amortizationYears: v })} step="1" />
                <Field label="Loan Term (yrs)" value={inputs.loanTermYears} onChange={v => update({ loanTermYears: v })} step="1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Origination Fee" value={inputs.originationFeePercent} onChange={v => update({ originationFeePercent: v })} suffix="%" step="0.25" aiAssumed={isAi("originationFeePercent")} onClearAi={() => clearAi("originationFeePercent")} />
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={inputs.interestOnly} onChange={e => update({ interestOnly: e.target.checked })} className="rounded border-slate-300 text-blue-600" />
                    Interest Only
                  </label>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Loan Amount</span><span className="font-medium">{fmt(outputs.loanAmount)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">IO Annual Payment</span><span className="font-medium">{fmt(outputs.ioAnnualPayment)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Amort Annual Payment</span><span className="font-medium">{fmt(outputs.annualDebtService)}</span></div>
              </div>
            </Section>

            {/* Income — Residential */}
            <Section title="Income — Residential">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500">Unit Mix ({totalUnits} units){isAi("unitMix") && <Sparkle />}</span>
                  <button onClick={addUnitType} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add Type</button>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-500">Type</th>
                        <th className="text-center px-2 py-2 font-medium text-slate-500">Ct</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-500">Rent/Mo</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-500">Annual</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.unitMix.map((u, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1.5">
                            <input value={u.type} onChange={e => updateUnit(i, "type", e.target.value)} className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs" />
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" value={u.count} onChange={e => updateUnit(i, "count", parseInt(e.target.value) || 0)} className="w-14 text-center px-1 py-1 border border-slate-200 rounded text-xs" min="0" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={u.monthlyRent} onChange={e => updateUnit(i, "monthlyRent", parseFloat(e.target.value) || 0)} className="w-full text-right px-1.5 py-1 border border-slate-200 rounded text-xs" />
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{fmt(u.count * u.monthlyRent * 12)}</td>
                          <td className="pr-2">
                            {inputs.unitMix.length > 1 && (
                              <button onClick={() => removeUnitType(i)} className="text-slate-300 hover:text-red-500 text-sm">&times;</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="px-3 py-2 font-semibold text-slate-700">GPR</td>
                        <td className="text-center px-2 py-2 font-semibold">{totalUnits}</td>
                        <td></td>
                        <td className="text-right px-3 py-2 font-semibold text-slate-700">{fmt(outputs.grossPotentialResidentialRent)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vacancy Rate" value={inputs.residentialVacancyRate} onChange={v => update({ residentialVacancyRate: v })} suffix="%" step="0.5" aiAssumed={isAi("residentialVacancyRate")} onClearAi={() => clearAi("residentialVacancyRate")} />
                <Field label="Concessions (annual)" value={inputs.concessions} onChange={v => update({ concessions: v })} prefix="$" aiAssumed={isAi("concessions")} onClearAi={() => clearAi("concessions")} />
              </div>
              <Field label="Annual Rent Growth" value={inputs.annualRentGrowth} onChange={v => update({ annualRentGrowth: v })} suffix="%" step="0.5" aiAssumed={isAi("annualRentGrowth")} onClearAi={() => clearAi("annualRentGrowth")} />
            </Section>

            {/* Income — Commercial */}
            <Section title="Income — Commercial" defaultOpen={inputs.commercialRentAnnual > 0}>
              <Field label="Commercial Rent (annual)" value={inputs.commercialRentAnnual} onChange={v => update({ commercialRentAnnual: v })} prefix="$" aiAssumed={isAi("commercialRentAnnual")} onClearAi={() => clearAi("commercialRentAnnual")} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vacancy Rate" value={inputs.commercialVacancyRate} onChange={v => update({ commercialVacancyRate: v })} suffix="%" step="0.5" aiAssumed={isAi("commercialVacancyRate")} onClearAi={() => clearAi("commercialVacancyRate")} />
                <Field label="Concessions (annual)" value={inputs.commercialConcessions} onChange={v => update({ commercialConcessions: v })} prefix="$" />
              </div>
            </Section>

            {/* Income — Other */}
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
              </div>
              <Field label="Other Misc Income" value={inputs.otherMiscIncome} onChange={v => update({ otherMiscIncome: v })} prefix="$" />
            </Section>

            {/* Expenses — Fixed */}
            <Section title="Expenses — Taxes & Insurance">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Real Estate Taxes" value={inputs.realEstateTaxes} onChange={v => update({ realEstateTaxes: v })} prefix="$" aiAssumed={isAi("realEstateTaxes")} onClearAi={() => clearAi("realEstateTaxes")} />
                <Field label="Property Insurance" value={inputs.insurance} onChange={v => update({ insurance: v })} prefix="$" aiAssumed={isAi("insurance")} onClearAi={() => clearAi("insurance")} />
                <Field label="License/Permit/Insp." value={inputs.licenseFees} onChange={v => update({ licenseFees: v })} prefix="$" aiAssumed={isAi("licenseFees")} onClearAi={() => clearAi("licenseFees")} />
                <Field label="Fire Meter Service" value={inputs.fireMeter} onChange={v => update({ fireMeter: v })} prefix="$" aiAssumed={isAi("fireMeter")} onClearAi={() => clearAi("fireMeter")} />
              </div>
            </Section>

            {/* Expenses — Utilities */}
            <Section title="Expenses — Utilities">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Electricity + Gas" value={inputs.electricityGas} onChange={v => update({ electricityGas: v })} prefix="$" aiAssumed={isAi("electricityGas")} onClearAi={() => clearAi("electricityGas")} />
                <Field label="Water / Sewer" value={inputs.waterSewer} onChange={v => update({ waterSewer: v })} prefix="$" aiAssumed={isAi("waterSewer")} onClearAi={() => clearAi("waterSewer")} />
              </div>
            </Section>

            {/* Expenses — Management */}
            <Section title="Expenses — Management & Personnel">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mgmt Fee" value={inputs.managementFeePercent} onChange={v => update({ managementFeePercent: v })} suffix="%" step="0.5" aiAssumed={isAi("managementFeePercent")} onClearAi={() => clearAi("managementFeePercent")} />
                <Field label="Payroll" value={inputs.payroll} onChange={v => update({ payroll: v })} prefix="$" aiAssumed={isAi("payroll")} onClearAi={() => clearAi("payroll")} />
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Calculated Mgmt Fee</span><span className="font-medium">{fmt(outputs.managementFee)}</span></div>
              </div>
            </Section>

            {/* Expenses — Professional */}
            <Section title="Expenses — Professional Services">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Accounting" value={inputs.accounting} onChange={v => update({ accounting: v })} prefix="$" aiAssumed={isAi("accounting")} onClearAi={() => clearAi("accounting")} />
                <Field label="Legal" value={inputs.legal} onChange={v => update({ legal: v })} prefix="$" aiAssumed={isAi("legal")} onClearAi={() => clearAi("legal")} />
              </div>
              <Field label="Marketing / Leasing" value={inputs.marketing} onChange={v => update({ marketing: v })} prefix="$" aiAssumed={isAi("marketing")} onClearAi={() => clearAi("marketing")} />
            </Section>

            {/* Expenses — R&M */}
            <Section title="Expenses — Repairs & Maintenance">
              <div className="grid grid-cols-2 gap-3">
                <Field label="R&M General" value={inputs.rmGeneral} onChange={v => update({ rmGeneral: v })} prefix="$" aiAssumed={isAi("rmGeneral")} onClearAi={() => clearAi("rmGeneral")} />
                <Field label="R&M CapEx/Reserve" value={inputs.rmCapexReserve} onChange={v => update({ rmCapexReserve: v })} prefix="$" aiAssumed={isAi("rmCapexReserve")} onClearAi={() => clearAi("rmCapexReserve")} />
              </div>
              <Field label="General Admin" value={inputs.generalAdmin} onChange={v => update({ generalAdmin: v })} prefix="$" aiAssumed={isAi("generalAdmin")} onClearAi={() => clearAi("generalAdmin")} />
            </Section>

            {/* Expenses — Contract Services */}
            <Section title="Expenses — Contract Services" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Exterminating" value={inputs.exterminating} onChange={v => update({ exterminating: v })} prefix="$" aiAssumed={isAi("exterminating")} onClearAi={() => clearAi("exterminating")} />
                <Field label="Landscaping" value={inputs.landscaping} onChange={v => update({ landscaping: v })} prefix="$" aiAssumed={isAi("landscaping")} onClearAi={() => clearAi("landscaping")} />
                <Field label="Snow Removal" value={inputs.snowRemoval} onChange={v => update({ snowRemoval: v })} prefix="$" aiAssumed={isAi("snowRemoval")} onClearAi={() => clearAi("snowRemoval")} />
                <Field label="Elevator" value={inputs.elevator} onChange={v => update({ elevator: v })} prefix="$" aiAssumed={isAi("elevator")} onClearAi={() => clearAi("elevator")} />
                <Field label="Alarm Monitoring" value={inputs.alarmMonitoring} onChange={v => update({ alarmMonitoring: v })} prefix="$" aiAssumed={isAi("alarmMonitoring")} onClearAi={() => clearAi("alarmMonitoring")} />
                <Field label="Telephone/Internet" value={inputs.telephoneInternet} onChange={v => update({ telephoneInternet: v })} prefix="$" aiAssumed={isAi("telephoneInternet")} onClearAi={() => clearAi("telephoneInternet")} />
                <Field label="Cleaning" value={inputs.cleaning} onChange={v => update({ cleaning: v })} prefix="$" aiAssumed={isAi("cleaning")} onClearAi={() => clearAi("cleaning")} />
                <Field label="Trash Removal" value={inputs.trashRemoval} onChange={v => update({ trashRemoval: v })} prefix="$" aiAssumed={isAi("trashRemoval")} onClearAi={() => clearAi("trashRemoval")} />
              </div>
              <Field label="Other Contract Services" value={inputs.otherContractServices} onChange={v => update({ otherContractServices: v })} prefix="$" />
              <Field label="Annual Expense Growth" value={inputs.annualExpenseGrowth} onChange={v => update({ annualExpenseGrowth: v })} suffix="%" step="0.5" aiAssumed={isAi("annualExpenseGrowth")} onClearAi={() => clearAi("annualExpenseGrowth")} />
            </Section>

            {/* Exit Assumptions */}
            <Section title="Exit Assumptions">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hold Period (yrs)" value={inputs.holdPeriodYears} onChange={v => update({ holdPeriodYears: Math.max(1, Math.round(v)) })} step="1" min="1" aiAssumed={isAi("holdPeriodYears")} onClearAi={() => clearAi("holdPeriodYears")} />
                <Field label="Exit Cap Rate" value={inputs.exitCapRate} onChange={v => update({ exitCapRate: v })} suffix="%" step="0.25" aiAssumed={isAi("exitCapRate")} onClearAi={() => clearAi("exitCapRate")} />
              </div>
              <Field label="Selling Costs" value={inputs.sellingCostPercent} onChange={v => update({ sellingCostPercent: v })} suffix="%" step="0.5" aiAssumed={isAi("sellingCostPercent")} onClearAi={() => clearAi("sellingCostPercent")} />
            </Section>

            {/* Notes */}
            <Section title="Notes" defaultOpen={!!notes}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Deal notes, assumptions, conditions..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </Section>
          </div>

          {/* ======================== RIGHT PANEL — OUTPUTS ======================== */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Key Metrics Cards */}
            <div className="sticky top-[65px] z-10 bg-white/95 backdrop-blur-sm pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                {[
                  { label: "Cap Rate", value: fmtPct(outputs.capRate), color: outputs.capRate >= 5 ? "text-green-700" : outputs.capRate >= 3 ? "text-amber-700" : "text-red-700" },
                  { label: "CoC (IO)", value: fmtPct(outputs.cashOnCashIO), color: outputs.cashOnCashIO >= 8 ? "text-green-700" : outputs.cashOnCashIO >= 4 ? "text-amber-700" : "text-red-700" },
                  { label: "CoC (Amort)", value: fmtPct(outputs.cashOnCashAmort), color: outputs.cashOnCashAmort >= 6 ? "text-green-700" : outputs.cashOnCashAmort >= 2 ? "text-amber-700" : "text-red-700" },
                  { label: "IRR", value: isFinite(outputs.irr) ? fmtPct(outputs.irr) : "N/A", color: outputs.irr >= 15 ? "text-green-700" : outputs.irr >= 8 ? "text-amber-700" : "text-red-700" },
                  { label: "DSCR", value: fmtX(outputs.dscr), color: outputs.dscr >= 1.25 ? "text-green-700" : outputs.dscr >= 1.0 ? "text-amber-700" : "text-red-700" },
                  { label: "Debt Yield", value: fmtPct(outputs.debtYield), color: outputs.debtYield >= 8 ? "text-green-700" : outputs.debtYield >= 6 ? "text-amber-700" : "text-red-700" },
                  { label: "Eq Multiple", value: fmtX(outputs.equityMultiple), color: outputs.equityMultiple >= 2 ? "text-green-700" : outputs.equityMultiple >= 1.5 ? "text-amber-700" : "text-red-700" },
                  { label: "NOI", value: fmt(outputs.noi), color: outputs.noi > 0 ? "text-green-700" : "text-red-700" },
                ].map(m => (
                  <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{m.label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pro Forma P&L */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Pro Forma P&L (Year 1)</h3></div>
              <div className="p-5">
                <table className="w-full text-sm">
                  <tbody>
                    <PnlRow label="Gross Potential Residential Rent" value={outputs.grossPotentialResidentialRent} />
                    <PnlRow label="Less: Residential Vacancy" value={-outputs.residentialVacancyLoss} indent />
                    <PnlRow label="Less: Concessions" value={-outputs.concessionsLoss} indent />
                    {outputs.grossPotentialCommercialRent > 0 && (
                      <>
                        <PnlRow label="Gross Potential Commercial Rent" value={outputs.grossPotentialCommercialRent} />
                        <PnlRow label="Less: Commercial Vacancy" value={-outputs.commercialVacancyLoss} indent />
                        <PnlRow label="Less: Commercial Concessions" value={-outputs.commercialConcessionsLoss} indent />
                      </>
                    )}
                    <PnlRow label="Net Rentable Income" value={outputs.netRentableIncome} bold border />
                    {outputs.totalOtherIncome > 0 && <PnlRow label="Plus: Other Income" value={outputs.totalOtherIncome} indent />}
                    <PnlRow label="TOTAL INCOME" value={outputs.totalIncome} bold border />
                    <PnlRow label="Total Operating Expenses" value={-outputs.totalExpenses} />
                    <PnlRow label="NET OPERATING INCOME" value={outputs.noi} bold border />
                    <PnlRow label="IO Debt Service" value={-outputs.ioAnnualPayment} />
                    <PnlRow label="Net Income (IO)" value={outputs.netIncomeIO} bold border />
                    <PnlRow label="Amort Debt Service (30yr)" value={-outputs.annualDebtService} />
                    <PnlRow label="Net Income (Amort)" value={outputs.netIncomeAmort} bold border />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expense Breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Operating Expense Detail</h3></div>
              <div className="p-5">
                <table className="w-full text-sm">
                  <tbody>
                    {outputs.expenseDetails.filter(d => d.amount > 0).map((d, i) => (
                      <PnlRow key={i} label={d.label} value={d.amount} />
                    ))}
                    <PnlRow label="Total Operating Expenses" value={outputs.totalExpenses} bold border />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Analysis Section */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Analysis</h3></div>
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

            {/* Cash Flow Waterfall */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Cash Flow Waterfall</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Year</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">GPR</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Vacancy</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">EGI</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Expenses</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">NOI</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Debt Svc</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Cash Flow</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.cashFlows.map(cf => (
                      <tr key={cf.year} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-700">{cf.year}</td>
                        <td className="text-right px-3 py-2 text-slate-600">{fmt(cf.gpr)}</td>
                        <td className="text-right px-3 py-2 text-red-500">({fmt(cf.vacancy)})</td>
                        <td className="text-right px-3 py-2 text-slate-600">{fmt(cf.egi)}</td>
                        <td className="text-right px-3 py-2 text-red-500">({fmt(cf.expenses)})</td>
                        <td className="text-right px-3 py-2 font-medium text-slate-700">{fmt(cf.noi)}</td>
                        <td className="text-right px-3 py-2 text-red-500">({fmt(cf.debtService)})</td>
                        <td className={`text-right px-3 py-2 font-medium ${cf.cashFlow >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(cf.cashFlow)}</td>
                        <td className={`text-right px-3 py-2 ${cf.cumulativeCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(cf.cumulativeCashFlow)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-blue-50/50">
                      <td className="px-4 py-2 font-semibold text-slate-700">Exit</td>
                      <td colSpan={4} className="text-right px-3 py-2 text-xs text-slate-500">Sale @ {fmtPct(inputs.exitCapRate)} Cap</td>
                      <td className="text-right px-3 py-2 font-medium">{fmt(outputs.exitValue)}</td>
                      <td className="text-right px-3 py-2 text-red-500">({fmt(outputs.loanBalanceAtExit)})</td>
                      <td className="text-right px-3 py-2 font-bold text-blue-700">{fmt(outputs.exitProceeds)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sensitivity Matrix */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Sensitivity Analysis — IRR</h3></div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">{outputs.sensitivity.rowParam} \ {outputs.sensitivity.colParam}</th>
                      {outputs.sensitivity.colLabels.map((cl, i) => (
                        <th key={i} className={`px-3 py-2 text-center font-medium ${cl === "Base" ? "text-blue-700 bg-blue-50" : "text-slate-500"}`}>{cl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.sensitivity.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-slate-100">
                        <td className={`px-3 py-2 font-medium ${outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%` ? "text-blue-700 bg-blue-50" : "text-slate-600"}`}>
                          {outputs.sensitivity.rowLabels[ri]}
                        </td>
                        {row.map((val, ci) => {
                          const isBase = outputs.sensitivity.colLabels[ci] === "Base" && outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%`;
                          return (
                            <td key={ci} className={`px-3 py-2 text-center font-medium ${isBase ? "bg-blue-100 text-blue-800 font-bold" : val >= 15 ? "text-green-700" : val >= 8 ? "text-amber-700" : "text-red-700"}`}>
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

            {/* Sources & Uses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50"><h3 className="text-sm font-semibold text-slate-700">Sources</h3></div>
                <div className="p-4">
                  {outputs.sources.map((s, i) => (
                    <div key={i} className="flex justify-between py-1.5 text-sm">
                      <span className="text-slate-600">{s.label}</span>
                      <span className="font-medium text-slate-900">{fmt(s.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 mt-1 border-t border-slate-200 text-sm font-bold">
                    <span>Total Sources</span>
                    <span>{fmt(outputs.sources.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50"><h3 className="text-sm font-semibold text-slate-700">Uses</h3></div>
                <div className="p-4">
                  {outputs.uses.map((u, i) => (
                    <div key={i} className="flex justify-between py-1.5 text-sm">
                      <span className="text-slate-600">{u.label}</span>
                      <span className="font-medium text-slate-900">{fmt(u.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 mt-1 border-t border-slate-200 text-sm font-bold">
                    <span>Total Uses</span>
                    <span>{fmt(outputs.uses.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exit Analysis */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Exit Analysis</h3></div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-xs text-slate-400 uppercase">Exit NOI</p><p className="text-lg font-bold text-slate-900">{fmt(outputs.exitNoi)}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase">Exit Value</p><p className="text-lg font-bold text-slate-900">{fmt(outputs.exitValue)}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase">Loan Balance</p><p className="text-lg font-bold text-red-600">{fmt(outputs.loanBalanceAtExit)}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase">Net Proceeds</p><p className="text-lg font-bold text-green-700">{fmt(outputs.exitProceeds)}</p></div>
                </div>
              </div>
            </div>

            {/* Property Details (from pre-fill) */}
            {propertyDetails && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Property Details</h3></div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                    <div><p className="text-xs text-slate-400">Address</p><p className="font-medium">{propertyDetails.address}</p></div>
                    <div><p className="text-xs text-slate-400">Borough</p><p className="font-medium">{propertyDetails.borough}</p></div>
                    <div><p className="text-xs text-slate-400">Block / Lot</p><p className="font-medium">{propertyDetails.block} / {propertyDetails.lot}</p></div>
                    <div><p className="text-xs text-slate-400">BBL</p><p className="font-medium">{propertyDetails.bbl}</p></div>
                    <div><p className="text-xs text-slate-400">Res Units</p><p className="font-medium">{propertyDetails.unitsRes || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Total Units</p><p className="font-medium">{propertyDetails.unitsTotal || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Year Built</p><p className="font-medium">{propertyDetails.yearBuilt || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Stories</p><p className="font-medium">{propertyDetails.numFloors || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Building Area</p><p className="font-medium">{propertyDetails.bldgArea > 0 ? `${propertyDetails.bldgArea.toLocaleString()} sqft` : "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Lot Area</p><p className="font-medium">{propertyDetails.lotArea > 0 ? `${propertyDetails.lotArea.toLocaleString()} sqft` : "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Zoning</p><p className="font-medium">{propertyDetails.zoneDist || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Building Class</p><p className="font-medium">{propertyDetails.bldgClass || "—"}</p></div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// P&L Row helper (with optional custom formatted value)
// ============================================================
function PnlRow({ label, value, bold, indent, border, customValue }: {
  label: string; value: number; bold?: boolean; indent?: boolean; border?: boolean; customValue?: string;
}) {
  return (
    <tr className={border ? "border-t border-slate-200" : ""}>
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-semibold text-slate-900" : ""} ${!customValue && value < 0 ? "text-red-600" : ""}`}>
        {customValue ? customValue : value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
      </td>
    </tr>
  );
}
