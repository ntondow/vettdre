"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getNYSPropertyByParcel, getNYSTaxRate, fetchNYSDealPrefill, searchNYSComps } from "./nys-actions";
import type { NYSPropertyResult } from "./nys-actions";

interface Props {
  swisCode: string;
  printKey: string;
  county: string;
  address?: string;
  municipality?: string;
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

export default function NYSBuildingProfile({ swisCode, printKey, county, address, municipality, onClose }: Props) {
  const router = useRouter();
  const [data, setData] = useState<NYSPropertyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState<{ taxRate: number; rollYear: string } | null>(null);
  const [underwriting, setUnderwriting] = useState(false);
  const [comps, setComps] = useState<NYSPropertyResult[]>([]);
  const [compsStats, setCompsStats] = useState<{ avgPricePerUnit: number; medianPricePerUnit: number } | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsLoaded, setCompsLoaded] = useState(false);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    comps: true,
    nycOnly: true,
  });
  const toggle = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Load property data
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [prop, tax] = await Promise.all([
          getNYSPropertyByParcel(swisCode, printKey),
          getNYSTaxRate(swisCode),
        ]);
        setData(prop);
        if (tax) setTaxRate({ taxRate: tax.taxRate, rollYear: tax.rollYear });
      } catch (err) {
        console.error("NYS profile load error:", err);
      }
      setLoading(false);
    }
    load();
  }, [swisCode, printKey]);

  // Auto-load comps
  useEffect(() => {
    if (!data || compsLoaded || !county) return;
    if (data.totalUnits >= 2) {
      loadComps();
    }
  }, [data]);

  const loadComps = async () => {
    setCompsLoading(true);
    try {
      const result = await searchNYSComps({ county, minPrice: 500000, yearsBack: 5, limit: 25 });
      setComps(result.comps);
      setCompsStats({ avgPricePerUnit: result.avgPricePerUnit, medianPricePerUnit: result.medianPricePerUnit });
      setCompsLoaded(true);
    } catch (err) {
      console.error("NYS comps error:", err);
    }
    setCompsLoading(false);
  };

  const handleUnderwrite = async () => {
    if (!data) return;
    setUnderwriting(true);
    try {
      // Pre-fill deal modeler with NYS data
      const prefill = await fetchNYSDealPrefill(swisCode, printKey, county);
      if (prefill) {
        // Store prefill data in sessionStorage for the deal modeler to pick up
        sessionStorage.setItem("vettdre-nys-prefill", JSON.stringify(prefill));
        router.push("/deals/new?source=nys");
      }
    } catch (err) {
      console.error("Underwrite error:", err);
    }
    setUnderwriting(false);
  };

  // Calculate estimated annual taxes
  const estimatedTaxes = data && taxRate && taxRate.taxRate > 0 && data.totalAssessedValue > 0
    ? Math.round((data.totalAssessedValue / 1000) * taxRate.taxRate)
    : data && data.fullMarketValue > 0 ? Math.round(data.fullMarketValue * 0.025) : 0;

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3"></div>
        <p className="text-sm text-slate-500">Loading NYS property data...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-500">Property not found in NYS assessment rolls.</p>
        <button onClick={onClose} className="mt-3 text-sm text-blue-600 hover:underline">Close</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-5 text-white">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded">NYS</span>
          <span className="text-[10px] font-medium text-blue-200">{data.propertyClassDesc}</span>
        </div>
        <h2 className="text-lg font-bold">{data.address || address || printKey}</h2>
        <p className="text-sm text-blue-200">{data.municipality || municipality}, {data.county || county} County</p>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          {data.totalUnits > 0 && <span><strong>{data.totalUnits}</strong> units</span>}
          {data.stories > 0 && <span><strong>{data.stories}</strong> stories</span>}
          {data.yearBuilt > 0 && <span>Built <strong>{data.yearBuilt}</strong></span>}
          {data.totalLivingArea > 0 && <span><strong>{data.totalLivingArea.toLocaleString()}</strong> sqft</span>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button onClick={handleUnderwrite} disabled={underwriting}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
          {underwriting ? "Preparing..." : "Model This Deal"}
        </button>
      </div>

      {/* Owner Information */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <span className="text-lg">👤</span> Owner Information
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Owner</span>
            <span className="font-semibold text-slate-900 text-right max-w-[250px]">{data.ownerName || "—"}</span>
          </div>
          {data.mailingAddress && (
            <div className="flex justify-between">
              <span className="text-slate-400">Mailing Address</span>
              <span className="font-medium text-slate-700 text-right max-w-[250px]">{data.mailingAddress}</span>
            </div>
          )}
        </div>
      </div>

      {/* Property Details */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <span className="text-lg">🏢</span> Property Details
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Municipality</span><span className="font-medium">{data.municipality}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">County</span><span className="font-medium">{data.county}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Property Class</span><span className="font-medium">{data.propertyClass} — {data.propertyClassDesc}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">SWIS Code</span><span className="font-medium">{data.swisCode}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Print Key</span><span className="font-medium">{data.printKey}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Year Built</span><span className="font-medium">{data.yearBuilt || "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Units</span><span className="font-medium">{data.totalUnits || "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Stories</span><span className="font-medium">{data.stories || "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Living Area</span><span className="font-medium">{data.totalLivingArea > 0 ? data.totalLivingArea.toLocaleString() + " sqft" : "—"}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Roll Year</span><span className="font-medium">{data.rollYear || "—"}</span></div>
        </div>
      </div>

      {/* Valuation & Tax */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <span className="text-lg">💰</span> Valuation & Tax
        </h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-blue-500 uppercase font-medium">Full Market Value</p>
            <p className="text-lg font-bold text-blue-900">{fmtPrice(data.fullMarketValue)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-medium">Assessed Value</p>
            <p className="text-lg font-bold text-slate-900">{fmtPrice(data.totalAssessedValue)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-medium">Land Value</p>
            <p className="text-lg font-bold text-slate-900">{fmtPrice(data.landValue)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3 text-center">
            <p className="text-[10px] text-emerald-600 uppercase font-medium">Est. Annual Tax</p>
            <p className="text-lg font-bold text-emerald-900">{fmtPrice(estimatedTaxes)}</p>
            {taxRate && taxRate.taxRate > 0 && (
              <p className="text-[10px] text-emerald-500 mt-0.5">${taxRate.taxRate.toFixed(2)}/1K assessed</p>
            )}
          </div>
        </div>

        {/* Sale History */}
        {data.salePrice > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <h4 className="text-xs font-semibold text-slate-700 mb-2">Last Sale</h4>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Sale Price</span>
              <span className="font-bold text-slate-900">{fmtPrice(data.salePrice)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-slate-400">Sale Date</span>
              <span className="font-medium text-slate-700">{fmtDate(data.saleDate)}</span>
            </div>
            {data.totalUnits > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-slate-400">Price Per Unit</span>
                <span className="font-medium text-slate-700">{fmtPrice(Math.round(data.salePrice / data.totalUnits))}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comps */}
      <Section id="comps" title="Comparable Sales" icon="📊"
        badge={compsLoading ? <span className="animate-spin inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></span> :
          compsLoaded ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{comps.length}</span> : null}
        collapsed={collapsed.comps} onToggle={() => toggle("comps")}>
        {compsLoaded && compsStats ? (
          <div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-blue-500 uppercase font-medium">Avg $/Unit</p>
                <p className="text-lg font-bold text-blue-900">{fmtPrice(compsStats.avgPricePerUnit)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-slate-400 uppercase font-medium">Median $/Unit</p>
                <p className="text-lg font-bold text-slate-900">{fmtPrice(compsStats.medianPricePerUnit)}</p>
              </div>
            </div>
            {comps.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {comps.slice(0, 20).map((c, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{c.address}</p>
                      <p className="text-xs text-slate-400">{c.municipality} · {c.totalUnits} units · {fmtDate(c.saleDate)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-bold text-slate-900">{fmtPrice(c.salePrice)}</p>
                      {c.totalUnits > 0 && <p className="text-xs text-slate-400">{fmtPrice(Math.round(c.salePrice / c.totalUnits))}/unit</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No comparable sales found in {county} County.</p>
            )}
          </div>
        ) : compsLoading ? (
          <p className="text-sm text-slate-400">Searching comparable sales...</p>
        ) : (
          <div className="text-center">
            <button onClick={loadComps} className="text-sm text-blue-600 hover:underline font-medium">Load Comparable Sales</button>
          </div>
        )}
      </Section>

      {/* NYC-Only Sections (grayed out) */}
      <Section id="nycOnly" title="NYC-Only Data Sources" icon="🏙️"
        badge={<span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Not Available</span>}
        collapsed={collapsed.nycOnly} onToggle={() => toggle("nycOnly")}>
        <div className="space-y-3">
          {[
            { name: "HPD Violations", desc: "Housing preservation violations and inspections" },
            { name: "HPD Complaints", desc: "311 complaints and tenant reports" },
            { name: "DOB Permits", desc: "Department of Buildings permit filings" },
            { name: "ECB Violations", desc: "Environmental Control Board violations" },
            { name: "HPD Litigation", desc: "Housing court cases and lawsuits" },
            { name: "Rent Stabilization", desc: "Rent-stabilized unit tracking" },
            { name: "Speculation Watch List", desc: "HPD speculation watch list status" },
          ].map(item => (
            <div key={item.name} className="flex items-center gap-3 py-2 opacity-40">
              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">N/A</div>
              <div>
                <p className="text-sm font-medium text-slate-500">{item.name}</p>
                <p className="text-xs text-slate-400">{item.desc} — NYC only</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
