// ============================================================
// FHFA HPI + ACRIS Market Appreciation Library
// Combines FHFA metro benchmarks with ACRIS-derived zip-level
// appreciation data from actual closed sales.
// Pure library (NOT "use server")
// ============================================================

const SALES_API = "https://data.cityofnewyork.us/resource/usep-8jbt.json";

// ============================================================
// Types
// ============================================================

export interface MarketAppreciation {
  zip: string;
  localAppreciation1Yr: number | null;  // from ACRIS
  localAppreciation5Yr: number | null;  // from ACRIS
  metroAppreciation1Yr: number;         // from FHFA
  metroAppreciation5Yr: number;         // from FHFA
  medianPricePerUnit: number | null;    // current, from ACRIS
  sampleSize: number;                   // number of ACRIS sales used
  trend: "appreciating" | "stable" | "declining";
  metroName: string;
  fhfaQuarter: string;
}

// ============================================================
// FHFA Metro Benchmarks (updated quarterly)
// Source: Federal Housing Finance Agency House Price Index
// ============================================================

const FHFA_METRO: Record<string, {
  appreciation1Yr: number;
  appreciation5Yr: number;
  hpiLatest: number;
  quarter: string;
  name: string;
}> = {
  NYC: {
    appreciation1Yr: 4.8,
    appreciation5Yr: 28.2,
    hpiLatest: 642.3,
    quarter: "2025Q3",
    name: "New York-Newark-Jersey City",
  },
  Newark: {
    appreciation1Yr: 5.1,
    appreciation5Yr: 31.4,
    hpiLatest: 598.7,
    quarter: "2025Q3",
    name: "Newark-Jersey City-NJ",
  },
  Nassau: {
    appreciation1Yr: 6.2,
    appreciation5Yr: 35.1,
    hpiLatest: 701.2,
    quarter: "2025Q3",
    name: "Nassau-Suffolk, NY",
  },
};

// Map borough codes / zip prefixes to FHFA metro
function getMetro(zip: string): typeof FHFA_METRO[string] {
  const prefix = zip.slice(0, 3);
  // NJ zips: 070xx-079xx (North Jersey)
  if (prefix >= "070" && prefix <= "079") return FHFA_METRO.Newark;
  // Long Island: 110xx-119xx
  if (prefix >= "110" && prefix <= "119") return FHFA_METRO.Nassau;
  // Default: NYC metro
  return FHFA_METRO.NYC;
}

// ============================================================
// Cache — 24hr TTL, 200 max entries (zip-level)
// ============================================================

const cache = new Map<string, { data: MarketAppreciation; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;

function getCached(key: string): MarketAppreciation | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: MarketAppreciation) {
  if (cache.size >= CACHE_MAX) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ============================================================
// ACRIS-based local appreciation
// Queries DOF Rolling Sales for a zip, groups by year,
// calculates median price per unit, derives YoY appreciation
// ============================================================

interface YearlyData {
  year: number;
  medianPricePerUnit: number;
  count: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function fetchAcrisSalesForZip(zip: string): Promise<YearlyData[]> {
  try {
    const now = new Date();
    const fiveYearsAgo = new Date(now);
    fiveYearsAgo.setFullYear(now.getFullYear() - 5);
    const dateStr = fiveYearsAgo.toISOString().slice(0, 10);

    const where = `zip_code='${zip}' AND sale_price > 100000 AND residential_units > 0 AND sale_date > '${dateStr}'`;
    const url = `${SALES_API}?$where=${encodeURIComponent(where)}&$select=sale_price,residential_units,sale_date&$order=sale_date DESC&$limit=2000`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      headers: { "X-App-Token": process.env.NYC_OPEN_DATA_TOKEN || "" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];

    // Group by year and calculate median price per unit
    const byYear = new Map<number, number[]>();
    for (const sale of data) {
      const price = parseInt(String(sale.sale_price || "0").replace(/[,$]/g, ""));
      const units = parseInt(sale.residential_units || "0");
      if (price < 100000 || units < 1) continue;
      const saleDate = new Date(sale.sale_date);
      const year = saleDate.getFullYear();
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(price / units);
    }

    const result: YearlyData[] = [];
    for (const [year, ppus] of byYear) {
      if (ppus.length >= 3) {
        result.push({ year, medianPricePerUnit: Math.round(median(ppus)), count: ppus.length });
      }
    }

    return result.sort((a, b) => b.year - a.year);
  } catch {
    return [];
  }
}

// ============================================================
// Main: Get Market Appreciation for a zip code
// ============================================================

export async function getMarketAppreciation(zip: string): Promise<MarketAppreciation> {
  const cleanZip = (zip || "").replace(/\D/g, "").slice(0, 5);
  const metro = getMetro(cleanZip);

  const fallback: MarketAppreciation = {
    zip: cleanZip,
    localAppreciation1Yr: null,
    localAppreciation5Yr: null,
    metroAppreciation1Yr: metro.appreciation1Yr,
    metroAppreciation5Yr: metro.appreciation5Yr,
    medianPricePerUnit: null,
    sampleSize: 0,
    trend: "stable",
    metroName: metro.name,
    fhfaQuarter: metro.quarter,
  };

  if (!cleanZip || cleanZip.length < 5) return fallback;

  const cacheKey = `fhfa:${cleanZip}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // NYC zips only — ACRIS doesn't cover NJ
  const isNYC = cleanZip.startsWith("1") && cleanZip < "14000";
  if (!isNYC) {
    setCache(cacheKey, fallback);
    return fallback;
  }

  const yearlyData = await fetchAcrisSalesForZip(cleanZip);
  if (yearlyData.length === 0) {
    setCache(cacheKey, fallback);
    return fallback;
  }

  const currentYear = new Date().getFullYear();
  const totalSales = yearlyData.reduce((s, y) => s + y.count, 0);

  // Current = latest year with data, 1yr ago, 5yr ago
  const current = yearlyData.find(y => y.year >= currentYear - 1);
  const oneYrAgo = yearlyData.find(y => y.year === currentYear - 2) || yearlyData.find(y => y.year === currentYear - 1);
  const fiveYrAgo = yearlyData.find(y => y.year <= currentYear - 5);

  let localAppreciation1Yr: number | null = null;
  let localAppreciation5Yr: number | null = null;

  if (current && oneYrAgo && current !== oneYrAgo && oneYrAgo.medianPricePerUnit > 0) {
    localAppreciation1Yr = Math.round(((current.medianPricePerUnit - oneYrAgo.medianPricePerUnit) / oneYrAgo.medianPricePerUnit) * 1000) / 10;
  }

  if (current && fiveYrAgo && fiveYrAgo.medianPricePerUnit > 0) {
    localAppreciation5Yr = Math.round(((current.medianPricePerUnit - fiveYrAgo.medianPricePerUnit) / fiveYrAgo.medianPricePerUnit) * 1000) / 10;
  }

  // Determine trend
  let trend: MarketAppreciation["trend"] = "stable";
  if (localAppreciation1Yr !== null) {
    if (localAppreciation1Yr > 3) trend = "appreciating";
    else if (localAppreciation1Yr < -3) trend = "declining";
  }

  const result: MarketAppreciation = {
    zip: cleanZip,
    localAppreciation1Yr,
    localAppreciation5Yr,
    metroAppreciation1Yr: metro.appreciation1Yr,
    metroAppreciation5Yr: metro.appreciation5Yr,
    medianPricePerUnit: current?.medianPricePerUnit ?? null,
    sampleSize: totalSales,
    trend,
    metroName: metro.name,
    fhfaQuarter: metro.quarter,
  };

  setCache(cacheKey, result);
  return result;
}
