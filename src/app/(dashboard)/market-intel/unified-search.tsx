"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  unifiedSearch,
  detectQueryType,
  type SearchResult,
  type UnifiedSearchResult,
  type UnifiedSearchFilters,
  type QueryType,
  type OwnerGroup,
} from "./unified-search-actions";
import BuildingProfile from "./building-profile";
import ProfileModal from "./building-profile-modal";
import { prefetchBuilding } from "./building-profile-actions";
import type { FilterState } from "./types";

const fmtValue = (n: number) => (n > 0 ? `$${n.toLocaleString()}` : "—");
const fmtSqft = (n: number) => (n > 0 ? n.toLocaleString() : "—");

const QUERY_TYPE_LABELS: Record<QueryType, { label: string; color: string }> = {
  address: { label: "Address", color: "bg-blue-100 text-blue-700" },
  bbl: { label: "BBL", color: "bg-purple-100 text-purple-700" },
  entity: { label: "Entity", color: "bg-amber-100 text-amber-700" },
  name: { label: "Person", color: "bg-emerald-100 text-emerald-700" },
  fuzzy: { label: "Search", color: "bg-slate-100 text-slate-600" },
};

const BORO_OPTIONS = [
  { value: "", label: "Any Borough" },
  { value: "1", label: "Manhattan" },
  { value: "2", label: "Bronx" },
  { value: "3", label: "Brooklyn" },
  { value: "4", label: "Queens" },
  { value: "5", label: "Staten Island" },
];

const BLDG_CLASS_OPTIONS = [
  { value: "", label: "Any" },
  { value: "A", label: "Walk-up Apartments" },
  { value: "C", label: "Walk-up + Elevator" },
  { value: "D", label: "Elevator Apartments" },
  { value: "R", label: "Condominiums" },
  { value: "S", label: "Mixed Res/Commercial" },
  { value: "O", label: "Office Buildings" },
];

interface UnifiedSearchProps {
  filters: FilterState;
  onNameClick?: (name: string) => void;
}

export default function UnifiedSearch({ filters, onNameClick }: UnifiedSearchProps) {
  // Search state
  const [query, setQuery] = useState(filters.query || "");
  const [detectedType, setDetectedType] = useState<QueryType | null>(null);
  const [results, setResults] = useState<UnifiedSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState<"units" | "value" | "year" | "floors" | "address">("units");
  const PAGE_SIZE = 50;

  // Inline filters
  const [showFilters, setShowFilters] = useState(false);
  const [borough, setBorough] = useState(filters.borough || "");
  const [minUnits, setMinUnits] = useState(filters.minUnits || "");
  const [maxUnits, setMaxUnits] = useState(filters.maxUnits || "");
  const [minYearBuilt, setMinYearBuilt] = useState(filters.minYearBuilt || "");
  const [maxYearBuilt, setMaxYearBuilt] = useState(filters.maxYearBuilt || "");
  const [minFloors, setMinFloors] = useState(filters.minFloors || "");
  const [minValue, setMinValue] = useState(filters.minValue || "");
  const [maxValue, setMaxValue] = useState(filters.maxValue || "");
  const [bldgClass, setBldgClass] = useState(filters.bldgClass || "");
  const [zoneDist, setZoneDist] = useState(filters.zoneDist || "");
  const [excludePublic, setExcludePublic] = useState(filters.excludePublic === "1");

  // Building profile modal
  const [profileBuilding, setProfileBuilding] = useState<{
    boroCode: string; block: string; lot: string;
    address: string; borough: string; ownerName?: string;
    units: number; unitsTot: number; yearBuilt: number; floors: number;
    sqft: number; lotArea: number; assessedValue: number;
    buildingClass: string; zoning: string; zip: string;
    lat: number; lng: number;
  } | null>(null);
  const [primaryPhone, setPrimaryPhone] = useState<string | null>(null);

  // Expanded owner groups
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Detect query type as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setDetectedType(null); return; }
    debounceRef.current = setTimeout(() => {
      detectQueryType(query).then(setDetectedType).catch(() => {});
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const buildFilters = useCallback((): UnifiedSearchFilters => {
    const f: UnifiedSearchFilters = {};
    if (borough) f.borough = borough;
    if (minUnits) f.minUnits = parseInt(minUnits);
    if (maxUnits) f.maxUnits = parseInt(maxUnits);
    if (minYearBuilt) f.yearBuiltAfter = parseInt(minYearBuilt);
    if (maxYearBuilt) f.yearBuiltBefore = parseInt(maxYearBuilt);
    if (minFloors) f.minFloors = parseInt(minFloors);
    if (minValue) f.minAssessedValue = parseInt(minValue);
    if (maxValue) f.maxAssessedValue = parseInt(maxValue);
    if (bldgClass) f.buildingClass = bldgClass;
    if (zoneDist) f.zoning = zoneDist;
    if (excludePublic) f.excludePublic = true;
    if (sortBy) f.sortBy = sortBy;
    return f;
  }, [borough, minUnits, maxUnits, minYearBuilt, maxYearBuilt, minFloors, minValue, maxValue, bldgClass, zoneDist, excludePublic, sortBy]);

  const handleSearch = useCallback(async (newOffset = 0) => {
    const trimmed = query.trim();
    if (!trimmed && !borough) return;

    setLoading(true);
    setError(null);
    if (newOffset === 0) {
      setResults(null);
      setExpandedOwners(new Set());
    }

    try {
      const result = await unifiedSearch(trimmed, buildFilters(), newOffset, PAGE_SIZE);
      if (newOffset === 0) {
        setResults(result);
      } else if (results) {
        // Append for pagination
        setResults({
          ...result,
          results: [...results.results, ...result.results],
          groupedByOwner: result.groupedByOwner
            ? [...(results.groupedByOwner || []), ...result.groupedByOwner]
            : results.groupedByOwner,
        });
      }
      setOffset(newOffset);
      setHasMore(result.results.length === PAGE_SIZE);
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, borough, buildFilters, results]);

  // Re-search when sort changes (if we already have results)
  useEffect(() => {
    if (results && results.results.length > 0) {
      handleSearch(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(0);
  };

  const handleLoadMore = () => {
    handleSearch(offset + PAGE_SIZE);
  };

  const openProfile = (r: SearchResult) => {
    setProfileBuilding({
      boroCode: r.boroCode,
      block: r.block,
      lot: r.lot,
      address: r.address,
      borough: r.borough,
      ownerName: r.ownerName,
      units: r.units,
      unitsTot: r.units,
      yearBuilt: r.yearBuilt,
      floors: r.floors,
      sqft: r.sqft,
      lotArea: r.lotArea,
      assessedValue: r.assessedValue,
      buildingClass: r.buildingClass,
      zoning: r.zoning,
      zip: r.zip,
      lat: r.lat,
      lng: r.lng,
    });
    setPrimaryPhone(null);
  };

  const handlePrefetch = (r: SearchResult) => {
    if (r.boroCode && r.block && r.lot) {
      const bbl10 = r.boroCode + String(r.block).padStart(5, "0") + String(r.lot).padStart(4, "0");
      prefetchBuilding(bbl10).catch(() => {});
    }
  };

  const toggleOwnerGroup = (owner: string) => {
    setExpandedOwners(prev => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner); else next.add(owner);
      return next;
    });
  };

  const activeFilterCount = [borough, minUnits, maxUnits, minYearBuilt, maxYearBuilt, minFloors, minValue, maxValue, bldgClass, zoneDist, excludePublic ? "1" : ""]
    .filter(Boolean).length;

  const isGrouped = results?.queryType === "entity" || results?.queryType === "name";

  return (
    <>
      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 mb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by address, BBL, owner name, LLC, or portfolio..."
              className="w-full h-12 md:h-11 px-4 pr-24 border border-slate-300 rounded-lg text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {/* Query type badge */}
            {detectedType && query.trim() && (
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full ${QUERY_TYPE_LABELS[detectedType].color}`}>
                {QUERY_TYPE_LABELS[detectedType].label}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`h-12 md:h-11 px-3 border rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              showFilters || activeFilterCount > 0
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="submit"
            disabled={loading || (!query.trim() && !borough)}
            className="h-12 md:h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {loading && offset === 0 ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Inline Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Borough</label>
                <select value={borough} onChange={(e) => setBorough(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white">
                  {BORO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Min Units</label>
                <input type="number" value={minUnits} onChange={(e) => setMinUnits(e.target.value)}
                  placeholder="e.g., 6" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Max Units</label>
                <input type="number" value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)}
                  placeholder="e.g., 100" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Building Class</label>
                <select value={bldgClass} onChange={(e) => setBldgClass(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white">
                  {BLDG_CLASS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Built After</label>
                <input type="number" value={minYearBuilt} onChange={(e) => setMinYearBuilt(e.target.value)}
                  placeholder="e.g., 1920" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Built Before</label>
                <input type="number" value={maxYearBuilt} onChange={(e) => setMaxYearBuilt(e.target.value)}
                  placeholder="e.g., 2020" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Min Floors</label>
                <input type="number" value={minFloors} onChange={(e) => setMinFloors(e.target.value)}
                  placeholder="e.g., 5" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Zoning</label>
                <input value={zoneDist} onChange={(e) => setZoneDist(e.target.value)}
                  placeholder="e.g., R7" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Min Assessed Value</label>
                <input type="number" value={minValue} onChange={(e) => setMinValue(e.target.value)}
                  placeholder="e.g., 500000" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Max Assessed Value</label>
                <input type="number" value={maxValue} onChange={(e) => setMaxValue(e.target.value)}
                  placeholder="e.g., 5000000" className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 h-10 cursor-pointer">
                  <input type="checkbox" checked={excludePublic} onChange={(e) => setExcludePublic(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-600">Exclude Public</span>
                </label>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setBorough(""); setMinUnits(""); setMaxUnits("");
                    setMinYearBuilt(""); setMaxYearBuilt(""); setMinFloors("");
                    setMinValue(""); setMaxValue(""); setBldgClass("");
                    setZoneDist(""); setExcludePublic(false);
                  }}
                  className="h-10 px-3 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Active filter chips */}
      {activeFilterCount > 0 && !showFilters && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {borough && (
            <FilterChip label={`Borough: ${BORO_OPTIONS.find(o => o.value === borough)?.label}`} onClear={() => setBorough("")} />
          )}
          {minUnits && <FilterChip label={`Min ${minUnits} units`} onClear={() => setMinUnits("")} />}
          {maxUnits && <FilterChip label={`Max ${maxUnits} units`} onClear={() => setMaxUnits("")} />}
          {bldgClass && <FilterChip label={`Class: ${bldgClass}`} onClear={() => setBldgClass("")} />}
          {minYearBuilt && <FilterChip label={`After ${minYearBuilt}`} onClear={() => setMinYearBuilt("")} />}
          {maxYearBuilt && <FilterChip label={`Before ${maxYearBuilt}`} onClear={() => setMaxYearBuilt("")} />}
          {minFloors && <FilterChip label={`${minFloors}+ floors`} onClear={() => setMinFloors("")} />}
          {zoneDist && <FilterChip label={`Zone: ${zoneDist}`} onClear={() => setZoneDist("")} />}
          {minValue && <FilterChip label={`Min $${parseInt(minValue).toLocaleString()}`} onClear={() => setMinValue("")} />}
          {maxValue && <FilterChip label={`Max $${parseInt(maxValue).toLocaleString()}`} onClear={() => setMaxValue("")} />}
          {excludePublic && <FilterChip label="Excl. Public" onClear={() => setExcludePublic(false)} />}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Loading (initial) */}
      {loading && offset === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4" />
          <p className="text-sm text-slate-500">Searching NYC property records...</p>
        </div>
      )}

      {/* Results */}
      {results && !loading && results.results.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-3xl mb-3">🔍</p>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            No results for &ldquo;{query}&rdquo;
          </h3>
          {results.suggestion ? (
            <p className="text-sm text-blue-600 mb-3">{results.suggestion}</p>
          ) : (
            <p className="text-sm text-slate-500 mb-3">
              Suggestions: check spelling, try a different address format, or broaden your filters.
            </p>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {activeFilterCount > 0 && (
              <button onClick={() => {
                setBorough(""); setMinUnits(""); setMaxUnits("");
                setMinYearBuilt(""); setMaxYearBuilt(""); setMinFloors("");
                setMinValue(""); setMaxValue(""); setBldgClass("");
                setZoneDist(""); setExcludePublic(false);
              }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-xs text-slate-600 transition-colors">
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {results && results.results.length > 0 && (
        <div>
          {/* Results header */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-900">
                {results.total > results.results.length
                  ? `Showing ${results.results.length} of ${results.total.toLocaleString()}`
                  : results.total}
              </span>{" "}
              propert{results.total === 1 ? "y" : "ies"}
              {results.queryType !== "fuzzy" && (
                <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${QUERY_TYPE_LABELS[results.queryType].color}`}>
                  {QUERY_TYPE_LABELS[results.queryType].label}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-400">Sort:</label>
              <select value={sortBy} onChange={e => { setSortBy(e.target.value as typeof sortBy); }}
                className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded px-2 py-1 cursor-pointer">
                <option value="units">Units</option>
                <option value="value">Assessed Value</option>
                <option value="year">Year Built</option>
                <option value="floors">Floors</option>
                <option value="address">Address</option>
              </select>
            </div>
          </div>

          {/* Grouped view (entity / name search) */}
          {isGrouped && results.groupedByOwner && results.groupedByOwner.length > 0 ? (
            <div className="space-y-3">
              {results.groupedByOwner.map((group) => (
                <OwnerGroupCard
                  key={group.owner}
                  group={group}
                  expanded={expandedOwners.has(group.owner)}
                  onToggle={() => toggleOwnerGroup(group.owner)}
                  onOpenProfile={openProfile}
                  onPrefetch={handlePrefetch}
                  onNameClick={onNameClick}
                />
              ))}
            </div>
          ) : (
            /* Flat list view (address / BBL / fuzzy) */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {results.results.map((r, i) => (
                <PropertyCard
                  key={`${r.bbl}-${i}`}
                  result={r}
                  onOpenProfile={() => openProfile(r)}
                  onPrefetch={() => handlePrefetch(r)}
                  onNameClick={onNameClick}
                />
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="px-6 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />
                    Loading...
                  </span>
                ) : (
                  "Load More Results"
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!results && !loading && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Search NYC Properties</h3>
          <p className="text-sm text-slate-500 max-w-lg mx-auto mb-6">
            Search by street address, BBL, owner name, or LLC entity. The search auto-detects your query type and returns matching properties from PLUTO.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { q: "350 Park Ave", type: "Address" },
              { q: "1-00634-0001", type: "BBL" },
              { q: "SL Green Realty", type: "Entity" },
              { q: "Harry Macklowe", type: "Name" },
            ].map(ex => (
              <button
                key={ex.q}
                onClick={() => { setQuery(ex.q); }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-xs text-slate-600 transition-colors"
              >
                {ex.type}: <span className="font-medium">{ex.q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Building Profile Slide-over */}
      {profileBuilding && (
        <ProfileModal
          address={profileBuilding.address}
          borough={profileBuilding.borough}
          primaryPhone={primaryPhone}
          onClose={() => setProfileBuilding(null)}
        >
          <BuildingProfile
            boroCode={profileBuilding.boroCode}
            block={profileBuilding.block}
            lot={profileBuilding.lot}
            address={profileBuilding.address}
            borough={profileBuilding.borough}
            ownerName={profileBuilding.ownerName}
            onClose={() => setProfileBuilding(null)}
            onNameClick={(name) => {
              setProfileBuilding(null);
              if (onNameClick) {
                onNameClick(name);
              } else {
                setQuery(name);
                handleSearch(0);
              }
            }}
            onPrimaryPhoneChange={setPrimaryPhone}
            plutoData={{
              address: profileBuilding.address, ownerName: profileBuilding.ownerName || "",
              unitsRes: profileBuilding.units, unitsTot: profileBuilding.unitsTot,
              yearBuilt: profileBuilding.yearBuilt, numFloors: profileBuilding.floors,
              bldgArea: profileBuilding.sqft, lotArea: profileBuilding.lotArea,
              assessTotal: profileBuilding.assessedValue, bldgClass: profileBuilding.buildingClass,
              zoneDist: profileBuilding.zoning, borough: profileBuilding.borough,
              zip: profileBuilding.zip, lat: profileBuilding.lat, lng: profileBuilding.lng,
            }}
          />
        </ProfileModal>
      )}
    </>
  );
}

// ============================================================
// Property Card (flat list)
// ============================================================

function PropertyCard({
  result: r,
  onOpenProfile,
  onPrefetch,
  onNameClick,
}: {
  result: SearchResult;
  onOpenProfile: () => void;
  onPrefetch: () => void;
  onNameClick?: (name: string) => void;
}) {
  const maxFAR = Math.max(r.residFAR, r.commFAR, r.facilFAR);
  const unusedFAR = maxFAR > 0 && r.builtFAR > 0 ? maxFAR - r.builtFAR : 0;

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all group"
      onMouseEnter={onPrefetch}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-blue-600">
            {r.address}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {r.borough}{r.zip ? ` ${r.zip}` : ""} &middot; {r.bbl}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {r.matchType && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
              r.matchType === "address" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
            }`}>
              {r.matchType === "address" ? "Addr" : "Owner"}
            </span>
          )}
          {r.buildingClass && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
              {r.buildingClass}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
        <div>
          <p className="text-slate-400">Units</p>
          <p className="font-semibold text-slate-800">{r.units || "—"}</p>
        </div>
        <div>
          <p className="text-slate-400">Floors</p>
          <p className="font-semibold text-slate-800">{r.floors || "—"}</p>
        </div>
        <div>
          <p className="text-slate-400">Year</p>
          <p className="font-semibold text-slate-800">{r.yearBuilt || "—"}</p>
        </div>
        <div>
          <p className="text-slate-400">Sq Ft</p>
          <p className="font-semibold text-slate-800">{fmtSqft(r.sqft)}</p>
        </div>
        <div>
          <p className="text-slate-400">Assessed</p>
          <p className="font-semibold text-slate-800">{fmtValue(r.assessedValue)}</p>
        </div>
        <div>
          <p className="text-slate-400">Zoning</p>
          <p className="font-semibold text-slate-800">{r.zoning || "—"}</p>
        </div>
      </div>

      {/* FAR indicator */}
      {unusedFAR > 0.5 && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
            {unusedFAR.toFixed(1)} unused FAR
          </span>
          <span className="text-slate-400">({r.builtFAR.toFixed(1)} / {maxFAR.toFixed(1)})</span>
        </div>
      )}

      {/* Owner */}
      {r.ownerName && (
        <div className="flex items-center gap-1.5 mb-3 text-xs">
          <span className="text-slate-400">Owner:</span>
          {onNameClick ? (
            <button
              onClick={(e) => { e.stopPropagation(); onNameClick(r.ownerName); }}
              className="text-blue-600 hover:text-blue-800 font-medium truncate"
            >
              {r.ownerName}
            </button>
          ) : (
            <span className="text-slate-700 font-medium truncate">{r.ownerName}</span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onOpenProfile}
          className="flex-1 py-2 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          Full Profile
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Owner Group Card (entity / name search)
// ============================================================

function OwnerGroupCard({
  group,
  expanded,
  onToggle,
  onOpenProfile,
  onPrefetch,
  onNameClick,
}: {
  group: OwnerGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenProfile: (r: SearchResult) => void;
  onPrefetch: (r: SearchResult) => void;
  onNameClick?: (name: string) => void;
}) {
  const preview = expanded ? group.properties : group.properties.slice(0, 3);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Owner header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
            {group.owner.charAt(0)}
          </div>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-slate-900 truncate">{group.owner}</p>
            <p className="text-xs text-slate-500">
              {group.properties.length} propert{group.properties.length === 1 ? "y" : "ies"}
              &middot; {group.totalUnits.toLocaleString()} units
              &middot; {fmtValue(group.totalAssessed)} assessed
            </p>
          </div>
        </div>
        <span className={`text-slate-400 text-xs transition-transform duration-200 shrink-0 ml-2 ${expanded ? "rotate-90" : ""}`}>
          &#9654;
        </span>
      </button>

      {/* Properties list */}
      <div className="divide-y divide-slate-100">
        {preview.map((r, i) => (
          <div
            key={`${r.bbl}-${i}`}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
            onMouseEnter={() => onPrefetch(r)}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{r.address}</p>
              <p className="text-xs text-slate-400">
                {r.borough} &middot; {r.units} units &middot; {r.floors} fl &middot; {r.yearBuilt || "—"} &middot; {fmtValue(r.assessedValue)}
              </p>
            </div>
            <button
              onClick={() => onOpenProfile(r)}
              className="ml-3 shrink-0 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Profile
            </button>
          </div>
        ))}
      </div>

      {/* Show more/less */}
      {group.properties.length > 3 && (
        <button
          onClick={onToggle}
          className="w-full py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 border-t border-slate-100 transition-colors"
        >
          {expanded ? "Show Less" : `Show All ${group.properties.length} Properties`}
        </button>
      )}
    </div>
  );
}

// ============================================================
// Filter Chip
// ============================================================

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
      {label}
      <button onClick={onClear} className="hover:text-blue-900 transition-colors">&times;</button>
    </span>
  );
}
