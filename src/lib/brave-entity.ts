"use server";

// ============================================================
// Brave Entity Research — Owner & Entity Web Intelligence
//
// Searches the web for information about property owners,
// LLCs, and real estate entities. Finds news articles, court
// filings, corporate records, and portfolio mentions.
// ============================================================

import { braveWebSearch, braveSearchWithSummary, isBraveSearchAvailable } from "./brave-search";
import type { BraveWebResult } from "./brave-search";

// ---- Types ----

export interface EntityWebIntelligence {
  entityName: string;
  newsArticles: WebArticle[];
  courtFilings: WebArticle[];
  corporateRecords: WebArticle[];
  portfolioMentions: WebArticle[];
  socialProfiles: WebArticle[];
  aiSummary?: string;
  totalResults: number;
  searchedAt: string;
}

export interface WebArticle {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  age?: string;
  category: "news" | "court" | "corporate" | "portfolio" | "social" | "other";
  sentiment?: "positive" | "negative" | "neutral";
}

// ---- Categorization ----

const NEWS_DOMAINS = [
  "nytimes.com", "wsj.com", "bloomberg.com", "reuters.com", "therealdeal.com",
  "commercialobserver.com", "crainsnewyork.com", "nypost.com", "nydailynews.com",
  "gothamist.com", "curbed.com", "bisnow.com", "globest.com", "costar.com",
  "multihousingnews.com", "connectcre.com", "rejournals.com", "patch.com",
];

const COURT_DOMAINS = [
  "courtlistener.com", "unicourt.com", "law.justia.com", "nycourts.gov",
  "pacer.uscourts.gov", "iapps.courts.state.ny.us", "ecourts.courts.state.ny.us",
  "apps.courts.state.ny.us",
];

const CORPORATE_DOMAINS = [
  "opencorporates.com", "corporationwiki.com", "bizapedia.com",
  "dos.ny.gov", "appext20.dos.ny.gov", "llcbuddy.com",
  "sec.gov", "edgar-online.com",
];

const SOCIAL_DOMAINS = [
  "linkedin.com", "crunchbase.com", "dnb.com", "zoominfo.com",
];

function categorizeResult(result: BraveWebResult): WebArticle["category"] {
  const domain = result.domain.toLowerCase();
  if (NEWS_DOMAINS.some(d => domain.includes(d))) return "news";
  if (COURT_DOMAINS.some(d => domain.includes(d))) return "court";
  if (CORPORATE_DOMAINS.some(d => domain.includes(d))) return "corporate";
  if (SOCIAL_DOMAINS.some(d => domain.includes(d))) return "social";

  // Content-based categorization
  const text = `${result.title} ${result.description}`.toLowerCase();
  if (text.includes("lawsuit") || text.includes("litigation") || text.includes("court") || text.includes("filing") || text.includes("violation")) return "court";
  if (text.includes("portfolio") || text.includes("properties") || text.includes("building") || text.includes("owns") || text.includes("acquired")) return "portfolio";
  if (text.includes("llc") || text.includes("corporation") || text.includes("registered") || text.includes("incorporated")) return "corporate";

  return "other";
}

function detectSentiment(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const negativeWords = ["lawsuit", "violation", "penalty", "sued", "fraud", "complaint", "harass", "negligent", "default", "foreclosure", "bankruptcy", "condemned", "unsafe"];
  const positiveWords = ["award", "honor", "philanthrop", "donated", "invested", "developed", "renovated", "upgraded", "landmark", "restored"];
  const negScore = negativeWords.filter(w => lower.includes(w)).length;
  const posScore = positiveWords.filter(w => lower.includes(w)).length;
  if (negScore > posScore) return "negative";
  if (posScore > negScore) return "positive";
  return "neutral";
}

function parseArticle(result: BraveWebResult): WebArticle {
  const category = categorizeResult(result);
  const fullText = `${result.title} ${result.description}`;
  const sentiment = detectSentiment(fullText);

  return {
    title: result.title,
    url: result.url,
    domain: result.domain,
    snippet: result.description.slice(0, 400),
    age: result.age,
    category,
    sentiment,
  };
}

// ============================================================
// Main: Research an Entity
// ============================================================

export async function researchEntity(
  entityName: string,
  options?: { includeAiSummary?: boolean; additionalContext?: string },
): Promise<EntityWebIntelligence> {
  const available = await isBraveSearchAvailable();
  if (!available) {
    return {
      entityName,
      newsArticles: [],
      courtFilings: [],
      corporateRecords: [],
      portfolioMentions: [],
      socialProfiles: [],
      totalResults: 0,
      searchedAt: new Date().toISOString(),
    };
  }

  // Run multiple focused searches in parallel
  const context = options?.additionalContext || "real estate New York";
  const queries = [
    `"${entityName}" ${context}`,
    `"${entityName}" lawsuit violation filing NYC`,
  ];

  const results = await Promise.allSettled(
    queries.map(q =>
      options?.includeAiSummary && q === queries[0]
        ? braveSearchWithSummary(q, { count: 15, country: "US" })
        : braveWebSearch(q, { count: 10, country: "US" })
    )
  );

  // Collect and categorize all results
  const allArticles: WebArticle[] = [];
  let aiSummary: string | undefined;

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const searchResult = r.value;
    for (const webResult of searchResult.results) {
      allArticles.push(parseArticle(webResult));
    }
    const asAny = searchResult as any;
    if (asAny.summaryText) {
      aiSummary = String(asAny.summaryText);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = allArticles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  // Categorize
  const newsArticles = deduped.filter(a => a.category === "news");
  const courtFilings = deduped.filter(a => a.category === "court");
  const corporateRecords = deduped.filter(a => a.category === "corporate");
  const portfolioMentions = deduped.filter(a => a.category === "portfolio");
  const socialProfiles = deduped.filter(a => a.category === "social");

  return {
    entityName,
    newsArticles,
    courtFilings,
    corporateRecords,
    portfolioMentions,
    socialProfiles,
    aiSummary,
    totalResults: deduped.length,
    searchedAt: new Date().toISOString(),
  };
}

// ============================================================
// Quick Entity Check — Lightweight reputation scan
// ============================================================

export async function quickEntityCheck(entityName: string): Promise<{
  hasNegativeNews: boolean;
  hasLawsuits: boolean;
  hasCorporateRecords: boolean;
  articleCount: number;
  topIssue?: string;
}> {
  const available = await isBraveSearchAvailable();
  if (!available) {
    return { hasNegativeNews: false, hasLawsuits: false, hasCorporateRecords: false, articleCount: 0 };
  }

  const searchResult = await braveWebSearch(
    `"${entityName}" real estate New York lawsuit violation`,
    { count: 5, country: "US" }
  );

  const articles = searchResult.results.map(parseArticle);
  const hasNegativeNews = articles.some(a => a.category === "news" && a.sentiment === "negative");
  const hasLawsuits = articles.some(a => a.category === "court");
  const hasCorporateRecords = articles.some(a => a.category === "corporate");

  // Find the most concerning issue
  const negativeArticle = articles.find(a => a.sentiment === "negative");
  const topIssue = negativeArticle?.snippet;

  return {
    hasNegativeNews,
    hasLawsuits,
    hasCorporateRecords,
    articleCount: articles.length,
    topIssue: topIssue?.slice(0, 200),
  };
}

// ============================================================
// Property Web Intelligence — Search for a specific property
// ============================================================

export async function researchProperty(
  address: string,
  borough?: string,
): Promise<WebArticle[]> {
  const available = await isBraveSearchAvailable();
  if (!available) return [];

  const location = borough ? `${address}, ${borough}` : address;
  const searchResult = await braveWebSearch(
    `"${location}" New York building`,
    { count: 10, country: "US" }
  );

  return searchResult.results
    .map(parseArticle)
    .filter(a => a.category !== "other"); // Only keep categorized results
}
