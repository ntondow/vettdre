"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Search, X, Loader2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────

export type SearchType = "address" | "bbl" | "entity" | "name" | "zip" | "none";

export interface SearchSubmitEvent {
  query: string;
  type: SearchType;
}

interface GeoSearchSuggestion {
  label: string;
  bbl?: string;
  lat?: number;
  lng?: number;
}

interface Props {
  onSubmit: (event: SearchSubmitEvent) => void;
  loading?: boolean;
  initialQuery?: string;
}

// ── Detection Logic ──────────────────────────────────────────

const STREET_TYPES = /\b(st|street|ave|avenue|blvd|boulevard|dr|drive|pl|place|rd|road|way|ln|lane|ct|court|pkwy|ter|terrace)\b/i;
const ENTITY_SUFFIXES = /\b(llc|inc|corp|lp|trust|assoc|co|ltd|group|holdings|partners|properties|realty|management|development)\b/i;

export function detectSearchType(query: string): SearchType {
  const trimmed = query.trim();
  if (!trimmed) return "none";

  // BBL: "1-00123-0045" or 10 digits
  if (/^\d{1}-\d{5}-\d{4}$/.test(trimmed) || /^\d{10}$/.test(trimmed)) return "bbl";

  // ZIP: exactly 5 digits
  if (/^\d{5}$/.test(trimmed)) return "zip";

  // Address: starts with a number, contains street type or long enough
  if (/^\d/.test(trimmed) && (STREET_TYPES.test(trimmed) || trimmed.length > 5)) return "address";

  // Entity: corporate suffixes
  if (ENTITY_SUFFIXES.test(trimmed)) return "entity";

  // Default: name
  return "name";
}

// ── Type Badge Config ────────────────────────────────────────

const TYPE_BADGES: Record<SearchType, { label: string; color: string } | null> = {
  none: null,
  address: { label: "Address", color: "bg-blue-100 text-blue-700" },
  bbl: { label: "BBL", color: "bg-violet-100 text-violet-700" },
  entity: { label: "Entity", color: "bg-amber-100 text-amber-700" },
  name: { label: "Owner", color: "bg-emerald-100 text-emerald-700" },
  zip: { label: "ZIP", color: "bg-slate-200 text-slate-700" },
};

// ── Component ────────────────────────────────────────────────

export default function UnifiedSearchBar({ onSubmit, loading, initialQuery }: Props) {
  const [query, setQuery] = useState(initialQuery || "");
  const [detectedType, setDetectedType] = useState<SearchType>("none");
  const [suggestions, setSuggestions] = useState<GeoSearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent searches
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("vettdre_mi_recent");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  // Keyboard shortcut: / or Cmd+K to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Click outside to close suggestions
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Update detection as user types
  const handleChange = useCallback((value: string) => {
    setQuery(value);
    const type = detectSearchType(value);
    setDetectedType(type);
    setHighlightedIndex(-1);

    // Typeahead for addresses
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (type === "address" && value.trim().length >= 3) {
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://geosearch.planninglabs.nyc/v2/autocomplete?text=${encodeURIComponent(value.trim())}&focus.point.lat=40.7128&focus.point.lon=-73.9560&size=5`,
          );
          if (!res.ok) return;
          const data = await res.json();
          const items: GeoSearchSuggestion[] = (data.features || []).map((f: any) => ({
            label: f.properties?.label || f.properties?.name || "",
            bbl: f.properties?.addendum?.pad?.bbl || undefined,
            lat: f.geometry?.coordinates?.[1],
            lng: f.geometry?.coordinates?.[0],
          }));
          setSuggestions(items);
          setShowSuggestions(items.length > 0);
        } catch {
          setSuggestions([]);
        }
      }, 300);
    } else if (!value.trim()) {
      // Show recent searches when input is empty
      setSuggestions([]);
      setShowSuggestions(recentSearches.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [recentSearches]);

  // Submit handler
  const handleSubmit = useCallback((q?: string) => {
    const submitQuery = q || query;
    if (!submitQuery.trim()) return;

    const type = detectSearchType(submitQuery);
    setShowSuggestions(false);

    // Save to recent
    const updated = [submitQuery, ...recentSearches.filter((r) => r !== submitQuery)].slice(0, 5);
    setRecentSearches(updated);
    try { sessionStorage.setItem("vettdre_mi_recent", JSON.stringify(updated)); } catch {}

    onSubmit({ query: submitQuery.trim(), type });
  }, [query, recentSearches, onSubmit]);

  // Suggestion click
  const handleSuggestionClick = useCallback((suggestion: GeoSearchSuggestion) => {
    setQuery(suggestion.label);
    setShowSuggestions(false);
    handleSubmit(suggestion.label);
  }, [handleSubmit]);

  // Recent search click
  const handleRecentClick = useCallback((q: string) => {
    setQuery(q);
    setShowSuggestions(false);
    handleSubmit(q);
  }, [handleSubmit]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = suggestions.length > 0 ? suggestions : recentSearches.map((r) => ({ label: r }));
    if (!showSuggestions || items.length === 0) {
      if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < items.length) {
        const item = items[highlightedIndex];
        if ("bbl" in item) handleSuggestionClick(item as GeoSearchSuggestion);
        else handleRecentClick(item.label);
      } else {
        handleSubmit();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  }, [showSuggestions, suggestions, recentSearches, highlightedIndex, handleSubmit, handleSuggestionClick, handleRecentClick]);

  const clear = () => {
    setQuery("");
    setDetectedType("none");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const badge = TYPE_BADGES[detectedType];

  return (
    <div ref={containerRef} className="relative w-full max-w-[540px]">
      {/* Search input */}
      <div className="flex items-center bg-white rounded-xl shadow-lg border border-slate-200/60 h-12 px-3 gap-2">
        {loading ? (
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin flex-shrink-0" />
        ) : (
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (!query.trim() && recentSearches.length > 0) setShowSuggestions(true);
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search address, BBL, owner, or entity..."
          className="flex-1 h-full bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 outline-none"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Type badge */}
        {badge && query.trim() && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.color}`}>
            {badge.label}
          </span>
        )}

        {/* Clear button */}
        {query && (
          <button onClick={clear} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggestions / Recent dropdown */}
      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200/60 overflow-hidden z-10">
          {suggestions.length > 0 ? (
            suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={() => handleSuggestionClick(s)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  i === highlightedIndex ? "bg-blue-50 text-blue-900" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {s.label}
              </button>
            ))
          ) : (
            // Recent searches
            <>
              <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Recent Searches
              </p>
              {recentSearches.map((r, i) => (
                <button
                  key={r}
                  onMouseDown={() => handleRecentClick(r)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    i === highlightedIndex ? "bg-blue-50 text-blue-900" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
