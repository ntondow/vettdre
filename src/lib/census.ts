// ============================================================
// Census Bureau API — Detailed ACS 5-Year Demographics
//
// Provides tract-level demographics: housing stock breakdown,
// commute patterns, rent burden, poverty, and time-series trends.
// Uses CENSUS_API_KEY env var. Free, no rate limits (but be polite).
// ============================================================

const BASE_URL = "https://api.census.gov/data";

// ---- Types ----

export interface CensusData {
  population: number;
  medianHouseholdIncome: number;
  medianRent: number;
  medianContractRent: number;
  medianHomeValue: number;
  occupiedUnits: number;
  vacantUnits: number;
  vacancyRate: number;
  ownerOccupied: number;
  renterOccupied: number;
  renterPct: number;
  medianAge: number;
  medianYearBuilt: number;
  povertyRate: number;
  unemploymentRate: number;
  transitCommutePct: number;
  workFromHomePct: number;
  rentBurdenPct: number;
  housingStock: {
    singleFamily: number;
    twoUnit: number;
    threeToFour: number;
    fiveToNine: number;
    tenToNineteen: number;
    twentyToFortyNine: number;
    fiftyPlus: number;
  };
  censusTract: string;
  year: number;
}

export interface CensusTrend {
  year: number;
  medianHouseholdIncome: number | null;
  medianRent: number | null;
  population: number | null;
  medianHomeValue: number | null;
  vacancyRate: number | null;
}

// ---- Variables to request ----

const VARIABLES = [
  "B01003_001E", // Total population
  "B19013_001E", // Median household income
  "B25064_001E", // Median gross rent
  "B25077_001E", // Median home value
  "B25002_002E", // Occupied housing units
  "B25002_003E", // Vacant housing units
  "B25003_002E", // Owner occupied
  "B25003_003E", // Renter occupied
  "B01002_001E", // Median age
  "B25035_001E", // Median year built
  "B25024_002E", // 1-unit detached
  "B25024_003E", // 1-unit attached
  "B25024_004E", // 2 units
  "B25024_005E", // 3-4 units
  "B25024_006E", // 5-9 units
  "B25024_007E", // 10-19 units
  "B25024_008E", // 20-49 units
  "B25024_009E", // 50+ units
  "B25058_001E", // Median contract rent
  "B17001_002E", // Population below poverty
  "B23025_005E", // Unemployed
  "B23025_002E", // In labor force
  "B08301_001E", // Total commuters
  "B08301_010E", // Public transit commuters
  "B08301_021E", // Work from home
  "B25071_001E", // Median gross rent as % of income
].join(",");

// Subset for time series (fewer vars = faster)
const TREND_VARIABLES = [
  "B01003_001E", // Total population
  "B19013_001E", // Median household income
  "B25064_001E", // Median gross rent
  "B25077_001E", // Median home value
  "B25002_002E", // Occupied
  "B25002_003E", // Vacant
].join(",");

// ---- Lazy API Key ----

function getApiKey(): string {
  const key = process.env.CENSUS_API_KEY;
  if (!key) throw new Error("CENSUS_API_KEY environment variable is not set");
  return key;
}

// ---- LRU Cache (200 entries, 24hr TTL) ----

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_MAX = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const dataCache = new Map<string, CacheEntry<CensusData>>();
const trendCache = new Map<string, CacheEntry<CensusTrend[]>>();

function cacheGet<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

function cacheSet<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---- Response Parser ----

function parseNum(val: string | null | undefined): number {
  if (val == null || val === "" || val === "-666666666" || val === "-999999999") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function parseNullableNum(val: string | null | undefined): number | null {
  if (val == null || val === "" || val === "-666666666" || val === "-999999999") return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function safeDiv(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function parseCensusResponse(headers: string[], values: string[], tract: string, year: number): CensusData {
  const idx = (varName: string) => {
    const i = headers.indexOf(varName);
    return i >= 0 ? values[i] : null;
  };

  const population = parseNum(idx("B01003_001E"));
  const medianIncome = parseNum(idx("B19013_001E"));
  const medianRent = parseNum(idx("B25064_001E"));
  const medianHomeValue = parseNum(idx("B25077_001E"));
  const occupied = parseNum(idx("B25002_002E"));
  const vacant = parseNum(idx("B25002_003E"));
  const ownerOcc = parseNum(idx("B25003_002E"));
  const renterOcc = parseNum(idx("B25003_003E"));
  const medianAge = parseNum(idx("B01002_001E"));
  const medianYearBuilt = parseNum(idx("B25035_001E"));
  const medianContractRent = parseNum(idx("B25058_001E"));
  const belowPoverty = parseNum(idx("B17001_002E"));
  const unemployed = parseNum(idx("B23025_005E"));
  const laborForce = parseNum(idx("B23025_002E"));
  const totalCommuters = parseNum(idx("B08301_001E"));
  const transitCommuters = parseNum(idx("B08301_010E"));
  const wfh = parseNum(idx("B08301_021E"));
  const rentBurden = parseNum(idx("B25071_001E"));

  // Housing stock
  const singleDetached = parseNum(idx("B25024_002E"));
  const singleAttached = parseNum(idx("B25024_003E"));
  const twoUnit = parseNum(idx("B25024_004E"));
  const threeToFour = parseNum(idx("B25024_005E"));
  const fiveToNine = parseNum(idx("B25024_006E"));
  const tenToNineteen = parseNum(idx("B25024_007E"));
  const twentyToFortyNine = parseNum(idx("B25024_008E"));
  const fiftyPlus = parseNum(idx("B25024_009E"));

  const totalHU = occupied + vacant;

  return {
    population,
    medianHouseholdIncome: medianIncome,
    medianRent,
    medianContractRent,
    medianHomeValue,
    occupiedUnits: occupied,
    vacantUnits: vacant,
    vacancyRate: totalHU > 0 ? (vacant / totalHU) * 100 : 0,
    ownerOccupied: ownerOcc,
    renterOccupied: renterOcc,
    renterPct: safeDiv(renterOcc, ownerOcc + renterOcc),
    medianAge,
    medianYearBuilt,
    povertyRate: population > 0 ? (belowPoverty / population) * 100 : 0,
    unemploymentRate: safeDiv(unemployed, laborForce),
    transitCommutePct: safeDiv(transitCommuters, totalCommuters),
    workFromHomePct: safeDiv(wfh, totalCommuters),
    rentBurdenPct: rentBurden, // Census already gives this as a %
    housingStock: {
      singleFamily: singleDetached + singleAttached,
      twoUnit,
      threeToFour,
      fiveToNine,
      tenToNineteen,
      twentyToFortyNine,
      fiftyPlus,
    },
    censusTract: tract,
    year,
  };
}

// ---- Public API ----

export async function getCensusData(
  stateFips: string,
  countyFips: string,
  tract: string,
): Promise<CensusData | null> {
  const cacheKey = `${stateFips}-${countyFips}-${tract}`;
  const cached = cacheGet(dataCache, cacheKey);
  if (cached) return cached;

  const year = 2022; // Most recent 5-year ACS
  try {
    const url = `${BASE_URL}/${year}/acs/acs5?get=${VARIABLES}&for=tract:${tract}&in=state:${stateFips}+county:${countyFips}&key=${getApiKey()}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Census API error:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;

    const headers = data[0] as string[];
    const values = data[1] as string[];
    const result = parseCensusResponse(headers, values, tract, year);
    cacheSet(dataCache, cacheKey, result);
    return result;
  } catch (error) {
    console.error("Census API error:", error);
    return null;
  }
}

export async function getCensusTimeSeries(
  stateFips: string,
  countyFips: string,
  tract: string,
): Promise<CensusTrend[]> {
  const cacheKey = `ts:${stateFips}-${countyFips}-${tract}`;
  const cached = cacheGet(trendCache, cacheKey);
  if (cached) return cached;

  const years = [2018, 2019, 2020, 2021, 2022];
  const trends: CensusTrend[] = [];

  // Fetch all years in parallel
  const fetches = years.map(async (year) => {
    try {
      const url = `${BASE_URL}/${year}/acs/acs5?get=${TREND_VARIABLES}&for=tract:${tract}&in=state:${stateFips}+county:${countyFips}&key=${getApiKey()}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 2) return null;

      const headers = data[0] as string[];
      const values = data[1] as string[];
      const idx = (v: string) => {
        const i = headers.indexOf(v);
        return i >= 0 ? values[i] : null;
      };

      const occupied = parseNum(idx("B25002_002E"));
      const vacant = parseNum(idx("B25002_003E"));
      const totalHU = occupied + vacant;

      return {
        year,
        medianHouseholdIncome: parseNullableNum(idx("B19013_001E")),
        medianRent: parseNullableNum(idx("B25064_001E")),
        population: parseNullableNum(idx("B01003_001E")),
        medianHomeValue: parseNullableNum(idx("B25077_001E")),
        vacancyRate: totalHU > 0 ? (vacant / totalHU) * 100 : null,
      } satisfies CensusTrend;
    } catch {
      return null;
    }
  });

  const results = await Promise.allSettled(fetches);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      trends.push(r.value);
    }
  }

  trends.sort((a, b) => a.year - b.year);
  cacheSet(trendCache, cacheKey, trends);
  return trends;
}
