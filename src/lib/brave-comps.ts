"use server";

// ============================================================
// Brave Comps — Web-Enhanced Comparable Sales
//
// Merges Brave web search results with DOF Rolling Sales data
// for richer comp analysis. Finds web-listed comps, recent
// sales mentions, and market pricing that DOF may not yet reflect.
// ============================================================

import { braveWebSearch, isBraveSearchAvailable } from "./brave-search";
import type { BraveWebResult } from "./brave-search";

// ---- Types ----

export interface WebComp {
  address: string;
  price: number;
  priceStr: string;
  pricePerUnit?: number;
  pricePerSqft?: number;
  units?: number;
  sqft?: number;
  saleDate?: string;
  source: string;
  sourceUrl: string;
  sourceDomain: string;
  type: "sale" | "listing" | "pending";
  description: string;
}

export interface EnhancedCompSummary {
  webComps: WebComp[];
  webAvgPricePerUnit: number;
  webMedianPricePerUnit: number;
  webAvgPricePerSqft: number;
  dofAvgPricePerUnit: number;
  dofMedianPricePerUnit: number;
  priceGap: number;           // % difference between web and DOF pricing
  marketTrend: "rising" | "stable" | "declining" | "unknown";
  marketInsight: string;
  searchedAt: string;
}

// ---- Price Extraction (shared with brave-listings but specialized for comps) ----

function extractPrice(text: string): number | null {
  const mM = text.match(/\$\s*([\d,.]+)\s*[Mm](?:illion)?/);
  if (mM) { const n = parseFloat(mM[1].replace(/,/g, "")); if (!isNaN(n)) return Math.round(n * 1_000_000); }
  const mK = text.match(/\$\s*([\d,.]+)\s*[Kk]/);
  if (mK) { const n = parseFloat(mK[1].replace(/,/g, "")); if (!isNaN(n)) return Math.round(n * 1_000); }
  const mFull = text.match(/\$\s*([\d,]{6,15})/);
  if (mFull) { const n = parseFloat(mFull[1].replace(/,/g, "")); if (!isNaN(n) && n >= 100_000) return Math.round(n); }
  return null;
}

function extractUnits(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:unit|apt)s?\b/i);
  if (m) { const n = parseInt(m[1]); if (n >= 2 && n <= 10000) return n; }
  const fm = text.match(/(\d+)\s*-?\s*family/i);
  if (fm) return parseInt(fm[1]);
  return null;
}

function extractSqft(text: string): number | null {
  const m = text.match(/([\d,]+)\s*(?:sq\.?\s*ft\.?|sqft|sf)/i);
  if (m) { const n = parseInt(m[1].replace(/,/g, "")); if (n > 100 && n < 1_000_000) return n; }
  return null;
}

function detectCompType(text: string): "sale" | "listing" | "pending" {
  const lower = text.toLowerCase();
  if (lower.includes("sold") || lower.includes("closed") || lower.includes("sale date")) return "sale";
  if (lower.includes("pending") || lower.includes("under contract") || lower.includes("in contract")) return "pending";
  return "listing";
}

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ---- Core Parser ----

function parseWebComp(result: BraveWebResult): WebComp | null {
  const fullText = `${result.title} ${result.description} ${(result.extra_snippets || []).join(" ")}`;
  const price = extractPrice(fullText);
  if (!price || price < 100_000) return null;

  // Skip non-real-estate domains
  const domain = result.domain.toLowerCase();
  const skipDomains = ["wikipedia.org", "youtube.com", "facebook.com", "twitter.com", "reddit.com"];
  if (skipDomains.some(d => domain.includes(d))) return null;

  const units = extractUnits(fullText);
  const sqft = extractSqft(fullText);
  const type = detectCompType(fullText);

  let address = result.title
    .replace(/\s*[-|–]\s*(StreetEasy|Zillow|Realtor|Redfin|Compass|Trulia|LoopNet|CityRealty|PropertyShark|CoStar).*$/i, "")
    .replace(/\s*(for\s+sale|sold|pending|listing|price).*$/i, "")
    .trim();

  return {
    address,
    price,
    priceStr: formatPrice(price),
    pricePerUnit: units && units > 0 ? Math.round(price / units) : undefined,
    pricePerSqft: sqft && sqft > 0 ? Math.round(price / sqft) : undefined,
    units: units ?? undefined,
    sqft: sqft ?? undefined,
    source: result.title,
    sourceUrl: result.url,
    sourceDomain: result.domain,
    type,
    description: result.description.slice(0, 300),
  };
}

// ============================================================
// Main: Fetch Web Comps for a Property
// ============================================================

export async function fetchWebComps(
  address: string,
  borough: string,
  zip?: string,
  units?: number,
): Promise<WebComp[]> {
  const available = await isBraveSearchAvailable();
  if (!available) return [];

  // Build targeted comp search queries
  const queries: string[] = [];

  // 1. Direct area comps
  const areaStr = zip ? `${borough} ${zip}` : borough;
  const unitRange = units ? `${Math.max(2, units - 10)}-${units + 10} unit` : "multifamily";
  queries.push(`${areaStr} NYC ${unitRange} building sold 2024 2025 price`);

  // 2. Nearby active listings as comps
  queries.push(`${address} ${borough} comparable sales multifamily`);

  // Run queries in parallel
  const results = await Promise.allSettled(
    queries.map(q => braveWebSearch(q, { count: 10, freshness: "py", country: "US" }))
  );

  const allResults: BraveWebResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allResults.push(...r.value.results);
  }

  // Parse and deduplicate
  const parsed = allResults
    .map(parseWebComp)
    .filter((c): c is WebComp => c !== null);

  // Deduplicate by normalized address + price
  const seen = new Set<string>();
  return parsed.filter(c => {
    const key = c.address.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 25) + "_" + c.price;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================
// Enhanced Comp Summary: Merge Web + DOF
// ============================================================

export async function buildEnhancedCompSummary(
  webComps: WebComp[],
  dofComps: { pricePerUnit: number; pricePerSqft: number }[],
): Promise<EnhancedCompSummary> {
  const webPPU = webComps.map(c => c.pricePerUnit).filter((n): n is number => !!n && n > 0);
  const webPPS = webComps.map(c => c.pricePerSqft).filter((n): n is number => !!n && n > 0);
  const dofPPU = dofComps.map(c => c.pricePerUnit).filter(n => n > 0);
  const dofPPS = dofComps.map(c => c.pricePerSqft).filter(n => n > 0);

  const webAvgPPU = webPPU.length > 0 ? Math.round(webPPU.reduce((a, b) => a + b, 0) / webPPU.length) : 0;
  const webMedPPU = median(webPPU);
  const webAvgPPS = webPPS.length > 0 ? Math.round(webPPS.reduce((a, b) => a + b, 0) / webPPS.length) : 0;
  const dofAvgPPU = dofPPU.length > 0 ? Math.round(dofPPU.reduce((a, b) => a + b, 0) / dofPPU.length) : 0;
  const dofMedPPU = median(dofPPU);

  // Price gap: how much web pricing differs from DOF (+ = web higher = rising market)
  let priceGap = 0;
  if (dofMedPPU > 0 && webMedPPU > 0) {
    priceGap = Math.round(((webMedPPU - dofMedPPU) / dofMedPPU) * 100);
  }

  // Market trend
  let marketTrend: "rising" | "stable" | "declining" | "unknown" = "unknown";
  if (priceGap > 10) marketTrend = "rising";
  else if (priceGap > -5) marketTrend = "stable";
  else if (priceGap < -10) marketTrend = "declining";

  // Insight
  let marketInsight = "";
  if (webComps.length === 0 && dofComps.length === 0) {
    marketInsight = "Insufficient comp data available.";
  } else if (priceGap > 15) {
    marketInsight = `Active listings are ${priceGap}% above recent sales — sellers' market. Recent buyers may have built-in equity.`;
  } else if (priceGap > 5) {
    marketInsight = `Asking prices slightly above recent sales (+${priceGap}%). Market is appreciating modestly.`;
  } else if (priceGap < -10) {
    marketInsight = `Asking prices ${Math.abs(priceGap)}% below recent sales — possible softening. Good entry point for buyers.`;
  } else {
    marketInsight = `Web listings and recent sales within ${Math.abs(priceGap)}% — stable market pricing.`;
  }

  return {
    webComps,
    webAvgPricePerUnit: webAvgPPU,
    webMedianPricePerUnit: webMedPPU,
    webAvgPricePerSqft: webAvgPPS,
    dofAvgPricePerUnit: dofAvgPPU,
    dofMedianPricePerUnit: dofMedPPU,
    priceGap,
    marketTrend,
    marketInsight,
    searchedAt: new Date().toISOString(),
  };
}
