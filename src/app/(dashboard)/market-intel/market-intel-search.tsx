"use client";

import { useState, useEffect } from "react";
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
  // FRED Market Pulse state
  const [fredData, setFredData] = useState<import("@/lib/fred").FredSeries | null>(null);
  const [pulseCollapsed, setPulseCollapsed] = useState(false);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [pulseMore, setPulseMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Redfin/FHFA Market Pulse data
  const [nycRedfin, setNycRedfin] = useState<import("@/lib/redfin-market").RedfinMetrics | null>(null);
  const [nycAppreciation, setNycAppreciation] = useState<{ metroAppreciation1Yr: number; fhfaQuarter: string } | null>(null);

  // Fetch FRED data on mount
  useEffect(() => {
    setPulseLoading(true);
    Promise.all([
      import("@/lib/fred-actions").then(m => m.getFredSeries()).then(setFredData).catch(() => {}),
      import("@/lib/market-trends-actions").then(m => {
        m.getRedfinNycAggregate().then(setNycRedfin).catch(() => {});
        m.getAppreciation("10001").then(a => {
          if (a) setNycAppreciation({ metroAppreciation1Yr: a.metroAppreciation1Yr, fhfaQuarter: a.fhfaQuarter });
        }).catch(() => {});
      }),
    ]).finally(() => setPulseLoading(false));
  }, []);

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

      {/* Market Pulse — Bloomberg-style ticker */}
      <div className="mx-4 md:mx-8 mt-4">
        <div className="bg-slate-800/40 backdrop-blur-sm rounded-xl border border-white/5 overflow-hidden">
          {/* Header bar */}
          <button onClick={() => setPulseCollapsed(!pulseCollapsed)}
            className="w-full flex items-center justify-between px-4 py-2 cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-[11px] font-semibold text-slate-200 tracking-wide">Market Pulse</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Collapsed teaser */}
              {pulseCollapsed && !pulseLoading && fredData?.mortgage30 && (
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-slate-400">30yr <span className="text-white font-semibold">{fredData.mortgage30.value}%</span></span>
                  {nycAppreciation && <span className="text-slate-400">HPI <span className="text-emerald-400 font-semibold">+{nycAppreciation.metroAppreciation1Yr}%</span></span>}
                </div>
              )}
              <span className={`text-slate-500 text-[10px] transition-transform duration-200 ${pulseCollapsed ? "" : "rotate-180"}`}>&#9662;</span>
            </div>
          </button>

          {/* Expanded content */}
          <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${pulseCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
            <div className="overflow-hidden">
              <div className="px-4 pb-3">
                {pulseLoading ? (
                  /* Shimmer loading state */
                  <div className="flex gap-2 overflow-hidden">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="flex-shrink-0 w-[88px] h-[52px] rounded-lg bg-slate-700/30 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-stretch gap-0 overflow-x-auto no-scrollbar">
                    {/* LEFT GROUP — Rates (FRED) */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      {(() => {
                        const rates: { label: string; value: number | undefined; suffix: string; border: string; trend?: string }[] = [
                          { label: "30yr Fixed", value: fredData?.mortgage30?.value, suffix: "%", border: "border-l-blue-400", trend: fredData?.mortgage30 ? (fredData.mortgage30.value < 6.5 ? "down-good" : "up-bad") : undefined },
                          { label: "15yr Fixed", value: fredData?.mortgage15?.value, suffix: "%", border: "border-l-blue-400", trend: fredData?.mortgage15 ? (fredData.mortgage15.value < 5.8 ? "down-good" : "up-bad") : undefined },
                          { label: "30yr Treasury", value: fredData?.treasury30?.value, suffix: "%", border: "border-l-blue-400" },
                        ];
                        return rates.filter(m => m.value != null).map(m => (
                          <div key={m.label} className={`flex-shrink-0 border-l-2 ${m.border} bg-slate-700/20 rounded-r-lg px-3 py-1.5`}>
                            <p className="text-[9px] text-slate-400 leading-tight">{m.label}</p>
                            <div className="flex items-center gap-1">
                              <p className="text-[13px] font-bold text-white leading-tight">{m.value}{m.suffix}</p>
                              {m.trend === "down-good" && <span className="text-emerald-400 text-[10px]">&#8595;</span>}
                              {m.trend === "up-bad" && <span className="text-red-400 text-[10px]">&#8593;</span>}
                            </div>
                          </div>
                        ));
                      })()}
                      <p className="self-end text-[8px] text-slate-600 pb-1 pr-1 flex-shrink-0">FRED</p>
                    </div>

                    {/* Divider */}
                    {(nycRedfin || nycAppreciation) && (
                      <div className="w-px bg-slate-600/30 mx-2 my-1 flex-shrink-0" />
                    )}

                    {/* RIGHT GROUP — NYC Market (Redfin/FHFA) */}
                    {(nycRedfin || nycAppreciation) && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        {nycRedfin && (
                          <>
                            <div className="flex-shrink-0 border-l-2 border-l-emerald-400 bg-slate-700/20 rounded-r-lg px-3 py-1.5">
                              <p className="text-[9px] text-slate-400 leading-tight">Median Sale</p>
                              <p className="text-[13px] font-bold text-white leading-tight">${(nycRedfin.medianSalePrice / 1000).toFixed(0)}K</p>
                            </div>
                            <div className="flex-shrink-0 border-l-2 border-l-emerald-400 bg-slate-700/20 rounded-r-lg px-3 py-1.5">
                              <p className="text-[9px] text-slate-400 leading-tight">Days on Mkt</p>
                              <div className="flex items-center gap-1">
                                <p className="text-[13px] font-bold text-white leading-tight">{nycRedfin.medianDaysOnMarket}</p>
                                {nycRedfin.medianDaysOnMarket < 45 && <span className="text-emerald-400 text-[10px]">&#8595;</span>}
                                {nycRedfin.medianDaysOnMarket > 60 && <span className="text-red-400 text-[10px]">&#8593;</span>}
                              </div>
                            </div>
                            <div className="flex-shrink-0 border-l-2 border-l-amber-400 bg-slate-700/20 rounded-r-lg px-3 py-1.5">
                              <p className="text-[9px] text-slate-400 leading-tight">Supply</p>
                              <div className="flex items-center gap-1">
                                <p className="text-[13px] font-bold text-white leading-tight">{nycRedfin.monthsOfSupply} mo</p>
                                {nycRedfin.monthsOfSupply < 4 && <span className="text-red-400 text-[10px]">&#8595;</span>}
                                {nycRedfin.monthsOfSupply > 6 && <span className="text-red-400 text-[10px]">&#8593;</span>}
                              </div>
                            </div>
                          </>
                        )}
                        {nycAppreciation && (
                          <div className="flex-shrink-0 border-l-2 border-l-emerald-400 bg-slate-700/20 rounded-r-lg px-3 py-1.5">
                            <p className="text-[9px] text-slate-400 leading-tight">1yr HPI</p>
                            <div className="flex items-center gap-1">
                              <p className={`text-[13px] font-bold leading-tight ${nycAppreciation.metroAppreciation1Yr > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {nycAppreciation.metroAppreciation1Yr > 0 ? "+" : ""}{nycAppreciation.metroAppreciation1Yr}%
                              </p>
                              {nycAppreciation.metroAppreciation1Yr > 0 && <span className="text-emerald-400 text-[10px]">&#8593;</span>}
                              {nycAppreciation.metroAppreciation1Yr < 0 && <span className="text-red-400 text-[10px]">&#8595;</span>}
                            </div>
                          </div>
                        )}
                        <p className="self-end text-[8px] text-slate-600 pb-1 pr-1 flex-shrink-0">Redfin / FHFA</p>
                      </div>
                    )}
                  </div>
                )}

                {/* More Indicators — expandable */}
                {!pulseLoading && (fredData?.unemployment || fredData?.housingStarts) && (
                  <div className="mt-1.5">
                    <button onClick={() => setPulseMore(!pulseMore)} className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer">
                      <span>{pulseMore ? "Less" : "More Indicators"}</span>
                      <span className={`transition-transform duration-150 ${pulseMore ? "rotate-180" : ""}`}>&#9662;</span>
                    </button>
                    {pulseMore && (
                      <div className="flex gap-1.5 mt-1.5">
                        {fredData?.unemployment && (
                          <div className="flex-shrink-0 border-l-2 border-l-slate-500 bg-slate-700/20 rounded-r-lg px-3 py-1.5">
                            <p className="text-[9px] text-slate-400 leading-tight">Unemployment</p>
                            <div className="flex items-center gap-1">
                              <p className="text-[13px] font-bold text-white leading-tight">{fredData.unemployment.value}%</p>
                              {fredData.unemployment.value < 4.5 && <span className="text-emerald-400 text-[10px]">&#8595;</span>}
                              {fredData.unemployment.value > 5.5 && <span className="text-red-400 text-[10px]">&#8593;</span>}
                            </div>
                          </div>
                        )}
                        {fredData?.housingStarts && (
                          <div className="flex-shrink-0 border-l-2 border-l-slate-500 bg-slate-700/20 rounded-r-lg px-3 py-1.5">
                            <p className="text-[9px] text-slate-400 leading-tight">Housing Starts</p>
                            <p className="text-[13px] font-bold text-white leading-tight">{fredData.housingStarts.value}K</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
