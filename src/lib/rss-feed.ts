// ============================================================
// RSS / Atom Feed Parser — Pure library (NOT "use server")
// Uses fast-xml-parser. 30-min in-memory cache.
// ============================================================

import { XMLParser } from "fast-xml-parser";

// ── Types ────────────────────────────────────────────────────

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt: string; // ISO string
  category: string;
}

export interface FeedConfig {
  url: string;
  source: string;
  category: string;
}

// ── Default RSS Feeds (14 real estate sources) ───────────────

export const DEFAULT_FEEDS: FeedConfig[] = [
  { url: "https://therealdeal.com/feed/", source: "The Real Deal", category: "nyc" },
  { url: "https://www.bisnow.com/new-york/feed", source: "Bisnow NYC", category: "nyc" },
  { url: "https://commercialobserver.com/feed/", source: "Commercial Observer", category: "cre" },
  { url: "https://www.housingwire.com/feed/", source: "HousingWire", category: "rates" },
  { url: "https://www.mortgagenewsdaily.com/rss", source: "Mortgage News Daily", category: "rates" },
  { url: "https://www.cnbc.com/id/10000115/device/rss/rss.html", source: "CNBC RE", category: "markets" },
  { url: "https://ny.curbed.com/rss/index.xml", source: "Curbed NY", category: "nyc" },
  { url: "https://www.globest.com/feed/", source: "GlobeSt", category: "cre" },
  { url: "https://www.multihousingnews.com/feed/", source: "Multi-Housing News", category: "multifamily" },
  { url: "https://www.nreionline.com/rss", source: "NREI", category: "cre" },
  { url: "https://citylimits.org/feed/", source: "City Limits", category: "nyc" },
  { url: "https://www.crainsnewyork.com/real-estate/feed", source: "Crain's NY RE", category: "nyc" },
  { url: "https://newyorkyimby.com/feed", source: "NY YIMBY", category: "nyc" },
  { url: "https://www.brownstoner.com/feed/", source: "Brownstoner", category: "nyc" },
];

// ── In-memory cache (30 min TTL) ────────────────────────────

const cache = new Map<string, { data: NewsArticle[]; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCached(key: string): NewsArticle[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: NewsArticle[]) {
  if (cache.size > 100) {
    // Evict oldest
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ── XML Parser ───────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => ["item", "entry"].includes(name),
});

// ── Parse a single feed (RSS 2.0 or Atom) ───────────────────

function parseDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html.replace(/<[^>]*>/g, "")
  ).replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s\S*$/, "") + "...";
}

function parseFeedXml(xml: string, source: string, category: string): NewsArticle[] {
  try {
    const parsed = parser.parse(xml);
    const articles: NewsArticle[] = [];

    // RSS 2.0: rss > channel > item
    const rssItems = parsed?.rss?.channel?.item;
    if (Array.isArray(rssItems)) {
      for (const item of rssItems.slice(0, 20)) {
        const title = typeof item.title === "string" ? item.title : item.title?.["#text"] || "";
        const link = typeof item.link === "string" ? item.link : item.link?.["@_href"] || item.link?.["#text"] || "";
        const desc = item.description || item["content:encoded"] || "";
        articles.push({
          title: stripHtml(title).trim(),
          url: link.trim(),
          source,
          snippet: truncate(stripHtml(typeof desc === "string" ? desc : ""), 200),
          publishedAt: parseDate(item.pubDate || item["dc:date"]),
          category,
        });
      }
      return articles.filter((a) => a.title && a.url);
    }

    // Atom: feed > entry
    const atomEntries = parsed?.feed?.entry;
    if (Array.isArray(atomEntries)) {
      for (const entry of atomEntries.slice(0, 20)) {
        const title = typeof entry.title === "string" ? entry.title : entry.title?.["#text"] || "";
        let link = "";
        if (typeof entry.link === "string") {
          link = entry.link;
        } else if (Array.isArray(entry.link)) {
          const alt = entry.link.find((l: any) => l["@_rel"] === "alternate");
          link = alt?.["@_href"] || entry.link[0]?.["@_href"] || "";
        } else if (entry.link?.["@_href"]) {
          link = entry.link["@_href"];
        }
        const summary = entry.summary || entry.content || "";
        articles.push({
          title: stripHtml(title).trim(),
          url: link.trim(),
          source,
          snippet: truncate(stripHtml(typeof summary === "string" ? summary : summary?.["#text"] || ""), 200),
          publishedAt: parseDate(entry.published || entry.updated),
          category,
        });
      }
      return articles.filter((a) => a.title && a.url);
    }

    return [];
  } catch {
    return [];
  }
}

// ── Fetch a single RSS feed ──────────────────────────────────

export async function fetchRssFeed(config: FeedConfig): Promise<NewsArticle[]> {
  const cached = getCached(config.url);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(config.url, {
      signal: controller.signal,
      headers: { "User-Agent": "VettdRE/1.0 (RSS Reader)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const xml = await res.text();
    const articles = parseFeedXml(xml, config.source, config.category);
    setCache(config.url, articles);
    return articles;
  } catch {
    return [];
  }
}

// ── Fetch all feeds in parallel, dedup, sort ─────────────────

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return url.replace(/\/+$/, "");
  }
}

// Dice coefficient for fuzzy title matching
function dice(a: string, b: string): number {
  const aNorm = a.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  const bNorm = b.toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
  if (aNorm === bNorm) return 1;
  if (aNorm.length < 2 || bNorm.length < 2) return 0;

  const bigrams = new Map<string, number>();
  for (let i = 0; i < aNorm.length - 1; i++) {
    const bi = aNorm.slice(i, i + 2);
    bigrams.set(bi, (bigrams.get(bi) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < bNorm.length - 1; i++) {
    const bi = bNorm.slice(i, i + 2);
    const count = bigrams.get(bi);
    if (count && count > 0) {
      matches++;
      bigrams.set(bi, count - 1);
    }
  }

  return (2 * matches) / (aNorm.length - 1 + bNorm.length - 1);
}

export async function fetchAllFeeds(configs: FeedConfig[]): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(configs.map((c) => fetchRssFeed(c)));

  const all: NewsArticle[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  // Dedup by normalized URL + fuzzy title match
  const seen = new Map<string, NewsArticle>();
  const deduped: NewsArticle[] = [];

  for (const article of all) {
    const normUrl = normalizeUrl(article.url);

    // Exact URL dedup
    if (seen.has(normUrl)) continue;

    // Fuzzy title dedup: check against all seen titles
    let isDupe = false;
    for (const [, existing] of seen) {
      if (dice(article.title, existing.title) > 0.85) {
        isDupe = true;
        break;
      }
    }
    if (isDupe) continue;

    seen.set(normUrl, article);
    deduped.push(article);
  }

  // Sort by publishedAt desc
  deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return deduped;
}

// ── Google News RSS URL builder ──────────────────────────────

export function buildGoogleNewsUrl(topic: string): string {
  const q = encodeURIComponent(topic);
  return `https://news.google.com/rss/search?q=${q}+real+estate&hl=en-US&gl=US&ceid=US:en`;
}
