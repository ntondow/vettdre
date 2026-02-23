"use server";

// ============================================================
// Brave Search API — Core Wrapper
//
// Web Search + Summarizer endpoints for real estate intelligence.
// Uses BRAVE_SEARCH_API_KEY env var. Never hardcode API keys.
// ============================================================

// ---- Types ----

export interface BraveWebResult {
  title: string;
  url: string;
  description: string;
  age?: string;
  domain: string;
  thumbnail?: string;
  extra_snippets?: string[];
}

export interface BraveSearchResponse {
  query: string;
  results: BraveWebResult[];
  totalEstimatedMatches: number;
  summarizer?: {
    key: string;
    summary: string;
  };
}

export interface BraveSummarizerResponse {
  title: string;
  summary: string;
  enrichments?: { type: string; data: any }[];
}

export interface BraveSearchOptions {
  count?: number;         // results per page (max 20)
  offset?: number;        // pagination offset
  freshness?: "pd" | "pw" | "pm" | "py" | string;  // past day/week/month/year or date range
  safesearch?: "off" | "moderate" | "strict";
  country?: string;       // e.g. "US"
  search_lang?: string;   // e.g. "en"
  result_filter?: string; // e.g. "web" or "news"
  summary?: boolean;      // request AI summarizer key
}

export interface BraveBudget {
  queriesUsed: number;
  queriesLimit: number;
  summarizerUsed: number;
  summarizerLimit: number;
  resetDate: string;
}

// ---- Budget Tracking (in-memory, per server instance) ----

const budgetState: BraveBudget = {
  queriesUsed: 0,
  queriesLimit: 2000,        // Free tier: 2000/mo, Pro: 20000/mo
  summarizerUsed: 0,
  summarizerLimit: 100,       // Summarizer has lower limits
  resetDate: getMonthResetDate(),
};

function getMonthResetDate(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString().split("T")[0];
}

function checkBudgetReset() {
  const today = new Date().toISOString().split("T")[0];
  if (today >= budgetState.resetDate) {
    budgetState.queriesUsed = 0;
    budgetState.summarizerUsed = 0;
    budgetState.resetDate = getMonthResetDate();
  }
}

export async function getBraveBudget(): Promise<BraveBudget> {
  checkBudgetReset();
  return { ...budgetState };
}

// ---- API Helpers ----

const BRAVE_API_BASE = "https://api.search.brave.com/res/v1";

function getApiKey(): string {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error("BRAVE_SEARCH_API_KEY not set");
  return key;
}

async function braveRequest<T>(path: string, params: Record<string, string>, timeout = 10000): Promise<T> {
  const url = new URL(`${BRAVE_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": getApiKey(),
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Brave API ${res.status}: ${body.slice(0, 200)}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- In-memory cache (10 min TTL) ----

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

// ============================================================
// Web Search
// ============================================================

export async function braveWebSearch(query: string, options: BraveSearchOptions = {}): Promise<BraveSearchResponse> {
  checkBudgetReset();

  // Budget check
  if (budgetState.queriesUsed >= budgetState.queriesLimit) {
    console.warn("Brave Search budget exceeded for this month");
    return { query, results: [], totalEstimatedMatches: 0 };
  }

  // Cache check
  const cacheKey = `web:${query}:${JSON.stringify(options)}`;
  const cached = getCached<BraveSearchResponse>(cacheKey);
  if (cached) return cached;

  const params: Record<string, string> = {
    q: query,
    count: String(options.count || 10),
  };
  if (options.offset) params.offset = String(options.offset);
  if (options.freshness) params.freshness = options.freshness;
  if (options.safesearch) params.safesearch = options.safesearch;
  if (options.country) params.country = options.country;
  if (options.search_lang) params.search_lang = options.search_lang;
  if (options.result_filter) params.result_filter = options.result_filter;
  if (options.summary) params.summary = "1";

  const raw: any = await braveRequest("/web/search", params);
  budgetState.queriesUsed++;

  const results: BraveWebResult[] = (raw.web?.results || []).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    description: r.description || "",
    age: r.age || r.page_age || "",
    domain: new URL(r.url || "https://unknown").hostname,
    thumbnail: r.thumbnail?.src || "",
    extra_snippets: r.extra_snippets || [],
  }));

  const response: BraveSearchResponse = {
    query,
    results,
    totalEstimatedMatches: raw.web?.total_estimated_matches || results.length,
    summarizer: raw.summarizer ? { key: raw.summarizer.key, summary: "" } : undefined,
  };

  setCache(cacheKey, response);
  return response;
}

// ============================================================
// Summarizer (AI-generated summary from search results)
// ============================================================

export async function braveSummarize(summarizerKey: string): Promise<BraveSummarizerResponse | null> {
  if (!summarizerKey) return null;

  checkBudgetReset();
  if (budgetState.summarizerUsed >= budgetState.summarizerLimit) {
    console.warn("Brave Summarizer budget exceeded");
    return null;
  }

  const cacheKey = `sum:${summarizerKey}`;
  const cached = getCached<BraveSummarizerResponse>(cacheKey);
  if (cached) return cached;

  try {
    const raw: any = await braveRequest("/summarizer/search", {
      key: summarizerKey,
      entity_info: "1",
    });
    budgetState.summarizerUsed++;

    const result: BraveSummarizerResponse = {
      title: raw.title || "",
      summary: raw.summary?.[0]?.data || raw.summary || "",
      enrichments: raw.enrichments || [],
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error("Brave Summarizer error:", err);
    return null;
  }
}

// ============================================================
// Convenience: Search + Summarize in one call
// ============================================================

export async function braveSearchWithSummary(query: string, options: BraveSearchOptions = {}): Promise<BraveSearchResponse & { summaryText?: string }> {
  const searchResult = await braveWebSearch(query, { ...options, summary: true });
  let summaryText: string | undefined;

  if (searchResult.summarizer?.key) {
    const summary = await braveSummarize(searchResult.summarizer.key);
    if (summary) {
      summaryText = summary.summary;
    }
  }

  return { ...searchResult, summaryText };
}

// ============================================================
// Real Estate Specific Search Helpers
// ============================================================

/** Search for active listings at/near a specific address */
export async function searchListings(address: string, borough?: string, options: BraveSearchOptions = {}): Promise<BraveSearchResponse> {
  const location = borough ? `${address}, ${borough}, New York` : `${address}, New York`;
  const query = `"${location}" for sale listing price`;
  return braveWebSearch(query, {
    count: 10,
    freshness: "pm",  // past month — listings are time-sensitive
    country: "US",
    ...options,
  });
}

/** Search for rental comps near an address */
export async function searchRentalComps(address: string, borough?: string, options: BraveSearchOptions = {}): Promise<BraveSearchResponse> {
  const location = borough ? `${address}, ${borough}, NYC` : `${address}, NYC`;
  const query = `"${location}" apartment rent price`;
  return braveWebSearch(query, {
    count: 10,
    freshness: "pm",
    country: "US",
    ...options,
  });
}

/** Search for entity/owner news and filings */
export async function searchEntityNews(entityName: string, options: BraveSearchOptions = {}): Promise<BraveSearchResponse> {
  const query = `"${entityName}" real estate New York`;
  return braveWebSearch(query, {
    count: 10,
    country: "US",
    ...options,
  });
}

/** Search for property market data in a neighborhood */
export async function searchNeighborhoodMarket(neighborhood: string, borough: string, options: BraveSearchOptions = {}): Promise<BraveSearchResponse> {
  const query = `${neighborhood} ${borough} NYC real estate market listings for sale multifamily`;
  return braveWebSearch(query, {
    count: 15,
    freshness: "pm",
    country: "US",
    ...options,
  });
}

/** Check if Brave Search is available (API key is set) */
export async function isBraveSearchAvailable(): Promise<boolean> {
  return !!process.env.BRAVE_SEARCH_API_KEY;
}
