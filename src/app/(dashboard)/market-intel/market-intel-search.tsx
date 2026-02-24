"use client";

import { useState } from "react";
import { useFilterState } from "./use-filter-state";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission, getRequiredPlan } from "@/lib/feature-gate";
import Paywall from "@/components/ui/paywall";
import dynamic from "next/dynamic";

// Sub-components
import MarketIntelHeader from "./components/market-intel-header";
import FilterChips from "./components/filter-chips";
import FilterPanel from "./components/filter-panel";
import NycPropertySearch from "./components/nyc-property-search";
import OwnershipSearch from "./components/ownership-search";
import NameSearch from "./components/name-search";
import DistressedSearch from "./components/distressed-search";
import OnMarketSearch from "./components/on-market-search";
import NysPropertySearch from "./components/nys-property-search";
import NjPropertySearch from "./components/nj-property-search";

// Map components — dynamic imports (no SSR)
const MapSearch = dynamic(() => import("./map-search"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
    </div>
  ),
});
const NJMapSearch = dynamic(() => import("./nj-map-search"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-4 border-green-600 border-t-transparent" />
    </div>
  ),
});

// Lazy-load new-development component (it's large)
const NewDevelopmentSearch = dynamic(
  () => import("./components/new-development-search"),
  {
    loading: () => (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
      </div>
    ),
  },
);

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

  const [paywallFeature, setPaywallFeature] = useState<string | null>(null);
  const [searchLimitModal, setSearchLimitModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Name search cross-tab navigation
  const [nameSearchQuery, setNameSearchQuery] = useState("");
  const handleNameClick = (name: string) => {
    setNameSearchQuery(name);
    setTab("name");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header + filter popover wrapper */}
      <div className="relative">
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
          }}
          onTabChange={(t) => {
            if (t === "map" && !hasPermission(plan, "map_search")) {
              setPaywallFeature("map_search");
              return;
            }
            setTab(t);
          }}
          onPaywall={setPaywallFeature}
          onToggleFilters={() => setShowFilters(!showFilters)}
        />

        {/* Filter popover (dropdown on desktop, sheet on mobile) */}
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

      {/* Filter chips */}
      <FilterChips
        filters={filters}
        activeFilterCount={activeFilterCount}
        onClearFilter={clearFilter}
        onClearAll={clearAllFilters}
      />

      {/* Main content area */}
      <div className="px-4 md:px-8 py-6">

        {/* ===== NYC tabs ===== */}
        {market === "nyc" && tab === "property" && (
          <NycPropertySearch
            filters={filters}
            plan={plan}
            userId={userId}
            searchesRemaining={searchesRemaining}
            onSearchLimitReached={() => setSearchLimitModal(true)}
            onNameClick={handleNameClick}
          />
        )}

        {market === "nyc" && tab === "ownership" && (
          <OwnershipSearch
            filters={filters}
            plan={plan}
            userId={userId}
            onSearchLimitReached={() => setSearchLimitModal(true)}
            onNameClick={handleNameClick}
          />
        )}

        {market === "nyc" && tab === "name" && (
          <NameSearch
            filters={filters}
            plan={plan}
            userId={userId}
            initialQuery={nameSearchQuery}
            onSearchLimitReached={() => setSearchLimitModal(true)}
            onNameClick={handleNameClick}
          />
        )}

        {market === "nyc" && tab === "new-development" && (
          <NewDevelopmentSearch filters={filters} />
        )}

        {market === "nyc" && tab === "distressed" && (
          <DistressedSearch
            filters={filters}
            onNameClick={handleNameClick}
          />
        )}

        {/* ===== NYS tabs ===== */}
        {market === "nys" && tab === "property" && (
          <NysPropertySearch filters={filters} />
        )}

        {/* NYS has no map — show message if somehow reached */}
        {market === "nys" && tab === "map" && (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
            <p className="text-4xl mb-4">🗺️</p>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Map Not Available</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Map view is not available for NY State assessment data. Use Property Search instead.
            </p>
          </div>
        )}

        {/* ===== NJ tabs ===== */}
        {market === "nj" && tab === "property" && (
          <NjPropertySearch filters={filters} />
        )}

        {/* ===== On-market (all markets) ===== */}
        {tab === "on-market" && (
          <OnMarketSearch market={market} filters={filters} />
        )}

        {/* ===== NYC Map — always mounted offscreen for Leaflet ===== */}
        {market === "nyc" && (
          <div
            style={
              tab !== "map"
                ? { position: "absolute", left: "-9999px", width: "100%" }
                : {}
            }
          >
            <MapSearch onNameClick={handleNameClick} />
          </div>
        )}

        {/* ===== NJ Map — always mounted offscreen for Leaflet ===== */}
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
              <span className="text-3xl">⚡</span>
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
