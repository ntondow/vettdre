"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Hammer, TrendingUp, AlertTriangle } from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import PropertySearchInput from "@/components/research/property-search-input";
import ApplyToDealButton from "@/components/research/apply-to-deal-button";
import type { PropertySelection } from "@/components/research/property-search-input";
import { fetchRenovationEstimate } from "../research-actions";
import { applyResearchToDeal } from "../research-actions";

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type Level = "light" | "moderate" | "gut";
const LEVELS: { key: Level; label: string; color: string }[] = [
  { key: "light", label: "Light", color: "emerald" },
  { key: "moderate", label: "Moderate", color: "amber" },
  { key: "gut", label: "Gut", color: "red" },
];

export default function RenovationPage() {
  const searchParams = useSearchParams();
  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedLevel, setSelectedLevel] = useState<Level>("moderate");
  const [toast, setToast] = useState("");

  const handleSelect = useCallback(async (p: PropertySelection) => {
    setProperty(p);
    setLoading(true);
    try {
      const data = await fetchRenovationEstimate({
        bbl: p.bbl,
        units: p.unitsRes,
        sqft: p.bldgArea,
        yearBuilt: p.yearBuilt,
        bldgClass: p.bldgClass,
        numFloors: p.numFloors,
      });
      setResult(data);
      if (data?.recommendedLevel) setSelectedLevel(data.recommendedLevel);
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
        researchType: "renovation",
        data: {
          address: property.address,
          borough: property.borough,
          bbl: property.bbl,
          level: selectedLevel,
          totalCost: result.totalCost?.[selectedLevel] || 0,
          costPerUnit: result.costPerUnit?.[selectedLevel] || 0,
          arv: result.arv?.[selectedLevel] || 0,
          roi: result.renovationROI?.[selectedLevel] || 0,
        },
      });
      setToast("Renovation estimate applied to deal");
      setTimeout(() => setToast(""), 3000);
    } catch { /* */ }
  };

  return (
    <ResearchLayout
      icon={Hammer}
      iconColor="text-orange-400"
      iconBg="bg-orange-600/20"
      title="Renovation Estimator"
      subtitle="3-tier renovation costs, ARV, and ROI analysis"
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
          <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className="animate-pulse bg-white/5 rounded-xl h-32" />)}</div>
        </div>
      )}

      {!loading && !property && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
            <Hammer className="w-8 h-8 text-slate-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-400 mb-2">Renovation cost estimator</h2>
          <p className="text-sm text-slate-600 text-center max-w-sm">Enter a property to see light, moderate, and gut renovation cost estimates with ARV projections.</p>
        </div>
      )}

      {!loading && property && !result && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-slate-500">Unable to estimate renovation costs for this property.</p>
        </div>
      )}

      {!loading && result && (
        <div className="space-y-4">
          {/* Condition Signals */}
          {result.conditionSignals && result.conditionSignals.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Condition Signals</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.conditionSignals.map((signal: string, idx: number) => (
                  <span key={idx} className="text-[11px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">{signal}</span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div className="bg-orange-500/5 border border-orange-500/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-1">
                  Recommended: {result.recommendedLevel?.charAt(0).toUpperCase() + result.recommendedLevel?.slice(1)} Renovation
                </p>
                <p className="text-2xl font-bold text-white">
                  {fmt(result.totalCost?.[selectedLevel] || 0)}
                  <span className="text-sm text-slate-400 font-normal ml-2">total</span>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {fmt(result.costPerUnit?.[selectedLevel] || 0)}/unit · {result.buildingCategory} · {result.confidence} confidence
                </p>
              </div>
              <ApplyToDealButton onApply={handleApply} />
            </div>
          </div>

          {/* Level Toggle */}
          <div className="flex gap-2">
            {LEVELS.map(lv => (
              <button
                key={lv.key}
                onClick={() => setSelectedLevel(lv.key)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedLevel === lv.key
                    ? `bg-${lv.color}-500/20 text-${lv.color}-400 border border-${lv.color}-500/30`
                    : "bg-white/5 text-slate-500 hover:text-slate-400 border border-white/5"
                } ${lv.key === result.recommendedLevel ? "ring-1 ring-offset-1 ring-offset-[#0B0F19] ring-white/10" : ""}`}
              >
                {lv.label}
                {lv.key === result.recommendedLevel && <span className="ml-1 text-[10px] opacity-60">(rec)</span>}
              </button>
            ))}
          </div>

          {/* 3-Level Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {LEVELS.map(lv => {
              const isSelected = selectedLevel === lv.key;
              return (
                <div
                  key={lv.key}
                  onClick={() => setSelectedLevel(lv.key)}
                  className={`bg-white/[0.03] border rounded-xl p-4 cursor-pointer transition-colors ${
                    isSelected ? "border-white/20" : "border-white/5 opacity-60 hover:opacity-80"
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{lv.label}</p>
                  <div className="space-y-2">
                    <Row label="Total Cost" value={fmt(result.totalCost?.[lv.key] || 0)} bold />
                    <Row label="Cost / Unit" value={fmt(result.costPerUnit?.[lv.key] || 0)} />
                    <Row label="Cost / SF" value={fmt(result.costPerSqft?.[lv.key] || 0)} />
                    <Row label="ARV" value={fmt(result.arv?.[lv.key] || 0)} />
                    <Row label="ROI" value={fmtPct(result.renovationROI?.[lv.key] || 0)} highlight={(result.renovationROI?.[lv.key] || 0) > 20} />
                    <Row label="Profit Margin" value={fmtPct(result.profitMargin?.[lv.key] || 0)} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Common Area Costs */}
          {result.commonAreaCosts && result.commonAreaCosts.length > 0 && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-white/5">Common Area Costs</p>
              <div className="divide-y divide-white/5">
                {result.commonAreaCosts.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-medium text-slate-400">{item.item}</span>
                    <span className="text-sm font-medium text-white">{fmt(item.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Methodology */}
          {result.methodology && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Methodology</p>
              <p className="text-xs text-slate-500">{result.methodology}</p>
            </div>
          )}
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

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-white" : highlight ? "font-medium text-emerald-400" : "font-medium text-slate-300"}`}>{value}</span>
    </div>
  );
}
