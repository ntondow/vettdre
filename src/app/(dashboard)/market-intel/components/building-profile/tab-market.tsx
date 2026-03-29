"use client";

// Market tab — Active listings, listing search links, neighborhood intelligence,
// census demographics, market trends (FHFA + Redfin), related properties

import { useRouter } from "next/navigation";
import FeatureGate from "@/components/ui/feature-gate";
import { fmtPrice, fmtDate } from "../../sections/format-utils";
import { SkeletonKeyValueGrid, SkeletonPulse } from "./skeleton-components";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TabMarketProps {
  pluto: any;
  intel: any;
  data: any;
  address?: string;
  borough?: string;
  displayAddr: string;
  displayBorough: string;
  displayZip: string;
  // Census
  censusProfile: any;
  censusLoading: boolean;
  censusAttempted: boolean;
  // HUD
  hudFmr: any;
  // Market Trends
  marketAppreciation: any;
  redfinMetrics: any;
  marketTemp: any;
  // Related
  relatedProperties: any[];
  loadingRelated: boolean;
  relatedDone: boolean;
  // Handlers
  onClose: () => void;
  onNameClick?: (name: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Collapsible Card                                                   */
/* ------------------------------------------------------------------ */

function Card({
  title,
  icon,
  badge,
  className,
  children,
}: {
  title: string;
  icon?: string;
  badge?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className || "bg-white rounded-xl border border-slate-200"}>
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        {icon && <span className="text-lg">{icon}</span>}
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {badge}
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const boroToCityMap: Record<string, string> = {
  Manhattan: "New York",
  Bronx: "Bronx",
  Brooklyn: "Brooklyn",
  Queens: "Queens",
  "Staten Island": "Staten Island",
};

const fmtK = (n: number) =>
  n >= 1_000_000
    ? "$" + (n / 1_000_000).toFixed(1) + "M"
    : n >= 1000
      ? "$" + Math.round(n / 1000) + "K"
      : "$" + Math.round(n);

const fmtPct = (n: number | null) =>
  n !== null ? (n >= 0 ? "+" : "") + n.toFixed(1) + "%" : "\u2014";

/* ------------------------------------------------------------------ */
/*  Sparkline SVG component                                            */
/* ------------------------------------------------------------------ */

function Sparkline({ data, width = 200, height = 36 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const color = data[data.length - 1] >= data[0] ? "#10B981" : "#EF4444";

  return (
    <svg
      width={width}
      height={height}
      className="w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  NYC Compare Bar                                                    */
/* ------------------------------------------------------------------ */

function CompareBar({
  label,
  value,
  nycAvg,
  fmt,
}: {
  label: string;
  value: number | null;
  nycAvg: number;
  fmt: (n: number) => string;
}) {
  if (value === null || nycAvg <= 0) return null;
  const ratio = Math.min(value / nycAvg, 2);
  const pct = Math.round(ratio * 50);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 text-slate-500 truncate">{label}</span>
      <span className="w-16 font-bold text-slate-900 text-right">{fmt(value)}</span>
      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={"h-full rounded-full " + (ratio > 1 ? "bg-blue-500" : "bg-emerald-500")}
          style={{ width: pct + "%" }}
        />
      </div>
      <span className="w-16 text-slate-400 text-right">{fmt(nycAvg)}</span>
    </div>
  );
}

/* ================================================================== */
/*  TabMarket Component                                                */
/* ================================================================== */

export default function TabMarket({
  pluto,
  intel,
  data,
  address,
  borough,
  displayAddr,
  displayBorough,
  displayZip,
  censusProfile,
  censusLoading,
  censusAttempted,
  hudFmr,
  marketAppreciation,
  redfinMetrics,
  marketTemp,
  relatedProperties,
  loadingRelated,
  relatedDone,
  onClose,
  onNameClick,
}: TabMarketProps) {
  const router = useRouter();
  const p = pluto;

  return (
    <div className="space-y-4 p-4">
      {/* ============================================================ */}
      {/* 1. ACTIVE LISTINGS (Brave Web Search)                        */}
      {/* ============================================================ */}
      <FeatureGate feature="bp_live_listings" blur>
        {intel?.liveListings &&
          (intel.liveListings.forSale.length > 0 || intel.liveListings.forRent.length > 0) && (
            <Card
              title="Active Listings"
              icon="🏷️"
              badge={
                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">
                  Live
                </span>
              }
            >
              {/* ---- For Sale ---- */}
              {intel.liveListings.forSale.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
                    For Sale ({intel.liveListings.forSale.length})
                  </p>
                  <div className="space-y-2">
                    {intel.liveListings.forSale.slice(0, 5).map((l: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start justify-between p-2.5 bg-green-50 rounded-lg border border-green-100"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{l.address}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {l.units && <span>{l.units} units · </span>}
                            {l.sqft && <span>{l.sqft.toLocaleString()} sf · </span>}
                            {l.brokerage && <span>{l.brokerage} · </span>}
                            {l.daysOnMarket !== undefined && <span>{l.daysOnMarket}d on market</span>}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{l.sourceDomain}</p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-sm font-bold text-green-700">{l.priceStr}</p>
                          {l.pricePerUnit && (
                            <p className="text-[10px] text-slate-400">
                              ${l.pricePerUnit.toLocaleString()}/unit
                            </p>
                          )}
                          <a
                            href={l.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline mt-1 block"
                          >
                            View Listing &rarr;
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Model This Price */}
                  {intel.liveListings.forSale[0] && (
                    <button
                      onClick={() => {
                        const listing = intel.liveListings!.forSale[0];
                        try {
                          sessionStorage.setItem(
                            "vettdre_listing_price",
                            JSON.stringify({
                              price: listing.price,
                              address: listing.address,
                              source: listing.sourceDomain,
                            }),
                          );
                        } catch {}
                        router.push("/deals/new");
                      }}
                      className="mt-2 w-full py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Model This Price in Deal Modeler &rarr;
                    </button>
                  )}
                </div>
              )}

              {/* ---- Rental Comps ---- */}
              {intel.liveListings.forRent.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
                    Rental Comps ({intel.liveListings.forRent.length})
                  </p>
                  <div className="space-y-1.5">
                    {intel.liveListings.forRent.slice(0, 4).map((l: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-700 font-medium truncate block">{l.address}</span>
                          <span className="text-slate-400 text-[10px]">{l.sourceDomain}</span>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <span className="font-bold text-slate-900">{l.priceStr}/mo</span>
                          {l.beds !== undefined && (
                            <span className="text-slate-400 ml-1">&middot; {l.beds}BR</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const rents = intel.liveListings!.forRent;
                      const avgRent =
                        rents.length > 0
                          ? Math.round(rents.reduce((s: number, r: any) => s + r.price, 0) / rents.length)
                          : 0;
                      try {
                        sessionStorage.setItem(
                          "vettdre_web_rents",
                          JSON.stringify({
                            avgRent,
                            count: rents.length,
                            listings: rents.slice(0, 5),
                          }),
                        );
                      } catch {}
                      router.push("/deals/new");
                    }}
                    className="mt-2 w-full py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Use Web Rents in Deal Modeler &rarr;
                  </button>
                </div>
              )}

              {/* ---- Web Comps ---- */}
              {intel.liveListings.webComps.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">
                    Web Comps ({intel.liveListings.webComps.length})
                  </p>
                  <div className="space-y-1.5">
                    {intel.liveListings.webComps.slice(0, 4).map((c: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs p-2 bg-amber-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-700 font-medium truncate block">{c.address}</span>
                          <span className="text-[10px] text-slate-400">
                            {c.type === "sale" ? "Sold" : c.type === "pending" ? "Pending" : "Listed"}
                          </span>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <span className="font-bold text-slate-900">{c.priceStr}</span>
                          {c.pricePerUnit && (
                            <span className="text-[10px] text-slate-400 block">
                              ${c.pricePerUnit.toLocaleString()}/unit
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- Market Trend Insight ---- */}
              {intel.liveListings.marketInsight && (
                <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2">
                  <span className="text-base">
                    {intel.liveListings.marketTrend === "rising"
                      ? "📈"
                      : intel.liveListings.marketTrend === "declining"
                        ? "📉"
                        : "📊"}
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-600 mb-0.5">
                      Market Trend:{" "}
                      {intel.liveListings.marketTrend.charAt(0).toUpperCase() +
                        intel.liveListings.marketTrend.slice(1)}
                    </p>
                    <p className="text-xs text-slate-700">{intel.liveListings.marketInsight}</p>
                  </div>
                </div>
              )}
            </Card>
          )}
      </FeatureGate>

      {/* ============================================================ */}
      {/* 2. LISTING SEARCH LINKS                                      */}
      {/* ============================================================ */}
      {p &&
        (() => {
          const streetAddr = p.address || "";
          const boroName = p.borough || displayBorough;
          const cityName = boroToCityMap[boroName] || boroName;
          const zip = data?.neighborhoodData?.zip || data?.registrations?.[0]?.zip || displayZip || "";
          const fullAddress = [streetAddr, cityName, "NY", zip].filter(Boolean).join(", ");
          const addrSlug = streetAddr.replace(/\s+/g, "-").toLowerCase();
          const fullSlug = fullAddress.replace(/\s+/g, "-");

          const platforms = {
            sale: [
              {
                name: "Zillow",
                color: "#006AFF",
                url: `https://www.zillow.com/homes/${encodeURIComponent(fullSlug)}_rb/`,
              },
              {
                name: "StreetEasy",
                color: "#00A850",
                url: `https://streeteasy.com/building/${encodeURIComponent(addrSlug)}`,
              },
              {
                name: "Realtor.com",
                color: "#D92228",
                url: `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(fullAddress.replace(/\s+/g, "-"))}`,
              },
              {
                name: "Google",
                color: "#4285F4",
                url: `https://www.google.com/search?q=${encodeURIComponent(fullAddress + " for sale")}`,
              },
            ],
            rent: [
              {
                name: "StreetEasy",
                color: "#00A850",
                url: `https://streeteasy.com/search?search=${encodeURIComponent(fullAddress)}`,
              },
              {
                name: "Apartments.com",
                color: "#6B46C1",
                url: `https://www.apartments.com/${encodeURIComponent(addrSlug)}-${encodeURIComponent(boroName.toLowerCase())}-ny/`,
              },
              {
                name: "RentHop",
                color: "#FF6B35",
                url: `https://www.renthop.com/search?search=${encodeURIComponent(fullAddress)}`,
              },
              {
                name: "Google",
                color: "#4285F4",
                url: `https://www.google.com/search?q=${encodeURIComponent(fullAddress + " for rent")}`,
              },
            ],
          };

          return (
            <Card
              title="Listing Search"
              icon="🏠"
              badge={<span className="text-xs text-slate-400">External search</span>}
            >
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                    For Sale
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {platforms.sale.map((pl) => (
                      <a
                        key={pl.name}
                        href={pl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: pl.color }}
                        />
                        {pl.name}
                        <span className="text-slate-300 text-xs">&nearr;</span>
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                    For Rent
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {platforms.rent.map((pl) => (
                      <a
                        key={pl.name}
                        href={pl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: pl.color }}
                        />
                        {pl.name}
                        <span className="text-slate-300 text-xs">&nearr;</span>
                      </a>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  Searching for{" "}
                  <span className="font-medium text-slate-500">{fullAddress}</span>
                </p>
              </div>
            </Card>
          );
        })()}

      {/* ============================================================ */}
      {/* 3. NEIGHBORHOOD INTELLIGENCE (Zillow)                        */}
      {/* ============================================================ */}
      {data?.neighborhoodData &&
        (data.neighborhoodData.currentHomeValue || data.neighborhoodData.currentRent) &&
        (() => {
          const nd = data.neighborhoodData;
          const avg = nd.nycAverages || {};

          const signals: string[] = [];
          if (nd.homeValueChange1Y !== null) {
            if (nd.homeValueChange1Y > 5) signals.push("Strong appreciation area");
            else if (nd.homeValueChange1Y > 0) signals.push("Moderate growth area");
            else signals.push("Values declining");
            signals.push(
              "values " +
                (nd.homeValueChange1Y > 0 ? "up" : "down") +
                " " +
                Math.abs(nd.homeValueChange1Y).toFixed(1) +
                "% YoY",
            );
          }
          if (nd.forSaleInventory !== null) {
            if (nd.forSaleInventory > 200) signals.push("high inventory");
            else if (nd.forSaleInventory > 100) signals.push("moderate inventory");
            else signals.push("tight inventory");
          }
          if (nd.rentChange1Y !== null && nd.rentChange1Y > 3) signals.push("rents rising fast");
          const marketSignal = signals.length > 0 ? signals.join(". ") + "." : null;

          const sparkData =
            nd.homeValueHistory?.map((h: { value: number }) => h.value) || [];

          return (
            <Card
              title="Neighborhood Intelligence"
              icon="🏘️"
              badge={
                <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
                  ZIP: {nd.zip}
                </span>
              }
              className="bg-gradient-to-r from-cyan-50 to-sky-50 rounded-xl border border-cyan-200"
            >
              {/* Two-column stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {nd.currentHomeValue && (
                  <div className="bg-white/70 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">
                      Typical Home Value
                    </p>
                    <p className="text-xl font-black text-slate-900 mt-1">
                      {fmtK(nd.currentHomeValue)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {nd.homeValueChange1Y !== null && (
                        <span
                          className={
                            "text-xs font-bold " +
                            (nd.homeValueChange1Y >= 0 ? "text-emerald-600" : "text-red-600")
                          }
                        >
                          {nd.homeValueChange1Y >= 0 ? "▲" : "▼"} {fmtPct(nd.homeValueChange1Y)} YoY
                        </span>
                      )}
                    </div>
                    {nd.homeValueChange5Y !== null && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {fmtPct(nd.homeValueChange5Y)} over 5 years
                      </p>
                    )}
                  </div>
                )}
                {nd.currentRent && (
                  <div className="bg-white/70 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Rent Index</p>
                    <p className="text-xl font-black text-slate-900 mt-1">
                      {"$" + Math.round(nd.currentRent).toLocaleString()}
                      <span className="text-sm font-normal text-slate-500">/mo</span>
                    </p>
                    {nd.rentChange1Y !== null && (
                      <span
                        className={
                          "text-xs font-bold " +
                          (nd.rentChange1Y >= 0 ? "text-emerald-600" : "text-red-600")
                        }
                      >
                        {nd.rentChange1Y >= 0 ? "▲" : "▼"} {fmtPct(nd.rentChange1Y)} YoY
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Sparkline */}
              {sparkData.length >= 2 && (
                <div className="mb-4">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                    Home Value Trend (12 months)
                  </p>
                  <Sparkline data={sparkData} />
                </div>
              )}

              {/* Market Activity */}
              {(nd.forSaleInventory !== null || nd.newListings !== null) && (
                <div className="flex items-center gap-4 mb-4 text-xs">
                  {nd.forSaleInventory !== null && (
                    <div className="bg-white/70 rounded-lg px-3 py-2 flex-1">
                      <p className="text-[10px] text-slate-400 uppercase">For Sale</p>
                      <p className="font-bold text-slate-900">
                        {Math.round(nd.forSaleInventory)} listings
                      </p>
                    </div>
                  )}
                  {nd.newListings !== null && (
                    <div className="bg-white/70 rounded-lg px-3 py-2 flex-1">
                      <p className="text-[10px] text-slate-400 uppercase">New This Month</p>
                      <p className="font-bold text-slate-900">
                        {Math.round(nd.newListings)} listings
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* NYC Comparison Bars */}
              {avg.avgHomeValue > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                    This ZIP vs NYC Average
                  </p>
                  <div className="space-y-1.5">
                    <CompareBar
                      label="Home Value"
                      value={nd.currentHomeValue}
                      nycAvg={avg.avgHomeValue}
                      fmt={fmtK}
                    />
                    <CompareBar
                      label="Rent"
                      value={nd.currentRent}
                      nycAvg={avg.avgRent}
                      fmt={(n) => "$" + Math.round(n).toLocaleString()}
                    />
                    <CompareBar
                      label="Inventory"
                      value={nd.forSaleInventory}
                      nycAvg={avg.avgInventory}
                      fmt={(n) => String(Math.round(n))}
                    />
                    <CompareBar
                      label="YoY Growth"
                      value={nd.homeValueChange1Y}
                      nycAvg={avg.avgYoYGrowth}
                      fmt={(n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%"}
                    />
                  </div>
                </div>
              )}

              {/* Market Signal Insight */}
              {marketSignal && (
                <div className="bg-white/70 rounded-lg p-3 border border-cyan-100">
                  <div className="flex items-start gap-2">
                    <span className="text-xs mt-0.5">{"💡"}</span>
                    <p className="text-xs text-slate-700 leading-relaxed">{marketSignal}</p>
                  </div>
                </div>
              )}
            </Card>
          );
        })()}

      {/* ============================================================ */}
      {/* 4. CENSUS DEMOGRAPHICS                                       */}
      {/* ============================================================ */}
      {(censusProfile || censusLoading || (censusAttempted && !censusLoading)) && (
        <Card
          title="Census Demographics"
          icon="📊"
          badge={
            censusProfile?.censusTract ? (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                Tract {censusProfile.censusTract}
              </span>
            ) : undefined
          }
          className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200"
        >
          {censusLoading ? (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white/70 rounded-lg p-2.5 space-y-1.5">
                    <SkeletonPulse className="h-3 w-16" />
                    <SkeletonPulse className="h-5 w-12" />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white/70 rounded-lg p-2.5 space-y-1.5">
                    <SkeletonPulse className="h-3 w-20" />
                    <SkeletonPulse className="h-4 w-14" />
                  </div>
                ))}
              </div>
            </div>
          ) : censusProfile ? (
            <div className="space-y-4">
              {/* Key Metrics Grid */}
              <div className="grid grid-cols-3 gap-2">
                {censusProfile.census?.medianHouseholdIncome != null &&
                  censusProfile.census.medianHouseholdIncome > 0 && (
                    <div className="bg-white/70 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-400 uppercase">Med. Income</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">
                        ${(censusProfile.census.medianHouseholdIncome / 1000).toFixed(0)}k
                      </p>
                    </div>
                  )}
                {(censusProfile.census?.medianRent ?? censusProfile.quickStats?.medianRent) != null && (
                  <div className="bg-white/70 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase">Med. Rent</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      $
                      {(
                        censusProfile.census?.medianRent ||
                        censusProfile.quickStats?.medianRent ||
                        0
                      ).toLocaleString()}
                    </p>
                  </div>
                )}
                {censusProfile.census?.vacancyRate != null && (
                  <div className="bg-white/70 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase">Vacancy</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      {censusProfile.census.vacancyRate.toFixed(1)}%
                    </p>
                  </div>
                )}
                {censusProfile.census?.population != null &&
                  censusProfile.census.population > 0 && (
                    <div className="bg-white/70 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-400 uppercase">Population</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">
                        {censusProfile.census.population.toLocaleString()}
                      </p>
                    </div>
                  )}
                {censusProfile.census?.medianAge != null &&
                  censusProfile.census.medianAge > 0 && (
                    <div className="bg-white/70 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-400 uppercase">Med. Age</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">
                        {censusProfile.census.medianAge.toFixed(0)}
                      </p>
                    </div>
                  )}
                {censusProfile.census?.medianHomeValue != null &&
                  censusProfile.census.medianHomeValue > 0 && (
                    <div className="bg-white/70 rounded-lg p-2.5">
                      <p className="text-[10px] text-slate-400 uppercase">Home Value</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">
                        ${(censusProfile.census.medianHomeValue / 1000).toFixed(0)}k
                      </p>
                    </div>
                  )}
              </div>

              {/* Renter vs Owner Bar */}
              {censusProfile.census && censusProfile.census.renterPct > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                    Renter vs Owner
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-violet-700 font-bold w-12 text-xs">
                      {censusProfile.census.renterPct.toFixed(0)}%
                    </span>
                    <div className="flex-1 h-4 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all"
                        style={{ width: `${censusProfile.census.renterPct}%` }}
                      />
                    </div>
                    <span className="text-slate-500 w-12 text-right text-xs">
                      {(100 - censusProfile.census.renterPct).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>Renters</span>
                    <span>Owners</span>
                  </div>
                </div>
              )}

              {/* Housing Stock Breakdown Bars */}
              {censusProfile.census &&
                (() => {
                  const hs = censusProfile.census!.housingStock;
                  if (!hs) return null;
                  const types = [
                    { label: "1-unit", val: hs.singleFamily || 0, color: "bg-blue-400" },
                    { label: "2-4 units", val: hs.small || 0, color: "bg-emerald-400" },
                    { label: "5-19 units", val: hs.medium || 0, color: "bg-amber-400" },
                    { label: "20+ units", val: hs.large || 0, color: "bg-violet-400" },
                    { label: "Other", val: hs.other || 0, color: "bg-slate-300" },
                  ];
                  const total = types.reduce((s, t) => s + t.val, 0);
                  if (total <= 0) return null;
                  return (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                        Housing Stock
                      </p>
                      <div className="flex h-3 rounded-full overflow-hidden">
                        {types.map(
                          (t) =>
                            t.val > 0 && (
                              <div
                                key={t.label}
                                className={`${t.color} transition-all`}
                                style={{ width: `${(t.val / total) * 100}%` }}
                                title={`${t.label}: ${((t.val / total) * 100).toFixed(0)}%`}
                              />
                            ),
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        {types.map(
                          (t) =>
                            t.val > 0 && (
                              <span key={t.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                                <span className={`w-1.5 h-1.5 rounded-full ${t.color}`} />
                                {t.label} {((t.val / total) * 100).toFixed(0)}%
                              </span>
                            ),
                        )}
                      </div>
                    </div>
                  );
                })()}

              {/* Market Signals */}
              {censusProfile.signals && censusProfile.signals.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                    Market Signals
                  </p>
                  <div className="space-y-1">
                    {censusProfile.signals.map((s: any, i: number) => (
                      <div
                        key={i}
                        className={`flex items-start gap-1.5 text-xs ${
                          s.type === "positive"
                            ? "text-emerald-700"
                            : s.type === "negative"
                              ? "text-red-700"
                              : "text-amber-700"
                        }`}
                      >
                        <span className="mt-0.5">
                          {s.type === "positive" ? "▲" : s.type === "negative" ? "▼" : "●"}
                        </span>
                        <span>{s.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trends Comparison */}
              <FeatureGate feature="bp_census_trends" blur>
                {censusProfile.trends &&
                  censusProfile.trends.length >= 2 &&
                  (() => {
                    const t = censusProfile.trends!;
                    const latest = t[t.length - 1];
                    const prev = t[t.length - 2];
                    const incChg =
                      prev.medianIncome > 0
                        ? (((latest.medianIncome - prev.medianIncome) / prev.medianIncome) * 100).toFixed(1)
                        : null;
                    const rentChg =
                      prev.medianRent > 0
                        ? (((latest.medianRent - prev.medianRent) / prev.medianRent) * 100).toFixed(1)
                        : null;

                    return (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                          5-Year Change ({prev.year} &rarr; {latest.year})
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {incChg !== null && (
                            <div className="bg-white/70 rounded-lg p-2">
                              <p className="text-[10px] text-slate-400">Income</p>
                              <p
                                className={`text-xs font-bold ${
                                  parseFloat(incChg) >= 0 ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {parseFloat(incChg) >= 0 ? "+" : ""}
                                {incChg}%
                              </p>
                            </div>
                          )}
                          {rentChg !== null && (
                            <div className="bg-white/70 rounded-lg p-2">
                              <p className="text-[10px] text-slate-400">Rent</p>
                              <p
                                className={`text-xs font-bold ${
                                  parseFloat(rentChg) >= 0 ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {parseFloat(rentChg) >= 0 ? "+" : ""}
                                {rentChg}%
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
              </FeatureGate>

              {/* HUD Fair Market Rents */}
              {hudFmr && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">
                    HUD Fair Market Rents (FY{hudFmr.year}) &mdash;{" "}
                    {hudFmr.source === "api" ? `ZIP ${hudFmr.zip}` : "NYC Metro"}
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { label: "Studio", val: hudFmr.studio },
                      { label: "1BR", val: hudFmr.oneBr },
                      { label: "2BR", val: hudFmr.twoBr },
                      { label: "3BR", val: hudFmr.threeBr },
                      { label: "4BR", val: hudFmr.fourBr },
                    ].map((r) => (
                      <div key={r.label} className="bg-white/70 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-slate-400">{r.label}</p>
                        <p className="text-xs font-bold text-slate-900">{fmtPrice(r.val)}</p>
                      </div>
                    ))}
                  </div>
                  {censusProfile?.census?.medianRent &&
                    hudFmr.twoBr > censusProfile.census.medianRent * 1.2 && (
                      <p className="text-[10px] text-amber-600 mt-1.5">
                        HUD FMR exceeds census median rent by{" "}
                        {Math.round(
                          (hudFmr.twoBr / censusProfile.census.medianRent - 1) * 100,
                        )}
                        % &mdash; potential rent gap
                      </p>
                    )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-2">
              No census data available for this location.
            </p>
          )}
        </Card>
      )}

      {/* ============================================================ */}
      {/* 5. MARKET TRENDS (FHFA + Redfin)                             */}
      {/* ============================================================ */}
      <FeatureGate feature="bp_market_trends" blur>
        {(marketAppreciation || redfinMetrics) && (
          <Card
            title="Market Trends"
            icon="📈"
            badge={
              <>
                {displayZip && <span className="text-xs text-slate-400">ZIP {displayZip}</span>}
                {marketTemp && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-1.5 ${
                      marketTemp.temperature === "hot"
                        ? "bg-red-100 text-red-700"
                        : marketTemp.temperature === "warm"
                          ? "bg-amber-100 text-amber-700"
                          : marketTemp.temperature === "cool"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {marketTemp.label}
                  </span>
                )}
              </>
            }
          >
            {/* Price Appreciation */}
            {marketAppreciation && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Price Appreciation
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Local (ACRIS) */}
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">
                      This Zip ({marketAppreciation.zip})
                    </p>
                    {marketAppreciation.localAppreciation1Yr !== null ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-sm font-bold ${
                              marketAppreciation.localAppreciation1Yr >= 0
                                ? "text-emerald-700"
                                : "text-red-700"
                            }`}
                          >
                            {marketAppreciation.localAppreciation1Yr >= 0 ? "+" : ""}
                            {marketAppreciation.localAppreciation1Yr}%
                          </span>
                          <span className="text-[10px] text-slate-400">/ 1yr</span>
                        </div>
                        {marketAppreciation.localAppreciation5Yr !== null && (
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-xs font-medium ${
                                marketAppreciation.localAppreciation5Yr >= 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {marketAppreciation.localAppreciation5Yr >= 0 ? "+" : ""}
                              {marketAppreciation.localAppreciation5Yr}%
                            </span>
                            <span className="text-[10px] text-slate-400">/ 5yr</span>
                          </div>
                        )}
                        {marketAppreciation.sampleSize > 0 && (
                          <p className="text-[10px] text-slate-400">
                            {marketAppreciation.sampleSize} sales (ACRIS)
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No local data</p>
                    )}
                  </div>
                  {/* Metro (FHFA) */}
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">
                      {marketAppreciation.metroName}
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-sm font-bold ${
                            marketAppreciation.metroAppreciation1Yr >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {marketAppreciation.metroAppreciation1Yr >= 0 ? "+" : ""}
                          {marketAppreciation.metroAppreciation1Yr}%
                        </span>
                        <span className="text-[10px] text-slate-400">/ 1yr</span>
                      </div>
                      {marketAppreciation.metroAppreciation5Yr !== 0 && (
                        <div className="flex items-center gap-1">
                          <span
                            className={`text-xs font-medium ${
                              marketAppreciation.metroAppreciation5Yr >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {marketAppreciation.metroAppreciation5Yr >= 0 ? "+" : ""}
                            {marketAppreciation.metroAppreciation5Yr}%
                          </span>
                          <span className="text-[10px] text-slate-400">/ 5yr</span>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400">
                        FHFA HPI
                        {marketAppreciation.fhfaQuarter
                          ? ` (${marketAppreciation.fhfaQuarter})`
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
                {/* Outperformance indicator */}
                {marketAppreciation.localAppreciation1Yr !== null && (
                  <div
                    className={`mt-2 text-xs font-medium ${
                      marketAppreciation.localAppreciation1Yr >
                      marketAppreciation.metroAppreciation1Yr
                        ? "text-emerald-600"
                        : "text-amber-600"
                    }`}
                  >
                    {marketAppreciation.localAppreciation1Yr >
                    marketAppreciation.metroAppreciation1Yr
                      ? `Outperforming metro by ${(marketAppreciation.localAppreciation1Yr - marketAppreciation.metroAppreciation1Yr).toFixed(1)}%`
                      : `Underperforming metro by ${(marketAppreciation.metroAppreciation1Yr - marketAppreciation.localAppreciation1Yr).toFixed(1)}%`}
                  </div>
                )}
                {marketAppreciation.medianPricePerUnit && (
                  <p className="text-xs text-slate-500 mt-1">
                    Median $/unit: $
                    {marketAppreciation.medianPricePerUnit.toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {/* Market Temperature (Redfin) */}
            {redfinMetrics && (
              <div className="bg-slate-50 rounded-lg p-3 mt-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                  Market Temperature
                  {redfinMetrics.period ? ` (${redfinMetrics.period})` : ""}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Days on Market</p>
                    <p className="text-sm font-bold text-slate-900">
                      {redfinMetrics.medianDaysOnMarket ?? "\u2014"}
                    </p>
                  </div>
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Sale-to-List</p>
                    <p className="text-sm font-bold text-slate-900">
                      {redfinMetrics.avgSaleToListRatio != null
                        ? (redfinMetrics.avgSaleToListRatio * 100).toFixed(0) + "%"
                        : "\u2014"}
                    </p>
                  </div>
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Price Drops</p>
                    <p className="text-sm font-bold text-slate-900">
                      {redfinMetrics.pctPriceDrops != null
                        ? redfinMetrics.pctPriceDrops + "%"
                        : "\u2014"}
                    </p>
                  </div>
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Supply</p>
                    <p className="text-sm font-bold text-slate-900">
                      {redfinMetrics.monthsOfSupply != null
                        ? redfinMetrics.monthsOfSupply + " mo"
                        : "\u2014"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">
                    Median Sale:{" "}
                    {redfinMetrics.medianSalePrice != null
                      ? "$" + redfinMetrics.medianSalePrice.toLocaleString()
                      : "\u2014"}{" "}
                    |{" "}
                    {redfinMetrics.medianPricePerSqft != null
                      ? "$" + redfinMetrics.medianPricePerSqft.toLocaleString()
                      : "\u2014"}
                    /sqft
                  </p>
                  <p className="text-[10px] text-slate-400">Redfin</p>
                </div>
              </div>
            )}

            {/* Trend Summary Badge */}
            {marketAppreciation && (
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    marketAppreciation.trend === "appreciating"
                      ? "bg-emerald-100 text-emerald-700"
                      : marketAppreciation.trend === "declining"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {marketAppreciation.trend === "appreciating"
                    ? "Appreciating"
                    : marketAppreciation.trend === "declining"
                      ? "Declining"
                      : "Stable"}
                </span>
                {marketTemp &&
                  redfinMetrics &&
                  (redfinMetrics.inventoryCount != null ||
                    redfinMetrics.monthsOfSupply != null) && (
                    <span className="text-[10px] text-slate-400">
                      {redfinMetrics.inventoryCount != null
                        ? `${redfinMetrics.inventoryCount} active listings`
                        : ""}
                      {redfinMetrics.inventoryCount != null &&
                      redfinMetrics.monthsOfSupply != null
                        ? " | "
                        : ""}
                      {redfinMetrics.monthsOfSupply != null
                        ? `${redfinMetrics.monthsOfSupply} mo supply`
                        : ""}
                    </span>
                  )}
              </div>
            )}
          </Card>
        )}
      </FeatureGate>

      {/* ============================================================ */}
      {/* 6. RELATED PROPERTIES (Portfolio)                            */}
      {/* ============================================================ */}
      <Card
        title="Related Properties"
        icon="🏘️"
        badge={
          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
            {loadingRelated ? "Searching..." : relatedProperties.length + " found"}
          </span>
        }
      >
        {loadingRelated ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-500 border-t-transparent" />
            <span>Discovering connected properties...</span>
          </div>
        ) : relatedProperties.length > 0 ? (
          <>
            <div className="text-xs text-slate-500 mb-2">
              Properties linked through shared owners, LLCs, and head officers
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {relatedProperties.slice(0, 20).map((rp: any, i: number) => (
                <div
                  key={i}
                  onClick={() => {
                    onClose();
                    setTimeout(() => {
                      if (onNameClick) onNameClick(rp.ownerName || rp.matchedVia);
                    }, 100);
                  }}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 cursor-pointer transition-colors border border-transparent hover:border-indigo-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{rp.address}</p>
                    <p className="text-[11px] text-slate-500">
                      {rp.borough} · {rp.ownerName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-2 flex-shrink-0 text-right">
                    <div>
                      <p className="text-sm font-bold text-indigo-700">{rp.units}</p>
                      <p className="text-[9px] text-slate-400">units</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600">{rp.floors || "\u2014"} fl</p>
                    </div>
                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                      {rp.matchedVia?.split(" ")[0]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
              Total:{" "}
              <span className="font-bold text-slate-900">
                {relatedProperties
                  .reduce((s: number, rp: any) => s + (rp.units || 0), 0)
                  .toLocaleString()}{" "}
                units
              </span>{" "}
              across{" "}
              <span className="font-bold text-slate-900">
                {relatedProperties.length} properties
              </span>{" "}
              · Est. value:{" "}
              <span className="font-bold text-slate-900">
                $
                {Math.round(
                  relatedProperties.reduce(
                    (s: number, rp: any) => s + (rp.assessedValue || 0),
                    0,
                  ),
                ).toLocaleString()}
              </span>
            </div>
          </>
        ) : relatedDone ? (
          <p className="text-xs text-slate-400 py-2">
            No related properties found &mdash; this owner appears to have a single-property
            portfolio.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
