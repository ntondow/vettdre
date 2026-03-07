"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Loader2, MessageSquare, Clock, Calendar, AlertTriangle, Zap, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, PieChart, Pie,
} from "recharts";
import { getLeasingConfigs, getAnalyticsData, getAbTestResults, getBenchmarksData } from "../actions";
import type { AnalyticsData, AbResultsData, BenchmarkResult } from "../actions";
import type { LeasingConfigSummary } from "@/lib/leasing-types";
import ROICalculator from "@/components/leasing/ROICalculator";
import UpgradePrompt from "@/components/leasing/UpgradePrompt";

// ── Helpers ──────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TEMP_COLORS: Record<string, string> = {
  hot: "#ef4444",
  warm: "#f59e0b",
  cool: "#3b82f6",
  cold: "#6b7280",
};

const FUNNEL_COLORS = ["#3b82f6", "#2563eb", "#1d4ed8", "#1e40af", "#22c55e"];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RANGES: { key: "7d" | "30d" | "90d"; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

// ── Benchmark label helper ───────────────────────────────────

function getBenchmarkLabel(
  benchmarks: BenchmarkResult | null,
  metric: string,
  noun: string,
): { text: string; color: string } | null {
  if (!benchmarks?.metrics[metric]) return null;
  const m = benchmarks.metrics[metric];
  if (m.myValue === null) return null;

  switch (m.label) {
    case "top 25%":
      return { text: `Faster than ${m.percentilePosition}% of similar buildings`, color: "text-emerald-600" };
    case "above average":
      return { text: `Above average for your building size`, color: "text-blue-600" };
    case "average":
      return { text: `Similar to average`, color: "text-slate-500" };
    case "below average":
      return { text: `Below average — room to improve`, color: "text-amber-600" };
    default:
      return null;
  }
}

// ══════════════════════════════════════════════════════════════
// Page Component
// ══════════════════════════════════════════════════════════════

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configIdParam = searchParams.get("configId");

  const [configs, setConfigs] = useState<LeasingConfigSummary[]>([]);
  const [configId, setConfigId] = useState<string>(configIdParam || "");
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [tier, setTier] = useState<string>("free");
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeTrigger, setUpgradeTrigger] = useState("analytics");
  const [abResults, setAbResults] = useState<AbResultsData | null>(null);
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult | null>(null);
  const [benchmarkDismissed, setBenchmarkDismissed] = useState(false);

  // ── Load configs ───────────────────────────────────────────

  useEffect(() => {
    getLeasingConfigs().then((res) => {
      if (res.configs && res.configs.length > 0) {
        setConfigs(res.configs);
        if (!configIdParam) setConfigId(res.configs[0].id);
      }
      setLoading(false);
    });
  }, [configIdParam]);

  // ── Fetch analytics ────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!configId) return;
    setDataLoading(true);
    const [res, abRes] = await Promise.all([
      getAnalyticsData(configId, range),
      getAbTestResults(configId),
    ]);
    if (res.data) {
      setData(res.data);
      setTier(res.tier || "free");
    }
    if (abRes.results) setAbResults(abRes.results);
    setDataLoading(false);

    // Load benchmarks in parallel (non-blocking)
    getBenchmarksData(configId).then((bRes) => {
      if (bRes.benchmarks) setBenchmarks(bRes.benchmarks);
    });
  }, [configId, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isPro = tier === "pro" || tier === "team";
  const activeConfig = configs.find((c) => c.id === configId);

  // ── Loading state ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/leasing")}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">Leasing Analytics</h1>
        </div>

        {/* Config selector (if multiple) */}
        {configs.length > 1 && (
          <select
            value={configId}
            onChange={(e) => setConfigId(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {configs.map((c) => (
              <option key={c.id} value={c.id}>{c.propertyName || c.propertyAddress}</option>
            ))}
          </select>
        )}
      </div>

      {/* Date range pills */}
      <div className="flex gap-2 mb-6">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              range === r.key
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {data && data.totalConversations < 10 && !dataLoading && (
        <div className="text-center py-24">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-1">Not enough data yet</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your analytics will appear here once your AI has handled a few conversations.
          </p>
          <button
            onClick={() => router.push("/leasing")}
            className="text-sm text-blue-600 hover:underline"
          >
            Go to conversations &rarr;
          </button>
        </div>
      )}

      {/* Charts */}
      {(dataLoading || (data && data.totalConversations >= 10)) && (
        <>
          {/* Top 25% response time banner */}
          {benchmarks?.metrics.avg_response_time_ms?.label === "top 25%" && !benchmarkDismissed && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 animate-[fade-in_0.3s_ease-out]">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-800">
                  Your AI responds faster than {benchmarks.metrics.avg_response_time_ms.percentilePosition}% of similar{" "}
                  {benchmarks.segment.startsWith("nyc") ? "NYC " : ""}buildings
                </p>
              </div>
              <button
                onClick={() => setBenchmarkDismissed(true)}
                className="text-emerald-400 hover:text-emerald-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <StatCard
              label="Total Conversations"
              value={data ? String(data.totalConversations) : "—"}
              icon={MessageSquare}
              loading={dataLoading}
              benchmarkLabel={getBenchmarkLabel(benchmarks, "messages_per_conversation", "conversations")}
            />
            <StatCard
              label="Avg Response Time"
              value={data ? formatDuration(data.responseMetrics.avg) : "—"}
              icon={Clock}
              loading={dataLoading}
              benchmarkLabel={getBenchmarkLabel(benchmarks, "avg_response_time_ms", "response time")}
            />
            <StatCard
              label="Showings Booked"
              value={data ? String(data.showingsBooked) : "—"}
              icon={Calendar}
              loading={dataLoading}
              benchmarkLabel={getBenchmarkLabel(benchmarks, "showing_conversion_rate", "showings")}
            />
            <StatCard
              label="Escalation Rate"
              value={data ? `${data.escalationRate}%` : "—"}
              icon={AlertTriangle}
              loading={dataLoading}
              accent={data && data.escalationRate > 20 ? "text-red-600" : undefined}
              benchmarkLabel={getBenchmarkLabel(benchmarks, "escalation_rate", "escalation")}
            />
            <StatCard
              label="Concessions Offered"
              value={data ? String(data.concessionsOffered) : "—"}
              icon={Zap}
              loading={dataLoading}
            />
          </div>

          {/* Language breakdown */}
          {data && !dataLoading && data.languageBreakdown.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-slate-500">
              {data.languageBreakdown.map((lb) => (
                <span key={lb.language} className="flex items-center gap-1">
                  <span>{lb.language === "es" ? "🇪🇸" : lb.language === "zh" ? "🇨🇳" : lb.language === "ru" ? "🇷🇺" : lb.language === "he" ? "🇮🇱" : "🌐"}</span>
                  <span>{lb.count} conversation{lb.count !== 1 ? "s" : ""} in {lb.language === "es" ? "Spanish" : lb.language === "zh" ? "Mandarin" : lb.language === "ru" ? "Russian" : lb.language === "he" ? "Hebrew" : lb.language}</span>
                </span>
              ))}
            </div>
          )}

          {/* Row 1: Funnel + Temperature */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Funnel */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Conversion Funnel</h3>
              {dataLoading ? <Skeleton h="h-64" /> : data && <FunnelChart funnel={data.funnel} />}
            </div>

            {/* Temperature donut */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Lead Temperature</h3>
              {dataLoading ? <Skeleton h="h-64" /> : data && <TemperatureDonut distribution={data.temperatureDistribution} />}
            </div>
          </div>

          {/* Row 1b: Lead Sources */}
          {data && !dataLoading && data.sourceBreakdown.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Lead Sources</h3>
              <SourceChart breakdown={data.sourceBreakdown} overallShowingRate={data.showingConversionRate} />
            </div>
          )}

          {/* Row 2: Response time (Pro gated) */}
          <div className="relative bg-white border border-slate-200 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Response Time (seconds)</h3>
            {!isPro && <ProOverlay onUpgrade={() => { setUpgradeTrigger("analytics"); setUpgradeOpen(true); }} />}
            <div className={!isPro ? "blur-sm pointer-events-none" : ""}>
              {dataLoading ? <Skeleton h="h-64" /> : data && <ResponseTimeChart volumeByDay={data.volumeByDay} />}
            </div>
          </div>

          {/* Row 3: Heatmap (Pro gated) + Top Questions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="relative bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Message Activity Heatmap</h3>
              {!isPro && <ProOverlay onUpgrade={() => { setUpgradeTrigger("analytics"); setUpgradeOpen(true); }} />}
              <div className={!isPro ? "blur-sm pointer-events-none" : ""}>
                {dataLoading ? <Skeleton h="h-48" /> : data && <Heatmap buckets={data.heatmap} />}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Top Questions</h3>
              {dataLoading ? <Skeleton h="h-48" /> : data && <TopQuestions questions={data.topQuestions} />}
            </div>
          </div>

          {/* ROI Calculator */}
          {data && !dataLoading && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Financial Impact</h3>
              <ROICalculator
                tier={tier}
                showingConversionRate={data.showingConversionRate}
                avgRent={data.avgRent}
                activeListingsCount={activeConfig?.availableListings ?? 1}
                unitsLeasedThisMonth={data.closedWonCount}
                onUpgrade={() => { setUpgradeTrigger("analytics"); setUpgradeOpen(true); }}
              />
            </div>
          )}
          {/* How You Compare */}
          {!dataLoading && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 mt-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-700">How You Compare</h3>
                {benchmarks && (
                  <span className="text-[10px] text-slate-400 ml-auto">
                    {benchmarks.sampleSize} buildings in segment &middot; Updated {new Date(benchmarks.lastUpdated).toLocaleDateString()}
                  </span>
                )}
              </div>
              {benchmarks && Object.keys(benchmarks.metrics).length > 0 ? (
                <BenchmarkTable benchmarks={benchmarks} responseAvg={data?.responseMetrics.avg ?? null} />
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400 mb-1">
                    Benchmarks will appear once more buildings join VettdRE Leasing
                  </p>
                  <p className="text-xs text-slate-300">
                    We need at least 5 similar buildings to generate anonymous comparisons
                  </p>
                </div>
              )}
              {tier === "free" && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
                  <Zap className="w-4 h-4 inline mr-1.5 text-blue-600" />
                  Pro tier buildings convert showings 43% better than free tier
                  <button
                    onClick={() => { setUpgradeTrigger("benchmarks"); setUpgradeOpen(true); }}
                    className="ml-2 text-blue-600 font-medium hover:underline"
                  >
                    Upgrade &rarr;
                  </button>
                </div>
              )}
            </div>
          )}

          {/* A/B Tests (Pro gated) */}
          <div className="relative bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">A/B Tests</h3>
            {!isPro && <ProOverlay onUpgrade={() => { setUpgradeTrigger("three_touch"); setUpgradeOpen(true); }} />}
            <div className={!isPro ? "blur-sm pointer-events-none" : ""}>
              {abResults && abResults.some((r) => r.variantA.sent > 0 || r.variantB.sent > 0) ? (
                <AbTestTable results={abResults} />
              ) : (
                <div className="text-sm text-slate-400 text-center py-8">
                  Follow-up A/B tests will appear here once your sequences start sending.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <UpgradePrompt
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        trigger={upgradeTrigger}
        configId={configId}
        currentTier={tier as "free" | "pro" | "team"}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════

function StatCard({
  label, value, icon: Icon, loading, accent, benchmarkLabel,
}: {
  label: string; value: string; icon: typeof MessageSquare; loading: boolean; accent?: string;
  benchmarkLabel?: { text: string; color: string } | null;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
      ) : (
        <>
          <p className={`text-2xl font-bold ${accent || "text-slate-900"}`}>{value}</p>
          {benchmarkLabel && (
            <p className={`text-[11px] mt-1 ${benchmarkLabel.color}`}>{benchmarkLabel.text}</p>
          )}
        </>
      )}
    </div>
  );
}

function Skeleton({ h }: { h: string }) {
  return <div className={`${h} w-full bg-slate-100 rounded-lg animate-pulse`} />;
}

function ProOverlay({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-white/60">
      <Zap className="w-6 h-6 text-blue-600 mb-2" />
      <p className="text-sm font-semibold text-slate-700 mb-1">Unlock full analytics with Pro</p>
      <button
        onClick={onUpgrade}
        className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Upgrade
      </button>
    </div>
  );
}

// ── Funnel Chart ─────────────────────────────────────────────

function FunnelChart({ funnel }: { funnel: AnalyticsData["funnel"] }) {
  const maxCount = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <div className="space-y-2">
      {funnel.map((stage, i) => (
        <div key={stage.stage}>
          {i > 0 && stage.conversionRate !== null && (
            <div className="text-xs text-slate-400 pl-2 mb-1">&rarr; {stage.conversionRate}%</div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-32 text-xs font-medium text-slate-600 text-right flex-shrink-0">
              {stage.label}
            </div>
            <div className="flex-1 h-8 bg-slate-50 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-500"
                style={{
                  width: `${Math.max((stage.count / maxCount) * 100, 2)}%`,
                  backgroundColor: FUNNEL_COLORS[i] || FUNNEL_COLORS[4],
                }}
              />
              <span className="absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-white drop-shadow">
                {stage.count}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Temperature Donut ────────────────────────────────────────

function TemperatureDonut({ distribution }: { distribution: AnalyticsData["temperatureDistribution"] }) {
  const total = distribution.reduce((a, b) => a + b.count, 0);
  if (total === 0) {
    return <div className="text-sm text-slate-400 text-center py-12">No data</div>;
  }

  const chartData = distribution.filter((d) => d.count > 0).map((d) => ({
    name: d.temperature.charAt(0).toUpperCase() + d.temperature.slice(1),
    value: d.count,
    fill: TEMP_COLORS[d.temperature] || "#94a3b8",
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any, name: any) => [value, name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {chartData.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="text-slate-600">{d.name}: {d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Response Time Chart ──────────────────────────────────────

function ResponseTimeChart({ volumeByDay }: { volumeByDay: AnalyticsData["volumeByDay"] }) {
  const chartData = volumeByDay
    .filter((d) => d.avgResponseSec !== null)
    .map((d) => ({
      date: formatDate(d.date),
      avg: Math.round(d.avgResponseSec!),
      p95: d.p95ResponseSec ? Math.round(d.p95ResponseSec) : null,
    }));

  if (chartData.length === 0) {
    return <div className="text-sm text-slate-400 text-center py-12">No response data yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(value: any, name: any) => [`${value}s`, name === "avg" ? "Avg" : "P95"]}
        />
        <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p95" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Heatmap ──────────────────────────────────────────────────

function Heatmap({ buckets }: { buckets: AnalyticsData["heatmap"] }) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  function getColor(count: number): string {
    if (count === 0) return "bg-slate-100";
    const ratio = count / maxCount;
    if (ratio < 0.2) return "bg-blue-100";
    if (ratio < 0.4) return "bg-blue-200";
    if (ratio < 0.6) return "bg-blue-300";
    if (ratio < 0.8) return "bg-blue-400";
    return "bg-blue-500";
  }

  // Reorder: Mon=1, Tue=2, ..., Sun=0 → Mon, Tue, Wed, Thu, Fri, Sat, Sun
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayLabelsOrdered = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="overflow-x-auto">
      {/* Hour labels */}
      <div className="flex items-center gap-0.5 ml-10 mb-1">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="w-3 text-center text-[8px] text-slate-400">
            {h % 3 === 0 ? h : ""}
          </div>
        ))}
      </div>

      {dayOrder.map((dayIdx, rowIdx) => (
        <div key={dayIdx} className="flex items-center gap-0.5 mb-0.5">
          <div className="w-9 text-right text-[10px] text-slate-500 pr-1">{dayLabelsOrdered[rowIdx]}</div>
          {Array.from({ length: 24 }, (_, hour) => {
            const bucket = buckets.find((b) => b.day === dayIdx && b.hour === hour);
            const count = bucket?.count || 0;
            return (
              <div
                key={hour}
                className={`w-3 h-3 rounded-[2px] ${getColor(count)}`}
                title={`${dayLabelsOrdered[rowIdx]} ${hour}:00 — ${count} messages`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Top Questions ────────────────────────────────────────────

function TopQuestions({ questions }: { questions: AnalyticsData["topQuestions"] }) {
  if (questions.length === 0) {
    return <div className="text-sm text-slate-400 text-center py-12">Not enough data</div>;
  }

  const maxCount = Math.max(...questions.map((q) => q.count), 1);

  return (
    <div className="space-y-2">
      {questions.map((q, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-32 sm:w-40 text-xs text-slate-600 truncate flex-shrink-0">{q.text}</div>
          <div className="flex-1 h-5 bg-slate-50 rounded overflow-hidden">
            <div
              className="h-full bg-blue-200 rounded transition-all duration-300"
              style={{ width: `${(q.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 w-6 text-right flex-shrink-0">{q.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Lead Source Chart ────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  streeteasy: "StreetEasy",
  apartments_com: "Apartments.com",
  zillow: "Zillow",
  craigslist: "Craigslist",
  direct_sms: "Direct SMS",
  direct_email: "Direct Email",
  web_chat: "Web Chat",
  unknown: "Unknown",
};

const SOURCE_COLORS: Record<string, string> = {
  streeteasy: "#2563eb",
  apartments_com: "#059669",
  zillow: "#0284c7",
  craigslist: "#7c3aed",
  direct_sms: "#f59e0b",
  direct_email: "#6366f1",
  web_chat: "#ec4899",
  unknown: "#94a3b8",
};

function SourceChart({
  breakdown,
  overallShowingRate,
}: {
  breakdown: AnalyticsData["sourceBreakdown"];
  overallShowingRate: number;
}) {
  const chartData = breakdown.map((s) => ({
    name: SOURCE_LABELS[s.source] || s.source,
    count: s.count,
    fill: SOURCE_COLORS[s.source] || "#94a3b8",
    showingRate: s.showingConversionRate,
    source: s.source,
  }));

  // Find standout source: ≥ 1.5× overall showing rate AND ≥ 5 conversations
  const standout = overallShowingRate > 0
    ? breakdown.find((s) => s.count >= 5 && s.showingConversionRate >= overallShowingRate * 1.5)
    : null;

  // All unknown tip
  const allUnknown = breakdown.length === 1 && breakdown[0].source === "unknown";

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: any, _name: any, props: any) => [
              `${value} conversations (${props.payload.showingRate}% showing rate)`,
              "",
            ]}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Standout callout */}
      {standout && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <TrendingUp className="w-4 h-4 inline mr-1.5 text-amber-600" />
          <strong>{SOURCE_LABELS[standout.source] || standout.source}</strong> leads convert to showings{" "}
          <strong>{Math.round(standout.showingConversionRate / overallShowingRate * 10) / 10}&times;</strong> better than average
        </div>
      )}

      {/* All unknown tip */}
      {allUnknown && (
        <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
          Add source info to your listings &mdash; put &ldquo;Saw your Craigslist listing&rdquo; in your template texts to help track lead quality.
        </div>
      )}
    </div>
  );
}

// ── A/B Test Results Table ──────────────────────────────────

function AbTestTable({ results }: { results: AbResultsData }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 pr-4 font-medium text-slate-600">Test</th>
            <th className="text-center py-2 px-3 font-medium text-slate-600" colSpan={3}>Variant A</th>
            <th className="text-center py-2 px-3 font-medium text-slate-600" colSpan={3}>Variant B</th>
            <th className="text-right py-2 pl-4 font-medium text-slate-600">Status</th>
          </tr>
          <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wide">
            <th />
            <th className="py-1 px-1 text-center">Sent</th>
            <th className="py-1 px-1 text-center">Conv.</th>
            <th className="py-1 px-1 text-center">Rate</th>
            <th className="py-1 px-1 text-center">Sent</th>
            <th className="py-1 px-1 text-center">Conv.</th>
            <th className="py-1 px-1 text-center">Rate</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const hasData = r.variantA.sent > 0 || r.variantB.sent > 0;
            if (!hasData) return null;

            let statusLabel: string;
            let statusClass: string;

            if (r.winner && r.significant) {
              // Check if this is a promoted winner (active=false in the test)
              const isPromoted = r.pValue < 0.05;
              if (isPromoted) {
                statusLabel = `Promoted — ${r.winner} wins`;
                statusClass = "text-blue-700 bg-blue-50";
              } else {
                statusLabel = `Significant — ${r.winner} wins`;
                statusClass = "text-emerald-700 bg-emerald-50";
              }
            } else {
              statusLabel = "Collecting data";
              statusClass = "text-slate-500 bg-slate-50";
            }

            return (
              <tr key={r.testId} className="border-b border-slate-50">
                <td className="py-2.5 pr-4 text-slate-700 font-medium">{r.testName}</td>
                <td className="py-2.5 px-1 text-center text-slate-600">{r.variantA.sent}</td>
                <td className="py-2.5 px-1 text-center text-slate-600">{r.variantA.converted}</td>
                <td className={`py-2.5 px-1 text-center font-medium ${r.winner === "A" ? "text-emerald-600" : "text-slate-600"}`}>
                  {r.variantA.rate}%
                </td>
                <td className="py-2.5 px-1 text-center text-slate-600">{r.variantB.sent}</td>
                <td className="py-2.5 px-1 text-center text-slate-600">{r.variantB.converted}</td>
                <td className={`py-2.5 px-1 text-center font-medium ${r.winner === "B" ? "text-emerald-600" : "text-slate-600"}`}>
                  {r.variantB.rate}%
                </td>
                <td className="py-2.5 pl-4 text-right">
                  <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${statusClass}`}>
                    {statusLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {results.some((r) => r.significant) && (
        <p className="text-[11px] text-slate-400 mt-2">
          p &lt; 0.05, minimum 30 sends per variant. Winners auto-promoted to all future conversations.
        </p>
      )}
    </div>
  );
}

// ── Benchmark Comparison Table ───────────────────────────────

const BENCHMARK_METRIC_LABELS: Record<string, { label: string; format: (v: number) => string }> = {
  avg_response_time_ms: {
    label: "Response Time",
    format: (v) => formatDuration(v / 1000),
  },
  showing_conversion_rate: {
    label: "Showing Conversion",
    format: (v) => `${Math.round(v)}%`,
  },
  escalation_rate: {
    label: "Escalation Rate",
    format: (v) => `${Math.round(v)}%`,
  },
  messages_per_conversation: {
    label: "Messages / Conversation",
    format: (v) => String(Math.round(v * 10) / 10),
  },
};

const RANK_COLORS: Record<string, string> = {
  "top 25%": "text-emerald-600 bg-emerald-50",
  "above average": "text-blue-600 bg-blue-50",
  "average": "text-slate-600 bg-slate-50",
  "below average": "text-amber-600 bg-amber-50",
};

function BenchmarkTable({
  benchmarks,
  responseAvg,
}: {
  benchmarks: BenchmarkResult;
  responseAvg: number | null;
}) {
  const metricOrder = ["avg_response_time_ms", "showing_conversion_rate", "escalation_rate", "messages_per_conversation"];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2 pr-4 font-medium text-slate-600">Metric</th>
            <th className="text-center py-2 px-3 font-medium text-slate-600">Your Score</th>
            <th className="text-center py-2 px-3 font-medium text-slate-600">Segment Median</th>
            <th className="text-right py-2 pl-4 font-medium text-slate-600">Your Rank</th>
          </tr>
        </thead>
        <tbody>
          {metricOrder.map((metricKey) => {
            const m = benchmarks.metrics[metricKey];
            if (!m) return null;

            const meta = BENCHMARK_METRIC_LABELS[metricKey];
            if (!meta) return null;

            // For response time, use the analytics avg (in seconds) → convert to ms for display
            let myDisplay: string;
            if (metricKey === "avg_response_time_ms" && responseAvg !== null) {
              myDisplay = formatDuration(responseAvg);
            } else {
              myDisplay = m.myValue !== null ? meta.format(m.myValue) : "—";
            }

            const medianDisplay = meta.format(m.p50);
            const rankClass = RANK_COLORS[m.label] || "text-slate-500 bg-slate-50";

            return (
              <tr key={metricKey} className="border-b border-slate-50">
                <td className="py-2.5 pr-4 text-slate-700 font-medium">{meta.label}</td>
                <td className="py-2.5 px-3 text-center text-slate-800 font-semibold">{myDisplay}</td>
                <td className="py-2.5 px-3 text-center text-slate-500">{medianDisplay}</td>
                <td className="py-2.5 pl-4 text-right">
                  <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${rankClass}`}>
                    {m.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
