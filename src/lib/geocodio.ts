// ============================================================
// Geocodio API — Geocoding + Census ACS Data
//
// Provides rooftop-accurate geocoding with embedded Census data.
// 2,500 free lookups/day. Lazy init, LRU cache, budget tracking.
// ============================================================

const BASE_URL = "https://api.geocod.io/v1.7";
const FIELDS = "census2020,acs-economics,acs-demographics,acs-housing";

// ---- Types ----

export interface GeocodioResult {
  input: string;
  formatted_address: string;
  lat: number;
  lng: number;
  accuracy: number;
  accuracy_type: string;
  county: string;
  state: string;
  zip: string;
  censusTract: string;
  censusBlock: string;
  countyFips: string;
  stateFips: string;
  // ACS Economics
  medianHouseholdIncome?: number;
  medianFamilyIncome?: number;
  perCapitaIncome?: number;
  povertyRate?: number;
  unemploymentRate?: number;
  // ACS Demographics
  totalPopulation?: number;
  medianAge?: number;
  // ACS Housing
  medianRentAsked?: number;
  medianHomeValue?: number;
  homeownershipRate?: number;
  vacancyRate?: number;
  medianYearBuilt?: number;
  totalHousingUnits?: number;
  renterOccupiedPct?: number;
}

// ---- Lazy API Key ----

function getApiKey(): string {
  const key = process.env.GEOCODIO_API_KEY;
  if (!key) throw new Error("GEOCODIO_API_KEY environment variable is not set");
  return key;
}

// ---- LRU Cache (500 entries, 24hr TTL) ----

interface CacheEntry {
  result: GeocodioResult;
  expiresAt: number;
}

const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): GeocodioResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Move to end (LRU)
  cache.delete(key);
  cache.set(key, entry);
  return entry.result;
}

function cacheSet(key: string, result: GeocodioResult): void {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest (first key)
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---- Budget Tracking (2,500/day) ----

const DAILY_LIMIT = 2500;
let budgetDay = "";
let budgetUsed = 0;

function checkBudget(count: number = 1): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) {
    budgetDay = today;
    budgetUsed = 0;
  }
  return budgetUsed + count <= DAILY_LIMIT;
}

function incrementBudget(count: number = 1): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) {
    budgetDay = today;
    budgetUsed = 0;
  }
  budgetUsed += count;
}

export function getGeocodioBudget(): { used: number; limit: number; remaining: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== budgetDay) return { used: 0, limit: DAILY_LIMIT, remaining: DAILY_LIMIT };
  return { used: budgetUsed, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - budgetUsed };
}

// ---- Response Parser ----

function parseResult(input: string, result: any): GeocodioResult {
  const loc = result.location || {};
  const addr = result.address_components || {};
  const fields = result.fields || {};

  // Census 2020 geography
  const census2020 = fields.census?.["2020"]?.census_2020 || {};
  const acsEcon = fields.acs?.economics?.["2022"]?.["Median household income"]
    || fields.acs?.economics?.["2021"]?.["Median household income"];

  // Navigate ACS data — Geocodio nests data by year
  const econ = fields.acs?.economics || {};
  const demo = fields.acs?.demographics || {};
  const housing = fields.acs?.housing || {};

  // Find most recent year's data
  const econYear = econ["2022"] || econ["2021"] || econ["2020"] || {};
  const demoYear = demo["2022"] || demo["2021"] || demo["2020"] || {};
  const housingYear = housing["2022"] || housing["2021"] || housing["2020"] || {};

  // Extract income data
  const incomeData = econYear["Median household income"] || {};
  const familyIncome = econYear["Median family income"] || {};
  const perCapita = econYear["Per capita income"] || {};
  const poverty = econYear["Poverty"] || {};
  const employment = econYear["Employment Status"] || {};

  // Extract demographic data
  const popData = demoYear["Total population"] || {};
  const ageData = demoYear["Median age"] || {};

  // Extract housing data
  const rentData = housingYear["Median gross rent"] || {};
  const homeValue = housingYear["Median value of owner-occupied housing units"] || {};
  const tenure = housingYear["Tenure"] || {};
  const vacancy = housingYear["Vacancy status"] || {};
  const yearBuilt = housingYear["Median year structure built"] || {};
  const totalUnits = housingYear["Total housing units"] || {};

  // Compute rates
  const ownerOcc = tenure["Owner occupied"]?.value || 0;
  const renterOcc = tenure["Renter occupied"]?.value || 0;
  const totalOcc = ownerOcc + renterOcc;
  const homeownerRate = totalOcc > 0 ? (ownerOcc / totalOcc) * 100 : undefined;
  const renterPct = totalOcc > 0 ? (renterOcc / totalOcc) * 100 : undefined;

  const vacantTotal = vacancy["Vacant"]?.value || 0;
  const totalHU = (totalUnits["Total"]?.value) || 0;
  const vacRate = totalHU > 0 ? (vacantTotal / totalHU) * 100 : undefined;

  // Unemployment
  const laborForce = employment["In labor force"]?.value || 0;
  const unemployed = employment["Unemployed"]?.value || 0;
  const unempRate = laborForce > 0 ? (unemployed / laborForce) * 100 : undefined;

  // Poverty rate
  const belowPoverty = poverty["Below poverty level"]?.value;
  const totalForPoverty = poverty["Total"]?.value;
  const povertyRate = (belowPoverty != null && totalForPoverty)
    ? (belowPoverty / totalForPoverty) * 100
    : undefined;

  return {
    input,
    formatted_address: result.formatted_address || "",
    lat: loc.lat || 0,
    lng: loc.lng || 0,
    accuracy: result.accuracy || 0,
    accuracy_type: result.accuracy_type || "",
    county: addr.county || "",
    state: addr.state || "",
    zip: addr.zip || "",
    censusTract: census2020.tract || "",
    censusBlock: census2020.block || "",
    countyFips: addr.county
      ? (census2020.full_fips || "").slice(2, 5)
      : "",
    stateFips: census2020.full_fips
      ? census2020.full_fips.slice(0, 2)
      : "",
    medianHouseholdIncome: incomeData["Total"]?.value,
    medianFamilyIncome: familyIncome["Total"]?.value,
    perCapitaIncome: perCapita["Total"]?.value,
    povertyRate,
    unemploymentRate: unempRate,
    totalPopulation: popData["Total"]?.value,
    medianAge: ageData["Total"]?.value,
    medianRentAsked: rentData["Total"]?.value,
    medianHomeValue: homeValue["Total"]?.value,
    homeownershipRate: homeownerRate,
    vacancyRate: vacRate,
    medianYearBuilt: yearBuilt["Total"]?.value,
    totalHousingUnits: totalHU || undefined,
    renterOccupiedPct: renterPct,
  };
}

// ---- Public API ----

export async function geocodeAddress(address: string): Promise<GeocodioResult | null> {
  const cacheKey = `fwd:${address.trim().toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  if (!checkBudget()) {
    console.warn("Geocodio daily budget exhausted");
    return null;
  }

  try {
    const url = `${BASE_URL}/geocode?q=${encodeURIComponent(address)}&api_key=${getApiKey()}&fields=${FIELDS}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Geocodio geocode error:", res.status, await res.text().catch(() => ""));
      return null;
    }
    incrementBudget();
    const data = await res.json();
    const results = data.results;
    if (!results || results.length === 0) return null;

    const parsed = parseResult(address, results[0]);
    cacheSet(cacheKey, parsed);
    return parsed;
  } catch (error) {
    console.error("Geocodio geocode error:", error);
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodioResult | null> {
  const cacheKey = `rev:${lat.toFixed(6)},${lng.toFixed(6)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  if (!checkBudget()) {
    console.warn("Geocodio daily budget exhausted");
    return null;
  }

  try {
    const url = `${BASE_URL}/reverse?q=${lat},${lng}&api_key=${getApiKey()}&fields=${FIELDS}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Geocodio reverse error:", res.status);
      return null;
    }
    incrementBudget();
    const data = await res.json();
    const results = data.results;
    if (!results || results.length === 0) return null;

    const parsed = parseResult(`${lat},${lng}`, results[0]);
    cacheSet(cacheKey, parsed);
    return parsed;
  } catch (error) {
    console.error("Geocodio reverse error:", error);
    return null;
  }
}

export async function batchGeocode(addresses: string[]): Promise<(GeocodioResult | null)[]> {
  if (addresses.length === 0) return [];

  // Check cache for each address first
  const results: (GeocodioResult | null)[] = new Array(addresses.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedAddresses: string[] = [];

  for (let i = 0; i < addresses.length; i++) {
    const cacheKey = `fwd:${addresses[i].trim().toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      results[i] = cached;
    } else {
      uncachedIndices.push(i);
      uncachedAddresses.push(addresses[i]);
    }
  }

  if (uncachedAddresses.length === 0) return results;
  if (!checkBudget(uncachedAddresses.length)) {
    console.warn("Geocodio daily budget insufficient for batch of", uncachedAddresses.length);
    return results;
  }

  try {
    const url = `${BASE_URL}/geocode?api_key=${getApiKey()}&fields=${FIELDS}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(uncachedAddresses),
    });
    if (!res.ok) {
      console.error("Geocodio batch error:", res.status);
      return results;
    }
    incrementBudget(uncachedAddresses.length);
    const data = await res.json();
    const batchResults = data.results;

    if (batchResults && typeof batchResults === "object") {
      // Batch response is keyed by the input address or index
      const entries = Object.values(batchResults) as any[];
      for (let i = 0; i < entries.length && i < uncachedIndices.length; i++) {
        const entry = entries[i];
        const addrResults = entry?.response?.results;
        if (addrResults && addrResults.length > 0) {
          const parsed = parseResult(uncachedAddresses[i], addrResults[0]);
          const cacheKey = `fwd:${uncachedAddresses[i].trim().toLowerCase()}`;
          cacheSet(cacheKey, parsed);
          results[uncachedIndices[i]] = parsed;
        }
      }
    }

    return results;
  } catch (error) {
    console.error("Geocodio batch error:", error);
    return results;
  }
}
