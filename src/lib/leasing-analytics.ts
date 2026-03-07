// ============================================================
// Leasing Analytics — Data Layer
//
// All queries scoped to configId + date range.
// No raw SQL — standard Prisma queries + JS aggregation.
// ============================================================

import prisma from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  conversionRate: number | null; // % from previous stage, null for first
}

export interface ResponseMetrics {
  avg: number;   // seconds
  p50: number;
  p95: number;
}

export interface DayVolume {
  date: string; // YYYY-MM-DD
  count: number;
  avgResponseSec: number | null;
  p95ResponseSec: number | null;
}

export interface HourBucket {
  day: number;  // 0=Sunday … 6=Saturday
  hour: number; // 0-23
  count: number;
}

export interface TemperatureDist {
  temperature: string;
  count: number;
}

export interface SourceBreakdown {
  source: string;
  count: number;
  showingConversionRate: number; // 0-100%
}

export interface AnalyticsData {
  funnel: FunnelStage[];
  responseMetrics: ResponseMetrics;
  volumeByDay: DayVolume[];
  heatmap: HourBucket[];
  temperatureDistribution: TemperatureDist[];
  escalationRate: number;        // 0-100%
  showingConversionRate: number;  // 0-100%
  topQuestions: { text: string; count: number }[];
  totalConversations: number;
  showingsBooked: number;
  closedWonCount: number;
  avgRent: number | null;
  sourceBreakdown: SourceBreakdown[];
  concessionsOffered: number;
  languageBreakdown: { language: string; count: number }[];
}

// ── Funnel stage ordering ────────────────────────────────────

const FUNNEL_STAGES: { stage: string; label: string }[] = [
  { stage: "active", label: "New Inquiry" },
  { stage: "qualified", label: "Qualified" },
  { stage: "showing_scheduled", label: "Showing Booked" },
  { stage: "applied", label: "Applied" },
  { stage: "closed_won", label: "Closed Won" },
];

// ── Stop words for top questions ─────────────────────────────

const STOP_WORDS = new Set([
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
  "the", "a", "an", "is", "am", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should",
  "may", "might", "can", "could", "to", "of", "in", "for", "on", "with", "at",
  "by", "from", "as", "into", "about", "up", "out", "if", "or", "and", "but",
  "not", "no", "so", "what", "which", "who", "this", "that", "these", "those",
  "then", "than", "too", "very", "just", "how", "all", "any", "each", "some",
  "hi", "hey", "hello", "im", "i'm", "thanks", "thank", "please", "ok", "okay",
]);

// ── Main analytics function ─────────────────────────────────

export async function getAnalytics(
  configId: string,
  dateRange: { start: Date; end: Date },
): Promise<AnalyticsData> {
  const where = { configId, createdAt: { gte: dateRange.start, lte: dateRange.end } };

  // Fetch in parallel
  const [conversations, messages, firstMessages, listings] = await Promise.all([
    // All conversations in range (select only needed fields)
    prisma.leasingConversation.findMany({
      where,
      select: {
        id: true,
        status: true,
        temperature: true,
        escalatedAt: true,
        createdAt: true,
        qualData: true,
      },
    }),

    // All messages in range (for volume + response time)
    prisma.leasingMessage.findMany({
      where: {
        conversation: { configId, createdAt: { gte: dateRange.start, lte: dateRange.end } },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      select: {
        id: true,
        sender: true,
        createdAt: true,
        conversationId: true,
      },
      orderBy: { createdAt: "asc" },
    }),

    // First prospect messages (for top questions)
    prisma.leasingMessage.findMany({
      where: {
        conversation: { configId, createdAt: { gte: dateRange.start, lte: dateRange.end } },
        sender: "prospect",
      },
      select: {
        conversationId: true,
        body: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),

    // Listings for avg rent calculation
    prisma.bmsListing.findMany({
      where: {
        property: { leasingConfig: { id: configId } },
        status: { in: ["available", "showing"] },
        rentPrice: { not: null },
      },
      select: { rentPrice: true },
    }),
  ]);

  const totalConversations = conversations.length;

  // ── 1. Funnel ─────────────────────────────────────────────

  // Count conversations that reached each stage (cumulative)
  // A conversation at "closed_won" has passed through all prior stages
  const stageOrder = ["active", "qualified", "showing_scheduled", "applied", "closed_won"];
  const stageIndex: Record<string, number> = {};
  stageOrder.forEach((s, i) => { stageIndex[s] = i; });

  // For each conversation, determine highest stage reached
  const stageCounts: Record<string, number> = {};
  for (const s of stageOrder) stageCounts[s] = 0;

  for (const conv of conversations) {
    const status = conv.status;
    const idx = stageIndex[status];
    if (idx !== undefined) {
      // Count this conversation for its stage and all prior stages
      for (let i = 0; i <= idx; i++) {
        stageCounts[stageOrder[i]]++;
      }
    } else {
      // Statuses not in funnel (stale, escalated, closed_lost) — count at their highest reached
      // escalated conversations at least reached active
      // closed_lost could have been at any stage — count as at least active
      stageCounts["active"]++;
    }
  }

  const funnel: FunnelStage[] = FUNNEL_STAGES.map((fs, i) => ({
    stage: fs.stage,
    label: fs.label,
    count: stageCounts[fs.stage] || 0,
    conversionRate: i === 0
      ? null
      : stageCounts[FUNNEL_STAGES[i - 1].stage] > 0
        ? Math.round((stageCounts[fs.stage] / stageCounts[FUNNEL_STAGES[i - 1].stage]) * 100)
        : 0,
  }));

  // ── 2. Response time metrics ──────────────────────────────

  // Group messages by conversation, compute time between prospect → ai
  const msgsByConv = new Map<string, typeof messages>();
  for (const msg of messages) {
    const arr = msgsByConv.get(msg.conversationId) || [];
    arr.push(msg);
    msgsByConv.set(msg.conversationId, arr);
  }

  const responseTimes: number[] = []; // in seconds
  const responseTimesByDate = new Map<string, number[]>();

  for (const [, msgs] of msgsByConv) {
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].sender === "prospect" && msgs[i + 1].sender === "ai") {
        const diffSec = (msgs[i + 1].createdAt.getTime() - msgs[i].createdAt.getTime()) / 1000;
        if (diffSec > 0 && diffSec < 86400) { // exclude > 24h (likely delayed/queued)
          responseTimes.push(diffSec);
          const dateKey = msgs[i + 1].createdAt.toISOString().slice(0, 10);
          const arr = responseTimesByDate.get(dateKey) || [];
          arr.push(diffSec);
          responseTimesByDate.set(dateKey, arr);
        }
      }
    }
  }

  responseTimes.sort((a, b) => a - b);
  const responseMetrics: ResponseMetrics = {
    avg: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0,
    p50: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.5)] : 0,
    p95: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0,
  };

  // ── 3. Volume by day ──────────────────────────────────────

  const dayCountMap = new Map<string, number>();
  for (const msg of messages) {
    const dateKey = msg.createdAt.toISOString().slice(0, 10);
    dayCountMap.set(dateKey, (dayCountMap.get(dateKey) || 0) + 1);
  }

  const volumeByDay: DayVolume[] = [];
  // Fill all days in range
  const cursor = new Date(dateRange.start);
  while (cursor <= dateRange.end) {
    const dateKey = cursor.toISOString().slice(0, 10);
    const dayRTs = responseTimesByDate.get(dateKey);
    const sortedRTs = dayRTs ? [...dayRTs].sort((a, b) => a - b) : null;
    volumeByDay.push({
      date: dateKey,
      count: dayCountMap.get(dateKey) || 0,
      avgResponseSec: sortedRTs ? Math.round(sortedRTs.reduce((a, b) => a + b, 0) / sortedRTs.length) : null,
      p95ResponseSec: sortedRTs ? Math.round(sortedRTs[Math.floor(sortedRTs.length * 0.95)]) : null,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  // ── 4. Heatmap (day-of-week × hour) ──────────────────────

  const heatmapMap = new Map<string, number>();
  for (const msg of messages) {
    const d = msg.createdAt;
    const key = `${d.getDay()}-${d.getHours()}`;
    heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
  }

  const heatmap: HourBucket[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({
        day,
        hour,
        count: heatmapMap.get(`${day}-${hour}`) || 0,
      });
    }
  }

  // ── 5. Lead temperature distribution ──────────────────────

  const tempCounts: Record<string, number> = { hot: 0, warm: 0, cool: 0, cold: 0 };
  for (const conv of conversations) {
    const t = conv.temperature;
    if (t in tempCounts) tempCounts[t]++;
  }
  const temperatureDistribution: TemperatureDist[] = Object.entries(tempCounts).map(([temperature, count]) => ({
    temperature,
    count,
  }));

  // ── 6. Escalation rate ────────────────────────────────────

  const escalatedCount = conversations.filter((c) => c.escalatedAt !== null || c.status === "escalated").length;
  const escalationRate = totalConversations > 0 ? Math.round((escalatedCount / totalConversations) * 100) : 0;

  // ── 7. Showing conversion ─────────────────────────────────

  const qualifiedOrBeyond = stageCounts["qualified"] || 0;
  const showingsBooked = stageCounts["showing_scheduled"] || 0;
  const showingConversionRate = qualifiedOrBeyond > 0 ? Math.round((showingsBooked / qualifiedOrBeyond) * 100) : 0;

  // ── 8. Top questions ──────────────────────────────────────

  let topQuestions: { text: string; count: number }[] = [];
  try {
    // Get first message per conversation
    const seenConvs = new Set<string>();
    const firstMsgs: string[] = [];
    for (const msg of firstMessages) {
      if (!seenConvs.has(msg.conversationId)) {
        seenConvs.add(msg.conversationId);
        firstMsgs.push(msg.body);
      }
    }

    // Bigram frequency (more meaningful than single words)
    const phraseCount = new Map<string, number>();
    for (const body of firstMsgs) {
      const words = body.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(
        (w) => w.length > 2 && !STOP_WORDS.has(w),
      );

      // Count individual meaningful words
      for (const w of words) {
        phraseCount.set(w, (phraseCount.get(w) || 0) + 1);
      }

      // Count bigrams
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        phraseCount.set(bigram, (phraseCount.get(bigram) || 0) + 1);
      }
    }

    // Prefer bigrams over single words, filter noise
    topQuestions = Array.from(phraseCount.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => {
        // Prefer bigrams (multi-word) over single words
        const aMulti = a[0].includes(" ") ? 1 : 0;
        const bMulti = b[0].includes(" ") ? 1 : 0;
        if (aMulti !== bMulti) return bMulti - aMulti;
        return b[1] - a[1];
      })
      .slice(0, 10)
      .map(([text, count]) => ({ text, count }));
  } catch {
    topQuestions = [];
  }

  // ── 9. Closed won count ────────────────────────────────────

  const closedWonCount = conversations.filter((c) => c.status === "closed_won").length;

  // ── 10. Average rent ──────────────────────────────────────

  const rentPrices = listings
    .map((l) => Number(l.rentPrice))
    .filter((p) => p > 0);
  const avgRent = rentPrices.length > 0
    ? Math.round(rentPrices.reduce((a, b) => a + b, 0) / rentPrices.length)
    : null;

  // ── 11. Source breakdown ──────────────────────────────────

  const SHOWING_STATUSES = new Set(["showing_scheduled", "applied", "closed_won"]);
  const sourceTotals = new Map<string, { total: number; showings: number }>();

  for (const conv of conversations) {
    const qd = (conv.qualData as Record<string, any>) || {};
    const source = (qd.source as string) || "unknown";
    const entry = sourceTotals.get(source) || { total: 0, showings: 0 };
    entry.total++;
    if (SHOWING_STATUSES.has(conv.status)) entry.showings++;
    sourceTotals.set(source, entry);
  }

  const sourceBreakdown: SourceBreakdown[] = Array.from(sourceTotals.entries())
    .map(([source, { total, showings }]) => ({
      source,
      count: total,
      showingConversionRate: total > 0 ? Math.round((showings / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── 12. Language breakdown ───────────────────────────────────

  const langCounts = new Map<string, number>();
  for (const conv of conversations) {
    const qd = (conv.qualData as Record<string, any>) || {};
    const lang = (qd.detectedLanguage as string) || "en";
    if (lang !== "en") {
      langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
    }
  }
  const languageBreakdown = Array.from(langCounts.entries())
    .filter(([, count]) => count >= 1)
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count);

  return {
    funnel,
    responseMetrics,
    volumeByDay,
    heatmap,
    temperatureDistribution,
    escalationRate,
    showingConversionRate,
    topQuestions,
    totalConversations,
    showingsBooked,
    closedWonCount,
    avgRent,
    sourceBreakdown,
    concessionsOffered: conversations.filter((c) => {
      const qd = c.qualData as Record<string, any> | null;
      return qd?.concessionOffered === true;
    }).length,
    languageBreakdown,
  };
}
