"use client";

import { useState } from "react";
import { searchNJProperties } from "../nj-actions";
import type { NJPropertyResult } from "../nj-actions";
import { getNJCounties, getNJMunicipalitiesByCounty } from "@/lib/neighborhoods-nj";
import NJBuildingProfile from "../nj-building-profile";
import type { FilterState } from "../types";

interface NjPropertySearchProps {
  filters: FilterState;
}

export default function NjPropertySearch({ filters }: NjPropertySearchProps) {
  const [njCounty, setNjCounty] = useState(filters.njCounty || "");
  const [njMunicipality, setNjMunicipality] = useState(filters.njMunicipality || "");
  const [njAddress, setNjAddress] = useState("");
  const [njOwner, setNjOwner] = useState(filters.ownerName || "");
  const [njMinUnits, setNjMinUnits] = useState(filters.minUnits || "");
  const [njResults, setNjResults] = useState<NJPropertyResult[]>([]);
  const [njLoading, setNjLoading] = useState(false);
  const [njSelectedProperty, setNjSelectedProperty] = useState<NJPropertyResult | null>(null);
  const [njViewProfile, setNjViewProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNjSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setNjLoading(true);
    setError(null);
    try {
      const result = await searchNJProperties({
        county: njCounty || undefined,
        municipality: njMunicipality || undefined,
        streetAddress: njAddress || undefined,
        ownerName: njOwner || undefined,
        minUnits: njMinUnits ? parseInt(njMinUnits) : undefined,
        propertyClass: filters.njPropertyClass ? filters.njPropertyClass.split(",")[0] : undefined,
      });
      setNjResults(result.properties);
    } catch (err: any) {
      setError(err.message || "NJ search failed");
    }
    setNjLoading(false);
  };

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      <form onSubmit={handleNjSearch} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">County</label>
            <select value={njCounty} onChange={e => { setNjCounty(e.target.value); setNjMunicipality(""); }}
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All Counties</option>
              {getNJCounties().map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Municipality</label>
            <select value={njMunicipality} onChange={e => setNjMunicipality(e.target.value)}
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">All</option>
              {njCounty && getNJMunicipalitiesByCounty(njCounty).map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <input value={njAddress} onChange={e => setNjAddress(e.target.value)} placeholder="e.g., 123 Main St"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Min Units</label>
            <input type="number" value={njMinUnits} onChange={e => setNjMinUnits(e.target.value)} placeholder="e.g., 5" min="0"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="submit" disabled={njLoading} className="bg-green-700 hover:bg-green-800 text-white px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
            {njLoading ? "Searching..." : "Search NJ Properties"}
          </button>
        </div>
      </form>

      {njResults.length > 0 && !njViewProfile && (
        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-3">{njResults.length} properties found</p>
          <div className="grid gap-3 md:grid-cols-2">
            {njResults.map((p, i) => (
              <button key={i} onClick={() => { setNjSelectedProperty(p); setNjViewProfile(true); }}
                className="bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-green-300 hover:shadow transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{p.address || `Block ${p.block}, Lot ${p.lot}`}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.municipality}, {p.county} County</p>
                  </div>
                  <span className="text-xs font-semibold bg-green-50 text-green-700 px-2 py-0.5 rounded">NJ</span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-slate-600">
                  <span>{p.units} units</span>
                  {p.yearBuilt > 0 && <span>Built {p.yearBuilt}</span>}
                  <span className="font-semibold text-green-700">{p.assessedTotal > 0 ? `$${p.assessedTotal.toLocaleString()}` : "—"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!njLoading && njResults.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🏘️</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Search NJ Properties</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Search multifamily properties across 8 NJ investment counties using MOD-IV tax records.</p>
        </div>
      )}

      {njViewProfile && njSelectedProperty && (
        <NJBuildingProfile
          municipality={njSelectedProperty.municipality}
          block={njSelectedProperty.block}
          lot={njSelectedProperty.lot}
          county={njSelectedProperty.county}
          address={njSelectedProperty.address}
          onClose={() => setNjViewProfile(false)}
        />
      )}
    </>
  );
}
