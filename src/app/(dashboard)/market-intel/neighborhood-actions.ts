"use server";

import { geocodeAddress as geocodioGeocode, getGeocodioBudget } from "@/lib/geocodio";
import type { GeocodioResult } from "@/lib/geocodio";
import { getCensusData, getCensusTimeSeries } from "@/lib/census";
import type { CensusData, CensusTrend } from "@/lib/census";

// ---- Types (exported as interfaces — safe in "use server" files) ----

export interface NeighborhoodProfile {
  // Geocodio basics
  formattedAddress: string;
  lat: number;
  lng: number;
  accuracy: number;
  county: string;
  state: string;
  zip: string;
  censusTract: string;

  // ACS quick data (from Geocodio — always available)
  quickStats: {
    medianHouseholdIncome: number | null;
    medianRent: number | null;
    medianHomeValue: number | null;
    totalPopulation: number | null;
    medianAge: number | null;
    vacancyRate: number | null;
    renterOccupiedPct: number | null;
  };

  // Detailed Census data (from Census Bureau API)
  census: CensusData | null;

  // Trend data (from Census time series — Pro+ only)
  trends: CensusTrend[] | null;

  // Computed signals
  signals: NeighborhoodSignal[];
}

export interface NeighborhoodSignal {
  label: string;
  value: string;
  sentiment: "positive" | "negative" | "neutral";
}

// ---- Fetch function ----

export async function fetchNeighborhoodProfile(
  address: string,
  options?: { includeTrends?: boolean },
): Promise<NeighborhoodProfile | null> {
  // Check budget
  const budget = getGeocodioBudget();
  if (budget.remaining <= 0) {
    console.warn("Geocodio budget exhausted, skipping neighborhood profile");
    return null;
  }

  // Step 1: Geocode with Geocodio (returns ACS data embedded)
  const geo = await geocodioGeocode(address);
  if (!geo || !geo.lat) return null;

  const quickStats = {
    medianHouseholdIncome: geo.medianHouseholdIncome ?? null,
    medianRent: geo.medianRentAsked ?? null,
    medianHomeValue: geo.medianHomeValue ?? null,
    totalPopulation: geo.totalPopulation ?? null,
    medianAge: geo.medianAge ?? null,
    vacancyRate: geo.vacancyRate ?? null,
    renterOccupiedPct: geo.renterOccupiedPct ?? null,
  };

  // Step 2: If we have FIPS + tract, fetch detailed Census data
  let census: CensusData | null = null;
  let trends: CensusTrend[] | null = null;

  if (geo.stateFips && geo.countyFips && geo.censusTract) {
    // Fetch detailed census data
    census = await getCensusData(geo.stateFips, geo.countyFips, geo.censusTract);

    // Fetch trends if requested (Pro+ only)
    if (options?.includeTrends) {
      trends = await getCensusTimeSeries(geo.stateFips, geo.countyFips, geo.censusTract);
    }
  }

  // Step 3: Generate market signals
  const signals = generateSignals(geo, census, trends);

  return {
    formattedAddress: geo.formatted_address,
    lat: geo.lat,
    lng: geo.lng,
    accuracy: geo.accuracy,
    county: geo.county,
    state: geo.state,
    zip: geo.zip,
    censusTract: geo.censusTract,
    quickStats,
    census,
    trends,
    signals,
  };
}

// ---- Signal generator ----

function generateSignals(
  geo: GeocodioResult,
  census: CensusData | null,
  trends: CensusTrend[] | null,
): NeighborhoodSignal[] {
  const signals: NeighborhoodSignal[] = [];
  const c = census;

  // Rent burden
  if (c && c.rentBurdenPct > 0) {
    const burdened = c.rentBurdenPct > 30;
    signals.push({
      label: "Rent Burden",
      value: `Residents spend ${c.rentBurdenPct.toFixed(0)}% of income on rent${burdened ? " (rent burdened)" : ""}`,
      sentiment: burdened ? "negative" : "positive",
    });
  }

  // Transit
  if (c && c.transitCommutePct > 0) {
    signals.push({
      label: "Transit Access",
      value: `${c.transitCommutePct.toFixed(0)}% commute by public transit`,
      sentiment: c.transitCommutePct > 30 ? "positive" : "neutral",
    });
  }

  // Work from home
  if (c && c.workFromHomePct > 10) {
    signals.push({
      label: "Remote Work",
      value: `${c.workFromHomePct.toFixed(0)}% work from home`,
      sentiment: "neutral",
    });
  }

  // Poverty
  if (c && c.povertyRate > 0) {
    signals.push({
      label: "Poverty Rate",
      value: `${c.povertyRate.toFixed(0)}% below poverty line`,
      sentiment: c.povertyRate > 20 ? "negative" : c.povertyRate < 10 ? "positive" : "neutral",
    });
  }

  // Vacancy
  if (c && c.vacancyRate > 0) {
    signals.push({
      label: "Vacancy",
      value: `${c.vacancyRate.toFixed(1)}% vacancy rate`,
      sentiment: c.vacancyRate > 10 ? "negative" : c.vacancyRate < 5 ? "positive" : "neutral",
    });
  }

  // Renter vs owner
  if (c && c.renterPct > 0) {
    signals.push({
      label: "Renter Demand",
      value: `${c.renterPct.toFixed(0)}% renter occupied`,
      sentiment: c.renterPct > 60 ? "positive" : "neutral",
    });
  }

  // Trend: income growth
  if (trends && trends.length >= 2) {
    const first = trends[0];
    const last = trends[trends.length - 1];
    if (first.medianHouseholdIncome && last.medianHouseholdIncome) {
      const growth = ((last.medianHouseholdIncome - first.medianHouseholdIncome) / first.medianHouseholdIncome) * 100;
      signals.push({
        label: "Income Trend",
        value: `Median income ${growth >= 0 ? "up" : "down"} ${Math.abs(growth).toFixed(0)}% since ${first.year}`,
        sentiment: growth > 5 ? "positive" : growth < -5 ? "negative" : "neutral",
      });
    }
    if (first.medianRent && last.medianRent) {
      const growth = ((last.medianRent - first.medianRent) / first.medianRent) * 100;
      signals.push({
        label: "Rent Trend",
        value: `Median rent ${growth >= 0 ? "up" : "down"} ${Math.abs(growth).toFixed(0)}% since ${first.year}`,
        sentiment: growth > 10 ? "positive" : "neutral",
      });
    }
  }

  // Affordability calc: median income / 12 / 0.30 = max affordable rent
  if (c && c.medianHouseholdIncome > 0 && c.medianRent > 0) {
    const maxAffordable = Math.round(c.medianHouseholdIncome / 12 * 0.30);
    const gap = maxAffordable - c.medianRent;
    if (gap > 0) {
      signals.push({
        label: "Rent Headroom",
        value: `Market rent $${gap.toLocaleString()}/mo below affordability ceiling ($${maxAffordable.toLocaleString()})`,
        sentiment: "positive",
      });
    } else {
      signals.push({
        label: "Rent Stretch",
        value: `Market rent exceeds 30% income threshold by $${Math.abs(gap).toLocaleString()}/mo`,
        sentiment: "negative",
      });
    }
  }

  return signals;
}

// ---- Structured Census context for deal analysis ----

export interface CensusContextStructured {
  censusTract: string;
  county: string;
  state: string;
  zip: string;
  medianHouseholdIncome: number | null;
  medianRent: number | null;
  medianContractRent: number | null;
  vacancyRate: number | null;
  renterOccupiedPct: number | null;
  rentBurdenPct: number | null;
  transitCommutePct: number | null;
  povertyRate: number | null;
  totalPopulation: number | null;
  medianAge: number | null;
  medianHomeValue: number | null;
  maxAffordableRent: number | null;
  signals: NeighborhoodSignal[];
}

/**
 * Returns structured Census data for use in deal analysis tools.
 * Prefer this over getCensusContextForAI for programmatic consumption.
 */
export async function getCensusContextStructured(address: string): Promise<CensusContextStructured | null> {
  const profile = await fetchNeighborhoodProfile(address, { includeTrends: false });
  if (!profile) return null;

  const c = profile.census;
  const q = profile.quickStats;

  const income = c?.medianHouseholdIncome ?? q.medianHouseholdIncome ?? null;

  return {
    censusTract: profile.censusTract,
    county: profile.county,
    state: profile.state,
    zip: profile.zip,
    medianHouseholdIncome: income,
    medianRent: c?.medianRent ?? q.medianRent ?? null,
    medianContractRent: c?.medianContractRent ?? null,
    vacancyRate: c?.vacancyRate ?? q.vacancyRate ?? null,
    renterOccupiedPct: c?.renterPct ?? q.renterOccupiedPct ?? null,
    rentBurdenPct: c?.rentBurdenPct ?? null,
    transitCommutePct: c?.transitCommutePct ?? null,
    povertyRate: c?.povertyRate ?? null,
    totalPopulation: q.totalPopulation,
    medianAge: q.medianAge,
    medianHomeValue: q.medianHomeValue,
    maxAffordableRent: income ? Math.round(income / 12 * 0.30) : null,
    signals: profile.signals,
  };
}

// ---- Helper: Generate AI context string for assumptions engine ----

export async function getCensusContextForAI(address: string): Promise<string | null> {
  const profile = await fetchNeighborhoodProfile(address, { includeTrends: false });
  if (!profile) return null;

  const c = profile.census;
  const q = profile.quickStats;

  const parts: string[] = [`Census data for tract ${profile.censusTract} (${profile.county}, ${profile.state}):`];

  const income = c?.medianHouseholdIncome || q.medianHouseholdIncome;
  if (income) parts.push(`Median household income: $${income.toLocaleString()}`);

  const rent = c?.medianRent || q.medianRent;
  if (rent) parts.push(`Median gross rent: $${rent.toLocaleString()}/mo`);

  const contractRent = c?.medianContractRent;
  if (contractRent) parts.push(`Median contract rent: $${contractRent.toLocaleString()}/mo`);

  const vacancy = c?.vacancyRate ?? q.vacancyRate;
  if (vacancy != null) parts.push(`Vacancy rate: ${vacancy.toFixed(1)}%`);

  const renterPct = c?.renterPct ?? q.renterOccupiedPct;
  if (renterPct != null) parts.push(`Renter occupied: ${renterPct.toFixed(0)}%`);

  if (c?.rentBurdenPct) parts.push(`Median rent burden: ${c.rentBurdenPct.toFixed(0)}% of income`);
  if (c?.transitCommutePct) parts.push(`Transit commute: ${c.transitCommutePct.toFixed(0)}%`);
  if (c?.povertyRate) parts.push(`Poverty rate: ${c.povertyRate.toFixed(0)}%`);

  // Max affordable rent
  if (income) {
    const maxAffordable = Math.round(income / 12 * 0.30);
    parts.push(`Max affordable rent (30% rule): $${maxAffordable.toLocaleString()}/mo`);
  }

  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  NTA boundary polygons from NYC Open Data                          */
/* ------------------------------------------------------------------ */

// In-memory cache — NTA boundaries are static, fetch once per server lifetime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ntaBoundaryCache: any = null;

const NTA_ENDPOINTS = [
  "https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=500",
  "https://data.cityofnewyork.us/resource/d3c1-ddgc.geojson?$limit=500",
];

export async function fetchNTABoundaries(): Promise<{ type: string; features: any[] } | null> {
  if (ntaBoundaryCache) return ntaBoundaryCache;

  for (const url of NTA_ENDPOINTS) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) continue;

      const data = await resp.json();
      if (!data?.type || !Array.isArray(data.features) || data.features.length < 50) continue;

      // Filter to standard neighborhoods (skip parks, airports, cemeteries)
      const filtered = {
        type: "FeatureCollection" as const,
        features: data.features.filter((f: any) => {
          const t = f?.properties?.ntatype ?? f?.properties?.ntaType;
          if (t !== undefined && t !== null) return String(t) === "0";
          return true;
        }),
      };

      ntaBoundaryCache = filtered;
      return filtered;
    } catch {
      continue;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  NTA name list with bounding boxes — for dropdown filter            */
/* ------------------------------------------------------------------ */

export interface NTAEntry {
  ntaName: string;
  boroName: string;
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

// Cache — computed once from the GeoJSON
let ntaNameListCache: NTAEntry[] | null = null;

export async function fetchNTANameList(): Promise<NTAEntry[]> {
  if (ntaNameListCache) return ntaNameListCache;

  const data = await fetchNTABoundaries();
  if (!data?.features) return [];

  const entries: NTAEntry[] = [];

  for (const f of data.features) {
    const props = f?.properties;
    const ntaName = props?.ntaname || props?.NTAName || "";
    const boroName = props?.boroname || props?.boro_name || props?.BoroName || "";
    if (!ntaName || !boroName) continue;

    // Compute bounding box from polygon coordinates
    const coords = extractAllCoords(f?.geometry);
    if (coords.length === 0) continue;

    let swLat = Infinity, swLng = Infinity, neLat = -Infinity, neLng = -Infinity;
    for (const [lng, lat] of coords) {
      if (lat < swLat) swLat = lat;
      if (lat > neLat) neLat = lat;
      if (lng < swLng) swLng = lng;
      if (lng > neLng) neLng = lng;
    }

    entries.push({ ntaName, boroName, swLat, swLng, neLat, neLng });
  }

  // Sort by borough then name
  entries.sort((a, b) => a.boroName.localeCompare(b.boroName) || a.ntaName.localeCompare(b.ntaName));

  ntaNameListCache = entries;
  return entries;
}

/* ------------------------------------------------------------------ */
/*  NTA polygon coordinates — for precise spatial filtering            */
/* ------------------------------------------------------------------ */

/**
 * Returns the polygon coordinates for a given NTA neighborhood as [lat, lng][] pairs.
 * Used for point-in-polygon filtering after bounding-box pre-filter from PLUTO.
 * Returns the outer ring of the first polygon (or first polygon of MultiPolygon).
 */
export async function fetchNTAPolygon(ntaName: string): Promise<[number, number][] | null> {
  const data = await fetchNTABoundaries();
  if (!data?.features) return null;

  for (const f of data.features) {
    const props = f?.properties;
    const name = props?.ntaname || props?.NTAName || "";
    if (name !== ntaName) continue;

    const geometry = f?.geometry;
    if (!geometry) return null;

    // Extract outer ring coordinates and convert from [lng, lat] to [lat, lng]
    if (geometry.type === "Polygon" && geometry.coordinates?.[0]) {
      return geometry.coordinates[0].map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
    }
    if (geometry.type === "MultiPolygon" && geometry.coordinates?.[0]?.[0]) {
      // Use the largest polygon (most points) for MultiPolygon
      let largest = geometry.coordinates[0][0];
      for (const poly of geometry.coordinates) {
        if (poly[0] && poly[0].length > largest.length) largest = poly[0];
      }
      return largest.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
    }
    return null;
  }
  return null;
}

/** Recursively extract [lng, lat] coordinate pairs from a GeoJSON geometry */
function extractAllCoords(geometry: any): number[][] {
  if (!geometry) return [];
  const coords: number[][] = [];
  const type = geometry.type;

  if (type === "Polygon") {
    for (const ring of geometry.coordinates || []) {
      for (const pt of ring) coords.push(pt);
    }
  } else if (type === "MultiPolygon") {
    for (const polygon of geometry.coordinates || []) {
      for (const ring of polygon) {
        for (const pt of ring) coords.push(pt);
      }
    }
  }

  return coords;
}
