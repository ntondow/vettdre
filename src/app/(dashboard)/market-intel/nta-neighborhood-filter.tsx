"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { NTAEntry } from "./neighborhood-actions";

interface Props {
  selected: string[];
  onChange: (ntaName: string | null, bounds?: { swLat: number; swLng: number; neLat: number; neLng: number }) => void;
  ntaList: NTAEntry[];
  compact?: boolean;
}

/**
 * NTA neighborhood dropdown — lists all NYC neighborhoods from the actual NTA
 * GeoJSON data (same source as map polygons and PLUTO). Grouped by borough,
 * multi-select with checkboxes, searchable. Toggle neighborhoods on/off.
 */
export default function NtaNeighborhoodFilter({ selected, onChange, ntaList, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Unique borough names in order
  const boroughs = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const entry of ntaList) {
      if (!seen.has(entry.boroName)) {
        seen.add(entry.boroName);
        result.push(entry.boroName);
      }
    }
    return result;
  }, [ntaList]);

  const grouped = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return boroughs.map((borough) => {
      const neighborhoods = ntaList
        .filter((n) => n.boroName === borough)
        .filter((n) => !search || n.ntaName.toLowerCase().includes(lowerSearch));
      return { borough, neighborhoods };
    }).filter((g) => g.neighborhoods.length > 0);
  }, [search, boroughs, ntaList]);

  const handleToggle = (entry: NTAEntry) => {
    // Toggle: onChange(name, bounds) adds if not selected, removes if selected
    onChange(entry.ntaName, {
      swLat: entry.swLat, swLng: entry.swLng,
      neLat: entry.neLat, neLng: entry.neLng,
    });
    // Keep dropdown open for multi-select
  };

  const sz = compact ? "text-xs" : "text-sm";
  const selectedSet = new Set(selected);

  return (
    <div ref={ref} className="relative">
      {compact && <label className="text-[10px] text-slate-500 font-medium uppercase">Neighborhoods</label>}
      {!compact && <label className="block text-xs text-slate-500 font-medium mb-1">Neighborhoods</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-1.5 ${compact ? "px-2 py-1 min-h-[28px]" : "px-3 py-2.5 min-h-[42px]"} border border-slate-200 rounded${compact ? "" : "-lg"} bg-white ${sz} text-left transition-colors hover:border-slate-300`}
      >
        {selected.length > 0 ? (
          <span className="truncate font-medium text-indigo-700">
            {selected.length === 1 ? selected[0] : `${selected.length} neighborhoods`}
          </span>
        ) : (
          <span className="text-slate-400">All neighborhoods</span>
        )}
        <svg className={`${compact ? "w-3 h-3" : "w-4 h-4"} ml-auto text-slate-400 flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className={`absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 ${compact ? "max-h-64" : "max-h-80"} overflow-hidden flex flex-col`}>
          <div className="p-2 border-b border-slate-100">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search neighborhoods..."
              className={`w-full px-2.5 py-1.5 border border-slate-200 rounded ${sz} focus:outline-none focus:ring-1 focus:ring-blue-500`}
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <button
              onClick={() => { onChange(null); setSearch(""); }}
              className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 text-left border-b border-slate-100 font-medium"
            >
              Clear all ({selected.length})
            </button>
          )}
          {ntaList.length === 0 && (
            <p className={`px-3 py-4 ${sz} text-slate-400 text-center`}>Loading neighborhoods...</p>
          )}
          <div className="overflow-y-auto flex-1">
            {grouped.map(({ borough, neighborhoods }) => (
              <div key={borough}>
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 sticky top-0">
                  {borough}
                </div>
                {neighborhoods.map((n) => {
                  const isSelected = selectedSet.has(n.ntaName);
                  return (
                    <button
                      key={n.ntaName}
                      onClick={() => handleToggle(n)}
                      className={`w-full text-left px-3 py-1.5 ${sz} flex items-center gap-2 transition-colors ${
                        isSelected
                          ? "bg-indigo-50 text-indigo-700 font-medium"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-indigo-600 border-indigo-600" : "border-slate-300"
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span>{n.ntaName}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {grouped.length === 0 && ntaList.length > 0 && (
              <p className={`px-3 py-4 ${sz} text-slate-400 text-center`}>No neighborhoods match</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
