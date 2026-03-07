"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Scale, Info } from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import PropertySearchInput from "@/components/research/property-search-input";
import ApplyToDealButton from "@/components/research/apply-to-deal-button";
import type { PropertySelection } from "@/components/research/property-search-input";
import { fetchExpenseBenchmark } from "../benchmark-actions";
import { applyResearchToDeal } from "../research-actions";

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function BenchmarksPage() {
  const searchParams = useSearchParams();
  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [toast, setToast] = useState("");

  const handleSelect = useCallback(async (p: PropertySelection) => {
    setProperty(p);
    setLoading(true);
    try {
      const data = await fetchExpenseBenchmark({
        bbl: p.bbl,
        yearBuilt: p.yearBuilt,
        numFloors: p.numFloors,
        bldgClass: p.bldgClass,
        bldgArea: p.bldgArea,
        unitsRes: p.unitsRes,
        borough: p.borough,
      });
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApply = async (dealId: string) => {
    if (!result || !property) return;
    try {
      await applyResearchToDeal({
        dealId,
        researchType: "benchmarks",
        data: {
          address: property.address,
          borough: property.borough,
          bbl: property.bbl,
          totalAnnual: result.totalAnnual,
          totalPerUnit: result.totalPerUnit,
          category: result.category,
        },
      });
      setToast("Benchmarks applied to deal");
      setTimeout(() => setToast(""), 3000);
    } catch { /* */ }
  };

  const lineItems: any[] = result?.lineItems || [];

  return (
    <ResearchLayout
      icon={Scale}
      iconColor="text-violet-400"
      iconBg="bg-violet-600/20"
      title="Expense Benchmarks"
      subtitle="RGB-sourced expense benchmarks by building type"
    >
      {/* Search */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-5">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Property Lookup</label>
        <PropertySearchInput
          onSelect={handleSelect}
          initialBbl={searchParams.get("bbl")}
          selected={property}
          onClear={() => { setProperty(null); setResult(null); }}
          loading={loading}
        />
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="animate-pulse bg-white/5 rounded-xl h-40" />
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="animate-pulse bg-white/5 rounded-xl h-12" />)}
        </div>
      )}

      {!loading && !property && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
            <Scale className="w-8 h-8 text-slate-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-400 mb-2">Expense benchmarking</h2>
          <p className="text-sm text-slate-600 text-center max-w-sm">
            Enter a property to see RGB-sourced operating expense benchmarks for its building category.
          </p>
        </div>
      )}

      {!loading && property && result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-1">
                  {result.categoryLabel}
                </p>
                <div className="flex items-baseline gap-4">
                  <p className="text-2xl font-bold text-white">{fmt(result.totalAnnual)}<span className="text-sm text-slate-400 font-normal">/yr</span></p>
                  <p className="text-lg font-bold text-slate-300">{fmt(result.totalPerUnit)}<span className="text-sm text-slate-500 font-normal">/unit</span></p>
                </div>
              </div>
              <ApplyToDealButton onApply={handleApply} />
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expense</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">$/Unit</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Annual</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">% Total</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell w-36">Range</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li: any, idx: number) => (
                    <tr key={idx} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-white font-medium">{li.label}</td>
                      <td className="px-4 py-2.5 text-right text-slate-300">{fmt(li.perUnit)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-medium">{fmt(li.annual)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 hidden md:table-cell">{((li.pctOfTotal || 0) * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        {li.range && <RangeBar value={li.perUnit} low={li.range.low} high={li.range.high} />}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-white/10 bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-bold">Total</td>
                    <td className="px-4 py-3 text-right text-white font-bold">{fmt(result.totalPerUnit)}</td>
                    <td className="px-4 py-3 text-right text-white font-bold">{fmt(result.totalAnnual)}</td>
                    <td className="px-4 py-3 text-right text-slate-400 hidden md:table-cell">100%</td>
                    <td className="hidden lg:table-cell" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Adjustment Notes */}
          {result.adjustmentNotes && result.adjustmentNotes.length > 0 && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Adjustments</p>
              </div>
              <ul className="space-y-1">
                {result.adjustmentNotes.map((note: string, idx: number) => (
                  <li key={idx} className="text-xs text-slate-500">• {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!loading && property && !result && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-slate-500">No benchmark data available for this property.</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg animate-[fade-in_0.2s_ease-out]">
          {toast}
        </div>
      )}
    </ResearchLayout>
  );
}

function RangeBar({ value, low, high }: { value: number; low: number; high: number }) {
  const maxRange = high * 1.3 || 1;
  const lowPct = (low / maxRange) * 100;
  const highPct = (high / maxRange) * 100;
  const valuePct = Math.min((value / maxRange) * 100, 100);
  const inRange = value >= low && value <= high;
  const dotColor = inRange ? "bg-emerald-500" : value < low ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="relative h-3 w-full">
      <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-white/5 rounded-full w-full" />
      <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-violet-500/20 rounded-full" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
      <div className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${dotColor} border border-black/30`} style={{ left: `calc(${valuePct}% - 5px)` }} />
    </div>
  );
}
