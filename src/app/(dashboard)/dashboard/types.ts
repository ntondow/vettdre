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

// Full dashboard data (from actions.ts getDashboardData)
export interface FullDashboardData {
  userName: string;
  isAdmin: boolean;
  overview: {
    totalRevenue: number;
    pendingPayouts: number;
    activeListings: number;
    activeTransactions: number;
    dealsClosedThisMonth: number;
    agentCount: number;
  };
  revenueByMonth: Array<{
    month: string;
    revenue: number;
    payouts: number;
    net: number;
  }>;
  pipeline: {
    listings: Record<string, number>;
    transactions: Record<string, number>;
    invoices: Record<string, number>;
  };
  recentActivity: Array<{
    type: "listing" | "transaction" | "invoice" | "submission" | "agent";
    title: string;
    subtitle?: string;
    timestamp: string;
    href: string;
    status?: string;
    statusColor?: string;
  }>;
  topAgents: Array<{
    name: string;
    deals: number;
    revenue: number;
    rank: number;
  }>;
  alerts: Array<{
    type: "overdue_invoice" | "stale_listing" | "expiring_compliance" | "pending_approval";
    title: string;
    count: number;
    href: string;
  }>;
  crm: {
    totalContacts: number;
    newContactsThisMonth: number;
    unreadMessages: number;
    upcomingEvents: number;
  };
}

export interface FeedTopicConfig {
  topics: string[];
}
