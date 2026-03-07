// ============================================================
// Leasing Benchmarks — Cross-Building Anonymous Aggregation
//
// computeBenchmarks(): daily cron job that aggregates metrics
//   across all active leasing configs into percentile buckets
//   per segment. No raw config data is exposed — only p25/p50/p75.
//
// getBenchmarks(configId): returns the config's position
//   relative to its segment's benchmarks.
// ============================================================

import prisma from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────

export interface BenchmarkMetric {
  myValue: number | null;
  p25: number;
  p50: number;
  p75: number;
  percentilePosition: number; // 0-100
  label: string; // "top 25%", "above average", "average", "below average"
}

export interface BenchmarkResult {
  segment: string;
  sampleSize: number;
  metrics: Record<string, BenchmarkMetric>;
  lastUpdated: Date;
}

// ── Metrics where lower is better ────────────────────────────

const LOWER_IS_BETTER = new Set(["avg_response_time_ms", "escalation_rate"]);

// ── NYC indicators ───────────────────────────────────────────

const NYC_BOROUGHS = ["manhattan", "brooklyn", "queens", "bronx", "staten island"];
const NYC_ZIPS_PREFIX = ["100", "101", "102", "103", "104", "110", "111", "112", "113", "114", "116"];

function isNycProperty(address: string | null, buildingKnowledge: Record<string, any> | null): boolean {
  const bk = buildingKnowledge || {};
  const neighborhood = (bk.neighborhood as string || "").toLowerCase();
  const borough = (bk.borough as string || "").toLowerCase();
  const addr = (address || "").toLowerCase();

  if (NYC_BOROUGHS.some((b) => borough.includes(b) || addr.includes(b) || neighborhood.includes(b))) return true;
  if (addr.includes("new york") || addr.includes("nyc") || addr.includes(", ny ")) return true;

  // Check zip
  const zip = bk.zip || "";
  if (typeof zip === "string" && NYC_ZIPS_PREFIX.some((p) => zip.startsWith(p))) return true;

  return false;
}

function getConfigSegment(
  address: string | null,
  buildingKnowledge: Record<string, any> | null,
  listingCount: number,
): string {
  const sizeSegment = listingCount <= 10 ? "tiny" : listingCount <= 50 ? "small" : listingCount <= 200 ? "medium" : "large";
  const geoSegment = isNycProperty(address, buildingKnowledge) ? "nyc" : "other";
  return `${geoSegment}_${sizeSegment}`;
}

// ── Percentile computation ───────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function getPercentilePosition(
  value: number,
  p25: number,
  p50: number,
  p75: number,
  lowerIsBetter: boolean,
): { percentilePosition: number; label: string } {
  if (lowerIsBetter) {
    // Lower value = better position
    if (value <= p25) return { percentilePosition: 87, label: "top 25%" };
    if (value <= p50) return { percentilePosition: 62, label: "above average" };
    if (value <= p75) return { percentilePosition: 37, label: "average" };
    return { percentilePosition: 15, label: "below average" };
  }
  // Higher value = better position
  if (value >= p75) return { percentilePosition: 87, label: "top 25%" };
  if (value >= p50) return { percentilePosition: 62, label: "above average" };
  if (value >= p25) return { percentilePosition: 37, label: "average" };
  return { percentilePosition: 15, label: "below average" };
}

// ── computeBenchmarks (daily cron) ──────────────────────────

export async function computeBenchmarks(): Promise<void> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // 1. Get all active configs with conversation counts in last 30 days
  const configs = await prisma.leasingConfig.findMany({
    where: { isActive: true },
    select: {
      id: true,
      buildingKnowledge: true,
      property: {
        select: {
          address: true,
          listings: { select: { id: true } },
        },
      },
      _count: {
        select: {
          conversations: { where: { createdAt: { gte: thirtyDaysAgo } } },
        },
      },
    },
  });

  // Filter to configs with at least 10 conversations in last 30 days
  const qualifiedConfigs = configs.filter((c) => c._count.conversations >= 10);

  if (qualifiedConfigs.length === 0) {
    console.log(JSON.stringify({ event: "benchmarks_computed", segments: 0, configs: 0 }));
    return;
  }

  // 2. Compute per-config metrics
  interface ConfigMetrics {
    configId: string;
    segment: string;
    avgResponseTimeMs: number;
    showingConversionRate: number;
    escalationRate: number;
    messagesPerConversation: number;
  }

  const configMetrics: ConfigMetrics[] = [];

  for (const config of qualifiedConfigs) {
    const bk = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
      ? config.buildingKnowledge as Record<string, any> : {};
    const segment = getConfigSegment(
      config.property.address,
      bk,
      config.property.listings.length,
    );

    // Fetch conversations and messages for this config
    const [conversations, messages] = await Promise.all([
      prisma.leasingConversation.findMany({
        where: { configId: config.id, createdAt: { gte: thirtyDaysAgo } },
        select: { id: true, status: true, escalatedAt: true },
      }),
      prisma.leasingMessage.findMany({
        where: {
          conversation: { configId: config.id, createdAt: { gte: thirtyDaysAgo } },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { sender: true, createdAt: true, conversationId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const totalConvs = conversations.length;
    if (totalConvs === 0) continue;

    // Response times
    const msgsByConv = new Map<string, typeof messages>();
    for (const msg of messages) {
      const arr = msgsByConv.get(msg.conversationId) || [];
      arr.push(msg);
      msgsByConv.set(msg.conversationId, arr);
    }

    const responseTimes: number[] = [];
    for (const [, msgs] of msgsByConv) {
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].sender === "prospect" && msgs[i + 1].sender === "ai") {
          const diffMs = msgs[i + 1].createdAt.getTime() - msgs[i].createdAt.getTime();
          if (diffMs > 0 && diffMs < 86400000) responseTimes.push(diffMs);
        }
      }
    }

    const avgResponseTimeMs = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Showing conversion
    const SHOWING_STATUSES = new Set(["showing_scheduled", "applied", "closed_won"]);
    const showings = conversations.filter((c) => SHOWING_STATUSES.has(c.status)).length;
    const showingConversionRate = totalConvs > 0 ? (showings / totalConvs) * 100 : 0;

    // Escalation rate
    const escalated = conversations.filter((c) => c.escalatedAt !== null || c.status === "escalated").length;
    const escalationRate = totalConvs > 0 ? (escalated / totalConvs) * 100 : 0;

    // Messages per conversation
    const messagesPerConversation = totalConvs > 0 ? messages.length / totalConvs : 0;

    configMetrics.push({
      configId: config.id,
      segment,
      avgResponseTimeMs,
      showingConversionRate,
      escalationRate,
      messagesPerConversation,
    });
  }

  // 3. Group by segment and compute percentiles
  const segments = new Map<string, ConfigMetrics[]>();
  for (const cm of configMetrics) {
    const arr = segments.get(cm.segment) || [];
    arr.push(cm);
    segments.set(cm.segment, arr);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const METRICS = [
    { key: "avg_response_time_ms", getter: (cm: ConfigMetrics) => cm.avgResponseTimeMs },
    { key: "showing_conversion_rate", getter: (cm: ConfigMetrics) => cm.showingConversionRate },
    { key: "escalation_rate", getter: (cm: ConfigMetrics) => cm.escalationRate },
    { key: "messages_per_conversation", getter: (cm: ConfigMetrics) => cm.messagesPerConversation },
  ];

  let segmentCount = 0;

  for (const [segment, configs_in_segment] of segments) {
    // Minimum sample size: 5
    if (configs_in_segment.length < 5) continue;

    segmentCount++;

    for (const metric of METRICS) {
      const values = configs_in_segment.map(metric.getter).sort((a, b) => a - b);
      const p25 = percentile(values, 25);
      const p50 = percentile(values, 50);
      const p75 = percentile(values, 75);

      await prisma.leasingBenchmark.upsert({
        where: { date_segment_metric: { date: today, segment, metric: metric.key } },
        create: {
          date: today,
          segment,
          metric: metric.key,
          p25,
          p50,
          p75,
          sampleSize: configs_in_segment.length,
        },
        update: {
          p25,
          p50,
          p75,
          sampleSize: configs_in_segment.length,
        },
      });
    }
  }

  console.log(JSON.stringify({
    event: "benchmarks_computed",
    segments: segmentCount,
    configs: configMetrics.length,
  }));
}

// ── getBenchmarks (per-config) ──────────────────────────────

export async function getBenchmarks(configId: string): Promise<BenchmarkResult | null> {
  // 1. Get config info for segmentation
  const config = await prisma.leasingConfig.findUnique({
    where: { id: configId },
    select: {
      id: true,
      buildingKnowledge: true,
      property: {
        select: {
          address: true,
          listings: { select: { id: true } },
        },
      },
    },
  });

  if (!config) return null;

  const bk = (config.buildingKnowledge && typeof config.buildingKnowledge === "object")
    ? config.buildingKnowledge as Record<string, any> : {};
  const segment = getConfigSegment(
    config.property.address,
    bk,
    config.property.listings.length,
  );

  // 2. Get most recent benchmarks for this segment (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const benchmarks = await prisma.leasingBenchmark.findMany({
    where: {
      segment,
      date: { gte: sevenDaysAgo },
    },
    orderBy: { date: "desc" },
  });

  if (benchmarks.length === 0) return null;

  // Pick the most recent per metric
  const latestByMetric = new Map<string, typeof benchmarks[0]>();
  for (const b of benchmarks) {
    if (!latestByMetric.has(b.metric)) {
      latestByMetric.set(b.metric, b);
    }
  }

  // 3. Compute config's own metrics for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [conversations, messages] = await Promise.all([
    prisma.leasingConversation.findMany({
      where: { configId, createdAt: { gte: thirtyDaysAgo } },
      select: { id: true, status: true, escalatedAt: true },
    }),
    prisma.leasingMessage.findMany({
      where: {
        conversation: { configId, createdAt: { gte: thirtyDaysAgo } },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { sender: true, createdAt: true, conversationId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const totalConvs = conversations.length;

  // Response times
  const msgsByConv = new Map<string, typeof messages>();
  for (const msg of messages) {
    const arr = msgsByConv.get(msg.conversationId) || [];
    arr.push(msg);
    msgsByConv.set(msg.conversationId, arr);
  }

  const responseTimes: number[] = [];
  for (const [, msgs] of msgsByConv) {
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].sender === "prospect" && msgs[i + 1].sender === "ai") {
        const diffMs = msgs[i + 1].createdAt.getTime() - msgs[i].createdAt.getTime();
        if (diffMs > 0 && diffMs < 86400000) responseTimes.push(diffMs);
      }
    }
  }

  const SHOWING_STATUSES = new Set(["showing_scheduled", "applied", "closed_won"]);

  const myValues: Record<string, number | null> = {
    avg_response_time_ms: responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null,
    showing_conversion_rate: totalConvs > 0
      ? (conversations.filter((c) => SHOWING_STATUSES.has(c.status)).length / totalConvs) * 100
      : null,
    escalation_rate: totalConvs > 0
      ? (conversations.filter((c) => c.escalatedAt !== null || c.status === "escalated").length / totalConvs) * 100
      : null,
    messages_per_conversation: totalConvs > 0
      ? messages.length / totalConvs
      : null,
  };

  // 4. Build result
  const metrics: Record<string, BenchmarkMetric> = {};
  let lastUpdated = new Date(0);
  let sampleSize = 0;

  for (const [metric, benchmark] of latestByMetric) {
    const myValue = myValues[metric] ?? null;
    const isLowerBetter = LOWER_IS_BETTER.has(metric);

    let pos: { percentilePosition: number; label: string };
    if (myValue === null) {
      pos = { percentilePosition: 50, label: "average" };
    } else {
      pos = getPercentilePosition(myValue, benchmark.p25, benchmark.p50, benchmark.p75, isLowerBetter);
    }

    metrics[metric] = {
      myValue,
      p25: benchmark.p25,
      p50: benchmark.p50,
      p75: benchmark.p75,
      ...pos,
    };

    if (benchmark.createdAt > lastUpdated) lastUpdated = benchmark.createdAt;
    if (benchmark.sampleSize > sampleSize) sampleSize = benchmark.sampleSize;
  }

  return { segment, sampleSize, metrics, lastUpdated };
}
