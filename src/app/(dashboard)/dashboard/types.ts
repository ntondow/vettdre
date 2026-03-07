// ============================================================
// Dashboard Intelligence Feed — Shared Types
// ============================================================

export interface MarketMetric {
  id: string;
  label: string;
  value: string;           // formatted display value
  rawValue: number;
  unit: "%" | "$" | "days" | "months" | "";
  change?: number;         // vs previous period
  changeLabel?: string;    // "vs last week"
  sparkline: number[];     // data points for mini chart
  source: "fred" | "redfin" | "fhfa";
}

export interface MarketStripData {
  metrics: MarketMetric[];
  updatedAt: string;
  userName?: string;       // user's first name for greeting
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt: string;
  category: string;
}

export interface NewsFeedData {
  articles: NewsArticle[];
  totalCount: number;
  categories: string[];
}

export interface BrokeragePulseData {
  revenue: number;
  pendingInvoices: number;
  activeDeals: number;
  agentCount: number;
}

export interface FeedTopicConfig {
  topics: string[];
}
