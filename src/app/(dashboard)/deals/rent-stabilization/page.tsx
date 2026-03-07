"use client";

import { useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, TrendingUp, Info } from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import PropertySearchInput from "@/components/research/property-search-input";
import ApplyToDealButton from "@/components/research/apply-to-deal-button";
import type { PropertySelection } from "@/components/research/property-search-input";
import { fetchRentProjection } from "../benchmark-actions";
import { applyResearchToDeal } from "../research-actions";

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const AVG_RENTS: Record<string, number> = {
  Manhattan: 3500, Brooklyn: 2700, Queens: 2200, Bronx: 1700, "Staten Island": 1600,
};

export default function RentStabilizationPage() {
  const searchParams = useSearchParams();
  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [holdPeriod, setHoldPeriod] = useState(5);
  const [rentGrowth, setRentGrowth] = useState(3);
  const [toast, setToast] = useState("");

  const handleSelect = useCallback(async (p: PropertySelection) => {
    setProperty(p);
    await runProjection(p, holdPeriod, rentGrowth);
  }, [holdPeriod, rentGrowth]);

  const runProjection = async (p: PropertySelection, hold: number, growth: number) => {
    setLoading(true);
    try {
      const avgRent = AVG_RENTS[p.borough] || 2500;
      const data = await fetchRentProjection({
        bbl: p.bbl,
        totalUnits: p.unitsRes || 10,
        holdPeriodYears: hold,
        marketRentGrowthPct: growth,
        avgMarketRent: avgRent,
      });
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (dealId: string) => {
    if (!result || !property) return;
    try {
      await applyResearchToDeal({
        dealId,
        researchType: "rent_stabilization",
        data: {
          address: property.address,
          borough: property.borough,
          bbl: property.bbl,
          blendedGrowth: result.blendedAnnualGrowthPct,
          stabilizedPct: result.stabilizedPct,
          rgbRate: result.rgbBlendedRate,
          mciUpside: result.mciUpside,
          iaiUpside: result.iaiUpside,
        },
      });
      setToast("Rent projection applied to deal");
      setTimeout(() => setToast(""), 3000);
    } catch { /* */ }
  };

  const projections: any[] = result?.yearlyProjections || [];

  return (
    <ResearchLayout
      icon={Building2}
      iconColor="text-cyan-400"
      iconBg="bg-cyan-600/20"
      title="Rent Stabilization"
      subtitle="Rent growth projections, RGB rates, MCI & IAI upside"
    >
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left */}
        <div className="w-full lg:w-[400px] flex-shrink-0 space-y-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Property Lookup</label>
            <PropertySearchInput
              onSelect={handleSelect}
              initialBbl={searchParams.get("bbl")}
              selected={property}
              onClear={() => { setProperty(null); setResult(null); }}
              loading={loading}
            />
          </div>

          {property && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Projection Parameters</label>
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-slate-500 flex-shrink-0">Hold Period</label>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { const v = Math.max(1, holdPeriod - 1); setHoldPeriod(v); if (property) runProjection(property, v, rentGrowth); }} className="w-7 h-7 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-sm">-</button>
                  <span className="w-12 text-center text-sm text-white font-medium">{holdPeriod}yr</span>
                  <button onClick={() => { const v = Math.min(15, holdPeriod + 1); setHoldPeriod(v); if (property) runProjection(property, v, rentGrowth); }} className="w-7 h-7 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-sm">+</button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-slate-500 flex-shrink-0">Market Rent Growth</label>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { const v = Math.max(0, rentGrowth - 0.5); setRentGrowth(v); if (property) runProjection(property, holdPeriod, v); }} className="w-7 h-7 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-sm">-</button>
                  <span className="w-12 text-center text-sm text-white font-medium">{rentGrowth}%</span>
                  <button onClick={() => { const v = Math.min(10, rentGrowth + 0.5); setRentGrowth(v); if (property) runProjection(property, holdPeriod, v); }} className="w-7 h-7 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-sm">+</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex-1 min-w-0 space-y-4">
          {!property && (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-slate-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-400 mb-2">Rent stabilization analysis</h2>
              <p className="text-sm text-slate-600 text-center max-w-sm">Enter a property to see rent-stabilized unit counts, RGB growth rates, and MCI/IAI upside.</p>
            </div>
          )}

          {loading && <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="animate-pulse bg-white/5 rounded-xl h-20" />)}</div>}

          {!loading && property && !result && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-6 py-12 text-center">
              <p className="text-sm text-slate-500">No rent stabilization data found for this property.</p>
              <p className="text-xs text-slate-600 mt-1">This building may not have rent-stabilized units.</p>
            </div>
          )}

          {!loading && result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-1">Rent Growth Projection</p>
                    <div className="flex items-baseline gap-4">
                      <p className="text-2xl font-bold text-white">{fmtPct(result.blendedAnnualGrowthPct)}<span className="text-sm text-slate-400 font-normal">/yr blended</span></p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {fmtPct(result.stabilizedPct * 100)} stabilized · RGB blended: {fmtPct(result.rgbBlendedRate)}
                    </p>
                  </div>
                  <ApplyToDealButton onApply={handleApply} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <MiniCard label="Stabilized %" value={fmtPct(result.stabilizedPct * 100)} />
                  <MiniCard label="RGB Rate" value={fmtPct(result.rgbBlendedRate)} />
                  <MiniCard label="MCI Upside" value={result.mciUpside ? fmt(result.mciUpside.annualTotal) + "/yr" : "N/A"} />
                  <MiniCard label="IAI Upside" value={result.iaiUpside ? fmt(result.iaiUpside.annualTotal) + "/yr" : "N/A"} />
                </div>
              </div>

              {/* Year-by-Year Projection */}
              {projections.length > 0 && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-white/5">Year-by-Year Projection</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase">Year</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase">Market Rent</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase">Stabilized Rent</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase hidden md:table-cell">Blended Rent</th>
                          <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase hidden md:table-cell">Growth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projections.map((yr: any, idx: number) => (
                          <tr key={idx} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 text-white font-medium">Year {yr.year}</td>
                            <td className="px-4 py-2.5 text-right text-slate-300">{fmt(yr.marketRent || yr.avgMarketRent || 0)}</td>
                            <td className="px-4 py-2.5 text-right text-slate-300">{fmt(yr.stabilizedRent || yr.avgStabilizedRent || 0)}</td>
                            <td className="px-4 py-2.5 text-right text-white hidden md:table-cell">{fmt(yr.blendedRent || yr.blendedAvgRent || 0)}</td>
                            <td className="px-4 py-2.5 text-right hidden md:table-cell">
                              <span className={yr.growthPct > 0 ? "text-emerald-400" : "text-slate-500"}>
                                {yr.growthPct !== undefined ? fmtPct(yr.growthPct) : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {result.notes && result.notes.length > 0 && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-3.5 h-3.5 text-slate-500" />
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Notes</p>
                  </div>
                  <ul className="space-y-1">
                    {result.notes.map((note: string, idx: number) => (
                      <li key={idx} className="text-xs text-slate-500">• {note}</li>
                    ))}
                  </ul>
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

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-white mt-0.5">{value}</p>
    </div>
  );
}
