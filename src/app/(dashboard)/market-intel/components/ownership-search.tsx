"use client";

import { useState, useRef, useEffect } from "react";
import { searchOwnership } from "../actions";
import {
  getNeighborhoodsByBorough,
  getNeighborhoodNameByZip,
  getZipCodesForNeighborhoods,
} from "@/lib/neighborhoods";
import { incrementSearchCount } from "@/lib/feature-gate-server";
import BuildingDetail from "../building-detail";
import type { FilterState } from "../types";

interface OwnershipSearchProps {
  filters: FilterState;
  plan: string;
  userId: string;
  onSearchLimitReached?: () => void;
  onNameClick?: (name: string) => void;
}

export default function OwnershipSearch({
  filters,
  plan,
  userId,
  onSearchLimitReached,
  onNameClick,
}: OwnershipSearchProps) {
  // Borough & neighborhood state
  const [ownerBorough, setOwnerBorough] = useState("");
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([]);
  const [neighborhoodSearch, setNeighborhoodSearch] = useState("");
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] = useState(false);
  const neighborhoodRef = useRef<HTMLDivElement>(null);

  // Results state
  const [ownerResults, setOwnerResults] = useState<any | null>(null);
  const [ownerDetailBuilding, setOwnerDetailBuilding] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmtPrice = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "\u2014");

  // Close neighborhood dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (neighborhoodRef.current && !neighborhoodRef.current.contains(e.target as Node)) {
        setShowNeighborhoodDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOwnershipSearch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (plan === "free") {
      const result = await incrementSearchCount(userId);
      if (!result.allowed) {
        onSearchLimitReached?.();
        return;
      }
    }
    setLoading(true);
    setError(null);
    setOwnerDetailBuilding(null);
    try {
      const fd = new FormData(e.currentTarget);
      // If neighborhoods selected, override zip with neighborhood zip codes
      if (selectedNeighborhoods.length > 0) {
        const zips = getZipCodesForNeighborhoods(selectedNeighborhoods);
        if (zips.length > 0) fd.set("zip", zips[0]); // Primary zip — server will use it
        // We'll filter client-side by all zips after
      }
      const results = await searchOwnership(fd);
      // Client-side filter by neighborhood zips if multiple
      if (selectedNeighborhoods.length > 0 && results?.buildings) {
        const allZips = new Set(getZipCodesForNeighborhoods(selectedNeighborhoods));
        results.buildings = results.buildings.filter((b: any) => !b.zip || allZips.has(b.zip));
      }
      setOwnerResults(results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (ownerDetailBuilding) {
    return (
      <BuildingDetail
        building={ownerDetailBuilding}
        onClose={() => setOwnerDetailBuilding(null)}
        onNameClick={onNameClick}
      />
    );
  }

  return (
    <>
      <form onSubmit={handleOwnershipSearch} className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <p className="text-sm text-slate-500 mb-4">Search HPD-registered buildings. Click any building for AI owner analysis.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Borough</label>
            <select
              name="borough"
              value={ownerBorough}
              onChange={(e) => {
                setOwnerBorough(e.target.value);
                setSelectedNeighborhoods([]);
                setNeighborhoodSearch("");
              }}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="">Any</option>
              <option value="Manhattan">Manhattan</option>
              <option value="Brooklyn">Brooklyn</option>
              <option value="Queens">Queens</option>
              <option value="Bronx">Bronx</option>
              <option value="Staten Island">Staten Island</option>
            </select>
          </div>

          <div ref={neighborhoodRef} className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Neighborhood</label>
            <div
              onClick={() => ownerBorough && setShowNeighborhoodDropdown(!showNeighborhoodDropdown)}
              className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white cursor-pointer flex items-center gap-1 min-h-[42px] ${!ownerBorough ? "text-slate-400" : "text-slate-700"}`}
            >
              {!ownerBorough ? (
                <span>Select borough first</span>
              ) : selectedNeighborhoods.length === 0 ? (
                <span className="text-slate-400">Any neighborhood</span>
              ) : selectedNeighborhoods.length <= 2 ? (
                <span className="truncate">{selectedNeighborhoods.join(", ")}</span>
              ) : (
                <span>{selectedNeighborhoods.length} selected</span>
              )}
              <svg className="w-4 h-4 ml-auto text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {showNeighborhoodDropdown && ownerBorough && (() => {
              const neighborhoods = getNeighborhoodsByBorough(ownerBorough);
              const filtered = neighborhoodSearch
                ? neighborhoods.filter(n => n.name.toLowerCase().includes(neighborhoodSearch.toLowerCase()))
                : neighborhoods;
              return (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-64 overflow-hidden flex flex-col">
                  <div className="p-2 border-b border-slate-100">
                    <input
                      value={neighborhoodSearch}
                      onChange={(e) => setNeighborhoodSearch(e.target.value)}
                      placeholder="Search neighborhoods..."
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  {selectedNeighborhoods.length > 0 && (
                    <button onClick={() => setSelectedNeighborhoods([])} className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 text-left border-b border-slate-100">
                      Clear all ({selectedNeighborhoods.length})
                    </button>
                  )}
                  <div className="overflow-y-auto max-h-48">
                    {filtered.map(n => (
                      <label key={n.name} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={selectedNeighborhoods.includes(n.name)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedNeighborhoods([...selectedNeighborhoods, n.name]);
                            else setSelectedNeighborhoods(selectedNeighborhoods.filter(s => s !== n.name));
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{n.name}</span>
                      </label>
                    ))}
                    {filtered.length === 0 && (
                      <p className="px-3 py-4 text-sm text-slate-400 text-center">No neighborhoods match</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ZIP code</label>
            <input
              name="zip"
              placeholder="e.g., 11211"
              disabled={selectedNeighborhoods.length > 0}
              className={`w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${selectedNeighborhoods.length > 0 ? "bg-slate-50 text-slate-400" : ""}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Street name</label>
            <input
              name="street"
              placeholder="e.g., Bedford Ave"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">House #</label>
            <input
              name="houseNumber"
              placeholder="e.g., 143"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Owner name</label>
            <input
              name="ownerName"
              placeholder="e.g., Smith"
              className="w-full h-12 md:h-auto px-4 md:px-3 py-2.5 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-end gap-4 mt-4">
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-700 mb-1">Min. units</label>
            <select name="minUnits" defaultValue="3" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white">
              <option value="0">Any</option>
              <option value="3">3+</option>
              <option value="5">5+</option>
              <option value="10">10+</option>
              <option value="20">20+</option>
              <option value="50">50+</option>
            </select>
          </div>
          <button type="submit" disabled={loading} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {ownerResults && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-sm text-slate-500">Buildings</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.buildings.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-sm text-slate-500">Owner Records</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.totalContacts}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-sm text-slate-500">Registrations</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{ownerResults.totalRegistrations}</p>
            </div>
          </div>

          {ownerResults.buildings.length > 0 ? (
            <div className="space-y-3">
              {ownerResults.buildings.map((b: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setOwnerDetailBuilding(b)}
                  className="w-full bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 group-hover:text-blue-600">{b.address}</h3>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {b.zip ? (() => { const nh = getNeighborhoodNameByZip(b.zip); return nh ? `${nh}, ${b.boro}` : b.boro; })() : b.boro}
                        {" "}&bull; ZIP: {b.zip} &bull; Block {b.block}, Lot {b.lot}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {b.totalUnits > 0 && (
                        <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">{b.totalUnits} units</span>
                      )}
                      <span className="text-slate-400 group-hover:text-blue-500 text-lg">&rarr;</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-2 text-xs text-slate-500">
                    {b.yearBuilt > 0 && <span>Built {b.yearBuilt}</span>}
                    {b.numFloors > 0 && <span>{b.numFloors} floors</span>}
                    {b.bldgArea > 0 && <span>{b.bldgArea.toLocaleString()} sf</span>}
                    {b.assessedValue > 0 && <span>Assessed: {fmtPrice(b.assessedValue)}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-slate-400">Owner:</span>
                    <span className="text-sm font-medium text-slate-700">
                      {b.ownerNamePluto || (b.owners?.length > 0 ? (b.owners[0].corporateName || `${b.owners[0].firstName} ${b.owners[0].lastName}`.trim()) : "\u2014")}
                    </span>
                    {b.owners?.length > 1 && <span className="text-xs text-slate-400">+{b.owners.length - 1} contacts</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-sm text-slate-500">No buildings found. Try a different ZIP or lower the unit minimum.</p>
            </div>
          )}
        </>
      )}

      {!ownerResults && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">{"\uD83D\uDC64"}</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Find building owners</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Search by ZIP, street, or owner name. Click any result for AI owner analysis.</p>
        </div>
      )}
    </>
  );
}
