"use server";

// ============================================================
// Firecrawl Listings — Live listings search via Firecrawl
//
// Searches for active real estate listings using Firecrawl's
// search API with site-scoped queries targeting StreetEasy,
// Zillow, Realtor.com, etc. Parses results using the same
// extractors as brave-listings.ts for interface compatibility.
//
// Returns identical ParsedListing[] and ListingSearchResult
// interfaces so the UI layer needs zero changes.
// ============================================================

import { firecrawlSearch } from "./firecrawl";
import type { FirecrawlSearchResult } from "./firecrawl";
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

// ---- Listing Site Domains ----

const LISTING_SITES = [
  "streeteasy.com",
  "zillow.com",
  "realtor.com",
  "redfin.com",
  "loopnet.com",
  "crexi.com",
  "apartments.com",
  "compass.com",
  "cityrealty.com",
  "propertyshark.com",
];

const SKIP_DOMAINS = [
  "wikipedia.org", "youtube.com", "facebook.com", "twitter.com",
  "instagram.com", "reddit.com", "tiktok.com", "pinterest.com",
];

// ---- Core Parser ----

/** Parse a Firecrawl search result into a structured listing */
function parseListingFromFirecrawl(result: FirecrawlSearchResult): ParsedListing | null {
  // Combine all available text: title + description + markdown content
  const title = result.title || result.metadata?.title || "";
  const description = result.description || result.metadata?.description || "";
  const markdown = result.markdown || "";

  // Use title + description for quick parsing, markdown for enhanced data
  const quickText = `${title} ${description}`;
  const fullText = `${quickText} ${markdown.slice(0, 2000)}`; // Cap markdown to avoid slow regex

  const price = extractPrice(quickText) || extractPrice(fullText);
  if (!price) return null; // No price = not a useful listing result

  // Skip non-listing domains
  let domain = "";
  try {
    domain = new URL(result.url).hostname.toLowerCase();
  } catch {
    domain = "";
  }
  if (SKIP_DOMAINS.some(d => domain.includes(d))) return null;

  const listingType = detectListingType(quickText);

  // Try quick text first for structured data, fall back to full text
  const beds = extractBeds(quickText) ?? extractBeds(fullText);
  const baths = extractBaths(quickText) ?? extractBaths(fullText);
  const sqft = extractSqft(quickText) ?? extractSqft(fullText);
  const units = extractUnits(quickText) ?? extractUnits(fullText);
  const dom = extractDOM(quickText) ?? extractDOM(fullText);
  const broker = extractBroker(quickText) ?? extractBroker(fullText);
  const brokerage = extractBrokerage(quickText) ?? extractBrokerage(fullText);
  const priceDrop = extractPriceDrop(quickText) ?? extractPriceDrop(fullText);

  // Extract address from title (often "123 Main St, Brooklyn, NY - StreetEasy")
  let address = title
    .replace(/\s*[-|–]\s*(StreetEasy|Zillow|Realtor|Redfin|Compass|Trulia|LoopNet|CityRealty|PropertyShark|Apartments|CoStar|Crexi).*$/i, "")
    .replace(/\s*(for\s+sale|for\s+rent|listing|price|reduced).*$/i, "")
    .trim();

  // If address is empty or too short, try the URL-based source name
  if (address.length < 5) {
    address = result.metadata?.title || title;
  }

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
    source: title,
    sourceUrl: result.url,
    sourceDomain: domain,
    listingType,
    priceDrop,
    thumbnail: undefined, // Firecrawl doesn't return thumbnails in search
    description: description.slice(0, 300),
    parsedAt: new Date().toISOString(),
  };
}

// ============================================================
// Main Search Functions
// ============================================================

/** Search for active sale listings at or near a specific address */
export async function fcSearchPropertyListings(
  address: string,
  borough?: string,
  options?: { minPrice?: number; maxPrice?: number; propertyType?: string },
): Promise<ListingSearchResult> {
  const location = borough ? `${address}, ${borough}` : address;
  const priceClause = options?.maxPrice ? ` under $${Math.round(options.maxPrice / 1_000_000)}M` : "";
  const typeClause = options?.propertyType || "multifamily";

  // Site-scoped query for better results
  const siteScope = LISTING_SITES.slice(0, 5).map(s => `site:${s}`).join(" OR ");
  const query = `${location} for sale ${typeClause}${priceClause} (${siteScope})`;

  const results = await firecrawlSearch(query, {
    limit: 10,
    country: "us",
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
    },
  });

  const parsed = results
    .map(parseListingFromFirecrawl)
    .filter((l): l is ParsedListing => l !== null && l.listingType !== "rental");

  const deduped = deduplicateListings(parsed);

  // Apply price filters
  let filtered = deduped;
  if (options?.minPrice) filtered = filtered.filter(l => l.price >= options.minPrice!);
  if (options?.maxPrice) filtered = filtered.filter(l => l.price <= options.maxPrice!);

  return {
    listings: filtered.sort((a, b) => b.price - a.price),
    totalFound: filtered.length,
    query,
    market: "nyc",
    searchedAt: new Date().toISOString(),
  };
}

/** Search for active listings in a neighborhood/area */
export async function fcSearchAreaListings(
  area: string,
  market: "nyc" | "nys" | "nj" = "nyc",
  options?: { minPrice?: number; maxPrice?: number; minUnits?: number; propertyType?: string; count?: number },
): Promise<ListingSearchResult> {
  const stateStr = market === "nj" ? "New Jersey" : "New York";
  const typeStr = options?.propertyType || "multifamily";
  const unitStr = options?.minUnits ? ` ${options.minUnits}+ units` : "";
  const priceStr = options?.maxPrice ? ` under ${formatPriceShort(options.maxPrice)}` : "";

  // Site-scoped for real estate listing sites
  const siteScope = LISTING_SITES.slice(0, 5).map(s => `site:${s}`).join(" OR ");
  const query = `${area} ${stateStr} ${typeStr}${unitStr} for sale${priceStr} (${siteScope})`;

  const results = await firecrawlSearch(query, {
    limit: Math.min(options?.count || 10, 10),
    country: "us",
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
    },
  });

  const parsed = results
    .map(parseListingFromFirecrawl)
    .filter((l): l is ParsedListing => l !== null && l.listingType !== "rental");

  const deduped = deduplicateListings(parsed);

  let filtered = deduped;
  if (options?.minPrice) filtered = filtered.filter(l => l.price >= options.minPrice!);
  if (options?.maxPrice) filtered = filtered.filter(l => l.price <= options.maxPrice!);
  if (options?.minUnits) filtered = filtered.filter(l => (l.units || 0) >= options.minUnits!);

  return {
    listings: filtered.sort((a, b) => b.price - a.price),
    totalFound: filtered.length,
    query,
    market,
    searchedAt: new Date().toISOString(),
  };
}

/** Search for rental listings to estimate market rents */
export async function fcSearchRentalListings(
  address: string,
  borough?: string,
): Promise<ParsedListing[]> {
  const location = borough ? `${address}, ${borough}, NYC` : `${address}, NYC`;

  const rentalSites = ["streeteasy.com", "apartments.com", "zillow.com", "renthop.com"];
  const siteScope = rentalSites.map(s => `site:${s}`).join(" OR ");
  const query = `${location} apartment for rent (${siteScope})`;

  const results = await firecrawlSearch(query, {
    limit: 8,
    country: "us",
    scrapeOptions: {
      formats: ["markdown"],
      onlyMainContent: true,
    },
  });

  return results
    .map(parseListingFromFirecrawl)
    .filter((l): l is ParsedListing => l !== null)
    .map(l => ({ ...l, listingType: "rental" as const }));
}
