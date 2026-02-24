"use client";

import type { FilterState } from "../types";
import { FILTER_LABELS } from "../types";

interface FilterChipsProps {
  filters: FilterState;
  activeFilterCount: number;
  onClearFilter: (key: keyof FilterState) => void;
  onClearAll: () => void;
}

// Keys that should NOT be shown as chips
const HIDDEN_KEYS = new Set<string>([
  "market",
  "tab",
  "query",
  "radiusCenterLat",
  "radiusCenterLng",
]);

function formatValue(key: string, value: string): string {
  if (key === "minValue" || key === "maxValue" || key === "minMarketValue" || key === "maxMarketValue") {
    const n = parseInt(value);
    if (!isNaN(n)) return "$" + n.toLocaleString();
  }
  if (key === "excludePublic") return "Yes";
  if (key === "distressedOnly") return "Yes";
  if (key === "rentStabilized") return "Yes";
  if (key === "radiusMiles") return `${value} mi`;
  return value;
}

export default function FilterChips({
  filters,
  activeFilterCount,
  onClearFilter,
  onClearAll,
}: FilterChipsProps) {
  if (activeFilterCount === 0) return null;

  const chips: { key: keyof FilterState; label: string; value: string }[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (HIDDEN_KEYS.has(key)) continue;
    if (!value || value === "") continue;
    const label = FILTER_LABELS[key as keyof FilterState] || key;
    chips.push({
      key: key as keyof FilterState,
      label,
      value: formatValue(key, value),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-4 md:px-8">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
        >
          {chip.label}: {chip.value}
          <button
            onClick={() => onClearFilter(chip.key)}
            className="ml-0.5 hover:text-blue-900 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {chips.length >= 2 && (
        <button
          onClick={onClearAll}
          className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap font-medium"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
