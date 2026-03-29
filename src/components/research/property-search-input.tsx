"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Building2, MapPin, X, Loader2 } from "lucide-react";
import { searchAddresses } from "@/app/(dashboard)/market-intel/actions";
import type { AddressSuggestion } from "@/app/(dashboard)/market-intel/actions";

// ── Types ────────────────────────────────────────────────────

export interface PropertySelection {
  address: string;
  borough: string;
  boroCode: string;
  block: string;
  lot: string;
  bbl: string;
  zip: string;
  unitsRes: number;
  yearBuilt: number;
  numFloors: number;
  bldgClass: string;
  ownerName: string;
  assessTotal: number;
  bldgArea: number;
  lotArea: number;
  zoneDist: string;
}

interface PropertySearchInputProps {
  /** Called when a property is selected from search results or BBL lookup */
  onSelect: (property: PropertySelection) => void;
  /** Optional initial BBL to auto-search on mount */
  initialBbl?: string | null;
  /** Show the building info banner below the search input */
  showBanner?: boolean;
  /** Currently selected property (to display in banner) */
  selected?: PropertySelection | null;
  /** Allow clearing the selection */
  onClear?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Light or dark theme */
  theme?: "dark" | "light";
  /** Loading state passed from parent */
  loading?: boolean;
}

// ── Component ────────────────────────────────────────────────

export default function PropertySearchInput({
  onSelect,
  initialBbl,
  showBanner = true,
  selected,
  onClear,
  placeholder = "Search by address or BBL (e.g., 730 Manhattan Ave or 3005010001)",
  theme = "dark",
  loading: externalLoading,
}: PropertySearchInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [bblLoading, setBblLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isLoading = searching || bblLoading || externalLoading;
  const isDark = theme === "dark";

  // Auto-search on initial BBL
  useEffect(() => {
    if (initialBbl && !selected) {
      const normalized = initialBbl.replace(/[-\s]/g, "");
      if (/^\d{10}$/.test(normalized)) {
        setQuery(normalized);
        handleSearch(normalized);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBbl]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    // Check if it's a BBL (10-digit number or B-Block-Lot pattern)
    const isBbl = /^\d{10}$/.test(trimmed.replace(/[-\s]/g, "")) || /^\d[\s-]?\d{1,5}[\s-]?\d{1,4}$/.test(trimmed);

    setSearching(true);
    try {
      const results = await searchAddresses(trimmed);
      if (results.length === 1 && isBbl) {
        // Direct BBL hit — auto-select
        handleSelect(results[0]);
        setSuggestions([]);
        setShowDropdown(false);
      } else if (results.length > 0) {
        setSuggestions(results);
        setShowDropdown(true);
      } else {
        setSuggestions([]);
        setShowDropdown(true); // Show "no results"
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 300);
  };

  const handleSelect = (suggestion: AddressSuggestion) => {
    const bbl = suggestion.boroCode + suggestion.block.padStart(5, "0") + suggestion.lot.padStart(4, "0");
    const property: PropertySelection = {
      address: suggestion.address,
      borough: suggestion.borough,
      boroCode: suggestion.boroCode,
      block: suggestion.block,
      lot: suggestion.lot,
      bbl,
      zip: suggestion.zip,
      unitsRes: suggestion.unitsRes,
      yearBuilt: suggestion.yearBuilt,
      numFloors: suggestion.numFloors,
      bldgClass: suggestion.bldgClass,
      ownerName: suggestion.ownerName,
      assessTotal: suggestion.assessTotal,
      bldgArea: suggestion.bldgArea,
      lotArea: suggestion.lotArea,
      zoneDist: suggestion.zoneDist,
    };
    setQuery(suggestion.address);
    setShowDropdown(false);
    setSuggestions([]);
    onSelect(property);
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setShowDropdown(false);
    onClear?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch(query);
    }
    if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  // ── Styles ──────────────────────────────────────────────────

  const inputBg = isDark ? "bg-white/5" : "bg-white";
  const inputBorder = isDark ? "border-white/10" : "border-slate-200";
  const inputText = isDark ? "text-white placeholder-slate-600" : "text-slate-900 placeholder-slate-400";
  const inputFocus = isDark ? "focus:ring-blue-500/30 focus:border-blue-500/50" : "focus:ring-blue-500/20 focus:border-blue-400";
  const dropdownBg = isDark ? "bg-[#161B2E] border-white/10" : "bg-white border-slate-200";
  const iconColor = isDark ? "text-slate-500" : "text-slate-400";

  return (
    <div ref={containerRef} className="relative">
      {/* Search Input */}
      <div className="relative">
        {isLoading ? (
          <Loader2 className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${iconColor} animate-spin`} />
        ) : (
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${iconColor}`} />
        )}
        <input
          type="text"
          value={query}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          className={`w-full ${inputBg} border ${inputBorder} rounded-lg pl-10 ${selected || query ? "pr-9" : "pr-3"} py-2.5 text-base sm:text-sm ${inputText} focus:outline-none focus:ring-2 ${inputFocus} transition-colors`}
        />
        {(selected || query) && (
          <button
            onClick={handleClear}
            className={`absolute right-3 top-1/2 -translate-y-1/2 ${iconColor} hover:text-slate-300 transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className={`absolute z-50 w-full mt-1 ${dropdownBg} border rounded-xl shadow-xl max-h-80 overflow-y-auto`}>
          {suggestions.length === 0 && !searching && (
            <div className={`px-4 py-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              No properties found
            </div>
          )}
          {suggestions.map((s, idx) => {
            const bbl = s.boroCode + s.block.padStart(5, "0") + s.lot.padStart(4, "0");
            return (
              <button
                key={`${bbl}-${idx}`}
                onClick={() => handleSelect(s)}
                className={`w-full text-left px-4 py-3 ${isDark ? "hover:bg-white/5" : "hover:bg-slate-50"} transition-colors ${idx > 0 ? (isDark ? "border-t border-white/5" : "border-t border-slate-100") : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                      {s.address}, {s.borough}
                    </p>
                    <div className={`flex items-center gap-2 mt-0.5 text-[11px] ${isDark ? "text-slate-500" : "text-slate-400"} flex-wrap`}>
                      {s.unitsRes > 0 && <span>{s.unitsRes} units</span>}
                      {s.numFloors > 0 && <span>{s.numFloors} floors</span>}
                      {s.yearBuilt > 0 && <span>Built {s.yearBuilt}</span>}
                      <span className="opacity-60">{bbl}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Building Info Banner */}
      {showBanner && selected && (
        <div className={`mt-3 ${isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50 border-blue-100"} border rounded-lg px-3 py-2.5`}>
          <div className="flex items-start gap-2">
            <Building2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                {selected.address}, {selected.borough}
              </p>
              <div className={`flex items-center gap-3 mt-1 text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"} flex-wrap`}>
                {selected.unitsRes > 0 && <span>{selected.unitsRes} units</span>}
                {selected.numFloors > 0 && <span>{selected.numFloors} floors</span>}
                {selected.yearBuilt > 0 && <span>Built {selected.yearBuilt}</span>}
                {selected.bldgClass && <span>{selected.bldgClass}</span>}
                {selected.ownerName && <span className={isDark ? "text-slate-500" : "text-slate-400"}>{selected.ownerName}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
