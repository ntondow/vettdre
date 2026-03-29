"use server";

// ============================================================
// Brave Listings — Live listings search via Brave Web Search
//
// Searches for active real estate listings, parses structured
// data from results (price, beds, sqft, broker, DOM, URL),
// deduplicates, and returns clean listing objects.
// ============================================================

import { braveWebSearch, isBraveSearchAvailable } from "./brave-search";
import type { BraveWebResult } from "./brave-search";
import { isFirecrawlAvailable } from "./firecrawl";
import {
  fcSearchPropertyListings,
  fcSearchAreaListings,
  fcSearchRentalListings,
} from "./firecrawl-listings";

import {
  extractPrice,
  extractBeds,
  extractBaths,
  extractSqft,
  extractUnits,
  extractDOM,
  extractBroker,
  extractBrokerage,
  detectListingType,
  extractPriceDrop,
  formatPriceShort,
  deduplicateListings,
} from "./listing-parsers";
import type { ParsedListing, ListingSearchResult } from "./listing-parsers";

// ---- Core Parser ----

/** Parse a Brave web result into a structured listing */
function parseListingFromResult(result: BraveWebResult): ParsedListing | null {
  const fullText = `${result.title} ${result.description} ${(result.extra_snippets || []).join(" ")}`;

  const price = extractPrice(fullText);
  if (!price) return null; // No price = not a useful listing result

  // Skip results that are clearly not listings
  const domain = result.domain.toLowerCase();
  const skipDomains = ["wikipedia.org", "youtube.com", "facebook.com", "twitter.com", "instagram.com", "reddit.com"];
  if (skipDomains.some(d => domain.includes(d))) return null;

  const listingType = detectListingType(fullText);
  const beds = extractBeds(fullText);
  const baths = extractBaths(fullText);
  const sqft = extractSqft(fullText);
  const units = extractUnits(fullText);
  const dom = extractDOM(fullText);
  const broker = extractBroker(fullText);
  const brokerage = extractBrokerage(fullText);
  const priceDrop = extractPriceDrop(fullText);

  // Extract address from title (often "123 Main St, Brooklyn, NY" format)
  let address = result.title.replace(/\s*[-|–]\s*(StreetEasy|Zillow|Realtor|Redfin|Compass|Trulia|LoopNet|CityRealty|PropertyShark|Apartments|CoStar).*$/i, "").trim();
  // If title has "for sale" etc, trim it
  address = address.replace(/\s*(for\s+sale|for\s+rent|listing|price|reduced).*$/i, "").trim();

  return {
    address,
    price,
    priceStr: formatPriceShort(price),
    beds: beds ?? undefined,
    baths: baths ?? undefined,
    sqft: sqft ?? undefined,
    units: units ?? undefined,
    pricePerUnit: units && units > 0 ? Math.round(price / units) : undefined,
    pricePerSqft: sqft && sqft > 0 ? Math.round(price / sqft) : undefined,
    daysOnMarket: dom ?? undefined,
    broker: broker ?? undefined,
    brokerage: brokerage ?? undefined,
    source: result.title,
    sourceUrl: result.url,
    sourceDomain: result.domain,
    listingType,
    priceDrop,
    thumbnail: result.thumbnail,
    description: result.description.slice(0, 300),
    parsedAt: new Date().toISOString(),
  };
}

// formatPriceShort and deduplicateListings are re-exported from listing-parsers.ts above

// ============================================================
// Main Search Functions
// ============================================================

/** Search for active sale listings at or near a specific address */
export async function searchPropertyListings(
  address: string,
  borough?: string,
  options?: { minPrice?: number; maxPrice?: number; propertyType?: string },
): Promise<ListingSearchResult> {
  // Try Firecrawl first (primary)
  if (await isFirecrawlAvailable()) {
    try {
      const result = await fcSearchPropertyListings(address, borough, options);
      if (result.listings.length > 0) return result;
      console.info("[Listings] Firecrawl returned 0 results, trying Brave");
    } catch (err: any) {
      console.warn("[Listings] Firecrawl failed, falling back to Brave:", err?.message);
    }
  }

  // Fallback to Brave
  const available = await isBraveSearchAvailable();
  if (!available) {
    return { listings: [], totalFound: 0, query: "", market: "nyc", searchedAt: new Date().toISOString() };
  }

  const location = borough ? `${address}, ${borough}` : address;
  const priceClause = options?.maxPrice ? ` under $${Math.round(options.maxPrice / 1_000_000)}M` : "";
  const typeClause = options?.propertyType ? ` ${options.propertyType}` : " multifamily";
  const query = `"${location}" for sale${typeClause}${priceClause} listing price`;

  const searchResult = await braveWebSearch(query, {
    count: 15,
    freshness: "pm",
    country: "US",
  });

  const parsed = searchResult.results
    .map(parseListingFromResult)
    .filter((l): l is ParsedListing => l !== null && l.listingType !== "rental");

  const deduped = deduplicateListings(parsed);

  // Apply price filters
  let filtered = deduped;
  if (options?.minPrice) filtered = filtered.filter(l => l.price >= options.minPrice!);
  if (options?.maxPrice) filtered = filtered.filter(l => l.price <= options.maxPrice!);

  return {
    listings: filtered.sort((a, b) => b.price - a.price),
    totalFound: searchResult.totalEstimatedMatches,
    query,
    market: "nyc",
    searchedAt: new Date().toISOString(),
  };
}

/** Search for active listings in a neighborhood/area */
export async function searchAreaListings(
  area: string,
  market: "nyc" | "nys" | "nj" = "nyc",
  options?: { minPrice?: number; maxPrice?: number; minUnits?: number; propertyType?: string; count?: number },
): Promise<ListingSearchResult> {
  // Try Firecrawl first (primary)
  if (await isFirecrawlAvailable()) {
    try {
      const result = await fcSearchAreaListings(area, market, options);
      if (result.listings.length > 0) return result;
      console.info("[Listings] Firecrawl area search returned 0 results, trying Brave");
    } catch (err: any) {
      console.warn("[Listings] Firecrawl area search failed, falling back to Brave:", err?.message);
    }
  }

  // Fallback to Brave
  const available = await isBraveSearchAvailable();
  if (!available) {
    return { listings: [], totalFound: 0, query: "", market, searchedAt: new Date().toISOString() };
  }

  const stateStr = market === "nj" ? "New Jersey" : "New York";
  const typeStr = options?.propertyType || "multifamily";
  const unitStr = options?.minUnits ? ` ${options.minUnits}+ units` : "";
  const priceStr = options?.maxPrice ? ` under ${formatPriceShort(options.maxPrice)}` : "";

  const query = `${area} ${stateStr} ${typeStr}${unitStr} for sale${priceStr} listing`;

  const searchResult = await braveWebSearch(query, {
    count: options?.count || 15,
    freshness: "pm",
    country: "US",
  });

  const parsed = searchResult.results
    .map(parseListingFromResult)
    .filter((l): l is ParsedListing => l !== null && l.listingType !== "rental");

  const deduped = deduplicateListings(parsed);

  let filtered = deduped;
  if (options?.minPrice) filtered = filtered.filter(l => l.price >= options.minPrice!);
  if (options?.maxPrice) filtered = filtered.filter(l => l.price <= options.maxPrice!);
  if (options?.minUnits) filtered = filtered.filter(l => (l.units || 0) >= options.minUnits!);

  return {
    listings: filtered.sort((a, b) => b.price - a.price),
    totalFound: searchResult.totalEstimatedMatches,
    query,
    market,
    searchedAt: new Date().toISOString(),
  };
}

/** Search for rental listings to estimate market rents */
export async function searchRentalListings(
  address: string,
  borough?: string,
): Promise<ParsedListing[]> {
  // Try Firecrawl first (primary)
  if (await isFirecrawlAvailable()) {
    try {
      const results = await fcSearchRentalListings(address, borough);
      if (results.length > 0) return results;
      console.info("[Listings] Firecrawl rental search returned 0 results, trying Brave");
    } catch (err: any) {
      console.warn("[Listings] Firecrawl rental search failed, falling back to Brave:", err?.message);
    }
  }

  // Fallback to Brave
  const available = await isBraveSearchAvailable();
  if (!available) return [];

  const location = borough ? `${address}, ${borough}, NYC` : `${address}, NYC`;
  const query = `"${location}" apartment for rent price per month`;

  const searchResult = await braveWebSearch(query, {
    count: 10,
    freshness: "pm",
    country: "US",
  });

  return searchResult.results
    .map(parseListingFromResult)
    .filter((l): l is ParsedListing => l !== null)
    .map(l => ({ ...l, listingType: "rental" as const }));
}
