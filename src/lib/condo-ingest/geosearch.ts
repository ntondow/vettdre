/**
 * NYC Planning Labs GeoSearch — address → BBL resolver.
 *
 * Primary resolver for NYC addresses. No API key required.
 * Falls back to existing Geocodio integration for non-NYC addresses.
 *
 * API: https://geosearch.planninglabs.nyc/v2/search
 */

const GEOSEARCH_BASE = "https://geosearch.planninglabs.nyc/v2/search";
const FETCH_TIMEOUT = 5000;

// LRU cache — addresses don't change
const LRU_MAX = 5000;
const cache = new Map<string, GeoSearchResult | null>();

export interface GeoSearchResult {
  bbl: string;
  lat: number;
  lng: number;
  normalizedAddress: string;
  borough: string;
  neighborhood: string;
}

const BORO_NAMES: Record<string, string> = {
  "1": "Manhattan",
  "2": "Bronx",
  "3": "Brooklyn",
  "4": "Queens",
  "5": "Staten Island",
};

/**
 * Resolve a NYC address to BBL + coordinates via Planning Labs GeoSearch.
 * Returns null if no match found or non-NYC address.
 */
export async function geoSearch(address: string): Promise<GeoSearchResult | null> {
  const key = address.trim().toUpperCase();
  if (!key) return null;

  // Check LRU cache
  if (cache.has(key)) return cache.get(key) || null;

  try {
    const url = `${GEOSEARCH_BASE}?text=${encodeURIComponent(address)}&size=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[GeoSearch] HTTP ${res.status} for "${address}"`);
      return null;
    }

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) {
      cacheSet(key, null);
      return null;
    }

    const props = feature.properties || {};
    const pad = props.addendum?.pad;
    const bbl = pad?.bbl || null;
    if (!bbl) {
      cacheSet(key, null);
      return null;
    }

    const [lng, lat] = feature.geometry?.coordinates || [0, 0];
    const boroCode = bbl.charAt(0);

    const result: GeoSearchResult = {
      bbl,
      lat,
      lng,
      normalizedAddress: props.label || address,
      borough: BORO_NAMES[boroCode] || "",
      neighborhood: props.neighbourhood || props.locality || "",
    };

    cacheSet(key, result);
    return result;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      console.warn(`[GeoSearch] Timeout for "${address}"`);
    } else {
      console.error(`[GeoSearch] Error for "${address}":`, err);
    }
    return null;
  }
}

function cacheSet(key: string, value: GeoSearchResult | null) {
  // Evict oldest entries if over capacity
  if (cache.size >= LRU_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, value);
}

/**
 * Build a normalized address string from street number + name for GeoSearch lookup.
 */
export function buildSearchAddress(
  houseNumber: string | null | undefined,
  streetName: string | null | undefined,
  borough: string | null | undefined,
): string {
  const parts: string[] = [];
  if (houseNumber) parts.push(houseNumber.trim());
  if (streetName) parts.push(streetName.trim());
  if (borough) parts.push(borough.trim());
  else parts.push("New York, NY"); // fallback for GeoSearch context
  return parts.join(" ");
}
