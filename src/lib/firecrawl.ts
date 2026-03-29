"use server";

// ============================================================
// Firecrawl API — Core Client
//
// Web scraping, search, and structured extraction via Firecrawl.
// Primary search engine for Market Intel listings, comps, and
// entity research. Falls back to Brave Search when unavailable.
//
// Uses FIRECRAWL_API_KEY env var. Never hardcode API keys.
// Docs: https://docs.firecrawl.dev
// ============================================================

// ---- Types ----

export interface FirecrawlSearchResult {
  url: string;
  title: string;
  description: string;
  markdown?: string;        // Full page content (if scrapeOptions provided)
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    statusCode?: number;
    [key: string]: any;
  };
}

export interface FirecrawlSearchResponse {
  success: boolean;
  data: FirecrawlSearchResult[];
  warning?: string;
}

export interface FirecrawlScrapeResult {
  success: boolean;
  data: {
    markdown?: string;
    html?: string;
    metadata?: Record<string, any>;
    links?: string[];
  };
  warning?: string;
}

export interface FirecrawlExtractResult {
  success: boolean;
  data: Record<string, any>;
  warning?: string;
}

export interface FirecrawlBudget {
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  resetDate: string;
}

export interface FirecrawlSearchOptions {
  limit?: number;           // Max results (default 5, max 10)
  lang?: string;            // Language filter
  country?: string;         // Country filter
  scrapeOptions?: {
    formats?: ("markdown" | "html" | "links")[];
    onlyMainContent?: boolean;
  };
  timeout?: number;         // Request timeout in ms
}

export interface FirecrawlScrapeOptions {
  formats?: ("markdown" | "html" | "links" | "screenshot")[];
  onlyMainContent?: boolean;
  waitFor?: number;         // Wait for JS rendering (ms)
  timeout?: number;
}

// ---- Budget Tracking (in-memory, per server instance) ----

const budgetState: FirecrawlBudget = {
  creditsUsed: 0,
  creditsLimit: parseInt(process.env.FIRECRAWL_MAX_CREDITS_PER_MONTH || "500", 10),
  creditsRemaining: parseInt(process.env.FIRECRAWL_MAX_CREDITS_PER_MONTH || "500", 10),
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
    budgetState.creditsUsed = 0;
    budgetState.creditsLimit = parseInt(process.env.FIRECRAWL_MAX_CREDITS_PER_MONTH || "500", 10);
    budgetState.creditsRemaining = budgetState.creditsLimit;
    budgetState.resetDate = getMonthResetDate();
  }
}

function deductCredits(amount: number) {
  budgetState.creditsUsed += amount;
  budgetState.creditsRemaining = Math.max(0, budgetState.creditsLimit - budgetState.creditsUsed);
  if (budgetState.creditsRemaining < 50) {
    console.warn(`[Firecrawl] Low credits: ${budgetState.creditsRemaining} remaining`);
  }
}

export async function getFirecrawlBudget(): Promise<FirecrawlBudget> {
  checkBudgetReset();
  return { ...budgetState };
}

// ---- API Helpers ----

const FIRECRAWL_API_BASE = "https://api.firecrawl.dev/v1";

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("FIRECRAWL_API_KEY not set");
  return key;
}

async function firecrawlRequest<T>(
  path: string,
  body: Record<string, any>,
  timeout = 15000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${FIRECRAWL_API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status === 429) {
      // Rate limited — wait 2s and retry once
      console.warn("[Firecrawl] Rate limited (429), retrying in 2s...");
      await new Promise(r => setTimeout(r, 2000));
      const retryRes = await fetch(`${FIRECRAWL_API_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!retryRes.ok) {
        const retryBody = await retryRes.text().catch(() => "");
        throw new Error(`Firecrawl API ${retryRes.status} (retry): ${retryBody.slice(0, 200)}`);
      }
      return await retryRes.json();
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Firecrawl API ${res.status}: ${errBody.slice(0, 200)}`);
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
// Search — Web search with optional page scraping
// ============================================================

export async function firecrawlSearch(
  query: string,
  options: FirecrawlSearchOptions = {},
): Promise<FirecrawlSearchResult[]> {
  checkBudgetReset();

  // Budget check (search costs ~1 credit per result)
  const estimatedCost = options.limit || 5;
  if (budgetState.creditsRemaining < estimatedCost) {
    console.warn(`[Firecrawl] Insufficient credits for search: ${budgetState.creditsRemaining}/${estimatedCost}`);
    return [];
  }

  // Cache check
  const cacheKey = `fc:search:${query}:${JSON.stringify(options)}`;
  const cached = getCached<FirecrawlSearchResult[]>(cacheKey);
  if (cached) return cached;

  const t0 = Date.now();

  const body: Record<string, any> = {
    query,
    limit: options.limit || 5,
  };
  if (options.lang) body.lang = options.lang;
  if (options.country) body.country = options.country;
  if (options.scrapeOptions) body.scrapeOptions = options.scrapeOptions;

  const response = await firecrawlRequest<FirecrawlSearchResponse>(
    "/search",
    body,
    options.timeout || 15000,
  );

  if (!response.success || !Array.isArray(response.data)) {
    console.warn("[Firecrawl] Search returned no data:", response.warning);
    return [];
  }

  // Deduct credits
  deductCredits(response.data.length);

  const duration = Date.now() - t0;
  console.info(`[Firecrawl] Search "${query.slice(0, 60)}" → ${response.data.length} results (${duration}ms, ${budgetState.creditsRemaining} credits left)`);

  setCache(cacheKey, response.data);
  return response.data;
}

// ============================================================
// Scrape — Single page content extraction
// ============================================================

export async function firecrawlScrape(
  url: string,
  options: FirecrawlScrapeOptions = {},
): Promise<FirecrawlScrapeResult["data"] | null> {
  checkBudgetReset();

  if (budgetState.creditsRemaining < 1) {
    console.warn("[Firecrawl] Insufficient credits for scrape");
    return null;
  }

  // Cache check
  const cacheKey = `fc:scrape:${url}`;
  const cached = getCached<FirecrawlScrapeResult["data"]>(cacheKey);
  if (cached) return cached;

  const t0 = Date.now();

  const body: Record<string, any> = {
    url,
    formats: options.formats || ["markdown"],
    onlyMainContent: options.onlyMainContent ?? true,
  };
  if (options.waitFor) body.waitFor = options.waitFor;

  const response = await firecrawlRequest<FirecrawlScrapeResult>(
    "/scrape",
    body,
    options.timeout || 15000,
  );

  if (!response.success) {
    console.warn(`[Firecrawl] Scrape failed for ${url}:`, response.warning);
    return null;
  }

  deductCredits(1);

  const duration = Date.now() - t0;
  console.info(`[Firecrawl] Scrape ${url.slice(0, 60)} (${duration}ms)`);

  setCache(cacheKey, response.data);
  return response.data;
}

// ============================================================
// Extract — LLM-powered structured data extraction
// ============================================================

export async function firecrawlExtract(
  urls: string[],
  schema: Record<string, any>,
  prompt?: string,
): Promise<Record<string, any> | null> {
  checkBudgetReset();

  const estimatedCost = urls.length * 5; // Extract is more expensive
  if (budgetState.creditsRemaining < estimatedCost) {
    console.warn(`[Firecrawl] Insufficient credits for extract: ${budgetState.creditsRemaining}/${estimatedCost}`);
    return null;
  }

  const body: Record<string, any> = {
    urls,
    schema,
  };
  if (prompt) body.prompt = prompt;

  const response = await firecrawlRequest<FirecrawlExtractResult>(
    "/extract",
    body,
    30000, // Extract can take longer
  );

  if (!response.success) {
    console.warn("[Firecrawl] Extract failed:", response.warning);
    return null;
  }

  deductCredits(estimatedCost);
  return response.data;
}

// ============================================================
// Availability Check
// ============================================================

export async function isFirecrawlAvailable(): Promise<boolean> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) return false;

  checkBudgetReset();
  if (budgetState.creditsRemaining < 5) {
    console.warn("[Firecrawl] Credits nearly exhausted, marking unavailable");
    return false;
  }

  return true;
}
