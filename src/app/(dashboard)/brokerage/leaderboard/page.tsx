"use client";

import { useState, useEffect } from "react";
import {
  getLeaderboard,
  getGoalsByMonth,
  setAgentGoals,
  setBulkGoals,
  refreshLeaderboard,
  getAgentDashboard,
} from "./actions";
import { getAgents } from "../agents/actions";
import { getCurrentBrokerageRole } from "@/lib/bms-auth";
import { hasPermission } from "@/lib/bms-permissions";
import { BADGE_DEFINITIONS } from "@/lib/agent-badges";
import type { LeaderboardEntry, AgentGoalInput, AgentGoalRecord, BrokerageRoleType } from "@/lib/bms-types";
import {
  Trophy,
  Target,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Minus,
  Sparkles,
  Flame,
  Medal,
  X,
  Users,
  History,
  Check,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const PERIOD_OPTIONS = [
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
] as const;

type PeriodValue = (typeof PERIOD_OPTIONS)[number]["value"];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function trendIcon(trend: LeaderboardEntry["trend"], prevRank?: number) {
  if (trend === "up") return <ChevronUp className="h-4 w-4 text-green-500" />;
  if (trend === "down") return <ChevronDown className="h-4 w-4 text-red-500" />;
  if (trend === "same") return <Minus className="h-3.5 w-3.5 text-slate-400" />;
  return <Sparkles className="h-3.5 w-3.5 text-blue-400" />;
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-lg" title="1st Place">🥇</span>;
  if (rank === 2) return <span className="text-lg" title="2nd Place">🥈</span>;
  if (rank === 3) return <span className="text-lg" title="3rd Place">🥉</span>;
  return <span className="text-sm font-bold text-slate-500">#{rank}</span>;
}

function progressBar(pct: number, color: string) {
  const w = Math.min(pct, 150);
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-green-500" : color}`}
        style={{ width: `${Math.min(w, 100)}%` }}
      />
    </div>
  );
}

function streakDisplay(streak: number) {
  if (streak === 0) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="flex items-center gap-0.5 text-sm font-medium text-orange-600">
      <Flame className="h-3.5 w-3.5" />
      {streak}
    </span>
  );
}

function rowBg(rank: number) {
  if (rank === 1) return "bg-amber-50/60";
  if (rank === 2) return "bg-slate-50/80";
  if (rank === 3) return "bg-orange-50/40";
  return "";
}

// ── Component ─────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>("month");
  const [role, setRole] = useState<BrokerageRoleType | null>(null);

  // Goal setting modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalMode, setGoalMode] = useState<"individual" | "bulk" | "history">("individual");
  const [agents, setAgents] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [goalTargets, setGoalTargets] = useState<AgentGoalInput>({});
  const [goalYear, setGoalYear] = useState(new Date().getFullYear());
  const [goalMonth, setGoalMonth] = useState(new Date().getMonth() + 1);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalSuccess, setGoalSuccess] = useState("");
  const [historyGoals, setHistoryGoals] = useState<AgentGoalRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const canManageGoals = role ? hasPermission(role, "goals_manage") : false;

  // ── Load ──────────────────────────────────────────────────

  useEffect(() => {
    getCurrentBrokerageRole().then(setRole);
  }, []);

  async function loadLeaderboard() {
    setLoading(true);
    try {
      const periodMap: Record<PeriodValue, "current_month" | "current_quarter" | "current_year"> = {
        month: "current_month",
        quarter: "current_quarter",
        year: "current_year",
      };
      const data = await getLeaderboard(periodMap[period]);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const now = new Date();
      await refreshLeaderboard(now.getFullYear(), now.getMonth() + 1);
      await loadLeaderboard();
    } finally {
      setRefreshing(false);
    }
  }

  // ── Goal Modal Handlers ─────────────────────────────────────

  async function openGoalModal() {
    setShowGoalModal(true);
    setGoalMode("individual");
    setGoalTargets({});
    setGoalSuccess("");
    setGoalYear(new Date().getFullYear());
    setGoalMonth(new Date().getMonth() + 1);
    try {
      const ag = await getAgents();
      setAgents((ag || []).filter((a: any) => a.status === "active"));
      if (ag.length > 0 && !selectedAgentId) setSelectedAgentId(ag[0].id);
    } catch {
      setAgents([]);
    }
  }

  async function handleSaveGoal() {
    setGoalSaving(true);
    setGoalSuccess("");
    try {
      if (goalMode === "individual") {
        if (!selectedAgentId) return;
        await setAgentGoals(selectedAgentId, goalYear, goalMonth, goalTargets);
        setGoalSuccess("Goals saved for agent");
      } else if (goalMode === "bulk") {
        await setBulkGoals(goalYear, goalMonth, goalTargets);
        setGoalSuccess(`Goals applied to all active agents`);
      }
      setGoalTargets({});
      await loadLeaderboard();
    } catch (err: any) {
      setGoalSuccess(`Error: ${err.message}`);
    } finally {
      setGoalSaving(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const goals = await getGoalsByMonth(goalYear, goalMonth);
      setHistoryGoals(goals);
    } catch {
      setHistoryGoals([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (goalMode === "history" && showGoalModal) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalMode, goalYear, goalMonth]);

  // ── Loading Skeleton ────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-slate-200 animate-pulse rounded" />
          <div className="h-9 w-64 bg-slate-100 animate-pulse rounded-lg" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 border-b border-slate-100 bg-slate-50/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Empty State ─────────────────────────────────────────────

  if (entries.length === 0 && !loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Leaderboard</h1>
            <p className="text-sm text-slate-500 mt-1">Track agent performance and goals</p>
          </div>
        </div>
        <div className="text-center py-20">
          <Trophy className="h-16 w-16 text-slate-200 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 mb-2">No leaderboard data yet</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Set goals for your agents to start tracking performance and populating the leaderboard.
          </p>
          {canManageGoals && (
            <button
              onClick={openGoalModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Target className="h-4 w-4" />
              Set Goals
            </button>
          )}
        </div>
        {showGoalModal && renderGoalModal()}
      </div>
    );
  }

  // ── Goal Setting Modal ──────────────────────────────────────

  function renderGoalModal() {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowGoalModal(false)}>
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Set Agent Goals</h2>
            <button onClick={() => setShowGoalModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setGoalMode("individual")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                goalMode === "individual" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setGoalMode("bulk")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                goalMode === "bulk" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"
              }`}
            >
              <Users className="h-3.5 w-3.5 inline mr-1" />
              Bulk
            </button>
            <button
              onClick={() => setGoalMode("history")}
              className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                goalMode === "history" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500"
              }`}
            >
              <History className="h-3.5 w-3.5 inline mr-1" />
              History
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Period selector */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
                <select
                  value={goalYear}
                  onChange={(e) => setGoalYear(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[goalYear - 1, goalYear, goalYear + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
                <select
                  value={goalMonth}
                  onChange={(e) => setGoalMonth(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Individual: Agent selector */}
            {goalMode === "individual" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Agent</label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Bulk: Info */}
            {goalMode === "bulk" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-700">
                  These targets will be applied to <strong>all active agents</strong> for {MONTH_NAMES[goalMonth - 1]} {goalYear}.
                </p>
              </div>
            )}

            {/* Target fields (Individual + Bulk) */}
            {goalMode !== "history" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Deals Target</label>
                    <input
                      type="number"
                      min={0}
                      value={goalTargets.dealsClosedTarget ?? ""}
                      onChange={(e) => setGoalTargets({ ...goalTargets, dealsClosedTarget: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="e.g. 5"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Revenue Target ($)</label>
                    <input
                      type="number"
                      min={0}
                      value={goalTargets.revenueTarget ?? ""}
                      onChange={(e) => setGoalTargets({ ...goalTargets, revenueTarget: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="e.g. 25000"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Listings Leased</label>
                    <input
                      type="number"
                      min={0}
                      value={goalTargets.listingsLeasedTarget ?? ""}
                      onChange={(e) => setGoalTargets({ ...goalTargets, listingsLeasedTarget: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="e.g. 3"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Listings Added</label>
                    <input
                      type="number"
                      min={0}
                      value={goalTargets.listingsAddedTarget ?? ""}
                      onChange={(e) => setGoalTargets({ ...goalTargets, listingsAddedTarget: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="e.g. 10"
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Save button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveGoal}
                    disabled={goalSaving || (goalMode === "individual" && !selectedAgentId)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {goalSaving ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    {goalMode === "bulk" ? "Apply to All Agents" : "Save Goals"}
                  </button>
                </div>

                {goalSuccess && (
                  <p className={`text-sm font-medium ${goalSuccess.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                    {goalSuccess}
                  </p>
                )}
              </>
            )}

            {/* History view */}
            {goalMode === "history" && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Goals for {MONTH_NAMES[goalMonth - 1]} {goalYear}
                </h3>
                {historyLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : historyGoals.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">No goals set for this month</p>
                ) : (
                  <div className="space-y-2">
                    {historyGoals.map((g) => {
                      const hit = checkHistoryHit(g);
                      return (
                        <div
                          key={g.id}
                          className={`border rounded-lg p-3 ${
                            hit ? "border-green-200 bg-green-50/50" : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-slate-800">
                              {g.agent?.firstName} {g.agent?.lastName}
                            </span>
                            {hit ? (
                              <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Hit</span>
                            ) : (
                              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Missed</span>
                            )}
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-slate-500">Deals</span>
                              <div className="font-medium">
                                {g.dealsClosedActual}/{g.dealsClosedTarget ?? "—"}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500">Revenue</span>
                              <div className="font-medium">
                                {fmt(g.revenueActual)}/{g.revenueTarget ? fmt(g.revenueTarget) : "—"}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500">Leased</span>
                              <div className="font-medium">
                                {g.listingsLeasedActual}/{g.listingsLeasedTarget ?? "—"}
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-500">Added</span>
                              <div className="font-medium">
                                {g.listingsAddedActual}/{g.listingsAddedTarget ?? "—"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leaderboard</h1>
          <p className="text-sm text-slate-500 mt-1">Track agent performance and goals</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  period === p.value ? "bg-blue-100 text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh actuals"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {/* Set Goals */}
          {canManageGoals && (
            <button
              onClick={openGoalModal}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Target className="h-4 w-4" />
              Set Goals
            </button>
          )}
        </div>
      </div>

      {/* ── Desktop Table ──────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider w-16">Rank</th>
              <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Deals</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Revenue</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Leased</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Added</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider w-20">Score</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider w-16">Streak</th>
              <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider w-12">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <tr key={entry.agentId} className={`hover:bg-slate-50/50 transition-colors ${rowBg(entry.rank)}`}>
                {/* Rank */}
                <td className="px-3 py-3 text-center">{rankBadge(entry.rank)}</td>

                {/* Agent name + badges */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{entry.agentName}</span>
                    {entry.badges.length > 0 && (
                      <span className="flex gap-0.5" title={entry.badges.map((b) => b.name).join(", ")}>
                        {entry.badges.slice(0, 3).map((b) => (
                          <span key={b.type} className="text-xs">{b.icon}</span>
                        ))}
                        {entry.badges.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{entry.badges.length - 3}</span>
                        )}
                      </span>
                    )}
                  </div>
                </td>

                {/* Deals */}
                <td className="px-3 py-3">
                  <div className="text-center">
                    <span className="text-sm font-medium">{entry.dealsClosed.actual}</span>
                    {entry.dealsClosed.target !== null && (
                      <span className="text-xs text-slate-400">/{entry.dealsClosed.target}</span>
                    )}
                    <div className="mt-1">{progressBar(entry.dealsClosed.pct, "bg-blue-500")}</div>
                  </div>
                </td>

                {/* Revenue */}
                <td className="px-3 py-3">
                  <div className="text-center">
                    <span className="text-sm font-medium">{fmt(entry.revenue.actual)}</span>
                    <div className="mt-1">{progressBar(entry.revenue.pct, "bg-violet-500")}</div>
                  </div>
                </td>

                {/* Leased */}
                <td className="px-3 py-3">
                  <div className="text-center">
                    <span className="text-sm font-medium">{entry.listingsLeased.actual}</span>
                    {entry.listingsLeased.target !== null && (
                      <span className="text-xs text-slate-400">/{entry.listingsLeased.target}</span>
                    )}
                    <div className="mt-1">{progressBar(entry.listingsLeased.pct, "bg-amber-500")}</div>
                  </div>
                </td>

                {/* Added */}
                <td className="px-3 py-3">
                  <div className="text-center">
                    <span className="text-sm font-medium">{entry.listingsAdded.actual}</span>
                    {entry.listingsAdded.target !== null && (
                      <span className="text-xs text-slate-400">/{entry.listingsAdded.target}</span>
                    )}
                    <div className="mt-1">{progressBar(entry.listingsAdded.pct, "bg-teal-500")}</div>
                  </div>
                </td>

                {/* Score */}
                <td className="px-3 py-3 text-center">
                  <span className={`text-sm font-bold ${entry.overallScore >= 100 ? "text-green-600" : entry.overallScore >= 70 ? "text-blue-600" : "text-slate-600"}`}>
                    {entry.overallScore}%
                  </span>
                </td>

                {/* Streak */}
                <td className="px-3 py-3 text-center">{streakDisplay(entry.streak)}</td>

                {/* Trend */}
                <td className="px-3 py-3 text-center">{trendIcon(entry.trend, entry.previousRank)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Cards ───────────────────────────────────── */}
      <div className="space-y-3 md:hidden">
        {entries.map((entry) => (
          <div
            key={entry.agentId}
            className={`bg-white border border-slate-200 rounded-xl p-4 ${
              entry.rank <= 3 ? "ring-1 ring-amber-200" : ""
            }`}
          >
            {/* Top row: rank + name + score + trend */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-shrink-0">{rankBadge(entry.rank)}</div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-800 truncate block">{entry.agentName}</span>
                {entry.badges.length > 0 && (
                  <span className="flex gap-0.5 mt-0.5">
                    {entry.badges.slice(0, 4).map((b) => (
                      <span key={b.type} className="text-xs">{b.icon}</span>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {streakDisplay(entry.streak)}
                <span className={`text-sm font-bold ${entry.overallScore >= 100 ? "text-green-600" : "text-blue-600"}`}>
                  {entry.overallScore}%
                </span>
                {trendIcon(entry.trend, entry.previousRank)}
              </div>
            </div>

            {/* Goal progress grid */}
            <div className="grid grid-cols-2 gap-3">
              <MobileMetric label="Deals" actual={entry.dealsClosed.actual} target={entry.dealsClosed.target} pct={entry.dealsClosed.pct} color="bg-blue-500" />
              <MobileMetric label="Revenue" actual={entry.revenue.actual} target={entry.revenue.target} pct={entry.revenue.pct} color="bg-violet-500" isCurrency />
              <MobileMetric label="Leased" actual={entry.listingsLeased.actual} target={entry.listingsLeased.target} pct={entry.listingsLeased.pct} color="bg-amber-500" />
              <MobileMetric label="Added" actual={entry.listingsAdded.actual} target={entry.listingsAdded.target} pct={entry.listingsAdded.pct} color="bg-teal-500" />
            </div>
          </div>
        ))}
      </div>

      {/* Goal Modal */}
      {showGoalModal && renderGoalModal()}
    </div>
  );
}

// ── Mobile Metric Card ───────────────────────────────────────

function MobileMetric({
  label,
  actual,
  target,
  pct,
  color,
  isCurrency,
}: {
  label: string;
  actual: number;
  target: number | null;
  pct: number;
  color: string;
  isCurrency?: boolean;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-medium text-slate-700">
          {isCurrency ? fmt(actual) : actual}
          {target !== null && <span className="text-slate-400">/{isCurrency ? fmt(target) : target}</span>}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Helper for history hit check ──────────────────────────────

function checkHistoryHit(g: AgentGoalRecord): boolean {
  let hasAnyTarget = false;
  if (g.dealsClosedTarget !== null && g.dealsClosedTarget > 0) {
    hasAnyTarget = true;
    if (g.dealsClosedActual < g.dealsClosedTarget) return false;
  }
  if (g.revenueTarget !== null && g.revenueTarget > 0) {
    hasAnyTarget = true;
    if (g.revenueActual < g.revenueTarget) return false;
  }
  if (g.listingsLeasedTarget !== null && g.listingsLeasedTarget > 0) {
    hasAnyTarget = true;
    if (g.listingsLeasedActual < g.listingsLeasedTarget) return false;
  }
  if (g.listingsAddedTarget !== null && g.listingsAddedTarget > 0) {
    hasAnyTarget = true;
    if (g.listingsAddedActual < g.listingsAddedTarget) return false;
  }
  return hasAnyTarget;
}
