"use client";

import { useState, useCallback, useMemo } from "react";
import { X, ChevronDown, Building2, MapPin, User, ArrowUpDown, Search as SearchIcon } from "lucide-react";
import type { SearchResult, OwnerGroup, UnifiedSearchResult } from "../unified-search-actions";

// ── Types ────────────────────────────────────────────────────

type SortKey = "units" | "value" | "year" | "floors" | "address";

export interface ResultsPanelProps {
  searchResult: UnifiedSearchResult | null;
  loading?: boolean;
  onBuildingSelect: (result: SearchResult) => void;
  onNameClick?: (name: string) => void;
  onClose: () => void;
  selectedBbl?: string | null;
  hoveredBbl?: string | null;
  onHoverBbl?: (bbl: string | null) => void;
}

// ── Helpers ──────────────────────────────────────────────────

function fmtPrice(v: number): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function bblKey(r: SearchResult): string {
  return `${r.boroCode}${r.block.padStart(5, "0")}${r.lot.padStart(4, "0")}`;
}

function unitBadgeColor(units: number): string {
  if (units >= 50) return "bg-purple-100 text-purple-700";
  if (units >= 20) return "bg-blue-100 text-blue-700";
  if (units >= 10) return "bg-cyan-100 text-cyan-700";
  return "bg-slate-100 text-slate-600";
}

// ── Sort Logic ───────────────────────────────────────────────

function sortResults(results: SearchResult[], key: SortKey): SearchResult[] {
  const sorted = [...results];
  switch (key) {
    case "units":
      return sorted.sort((a, b) => b.units - a.units);
    case "value":
      return sorted.sort((a, b) => b.assessedValue - a.assessedValue);
    case "year":
      return sorted.sort((a, b) => (b.yearBuilt || 0) - (a.yearBuilt || 0));
    case "floors":
      return sorted.sort((a, b) => b.floors - a.floors);
    case "address":
      return sorted.sort((a, b) => a.address.localeCompare(b.address));
    default:
      return sorted;
  }
}

// ── Component ────────────────────────────────────────────────

export default function ResultsPanel({
  searchResult,
  loading,
  onBuildingSelect,
  onNameClick,
  onClose,
  selectedBbl,
  hoveredBbl,
  onHoverBbl,
}: ResultsPanelProps) {
  const [sortBy, setSortBy] = useState<SortKey>("units");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [clientFilter, setClientFilter] = useState("");

  const results = searchResult?.results ?? [];
  const groups = searchResult?.groupedByOwner ?? [];
  const queryType = searchResult?.queryType ?? "address";
  const total = searchResult?.total ?? 0;

  // Client-side filter
  const filtered = useMemo(() => {
    if (!clientFilter.trim()) return results;
    const q = clientFilter.toLowerCase();
    return results.filter(
      (r) =>
        r.address.toLowerCase().includes(q) ||
        r.ownerName?.toLowerCase().includes(q) ||
        r.borough.toLowerCase().includes(q) ||
        r.zip?.includes(q),
    );
  }, [results, clientFilter]);

  const sorted = useMemo(() => sortResults(filtered, sortBy), [filtered, sortBy]);

  const handleCardClick = useCallback(
    (r: SearchResult) => {
      onBuildingSelect(r);
    },
    [onBuildingSelect],
  );

  // Show grouped view when we have owner groups (from name/entity searches)
  const showGrouped = viewMode === "grouped" && groups.length > 0;

  if (!searchResult && !loading) return null;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900 truncate">
              {loading ? (
                "Searching..."
              ) : (
                <>
                  {total} {total === 1 ? "result" : "results"}
                  {total > results.length && (
                    <span className="ml-1 text-[10px] font-medium text-amber-600">(showing {results.length})</span>
                  )}
                </>
              )}
            </h3>
            {searchResult?.suggestion && (
              <p className="text-[10px] text-blue-600 mt-0.5">{searchResult.suggestion}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* View toggle for name/entity searches */}
            {groups.length > 0 && (
              <div className="flex rounded-md border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    viewMode === "list" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode("grouped")}
                  className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    viewMode === "grouped" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  By Owner
                </button>
              </div>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sort + Filter bar */}
        {results.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {/* Quick filter */}
            <div className="flex-1 relative">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                type="text"
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                placeholder="Filter results..."
                className="w-full pl-6 pr-2 py-1 text-[11px] border border-slate-200 rounded bg-white placeholder:text-slate-300 outline-none focus:border-blue-300"
              />
            </div>
            {/* Sort */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <ArrowUpDown className="w-3 h-3 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-1 cursor-pointer"
              >
                <option value="units">Units</option>
                <option value="value">Value</option>
                <option value="year">Year Built</option>
                <option value="floors">Floors</option>
                <option value="address">Address</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse space-y-2">
                <div className="h-4 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-50 rounded w-1/2" />
                <div className="h-3 bg-slate-50 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No results found</p>
            <p className="text-xs text-slate-300 mt-1">Try a different search or adjust filters</p>
          </div>
        ) : showGrouped ? (
          /* Grouped by owner view */
          <div>
            {groups.map((group) => (
              <OwnerGroupCard
                key={group.owner}
                group={group}
                sortBy={sortBy}
                selectedBbl={selectedBbl}
                hoveredBbl={hoveredBbl}
                onHoverBbl={onHoverBbl}
                onBuildingSelect={handleCardClick}
                onNameClick={onNameClick}
              />
            ))}
          </div>
        ) : (
          /* Flat list view */
          <div>
            {sorted.map((r, i) => {
              const bbl = bblKey(r);
              return (
                <PropertyCard
                  key={`${bbl}-${i}`}
                  result={r}
                  bbl={bbl}
                  isSelected={selectedBbl === bbl}
                  isHovered={hoveredBbl === bbl}
                  onHoverBbl={onHoverBbl}
                  onClick={() => handleCardClick(r)}
                  onNameClick={onNameClick}
                />
              );
            })}
            {clientFilter && filtered.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-xs text-slate-400">No matches for &quot;{clientFilter}&quot;</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Property Card ────────────────────────────────────────────

function PropertyCard({
  result: r,
  bbl,
  isSelected,
  isHovered,
  onHoverBbl,
  onClick,
  onNameClick,
}: {
  result: SearchResult;
  bbl: string;
  isSelected: boolean;
  isHovered: boolean;
  onHoverBbl?: (bbl: string | null) => void;
  onClick: () => void;
  onNameClick?: (name: string) => void;
}) {
  return (
    <div
      onMouseEnter={() => onHoverBbl?.(bbl)}
      onMouseLeave={() => onHoverBbl?.(null)}
      onClick={onClick}
      className={
        "px-3 py-2.5 border-b cursor-pointer transition-colors " +
        (isSelected
          ? "bg-blue-50 border-l-2 border-l-blue-600 border-b-blue-200"
          : isHovered
            ? "bg-blue-50/50 ring-1 ring-inset ring-blue-200"
            : "border-slate-100 hover:bg-slate-50")
      }
    >
      {/* Row 1: Address + Unit badge */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-slate-900 truncate min-w-0">
          {r.address}
        </h4>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${unitBadgeColor(r.units)}`}>
          {r.units} u
        </span>
      </div>

      {/* Row 2: Location + stats */}
      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-0.5">
          <MapPin className="w-3 h-3" />
          {r.borough}
        </span>
        <span>{r.floors} fl</span>
        <span>{r.yearBuilt || "—"}</span>
        {r.buildingClass && (
          <span className="text-slate-400">Cls {r.buildingClass}</span>
        )}
        <span className="ml-auto font-medium text-slate-700">{fmtPrice(r.assessedValue)}</span>
      </div>

      {/* Row 3: Owner (clickable) */}
      {r.ownerName && (
        <div className="flex items-center gap-1 mt-0.5">
          <User className="w-3 h-3 text-slate-300 flex-shrink-0" />
          {onNameClick ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNameClick(r.ownerName);
              }}
              className="text-[11px] text-blue-600 hover:underline truncate max-w-[240px]"
            >
              {r.ownerName}
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 truncate max-w-[240px]">{r.ownerName}</span>
          )}
        </div>
      )}

      {/* Match type badge for fuzzy searches */}
      {r.matchType && (
        <span className={`inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${
          r.matchType === "address" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
        }`}>
          Matched by {r.matchType}
        </span>
      )}
    </div>
  );
}

// ── Owner Group Card ─────────────────────────────────────────

function OwnerGroupCard({
  group,
  sortBy,
  selectedBbl,
  hoveredBbl,
  onHoverBbl,
  onBuildingSelect,
  onNameClick,
}: {
  group: OwnerGroup;
  sortBy: SortKey;
  selectedBbl?: string | null;
  hoveredBbl?: string | null;
  onHoverBbl?: (bbl: string | null) => void;
  onBuildingSelect: (r: SearchResult) => void;
  onNameClick?: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const sorted = useMemo(() => sortResults(group.properties, sortBy), [group.properties, sortBy]);

  return (
    <div className="border-b border-slate-200">
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? "" : "-rotate-90"}`} />
        <div className="flex-1 min-w-0 text-left">
          {onNameClick ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNameClick(group.owner);
              }}
              className="text-xs font-bold text-blue-700 hover:underline truncate block"
            >
              {group.owner}
            </button>
          ) : (
            <p className="text-xs font-bold text-slate-900 truncate">{group.owner}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-slate-500">{group.properties.length} props</span>
          <span className="text-[10px] font-medium text-slate-700">{group.totalUnits} u</span>
          <span className="text-[10px] font-medium text-emerald-700">{fmtPrice(group.totalAssessed)}</span>
        </div>
      </button>

      {/* Expanded property list */}
      {expanded &&
        sorted.map((r, i) => {
          const bbl = bblKey(r);
          return (
            <PropertyCard
              key={`${bbl}-${i}`}
              result={r}
              bbl={bbl}
              isSelected={selectedBbl === bbl}
              isHovered={hoveredBbl === bbl}
              onHoverBbl={onHoverBbl}
              onClick={() => onBuildingSelect(r)}
              onNameClick={onNameClick}
            />
          );
        })}
    </div>
  );
}
