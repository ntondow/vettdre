"use client";

import { useState, useCallback } from "react";
import type { Market, MainTab, FilterState } from "../types";
import { BUILDING_CLASS_DESCRIPTIONS } from "../types";
import { getCounties, getMunicipalitiesByCounty } from "@/lib/neighborhoods-nys";
import { getNJCounties, getNJMunicipalitiesByCounty } from "@/lib/neighborhoods-nj";
import { geocodeAddress } from "../map-actions";
import { radiusToBoundingBox } from "@/lib/geo-utils";

interface FilterPanelProps {
  open: boolean;
  market: Market;
  tab: MainTab;
  filters: FilterState;
  onClose: () => void;
  onSetFilters: (updates: Partial<FilterState>) => void;
  onClearAll: () => void;
}

const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
const NYC_BLDG_CLASSES = ["A", "C", "D", "R", "S", "O"];
const NYS_PROPERTY_CLASSES = [
  { code: "210", label: "1-Family" },
  { code: "220", label: "2-Family" },
  { code: "230", label: "3-Family" },
  { code: "280", label: "Multi-Purpose" },
  { code: "411", label: "Apartments (4-6)" },
  { code: "414", label: "Living Accommodations" },
  { code: "480", label: "Multiple Res." },
  { code: "481", label: "Multi Res. (3+ fl)" },
];
const NJ_PROPERTY_CLASSES = [
  { code: "2", label: "Residential (4+)" },
  { code: "4A", label: "Commercial" },
  { code: "4C", label: "Apartment" },
];
const RADIUS_OPTIONS = [0.25, 0.5, 1, 2, 5];

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full h-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            prefix ? "pl-7 pr-3" : "px-3"
          }`}
        />
      </div>
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="">{placeholder || "All"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiCheckbox({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: string[];
  options: { code: string; label: string }[];
  onChange: (codes: string[]) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o.code} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-0.5">
            <input
              type="checkbox"
              checked={selected.includes(o.code)}
              onChange={(e) => {
                if (e.target.checked) onChange([...selected, o.code]);
                else onChange(selected.filter((c) => c !== o.code));
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              {o.code} — {o.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1">
      <div>
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {description && (
          <p className="text-[10px] text-slate-400">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </label>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-4 mb-2 first:mt-0">
      {title}
    </h3>
  );
}

export default function FilterPanel({
  open,
  market,
  tab,
  filters,
  onClose,
  onSetFilters,
  onClearAll,
}: FilterPanelProps) {
  const [radiusInput, setRadiusInput] = useState(filters.radiusAddress || "");
  const [geocoding, setGeocoding] = useState(false);

  const selectedBldgClasses = filters.bldgClass ? filters.bldgClass.split(",") : [];
  const selectedNysClasses = filters.nysPropertyClass ? filters.nysPropertyClass.split(",") : [];
  const selectedNjClasses = filters.njPropertyClass ? filters.njPropertyClass.split(",") : [];
  const selectedRadiusMiles = filters.radiusMiles ? parseFloat(filters.radiusMiles) : 0;

  const handleRadiusSearch = useCallback(async () => {
    if (!radiusInput.trim()) return;
    setGeocoding(true);
    try {
      const coords = await geocodeAddress(radiusInput.trim());
      if (coords) {
        onSetFilters({
          radiusCenterLat: String(coords.lat),
          radiusCenterLng: String(coords.lng),
          radiusMiles: selectedRadiusMiles > 0 ? String(selectedRadiusMiles) : "1",
          radiusAddress: radiusInput.trim(),
        });
      }
    } finally {
      setGeocoding(false);
    }
  }, [radiusInput, selectedRadiusMiles, onSetFilters]);

  const clearRadius = useCallback(() => {
    setRadiusInput("");
    onSetFilters({
      radiusCenterLat: "",
      radiusCenterLng: "",
      radiusMiles: "",
      radiusAddress: "",
    });
  }, [onSetFilters]);

  // Panel content (shared between desktop & mobile)
  const panelContent = (
    <div className="space-y-3 text-sm">
      {/* ---- Shared Filters ---- */}
      <SectionHeader title="General" />
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Min Units"
          value={filters.minUnits}
          onChange={(v) => onSetFilters({ minUnits: v })}
          placeholder="e.g. 5"
        />
        <NumberInput
          label="Max Units"
          value={filters.maxUnits}
          onChange={(v) => onSetFilters({ maxUnits: v })}
          placeholder="e.g. 100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Min Value"
          value={filters.minValue}
          onChange={(v) => onSetFilters({ minValue: v })}
          placeholder="e.g. 1000000"
          prefix="$"
        />
        <NumberInput
          label="Max Value"
          value={filters.maxValue}
          onChange={(v) => onSetFilters({ maxValue: v })}
          placeholder="e.g. 50000000"
          prefix="$"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Min Year Built"
          value={filters.minYearBuilt}
          onChange={(v) => onSetFilters({ minYearBuilt: v })}
          placeholder="e.g. 1950"
        />
        <NumberInput
          label="Max Year Built"
          value={filters.maxYearBuilt}
          onChange={(v) => onSetFilters({ maxYearBuilt: v })}
          placeholder="e.g. 2020"
        />
      </div>
      <NumberInput
        label="Owner Name"
        value={filters.ownerName}
        onChange={(v) => onSetFilters({ ownerName: v })}
        placeholder="e.g. Smith"
      />

      {/* ---- NYC-Specific ---- */}
      {market === "nyc" && (
        <>
          <SectionHeader title="NYC Filters" />
          <SelectInput
            label="Borough"
            value={filters.borough}
            onChange={(v) =>
              onSetFilters({ borough: v, neighborhoods: "" })
            }
            options={BOROUGHS.map((b) => ({ value: b, label: b }))}
            placeholder="All Boroughs"
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Zoning District</label>
            <input
              type="text"
              value={filters.zoneDist}
              onChange={(e) => onSetFilters({ zoneDist: e.target.value })}
              placeholder="e.g. R7, C4, M1"
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <NumberInput
            label="Min Floors"
            value={filters.minFloors}
            onChange={(v) => onSetFilters({ minFloors: v })}
            placeholder="e.g. 5"
          />
          <MultiCheckbox
            label="Building Class"
            selected={selectedBldgClasses}
            options={NYC_BLDG_CLASSES.map((c) => ({
              code: c,
              label: BUILDING_CLASS_DESCRIPTIONS[c] || c,
            }))}
            onChange={(codes) =>
              onSetFilters({ bldgClass: codes.join(",") })
            }
          />
          <ToggleSwitch
            label="Exclude Public Housing"
            checked={filters.excludePublic === "1"}
            onChange={(v) =>
              onSetFilters({ excludePublic: v ? "1" : "" })
            }
          />
          <ToggleSwitch
            label="Distressed Only"
            description="RPIE non-compliant properties"
            checked={filters.distressedOnly === "1"}
            onChange={(v) =>
              onSetFilters({ distressedOnly: v ? "1" : "" })
            }
          />
          <ToggleSwitch
            label="Rent Stabilized"
            checked={filters.rentStabilized === "1"}
            onChange={(v) =>
              onSetFilters({ rentStabilized: v ? "1" : "" })
            }
          />
        </>
      )}

      {/* ---- NYS-Specific ---- */}
      {market === "nys" && (
        <>
          <SectionHeader title="NYS Filters" />
          <SelectInput
            label="County"
            value={filters.nysCounty}
            onChange={(v) =>
              onSetFilters({ nysCounty: v, nysMunicipality: "" })
            }
            options={getCounties().map((c) => ({
              value: c.name,
              label: c.name,
            }))}
            placeholder="All Counties"
          />
          <SelectInput
            label="Municipality"
            value={filters.nysMunicipality}
            onChange={(v) => onSetFilters({ nysMunicipality: v })}
            options={
              filters.nysCounty
                ? getMunicipalitiesByCounty(filters.nysCounty).map((m) => ({
                    value: m.name,
                    label: `${m.name} (${m.type})`,
                  }))
                : []
            }
            disabled={!filters.nysCounty}
            placeholder="All"
          />
          <MultiCheckbox
            label="Property Class"
            selected={selectedNysClasses}
            options={NYS_PROPERTY_CLASSES}
            onChange={(codes) =>
              onSetFilters({ nysPropertyClass: codes.join(",") })
            }
          />
        </>
      )}

      {/* ---- NJ-Specific ---- */}
      {market === "nj" && (
        <>
          <SectionHeader title="NJ Filters" />
          <SelectInput
            label="County"
            value={filters.njCounty}
            onChange={(v) =>
              onSetFilters({ njCounty: v, njMunicipality: "" })
            }
            options={getNJCounties().map((c) => ({
              value: c,
              label: c,
            }))}
            placeholder="All Counties"
          />
          <SelectInput
            label="Municipality"
            value={filters.njMunicipality}
            onChange={(v) => onSetFilters({ njMunicipality: v })}
            options={
              filters.njCounty
                ? getNJMunicipalitiesByCounty(filters.njCounty).map((m) => ({
                    value: m.name,
                    label: m.name,
                  }))
                : []
            }
            disabled={!filters.njCounty}
            placeholder="All"
          />
          <MultiCheckbox
            label="Property Class"
            selected={selectedNjClasses}
            options={NJ_PROPERTY_CLASSES}
            onChange={(codes) =>
              onSetFilters({ njPropertyClass: codes.join(",") })
            }
          />
        </>
      )}

      {/* ---- Radius Search ---- */}
      {market !== "nys" && (
        <>
          <SectionHeader title="Radius Search" />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Center Address</label>
            <input
              type="text"
              value={radiusInput}
              onChange={(e) => setRadiusInput(e.target.value)}
              placeholder="e.g. 123 Atlantic Ave Brooklyn"
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRadiusSearch();
                }
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Radius (miles)</label>
            <div className="flex gap-1">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    onSetFilters({ radiusMiles: String(r) })
                  }
                  className={`flex-1 h-8 text-xs font-medium rounded-md transition-colors ${
                    selectedRadiusMiles === r
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleRadiusSearch}
            disabled={geocoding || !radiusInput.trim()}
            className="w-full h-9 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {geocoding ? "Geocoding..." : "Search Radius"}
          </button>
          {filters.radiusAddress && (
            <button
              onClick={clearRadius}
              className="w-full text-xs text-red-600 hover:text-red-700 font-medium"
            >
              Clear Radius Search
            </button>
          )}
        </>
      )}

      {/* Clear All */}
      <div className="pt-2 border-t border-slate-200">
        <button
          onClick={onClearAll}
          className="w-full h-9 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
        >
          Clear All Filters
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div
        className={`hidden md:block fixed top-0 left-60 bottom-0 z-40 w-72 bg-white border-r border-slate-200 shadow-lg transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ top: "0", paddingTop: "0" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Filters</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-49px)] px-4 py-3">
          {panelContent}
        </div>
      </div>

      {/* Mobile full-screen sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={onClose}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-hidden"
            style={{ animation: "slide-up-sheet 0.3s ease-out" }}
          >
            <div className="flex items-center justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">Filters</h2>
              <button
                onClick={onClose}
                className="text-sm font-semibold text-blue-600"
              >
                Done
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3 pb-safe" style={{ maxHeight: "calc(85vh - 80px)" }}>
              {panelContent}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
