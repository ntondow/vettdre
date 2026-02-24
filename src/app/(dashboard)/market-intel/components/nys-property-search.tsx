"use client";

import { useState, useRef, useCallback } from "react";
import { searchNYSProperties, searchNYSAddresses } from "../nys-actions";
import type { NYSPropertyResult } from "../nys-actions";
import { getCounties, getMunicipalitiesByCounty } from "@/lib/neighborhoods-nys";
import NYSBuildingProfile from "../nys-building-profile";
import type { FilterState } from "../types";

const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");

interface NysPropertySearchProps {
  filters: FilterState;
}

export default function NysPropertySearch({ filters }: NysPropertySearchProps) {
  const [nysCounty, setNysCounty] = useState(filters.nysCounty || "");
  const [nysMunicipality, setNysMunicipality] = useState(filters.nysMunicipality || "");
  const [nysAddress, setNysAddress] = useState("");
  const [nysOwner, setNysOwner] = useState(filters.ownerName || "");
  const [nysMinUnits, setNysMinUnits] = useState(filters.minUnits || "");
  const [nysResults, setNysResults] = useState<NYSPropertyResult[]>([]);
  const [nysLoading, setNysLoading] = useState(false);
  const [nysSelectedProperty, setNysSelectedProperty] = useState<NYSPropertyResult | null>(null);
  const [nysViewProfile, setNysViewProfile] = useState(false);
  const [nysSuggestions, setNysSuggestions] = useState<{ address: string; municipality: string; swisCode: string; printKey: string }[]>([]);
  const [showNysSuggestions, setShowNysSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nysDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nysSuggestionsRef = useRef<HTMLDivElement>(null);

  const handleNysAddressInput = useCallback((value: string) => {
    setNysAddress(value);
    if (nysDebounceRef.current) clearTimeout(nysDebounceRef.current);
    if (value.trim().length < 3) { setNysSuggestions([]); setShowNysSuggestions(false); return; }
    setShowNysSuggestions(true);
    nysDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchNYSAddresses(value, nysCounty || undefined);
        setNysSuggestions(results);
        setShowNysSuggestions(true);
      } catch { setNysSuggestions([]); }
    }, 400);
  }, [nysCounty]);

  const handleNysSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setNysLoading(true);
    setError(null);
    try {
      const result = await searchNYSProperties({
        county: nysCounty || undefined,
        municipality: nysMunicipality || undefined,
        streetAddress: nysAddress || undefined,
        ownerName: nysOwner || undefined,
        minUnits: nysMinUnits ? parseInt(nysMinUnits) : undefined,
        minMarketValue: filters.minValue ? parseInt(filters.minValue) : undefined,
        maxMarketValue: filters.maxValue ? parseInt(filters.maxValue) : undefined,
        propertyClasses: filters.nysPropertyClass ? filters.nysPropertyClass.split(",") : undefined,
      });
      setNysResults(result.properties);
    } catch (err: any) {
      setError(err.message || "NYS search failed");
    }
    setNysLoading(false);
  };

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      <form onSubmit={handleNysSearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div ref={nysSuggestionsRef}>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <div className="relative">
              <input value={nysAddress} onChange={(e) => handleNysAddressInput(e.target.value)}
                placeholder="e.g., 123 Main St"
                className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {showNysSuggestions && nysSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                  {nysSuggestions.map((s, i) => (
                    <button key={i} type="button" onClick={() => {
                      setNysAddress(s.address);
                      setShowNysSuggestions(false);
                    }}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0">
                      <p className="text-sm font-medium text-slate-900">{s.address}</p>
                      <p className="text-xs text-slate-400">{s.municipality}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">County</label>
            <select value={nysCounty} onChange={(e) => { setNysCounty(e.target.value); setNysMunicipality(""); }}
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Counties</option>
              {getCounties().map(c => <option key={c.fips} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Municipality</label>
            <select value={nysMunicipality} onChange={(e) => setNysMunicipality(e.target.value)}
              disabled={!nysCounty}
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
              <option value="">All</option>
              {nysCounty && getMunicipalitiesByCounty(nysCounty).map(m => (
                <option key={m.swisCode} value={m.name}>{m.name} ({m.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Owner Name</label>
            <input value={nysOwner} onChange={(e) => setNysOwner(e.target.value)}
              placeholder="e.g., Smith"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex items-end gap-3 mt-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Min Units</label>
            <input type="number" value={nysMinUnits} onChange={(e) => setNysMinUnits(e.target.value)}
              placeholder="2"
              className="w-24 h-12 md:h-auto px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={nysLoading}
            className="px-6 py-2.5 h-12 md:h-auto bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
            {nysLoading ? "Searching..." : "Search NYS"}
          </button>
        </div>
      </form>

      {nysResults.length > 0 && !nysViewProfile && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">{nysResults.length} properties found</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nysResults.map((p, i) => (
              <div key={i} onClick={() => { setNysSelectedProperty(p); setNysViewProfile(true); }}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 truncate">{p.address || p.printKey}</h4>
                    <p className="text-xs text-slate-400">{p.municipality}, {p.county} County</p>
                  </div>
                  {p.totalUnits > 0 && (
                    <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex-shrink-0 ml-2">{p.totalUnits} units</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {p.yearBuilt > 0 && <span>Built {p.yearBuilt}</span>}
                  {p.stories > 0 && <span>{p.stories} fl</span>}
                  <span className="ml-auto font-semibold text-slate-700">{fmtPrice(p.fullMarketValue)}</span>
                </div>
                {p.ownerName && <p className="text-xs text-slate-400 mt-1 truncate">{p.ownerName}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {nysResults.length === 0 && !nysLoading && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🏛️</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Search NYS Properties</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Search New York State assessment rolls for multifamily properties across Westchester, Nassau, Suffolk, Rockland, Orange, Dutchess, Albany, Erie, Monroe, and Onondaga counties.
          </p>
        </div>
      )}

      {nysSelectedProperty && nysViewProfile && (
        <div className="fixed inset-0 z-[2000] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNysViewProfile(false)} />
          <div className="relative ml-auto w-full md:max-w-3xl bg-white shadow-2xl overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 md:px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{nysSelectedProperty.address || nysSelectedProperty.printKey}</h2>
                <p className="text-xs text-slate-500">{nysSelectedProperty.municipality}, {nysSelectedProperty.county} County</p>
              </div>
              <button onClick={() => setNysViewProfile(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>
            <div className="p-4 md:p-5">
              <NYSBuildingProfile
                swisCode={nysSelectedProperty.swisCode}
                printKey={nysSelectedProperty.printKey}
                county={nysSelectedProperty.county}
                address={nysSelectedProperty.address}
                municipality={nysSelectedProperty.municipality}
                onClose={() => setNysViewProfile(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
