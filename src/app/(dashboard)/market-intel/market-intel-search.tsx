"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useFilterState } from "./use-filter-state";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission, getRequiredPlan } from "@/lib/feature-gate";
import Paywall from "@/components/ui/paywall";
import dynamic from "next/dynamic";

// Sub-components
import MarketIntelHeader from "./components/market-intel-header";
import FilterChips from "./components/filter-chips";
import FilterPanel from "./components/filter-panel";
import UnifiedSearch from "./unified-search";
import OnMarketSearch from "./components/on-market-search";
import NysPropertySearch from "./components/nys-property-search";
import NjPropertySearch from "./components/nj-property-search";
import RecentActivityWidget from "./recent-activity-widget";

// Three-zone layout components
import UnifiedSearchBar from "./components/unified-search-bar";
import type { SearchSubmitEvent } from "./components/unified-search-bar";
import ResultsPanel from "./components/results-panel";
import ProfilePanel from "./components/profile-panel";
import BuildingProfile from "./building-profile";
import type { PlutoDataProp } from "./building-profile";
import { unifiedSearch } from "./unified-search-actions";
import type { SearchResult, UnifiedSearchResult } from "./unified-search-actions";
import type { MapProperty } from "./map-search";

// Map components — dynamic imports (no SSR)
const MapSearch = dynamic(() => import("./map-search"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-100">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
    </div>
  ),
});
const NJMapSearch = dynamic(() => import("./nj-map-search"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-100">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-green-600 border-t-transparent" />
    </div>
  ),
});

// ── Helpers ──────────────────────────────────────────────────

function searchResultToBbl(r: SearchResult): string {
  return `${r.boroCode}${r.block.padStart(5, "0")}${r.lot.padStart(4, "0")}`;
}

function mapPropertyToPlutoData(p: MapProperty): PlutoDataProp {
  return {
    address: p.address, ownerName: p.ownerName, unitsRes: p.unitsRes, unitsTot: p.unitsTot,
    yearBuilt: p.yearBuilt, numFloors: p.numFloors, bldgArea: p.bldgArea, lotArea: p.lotArea,
    assessTotal: p.assessTotal, bldgClass: p.bldgClass, zoneDist: p.zoneDist, borough: p.borough,
    zip: p.zip, lat: p.lat, lng: p.lng,
  };
}

function searchResultToPlutoData(r: SearchResult): PlutoDataProp {
  return {
    address: r.address, ownerName: r.ownerName, unitsRes: r.units, unitsTot: r.units,
    yearBuilt: r.yearBuilt, numFloors: r.floors, bldgArea: r.sqft, lotArea: r.lotArea,
    assessTotal: r.assessedValue, bldgClass: r.buildingClass, zoneDist: r.zoning,
    borough: r.borough, zip: r.zip, lat: r.lat, lng: r.lng,
  };
}

// ── Main Component ──────────────────────────────────────────

export default function MarketIntelSearch() {
  const { plan, userId, searchesRemaining } = useUserPlan();
  const {
    filters,
    market,
    tab,
    setFilters,
    clearFilter,
    clearAllFilters,
    setMarket,
    setTab,
    activeFilterCount,
  } = useFilterState();

  // Global state
  const [paywallFeature, setPaywallFeature] = useState<string | null>(null);
  const [searchLimitModal, setSearchLimitModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Three-zone state (NYC map tab)
  const [searchResult, setSearchResult] = useState<UnifiedSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedBbl, setSelectedBbl] = useState<string | null>(null);
  const [hoveredBbl, setHoveredBbl] = useState<string | null>(null);

  // Profile panel state
  const [profileBuilding, setProfileBuilding] = useState<{
    boroCode: string; block: string; lot: string;
    address: string; borough: string; ownerName?: string;
    plutoData?: PlutoDataProp;
  } | null>(null);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [primaryPhone, setPrimaryPhone] = useState<string | null>(null);

  // Map control
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // Track search query for search bar initial value
  const [lastQuery, setLastQuery] = useState("");

  useEffect(() => {
    if (plan === "free" && !localStorage.getItem("vettdre_welcome_dismissed")) {
      setShowWelcome(true);
    }
  }, [plan]);

  // ── Search handler ──────────────────────────────────────────

  const handleUnifiedSearch = useCallback(async (event: SearchSubmitEvent) => {
    const q = event.query;
    if (!q) return;

    setLastQuery(q);
    setSearchLoading(true);
    setShowResults(true);
    setProfileBuilding(null); // close profile when new search starts
    setProfileExpanded(false);

    try {
      const result = await unifiedSearch(q, {}, 0, 100);
      setSearchResult(result);

      // Fly map to first result with coordinates
      const first = result.results.find((r) => r.lat && r.lng);
      if (first) {
        const zoom = result.results.length === 1 ? 17 : 15;
        setFlyTo({ lat: first.lat, lng: first.lng, zoom });
      }
    } catch {
      setSearchResult({ results: [], total: 0, queryType: "fuzzy", suggestion: "Search failed. Try again." });
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // ── Building select (from results panel click) ──────────────

  const handleBuildingSelectFromResults = useCallback((r: SearchResult) => {
    const bbl = searchResultToBbl(r);
    setSelectedBbl(bbl);
    setProfileBuilding({
      boroCode: r.boroCode,
      block: r.block,
      lot: r.lot,
      address: r.address,
      borough: r.borough,
      ownerName: r.ownerName,
      plutoData: searchResultToPlutoData(r),
    });
    setProfileExpanded(false);
    setPrimaryPhone(null);

    // Fly map to this building
    if (r.lat && r.lng) {
      setFlyTo({ lat: r.lat, lng: r.lng, zoom: 17 });
    }
  }, []);

  // ── Building select (from map marker click) ─────────────────

  const handleBuildingSelectFromMap = useCallback((p: MapProperty) => {
    if (!p.block || !p.lot) {
      console.warn("[MarketIntel] handleBuildingSelectFromMap called with missing block/lot:", p);
      return;
    }
    const bbl = `${p.boroCode}${p.block.padStart(5, "0")}${p.lot.padStart(4, "0")}`;
    setSelectedBbl(bbl);
    setProfileBuilding({
      boroCode: p.boroCode,
      block: p.block,
      lot: p.lot,
      address: p.address,
      borough: p.borough,
      ownerName: p.ownerName,
      plutoData: mapPropertyToPlutoData(p),
    });
    setProfileExpanded(false);
    setPrimaryPhone(null);
  }, []);

  // ── Name click (owner name → new search) ────────────────────

  const handleNameClick = useCallback((name: string) => {
    // If on map tab with three-zone layout, do a new unified search
    if (market === "nyc" && tab === "map") {
      setLastQuery(name);
      handleUnifiedSearch({ query: name, type: "name" });
      return;
    }
    // Otherwise use filter-based navigation (legacy)
    setFilters({ query: name, tab: "search" });
  }, [market, tab, handleUnifiedSearch, setFilters]);

  // ── Close handlers ──────────────────────────────────────────

  const handleCloseResults = useCallback(() => {
    setShowResults(false);
    setSearchResult(null);
    setSelectedBbl(null);
  }, []);

  const handleCloseProfile = useCallback(() => {
    setProfileBuilding(null);
    setProfileExpanded(false);
    setSelectedBbl(null);
    setPrimaryPhone(null);
  }, []);

  // ── Is three-zone layout active? ───────────────────────────

  const isThreeZone = market === "nyc" && tab === "map";

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className={isThreeZone ? "flex-1 min-h-0 overflow-hidden flex flex-col bg-slate-50" : "min-h-screen bg-slate-50"}>
      {/* Recent activity widget — only for non-map tabs */}
      {!isThreeZone && (
        <div className="px-4 md:px-8 pt-4">
          <RecentActivityWidget />
        </div>
      )}

      {/* Header + filter popover wrapper */}
      <div className={`relative z-20${isThreeZone ? " shrink-0" : ""}`}>
        <MarketIntelHeader
          market={market}
          mainTab={tab}
          plan={plan}
          activeFilterCount={activeFilterCount}
          onMarketChange={(m) => {
            if (m === "nys" && !hasPermission(plan, "market_nys")) {
              setPaywallFeature("market_nys");
              return;
            }
            if (m === "nj" && !hasPermission(plan, "market_nj")) {
              setPaywallFeature("market_nj");
              return;
            }
            setMarket(m);
            // Reset three-zone state on market change
            setShowResults(false);
            setSearchResult(null);
            setProfileBuilding(null);
          }}
          onTabChange={(t) => {
            if (t === "map" && !hasPermission(plan, "map_search")) {
              setPaywallFeature("map_search");
              return;
            }
            setTab(t);
            // Reset three-zone state on tab change
            if (t !== "map") {
              setShowResults(false);
              setSearchResult(null);
              setProfileBuilding(null);
            }
          }}
          onPaywall={setPaywallFeature}
          onToggleFilters={() => setShowFilters(!showFilters)}
        />

        <FilterPanel
          open={showFilters}
          market={market}
          tab={tab}
          filters={filters}
          onClose={() => setShowFilters(false)}
          onSetFilters={setFilters}
          onClearAll={clearAllFilters}
        />
      </div>

      {/* Filter chips — only for non-map tabs */}
      {!isThreeZone && (
        <FilterChips
          filters={filters}
          activeFilterCount={activeFilterCount}
          onClearFilter={clearFilter}
          onClearAll={clearAllFilters}
        />
      )}

      {/* Welcome banner for new free users — only on non-map tabs */}
      {showWelcome && !isThreeZone && (
        <div className="mx-4 md:mx-8 mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl mt-0.5">{"🏢"}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Welcome to VettdRE Market Intelligence</h3>
            <p className="text-xs text-slate-600 mt-1">
              Search any NYC property by address, owner, or BBL. Click a result to view building details, owner info, and market data.
              {" "}Your free plan includes {searchesRemaining} searches per day.
            </p>
          </div>
          <button
            onClick={() => { setShowWelcome(false); localStorage.setItem("vettdre_welcome_dismissed", "1"); }}
            className="text-slate-400 hover:text-slate-600 p-1 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ================================================================
          THREE-ZONE LAYOUT — NYC Map Tab
          Map fills the viewport; search bar overlays top; panels slide in
          ================================================================ */}
      {isThreeZone && (
        <div className="relative flex-1 min-h-0 overflow-hidden">
          {/* Zone A: Map — always fills the entire area */}
          <div className="absolute inset-0">
            <MapSearch
              onBuildingSelect={handleBuildingSelectFromMap}
              onNameClick={handleNameClick}
              externalHoveredBbl={hoveredBbl}
              flyTo={flyTo}
            />
          </div>

          {/* Unified Search Bar — floating over the map, top center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full px-4 flex justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <UnifiedSearchBar
                onSubmit={handleUnifiedSearch}
                loading={searchLoading}
                initialQuery={lastQuery}
              />
            </div>
          </div>

          {/* Zone B: Results Panel — left side, slides in on search */}
          {showResults && (
            <div className="absolute top-0 left-0 z-10 h-full w-[320px] bg-white shadow-xl border-r border-slate-200 transition-transform duration-300">
              <ResultsPanel
                searchResult={searchResult}
                loading={searchLoading}
                onBuildingSelect={handleBuildingSelectFromResults}
                onNameClick={handleNameClick}
                onClose={handleCloseResults}
                selectedBbl={selectedBbl}
                hoveredBbl={hoveredBbl}
                onHoverBbl={setHoveredBbl}
              />
            </div>
          )}

          {/* Zone C: Profile Panel — right side, slides in on building select */}
          {profileBuilding && (
            <div
              className={`absolute top-0 right-0 z-[1000] h-full bg-white shadow-xl border-l border-slate-200 transition-all duration-300 ${
                profileExpanded ? "w-full" : "w-full md:w-[45%] md:min-w-[420px] md:max-w-[720px]"
              }`}
            >
              <ProfilePanel
                address={profileBuilding.address}
                borough={profileBuilding.borough}
                primaryPhone={primaryPhone}
                expanded={profileExpanded}
                onClose={handleCloseProfile}
                onToggleExpand={() => setProfileExpanded(!profileExpanded)}
              >
                <BuildingProfile
                  boroCode={profileBuilding.boroCode}
                  block={profileBuilding.block}
                  lot={profileBuilding.lot}
                  address={profileBuilding.address}
                  borough={profileBuilding.borough}
                  ownerName={profileBuilding.ownerName}
                  onClose={handleCloseProfile}
                  onNameClick={handleNameClick}
                  onPrimaryPhoneChange={setPrimaryPhone}
                  plutoData={profileBuilding.plutoData}
                />
              </ProfilePanel>
            </div>
          )}

          {/* Data source attribution — bottom of map */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[5]">
            <p className="text-[10px] text-slate-500 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full">
              NYC Open Data &bull; ACRIS &bull; HPD &bull; PLUTO &bull; DOB
            </p>
          </div>
        </div>
      )}

      {/* ================================================================
          LEGACY LAYOUT — Search/Listings tabs + NYS/NJ
          ================================================================ */}
      {!isThreeZone && (
        <div className="px-4 md:px-8 py-6">

          {/* Search tab — NYC uses unified search component */}
          {tab === "search" && market === "nyc" && (
            <UnifiedSearch
              filters={filters}
              onNameClick={handleNameClick}
            />
          )}

          {tab === "search" && market === "nys" && (
            <NysPropertySearch filters={filters} />
          )}

          {tab === "search" && market === "nj" && (
            <NjPropertySearch filters={filters} />
          )}

          {/* Listings tab (all markets) */}
          {tab === "listings" && (
            <OnMarketSearch market={market} filters={filters} />
          )}

          {/* NYS has no map */}
          {market === "nys" && tab === "map" && (
            <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
              <p className="text-4xl mb-4">{"🗺️"}</p>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Map Not Available</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Map view is not available for NY State assessment data. Use the Search tab instead.
              </p>
            </div>
          )}

          {/* NJ Map — always mounted offscreen for Leaflet */}
          {market === "nj" && (
            <div
              style={
                tab !== "map"
                  ? { position: "absolute", left: "-9999px", width: "100%" }
                  : {}
              }
            >
              <NJMapSearch />
            </div>
          )}

          {/* Data source attribution */}
          <p className="text-xs text-slate-400 mt-6 text-center">
            {market === "nyc"
              ? "Data: NYC Open Data \u2022 NYS Dept. of State \u2022 ACRIS \u2022 HPD \u2022 PLUTO \u2022 DOB \u2022 LL84 \u2022 RPIE \u2022 Brave Web Search"
              : market === "nj"
                ? "Data: NJ MOD-IV Tax Records via ArcGIS \u2022 Brave Web Search"
                : "Data: NYS Open Data \u2022 Assessment Rolls \u2022 Municipal Tax Rates \u2022 Brave Web Search"}
          </p>
        </div>
      )}

      {/* Paywall Modal */}
      {paywallFeature && (
        <Paywall
          featureName={
            paywallFeature === "market_nys"
              ? "NY State Market"
              : paywallFeature === "market_nj"
                ? "New Jersey Market"
                : paywallFeature === "search_unlimited"
                  ? "Unlimited Searches"
                  : "Map Search"
          }
          currentPlan={plan}
          requiredPlan={getRequiredPlan(paywallFeature as any)}
          onClose={() => setPaywallFeature(null)}
        />
      )}

      {/* Search Limit Modal */}
      {searchLimitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setSearchLimitModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-8 text-center animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-50 rounded-full flex items-center justify-center">
              <span className="text-3xl">{"⚡"}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Daily Search Limit Reached
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Free accounts are limited to 5 searches per day. Upgrade to
              Explorer for unlimited searches.
            </p>
            <button
              onClick={() => {
                setSearchLimitModal(false);
                setPaywallFeature("search_unlimited");
              }}
              className="w-full bg-emerald-600 text-white rounded-lg px-6 py-3 text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              Upgrade for Unlimited Searches
            </button>
            <button
              onClick={() => setSearchLimitModal(false)}
              className="mt-3 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
