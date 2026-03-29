// ============================================================
// HUD Fair Market Rents API Library
// Zip-level FMR lookups with 30-day TTL — pure library (NOT "use server")
// Free API: https://www.huduser.gov/hudapi/public/register
// ============================================================

export interface HudFmrData {
  zip: string;
  year: number;
  studio: number;
  oneBr: number;
  twoBr: number;
  threeBr: number;
  fourBr: number;
  source: "api" | "fallback";
  metroName?: string;
}

// ============================================================
// NYC Metro Fallback (FY2025)
// Used when API token is missing or API fails
// ============================================================

const NYC_FALLBACK: Omit<HudFmrData, "zip"> = {
  year: 2025,
  studio: 1760,
  oneBr: 1945,
  twoBr: 2217,
  threeBr: 2754,
  fourBr: 2997,
  source: "fallback",
  metroName: "New York-Newark-Jersey City, NY-NJ-PA",
};

// ============================================================
// Cache — 30-day TTL, 500 max entries (zip-level granularity)
// ============================================================

const cache = new Map<string, { data: HudFmrData; ts: number }>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_MAX = 500;

function getCached(key: string): HudFmrData | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: HudFmrData) {
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
// API token — optional (graceful degradation)
// ============================================================

export function getApiToken(): string | null {
  return process.env.HUD_API_TOKEN || null;
}

// ============================================================
// Parse FMR values from HUD response (field names vary between versions)
// ============================================================

function parseFmrValue(obj: any, ...keys: string[]): number {
  for (const k of keys) {
    const val = obj[k];
    if (val != null && val !== "") {
      const n = typeof val === "number" ? val : parseFloat(String(val));
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 0;
}

// ============================================================
// Fetch FMR by zip code
// ============================================================

export async function fetchFmrByZip(zip: string): Promise<HudFmrData> {
  const cleanZip = (zip || "").replace(/\D/g, "").slice(0, 5);
  if (!cleanZip || cleanZip.length < 5) {
    return { zip: cleanZip, ...NYC_FALLBACK };
  }

  const cacheKey = `hud:${cleanZip}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const token = getApiToken();
  if (!token) {
    return { zip: cleanZip, ...NYC_FALLBACK };
  }

  try {
    const year = new Date().getFullYear();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const url = `https://www.huduser.gov/hudapi/public/fmr/data/${cleanZip}?year=${year}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { zip: cleanZip, ...NYC_FALLBACK };
    }

    const json = await res.json();
    // HUD nests data differently depending on version
    const d = json.data?.basicdata || json.data || json;

    const studio = parseFmrValue(d, "Efficiency", "efficiency", "fmr_0", "basic_fmr_0");
    const oneBr = parseFmrValue(d, "One_Bedroom", "one_bedroom", "fmr_1", "basic_fmr_1");
    const twoBr = parseFmrValue(d, "Two_Bedroom", "two_bedroom", "fmr_2", "basic_fmr_2");
    const threeBr = parseFmrValue(d, "Three_Bedroom", "three_bedroom", "fmr_3", "basic_fmr_3");
    const fourBr = parseFmrValue(d, "Four_Bedroom", "four_bedroom", "fmr_4", "basic_fmr_4");

    // If we got no valid data, use fallback
    if (studio === 0 && oneBr === 0 && twoBr === 0) {
      return { zip: cleanZip, ...NYC_FALLBACK };
    }

    const metroName = d.metro_name || d.areaname || d.area_name || undefined;

    const result: HudFmrData = {
      zip: cleanZip,
      year,
      studio,
      oneBr,
      twoBr,
      threeBr,
      fourBr,
      source: "api",
      metroName,
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return { zip: cleanZip, ...NYC_FALLBACK };
  }
}

// ============================================================
// Convert FMR to rent map format
// ============================================================

export function fmrToRentMap(fmr: HudFmrData): Record<string, number> {
  return {
    Studio: fmr.studio,
    "1BR": fmr.oneBr,
    "2BR": fmr.twoBr,
    "3BR": fmr.threeBr,
    "4BR": fmr.fourBr,
  };
}
