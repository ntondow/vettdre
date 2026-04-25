/**
 * Intel API Client — frontend wrapper for /api/intel/* endpoints.
 *
 * In-memory cache with 60s revalidation. Matches the existing useEffect
 * data-fetching pattern in the codebase (no SWR/react-query).
 *
 * Usage:
 *   const data = await intelApi.getBuilding(bbl);
 *   const units = await intelApi.getUnits(bbl, { limit: 50 });
 */

import type {
  IntelBuildingResponse,
  IntelUnitsResponse,
  IntelBuildingSignalsResponse,
  IntelEntityResponse,
  IntelEntitySearchResponse,
  IntelPortfolioResponse,
} from "./intel-api-types";

const CACHE_TTL_MS = 60_000; // 60 seconds
const CACHE_MAX = 200;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // LRU: move to end
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}

function setCache<T>(key: string, data: T, ttlMs = CACHE_TTL_MS): void {
  cache.delete(key);
  while (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
    else break;
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function fetchApi<T>(path: string, ttlMs = CACHE_TTL_MS): Promise<T | null> {
  const cached = getCached<T>(path);
  if (cached) return cached;

  try {
    const res = await fetch(path);
    if (!res.ok) {
      if (res.status === 404) return null;
      if (res.status === 401 || res.status === 403) return null;
      console.warn(`[IntelAPI] ${res.status} on ${path}`);
      return null;
    }
    const data = await res.json();
    setCache(path, data, ttlMs);
    return data;
  } catch (err) {
    console.warn(`[IntelAPI] Fetch error on ${path}:`, err);
    return null;
  }
}

export const intelApi = {
  /** Full building intelligence dossier. Cache: 60s. */
  getBuilding(bbl: string): Promise<IntelBuildingResponse | null> {
    return fetchApi(`/api/intel/buildings/${bbl}`);
  },

  /** Unit-level ownership directory. Cache: 60s. */
  getUnits(bbl: string, params?: { limit?: number; cursor?: string; filter?: string }): Promise<IntelUnitsResponse | null> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.filter) qs.set("filter", params.filter);
    const query = qs.toString();
    return fetchApi(`/api/intel/buildings/${bbl}/units${query ? `?${query}` : ""}`);
  },

  /** Building signals only. Cache: 60s. */
  getSignals(bbl: string): Promise<IntelBuildingSignalsResponse | null> {
    return fetchApi(`/api/intel/buildings/${bbl}/signals`);
  },

  /** Entity dossier. Cache: 60s. */
  getEntity(entityId: string): Promise<IntelEntityResponse | null> {
    return fetchApi(`/api/intel/entities/${entityId}`);
  },

  /** Entity name search. Cache: 5s (short — search results change). */
  searchEntities(q: string, params?: { type?: string; limit?: number }): Promise<IntelEntitySearchResponse | null> {
    const qs = new URLSearchParams({ q });
    if (params?.type) qs.set("type", params.type);
    if (params?.limit) qs.set("limit", String(params.limit));
    return fetchApi(`/api/intel/entities/search?${qs}`, 5000);
  },

  /** Entity portfolio. Cache: 60s. */
  getPortfolio(entityId: string, includeRelated = true): Promise<IntelPortfolioResponse | null> {
    return fetchApi(`/api/intel/portfolios/${entityId}?include_related=${includeRelated}`);
  },
};
