"use client";

import { useState, useRef, useEffect } from "react";
import { getNeighborhoodsByBorough } from "@/lib/neighborhoods";

interface NeighborhoodDropdownProps {
  borough: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  compact?: boolean;
}

export default function NeighborhoodDropdown({ borough, selected, onChange, compact }: NeighborhoodDropdownProps) {
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

  useEffect(() => {
    setSearch("");
  }, [borough]);

  const neighborhoods = borough ? getNeighborhoodsByBorough(borough) : [];
  const filtered = search
    ? neighborhoods.filter(n => n.name.toLowerCase().includes(search.toLowerCase()))
    : neighborhoods;

  const triggerClass = compact
    ? `w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white cursor-pointer flex items-center gap-1 min-h-[28px] ${!borough ? "text-slate-400" : "text-slate-700"}`
    : `w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white cursor-pointer flex items-center gap-1 min-h-[42px] ${!borough ? "text-slate-400" : "text-slate-700"}`;

  return (
    <div ref={ref} className="relative">
      {!compact && <label className="block text-sm font-medium text-slate-700 mb-1">Neighborhood</label>}
      {compact && <label className="text-[10px] text-slate-500 font-medium uppercase">Neighborhood</label>}
      <div
        onClick={() => borough && setOpen(!open)}
        className={triggerClass}
      >
        {!borough ? (
          <span className={compact ? "text-slate-400" : ""}>Select borough first</span>
        ) : selected.length === 0 ? (
          <span className="text-slate-400">Any</span>
        ) : selected.length <= 2 ? (
          <span className="truncate">{selected.join(", ")}</span>
        ) : (
          <span>{selected.length} selected</span>
        )}
        <svg className={`${compact ? "w-3 h-3" : "w-4 h-4"} ml-auto text-slate-400 flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </div>
      {open && borough && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search neighborhoods..."
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 text-left border-b border-slate-100">
              Clear all ({selected.length})
            </button>
          )}
          <div className="overflow-y-auto max-h-48">
            {filtered.map(n => (
              <label key={n.name} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(n.name)}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...selected, n.name]);
                    else onChange(selected.filter(s => s !== n.name));
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
      )}
    </div>
  );
}
