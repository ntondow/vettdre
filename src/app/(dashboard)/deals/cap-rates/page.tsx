"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import PropertySearchInput from "@/components/research/property-search-input";
import ApplyToDealButton from "@/components/research/apply-to-deal-button";
import type { PropertySelection } from "@/components/research/property-search-input";
import { fetchMarketCapRate } from "../caprate-actions";
import { applyResearchToDeal } from "../research-actions";

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

export default function CapRatesPage() {
  const searchParams = useSearchParams();
  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [toast, setToast] = useState("");

  const handleSelect = useCallback(async (p: PropertySelection) => {
    setProperty(p);
    setLoading(true);
    try {
      const data = await fetchMarketCapRate(p.bbl);
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
        researchType: "cap_rate",
        data: {
          address: property.address,
          borough: property.borough,
          bbl: property.bbl,
          marketCapRate: result.marketCapRate,
          suggestedExitCap: result.suggestedExitCap,
          range: result.range,
          compCount: result.compCount,
          confidence: result.confidence,
        },
      });
      setToast("Cap rate applied to deal");
      setTimeout(() => setToast(""), 3000);
    } catch { /* */ }
  };

  const trend = result?.trend;
  const TrendIcon = trend === "compressing" ? ArrowDownRight : trend === "expanding" ? ArrowUpRight : Minus;
  const trendColor = trend === "compressing" ? "text-emerald-400" : trend === "expanding" ? "text-red-400" : "text-slate-400";

  return (
    <ResearchLayout
      icon={TrendingUp}
      iconColor="text-emerald-400"
      iconBg="bg-emerald-600/20"
      title="Cap Rate Analysis"
      subtitle="Market cap rates derived from comparable sales"
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
          <div className="animate-pulse bg-white/5 rounded-xl h-32" />
        </div>
      )}

      {!loading && !property && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-slate-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-400 mb-2">Analyze market cap rates</h2>
          <p className="text-sm text-slate-600 text-center max-w-sm">
            Enter a property to derive market cap rates from recent comparable sales.
          </p>
        </div>
      )}

      {!loading && property && result && (
        <div className="space-y-4">
          {/* Main Result */}
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Market Cap Rate</p>
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-bold text-white">{fmtPct(result.marketCapRate)}</p>
                  {result.trendBpsPerYear !== undefined && (
                    <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
                      <TrendIcon className="w-4 h-4" />
                      <span>{Math.abs(result.trendBpsPerYear)}bps/yr</span>
                      <span className="text-xs text-slate-500 font-normal ml-1">({trend})</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Range: {fmtPct(result.range?.low || 0)} – {fmtPct(result.range?.high || 0)} · {result.compCount} comps · {result.confidence} confidence
                </p>
              </div>
              <ApplyToDealButton onApply={handleApply} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <MiniCard label="Median Cap" value={fmtPct(result.median || 0)} />
              <MiniCard label="Suggested Exit" value={fmtPct(result.suggestedExitCap || 0)} />
              <MiniCard label="Comp Count" value={String(result.compCount || 0)} />
              <MiniCard label="Confidence" value={result.confidence || "—"} />
            </div>
          </div>

          {/* Cap Rate Range Bar */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Cap Rate Distribution</p>
            <div className="relative h-8 bg-white/5 rounded-full overflow-hidden">
              {result.range && result.range.high > result.range.low && (
                <div
                  className="absolute top-0 bottom-0 bg-emerald-500/20 rounded-full"
                  style={{
                    left: `${(result.range.low / 12) * 100}%`,
                    width: `${((result.range.high - result.range.low) / 12) * 100}%`,
                  }}
                />
              )}
              <div
                className="absolute top-0 bottom-0 w-1 bg-emerald-500 rounded-full"
                style={{ left: `${(result.marketCapRate / 12) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-600 mt-1.5">
              <span>0%</span><span>3%</span><span>6%</span><span>9%</span><span>12%</span>
            </div>
          </div>

          {/* Comp Cap Rates Table */}
          {result.compCapRates && result.compCapRates.length > 0 && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-white/5">
                Comparable Cap Rates
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase">Address</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase">Cap Rate</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase hidden md:table-cell">Units</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase hidden md:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.compCapRates.map((c: any, idx: number) => (
                      <tr key={idx} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-white font-medium truncate max-w-[220px]">{c.address}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-bold ${c.capRate >= 6 ? "text-emerald-400" : c.capRate >= 4 ? "text-amber-400" : "text-red-400"}`}>
                            {fmtPct(c.capRate)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-400 hidden md:table-cell">{c.units}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500 hidden md:table-cell">
                          {c.saleDate ? new Date(c.saleDate).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.methodology && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Methodology</p>
              <p className="text-xs text-slate-500">{result.methodology}</p>
            </div>
          )}
        </div>
      )}

      {!loading && property && !result && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-6 py-12 text-center">
          <p className="text-sm text-slate-500">No cap rate data available for this property.</p>
          <p className="text-xs text-slate-600 mt-1">Requires at least 2 units and valid coordinates.</p>
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

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}
