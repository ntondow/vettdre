"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getNJPropertyByParcel, searchNJComps } from "./nj-actions";
import type { NJPropertyResult } from "./nj-actions";

interface Props {
  municipality: string;
  block: string;
  lot: string;
  county: string;
  address?: string;
  onClose: () => void;
}

const fmtPrice = (n: number) => n > 0 ? "$" + n.toLocaleString() : "—";
const fmtDate = (d: string) => {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)); } catch { return d; }
};

function Section({ id, title, icon, badge, className, collapsed, onToggle, children }: {
  id: string; title: string; icon?: string; badge?: React.ReactNode;
  className?: string; collapsed: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={className || "bg-white rounded-xl border border-slate-200"}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-5 text-left cursor-pointer">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {badge}
        </div>
        <span className={"text-slate-400 text-xs transition-transform duration-200 " + (collapsed ? "" : "rotate-90")}>▶</span>
      </button>
      <div className={"grid transition-[grid-template-rows] duration-200 ease-out " + (collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function NJBuildingProfile({ municipality, block, lot, county, address, onClose }: Props) {
  const router = useRouter();
  const [data, setData] = useState<NJPropertyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [underwriting, setUnderwriting] = useState(false);
  const [comps, setComps] = useState<NJPropertyResult[]>([]);
  const [compsStats, setCompsStats] = useState<{ avgPricePerUnit: number; medianPricePerUnit: number } | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsLoaded, setCompsLoaded] = useState(false);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    comps: true,
    njOnly: true,
  });
  const toggle = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const prop = await getNJPropertyByParcel(municipality, block, lot);
        setData(prop);
      } catch (err) {
        console.error("NJ profile load error:", err);
      }
      setLoading(false);
    }
    load();
  }, [municipality, block, lot]);

  const loadComps = async () => {
    if (compsLoaded || compsLoading || !data) return;
    setCompsLoading(true);
    try {
      const results = await searchNJComps({
        county,
        municipality: data.municipality,
        limit: 20,
      });
      setComps(results);
      const withSale = results.filter(c => c.lastSalePrice > 0 && c.units > 0);
      if (withSale.length > 0) {
        const ppus = withSale.map(c => c.lastSalePrice / c.units).sort((a, b) => a - b);
        const avg = Math.round(ppus.reduce((a, b) => a + b, 0) / ppus.length);
        const mid = Math.floor(ppus.length / 2);
        const median = ppus.length % 2 ? ppus[mid] : Math.round((ppus[mid - 1] + ppus[mid]) / 2);
        setCompsStats({ avgPricePerUnit: avg, medianPricePerUnit: median });
      }
      setCompsLoaded(true);
    } catch {}
    setCompsLoading(false);
  };

  const handleModelDeal = async () => {
    if (!data) return;
    setUnderwriting(true);
    try {
      const prefill = {
        address: data.address,
        municipality: data.municipality,
        county: data.county,
        block: data.block,
        lot: data.lot,
        ownerName: data.ownerName,
        units: data.units,
        yearBuilt: data.yearBuilt,
        assessedTotal: data.assessedTotal,
        lastSalePrice: data.lastSalePrice,
        lastSaleDate: data.lastSaleDate,
        bldgSqft: data.bldgSqft,
        numStories: data.numStories,
      };
      sessionStorage.setItem("vettdre-nj-prefill", JSON.stringify(prefill));
      router.push("/deals/new?source=nj");
    } catch {}
    setUnderwriting(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex justify-end animate-[fade-in_200ms]">
        <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl">
          <div className="p-8 flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex justify-end animate-[fade-in_200ms]">
        <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl p-8">
          <button onClick={onClose} className="mb-4 text-slate-400 hover:text-slate-600">Close</button>
          <p className="text-slate-500">Property not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end animate-[fade-in_200ms]" onClick={onClose}>
      <div className="w-full max-w-2xl bg-slate-50 h-full overflow-y-auto shadow-2xl animate-[slide-up_300ms]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-green-700 to-green-900 px-6 py-6 text-white">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white text-xl font-bold">x</button>
          <p className="text-green-200 text-xs font-semibold uppercase tracking-wider mb-1">New Jersey Property</p>
          <h2 className="text-xl font-bold">{data.address || `Block ${data.block}, Lot ${data.lot}`}</h2>
          <p className="text-green-200 text-sm mt-1">{data.municipality}, {data.county} County, NJ</p>
          <div className="flex gap-4 mt-4">
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <span className="text-xs text-green-200">Units</span>
              <p className="text-lg font-bold">{data.units || "—"}</p>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <span className="text-xs text-green-200">Year Built</span>
              <p className="text-lg font-bold">{data.yearBuilt || "—"}</p>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <span className="text-xs text-green-200">Stories</span>
              <p className="text-lg font-bold">{data.numStories || "—"}</p>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <span className="text-xs text-green-200">Assessed</span>
              <p className="text-lg font-bold">{fmtPrice(data.assessedTotal)}</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={handleModelDeal} disabled={underwriting}
              className="flex-1 bg-green-700 hover:bg-green-800 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
              {underwriting ? "Loading..." : "Model This Deal"}
            </button>
          </div>

          {/* Owner Info */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="text-lg">👤</span> Owner Information
            </h3>
            <p className="text-sm text-amber-600 italic mb-2">Owner name redacted (NJ privacy law)</p>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-xs text-slate-500">Owner on Record</span><p className="text-sm font-medium text-slate-900">{data.ownerName || "Redacted"}</p></div>
              <div><span className="text-xs text-slate-500">Property Class</span><p className="text-sm font-medium text-slate-900">{data.propertyClassDesc || data.propertyClass}</p></div>
            </div>
          </div>

          {/* Property Details */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="text-lg">🏠</span> Property Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-xs text-slate-500">Municipality</span><p className="text-sm font-medium">{data.municipality}</p></div>
              <div><span className="text-xs text-slate-500">County</span><p className="text-sm font-medium">{data.county}</p></div>
              <div><span className="text-xs text-slate-500">Block / Lot</span><p className="text-sm font-medium">{data.block} / {data.lot}</p></div>
              <div><span className="text-xs text-slate-500">Units</span><p className="text-sm font-medium">{data.units}</p></div>
              <div><span className="text-xs text-slate-500">Year Built</span><p className="text-sm font-medium">{data.yearBuilt || "—"}</p></div>
              <div><span className="text-xs text-slate-500">Building Sqft</span><p className="text-sm font-medium">{data.bldgSqft > 0 ? data.bldgSqft.toLocaleString() : "—"}</p></div>
              <div><span className="text-xs text-slate-500">Lot Sqft</span><p className="text-sm font-medium">{data.lotSqft > 0 ? data.lotSqft.toLocaleString() : "—"}</p></div>
              <div><span className="text-xs text-slate-500">Stories</span><p className="text-sm font-medium">{data.numStories || "—"}</p></div>
            </div>
          </div>

          {/* Valuation & Sales */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="text-lg">💰</span> Valuation & Sales
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-xs text-slate-500">Assessed Land</span><p className="text-sm font-medium">{fmtPrice(data.assessedLand)}</p></div>
              <div><span className="text-xs text-slate-500">Assessed Improvements</span><p className="text-sm font-medium">{fmtPrice(data.assessedImprove)}</p></div>
              <div><span className="text-xs text-slate-500">Total Assessed</span><p className="text-sm font-semibold text-blue-700">{fmtPrice(data.assessedTotal)}</p></div>
              <div><span className="text-xs text-slate-500">Last Sale Price</span><p className="text-sm font-semibold text-green-700">{fmtPrice(data.lastSalePrice)}</p></div>
              <div><span className="text-xs text-slate-500">Last Sale Date</span><p className="text-sm font-medium">{fmtDate(data.lastSaleDate)}</p></div>
              {data.units > 0 && data.lastSalePrice > 0 && (
                <div><span className="text-xs text-slate-500">Price / Unit</span><p className="text-sm font-medium">{fmtPrice(Math.round(data.lastSalePrice / data.units))}</p></div>
              )}
            </div>
          </div>

          {/* Comps */}
          <Section id="comps" title="Comparable Sales" icon="📊" collapsed={collapsed.comps} onToggle={() => { toggle("comps"); loadComps(); }}>
            {compsLoading && <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-6 w-6 border-4 border-blue-600 border-t-transparent" /></div>}
            {compsLoaded && comps.length === 0 && <p className="text-sm text-slate-500">No comparable sales found in {data.municipality}.</p>}
            {compsStats && (
              <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-blue-50 rounded-lg">
                <div><span className="text-xs text-blue-600">Avg Price / Unit</span><p className="text-sm font-bold text-blue-800">{fmtPrice(compsStats.avgPricePerUnit)}</p></div>
                <div><span className="text-xs text-blue-600">Median Price / Unit</span><p className="text-sm font-bold text-blue-800">{fmtPrice(compsStats.medianPricePerUnit)}</p></div>
              </div>
            )}
            {comps.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {comps.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded text-xs">
                    <div>
                      <p className="font-medium text-slate-900">{c.address || `${c.municipality} Blk ${c.block} Lot ${c.lot}`}</p>
                      <p className="text-slate-500">{c.units} units | {fmtDate(c.lastSaleDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{fmtPrice(c.lastSalePrice)}</p>
                      {c.units > 0 && c.lastSalePrice > 0 && <p className="text-slate-500">{fmtPrice(Math.round(c.lastSalePrice / c.units))}/unit</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* NJ Limitations */}
          <Section id="njOnly" title="NYC-Only Data (Not Available in NJ)" icon="🔒" collapsed={collapsed.njOnly} onToggle={() => toggle("njOnly")}>
            <div className="space-y-2 text-sm text-slate-400">
              <p>HPD Violations — not available in NJ</p>
              <p>HPD Complaints — not available in NJ</p>
              <p>DOB Permits — not available in NJ</p>
              <p>Rent Stabilization — does not apply in NJ</p>
              <p>LL84 Energy Benchmarking — NYC only</p>
              <p>Speculation Watch List — NYC only</p>
            </div>
          </Section>

          <p className="text-xs text-slate-400 text-center pt-2 pb-8">
            Data: NJ MOD-IV Tax Records via ArcGIS
          </p>
        </div>
      </div>
    </div>
  );
}
