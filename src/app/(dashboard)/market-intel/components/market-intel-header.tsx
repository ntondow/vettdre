"use client";

import type { Market, MainTab } from "../types";
import { hasPermission, getRequiredPlan, type UserPlan } from "@/lib/feature-gate";

const LockIcon = () => (
  <svg className="inline-block w-3 h-3 ml-1 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

interface MarketIntelHeaderProps {
  market: Market;
  mainTab: MainTab;
  plan: UserPlan;
  activeFilterCount: number;
  onMarketChange: (m: Market) => void;
  onTabChange: (t: MainTab) => void;
  onPaywall: (feature: string) => void;
  onToggleFilters: () => void;
}

export default function MarketIntelHeader({
  market,
  mainTab,
  plan,
  activeFilterCount,
  onMarketChange,
  onTabChange,
  onPaywall,
  onToggleFilters,
}: MarketIntelHeaderProps) {
  const tabs =
    market === "nyc"
      ? [
          { key: "property" as const, label: "Property" },
          { key: "ownership" as const, label: "Ownership" },
          { key: "name" as const, label: "Name / Portfolio" },
          { key: "map" as const, label: "Map" },
          { key: "new-development" as const, label: "New Dev" },
          { key: "distressed" as const, label: "Distressed" },
          { key: "on-market" as const, label: "On-Market" },
        ]
      : market === "nj"
        ? [
            { key: "property" as const, label: "Property Search" },
            { key: "map" as const, label: "Map" },
            { key: "on-market" as const, label: "On-Market" },
          ]
        : [
            { key: "property" as const, label: "Property Search" },
            { key: "on-market" as const, label: "On-Market" },
          ];

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="px-4 md:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔍</span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Market Intelligence</h1>
            <p className="text-sm text-slate-500">
              {market === "nyc"
                ? "NYC property records, ownership & portfolio data"
                : market === "nys"
                  ? "NYS assessment rolls & property data"
                  : "NJ tax records & property data"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter toggle button */}
          <button
            onClick={onToggleFilters}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* Market Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => onMarketChange("nyc")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                market === "nyc"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              NYC
            </button>
            <button
              onClick={() => {
                if (!hasPermission(plan, "market_nys")) {
                  onPaywall("market_nys");
                  return;
                }
                onMarketChange("nys");
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors relative ${
                market === "nys"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              } ${!hasPermission(plan, "market_nys") ? "opacity-60" : ""}`}
            >
              NY State
              {!hasPermission(plan, "market_nys") && <LockIcon />}
            </button>
            <button
              onClick={() => {
                if (!hasPermission(plan, "market_nj")) {
                  onPaywall("market_nj");
                  return;
                }
                onMarketChange("nj");
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors relative ${
                market === "nj"
                  ? "bg-white text-green-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              } ${!hasPermission(plan, "market_nj") ? "opacity-60" : ""}`}
            >
              New Jersey
              {!hasPermission(plan, "market_nj") && <LockIcon />}
            </button>
          </div>
        </div>
      </div>
      <div className="px-4 md:px-8 flex gap-0 overflow-x-auto no-scrollbar">
        {tabs.map((t) => {
          const isMapLocked =
            t.key === "map" && !hasPermission(plan, "map_search");
          return (
            <button
              key={t.key}
              onClick={() => {
                if (isMapLocked) {
                  onPaywall("map_search");
                  return;
                }
                onTabChange(t.key);
              }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                mainTab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              } ${isMapLocked ? "opacity-60" : ""}`}
            >
              {t.label}
              {isMapLocked && <LockIcon />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
