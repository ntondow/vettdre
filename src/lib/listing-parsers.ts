// ============================================================
// Listing Parser Utilities
//
// Pure functions for extracting structured data from listing text.
// Shared by brave-listings.ts and firecrawl-listings.ts.
// NOT a "use server" file — these are plain utility functions.
// ============================================================

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
export function extractPrice(text: string): number | null {
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
export function extractBeds(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:bed(?:room)?s?|br|BD)/i);
  return m ? parseInt(m[1]) : null;
}

/** Extract number of bathrooms */
export function extractBaths(text: string): number | null {
  const m = text.match(/([\d.]+)\s*(?:bath(?:room)?s?|ba|BA)/i);
  return m ? parseFloat(m[1]) : null;
}

/** Extract square footage */
export function extractSqft(text: string): number | null {
  const m = text.match(/([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet|sf)/i);
  if (m) {
    const num = parseInt(m[1].replace(/,/g, ""));
    if (num > 100 && num < 1_000_000) return num;
  }
  return null;
}

/** Extract number of units */
export function extractUnits(text: string): number | null {
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
export function extractDOM(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:days?\s+(?:on\s+)?(?:market|DOM|listed))/i);
  return m ? parseInt(m[1]) : null;
}

/** Extract broker/agent name */
export function extractBroker(text: string): string | null {
  const m = text.match(/(?:listed\s+by|agent|broker|courtesy\s+of)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
  return m ? m[1].trim() : null;
}

/** Extract brokerage name */
export function extractBrokerage(text: string): string | null {
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
export function detectListingType(text: string): "sale" | "rental" | "unknown" {
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
export function extractPriceDrop(text: string): { amount: number; date: string } | undefined {
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

/** Format price compactly */
export function formatPriceShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

/** Deduplicate listings by normalized address + price */
export function deduplicateListings(listings: ParsedListing[]): ParsedListing[] {
  const seen = new Map<string, ParsedListing>();

  for (const listing of listings) {
    const key = listing.address.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30) + "_" + listing.price;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, listing);
    } else {
      const existingScore = (existing.beds ? 1 : 0) + (existing.sqft ? 1 : 0) + (existing.units ? 1 : 0) + (existing.broker ? 1 : 0) + (existing.daysOnMarket ? 1 : 0);
      const newScore = (listing.beds ? 1 : 0) + (listing.sqft ? 1 : 0) + (listing.units ? 1 : 0) + (listing.broker ? 1 : 0) + (listing.daysOnMarket ? 1 : 0);
      if (newScore > existingScore) seen.set(key, listing);
    }
  }

  return [...seen.values()];
}
