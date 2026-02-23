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

// ---- Types ----

export interface ParsedListing {
  address: string;
  price: number;
  priceStr: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  units?: number;
  pricePerUnit?: number;
  pricePerSqft?: number;
  daysOnMarket?: number;
  broker?: string;
  brokerage?: string;
  source: string;
  sourceUrl: string;
  sourceDomain: string;
  listingType: "sale" | "rental" | "unknown";
  priceDrop?: { amount: number; date: string };
  thumbnail?: string;
  description: string;
  parsedAt: string;
}

export interface ListingSearchResult {
  listings: ParsedListing[];
  totalFound: number;
  query: string;
  market: "nyc" | "nys" | "nj";
  searchedAt: string;
}

// ---- Price Parsing ----

/** Extract price from text — handles $1.2M, $450K, $4,800,000, etc. */
function extractPrice(text: string): number | null {
  // Match $X.XM or $XM
  const millionMatch = text.match(/\$\s*([\d,.]+)\s*[Mm](?:illion)?/);
  if (millionMatch) {
    const num = parseFloat(millionMatch[1].replace(/,/g, ""));
    if (!isNaN(num)) return Math.round(num * 1_000_000);
  }

  // Match $XXXK
  const kMatch = text.match(/\$\s*([\d,.]+)\s*[Kk]/);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(/,/g, ""));
    if (!isNaN(num)) return Math.round(num * 1_000);
  }

  // Match $X,XXX,XXX or $XXXXXXX
  const fullMatch = text.match(/\$\s*([\d,]{4,15})/);
  if (fullMatch) {
    const num = parseFloat(fullMatch[1].replace(/,/g, ""));
    if (!isNaN(num) && num >= 10_000) return Math.round(num);
  }

  return null;
}

/** Extract number of bedrooms */
function extractBeds(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:bed(?:room)?s?|br|BD)/i);
  return m ? parseInt(m[1]) : null;
}

/** Extract number of bathrooms */
function extractBaths(text: string): number | null {
  const m = text.match(/([\d.]+)\s*(?:bath(?:room)?s?|ba|BA)/i);
  return m ? parseFloat(m[1]) : null;
}

/** Extract square footage */
function extractSqft(text: string): number | null {
  const m = text.match(/([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet|sf)/i);
  if (m) {
    const num = parseInt(m[1].replace(/,/g, ""));
    if (num > 100 && num < 1_000_000) return num;
  }
  return null;
}

/** Extract number of units */
function extractUnits(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:unit|apt|apartment)s?\b/i);
  if (m) {
    const num = parseInt(m[1]);
    if (num >= 2 && num <= 10000) return num;
  }
  // "X-family" pattern
  const fm = text.match(/(\d+)\s*-?\s*family/i);
  if (fm) return parseInt(fm[1]);
  return null;
}

/** Extract days on market */
function extractDOM(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:days?\s+(?:on\s+)?(?:market|DOM|listed))/i);
  return m ? parseInt(m[1]) : null;
}

/** Extract broker/agent name */
function extractBroker(text: string): string | null {
  // "Listed by X" or "Agent: X" patterns
  const m = text.match(/(?:listed\s+by|agent|broker|courtesy\s+of)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
  return m ? m[1].trim() : null;
}

/** Extract brokerage name */
function extractBrokerage(text: string): string | null {
  const knownBrokerages = [
    "Compass", "Douglas Elliman", "Corcoran", "Sotheby", "Keller Williams",
    "RE/MAX", "Coldwell Banker", "Brown Harris Stevens", "Stribling",
    "Warburg", "Halstead", "CBRE", "Marcus & Millichap", "Cushman & Wakefield",
    "JLL", "Newmark", "Ariel Property Advisors", "B6 Real Estate",
    "TerraCRG", "GFI Realty", "Rosewood Realty", "Massey Knakal",
    "Eastern Consolidated", "Besen & Associates", "Avison Young",
  ];
  const textUp = text.toUpperCase();
  for (const b of knownBrokerages) {
    if (textUp.includes(b.toUpperCase())) return b;
  }
  return null;
}

/** Determine if listing is sale or rental */
function detectListingType(text: string): "sale" | "rental" | "unknown" {
  const lowerText = text.toLowerCase();
  const saleSignals = ["for sale", "asking price", "sale price", "buy", "purchase", "offered at", "listed at"];
  const rentSignals = ["for rent", "rental", "/month", "per month", "/mo", "lease"];
  const saleScore = saleSignals.filter(s => lowerText.includes(s)).length;
  const rentScore = rentSignals.filter(s => lowerText.includes(s)).length;
  if (saleScore > rentScore) return "sale";
  if (rentScore > saleScore) return "rental";
  return "unknown";
}

/** Extract price drop info */
function extractPriceDrop(text: string): { amount: number; date: string } | undefined {
  const m = text.match(/(?:price\s+(?:cut|drop|reduced|decrease))[^$]*\$\s*([\d,KkMm.]+)/i);
  if (m) {
    const amount = extractPrice(`$${m[1]}`);
    if (amount) return { amount, date: "" };
  }
  const m2 = text.match(/(?:reduced|down)\s+\$\s*([\d,KkMm.]+)/i);
  if (m2) {
    const amount = extractPrice(`$${m2[1]}`);
    if (amount) return { amount, date: "" };
  }
  return undefined;
}

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

function formatPriceShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

// ---- Deduplication ----

function deduplicateListings(listings: ParsedListing[]): ParsedListing[] {
  const seen = new Map<string, ParsedListing>();

  for (const listing of listings) {
    // Normalize address for dedup
    const key = listing.address.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30) + "_" + listing.price;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, listing);
    } else {
      // Keep the one with more data
      const existingScore = (existing.beds ? 1 : 0) + (existing.sqft ? 1 : 0) + (existing.units ? 1 : 0) + (existing.broker ? 1 : 0) + (existing.daysOnMarket ? 1 : 0);
      const newScore = (listing.beds ? 1 : 0) + (listing.sqft ? 1 : 0) + (listing.units ? 1 : 0) + (listing.broker ? 1 : 0) + (listing.daysOnMarket ? 1 : 0);
      if (newScore > existingScore) seen.set(key, listing);
    }
  }

  return [...seen.values()];
}

// ============================================================
// Main Search Functions
// ============================================================

/** Search for active sale listings at or near a specific address */
export async function searchPropertyListings(
  address: string,
  borough?: string,
  options?: { minPrice?: number; maxPrice?: number; propertyType?: string },
): Promise<ListingSearchResult> {
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
