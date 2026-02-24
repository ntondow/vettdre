"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchAreaListings, type ParsedListing } from "@/lib/brave-listings";
import { isBraveSearchAvailable } from "@/lib/brave-search";
import type { Market, FilterState } from "../types";

interface OnMarketSearchProps {
  market: Market;
  filters: FilterState;
}

export default function OnMarketSearch({ market, filters }: OnMarketSearchProps) {
  const router = useRouter();
  const [omResults, setOmResults] = useState<ParsedListing[]>([]);
  const [omLoading, setOmLoading] = useState(false);
  const [omArea, setOmArea] = useState("");
  const [omMinPrice, setOmMinPrice] = useState("");
  const [omMaxPrice, setOmMaxPrice] = useState("");
  const [omMinUnits, setOmMinUnits] = useState(filters.minUnits || "");
  const [omBraveAvailable, setOmBraveAvailable] = useState<boolean | null>(null);
  const [omSelectedListing, setOmSelectedListing] = useState<ParsedListing | null>(null);

  const handleSearch = async () => {
    if (!omArea.trim()) return;
    setOmLoading(true);
    setOmResults([]);
    setOmSelectedListing(null);
    try {
      const available = await isBraveSearchAvailable();
      setOmBraveAvailable(available);
      if (!available) { setOmLoading(false); return; }
      const result = await searchAreaListings(omArea.trim(), market, {
        minPrice: omMinPrice ? parseInt(omMinPrice) : undefined,
        maxPrice: omMaxPrice ? parseInt(omMaxPrice) : undefined,
        minUnits: omMinUnits ? parseInt(omMinUnits) : undefined,
      });
      setOmResults(result.listings);
    } catch (err) {
      console.error("On-market search error:", err);
    } finally {
      setOmLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-bold text-slate-900">On-Market Listings</h2>
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">Brave Search</span>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Search active real estate listings across the web. Powered by Brave Web Search API.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Area / Neighborhood</label>
            <input
              type="text"
              value={omArea}
              onChange={e => setOmArea(e.target.value)}
              placeholder={market === "nj" ? "e.g. Jersey City" : market === "nys" ? "e.g. Westchester" : "e.g. East Village, Brooklyn"}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Min Price</label>
            <input type="text" value={omMinPrice} onChange={e => setOmMinPrice(e.target.value)} placeholder="e.g. 1000000"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Max Price</label>
            <input type="text" value={omMaxPrice} onChange={e => setOmMaxPrice(e.target.value)} placeholder="e.g. 10000000"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Min Units</label>
            <input type="text" value={omMinUnits} onChange={e => setOmMinUnits(e.target.value)} placeholder="e.g. 5"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
        </div>
        <button
          onClick={handleSearch}
          disabled={omLoading || !omArea.trim()}
          className="w-full md:w-auto px-6 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
        >
          {omLoading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              Searching...
            </span>
          ) : "Search Listings"}
        </button>
      </div>

      {omBraveAvailable === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mb-6">
          <p className="text-4xl mb-3">🔑</p>
          <h3 className="text-lg font-semibold text-amber-900 mb-2">Brave Search API Key Required</h3>
          <p className="text-sm text-amber-700">
            Set <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono">BRAVE_SEARCH_API_KEY</code> in your environment variables to enable on-market listing search.
          </p>
        </div>
      )}

      {omResults.length > 0 && (
        <div>
          <p className="text-sm text-slate-500 mb-3">{omResults.length} listings found</p>
          <div className="space-y-3">
            {omResults.map((listing, i) => (
              <div
                key={i}
                onClick={() => setOmSelectedListing(omSelectedListing === listing ? null : listing)}
                className={"bg-white rounded-xl border transition-colors cursor-pointer " + (omSelectedListing === listing ? "border-green-400 ring-2 ring-green-100" : "border-slate-200 hover:border-slate-300")}
              >
                <div className="p-4 flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">LISTED</span>
                      <h3 className="text-sm font-bold text-slate-900 truncate">{listing.address}</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {listing.units && <span>{listing.units} units · </span>}
                      {listing.sqft && <span>{listing.sqft.toLocaleString()} sf · </span>}
                      {listing.brokerage && <span>{listing.brokerage} · </span>}
                      {listing.broker && <span>Agent: {listing.broker} · </span>}
                      {listing.daysOnMarket !== undefined && <span>{listing.daysOnMarket}d on market</span>}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{listing.sourceDomain}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-lg font-bold text-green-700">{listing.priceStr}</p>
                    {listing.pricePerUnit && <p className="text-xs text-slate-400">${listing.pricePerUnit.toLocaleString()}/unit</p>}
                    {listing.pricePerSqft && <p className="text-xs text-slate-400">${listing.pricePerSqft}/sf</p>}
                  </div>
                </div>
                {omSelectedListing === listing && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 rounded-b-xl">
                    <p className="text-xs text-slate-600 mb-3">{listing.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                        View Original Listing →
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          try { sessionStorage.setItem("vettdre_listing_price", JSON.stringify({ price: listing.price, address: listing.address, source: listing.sourceDomain })); } catch {}
                          router.push("/deals/new");
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                      >
                        Model This Deal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!omLoading && omResults.length === 0 && omBraveAvailable !== false && (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🏷️</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Search on-market listings</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Enter a neighborhood or area to find active real estate listings from across the web.
            Results include pricing, unit counts, brokers, and days on market.
          </p>
        </div>
      )}
    </>
  );
}
