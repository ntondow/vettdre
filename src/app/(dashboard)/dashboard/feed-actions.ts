"use server";

import { fetchAllFredSparklines } from "@/lib/fred";
import { getNycAggregate } from "@/lib/redfin-market";
import {
  DEFAULT_FEEDS,
  fetchAllFeeds,
  buildGoogleNewsUrl,
  type FeedConfig,
  type NewsArticle as RssArticle,
} from "@/lib/rss-feed";
import { braveWebSearch } from "@/lib/brave-search";
import { getDashboardData } from "./actions";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type {
  MarketStripData,
  MarketMetric,
  NewsFeedData,
  NewsArticle,
  BrokeragePulseData,
  FeedTopicConfig,
  FullDashboardData,
} from "./types";

// ── Auth helper ──────────────────────────────────────────────

async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const dbUser = await prisma.user.findUnique({
      where: { authProviderId: user.id },
      select: { id: true },
    });
    return dbUser?.id ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// 1. Market Data Strip
// ============================================================

// FHFA NYC Metro HPI benchmark (embedded, updated quarterly — source: fhfa.gov Q4 2025 report)
const FHFA_NYC_HPI = { index: 685.8, prevQuarter: 672.3, period: "2025-Q4" };

export async function getMarketStripData(): Promise<MarketStripData> {
  const metrics: MarketMetric[] = [];

  // Fetch user name + FRED data in parallel
  const [fredData, userName] = await Promise.all([
    fetchAllFredSparklines(),
    getAuthUserId().then(async (uid) => {
      if (!uid) return undefined;
      const u = await prisma.user.findUnique({ where: { id: uid }, select: { fullName: true } });
      return u?.fullName?.split(" ")[0] || undefined;
    }).catch(() => undefined),
  ]);

  // Map FRED series to MarketMetric
  const fredMetrics: {
    id: string;
    label: string;
    unit: MarketMetric["unit"];
    changeLabel: string;
  }[] = [
    { id: "MORTGAGE30US", label: "30Y FIXED", unit: "%", changeLabel: "vs last week" },
    { id: "MORTGAGE15US", label: "15Y FIXED", unit: "%", changeLabel: "vs last week" },
    { id: "DGS10", label: "10Y TREASURY", unit: "%", changeLabel: "vs last week" },
    { id: "DFF", label: "FED FUNDS", unit: "%", changeLabel: "vs last week" },
    { id: "CPIAUCSL", label: "CPI", unit: "%", changeLabel: "vs last month" },
  ];

  for (const fm of fredMetrics) {
    const spark = fredData[fm.id];
    if (!spark) continue;

    const obs = spark.observations;
    const current = spark.current;
    const prev = obs.length >= 2 ? obs[obs.length - 2].value : undefined;
    const change = prev !== undefined ? +(current - prev).toFixed(2) : undefined;

    metrics.push({
      id: fm.id,
      label: fm.label,
      value: fm.id === "CPIAUCSL"
        ? current.toFixed(1)
        : current.toFixed(2) + "%",
      rawValue: current,
      unit: fm.unit,
      change,
      changeLabel: fm.changeLabel,
      sparkline: obs.map((o) => o.value),
      source: "fred",
    });
  }

  // Redfin NYC aggregate (embedded quarterly snapshots — source: redfin.com)
  const nyc = getNycAggregate();
  const medianSparkline = [795, 810, 825, 830, 840, 845, 850, 862].map(v => v * 1000);
  const domSparkline = [58, 56, 55, 54, 53, 52, 51, 50];
  const supplySparkline = [4.2, 4.1, 4.0, 3.9, 3.8, 3.7, 3.7, 3.6];

  metrics.push({
    id: "nyc-median",
    label: "NYC MEDIAN",
    value: fmtPrice(nyc.medianSalePrice),
    rawValue: nyc.medianSalePrice,
    unit: "$",
    sparkline: medianSparkline,
    source: "redfin",
  });
  metrics.push({
    id: "nyc-dom",
    label: "NYC DOM",
    value: String(nyc.medianDaysOnMarket),
    rawValue: nyc.medianDaysOnMarket,
    unit: "days",
    sparkline: domSparkline,
    source: "redfin",
  });
  metrics.push({
    id: "nyc-supply",
    label: "NYC SUPPLY",
    value: nyc.monthsOfSupply.toFixed(1) + " mo",
    rawValue: nyc.monthsOfSupply,
    unit: "months",
    sparkline: supplySparkline,
    source: "redfin",
  });

  // FHFA NYC HPI — quarterly sparkline (Q4 2024 → Q4 2025)
  const hpiSparkline = [648.2, 655.1, 665.1, 672.3, 685.8];
  const hpiChange = +(FHFA_NYC_HPI.index - FHFA_NYC_HPI.prevQuarter).toFixed(1);
  metrics.push({
    id: "fhfa-hpi",
    label: "NYC HPI",
    value: FHFA_NYC_HPI.index.toFixed(1),
    rawValue: FHFA_NYC_HPI.index,
    unit: "",
    change: hpiChange,
    changeLabel: "vs last quarter",
    sparkline: hpiSparkline,
    source: "fhfa",
  });

  return {
    metrics,
    updatedAt: new Date().toISOString(),
    userName,
  };
}

function fmtPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ============================================================
// 2. News Feed
// ============================================================

const ALL_CATEGORIES = ["nyc", "markets", "rates", "cre", "multifamily"];

export async function getNewsFeed(
  category?: string,
  page: number = 1,
  topics?: string[],
): Promise<NewsFeedData> {
  const PAGE_SIZE = 20;

  // Build feed configs
  const configs: FeedConfig[] = [...DEFAULT_FEEDS];

  // Add Google News RSS for custom topics
  if (topics && topics.length > 0) {
    for (const topic of topics.slice(0, 5)) {
      configs.push({
        url: buildGoogleNewsUrl(topic),
        source: "Google News",
        category: "my_topics",
      });
    }
  }

  // Fetch all RSS feeds (cached 30min)
  let articles: NewsArticle[] = (await fetchAllFeeds(configs)).map((a: RssArticle) => ({
    title: a.title,
    url: a.url,
    source: a.source,
    snippet: a.snippet,
    publishedAt: a.publishedAt,
    category: a.category,
  }));

  // Supplement with Brave news for topics (max 3)
  if (topics && topics.length > 0) {
    const braveArticles = await fetchBraveNewsForTopics(topics.slice(0, 3));
    articles = mergeAndDedup(articles, braveArticles);
  }

  // Collect categories
  const categoriesSet = new Set(articles.map((a) => a.category));
  const categories = ALL_CATEGORIES.filter((c) => categoriesSet.has(c));
  if (categoriesSet.has("my_topics")) categories.push("my_topics");

  // Filter by category
  if (category && category !== "all") {
    articles = articles.filter((a) => a.category === category);
  }

  // Sort by date desc
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const totalCount = articles.length;
  const start = (page - 1) * PAGE_SIZE;
  const paged = articles.slice(start, start + PAGE_SIZE);

  return {
    articles: paged,
    totalCount,
    categories,
  };
}

// ── Brave News helper ────────────────────────────────────────

async function fetchBraveNewsForTopics(topics: string[]): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  try {
    const results = await Promise.allSettled(
      topics.map((topic) =>
        braveWebSearch(`${topic} real estate`, {
          count: 5,
          result_filter: "news",
          freshness: "pw",
        })
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled") continue;

      for (const item of r.value.results) {
        articles.push({
          title: item.title,
          url: item.url,
          source: item.domain.replace(/^www\./, ""),
          snippet: item.description,
          publishedAt: item.age
            ? estimateDateFromAge(item.age)
            : new Date().toISOString(),
          category: "my_topics",
        });
      }
    }
  } catch {
    // Brave unavailable — graceful degradation
  }

  return articles;
}

function estimateDateFromAge(age: string): string {
  const now = Date.now();
  const match = age.match(/(\d+)\s*(hour|day|week|month|minute)/i);
  if (!match) return new Date().toISOString();

  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const ms: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
  };

  return new Date(now - n * (ms[unit] || 86_400_000)).toISOString();
}

function mergeAndDedup(existing: NewsArticle[], incoming: NewsArticle[]): NewsArticle[] {
  const seen = new Set(existing.map((a) => normalizeUrl(a.url)));
  const merged = [...existing];

  for (const article of incoming) {
    const norm = normalizeUrl(article.url);
    if (seen.has(norm)) continue;
    seen.add(norm);
    merged.push(article);
  }

  return merged;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return url.replace(/\/+$/, "");
  }
}

// ============================================================
// 3. Brokerage Pulse
// ============================================================

export async function getBrokeragePulse(): Promise<BrokeragePulseData> {
  try {
    const data = await getDashboardData();
    return {
      revenue: data.overview.totalRevenue,
      pendingInvoices: data.overview.pendingPayouts > 0
        ? Math.max(data.pipeline.invoices["sent"] || 0, 1)
        : 0,
      activeDeals: data.overview.activeTransactions,
      agentCount: data.overview.agentCount,
    };
  } catch {
    return { revenue: 0, pendingInvoices: 0, activeDeals: 0, agentCount: 0 };
  }
}

export async function getFullDashboard(): Promise<FullDashboardData | null> {
  try {
    const data = await getDashboardData();
    return JSON.parse(JSON.stringify(data)) as FullDashboardData;
  } catch {
    return null;
  }
}

// ============================================================
// 4. Feed Topics (stored in User.usageCounters JSON)
// ============================================================

export async function getFeedTopics(): Promise<FeedTopicConfig> {
  const userId = await getAuthUserId();
  if (!userId) return { topics: [] };

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { usageCounters: true },
    });

    const counters = (user?.usageCounters as Record<string, unknown>) || {};
    const topics = Array.isArray(counters.feedTopics) ? counters.feedTopics as string[] : [];
    return { topics: topics.slice(0, 5) };
  } catch {
    return { topics: [] };
  }
}

export async function saveFeedTopics(topics: string[]): Promise<FeedTopicConfig> {
  const userId = await getAuthUserId();
  if (!userId) return { topics: [] };

  // Validate: max 5 topics, each max 50 chars
  const clean = topics
    .map((t) => t.trim().slice(0, 50))
    .filter((t) => t.length > 0)
    .slice(0, 5);

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { usageCounters: true },
    });

    const counters = (user?.usageCounters as Record<string, unknown>) || {};
    const updated = { ...counters, feedTopics: clean };

    await prisma.user.update({
      where: { id: userId },
      data: { usageCounters: updated },
    });

    return { topics: clean };
  } catch {
    return { topics: [] };
  }
}

// ============================================================
// 6. Screening Pipeline Widget
// ============================================================

export async function getScreeningWidget() {
  try {
    const userId = await getAuthUserId();
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { orgId: true } });
    if (!user) return null;

    const { getScreeningDashboardStats } = await import("@/lib/screening/integration");
    return await getScreeningDashboardStats(user.orgId);
  } catch {
    return null;
  }
}
