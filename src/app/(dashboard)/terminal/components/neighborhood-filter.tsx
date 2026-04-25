"use client";

import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";

interface NeighborhoodCount {
  nta: string;
  name: string;
  count: number;
}

interface Props {
  neighborhoods: NeighborhoodCount[];
  selectedNtas: string[];
  onToggle: (nta: string) => void;
}

export default function NeighborhoodFilter({ neighborhoods, selectedNtas, onToggle }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return neighborhoods;
    const q = search.toLowerCase();
    return neighborhoods.filter((n) => n.name.toLowerCase().includes(q) || n.nta.toLowerCase().includes(q));
  }, [neighborhoods, search]);

  if (neighborhoods.length === 0) return null;

  return (
    <div className="p-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[#8B949E] mb-2">Neighborhoods</h2>

      {/* Search input */}
      {neighborhoods.length > 6 && (
        <div className="relative mb-2">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#484F58]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter neighborhoods..."
            aria-label="Filter neighborhoods"
            className="w-full bg-[#161B22] border border-[#21262D] rounded text-[11px] text-[#E6EDF3] placeholder-[#484F58] pl-6 pr-6 py-1 outline-none focus:border-[#0A84FF] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#484F58] hover:text-[#8B949E]"
              aria-label="Clear search"
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}

      {/* "All" toggle when some are selected */}
      {selectedNtas.length > 0 && (
        <button
          onClick={() => { for (const n of selectedNtas) onToggle(n); }}
          className="w-full text-left px-2 py-1 text-[10px] text-[#0A84FF] hover:text-[#4DA3FF] transition-colors mb-0.5"
        >
          Clear filter ({selectedNtas.length} selected)
        </button>
      )}

      <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
        {filtered.map((n) => {
          const active = selectedNtas.includes(n.nta);
          return (
            <button
              key={n.nta}
              onClick={() => onToggle(n.nta)}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] transition-colors ${
                active ? "bg-[#1C2333] text-[#E6EDF3]" : "text-[#8B949E] hover:bg-[#161B22]"
              }`}
              aria-pressed={active}
            >
              <span className="truncate">{n.name}</span>
              <span className="text-[10px] font-mono bg-[#21262D] px-1.5 py-0.5 rounded ml-1 shrink-0">
                {n.count}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && search && (
          <p className="text-[10px] text-[#8B949E] py-2 text-center">No matches</p>
        )}
      </div>
    </div>
  );
}
