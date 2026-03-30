"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAllSubmissions,
  getSubmissionById,
  approveSubmission,
  rejectSubmission,
  pushToInvoice,
  getSubmissionStats,
  getOrgAgents,
} from "./actions";
import {
  recordPayout,
  markSubmissionPaid,
} from "../reports/revenue/actions";
import { getSignedUrl } from "@/lib/bms-files";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  EXCLUSIVE_TYPE_LABELS,
  EXCLUSIVE_TYPE_COLORS,
  DEAL_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/bms-types";
import type { ExclusiveType } from "@/lib/bms-types";
import {
  CheckCircle,
  XCircle,
  FileText,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  DollarSign,
  Clock,
  BarChart3,
  Ban,
  Receipt,
  CreditCard,
  Banknote,
  Calendar,
  User,
  Building,
  MapPin,
  FileCheck,
  AlertTriangle,
  ExternalLink,
  Edit3,
  Check,
  Loader2,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────

const fmt = (n: number | string | null | undefined) => {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "\u2014";
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

const fmtPct = (n: number | string | null | undefined) => {
  const val = Number(n) || 0;
  return `${val.toFixed(1)}%`;
};

const STATUS_TABS = [
  "all",
  "submitted",
  "approved",
  "invoiced",
  "paid",
  "rejected",
] as const;

type StatusTab = (typeof STATUS_TABS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Submission = Record<string, any>;
type Agent = { id: string; firstName?: string; lastName?: string; email?: string };

// ── Props ──────────────────────────────────────────────────────

interface SubmissionsDashboardProps {
  initialSubmissions: Record<string, unknown>[];
  initialTotal: number;
  initialStats: {
    total: number;
    byStatus: Record<string, number>;
    byExclusiveType: Record<string, number>;
    totalCommissionPending: number;
    totalCommissionPaid: number;
  };
}

// ── Main Component ─────────────────────────────────────────────

export default function SubmissionsDashboard({
  initialSubmissions,
  initialTotal,
  initialStats,
}: SubmissionsDashboardProps) {
  // ── State ────────────────────────────────────────────────────
  const [submissions, setSubmissions] = useState<Submission[]>(
    initialSubmissions as Submission[]
  );
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusTab>("all");
  const [exclusiveFilter, setExclusiveFilter] = useState<string>("all");
  const [dealTypeFilter, setDealTypeFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Agents list
  const [agents, setAgents] = useState<Agent[]>([]);

  // Detail panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelData, setPanelData] = useState<Submission | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);

  // Rejection modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectModalEntered, setRejectModalEntered] = useState(false);

  // Payout modal
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutTargetId, setPayoutTargetId] = useState<string | null>(null);
  const [payoutMethod, setPayoutMethod] = useState("check");
  const [payoutDate, setPayoutDate] = useState("");
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [payoutModalEntered, setPayoutModalEntered] = useState(false);

  // Split override inline edit
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null);
  const [editAgentSplit, setEditAgentSplit] = useState("");
  const [editHouseSplit, setEditHouseSplit] = useState("");

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast helper ─────────────────────────────────────────────
  const showToast = useCallback(
    (type: "success" | "error", message: string) => {
      setToast({ type, message });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    },
    []
  );

  // ── Fetch agents on mount ────────────────────────────────────
  useEffect(() => {
    getOrgAgents().then((result) => {
      if (Array.isArray(result)) setAgents(result);
    });
  }, []);

  // ── Load submissions ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsResult, statsResult] = await Promise.all([
        getAllSubmissions({
          status: statusFilter === "all" ? undefined : statusFilter,
          exclusiveType:
            exclusiveFilter === "all" ? undefined : exclusiveFilter,
          dealType: dealTypeFilter === "all" ? undefined : dealTypeFilter,
          agentId: agentFilter === "all" ? undefined : agentFilter,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: search || undefined,
          page,
          limit: pageSize,
        }),
        getSubmissionStats(),
      ]);
      setSubmissions(subsResult.submissions || []);
      setTotal(subsResult.total || 0);
      if (statsResult) setStats(statsResult);
    } catch {
      showToast("error", "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [
    statusFilter,
    exclusiveFilter,
    dealTypeFilter,
    agentFilter,
    dateFrom,
    dateTo,
    search,
    page,
    showToast,
  ]);

  // Reload on filter change (not search)
  useEffect(() => {
    loadData();
  }, [
    statusFilter,
    exclusiveFilter,
    dealTypeFilter,
    agentFilter,
    dateFrom,
    dateTo,
    page,
    loadData,
  ]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadData();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Open detail panel ────────────────────────────────────────
  const openPanel = useCallback(async (id: string) => {
    setPanelOpen(true);
    setPanelLoading(true);
    setTimeout(() => setPanelEntered(true), 10);
    try {
      const sub = await getSubmissionById(id);
      setPanelData(sub);
    } catch {
      setPanelData(null);
    } finally {
      setPanelLoading(false);
    }
  }, []);

  const closePanel = useCallback(() => {
    setPanelEntered(false);
    setTimeout(() => {
      setPanelOpen(false);
      setPanelData(null);
    }, 300);
  }, []);

  // ── Action handlers ──────────────────────────────────────────

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      const result = await approveSubmission(id);
      if (result?.success) {
        showToast("success", "Submission approved");
        loadData();
        if (panelData?.id === id) openPanel(id);
      } else {
        showToast("error", result?.error || "Failed to approve");
      }
    } catch {
      showToast("error", "Failed to approve submission");
    } finally {
      setActionLoading(null);
    }
  }

  function openRejectModal(id: string) {
    setRejectTargetId(id);
    setRejectReason("");
    setRejectModalOpen(true);
    setTimeout(() => setRejectModalEntered(true), 10);
  }

  function closeRejectModal() {
    setRejectModalEntered(false);
    setTimeout(() => {
      setRejectModalOpen(false);
      setRejectTargetId(null);
      setRejectReason("");
    }, 200);
  }

  async function handleRejectConfirm() {
    if (!rejectTargetId) return;
    setActionLoading(rejectTargetId);
    try {
      const result = await rejectSubmission(rejectTargetId, rejectReason || undefined);
      if (result?.success) {
        showToast("success", "Submission rejected");
        closeRejectModal();
        loadData();
        if (panelData?.id === rejectTargetId) openPanel(rejectTargetId);
      } else {
        showToast("error", result?.error || "Failed to reject");
      }
    } catch {
      showToast("error", "Failed to reject submission");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePushToInvoice(id: string) {
    setActionLoading(id);
    try {
      const result = await pushToInvoice(id);
      if (result?.success) {
        showToast("success", "Invoice created successfully");
        loadData();
        if (panelData?.id === id) openPanel(id);
      } else {
        showToast("error", result?.error || "Failed to create invoice");
      }
    } catch {
      showToast("error", "Failed to create invoice");
    } finally {
      setActionLoading(null);
    }
  }

  function openPayoutModal(id: string) {
    setPayoutTargetId(id);
    setPayoutMethod("check");
    setPayoutDate(new Date().toISOString().split("T")[0]);
    setPayoutRef("");
    setPayoutNotes("");
    setPayoutModalOpen(true);
    setTimeout(() => setPayoutModalEntered(true), 10);
  }

  function closePayoutModal() {
    setPayoutModalEntered(false);
    setTimeout(() => {
      setPayoutModalOpen(false);
      setPayoutTargetId(null);
    }, 200);
  }

  async function handlePayoutConfirm() {
    if (!payoutTargetId) return;
    setActionLoading(payoutTargetId);
    try {
      const result = await recordPayout(payoutTargetId, {
        method: payoutMethod,
        paidAt: payoutDate,
        reference: payoutRef || undefined,
        notes: payoutNotes || undefined,
      });
      if (result?.success) {
        showToast("success", "Payout recorded successfully");
        closePayoutModal();
        loadData();
        if (panelData?.id === payoutTargetId) openPanel(payoutTargetId);
      } else {
        showToast("error", result?.error || "Failed to record payout");
      }
    } catch {
      showToast("error", "Failed to record payout");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkPaid(id: string) {
    setActionLoading(id);
    try {
      const result = await markSubmissionPaid(id);
      if (result?.success) {
        showToast("success", "Marked as paid");
        loadData();
        if (panelData?.id === id) openPanel(id);
      } else {
        showToast("error", result?.error || "Failed to mark as paid");
      }
    } catch {
      showToast("error", "Failed to mark as paid");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleViewDoc(attachmentId: string) {
    try {
      const result = await getSignedUrl(attachmentId);
      if (result?.url) {
        window.open(result.url, "_blank");
      } else {
        showToast("error", result?.error || "Failed to get file URL");
      }
    } catch {
      showToast("error", "Failed to open document");
    }
  }

  // ── Derived values ───────────────────────────────────────────

  const totalPages = Math.ceil(total / pageSize);

  const statusCounts = stats.byStatus || {};
  const allCount = Object.values(statusCounts).reduce(
    (s, c) => s + (Number(c) || 0),
    0
  );

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-[fade-in_0.2s_ease-out] ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className="ml-2 p-0.5 hover:bg-white/20 rounded"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Deal Submission Approvals
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review, approve, and manage agent deal submissions
        </p>
      </div>

      {/* ── Stats Bar ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Submissions"
          value={stats.total}
          icon={<BarChart3 className="h-5 w-5 text-blue-500" />}
        />
        <StatCard
          label="Pending Review"
          value={statusCounts["submitted"] || 0}
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          highlight="amber"
        />
        <StatCard
          label="Commission Pending"
          value={fmt(stats.totalCommissionPending)}
          icon={<Receipt className="h-5 w-5 text-purple-500" />}
          isCurrency
        />
        <StatCard
          label="Paid Out"
          value={fmt(stats.totalCommissionPaid)}
          icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
          isCurrency
        />
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────── */}

      {/* Status pills */}
      <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map((tab) => {
          const count =
            tab === "all" ? allCount : Number(statusCounts[tab]) || 0;
          const active = statusFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => {
                setStatusFilter(tab);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                active
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {tab === "all"
                ? "All"
                : SUBMISSION_STATUS_LABELS[tab] || tab}
              <span
                className={`text-xs ${
                  active ? "text-blue-500" : "text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Dropdowns + date + search row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Exclusive type dropdown */}
        <div className="relative">
          <select
            value={exclusiveFilter}
            onChange={(e) => {
              setExclusiveFilter(e.target.value);
              setPage(1);
            }}
            className="appearance-none pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Exclusives</option>
            {Object.entries(EXCLUSIVE_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Deal type dropdown */}
        <div className="relative">
          <select
            value={dealTypeFilter}
            onChange={(e) => {
              setDealTypeFilter(e.target.value);
              setPage(1);
            }}
            className="appearance-none pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Deal Types</option>
            {Object.entries(DEAL_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Agent dropdown */}
        <div className="relative">
          <select
            value={agentFilter}
            onChange={(e) => {
              setAgentFilter(e.target.value);
              setPage(1);
            }}
            className="appearance-none pl-3 pr-8 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {[a.firstName, a.lastName].filter(Boolean).join(" ") ||
                  a.email ||
                  a.id}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        </div>

        {/* Date from */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="From"
          title="From date"
        />

        {/* Date to */}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="To"
          title="To date"
        />

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, agent, client..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* ── Submissions Table ───────────────────────────────────── */}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 bg-slate-100 animate-pulse rounded-lg"
            />
          ))}
        </div>
      )}

      {!loading && submissions.length === 0 && (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No submissions found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search
              ? "Try a different search term"
              : "No deal submissions match the current filters"}
          </p>
        </div>
      )}

      {!loading && submissions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Agent
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Property
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Exclusive
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Commission
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Payout
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {submissions.map((s) => {
                  const isActing = actionLoading === s.id;
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                            SUBMISSION_STATUS_COLORS[s.status] ||
                            "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {SUBMISSION_STATUS_LABELS[s.status] || s.status}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {fmtDate(s.createdAt)}
                      </td>

                      {/* Agent */}
                      <td className="px-4 py-3">
                        <div className="text-slate-900 font-medium truncate max-w-[160px]">
                          {s.agentFirstName} {s.agentLastName}
                        </div>
                        <div className="text-xs text-slate-400 truncate max-w-[160px]">
                          {s.agentEmail}
                        </div>
                      </td>

                      {/* Property */}
                      <td className="px-4 py-3">
                        <div className="text-slate-900 truncate max-w-[200px]">
                          {s.propertyAddress}
                        </div>
                        {s.unit && (
                          <div className="text-xs text-slate-400">
                            Unit {s.unit}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {DEAL_TYPE_LABELS[s.dealType] || s.dealType}
                      </td>

                      {/* Exclusive badge */}
                      <td className="px-4 py-3">
                        {s.exclusiveType ? (
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                              EXCLUSIVE_TYPE_COLORS[s.exclusiveType] ||
                              "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {EXCLUSIVE_TYPE_LABELS[s.exclusiveType] ||
                              s.exclusiveType}
                          </span>
                        ) : (
                          <span className="text-slate-300">\u2014</span>
                        )}
                      </td>

                      {/* Commission */}
                      <td className="px-4 py-3 text-right text-slate-700 font-medium whitespace-nowrap">
                        {fmt(s.totalCommission)}
                      </td>

                      {/* Payout */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="text-green-600 font-medium">
                          {fmt(s.agentPayout)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {s.status === "submitted" && (
                            <button
                              onClick={() => openPanel(s.id)}
                              disabled={isActing}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Review
                            </button>
                          )}

                          {s.status === "approved" && (
                            <button
                              onClick={() => handlePushToInvoice(s.id)}
                              disabled={isActing}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
                            >
                              {isActing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FileText className="h-3.5 w-3.5" />
                              )}
                              Create Invoice
                            </button>
                          )}

                          {s.status === "invoiced" && (
                            <>
                              <button
                                onClick={() => openPayoutModal(s.id)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                              >
                                {isActing ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Banknote className="h-3.5 w-3.5" />
                                )}
                                Record Payout
                              </button>
                              <button
                                onClick={() => handleMarkPaid(s.id)}
                                disabled={isActing}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                                title="Quick mark as paid"
                              >
                                {isActing ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <DollarSign className="h-3.5 w-3.5" />
                                )}
                                Mark Paid
                              </button>
                            </>
                          )}

                          {s.status === "paid" && (
                            <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-600">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Paid
                            </span>
                          )}

                          {s.status === "rejected" && (
                            <button
                              onClick={() => openPanel(s.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <p className="text-sm text-slate-500">
                Showing {(page - 1) * pageSize + 1}
                {"\u2013"}
                {Math.min(page * pageSize, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detail Slide-Over Panel ─────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${
              panelEntered ? "opacity-100" : "opacity-0"
            }`}
            onClick={closePanel}
          />

          {/* Panel */}
          <div
            className={`relative w-full max-w-[480px] bg-white shadow-xl flex flex-col transition-transform duration-300 ease-out ${
              panelEntered ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                Submission Details
              </h2>
              <button
                onClick={closePanel}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {panelLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-20 bg-slate-100 animate-pulse rounded-lg"
                    />
                  ))}
                </div>
              ) : panelData ? (
                <>
                  {/* Status badge at top */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3 py-1 text-sm font-medium rounded-full ${
                        SUBMISSION_STATUS_COLORS[panelData.status] ||
                        "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {SUBMISSION_STATUS_LABELS[panelData.status] ||
                        panelData.status}
                    </span>
                    {panelData.exclusiveType && (
                      <span
                        className={`px-3 py-1 text-sm font-medium rounded-full ${
                          EXCLUSIVE_TYPE_COLORS[panelData.exclusiveType] ||
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {EXCLUSIVE_TYPE_LABELS[panelData.exclusiveType] ||
                          panelData.exclusiveType}
                      </span>
                    )}
                    {panelData.submissionSource === "external" && (
                      <span className="px-3 py-1 text-sm font-medium rounded-full bg-orange-100 text-orange-700">
                        External
                      </span>
                    )}
                  </div>

                  {/* 1. Agent Info */}
                  <PanelSection
                    title="Agent Info"
                    icon={<User className="h-4 w-4" />}
                  >
                    <InfoRow
                      label="Name"
                      value={`${panelData.agentFirstName || ""} ${panelData.agentLastName || ""}`.trim()}
                    />
                    <InfoRow label="Email" value={panelData.agentEmail} />
                    <InfoRow label="Phone" value={panelData.agentPhone} />
                    <InfoRow
                      label="License"
                      value={panelData.agentLicense}
                    />
                    {panelData.agent && (
                      <InfoRow
                        label="Matched Agent"
                        value={
                          <span className="text-blue-600 text-xs font-medium">
                            Linked to roster
                          </span>
                        }
                      />
                    )}
                  </PanelSection>

                  {/* 2. Deal Overview */}
                  <PanelSection
                    title="Deal Overview"
                    icon={<Building className="h-4 w-4" />}
                  >
                    <InfoRow
                      label="Property"
                      value={panelData.propertyAddress}
                    />
                    {panelData.unit && (
                      <InfoRow label="Unit" value={panelData.unit} />
                    )}
                    {panelData.city && (
                      <InfoRow
                        label="City / State"
                        value={`${panelData.city}, ${panelData.state || "NY"}`}
                      />
                    )}
                    <InfoRow
                      label="Deal Type"
                      value={
                        DEAL_TYPE_LABELS[panelData.dealType] ||
                        panelData.dealType
                      }
                    />
                    <InfoRow
                      label="Transaction Value"
                      value={fmt(panelData.transactionValue)}
                    />
                    <InfoRow
                      label="Closing Date"
                      value={fmtDate(panelData.closingDate)}
                    />

                    {/* Lease-specific fields */}
                    {(panelData.dealType === "lease" ||
                      panelData.dealType === "rental" ||
                      panelData.dealType === "commercial_lease") && (
                      <>
                        {panelData.leaseTermMonths && (
                          <InfoRow
                            label="Lease Term"
                            value={`${panelData.leaseTermMonths} months`}
                          />
                        )}
                        {panelData.monthlyRent && (
                          <InfoRow
                            label="Monthly Rent"
                            value={fmt(panelData.monthlyRent)}
                          />
                        )}
                        {panelData.moveInDate && (
                          <InfoRow
                            label="Move-In Date"
                            value={fmtDate(panelData.moveInDate)}
                          />
                        )}
                      </>
                    )}

                    {/* Sale-specific fields */}
                    {(panelData.dealType === "sale" ||
                      panelData.dealType === "commercial_sale" ||
                      panelData.dealType === "new_construction" ||
                      panelData.dealType === "land") && (
                      <>
                        {panelData.contractDate && (
                          <InfoRow
                            label="Contract Date"
                            value={fmtDate(panelData.contractDate)}
                          />
                        )}
                        {panelData.listPrice != null && (
                          <InfoRow
                            label="List Price"
                            value={fmt(panelData.listPrice)}
                          />
                        )}
                      </>
                    )}

                    {panelData.representedSide && (
                      <InfoRow
                        label="Represented Side"
                        value={
                          panelData.representedSide.charAt(0).toUpperCase() +
                          panelData.representedSide.slice(1)
                        }
                      />
                    )}
                  </PanelSection>

                  {/* 3. Landlord / Billing */}
                  {(panelData.clientName ||
                    panelData.clientEmail ||
                    panelData.clientPhone) && (
                    <PanelSection
                      title="Landlord / Billing"
                      icon={<MapPin className="h-4 w-4" />}
                    >
                      <InfoRow
                        label="Client Name"
                        value={panelData.clientName}
                      />
                      <InfoRow
                        label="Client Email"
                        value={panelData.clientEmail}
                      />
                      <InfoRow
                        label="Client Phone"
                        value={panelData.clientPhone}
                      />
                    </PanelSection>
                  )}

                  {/* 4. Commission Breakdown */}
                  <PanelSection
                    title="Commission Breakdown"
                    icon={<DollarSign className="h-4 w-4" />}
                  >
                    <div className="bg-slate-50 rounded-lg p-3 font-mono text-sm space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          Commission Type
                        </span>
                        <span className="text-slate-700">
                          {panelData.commissionType === "percentage"
                            ? "Percentage"
                            : "Flat"}
                        </span>
                      </div>
                      {panelData.commissionPct != null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Commission Rate
                          </span>
                          <span className="text-slate-700">
                            {fmtPct(panelData.commissionPct)}
                          </span>
                        </div>
                      )}
                      {panelData.commissionFlat != null && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            Flat Commission
                          </span>
                          <span className="text-slate-700">
                            {fmt(panelData.commissionFlat)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-200 pt-1.5">
                        <span className="text-slate-500 font-semibold">
                          Total Commission
                        </span>
                        <span className="text-slate-900 font-semibold">
                          {fmt(panelData.totalCommission)}
                        </span>
                      </div>

                      {/* Split — inline edit */}
                      <div className="border-t border-slate-200 pt-1.5">
                        {editingSplitId === panelData.id ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500 w-20">
                                Agent %
                              </label>
                              <input
                                type="number"
                                value={editAgentSplit}
                                onChange={(e) => {
                                  setEditAgentSplit(e.target.value);
                                  const agent = parseFloat(e.target.value);
                                  if (!isNaN(agent)) {
                                    setEditHouseSplit(
                                      (100 - agent).toFixed(1)
                                    );
                                  }
                                }}
                                className="w-20 border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                step="0.1"
                                min="0"
                                max="100"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-500 w-20">
                                House %
                              </label>
                              <input
                                type="number"
                                value={editHouseSplit}
                                onChange={(e) => {
                                  setEditHouseSplit(e.target.value);
                                  const house = parseFloat(e.target.value);
                                  if (!isNaN(house)) {
                                    setEditAgentSplit(
                                      (100 - house).toFixed(1)
                                    );
                                  }
                                }}
                                className="w-20 border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                                step="0.1"
                                min="0"
                                max="100"
                              />
                            </div>
                            <div className="flex gap-2 mt-1">
                              <button
                                onClick={() => {
                                  // Save is informational in the panel; actual persistence is handled via the approve flow
                                  setEditingSplitId(null);
                                  const agentPct =
                                    parseFloat(editAgentSplit) || 0;
                                  const housePct =
                                    parseFloat(editHouseSplit) || 0;
                                  const totalComm =
                                    Number(panelData.totalCommission) || 0;
                                  setPanelData({
                                    ...panelData,
                                    agentSplitPct: agentPct,
                                    houseSplitPct: housePct,
                                    agentPayout:
                                      (totalComm * agentPct) / 100,
                                    housePayout:
                                      (totalComm * housePct) / 100,
                                  });
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors"
                              >
                                <Check className="h-3 w-3" />
                                Save
                              </button>
                              <button
                                onClick={() => setEditingSplitId(null)}
                                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">
                                Agent Split
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-green-600">
                                  {fmtPct(panelData.agentSplitPct)} (
                                  {fmt(panelData.agentPayout)})
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingSplitId(panelData.id);
                                    setEditAgentSplit(
                                      String(
                                        Number(
                                          panelData.agentSplitPct
                                        ).toFixed(1)
                                      )
                                    );
                                    setEditHouseSplit(
                                      String(
                                        Number(
                                          panelData.houseSplitPct
                                        ).toFixed(1)
                                      )
                                    );
                                  }}
                                  className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Edit split"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">
                                House Split
                              </span>
                              <span className="text-blue-600">
                                {fmtPct(panelData.houseSplitPct)} (
                                {fmt(panelData.housePayout)})
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </PanelSection>

                  {/* 5. Co-Broker */}
                  {(panelData.coBrokeAgent ||
                    panelData.coBrokeBrokerage ||
                    (Array.isArray(panelData.coAgents) &&
                      panelData.coAgents.length > 0)) && (
                    <PanelSection
                      title="Co-Broker"
                      icon={<User className="h-4 w-4" />}
                    >
                      <InfoRow
                        label="Co-Broke Agent"
                        value={panelData.coBrokeAgent}
                      />
                      <InfoRow
                        label="Co-Broke Brokerage"
                        value={panelData.coBrokeBrokerage}
                      />
                      {Array.isArray(panelData.coAgents) &&
                        panelData.coAgents.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <span className="text-xs text-slate-400 font-medium">
                              Additional Agents
                            </span>
                            {panelData.coAgents.map(
                              (
                                ca: { name?: string; splitPct?: number },
                                idx: number
                              ) => (
                                <div
                                  key={idx}
                                  className="text-sm text-slate-600 flex justify-between"
                                >
                                  <span>{ca.name || "Agent"}</span>
                                  {ca.splitPct != null && (
                                    <span className="text-slate-400">
                                      {ca.splitPct}%
                                    </span>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        )}
                    </PanelSection>
                  )}

                  {/* 6. Documents */}
                  {Array.isArray(panelData.files) &&
                    panelData.files.length > 0 && (
                      <PanelSection
                        title="Documents"
                        icon={<FileCheck className="h-4 w-4" />}
                      >
                        <div className="space-y-2">
                          {panelData.files.map(
                            (
                              file: {
                                id: string;
                                fileName: string;
                                createdAt?: string;
                              },
                              idx: number
                            ) => (
                              <DocCheck
                                key={file.id || idx}
                                fileName={file.fileName}
                                date={file.createdAt}
                                onView={() => handleViewDoc(file.id)}
                              />
                            )
                          )}
                        </div>
                      </PanelSection>
                    )}

                  {/* 7. Notes */}
                  {panelData.notes && (
                    <PanelSection
                      title="Notes"
                      icon={<FileText className="h-4 w-4" />}
                    >
                      <p className="text-sm text-slate-600 whitespace-pre-wrap">
                        {panelData.notes}
                      </p>
                    </PanelSection>
                  )}

                  {/* Rejection reason */}
                  {panelData.status === "rejected" &&
                    panelData.rejectionReason && (
                      <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Ban className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-medium text-red-700">
                            Rejection Reason
                          </span>
                        </div>
                        <p className="text-sm text-red-600">
                          {panelData.rejectionReason}
                        </p>
                      </div>
                    )}
                </>
              ) : (
                <div className="text-center py-12">
                  <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">
                    Submission not found
                  </p>
                </div>
              )}
            </div>

            {/* Panel footer actions */}
            {panelData && !panelLoading && (
              <div className="border-t border-slate-200 px-6 py-4 flex items-center gap-2 flex-wrap">
                {panelData.status === "submitted" && (
                  <>
                    <button
                      onClick={() => handleApprove(panelData.id)}
                      disabled={actionLoading === panelData.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === panelData.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => openRejectModal(panelData.id)}
                      disabled={actionLoading === panelData.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </>
                )}

                {panelData.status === "approved" && (
                  <button
                    onClick={() => handlePushToInvoice(panelData.id)}
                    disabled={actionLoading === panelData.id}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === panelData.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Create Invoice
                  </button>
                )}

                {panelData.status === "invoiced" && (
                  <>
                    <button
                      onClick={() => openPayoutModal(panelData.id)}
                      disabled={actionLoading === panelData.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === panelData.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Banknote className="h-4 w-4" />
                      )}
                      Record Payout
                    </button>
                    <button
                      onClick={() => handleMarkPaid(panelData.id)}
                      disabled={actionLoading === panelData.id}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === panelData.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <DollarSign className="h-4 w-4" />
                      )}
                      Mark Paid
                    </button>
                  </>
                )}

                {panelData.status === "paid" && (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle className="h-4 w-4" />
                    Payment Complete
                  </span>
                )}

                {panelData.invoice && (
                  <a
                    href={`/brokerage/invoices/${panelData.invoice.id}`}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 ml-auto transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {panelData.invoice.invoiceNumber || "View Invoice"}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Rejection Modal ─────────────────────────────────────── */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center">
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${
              rejectModalEntered ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeRejectModal}
          />
          <div
            className={`relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 transition-all duration-200 ${
              rejectModalEntered
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95"
            }`}
            style={{ animation: rejectModalEntered ? "modal-in 0.2s ease-out" : undefined }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Reject Submission
              </h3>
              <button
                onClick={closeRejectModal}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Provide a reason for rejecting this deal submission. The agent
              will be notified.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={4}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={closeRejectModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={actionLoading === rejectTargetId}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === rejectTargetId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject Submission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payout Modal ────────────────────────────────────────── */}
      {payoutModalOpen && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center">
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${
              payoutModalEntered ? "opacity-100" : "opacity-0"
            }`}
            onClick={closePayoutModal}
          />
          <div
            className={`relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6 transition-all duration-200 ${
              payoutModalEntered
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95"
            }`}
            style={{ animation: payoutModalEntered ? "modal-in 0.2s ease-out" : undefined }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Record Payout
              </h3>
              <button
                onClick={closePayoutModal}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Payment method */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Payment Method
                </label>
                <div className="relative">
                  <select
                    value={payoutMethod}
                    onChange={(e) => setPayoutMethod(e.target.value)}
                    className="w-full appearance-none border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(
                      ([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Payment date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Payment Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={payoutDate}
                    onChange={(e) => setPayoutDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Reference # */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reference #
                </label>
                <input
                  type="text"
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  placeholder="Check #, transaction ID, etc."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={closePayoutModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePayoutConfirm}
                disabled={
                  !payoutDate || actionLoading === payoutTargetId
                }
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === payoutTargetId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                Record Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-Components ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  highlight,
  isCurrency,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: "amber" | "green" | "red";
  isCurrency?: boolean;
}) {
  const borderClass =
    highlight === "amber"
      ? "border-amber-200 bg-amber-50/50"
      : highlight === "green"
        ? "border-green-200 bg-green-50/50"
        : highlight === "red"
          ? "border-red-200 bg-red-50/50"
          : "border-slate-200 bg-white";

  return (
    <div
      className={`border rounded-xl p-4 ${borderClass} transition-shadow hover:shadow-sm`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        {icon}
      </div>
      <div
        className={`text-2xl font-bold ${
          highlight === "amber"
            ? "text-amber-700"
            : isCurrency
              ? "text-slate-900"
              : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DetailPanel() {
  // Placeholder — detail panel is rendered inline above for state access
  return null;
}

function PanelSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-slate-400">{icon}</span>}
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value == null || value === "" || value === "\u2014") return null;
  return (
    <div className="flex items-start justify-between text-sm">
      <span className="text-slate-400 shrink-0 mr-3">{label}</span>
      <span className="text-slate-700 text-right">{value}</span>
    </div>
  );
}

function DocCheck({
  fileName,
  date,
  onView,
}: {
  fileName: string;
  date?: string;
  onView: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-slate-700 truncate">{fileName}</p>
          {date && (
            <p className="text-xs text-slate-400">{fmtDate(date)}</p>
          )}
        </div>
      </div>
      <button
        onClick={onView}
        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors shrink-0 ml-2"
      >
        <Eye className="h-3 w-3" />
        View
      </button>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active?: boolean;
  direction?: "asc" | "desc";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700 transition-colors"
    >
      {label}
      {active && (
        <ChevronDown
          className={`h-3 w-3 transition-transform ${
            direction === "asc" ? "rotate-180" : ""
          }`}
        />
      )}
    </button>
  );
}
