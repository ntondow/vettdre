"use server";

// ============================================================
// Firecrawl Comps — Web-Enhanced Comparable Sales via Firecrawl
//
// Searches for comparable sales and active listings near a
// property using Firecrawl's search API. Returns WebComp[]
// compatible with brave-comps.ts interface.
// ============================================================

import { firecrawlSearch } from "./firecrawl";
import type { FirecrawlSearchResult } from "./firecrawl";
import type { WebComp } from "./brave-comps";

// ---- Price/Property Extraction ----

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

const SKIP_DOMAINS = [
  "wikipedia.org", "youtube.com", "facebook.com", "twitter.com",
  "instagram.com", "reddit.com",
];

// ---- Core Parser ----

function parseWebComp(result: FirecrawlSearchResult): WebComp | null {
  const title = result.title || "";
  const description = result.description || "";
  const markdown = result.markdown || "";
  const fullText = `${title} ${description} ${markdown.slice(0, 1500)}`;

  const price = extractPrice(`${title} ${description}`) || extractPrice(fullText);
  if (!price || price < 100_000) return null;

  let domain = "";
  try { domain = new URL(result.url).hostname.toLowerCase(); } catch { domain = ""; }
  if (SKIP_DOMAINS.some(d => domain.includes(d))) return null;

  const units = extractUnits(fullText);
  const sqft = extractSqft(fullText);
  const type = detectCompType(fullText);

  let address = title
    .replace(/\s*[-|–]\s*(StreetEasy|Zillow|Realtor|Redfin|Compass|Trulia|LoopNet|CityRealty|PropertyShark|CoStar|Crexi).*$/i, "")
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
    source: title,
    sourceUrl: result.url,
    sourceDomain: domain,
    type,
    description: description.slice(0, 300),
  };
}

// ============================================================
// Main: Fetch Web Comps via Firecrawl
// ============================================================

export async function fcFetchWebComps(
  address: string,
  borough: string,
  zip?: string,
  units?: number,
): Promise<WebComp[]> {
  // Build targeted comp search queries
  const areaStr = zip ? `${borough} ${zip}` : borough;
  const unitRange = units ? `${Math.max(2, units - 10)}-${units + 10} unit` : "multifamily";

  const queries = [
    `${areaStr} NYC ${unitRange} building sold 2024 2025 price`,
    `${address} ${borough} comparable sales multifamily`,
  ];

  // Run queries in parallel
  const results = await Promise.allSettled(
    queries.map(q => firecrawlSearch(q, {
      limit: 8,
      country: "us",
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }))
  );

  const allResults: FirecrawlSearchResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allResults.push(...r.value);
  }

  // Parse and deduplicate
  const parsed = allResults
    .map(parseWebComp)
    .filter((c): c is WebComp => c !== null);

  const seen = new Set<string>();
  return parsed.filter(c => {
    const key = c.address.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 25) + "_" + c.price;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
