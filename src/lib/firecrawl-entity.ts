"use server";

// ============================================================
// Firecrawl Entity Research — Owner & Entity Web Intelligence
//
// Searches the web via Firecrawl for information about property
// owners, LLCs, and real estate entities. Returns same interface
// as brave-entity.ts: EntityWebIntelligence, WebArticle.
// ============================================================

import { firecrawlSearch } from "./firecrawl";
import type { FirecrawlSearchResult } from "./firecrawl";
import type { EntityWebIntelligence, WebArticle } from "./brave-entity";

// ---- Categorization (mirrors brave-entity.ts) ----

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

function categorizeResult(url: string, text: string): WebArticle["category"] {
  let domain = "";
  try { domain = new URL(url).hostname.toLowerCase(); } catch { domain = ""; }

  if (NEWS_DOMAINS.some(d => domain.includes(d))) return "news";
  if (COURT_DOMAINS.some(d => domain.includes(d))) return "court";
  if (CORPORATE_DOMAINS.some(d => domain.includes(d))) return "corporate";
  if (SOCIAL_DOMAINS.some(d => domain.includes(d))) return "social";

  // Content-based categorization
  const lower = text.toLowerCase();
  if (lower.includes("lawsuit") || lower.includes("litigation") || lower.includes("court") || lower.includes("filing") || lower.includes("violation")) return "court";
  if (lower.includes("portfolio") || lower.includes("properties") || lower.includes("building") || lower.includes("owns") || lower.includes("acquired")) return "portfolio";
  if (lower.includes("llc") || lower.includes("corporation") || lower.includes("registered") || lower.includes("incorporated")) return "corporate";

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

function parseArticle(result: FirecrawlSearchResult): WebArticle {
  const title = result.title || "";
  const description = result.description || "";
  const fullText = `${title} ${description}`;
  const category = categorizeResult(result.url, fullText);
  const sentiment = detectSentiment(fullText);

  let domain = "";
  try { domain = new URL(result.url).hostname; } catch { domain = ""; }

  return {
    title,
    url: result.url,
    domain,
    snippet: description.slice(0, 400),
    category,
    sentiment,
  };
}

// ============================================================
// Main: Research an Entity
// ============================================================

export async function fcResearchEntity(
  entityName: string,
  options?: { includeAiSummary?: boolean; additionalContext?: string },
): Promise<EntityWebIntelligence> {
  const context = options?.additionalContext || "real estate New York";

  // Run multiple focused searches in parallel
  const queries = [
    `"${entityName}" ${context}`,
    `"${entityName}" lawsuit violation filing NYC`,
  ];

  const results = await Promise.allSettled(
    queries.map(q => firecrawlSearch(q, {
      limit: 10,
      country: "us",
      scrapeOptions: {
        formats: ["markdown"],
        onlyMainContent: true,
      },
    }))
  );

  // Collect and categorize all results
  const allArticles: WebArticle[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const result of r.value) {
      allArticles.push(parseArticle(result));
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
    totalResults: deduped.length,
    searchedAt: new Date().toISOString(),
  };
}

// ============================================================
// Quick Entity Check — Lightweight reputation scan
// ============================================================

export async function fcQuickEntityCheck(entityName: string): Promise<{
  hasNegativeNews: boolean;
  hasLawsuits: boolean;
  hasCorporateRecords: boolean;
  articleCount: number;
  topIssue?: string;
}> {
  const results = await firecrawlSearch(
    `"${entityName}" real estate New York lawsuit violation`,
    { limit: 5, country: "us" },
  );

  const articles = results.map(parseArticle);
  const hasNegativeNews = articles.some(a => a.category === "news" && a.sentiment === "negative");
  const hasLawsuits = articles.some(a => a.category === "court");
  const hasCorporateRecords = articles.some(a => a.category === "corporate");

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
// Property Web Intelligence
// ============================================================

export async function fcResearchProperty(
  address: string,
  borough?: string,
): Promise<WebArticle[]> {
  const location = borough ? `${address}, ${borough}` : address;

  const results = await firecrawlSearch(
    `"${location}" New York building`,
    { limit: 8, country: "us" },
  );

  return results
    .map(parseArticle)
    .filter(a => a.category !== "other");
}
