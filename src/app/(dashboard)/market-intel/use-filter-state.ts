"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { FilterState, Market, MainTab } from "./types";
import { URL_KEYS, countActiveFilters } from "./types";

const DEFAULTS: FilterState = {
  market: "nyc",
  tab: "map",
  query: "",
  minUnits: "",
  maxUnits: "",
  minValue: "",
  maxValue: "",
  minYearBuilt: "",
  maxYearBuilt: "",
  ownerName: "",
  borough: "",
  neighborhoods: "",
  bldgClass: "",
  zoneDist: "",
  minFloors: "",
  excludePublic: "",
  distressedOnly: "",
  rentStabilized: "",
  energyGrade: "",
  nysCounty: "",
  nysMunicipality: "",
  nysPropertyClass: "",
  njCounty: "",
  njMunicipality: "",
  njPropertyClass: "",
  radiusCenterLat: "",
  radiusCenterLng: "",
  radiusMiles: "",
  radiusAddress: "",
};

export function parseSearchParams(
  searchParams: URLSearchParams,
): Partial<FilterState> {
  const state: Partial<FilterState> = {};
  for (const key of URL_KEYS) {
    const val = searchParams.get(key);
    if (val !== null && val !== "") {
      (state as any)[key] = val;
    }
  }
  return state;
}

export function useFilterState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const parsed = useMemo(
    () => parseSearchParams(searchParams),
    [searchParams],
  );

  // Merged with defaults
  const filters: FilterState = useMemo(
    () => ({ ...DEFAULTS, ...parsed }),
    [parsed],
  );

  const market = filters.market as Market;
  const tab = filters.tab as MainTab;

  const setFilters = useCallback(
    (updates: Partial<FilterState>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const clearFilter = useCallback(
    (key: keyof FilterState) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(key);
      // If clearing radius address, also clear lat/lng/miles
      if (key === "radiusAddress" || key === "radiusMiles") {
        params.delete("radiusCenterLat");
        params.delete("radiusCenterLng");
        params.delete("radiusMiles");
        params.delete("radiusAddress");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep market and tab
    if (filters.market !== "nyc") params.set("market", filters.market);
    if (filters.tab !== "map") params.set("tab", filters.tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters.market, filters.tab, router, pathname]);

  const setMarket = useCallback(
    (m: Market) => {
      const params = new URLSearchParams();
      if (m !== "nyc") params.set("market", m);
      params.set("tab", "property");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname],
  );

  const setTab = useCallback(
    (t: MainTab) => {
      setFilters({ tab: t });
    },
    [setFilters],
  );

  const activeFilterCount = useMemo(
    () => countActiveFilters(parsed),
    [parsed],
  );

  return {
    filters,
    market,
    tab,
    setFilters,
    clearFilter,
    clearAllFilters,
    setMarket,
    setTab,
    activeFilterCount,
  };
}
