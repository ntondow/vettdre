"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, MapPin } from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import PropertySearchInput from "@/components/research/property-search-input";
import ApplyToDealButton from "@/components/research/apply-to-deal-button";
import type { PropertySelection } from "@/components/research/property-search-input";
import { fetchCompsWithValuation } from "@/app/(dashboard)/market-intel/comps-actions";
import { applyResearchToDeal } from "../research-actions";

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function CompsPage() {
  const searchParams = useSearchParams();
  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [comps, setComps] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [toast, setToast] = useState("");

  const handleSelect = useCallback(async (p: PropertySelection) => {
    setProperty(p);
    setLoading(true);
    try {
      const result = await fetchCompsWithValuation(p.bbl);
      setComps(result.comps || []);
      setValuation(result.valuation || null);
    } catch {
      setComps([]);
      setValuation(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleApply = async (dealId: string) => {
    if (!valuation || !property) return;
    try {
      await applyResearchToDeal({
        dealId,
        researchType: "comps",
        data: {
          address: property.address,
          borough: property.borough,
          bbl: property.bbl,
          estimatedValue: valuation.estimatedValue,
          pricePerUnit: valuation.pricePerUnit,
          compCount: valuation.compCount,
          confidence: valuation.confidence,
        },
      });
      setToast("Applied to deal");
      setTimeout(() => setToast(""), 3000);
    } catch { /* */ }
  };

  return (
    <ResearchLayout
      icon={BarChart3}
      iconColor="text-blue-400"
      iconBg="bg-blue-600/20"
      title="Comparable Sales"
      subtitle="Find recent comparable sales in the neighborhood"
    >
      {/* Search */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-5">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
          Property Lookup
        </label>
        <PropertySearchInput
          onSelect={handleSelect}
          initialBbl={searchParams.get("bbl")}
          selected={property}
          onClear={() => { setProperty(null); setComps([]); setValuation(null); }}
          loading={loading}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse bg-white/5 rounded-xl h-20" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && !property && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
            <BarChart3 className="w-8 h-8 text-slate-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-400 mb-2">Search for a property</h2>
          <p className="text-sm text-slate-600 text-center max-w-sm">
            Enter an address or BBL to find recent comparable sales within a half-mile radius.
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && property && (
        <div className="space-y-4">
          {/* Valuation Summary */}
          {valuation && valuation.estimatedValue > 0 && (
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div>
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Comp-Based Valuation</p>
                  <p className="text-2xl font-bold text-white">{fmt(valuation.estimatedValue)}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Range: {fmt(valuation.lowRange)} – {fmt(valuation.highRange)} · {valuation.compCount} comps · {valuation.confidence} confidence
                  </p>
                </div>
                <ApplyToDealButton onApply={handleApply} disabled={!valuation} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <MiniCard label="Price / Unit" value={fmt(valuation.pricePerUnit)} />
                <MiniCard label="Price / SF" value={fmt(valuation.pricePerSqft)} />
                <MiniCard label="Comp Count" value={String(valuation.compCount)} />
                <MiniCard label="Confidence" value={valuation.confidence} />
              </div>
            </div>
          )}

          {/* Comps Table */}
          {comps.length > 0 ? (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Address</th>
                      <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Price</th>
                      <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">$/Unit</th>
                      <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">$/SF</th>
                      <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Units</th>
                      <th className="text-right px-4 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((c: any, idx: number) => (
                      <tr key={idx} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                            <div>
                              <p className="text-white font-medium truncate max-w-[200px]">{c.address}</p>
                              <p className="text-[10px] text-slate-500">
                                {c.saleDate ? new Date(c.saleDate).toLocaleDateString() : "—"} · {(c.distance || 0).toFixed(2)}mi
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-white font-medium">{fmt(c.salePrice || 0)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 hidden md:table-cell">{fmt(c.pricePerUnit || 0)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 hidden md:table-cell">{c.pricePerSqft > 0 ? fmt(c.pricePerSqft) : "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-400 hidden lg:table-cell">{c.units || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <MatchBadge score={c.similarityScore || 0} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !loading && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-slate-500">No comparable sales found within 0.5 miles.</p>
              <p className="text-xs text-slate-600 mt-1">Try a property with more recent neighborhood sales activity.</p>
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

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}

function MatchBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "text-emerald-400 bg-emerald-500/10" : pct >= 50 ? "text-amber-400 bg-amber-500/10" : "text-slate-400 bg-white/5";
  return <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>{pct}%</span>;
}
