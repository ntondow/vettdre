"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { lookupProperty, lookupPropertyByBBL, searchAddresses } from "../actions";
import type { AddressSuggestion } from "../actions";
import { incrementSearchCount } from "@/lib/feature-gate-server";
import { getZipCodesForNeighborhoods } from "@/lib/neighborhoods";
import NeighborhoodDropdown from "../neighborhood-dropdown";
import BuildingProfile from "../building-profile";
import type { FilterState } from "../types";

const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
  } catch {
    return d;
  }
};

type View = "results" | "building";

interface NycPropertySearchProps {
  filters: FilterState;
  plan: string;
  userId: string;
  searchesRemaining: number;
  onSearchLimitReached?: () => void;
  onNameClick?: (name: string) => void;
}

export default function NycPropertySearch({
  filters,
  plan,
  userId,
  searchesRemaining,
  onSearchLimitReached,
  onNameClick,
}: NycPropertySearchProps) {
  // Property search state
  const [propQuery, setPropQuery] = useState("");
  const [propSuggestions, setPropSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
  const [propBorough, setPropBorough] = useState(filters.borough || "");
  const [propNeighborhoods, setPropNeighborhoods] = useState<string[]>(
    filters.neighborhoods ? filters.neighborhoods.split(",").filter(Boolean) : []
  );
  const [propResults, setPropResults] = useState<any | null>(null);
  const [view, setView] = useState<View>("results");
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<"sales" | "permits" | "violations">("sales");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Building profile slide-over
  const [nameDetailBuilding, setNameDetailBuilding] = useState<any>(null);

  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced address search
  const handleAddressInput = useCallback((value: string) => {
    setPropQuery(value);
    setSelectedSuggestion(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setPropSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggestionsLoading(true);
    setShowSuggestions(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchAddresses(value);
        setPropSuggestions(results);
        setShowSuggestions(true);
      } catch {
        setPropSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 300);
  }, []);

  // Close suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Property search handler
  const handlePropertySearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Check search limit for free users
    if (plan === "free") {
      const result = await incrementSearchCount(userId);
      if (!result.allowed) { onSearchLimitReached?.(); return; }
    }
    setLoading(true);
    setError(null);
    setView("results");
    setSelectedBuilding(null);
    setShowSuggestions(false);
    try {
      let results;
      if (selectedSuggestion) {
        // User selected a typeahead suggestion — lookup by BBL for precise results
        results = await lookupPropertyByBBL(selectedSuggestion.boroCode, selectedSuggestion.block, selectedSuggestion.lot);
      } else {
        // Fallback: use the typed query + optional borough
        const fd = new FormData(e.currentTarget);
        const address = propQuery.trim();
        const borough = propBorough;
        if (!address) { setError("Please enter an address or BBL"); setLoading(false); return; }

        // Detect BBL pattern
        const bblMatch = address.match(/^(\d)[\s-]?(\d{1,5})[\s-]?(\d{1,4})$/);
        const bbl10 = address.match(/^(\d)(\d{5})(\d{4})$/);
        if (bblMatch || bbl10) {
          const m = (bblMatch || bbl10)!;
          results = await lookupPropertyByBBL(m[1], m[2].replace(/^0+/, ""), m[3].replace(/^0+/, ""));
        } else if (borough) {
          // Use legacy lookup with borough
          fd.set("address", address);
          fd.set("borough", borough);
          results = await lookupProperty(fd);
        } else {
          // No borough selected — try typeahead first to find matching properties, then do lookup on best match
          const suggestions = await searchAddresses(address);
          if (suggestions.length > 0) {
            const best = suggestions[0];
            results = await lookupPropertyByBBL(best.boroCode, best.block, best.lot);
          } else {
            setError("No properties found. Try a more specific address or select a borough.");
            setLoading(false);
            return;
          }
        }
      }
      // Client-side filter by neighborhood zips if selected
      if (propNeighborhoods.length > 0 && results?.buildings) {
        const allZips = new Set(getZipCodesForNeighborhoods(propNeighborhoods));
        results.buildings = results.buildings.filter((b: any) => !b.zipCode || allZips.has(b.zipCode));
      }
      setPropResults(results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Search Form */}
      <form onSubmit={handlePropertySearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="sm:col-span-2" ref={suggestionsRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address or BBL</label>
            <div className="relative">
              <input
                value={propQuery}
                onChange={(e) => handleAddressInput(e.target.value)}
                onFocus={() => propSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="e.g., 350 Park Ave, 1-634-1, or 1006340001"
                className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {suggestionsLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                </div>
              )}
              {showSuggestions && propSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                  {propSuggestions.map((s, i) => (
                    <button
                      key={`${s.boroCode}-${s.block}-${s.lot}-${i}`}
                      type="button"
                      onClick={() => {
                        setSelectedSuggestion(s);
                        setPropQuery(`${s.address}, ${s.borough}`);
                        setPropBorough(s.borough);
                        setShowSuggestions(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{s.address}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{s.borough}{s.zip ? ` ${s.zip}` : ""}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {s.unitsRes > 0 && <span className="text-xs text-blue-600 font-medium">{s.unitsRes} units</span>}
                          {s.yearBuilt > 0 && <p className="text-[10px] text-slate-400">Built {s.yearBuilt}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showSuggestions && !suggestionsLoading && propSuggestions.length === 0 && propQuery.trim().length >= 3 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 px-4 py-3">
                  <p className="text-sm text-slate-400">No matches found</p>
                </div>
              )}
            </div>
            {selectedSuggestion && (
              <p className="text-xs text-green-600 mt-1">
                {selectedSuggestion.borough} — Block {selectedSuggestion.block}, Lot {selectedSuggestion.lot}
                {selectedSuggestion.ownerName && ` — ${selectedSuggestion.ownerName}`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Borough <span className="text-slate-400 font-normal">(optional)</span></label>
            <select value={propBorough} onChange={(e) => { setPropBorough(e.target.value); setPropNeighborhoods([]); }}
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm bg-white">
              <option value="">Any</option>
              <option value="Manhattan">Manhattan</option>
              <option value="Brooklyn">Brooklyn</option>
              <option value="Queens">Queens</option>
              <option value="Bronx">Bronx</option>
              <option value="Staten Island">Staten Island</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading || !propQuery.trim()} className="w-full md:w-auto h-12 md:h-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </div>
        {propBorough && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="max-w-xs">
              <NeighborhoodDropdown borough={propBorough} selected={propNeighborhoods} onChange={setPropNeighborhoods} />
            </div>
          </div>
        )}
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
          <p className="text-sm text-slate-500">Searching NYC sales, permits, and violations...</p>
        </div>
      )}

      {/* Results Grid */}
      {propResults && view === "results" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Buildings", val: propResults.buildings.length },
              { label: "Sales", val: propResults.sales.length },
              { label: "Permits", val: propResults.permits.length },
              { label: "Violations", val: propResults.violations.length },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{s.val}</p>
              </div>
            ))}
          </div>
          {propResults.buildings.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {propResults.buildings.map((b: any, i: number) => (
                <button
                  key={i}
                  onClick={() => { setSelectedBuilding(b); setView("building"); setDetailTab("sales"); }}
                  className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600">{b.address}</h3>
                      <p className="text-sm text-slate-500 mt-0.5">{b.neighborhood}, {b.borough}</p>
                    </div>
                    <span className="text-slate-400 group-hover:text-blue-500 text-lg">&rarr;</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-4">
                    <div><p className="text-xs text-slate-400">Last Sale</p><p className="text-sm font-semibold">{fmtPrice(b.lastSalePrice)}</p></div>
                    <div><p className="text-xs text-slate-400">Year Built</p><p className="text-sm">{b.yearBuilt || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Units</p><p className="text-sm">{b.totalUnits || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Sales</p><p className="text-sm">{b.salesCount}</p></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Building Detail View */}
      {propResults && view === "building" && selectedBuilding && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setView("results")} className="text-sm text-blue-600 font-medium">&larr; Back</button>
            <button
              onClick={() => {
                setNameDetailBuilding({
                  boroCode: selectedBuilding.block ? (
                    propResults.query?.borough === "Manhattan" ? "1" :
                    propResults.query?.borough === "Bronx" ? "2" :
                    propResults.query?.borough === "Brooklyn" ? "3" :
                    propResults.query?.borough === "Queens" ? "4" :
                    propResults.query?.borough === "Staten Island" ? "5" : "1"
                  ) : "1",
                  block: selectedBuilding.block,
                  lot: selectedBuilding.lot,
                  address: selectedBuilding.address,
                  borough: selectedBuilding.borough,
                });
              }}
              className="text-sm text-blue-600 font-medium hover:text-blue-800"
            >
              Full Profile &rarr;
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h2 className="text-2xl font-bold text-slate-900">{selectedBuilding.address}</h2>
            <p className="text-base text-slate-500 mt-1">{selectedBuilding.neighborhood}, {selectedBuilding.borough}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-5 pt-5 border-t border-slate-100">
              <div><p className="text-xs text-slate-400 uppercase">Last Sale</p><p className="text-lg font-semibold">{fmtPrice(selectedBuilding.lastSalePrice)}</p></div>
              <div><p className="text-xs text-slate-400 uppercase">Year Built</p><p className="text-lg font-semibold">{selectedBuilding.yearBuilt || "—"}</p></div>
              <div><p className="text-xs text-slate-400 uppercase">Units</p><p className="text-lg font-semibold">{selectedBuilding.totalUnits || "—"}</p></div>
              <div><p className="text-xs text-slate-400 uppercase">Sq Ft</p><p className="text-lg font-semibold">{selectedBuilding.grossSqft > 0 ? selectedBuilding.grossSqft.toLocaleString() : "—"}</p></div>
              <div><p className="text-xs text-slate-400 uppercase">Block/Lot</p><p className="text-lg font-semibold">{selectedBuilding.block}/{selectedBuilding.lot}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex border-b border-slate-200">
              {(["sales", "permits", "violations"] as const).map((t) => (
                <button key={t} onClick={() => setDetailTab(t)}
                  className={`px-5 py-3 text-sm font-medium border-b-2 capitalize ${detailTab === t ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>
                  {t} ({t === "sales" ? selectedBuilding.sales.length : t === "permits" ? propResults?.permits.length : propResults?.violations.length})
                </button>
              ))}
            </div>
            <div className="p-5">
              {detailTab === "sales" && selectedBuilding.sales.length > 0 && (
                <table className="w-full">
                  <thead><tr className="border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Address</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Price</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Date</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">$/SqFt</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedBuilding.sales.map((s: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-sm">{s.address}{s.apartmentNumber ? ` #${s.apartmentNumber}` : ""}</td>
                        <td className="px-3 py-2.5 text-sm font-semibold text-right">{fmtPrice(s.salePrice)}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-600">{fmtDate(s.saleDate)}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.grossSqft > 0 ? `$${Math.round(s.salePrice / s.grossSqft).toLocaleString()}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {detailTab === "sales" && selectedBuilding.sales.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No sales</p>}
              {detailTab !== "sales" && <p className="text-sm text-slate-400 text-center py-8">See main results for {detailTab}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!propResults && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🏙️</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Search any NYC property</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Enter a street address and borough to pull sales, permits, and violations.</p>
        </div>
      )}

      {/* Building Profile Slide-over */}
      {nameDetailBuilding && (
        <div className="fixed inset-0 z-[2000] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNameDetailBuilding(null)} />
          <div className="relative ml-auto w-full md:max-w-3xl bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{nameDetailBuilding.address}</h2>
                <p className="text-xs text-slate-500">{nameDetailBuilding.borough}</p>
              </div>
              <button onClick={() => setNameDetailBuilding(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>
            <div className="p-5">
              <BuildingProfile
                boroCode={nameDetailBuilding.boroCode}
                block={nameDetailBuilding.block}
                lot={nameDetailBuilding.lot}
                address={nameDetailBuilding.address}
                borough={nameDetailBuilding.borough}
                ownerName={nameDetailBuilding.ownerName}
                onClose={() => setNameDetailBuilding(null)}
                onNameClick={(name) => {
                  setNameDetailBuilding(null);
                  onNameClick?.(name);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
