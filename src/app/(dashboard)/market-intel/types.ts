// Shared types for Market Intel — NO "use server" directive
// Consumers import types directly from this file

export type Market = "nyc" | "nys" | "nj";

export type MainTab =
  | "property"
  | "ownership"
  | "name"
  | "map"
  | "new-development"
  | "distressed"
  | "on-market";

export interface FilterState {
  // Core
  market: Market;
  tab: MainTab;
  query: string;

  // Shared filters
  minUnits: string;
  maxUnits: string;
  minValue: string;
  maxValue: string;
  minYearBuilt: string;
  maxYearBuilt: string;
  ownerName: string;

  // NYC-specific
  borough: string;
  neighborhoods: string; // comma-separated
  bldgClass: string; // comma-separated codes
  zoneDist: string;
  minFloors: string;
  excludePublic: string; // "1" or ""
  distressedOnly: string; // "1" or ""
  rentStabilized: string; // "1" or ""
  energyGrade: string; // comma-separated A/B/C/D/F

  // NYS-specific
  nysCounty: string;
  nysMunicipality: string;
  nysPropertyClass: string; // comma-separated

  // NJ-specific
  njCounty: string;
  njMunicipality: string;
  njPropertyClass: string; // comma-separated

  // Radius search
  radiusCenterLat: string;
  radiusCenterLng: string;
  radiusMiles: string;
  radiusAddress: string;
}

// Keys that get serialized to/from URL search params
export const URL_KEYS: (keyof FilterState)[] = [
  "market",
  "tab",
  "query",
  "minUnits",
  "maxUnits",
  "minValue",
  "maxValue",
  "minYearBuilt",
  "maxYearBuilt",
  "ownerName",
  "borough",
  "neighborhoods",
  "bldgClass",
  "zoneDist",
  "minFloors",
  "excludePublic",
  "distressedOnly",
  "rentStabilized",
  "energyGrade",
  "nysCounty",
  "nysMunicipality",
  "nysPropertyClass",
  "njCounty",
  "njMunicipality",
  "njPropertyClass",
  "radiusCenterLat",
  "radiusCenterLng",
  "radiusMiles",
  "radiusAddress",
];

// Human-readable labels for filter chips
export const FILTER_LABELS: Partial<Record<keyof FilterState, string>> = {
  minUnits: "Min Units",
  maxUnits: "Max Units",
  minValue: "Min Value",
  maxValue: "Max Value",
  minYearBuilt: "Min Year",
  maxYearBuilt: "Max Year",
  ownerName: "Owner",
  borough: "Borough",
  neighborhoods: "Neighborhoods",
  bldgClass: "Building Class",
  zoneDist: "Zoning",
  minFloors: "Min Floors",
  excludePublic: "Excl. Public",
  distressedOnly: "Distressed",
  rentStabilized: "Rent Stabilized",
  energyGrade: "Energy Grade",
  nysCounty: "County",
  nysMunicipality: "Municipality",
  nysPropertyClass: "Property Class",
  njCounty: "County",
  njMunicipality: "Municipality",
  njPropertyClass: "Property Class",
  radiusAddress: "Radius Search",
  radiusMiles: "Radius (mi)",
};

// Building class code → description
export const BUILDING_CLASS_DESCRIPTIONS: Record<string, string> = {
  A: "Walk-up Apartments",
  C: "Walk-up + Elevator",
  D: "Elevator Apartments",
  R: "Condominiums",
  S: "Mixed Residential/Commercial",
  O: "Office Buildings",
};

export type SortOption = "units" | "value" | "year" | "floors" | "relevance";

// Non-filter keys that should NOT count toward active filter count
const NON_FILTER_KEYS = new Set<keyof FilterState>([
  "market",
  "tab",
  "query",
]);

export function countActiveFilters(state: Partial<FilterState>): number {
  let count = 0;
  for (const [key, value] of Object.entries(state)) {
    if (NON_FILTER_KEYS.has(key as keyof FilterState)) continue;
    if (value && value !== "") count++;
  }
  return count;
}
