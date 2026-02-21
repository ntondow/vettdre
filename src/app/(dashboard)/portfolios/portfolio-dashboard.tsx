"use client";
import { useState, useEffect } from "react";
import { getPortfolios, runPortfolioClustering, WILLIAMSBURG_BOUNDS } from "../market-intel/portfolio-engine";

export default function PortfolioDashboard() {
  const [portfolios, setPortfolios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedPortfolio, setSelectedPortfolio] = useState<any>(null);
  const [sortBy, setSortBy] = useState("totalUnits");

  useEffect(() => { loadPortfolios(); }, []);

  const loadPortfolios = async () => {
    setLoading(true);
    try {
      const data = await getPortfolios(sortBy);
      setPortfolios(JSON.parse(JSON.stringify(data)));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const runClustering = async () => {
    setRunning(true);
    setStatus("Scanning buildings...");
    try {
      const result = await runPortfolioClustering(WILLIAMSBURG_BOUNDS, 20);
      setStatus(`Done! Found ${result.portfolios} portfolios from ${result.buildings} buildings`);
      await loadPortfolios();
    } catch (err: any) {
      setStatus("Error: " + err.message);
    }
    setRunning(false);
  };

  const fmtPrice = (n: number) => n > 0 ? "$" + Math.round(n).toLocaleString() : "—";

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">🏢 Portfolio Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">AI-discovered ownership portfolios across NYC</p>
        </div>
        <button onClick={runClustering} disabled={running}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
          {running ? "Scanning..." : "⚡ Run Discovery (Williamsburg)"}
        </button>
      </div>

      {status && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700">
          {running && <span className="inline-block animate-spin mr-2">⏳</span>}
          {status}
        </div>
      )}

      {/* Sort controls */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-500">Sort:</span>
        {["totalUnits", "totalBuildings", "totalValue"].map(key => (
          <button key={key} onClick={() => { setSortBy(key); loadPortfolios(); }}
            className={"text-xs px-2.5 py-1 rounded-full font-medium " + (
              sortBy === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}>
            {key === "totalUnits" ? "Units" : key === "totalBuildings" ? "Buildings" : "Value"}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-2">{portfolios.length} portfolios</span>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-sm text-slate-500 mt-3">Loading portfolios...</p>
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-300">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-lg font-semibold text-slate-700">No portfolios discovered yet</p>
          <p className="text-sm text-slate-500 mt-1">Click "Run Discovery" to scan Williamsburg/Greenpoint for ownership portfolios</p>
        </div>
      ) : (
        <div className="space-y-3">
          {portfolios.map((p: any) => (
            <div key={p.id}
              onClick={() => setSelectedPortfolio(selectedPortfolio?.id === p.id ? null : p)}
              className={"bg-white rounded-xl border p-4 cursor-pointer transition-all " + (
                selectedPortfolio?.id === p.id ? "border-blue-400 shadow-lg" : "border-slate-200 hover:border-slate-300 hover:shadow"
              )}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">{p.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500">{p.borough}</span>
                    {p.headOfficers?.length > 0 && (
                      <span className="text-xs text-blue-600">👤 {p.headOfficers[0]}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-lg font-black text-slate-900">{p.totalBuildings}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Buildings</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-blue-700">{p.totalUnits.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Units</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">{fmtPrice(p.totalValue)}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Value</p>
                  </div>
                </div>
              </div>

              {/* Expanded view */}
              {selectedPortfolio?.id === p.id && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  {/* Entity names */}
                  {p.entityNames?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Linked Entities</p>
                      <div className="flex flex-wrap gap-1">
                        {p.entityNames.slice(0, 10).map((name: string, i: number) => (
                          <span key={i} className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{name}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Buildings list */}
                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-2">Buildings in Portfolio</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                    {p.buildings?.map((b: any) => (
                      <div key={b.id} className="bg-slate-50 rounded-lg p-2.5 text-xs">
                        <p className="font-semibold text-slate-900">{b.address}</p>
                        <p className="text-slate-500">{b.borough} · {b.units} units · {b.floors} floors</p>
                        <p className="text-slate-400">{fmtPrice(b.assessedValue)} · {b.zoning}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
