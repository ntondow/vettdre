"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getMarketStripData,
  getNewsFeed,
  getBrokeragePulse,
  getFullDashboard,
  getFeedTopics,
  saveFeedTopics,
} from "./feed-actions";
import type {
  MarketStripData,
  NewsFeedData,
  NewsArticle,
  BrokeragePulseData,
  FeedTopicConfig,
  FullDashboardData,
} from "./types";
import {
  ExternalLink,
  Settings,
  X,
  Plus,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Users,
  Mail,
  CalendarDays,
  UserPlus,
  Building2,
  FileText,
  TrendingUp,
  Trophy,
  DollarSign,
  Clock,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Source display config ────────────────────────────────────

const SOURCE_CONFIG: Record<string, { short: string; color: string }> = {
  "The Real Deal":     { short: "TRD",        color: "bg-red-600" },
  "Bisnow NYC":        { short: "Bisnow",     color: "bg-orange-600" },
  "Commercial Observer":{ short: "Comm Obs",   color: "bg-emerald-700" },
  "HousingWire":       { short: "HousingWire", color: "bg-amber-600" },
  "Mortgage News Daily":{ short: "MND",        color: "bg-purple-600" },
  "CNBC RE":           { short: "CNBC",        color: "bg-yellow-600" },
  "Curbed NY":         { short: "Curbed",      color: "bg-pink-600" },
  "GlobeSt":           { short: "GlobeSt",     color: "bg-cyan-700" },
  "Multi-Housing News":{ short: "MH News",     color: "bg-indigo-600" },
  "NREI":              { short: "NREI",        color: "bg-teal-600" },
  "City Limits":       { short: "CityLimits",  color: "bg-slate-600" },
  "Crain's NY RE":     { short: "Crain's",     color: "bg-rose-700" },
  "NY YIMBY":          { short: "YIMBY",       color: "bg-indigo-600" },
  "Brownstoner":       { short: "Brownstoner", color: "bg-amber-800" },
  "Google News":       { short: "Google",      color: "bg-blue-500" },
};

function getSourceDisplay(source: string): { short: string; color: string } {
  return SOURCE_CONFIG[source] || { short: source.slice(0, 10), color: "bg-slate-600" };
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  nyc: "NYC",
  markets: "Markets",
  rates: "Rates",
  cre: "CRE",
  multifamily: "Multifamily",
  my_topics: "My Topics",
};

// ── Delta color logic (real estate context) ──────────────────

const RATE_METRIC_IDS = new Set(["MORTGAGE30US", "MORTGAGE15US", "DGS10", "DFF", "CPIAUCSL"]);

function getDeltaColor(metricId: string, delta: number): string {
  if (delta === 0) return "text-slate-500";
  // Rates: UP = bad (red), DOWN = good (green)
  // Values/indices: UP = good (green), DOWN = bad (red)
  if (RATE_METRIC_IDS.has(metricId)) {
    return delta > 0 ? "text-red-400" : "text-emerald-400";
  }
  return delta > 0 ? "text-emerald-400" : "text-red-400";
}

function getSparklineColor(metricId: string, data: number[]): string {
  if (data.length < 2) return "#60a5fa"; // blue-400 fallback
  const mid = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
  const secondHalf = data.slice(mid).reduce((s, v) => s + v, 0) / (data.length - mid);
  const trendUp = secondHalf > firstHalf;
  if (RATE_METRIC_IDS.has(metricId)) {
    return trendUp ? "#f87171" : "#34d399"; // red-400 : emerald-400
  }
  return trendUp ? "#34d399" : "#f87171";
}

// ── Main Component ───────────────────────────────────────────

export default function DashboardPage() {
  // Market strip
  const [strip, setStrip] = useState<MarketStripData | null>(null);
  const [stripLoading, setStripLoading] = useState(true);

  // News feed
  const [feed, setFeed] = useState<NewsFeedData | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedCategory, setFeedCategory] = useState("all");
  const [feedPage, setFeedPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Brokerage pulse
  const [pulse, setPulse] = useState<BrokeragePulseData | null>(null);
  const [pulseLoading, setPulseLoading] = useState(true);

  // Full dashboard data
  const [dashboard, setDashboard] = useState<FullDashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  // Topics
  const [topics, setTopics] = useState<FeedTopicConfig>({ topics: [] });
  const [showTopicEditor, setShowTopicEditor] = useState(false);
  const [topicInput, setTopicInput] = useState("");

  // Refresh state
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Welcome card (dismissed for the session)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── Load sections independently ─────────────────────────────

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const stripPromise = getMarketStripData()
      .then((d) => { setStrip(d); setStripLoading(false); })
      .catch(() => setStripLoading(false));

    const feedPromise = getFeedTopics().then((t) => {
      setTopics(t);
      return getNewsFeed("all", 1, t.topics);
    })
      .then((d) => { setFeed(d); setFeedLoading(false); })
      .catch(() => setFeedLoading(false));

    const pulsePromise = getBrokeragePulse()
      .then(setPulse)
      .catch(() => {})
      .finally(() => setPulseLoading(false));

    const dashPromise = getFullDashboard()
      .then((d) => { setDashboard(d); setDashLoading(false); })
      .catch(() => setDashLoading(false));

    await Promise.allSettled([stripPromise, feedPromise, pulsePromise, dashPromise]);
    setLastUpdated(new Date());
    if (isRefresh) setRefreshing(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Category change ─────────────────────────────────────────

  const handleCategoryChange = useCallback(
    async (cat: string) => {
      setFeedCategory(cat);
      setFeedPage(1);
      setFeedLoading(true);
      try {
        const data = await getNewsFeed(cat, 1, topics.topics);
        setFeed(data);
      } catch {
        // keep existing
      } finally {
        setFeedLoading(false);
      }
    },
    [topics],
  );

  // ── Load more ───────────────────────────────────────────────

  const handleLoadMore = useCallback(async () => {
    const nextPage = feedPage + 1;
    setLoadingMore(true);
    try {
      const data = await getNewsFeed(feedCategory, nextPage, topics.topics);
      if (data.articles.length > 0 && feed) {
        setFeed({
          ...data,
          articles: [...feed.articles, ...data.articles],
        });
        setFeedPage(nextPage);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [feedPage, feedCategory, topics, feed]);

  // ── Topic management ────────────────────────────────────────

  const addTopic = useCallback(async () => {
    const t = topicInput.trim().slice(0, 50);
    if (!t || topics.topics.length >= 5) return;
    const updated = [...topics.topics, t];
    setTopicInput("");
    setTopics({ topics: updated });
    const saved = await saveFeedTopics(updated);
    setTopics(saved);
    setFeedLoading(true);
    try {
      const data = await getNewsFeed(feedCategory, 1, saved.topics);
      setFeed(data);
      setFeedPage(1);
    } catch {
      // ignore
    } finally {
      setFeedLoading(false);
    }
  }, [topicInput, topics, feedCategory]);

  const removeTopic = useCallback(
    async (idx: number) => {
      const updated = topics.topics.filter((_, i) => i !== idx);
      setTopics({ topics: updated });
      const saved = await saveFeedTopics(updated);
      setTopics(saved);
    },
    [topics],
  );

  // ── Render ────────────────────────────────────────────────

  const userName = strip?.userName;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-4">
      {/* ── Greeting ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting()}{userName ? `, ${userName}` : ""}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Updated {relativeTime(lastUpdated.toISOString())}</span>
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Agent Welcome Card ─────────────────────────────── */}
      {!welcomeDismissed && dashboard && !dashboard.isAdmin && (
        dashboard.overview.activeTransactions === 0 &&
        dashboard.overview.activeListings === 0 &&
        dashboard.crm.totalContacts === 0
      ) && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 sm:p-6 text-white relative overflow-hidden">
          <button
            onClick={() => setWelcomeDismissed(true)}
            className="absolute top-3 right-3 text-white/60 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold mb-1">
            Welcome to VettdRE{dashboard.userName ? `, ${dashboard.userName}` : ""}!
          </h2>
          <p className="text-blue-100 text-sm mb-5">
            Get started by completing your first task:
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Link
              href="/brokerage/client-onboarding/new"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              Register a Client
            </Link>
            <Link
              href="/brokerage/my-deals"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/30 text-white text-sm font-semibold rounded-lg hover:bg-blue-500/50 border border-white/20 transition-colors"
            >
              <FileText className="h-4 w-4" />
              Submit a Deal
            </Link>
            <Link
              href="/contacts"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/30 text-white text-sm font-semibold rounded-lg hover:bg-blue-500/50 border border-white/20 transition-colors"
            >
              <Users className="h-4 w-4" />
              Add a Contact
            </Link>
          </div>
        </div>
      )}

      {/* ── Section 1: Market Data Strip (Bloomberg Dark) ──── */}
      {stripLoading ? (
        <MarketStripSkeleton />
      ) : strip && strip.metrics.length > 0 ? (
        <div className="bg-slate-900 rounded-xl p-4 overflow-hidden">
          <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase mb-3">
            Market Data
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-4 pb-1 md:grid md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {strip.metrics.map((m) => (
              <MetricCard key={m.id} metric={m} />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Section 2: News Feed (Bloomberg Dark) ─────────── */}
      <div className="bg-slate-900 rounded-xl overflow-hidden">
        {/* Header + category pills */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
              Real Estate Intelligence
            </h2>
            <button
              onClick={() => setShowTopicEditor(!showTopicEditor)}
              className="text-slate-600 hover:text-slate-400 transition-colors p-1"
              title="Customize topics"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          {/* Topic editor */}
          {showTopicEditor && (
            <div className="mb-3 p-3 bg-slate-800 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">
                Add up to 5 custom topics ({topics.topics.length}/5)
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="e.g. Brooklyn multifamily"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTopic()}
                  className="flex-1 text-sm px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  maxLength={50}
                />
                <button
                  onClick={addTopic}
                  disabled={!topicInput.trim() || topics.topics.length >= 5}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {topics.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {topics.topics.map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 border border-slate-600 rounded-full text-xs text-slate-300"
                    >
                      {t}
                      <button
                        onClick={() => removeTopic(i)}
                        className="text-slate-500 hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Category pills */}
          <div className="flex overflow-x-auto no-scrollbar gap-1.5">
            {["all", ...(feed?.categories || [])].map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  feedCategory === cat
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
          </div>
        </div>

        {/* Articles */}
        <div className="divide-y divide-slate-800/50">
          {feedLoading ? (
            <NewsFeedSkeleton />
          ) : feed && feed.articles.length > 0 ? (
            <>
              {feed.articles.map((article, i) => (
                <ArticleRow key={`${article.url}-${i}`} article={article} />
              ))}
              {feed.articles.length < feed.totalCount && (
                <div className="px-4 py-3 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="text-sm text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50"
                  >
                    {loadingMore ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-600">No articles found</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 3: Full Dashboard (Bloomberg Dark) ───── */}
      {dashLoading ? (
        <DashboardSkeleton />
      ) : dashboard ? (
        <>
          {/* ── Alerts Banner ──────────────────────────────── */}
          {dashboard.alerts.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase mb-3">
                Action Required
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {dashboard.alerts.map((alert) => (
                  <Link
                    key={alert.type}
                    href={alert.href}
                    className="flex items-center gap-3 px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors group"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span className="text-sm text-amber-200 flex-1 truncate">{alert.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-amber-500/50 group-hover:text-amber-400 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Overview Stats (6 cards) ───────────────────── */}
          <div className="bg-slate-900 rounded-xl p-4">
            <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase mb-3">
              Overview
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={<DollarSign className="h-4 w-4" />} label="Revenue" value={fmtCompact(dashboard.overview.totalRevenue)} sub="this month" href="/brokerage/dashboard" color="text-emerald-400" />
              <StatCard icon={<Clock className="h-4 w-4" />} label="Pending" value={fmtCompact(dashboard.overview.pendingPayouts)} sub="payouts" href="/brokerage/invoices" color="text-amber-400" />
              <StatCard icon={<Building2 className="h-4 w-4" />} label="Listings" value={String(dashboard.overview.activeListings)} sub="active" href="/brokerage/listings" color="text-blue-400" />
              <StatCard icon={<FileText className="h-4 w-4" />} label="Deals" value={String(dashboard.overview.activeTransactions)} sub="in progress" href="/brokerage/transactions" color="text-purple-400" />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Closed" value={String(dashboard.overview.dealsClosedThisMonth)} sub="this month" href="/brokerage/transactions" color="text-emerald-400" />
              <StatCard icon={<Users className="h-4 w-4" />} label="Agents" value={String(dashboard.overview.agentCount)} sub="active" href="/brokerage/agents" color="text-cyan-400" />
            </div>
          </div>

          {/* ── Two-column: CRM + Revenue Chart ─────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* CRM Stats */}
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase mb-3">
                CRM
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CrmCard icon={<Users className="h-4 w-4 text-blue-400" />} label="Total Contacts" value={String(dashboard.crm.totalContacts)} href="/contacts" />
                <CrmCard icon={<UserPlus className="h-4 w-4 text-emerald-400" />} label="New This Month" value={String(dashboard.crm.newContactsThisMonth)} href="/contacts" />
                <CrmCard icon={<Mail className="h-4 w-4 text-amber-400" />} label="Unread Messages" value={String(dashboard.crm.unreadMessages)} href="/messages" />
                <CrmCard icon={<CalendarDays className="h-4 w-4 text-purple-400" />} label="Upcoming Events" value={String(dashboard.crm.upcomingEvents)} href="/calendar" />
              </div>
            </div>

            {/* Revenue Chart */}
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase mb-3">
                Revenue (6 Months)
              </div>
              <RevenueChart data={dashboard.revenueByMonth} />
            </div>
          </div>

          {/* ── Two-column: Activity Feed + Pipeline ────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Activity */}
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
                  Recent Activity
                </div>
                <Link href="/brokerage/dashboard" className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors">
                  View All
                </Link>
              </div>
              {dashboard.recentActivity.length > 0 ? (
                <div className="space-y-1">
                  {dashboard.recentActivity.slice(0, 8).map((item, i) => (
                    <Link
                      key={`${item.type}-${i}`}
                      href={item.href}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800/60 transition-colors group"
                    >
                      <ActivityIcon type={item.type} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate group-hover:text-blue-400 transition-colors">
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="text-[11px] text-slate-500 truncate">{item.subtitle}</div>
                        )}
                      </div>
                      {item.status && item.statusColor && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${item.statusColor}`}>
                          {item.status.replace(/_/g, " ")}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-600 flex-shrink-0 whitespace-nowrap">
                        {relativeTime(item.timestamp)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-slate-600">No recent activity</div>
              )}
            </div>

            {/* Pipeline Snapshot */}
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase mb-3">
                Pipeline
              </div>
              <div className="space-y-4">
                <PipelineSection
                  title="Listings"
                  data={dashboard.pipeline.listings}
                  order={["available", "showing", "application", "approved", "leased", "off_market"]}
                  colors={{ available: "bg-green-500", showing: "bg-blue-500", application: "bg-amber-500", approved: "bg-purple-500", leased: "bg-emerald-500", off_market: "bg-slate-600" }}
                  href="/brokerage/listings"
                />
                <PipelineSection
                  title="Transactions"
                  data={dashboard.pipeline.transactions}
                  order={["submitted", "approved", "lease_signing", "under_contract", "closing", "invoice_sent", "payment_received", "closed", "cancelled"]}
                  colors={{ submitted: "bg-slate-500", approved: "bg-green-500", lease_signing: "bg-purple-500", under_contract: "bg-indigo-500", closing: "bg-purple-500", invoice_sent: "bg-cyan-500", payment_received: "bg-lime-500", closed: "bg-emerald-500", cancelled: "bg-red-500" }}
                  href="/brokerage/transactions"
                />
                <PipelineSection
                  title="Invoices"
                  data={dashboard.pipeline.invoices}
                  order={["draft", "sent", "paid", "void"]}
                  colors={{ draft: "bg-slate-500", sent: "bg-blue-500", paid: "bg-green-500", void: "bg-red-500" }}
                  href="/brokerage/invoices"
                />
              </div>
            </div>
          </div>

          {/* ── Top Agents (admin only) ────────────────────── */}
          {dashboard.isAdmin && dashboard.topAgents.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
                  Top Agents This Month
                </div>
                <Link href="/brokerage/leaderboard" className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors">
                  Leaderboard
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {dashboard.topAgents.map((agent) => (
                  <div key={agent.rank} className="flex items-center gap-3 px-3 py-2.5 bg-slate-800/50 rounded-lg">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-700 text-sm font-bold text-slate-300">
                      {agent.rank <= 3 ? (
                        <Trophy className={`h-3.5 w-3.5 ${agent.rank === 1 ? "text-amber-400" : agent.rank === 2 ? "text-slate-300" : "text-amber-600"}`} />
                      ) : (
                        <span className="text-xs">{agent.rank}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 font-medium truncate">{agent.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {agent.deals} deal{agent.deals !== 1 ? "s" : ""} · {fmtCompact(agent.revenue)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-slate-900 rounded-xl p-8 text-center">
          <Building2 className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-slate-400 mb-1">Brokerage Dashboard</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Your brokerage stats, pipeline, CRM metrics, and agent performance will appear here once data is available.
          </p>
          <Link href="/brokerage/dashboard" className="inline-block mt-4 text-xs text-blue-500 hover:text-blue-400 transition-colors">
            Go to Brokerage →
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Market Metric Card (Bloomberg style) ─────────────────────

function MetricCard({ metric }: { metric: MarketStripData["metrics"][number] }) {
  const delta = metric.change ?? 0;
  const deltaColor = getDeltaColor(metric.id, delta);
  const hasSparkline = metric.sparkline.length >= 2;

  return (
    <div className="min-w-[120px] flex-shrink-0 md:min-w-0">
      {/* Label */}
      <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
        {metric.label}
      </div>
      {/* Value */}
      <div className="text-xl font-mono font-semibold text-white mt-0.5">
        {metric.value}
      </div>
      {/* Delta */}
      {delta !== 0 ? (
        <div className={`text-xs font-mono mt-0.5 ${deltaColor}`}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}
        </div>
      ) : metric.change !== undefined ? (
        <div className="text-xs font-mono mt-0.5 text-slate-600">
          ━ 0.00
        </div>
      ) : (
        <div className="text-xs font-mono mt-0.5 text-slate-700">—</div>
      )}
      {/* Sparkline */}
      {hasSparkline ? (
        <MiniSparkline data={metric.sparkline} color={getSparklineColor(metric.id, metric.sparkline)} />
      ) : (
        <div className="text-[10px] font-mono text-slate-700 mt-1 tracking-widest">━━━━━━━━</div>
      )}
      {/* Source */}
      <div className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-wider">
        {metric.source === "fred" ? "FRED" : metric.source === "redfin" ? "Redfin" : "FHFA"}
      </div>
    </div>
  );
}

// ── SVG Mini Sparkline ───────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80;
  const h = 24;
  const padding = 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2);
    const y = padding + (1 - (v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} className="mt-1">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Article Row (Bloomberg dark) ─────────────────────────────

function ArticleRow({ article }: { article: NewsArticle }) {
  const { short, color } = getSourceDisplay(article.source);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors group"
    >
      {/* Source badge */}
      <span className={`shrink-0 mt-0.5 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-white rounded ${color}`}>
        {short}
      </span>

      <div className="flex-1 min-w-0">
        {/* Title */}
        <div className="text-sm font-medium text-slate-100 line-clamp-1 group-hover:text-blue-400 transition-colors">
          {article.title}
        </div>
        {/* Snippet */}
        {article.snippet && (
          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
            {article.snippet}
          </div>
        )}
      </div>

      {/* Time + link */}
      <div className="shrink-0 flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-slate-600 whitespace-nowrap">
          {relativeTime(article.publishedAt)}
        </span>
        <ExternalLink className="h-3 w-3 text-slate-700 group-hover:text-blue-400 transition-colors" />
      </div>
    </a>
  );
}

// ── Pulse Card (Bloomberg dark) ──────────────────────────────

function PulseCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  return (
    <Link href={href} className="group">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-mono font-bold text-white mt-1 group-hover:text-blue-400 transition-colors">
        {value}
      </div>
      <div className="text-xs text-slate-600">{sub}</div>
    </Link>
  );
}

// ── Skeletons (dark) ─────────────────────────────────────────

function MarketStripSkeleton() {
  return (
    <div className="bg-slate-900 rounded-xl p-4">
      <div className="h-3 w-24 bg-slate-800 rounded mb-3" />
      <div className="flex overflow-x-auto no-scrollbar gap-4 md:grid md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="min-w-[120px] flex-shrink-0 space-y-2 md:min-w-0">
            <div className="h-2.5 w-16 bg-slate-800 rounded animate-pulse" />
            <div className="h-6 w-20 bg-slate-800 rounded animate-pulse" />
            <div className="h-3 w-12 bg-slate-800 rounded animate-pulse" />
            <div className="h-6 w-20 bg-slate-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsFeedSkeleton() {
  return (
    <div className="divide-y divide-slate-800/50">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3 animate-pulse">
          <div className="w-16 h-5 rounded bg-slate-800 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-slate-800 rounded w-3/4" />
            <div className="h-3 bg-slate-800/60 rounded w-1/2" />
          </div>
          <div className="h-3 bg-slate-800 rounded w-10 flex-shrink-0 mt-1" />
        </div>
      ))}
    </div>
  );
}

function BrokeragePulseSkeleton() {
  return (
    <div className="bg-slate-900 rounded-xl p-4">
      <div className="h-3 w-28 bg-slate-800 rounded mb-3" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2 animate-pulse">
            <div className="h-2.5 w-14 bg-slate-800 rounded" />
            <div className="h-8 w-16 bg-slate-800 rounded" />
            <div className="h-3 w-12 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dashboard Skeleton ────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-xl p-4">
        <div className="h-3 w-20 bg-slate-800 rounded mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="h-3 w-10 bg-slate-800 rounded" />
              <div className="h-8 w-16 bg-slate-800 rounded" />
              <div className="h-3 w-14 bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-slate-900 rounded-xl p-4 animate-pulse">
            <div className="h-3 w-24 bg-slate-800 rounded mb-3" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-10 bg-slate-800/50 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stat Card (Overview grid) ─────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  href,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href: string;
  color: string;
}) {
  return (
    <Link href={href} className="group">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-mono font-bold text-white group-hover:text-blue-400 transition-colors">
        {value}
      </div>
      <div className="text-xs text-slate-600">{sub}</div>
    </Link>
  );
}

// ── CRM Card ──────────────────────────────────────────────────

function CrmCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-3 bg-slate-800/40 rounded-lg hover:bg-slate-800/70 transition-colors group"
    >
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <div className="text-lg font-mono font-bold text-white group-hover:text-blue-400 transition-colors">
          {value}
        </div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
    </Link>
  );
}

// ── Revenue Chart (simple bar chart via SVG) ──────────────────

function RevenueChart({ data }: { data: FullDashboardData["revenueByMonth"] }) {
  const maxVal = Math.max(...data.map((d) => d.revenue), 1);
  const barWidth = 40;
  const gap = 16;
  const chartHeight = 120;
  const totalWidth = data.length * (barWidth + gap) - gap;

  if (data.every((d) => d.revenue === 0)) {
    return (
      <div className="flex items-center justify-center h-[140px] text-sm text-slate-600">
        No revenue data yet
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <svg
        width={Math.max(totalWidth, 200)}
        height={chartHeight + 24}
        viewBox={`0 0 ${Math.max(totalWidth, 200)} ${chartHeight + 24}`}
        className="w-full max-w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {data.map((d, i) => {
          const barH = (d.revenue / maxVal) * chartHeight;
          const x = i * (barWidth + gap);
          return (
            <g key={d.month}>
              {/* Bar background */}
              <rect
                x={x}
                y={0}
                width={barWidth}
                height={chartHeight}
                fill="#1e293b"
                rx={4}
              />
              {/* Revenue bar */}
              <rect
                x={x}
                y={chartHeight - barH}
                width={barWidth}
                height={barH}
                fill="#3b82f6"
                rx={4}
              />
              {/* Value label */}
              {d.revenue > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - barH - 4}
                  textAnchor="middle"
                  className="text-[9px] fill-slate-400 font-mono"
                >
                  {fmtCompact(d.revenue)}
                </text>
              )}
              {/* Month label */}
              <text
                x={x + barWidth / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                className="text-[10px] fill-slate-500 font-medium"
              >
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Activity Icon ─────────────────────────────────────────────

function ActivityIcon({ type }: { type: string }) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "listing":
      return <Building2 className={`${cls} text-blue-400`} />;
    case "transaction":
      return <FileText className={`${cls} text-purple-400`} />;
    case "invoice":
      return <DollarSign className={`${cls} text-emerald-400`} />;
    case "submission":
      return <TrendingUp className={`${cls} text-amber-400`} />;
    case "agent":
      return <Users className={`${cls} text-cyan-400`} />;
    default:
      return <Clock className={`${cls} text-slate-500`} />;
  }
}

// ── Pipeline Section ──────────────────────────────────────────

function PipelineSection({
  title,
  data,
  order,
  colors,
  href,
}: {
  title: string;
  data: Record<string, number>;
  order: string[];
  colors: Record<string, string>;
  href: string;
}) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  if (total === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400 font-medium">{title}</span>
          <Link href={href} className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors">View</Link>
        </div>
        <div className="text-xs text-slate-600 py-2">No {title.toLowerCase()} yet</div>
      </div>
    );
  }

  const segments = order
    .filter((key) => (data[key] || 0) > 0)
    .map((key) => ({
      key,
      count: data[key] || 0,
      pct: ((data[key] || 0) / total) * 100,
      color: colors[key] || "bg-slate-600",
    }));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-400 font-medium">{title}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono">{total}</span>
          <Link href={href} className="text-[10px] text-blue-500 hover:text-blue-400 transition-colors">View</Link>
        </div>
      </div>
      {/* Stacked bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800 mb-1.5">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.color} transition-all`}
            style={{ width: `${seg.pct}%` }}
            title={`${seg.key.replace(/_/g, " ")}: ${seg.count}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${seg.color}`} />
            <span className="text-[10px] text-slate-500">
              {seg.key.replace(/_/g, " ")} ({seg.count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
