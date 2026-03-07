"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Receipt, DollarSign } from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import PropertySearchInput from "@/components/research/property-search-input";
import ApplyToDealButton from "@/components/research/apply-to-deal-button";
import type { PropertySelection } from "@/components/research/property-search-input";
import { fetchClosingCosts, fetchTaxReassessment } from "../closing-cost-actions";
import { applyResearchToDeal } from "../research-actions";

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

type Structure = "conventional" | "bridge_refi" | "assumable" | "all_cash" | "syndication";

const STRUCTURES: { key: Structure; label: string }[] = [
  { key: "conventional", label: "Conventional" },
  { key: "bridge_refi", label: "Bridge / Refi" },
  { key: "all_cash", label: "All Cash" },
  { key: "assumable", label: "Assumable" },
  { key: "syndication", label: "Syndication" },
];

export default function ClosingCostsPage() {
  const searchParams = useSearchParams();
  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [structure, setStructure] = useState<Structure>("conventional");
  const [purchasePrice, setPurchasePrice] = useState(5000000);
  const [priceDisplay, setPriceDisplay] = useState("5,000,000");
  const [ltv, setLtv] = useState(70);
  const [units, setUnits] = useState(10);
  const [useCema, setUseCema] = useState(true);

  const [loading, setLoading] = useState(false);
  const [costs, setCosts] = useState<any>(null);
  const [taxReassessment, setTaxReassessment] = useState<any>(null);
  const [toast, setToast] = useState("");
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelect = useCallback((p: PropertySelection) => {
    setProperty(p);
    setUnits(p.unitsRes || 10);
    const estimated = p.assessTotal > 0 ? Math.round(p.assessTotal / 0.45) : 5000000;
    setPurchasePrice(estimated);
    setPriceDisplay(estimated.toLocaleString());
  }, []);

  // Auto-calculate on input change
  useEffect(() => {
    if (!property || purchasePrice <= 0) return;
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(async () => {
      setLoading(true);
      const loanAmount = structure === "all_cash" ? 0 : Math.round(purchasePrice * (ltv / 100));
      try {
        const [costResult, taxResult] = await Promise.allSettled([
          fetchClosingCosts({ purchasePrice, loanAmount, structure, units, useCEMA: useCema, borough: property.borough }),
          fetchTaxReassessment({ bbl: property.bbl, purchasePrice, units, yearBuilt: property.yearBuilt }),
        ]);
        setCosts(costResult.status === "fulfilled" ? costResult.value : null);
        setTaxReassessment(taxResult.status === "fulfilled" ? taxResult.value : null);
      } catch {
        setCosts(null);
        setTaxReassessment(null);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (calcTimer.current) clearTimeout(calcTimer.current); };
  }, [property, purchasePrice, ltv, structure, units, useCema]);

  const handleApply = async (dealId: string) => {
    if (!costs || !property) return;
    try {
      await applyResearchToDeal({
        dealId,
        researchType: "closing_costs",
        data: { address: property.address, borough: property.borough, bbl: property.bbl, totalBuyerCosts: costs.totalBuyerCosts, structure, purchasePrice, effectivePct: costs.effectivePct },
      });
      setToast("Closing costs applied to deal");
      setTimeout(() => setToast(""), 3000);
    } catch { /* */ }
  };

  return (
    <ResearchLayout icon={Receipt} iconColor="text-amber-400" iconBg="bg-amber-600/20" title="Closing Costs" subtitle="Itemized NYC acquisition costs by deal structure">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Inputs */}
        <div className="w-full lg:w-[400px] flex-shrink-0 space-y-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Property Lookup</label>
            <PropertySearchInput
              onSelect={handleSelect}
              initialBbl={searchParams.get("bbl")}
              selected={property}
              onClear={() => { setProperty(null); setCosts(null); setTaxReassessment(null); }}
            />
          </div>

          {property && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Deal Parameters</label>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Structure</label>
                <div className="flex flex-wrap gap-1.5">
                  {STRUCTURES.map(s => (
                    <button key={s.key} onClick={() => setStructure(s.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${structure === s.key ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/5 text-slate-500 hover:text-slate-400 border border-white/5"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">Purchase Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={priceDisplay}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/[^0-9]/g, "");
                      const v = parseInt(cleaned) || 0;
                      setPriceDisplay(v > 0 ? v.toLocaleString() : "");
                      setPurchasePrice(v);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50"
                  />
                </div>
              </div>

              {structure !== "all_cash" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-500">LTV</label>
                    <span className="text-xs font-bold text-white">{ltv}%</span>
                  </div>
                  <input type="range" min={0} max={80} step={5} value={ltv} onChange={e => setLtv(parseInt(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-amber-500" />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useCema} onChange={e => setUseCema(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/30" />
                <span className="text-xs font-medium text-slate-400">Use CEMA (mortgage recording tax savings)</span>
              </label>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="flex-1 min-w-0 space-y-4">
          {!property && (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
                <Receipt className="w-8 h-8 text-slate-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-400 mb-2">Closing cost calculator</h2>
              <p className="text-sm text-slate-600 text-center max-w-sm">Enter a property and deal parameters to see itemized NYC closing costs.</p>
            </div>
          )}

          {loading && <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="animate-pulse bg-white/5 rounded-xl h-14" />)}</div>}

          {!loading && costs && (
            <div className="space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Total Buyer Closing Costs</p>
                    <div className="flex items-baseline gap-3">
                      <p className="text-2xl font-bold text-white">{fmt(costs.totalBuyerCosts)}</p>
                      <p className="text-sm text-slate-400">{fmtPct(costs.effectivePct)} of purchase price</p>
                    </div>
                  </div>
                  <ApplyToDealButton onApply={handleApply} />
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-white/5">Buyer Costs Breakdown</p>
                <div className="divide-y divide-white/5">
                  <CostRow label="NYC Transfer Tax" value={costs.nycTransferTax} />
                  <CostRow label="NYS Transfer Tax" value={costs.nysTransferTax} />
                  <CostRow label="Mansion Tax" value={costs.mansionTax} />
                  <CostRow label="Mortgage Recording Tax" value={costs.mortgageRecordingTax} />
                  <CostRow label="Title Insurance" value={costs.titleInsurance} />
                  <CostRow label="Buyer Attorney Fee" value={costs.buyerAttorneyFee} />
                  <CostRow label="Bank Attorney Fee" value={costs.bankAttorneyFee} />
                  <CostRow label="Appraisal Fee" value={costs.appraisalFee} />
                  <CostRow label="Engineering Inspection" value={costs.engineeringInspection} />
                  <CostRow label="Environmental Report" value={costs.environmentalReport} />
                  <CostRow label="Survey Fee" value={costs.surveyFee} />
                  <CostRow label="Misc Fees" value={costs.miscFees} />
                </div>
                {useCema && costs.cemaSavings > 0 && (
                  <div className="px-4 py-3 border-t border-white/10 bg-emerald-500/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-emerald-400">CEMA Savings</span>
                      <span className="text-sm font-bold text-emerald-400">-{fmt(costs.cemaSavings)}</span>
                    </div>
                  </div>
                )}
              </div>

              {taxReassessment && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-white/5">Tax Reassessment Projection</p>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase">Current Tax Bill</p>
                        <p className="text-sm font-bold text-white">{fmt(taxReassessment.currentTaxBill)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase">Estimated New Bill</p>
                        <p className={`text-sm font-bold ${taxReassessment.estimatedNewTaxBill > taxReassessment.currentTaxBill ? "text-red-400" : "text-emerald-400"}`}>
                          {fmt(taxReassessment.estimatedNewTaxBill)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-500">Tax Increase</span>
                      <span className={`text-sm font-bold ${taxReassessment.taxIncreasePct > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {taxReassessment.taxIncreasePct > 0 ? "+" : ""}{fmtPct(taxReassessment.taxIncreasePct)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg animate-[fade-in_0.2s_ease-out]">
          {toast}
        </div>
      )}
    </ResearchLayout>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  if (!value || value === 0) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="text-sm font-medium text-white">{fmt(value)}</span>
    </div>
  );
}
