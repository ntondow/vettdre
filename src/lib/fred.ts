// ============================================================
// FRED (Federal Reserve Economic Data) API Library
// Cached fetches with 24hr TTL — pure library (NOT "use server")
// Free API: https://fred.stlouisfed.org/docs/api/api_key.html
// ============================================================

const FRED_BASE = "https://api.stlouisfed.org/fred";

export interface FredObservation {
  date: string; // "2024-01-25"
  value: number;
  seriesId: string;
  title: string;
}

export interface FredSeries {
  mortgage30: FredObservation | null;
  mortgage15: FredObservation | null;
  unemployment: FredObservation | null;
  cpi: FredObservation | null;
  housingStarts: FredObservation | null;
  treasury30: FredObservation | null;
}

const SERIES_CONFIG: Record<string, string> = {
  MORTGAGE30US: "30-Year Fixed Mortgage",
  MORTGAGE15US: "15-Year Fixed Mortgage",
  UNRATE: "Unemployment Rate",
  CPIAUCSL: "CPI (All Urban)",
  HOUST: "Housing Starts",
  DGS30: "30-Year Treasury",
};

// ============================================================
// Cache — 24hr TTL, 50 max entries
// ============================================================

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX = 50;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: any) {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest entry
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
// API key — optional (graceful degradation)
// ============================================================

export function getApiKey(): string | null {
  return process.env.FRED_API_KEY || null;
}

// ============================================================
// Fetch a single FRED series (latest observation)
// ============================================================

export async function fetchFredSeries(
  seriesId: string,
  title: string,
): Promise<FredObservation | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const cacheKey = `fred:${seriesId}`;
  const cached = getCached<FredObservation>(cacheKey);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = `${FRED_BASE}/series/observations?series_id=${seriesId}&sort_order=desc&limit=1&file_type=json&api_key=${apiKey}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = await res.json();
    const obs = json.observations?.[0];
    if (!obs || obs.value === ".") return null;

    const value = parseFloat(obs.value);
    if (isNaN(value)) return null;

    const result: FredObservation = {
      date: obs.date,
      value,
      seriesId,
      title,
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ============================================================
// Fetch all 6 series in parallel
// ============================================================

export async function fetchAllFredSeries(): Promise<FredSeries> {
  const entries = Object.entries(SERIES_CONFIG);
  const results = await Promise.allSettled(
    entries.map(([id, title]) => fetchFredSeries(id, title)),
  );

  const get = (idx: number) =>
    results[idx].status === "fulfilled" ? results[idx].value : null;

  return {
    mortgage30: get(0),
    mortgage15: get(1),
    unemployment: get(2),
    cpi: get(3),
    housingStarts: get(4),
    treasury30: get(5),
  };
}

// ============================================================
// Convenience: get current 30yr mortgage rate
// ============================================================

export async function getCurrentMortgageRate(): Promise<number | null> {
  const obs = await fetchFredSeries("MORTGAGE30US", "30-Year Fixed Mortgage");
  return obs?.value ?? null;
}
