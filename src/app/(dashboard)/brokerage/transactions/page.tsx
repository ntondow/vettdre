"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  X,
  FolderOpen,
  TrendingUp,
  Clock,
  CheckCircle2,
  BarChart3,
  Receipt,
  Wallet,
} from "lucide-react";
import {
  getTransactions,
  getTransactionStats,
  createTransaction,
} from "./actions";
import { getAgents } from "../agents/actions";
import {
  STAGE_LABELS,
  STAGE_COLORS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  getStagesForType,
} from "@/lib/transaction-templates";
import type {
  TransactionRecord,
  TransactionStats,
  CreateTransactionInput,
  BmsTransactionTypeAlias,
  TransactionStageType,
} from "@/lib/bms-types";

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "\u2014";
  }
};

type AgentOption = { id: string; firstName: string; lastName: string; email: string };

const TYPE_TABS = ["all", "rental", "sale"] as const;

// ── Lifecycle Stage Dots ────────────────────────────────────

const LIFECYCLE_PHASES = [
  { key: "operational", label: "Deal" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
  { key: "agentPaid", label: "Agent Paid" },
  { key: "closed", label: "Closed" },
] as const;

function getLifecyclePhase(stage: string): number {
  const financialStages: Record<string, number> = {
    invoice_sent: 1,
    payment_received: 2,
    agent_paid: 3,
    closed: 4,
    cancelled: -1,
  };
  if (stage in financialStages) return financialStages[stage];
  return 0; // operational stage
}

function LifecycleIndicator({ stage }: { stage: string }) {
  const phase = getLifecyclePhase(stage);
  if (phase === -1) {
    return (
      <div className="flex items-center gap-0.5" title="Cancelled">
        {LIFECYCLE_PHASES.map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-300" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-0.5" title={LIFECYCLE_PHASES[Math.min(phase, 4)]?.label}>
      {LIFECYCLE_PHASES.map((p, i) => (
        <div
          key={p.key}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i <= phase ? "bg-blue-500" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────

export default function TransactionsPage() {
  const router = useRouter();

  // Data
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState<CreateTransactionInput>({
    type: "rental",
    propertyAddress: "",
  });

  // ── Load Data ────────────────────────────────────────────

  async function loadData() {
    try {
      const filters: Record<string, string> = {};
      if (typeFilter !== "all") filters.type = typeFilter;
      if (stageFilter !== "all") filters.stage = stageFilter;
      if (debouncedSearch) filters.search = debouncedSearch;

      const [txs, st] = await Promise.all([
        getTransactions(filters),
        getTransactionStats(),
      ]);
      setTransactions(txs);
      setStats(st);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // Load agents for the create modal
    getAgents({ status: "active", limit: 100 })
      .then((res) => {
        if (res?.agents) setAgents(res.agents as AgentOption[]);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [typeFilter, stageFilter, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // Reset stage filter when type changes (stages differ per type)
  useEffect(() => {
    setStageFilter("all");
  }, [typeFilter]);

  // ── Create Transaction ───────────────────────────────────

  async function handleCreate() {
    if (!form.propertyAddress.trim()) {
      setCreateError("Property address is required");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const tx = await createTransaction(form);
      setShowCreate(false);
      setForm({ type: "rental", propertyAddress: "" });
      router.push(`/brokerage/transactions/${tx.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create transaction");
    } finally {
      setCreating(false);
    }
  }

  function openCreate() {
    setForm({ type: "rental", propertyAddress: "" });
    setCreateError("");
    setShowCreate(true);
  }

  // ── Stage options for current type filter ─────────────────

  function getStageOptions(): { value: string; label: string }[] {
    if (typeFilter === "all") {
      // Show all non-cancelled stages
      return [
        { value: "all", label: "All Stages" },
        ...Object.entries(STAGE_LABELS)
          .filter(([k]) => k !== "cancelled")
          .map(([value, label]) => ({ value, label })),
      ];
    }
    const stages = getStagesForType(typeFilter as BmsTransactionTypeAlias);
    return [
      { value: "all", label: "All Stages" },
      ...stages.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
      { value: "cancelled", label: "Cancelled" },
    ];
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
          <p className="text-sm text-slate-500 mt-1">Track deals from start to close</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Transaction
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={FolderOpen}
            label="Open"
            value={stats.openCount}
            color="text-blue-600 bg-blue-50"
          />
          <StatCard
            icon={CheckCircle2}
            label="Closed This Month"
            value={stats.closedThisMonth}
            color="text-emerald-600 bg-emerald-50"
          />
          <StatCard
            icon={Clock}
            label="Avg Days to Close"
            value={stats.avgDaysToClose || "\u2014"}
            color="text-amber-600 bg-amber-50"
          />
          <StatCard
            icon={BarChart3}
            label="By Type"
            value={`${stats.byType?.rental || 0}R / ${stats.byType?.sale || 0}S`}
            color="text-indigo-600 bg-indigo-50"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Type pills */}
        <div className="flex gap-1.5">
          {TYPE_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                typeFilter === t
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t === "all" ? "All" : TRANSACTION_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Stage dropdown */}
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {getStageOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search address, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-4 w-48 bg-slate-200 rounded" />
                <div className="h-5 w-16 bg-slate-200 rounded-full" />
                <div className="h-5 w-20 bg-slate-200 rounded-full" />
                <div className="flex-1" />
                <div className="h-4 w-24 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && transactions.length === 0 && (
        <div className="text-center py-16">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No transactions found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search || typeFilter !== "all" || stageFilter !== "all"
              ? "Try adjusting your filters"
              : "Create your first transaction to get started"}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && transactions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {/* Header row - desktop only */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wider">
            <div className="col-span-3">Property</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-2">Stage</div>
            <div className="col-span-2">Client</div>
            <div className="col-span-1 text-right">Value</div>
            <div className="col-span-1 text-center">Payout</div>
            <div className="col-span-2 text-right">Lifecycle</div>
          </div>

          {transactions.map((tx) => {
            const agent = (tx as any).agent as AgentOption | null; // eslint-disable-line @typescript-eslint/no-explicit-any
            return (
              <Link
                key={tx.id}
                href={`/brokerage/transactions/${tx.id}`}
                className="block md:grid grid-cols-12 gap-4 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
              >
                {/* Mobile layout */}
                <div className="md:hidden space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{tx.propertyAddress}</p>
                      {tx.propertyUnit && (
                        <span className="text-xs text-slate-500"> Unit {tx.propertyUnit}</span>
                      )}
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <LifecycleIndicator stage={tx.stage} />
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STAGE_COLORS[tx.stage as TransactionStageType]}`}>
                        {STAGE_LABELS[tx.stage as TransactionStageType]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{tx.clientName || "\u2014"}</span>
                    <div className="flex items-center gap-3">
                      <span>{tx.transactionValue ? fmt(tx.transactionValue) : "\u2014"}</span>
                      {(() => {
                        const agents = (tx as any).agents as Array<{ payoutStatus: string }> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
                        if (agents && agents.length > 1) {
                          const paidCount = agents.filter((a) => a.payoutStatus === "paid").length;
                          return (
                            <span className={paidCount === agents.length ? "text-green-600 font-medium" : "text-amber-600"}>
                              {paidCount}/{agents.length} Paid
                            </span>
                          );
                        }
                        return tx.agentPayoutStatus === "paid" ? (
                          <span className="text-green-600 font-medium">Paid</span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>

                {/* Desktop layout */}
                <div className="hidden md:flex col-span-3 items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">
                      {tx.propertyAddress}
                    </p>
                    {tx.propertyUnit && (
                      <p className="text-xs text-slate-500">Unit {tx.propertyUnit}</p>
                    )}
                  </div>
                </div>
                <div className="hidden md:flex col-span-1 items-center">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${TRANSACTION_TYPE_COLORS[tx.type]}`}>
                    {TRANSACTION_TYPE_LABELS[tx.type]}
                  </span>
                </div>
                <div className="hidden md:flex col-span-2 items-center">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STAGE_COLORS[tx.stage as TransactionStageType]}`}>
                    {STAGE_LABELS[tx.stage as TransactionStageType]}
                  </span>
                </div>
                <div className="hidden md:flex col-span-2 items-center text-sm text-slate-600 truncate">
                  {tx.clientName || "\u2014"}
                </div>
                <div className="hidden md:flex col-span-1 items-center justify-end text-sm text-slate-700 font-medium">
                  {tx.transactionValue ? fmt(tx.transactionValue) : "\u2014"}
                </div>
                <div className="hidden md:flex col-span-1 items-center justify-center">
                  {(() => {
                    const agents = (tx as any).agents as Array<{ payoutStatus: string }> | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
                    if (agents && agents.length > 1) {
                      const paidCount = agents.filter((a) => a.payoutStatus === "paid").length;
                      return (
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                          paidCount === agents.length ? "bg-green-100 text-green-700" :
                          paidCount > 0 ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-500"
                        }`}>
                          {paidCount}/{agents.length} Paid
                        </span>
                      );
                    }
                    return tx.agentPayoutStatus === "paid" ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded-full">Paid</span>
                    ) : tx.agentPayoutAmount ? (
                      <span className="text-xs text-slate-500">{fmt(tx.agentPayoutAmount)}</span>
                    ) : (
                      <span className="text-xs text-slate-300">{"\u2014"}</span>
                    );
                  })()}
                </div>
                <div className="hidden md:flex col-span-2 items-center justify-end gap-2">
                  <LifecycleIndicator stage={tx.stage} />
                  <span className="text-xs text-slate-400">{fmtDate(tx.updatedAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Create Transaction Modal ─────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/30">
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto animate-[slide-up_0.2s_ease-out] sm:animate-[modal-in_0.2s_ease-out]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">New Transaction</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {createError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {createError}
                </div>
              )}

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                <div className="flex gap-3">
                  {(["rental", "sale"] as const).map((t) => (
                    <label
                      key={t}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg cursor-pointer transition-colors text-sm font-medium ${
                        form.type === t
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="txType"
                        value={t}
                        checked={form.type === t}
                        onChange={() => setForm({ ...form, type: t })}
                        className="sr-only"
                      />
                      <TrendingUp className="w-4 h-4" />
                      {TRANSACTION_TYPE_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>

              {/* Property */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Property Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.propertyAddress}
                  onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })}
                  placeholder="123 Main St, New York, NY"
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={form.propertyUnit || ""}
                    onChange={(e) => setForm({ ...form, propertyUnit: e.target.value })}
                    placeholder="4B"
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Property Name</label>
                  <input
                    type="text"
                    value={form.propertyName || ""}
                    onChange={(e) => setForm({ ...form, propertyName: e.target.value })}
                    placeholder="The Vista"
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Client Name ({form.type === "rental" ? "Tenant" : "Buyer"})
                </label>
                <input
                  type="text"
                  value={form.clientName || ""}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Email</label>
                  <input
                    type="email"
                    value={form.clientEmail || ""}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client Phone</label>
                  <input
                    type="tel"
                    value={form.clientPhone || ""}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Agent */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Agent</label>
                <select
                  value={form.agentId || ""}
                  onChange={(e) => setForm({ ...form, agentId: e.target.value || undefined })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Auto (current user)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.firstName} {a.lastName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Additional Agents */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Additional Agents (optional)</label>
                {(form.additionalAgents || []).map((aa, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    <select
                      value={aa.agentId}
                      onChange={(e) => {
                        const updated = [...(form.additionalAgents || [])];
                        updated[idx] = { ...updated[idx], agentId: e.target.value };
                        setForm({ ...form, additionalAgents: updated });
                      }}
                      className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select agent...</option>
                      {agents.filter((a) => a.id !== form.agentId).map((a) => (
                        <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                      ))}
                    </select>
                    <select
                      value={aa.role || "co_agent"}
                      onChange={(e) => {
                        const updated = [...(form.additionalAgents || [])];
                        updated[idx] = { ...updated[idx], role: e.target.value as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
                        setForm({ ...form, additionalAgents: updated });
                      }}
                      className="w-28 px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="co_agent">Co-Agent</option>
                      <option value="referral">Referral</option>
                    </select>
                    <input
                      type="number"
                      value={aa.splitPct || ""}
                      onChange={(e) => {
                        const updated = [...(form.additionalAgents || [])];
                        updated[idx] = { ...updated[idx], splitPct: e.target.value ? Number(e.target.value) : undefined };
                        setForm({ ...form, additionalAgents: updated });
                      }}
                      placeholder="%"
                      className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        const updated = (form.additionalAgents || []).filter((_, i) => i !== idx);
                        setForm({ ...form, additionalAgents: updated.length > 0 ? updated : undefined });
                      }}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, additionalAgents: [...(form.additionalAgents || []), { agentId: "" }] })}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Add co-agent
                </button>
              </div>

              {/* Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {form.type === "rental" ? "Monthly Rent" : "Sale Price"}
                  </label>
                  <input
                    type="number"
                    value={form.transactionValue || ""}
                    onChange={(e) =>
                      setForm({ ...form, transactionValue: e.target.value ? Number(e.target.value) : undefined })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Commission</label>
                  <input
                    type="number"
                    value={form.commissionAmount || ""}
                    onChange={(e) =>
                      setForm({ ...form, commissionAmount: e.target.value ? Number(e.target.value) : undefined })
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Dates (conditional) */}
              {form.type === "rental" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Move-In Date</label>
                    <input
                      type="date"
                      value={form.moveInDate || ""}
                      onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
                      className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Lease Start</label>
                    <input
                      type="date"
                      value={form.leaseStartDate || ""}
                      onChange={(e) => setForm({ ...form, leaseStartDate: e.target.value })}
                      className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Closing Date</label>
                  <input
                    type="date"
                    value={form.closingDate || ""}
                    onChange={(e) => setForm({ ...form, closingDate: e.target.value })}
                    className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={form.notes || ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-lg font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
