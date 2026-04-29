"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  getAllSubmissions,
  getSubmissionById,
  approveSubmission,
  approveAndCreateInvoice,
  rejectSubmission,
  pushToInvoice,
  getSubmissionStats,
  getOrgAgents,
  updateProcessingFee,
} from "./actions";
import {
  recordPayout,
  markSubmissionPaid,
} from "../reports/revenue/actions";
import { getSignedUrl } from "@/lib/bms-files";
import {
  SUBMISSION_STATUS_COLORS,
  EXCLUSIVE_TYPE_LABELS,
  EXCLUSIVE_TYPE_COLORS,
  DEAL_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/bms-types";
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
  Ban,
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
import {
  SubmissionCard,
  CardActionLink,
  type SubmissionCardData,
} from "./components/submission-card";
import { DetailTabs, type DetailTabKey } from "./components/detail-tabs";
import { EmptyState } from "./components/empty-state";
import {
  RecentlyApprovedRail,
  type RecentlyApprovedItem,
} from "./components/recently-approved-rail";
import {
  StatusFilter,
  type StatusFilterValue,
} from "./components/status-filter";

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
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const fmtPct = (n: number | string | null | undefined) => {
  const val = Number(n) || 0;
  return `${val.toFixed(1)}%`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Submission = Record<string, any>;
type Agent = { id: string; firstName?: string; lastName?: string; email?: string };

// ── Props ──────────────────────────────────────────────────────

interface SubmissionsDashboardProps {
  asOrg?: string;
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
  asOrg,
  initialSubmissions,
  initialTotal,
  initialStats,
}: SubmissionsDashboardProps) {
  // Forwarded to every server action so the super_admin override target survives
  // client-side refetches (filter changes, pagination, expand). Without this,
  // SSR shows the override target's data but the first client-side `loadData()`
  // replaces it with the real org's data — server actions don't see searchParams,
  // and the referer fallback is unreliable across Next.js 16 runtimes.
  const overrideOpts = useMemo(
    () => (asOrg ? { overrideAsOrg: asOrg } : {}),
    [asOrg],
  );
  const overrideQs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";

  // ── State ────────────────────────────────────────────────────
  const [submissions, setSubmissions] = useState<Submission[]>(
    initialSubmissions as Submission[]
  );
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);

  // Filters
  // Slice 1c: default landing is the "Submitted" pending-approval queue —
  // managers open this page to triage new submissions, not to browse history.
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("submitted");
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

  // Inline expand (replaces the slide-over panel from slice 1).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSubmission, setExpandedSubmission] = useState<Submission | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTabKey>("details");

  // Slice 1c: session-scoped Recently Approved rail. Populated when
  // approve / approve-and-invoice resolves. Resets on full reload.
  const [recentlyApproved, setRecentlyApproved] = useState<RecentlyApprovedItem[]>([]);

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

  // Processing fee inline edit
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [editFeePct, setEditFeePct] = useState("");
  const [feeSaving, setFeeSaving] = useState(false);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Toast — `action` (Slice 1) lets handlers attach an inline link, e.g.
  // "View invoice" after Approve & Push to Invoice. `durationMs` extends the
  // timeout for actionable toasts so the link stays around long enough to
  // click.
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
    action?: { label: string; href: string };
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast helper ─────────────────────────────────────────────
  const showToast = useCallback(
    (
      type: "success" | "error",
      message: string,
      opts?: { action?: { label: string; href: string }; durationMs?: number },
    ) => {
      setToast({ type, message, action: opts?.action });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), opts?.durationMs ?? 4000);
    },
    []
  );

  // ── Fetch agents on mount ────────────────────────────────────
  useEffect(() => {
    getOrgAgents(overrideOpts).then((result) => {
      if (Array.isArray(result)) setAgents(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load submissions ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsResult, statsResult] = await Promise.all([
        getAllSubmissions(
          {
            status: statusFilter === "all" ? undefined : statusFilter,
            exclusiveType:
              exclusiveFilter === "all" ? undefined : exclusiveFilter,
            dealType: dealTypeFilter === "all" ? undefined : dealTypeFilter,
            agentId: agentFilter === "all" ? undefined : agentFilter,
            startDate: dateFrom || undefined,
            endDate: dateTo || undefined,
            search: search || undefined,
            page,
            limit: pageSize,
          },
          overrideOpts,
        ),
        getSubmissionStats(overrideOpts),
      ]);
      if (subsResult.success) {
        setSubmissions((subsResult.data as Submission[]) || []);
        setTotal(subsResult.total || 0);
      }
      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data as typeof stats);
      }
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
    overrideOpts,
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

  // ── Expand / collapse ────────────────────────────────────────
  const loadExpandedDetail = useCallback(
    async (id: string) => {
      setExpandedLoading(true);
      try {
        const sub = await getSubmissionById(id, overrideOpts);
        if (sub?.success && sub.data) {
          setExpandedSubmission(sub.data as Submission);
        } else {
          setExpandedSubmission(null);
        }
      } catch {
        setExpandedSubmission(null);
      } finally {
        setExpandedLoading(false);
      }
    },
    [overrideOpts],
  );

  const toggleExpand = useCallback(
    async (id: string) => {
      // Same id → collapse.
      if (expandedId === id) {
        setExpandedId(null);
        setExpandedSubmission(null);
        return;
      }
      setExpandedId(id);
      setActiveTab("details");
      setExpandedSubmission(null);
      await loadExpandedDetail(id);
    },
    [expandedId, loadExpandedDetail],
  );

  // ── Recently Approved tracking (session-scoped) ─────────────
  const pushRecentlyApproved = useCallback(
    (entry: Omit<RecentlyApprovedItem, "approvedAt">) => {
      setRecentlyApproved((prev) => {
        const filtered = prev.filter((p) => p.id !== entry.id);
        return [{ ...entry, approvedAt: Date.now() }, ...filtered].slice(0, 10);
      });
    },
    [],
  );

  const railEntryFromSubmission = useCallback(
    (s: Submission, invoice?: { id: string; invoiceNumber?: string }): Omit<RecentlyApprovedItem, "approvedAt"> => ({
      id: String(s.id),
      agentName: [s.agentFirstName, s.agentLastName].filter(Boolean).join(" ") || s.agentEmail || "Agent",
      propertyAddress: String(s.propertyAddress ?? ""),
      totalCommission: s.totalCommission,
      invoiceId: invoice?.id ?? null,
      invoiceNumber: invoice?.invoiceNumber ?? null,
    }),
    [],
  );

  // ── Action handlers ──────────────────────────────────────────

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      const result = await approveSubmission(id, undefined, overrideOpts);
      if (result?.success) {
        showToast("success", "Submission approved");
        const local = submissions.find((s) => s.id === id);
        if (local) pushRecentlyApproved(railEntryFromSubmission(local));
        loadData();
        if (expandedId === id) loadExpandedDetail(id);
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
    // Slice 1: rejection reason is required. The agent timeline shows the
    // reason verbatim — reject silently if the textarea is empty.
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      showToast("error", "A rejection reason is required");
      return;
    }
    setActionLoading(rejectTargetId);
    try {
      const result = await rejectSubmission(rejectTargetId, trimmed, overrideOpts);
      if (result?.success) {
        showToast("success", "Submission rejected");
        closeRejectModal();
        loadData();
        if (expandedId === rejectTargetId) loadExpandedDetail(rejectTargetId);
      } else {
        showToast("error", result?.error || "Failed to reject");
      }
    } catch {
      showToast("error", "Failed to reject submission");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveFee(submissionId: string, mode: "reset" | "override", pct?: number) {
    setFeeSaving(true);
    try {
      const result = await updateProcessingFee(
        submissionId,
        mode === "reset" ? { mode: "reset" } : { mode: "override", pct: pct ?? 0 },
        overrideOpts,
      );
      if (result.success) {
        showToast("success", mode === "reset" ? "Reset to brokerage default" : "Processing fee updated");
        setEditingFeeId(null);
        if (expandedId === submissionId) await loadExpandedDetail(submissionId);
        loadData();
      } else {
        showToast("error", result.error || "Failed to update fee");
      }
    } catch {
      showToast("error", "Failed to update fee");
    } finally {
      setFeeSaving(false);
    }
  }

  // Slice 1: atomic Approve & Push to Invoice — combines status flip,
  // invoice + transaction insert, and the submission audit row in a single
  // server-side $transaction. On success the toast surfaces a "View invoice"
  // link so the manager can jump straight to the new invoice (preserves
  // ?as_org if the super_admin override is active).
  async function handleApproveAndInvoice(id: string) {
    setActionLoading(id);
    try {
      const result = await approveAndCreateInvoice(id, undefined, overrideOpts);
      if (result?.success) {
        const invoiceHref = result.invoiceId
          ? `/brokerage/invoices/${result.invoiceId}${overrideQs}`
          : null;
        showToast(
          "success",
          result.invoiceNumber ? `Invoice ${result.invoiceNumber} created` : "Invoice created",
          invoiceHref
            ? { action: { label: "View invoice", href: invoiceHref }, durationMs: 8000 }
            : undefined,
        );
        const local = submissions.find((s) => s.id === id);
        if (local) {
          pushRecentlyApproved(
            railEntryFromSubmission(local, result.invoiceId ? { id: result.invoiceId, invoiceNumber: result.invoiceNumber } : undefined),
          );
        }
        loadData();
        if (expandedId === id) loadExpandedDetail(id);
      } else {
        showToast("error", result?.error || "Failed to approve & create invoice");
      }
    } catch {
      showToast("error", "Failed to approve & create invoice");
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePushToInvoice(id: string) {
    setActionLoading(id);
    try {
      const result = await pushToInvoice(id, overrideOpts);
      if (result?.success) {
        showToast("success", "Invoice created successfully");
        loadData();
        if (expandedId === id) loadExpandedDetail(id);
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
    setPayoutDate(new Date().toISOString().split("T")[0]);
    setPayoutMethod("check");
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
      const result = await recordPayout({
        submissionId: payoutTargetId,
        paymentMethod: payoutMethod,
        paymentDate: payoutDate || undefined,
        referenceNumber: payoutRef || undefined,
        notes: payoutNotes || undefined,
      });
      if (result?.success) {
        showToast("success", "Payout recorded");
        closePayoutModal();
        loadData();
        if (expandedId === payoutTargetId) loadExpandedDetail(payoutTargetId);
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
        if (expandedId === id) loadExpandedDetail(id);
      } else {
        showToast("error", result?.error || "Failed to mark paid");
      }
    } catch {
      showToast("error", "Failed to mark paid");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleViewDoc(fileId: string) {
    try {
      const result = await getSignedUrl(fileId);
      if (result?.url) {
        window.open(result.url, "_blank");
      } else {
        showToast("error", "Failed to open document");
      }
    } catch {
      showToast("error", "Failed to open document");
    }
  }

  function resetFilters() {
    setStatusFilter("submitted");
    setExclusiveFilter("all");
    setDealTypeFilter("all");
    setAgentFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  }

  // ── Derived values ───────────────────────────────────────────

  const totalPages = Math.ceil(total / pageSize);
  const statusCounts = stats.byStatus || {};
  const isFiltered =
    statusFilter !== "submitted" ||
    exclusiveFilter !== "all" ||
    dealTypeFilter !== "all" ||
    agentFilter !== "all" ||
    !!dateFrom ||
    !!dateTo ||
    !!search;

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
          <span>{toast.message}</span>
          {toast.action && (
            <Link
              href={toast.action.href}
              onClick={() => setToast(null)}
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-xs font-semibold underline-offset-2"
            >
              {toast.action.label}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <button
            onClick={() => setToast(null)}
            className="ml-2 p-0.5 hover:bg-white/20 rounded"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Pending Approval
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review, approve, and push deal submissions to invoice.
        </p>
      </div>

      {/* Slice 1c removed the KPI strip (TOTAL SUBMISSIONS / PENDING REVIEW
          / COMMISSION PENDING / PAID OUT). Audit U-021 — the dashboard
          already shows these. */}

      {/* TopBar — quick filters that survive the layout change. Status moves
          to the right column (StatusFilter component). */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
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

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="From date"
        />

        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="To date"
        />

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

      {/* Two-column shell: card grid (left, col-span-3) + filters & rail
          (right, col-span-1). Right column collapses below the cards on
          narrow viewports. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── Left: card grid ─────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-3">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-slate-100 animate-pulse rounded-xl"
                />
              ))}
            </div>
          )}

          {!loading && submissions.length === 0 && (
            <EmptyState
              variant={isFiltered ? "no-matches" : "caught-up"}
              onReset={isFiltered ? resetFilters : undefined}
            />
          )}

          {!loading &&
            submissions.length > 0 &&
            submissions.map((s) => {
              const isExpanded = expandedId === s.id;
              const cardData: SubmissionCardData = {
                id: s.id,
                status: s.status,
                createdAt: s.createdAt,
                agentFirstName: s.agentFirstName,
                agentLastName: s.agentLastName,
                agentEmail: s.agentEmail,
                propertyAddress: s.propertyAddress,
                unit: s.unit,
                dealType: s.dealType,
                exclusiveType: s.exclusiveType,
                totalCommission: s.totalCommission,
                agentPayout: s.agentPayout,
              };

              const cardActions = s.invoice ? (
                <CardActionLink
                  href={`/brokerage/invoices/${s.invoice.id}${overrideQs}`}
                  label={s.invoice.invoiceNumber || "View invoice"}
                />
              ) : null;

              return (
                <SubmissionCard
                  key={s.id}
                  s={cardData}
                  expanded={isExpanded}
                  onToggle={() => toggleExpand(s.id)}
                  actions={cardActions}
                >
                  {/* ── Inline expand: tabs + detail body + footer ── */}
                  <DetailTabs active={activeTab} onChange={setActiveTab} />
                  <div className="px-6 py-5 space-y-6 bg-white rounded-b-xl">
                    {expandedLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="h-20 bg-slate-100 animate-pulse rounded-lg"
                          />
                        ))}
                      </div>
                    ) : !expandedSubmission ? (
                      <div className="text-center py-10">
                        <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">
                          Submission not found
                        </p>
                      </div>
                    ) : activeTab !== "details" ? (
                      <div
                        data-testid="detail-tab-placeholder"
                        className="text-center py-10"
                      >
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2">
                          <FileText className="h-5 w-5 text-slate-400" />
                        </div>
                        <p className="text-slate-500 font-medium">
                          {activeTab === "invoice"
                            ? "Invoice tab coming soon"
                            : "Payment tab coming soon"}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Available after Slice {activeTab === "invoice" ? "2" : "3"}
                        </p>
                      </div>
                    ) : (
                      <DetailBody
                        panelData={expandedSubmission}
                        editingSplitId={editingSplitId}
                        editAgentSplit={editAgentSplit}
                        editHouseSplit={editHouseSplit}
                        editingFeeId={editingFeeId}
                        editFeePct={editFeePct}
                        feeSaving={feeSaving}
                        setEditingSplitId={setEditingSplitId}
                        setEditAgentSplit={setEditAgentSplit}
                        setEditHouseSplit={setEditHouseSplit}
                        setEditingFeeId={setEditingFeeId}
                        setEditFeePct={setEditFeePct}
                        setExpandedSubmission={setExpandedSubmission}
                        handleSaveFee={handleSaveFee}
                        handleViewDoc={handleViewDoc}
                      />
                    )}
                  </div>

                  {/* Expand footer — relocated from slide-over panel. */}
                  {expandedSubmission && !expandedLoading && activeTab === "details" && (
                    <div className="border-t border-slate-200 px-6 py-4 flex items-center gap-2 flex-wrap bg-white rounded-b-xl">
                      {expandedSubmission.status === "submitted" && (
                        <>
                          {/* Slice 1: primary CTA — atomic approve + invoice. */}
                          <button
                            onClick={() => handleApproveAndInvoice(expandedSubmission.id)}
                            disabled={actionLoading === expandedSubmission.id}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === expandedSubmission.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                            Approve &amp; Push to Invoice
                          </button>
                          {/* Secondary: approve without creating an invoice yet. */}
                          <button
                            onClick={() => handleApprove(expandedSubmission.id)}
                            disabled={actionLoading === expandedSubmission.id}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Approve only
                          </button>
                          <button
                            onClick={() => openRejectModal(expandedSubmission.id)}
                            disabled={actionLoading === expandedSubmission.id}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </>
                      )}

                      {expandedSubmission.status === "approved" && (
                        <button
                          onClick={() => handlePushToInvoice(expandedSubmission.id)}
                          disabled={actionLoading === expandedSubmission.id}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === expandedSubmission.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          Create Invoice
                        </button>
                      )}

                      {expandedSubmission.status === "invoiced" && (
                        <>
                          <button
                            onClick={() => openPayoutModal(expandedSubmission.id)}
                            disabled={actionLoading === expandedSubmission.id}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === expandedSubmission.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Banknote className="h-4 w-4" />
                            )}
                            Record Payout
                          </button>
                          <button
                            onClick={() => handleMarkPaid(expandedSubmission.id)}
                            disabled={actionLoading === expandedSubmission.id}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-green-600 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading === expandedSubmission.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <DollarSign className="h-4 w-4" />
                            )}
                            Mark Paid
                          </button>
                        </>
                      )}

                      {expandedSubmission.status === "paid" && (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                          <CheckCircle className="h-4 w-4" />
                          Payment Complete
                        </span>
                      )}

                      {expandedSubmission.invoice && (
                        <a
                          href={`/brokerage/invoices/${expandedSubmission.invoice.id}${overrideQs}`}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50 ml-auto transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {expandedSubmission.invoice.invoiceNumber || "View Invoice"}
                        </a>
                      )}
                    </div>
                  )}
                </SubmissionCard>
              );
            })}

          {/* Pagination */}
          {!loading && submissions.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 mt-4">
              <p className="text-sm text-slate-500">
                Showing {(page - 1) * pageSize + 1}
                {"–"}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

        {/* ── Right: filters + rail ─────────────────────────── */}
        <aside className="lg:col-span-1 space-y-4">
          <StatusFilter
            value={statusFilter}
            counts={statusCounts}
            onChange={(next) => {
              setStatusFilter(next);
              setPage(1);
            }}
          />
          <RecentlyApprovedRail items={recentlyApproved} asOrg={asOrg} />
        </aside>
      </div>

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
            <p className="text-sm text-slate-500 mb-1">
              Provide a reason for rejecting this deal submission. The agent
              will be notified.
            </p>
            <p className="text-xs text-slate-400 mb-3">
              <span className="text-red-600">*</span> Required — the reason
              shows on the agent&apos;s timeline.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={4}
              required
              aria-required="true"
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
                disabled={actionLoading === rejectTargetId || !rejectReason.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={!rejectReason.trim() ? "A rejection reason is required" : undefined}
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

// ── Detail Body (the inline-expand "Details" tab content) ────────────
//
// Extracted from the previous slide-over panel body. Receives all editing
// state from the parent so split / processing-fee inline edits keep working
// the same way they did in slice 1. The JSX mirrors the prior panel almost
// verbatim — only the wrapping container and prop names changed. If anything
// looks unusual (e.g. setPanelData → setExpandedSubmission), it's because
// the panel was renamed; the math and render conditions are unchanged.

interface DetailBodyProps {
  panelData: Submission;
  editingSplitId: string | null;
  editAgentSplit: string;
  editHouseSplit: string;
  editingFeeId: string | null;
  editFeePct: string;
  feeSaving: boolean;
  setEditingSplitId: (id: string | null) => void;
  setEditAgentSplit: (s: string) => void;
  setEditHouseSplit: (s: string) => void;
  setEditingFeeId: (id: string | null) => void;
  setEditFeePct: (s: string) => void;
  setExpandedSubmission: (s: Submission | null) => void;
  handleSaveFee: (id: string, mode: "reset" | "override", pct?: number) => void;
  handleViewDoc: (fileId: string) => void;
}

function DetailBody({
  panelData,
  editingSplitId,
  editAgentSplit,
  editHouseSplit,
  editingFeeId,
  editFeePct,
  feeSaving,
  setEditingSplitId,
  setEditAgentSplit,
  setEditHouseSplit,
  setEditingFeeId,
  setEditFeePct,
  setExpandedSubmission,
  handleSaveFee,
  handleViewDoc,
}: DetailBodyProps) {
  return (
    <>
      {/* Status badges row */}
      <div className="flex items-center gap-3">
        <span
          className={`px-3 py-1 text-sm font-medium rounded-full ${
            SUBMISSION_STATUS_COLORS[panelData.status] ||
            "bg-slate-100 text-slate-600"
          }`}
        >
          {panelData.status}
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
      <PanelSection title="Agent Info" icon={<User className="h-4 w-4" />}>
        <InfoRow
          label="Name"
          value={`${panelData.agentFirstName || ""} ${panelData.agentLastName || ""}`.trim()}
        />
        <InfoRow label="Email" value={panelData.agentEmail} />
        <InfoRow label="Phone" value={panelData.agentPhone} />
        <InfoRow label="License" value={panelData.agentLicense} />
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
      <PanelSection title="Deal Overview" icon={<Building className="h-4 w-4" />}>
        <InfoRow label="Property" value={panelData.propertyAddress} />
        {panelData.unit && <InfoRow label="Unit" value={panelData.unit} />}
        {panelData.city && (
          <InfoRow
            label="City / State"
            value={`${panelData.city}, ${panelData.state || "NY"}`}
          />
        )}
        <InfoRow
          label="Deal Type"
          value={DEAL_TYPE_LABELS[panelData.dealType] || panelData.dealType}
        />
        <InfoRow
          label="Transaction Value"
          value={fmt(panelData.transactionValue)}
        />
        <InfoRow label="Closing Date" value={fmtDate(panelData.closingDate)} />

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
              <InfoRow label="Monthly Rent" value={fmt(panelData.monthlyRent)} />
            )}
            {panelData.moveInDate && (
              <InfoRow
                label="Move-In Date"
                value={fmtDate(panelData.moveInDate)}
              />
            )}
          </>
        )}

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
              <InfoRow label="List Price" value={fmt(panelData.listPrice)} />
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
      {(panelData.clientName || panelData.clientEmail || panelData.clientPhone) && (
        <PanelSection
          title="Landlord / Billing"
          icon={<MapPin className="h-4 w-4" />}
        >
          <InfoRow label="Client Name" value={panelData.clientName} />
          <InfoRow label="Client Email" value={panelData.clientEmail} />
          <InfoRow label="Client Phone" value={panelData.clientPhone} />
        </PanelSection>
      )}

      {/* 4. Commission Breakdown */}
      <PanelSection
        title="Commission Breakdown"
        icon={<DollarSign className="h-4 w-4" />}
      >
        <div className="bg-slate-50 rounded-lg p-3 font-mono text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">Commission Type</span>
            <span className="text-slate-700">
              {panelData.commissionType === "percentage"
                ? "Percentage"
                : "Flat"}
            </span>
          </div>
          {panelData.commissionPct != null && (
            <div className="flex justify-between">
              <span className="text-slate-500">Commission Rate</span>
              <span className="text-slate-700">
                {fmtPct(panelData.commissionPct)}
              </span>
            </div>
          )}
          {panelData.commissionFlat != null && (
            <div className="flex justify-between">
              <span className="text-slate-500">Flat Commission</span>
              <span className="text-slate-700">
                {fmt(panelData.commissionFlat)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-1.5">
            <span className="text-slate-500 font-semibold">Total Commission</span>
            <span className="text-slate-900 font-semibold">
              {fmt(panelData.totalCommission)}
            </span>
          </div>

          {/* Split — inline edit */}
          <div className="border-t border-slate-200 pt-1.5">
            {editingSplitId === panelData.id ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 w-20">Agent %</label>
                  <input
                    type="number"
                    value={editAgentSplit}
                    onChange={(e) => {
                      setEditAgentSplit(e.target.value);
                      const agent = parseFloat(e.target.value);
                      if (!isNaN(agent)) {
                        setEditHouseSplit((100 - agent).toFixed(1));
                      }
                    }}
                    className="w-20 border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    step="0.1"
                    min="0"
                    max="100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 w-20">House %</label>
                  <input
                    type="number"
                    value={editHouseSplit}
                    onChange={(e) => {
                      setEditHouseSplit(e.target.value);
                      const house = parseFloat(e.target.value);
                      if (!isNaN(house)) {
                        setEditAgentSplit((100 - house).toFixed(1));
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
                      // Save is informational in the panel; actual persistence
                      // is handled via the approve flow.
                      setEditingSplitId(null);
                      const agentPct = parseFloat(editAgentSplit) || 0;
                      const housePct = parseFloat(editHouseSplit) || 0;
                      const totalComm = Number(panelData.totalCommission) || 0;
                      setExpandedSubmission({
                        ...panelData,
                        agentSplitPct: agentPct,
                        houseSplitPct: housePct,
                        agentPayout: (totalComm * agentPct) / 100,
                        housePayout: (totalComm * housePct) / 100,
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
                  <span className="text-slate-500">Agent Split</span>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">
                      {fmtPct(panelData.agentSplitPct)} ({fmt(panelData.agentPayout)})
                    </span>
                    <button
                      onClick={() => {
                        setEditingSplitId(panelData.id);
                        setEditAgentSplit(
                          String(Number(panelData.agentSplitPct).toFixed(1))
                        );
                        setEditHouseSplit(
                          String(Number(panelData.houseSplitPct).toFixed(1))
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
                  <span className="text-slate-500">House Split</span>
                  <span className="text-blue-600">
                    {fmtPct(panelData.houseSplitPct)} ({fmt(panelData.housePayout)})
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Processing Fee — editable while approved, read-only post-invoice */}
          {(() => {
            const status = panelData.status as string;
            const isLocked = status === "invoiced" || status === "paid";
            const isApproved = status === "approved";
            if (!isApproved && !isLocked) return null;

            const inv = panelData.invoice as
              | { processingFeePct?: number | string | null; processingFeeAmt?: number | string | null }
              | null
              | undefined;

            if (isLocked) {
              const feeAmt = Number(inv?.processingFeeAmt ?? 0);
              const feePct = Number(inv?.processingFeePct ?? 0);
              if (!feeAmt) return null;
              return (
                <div className="border-t border-slate-200 pt-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      Processing Fee ({feePct.toFixed(2)}%)
                    </span>
                    <span className="text-rose-600">
                      &minus;{fmt(feeAmt)}
                    </span>
                  </div>
                </div>
              );
            }

            const defaultPct = Number(panelData.organizationDefaultFeePct ?? 0);
            const override = !!panelData.processingFeeOverride;
            const totalComm = Number(panelData.totalCommission ?? 0);
            const agentSplit = Number(panelData.agentSplitPct ?? 0);
            const currentPct = override
              ? Number(panelData.processingFeePct ?? 0)
              : defaultPct;
            const currentAmt =
              Math.round(((totalComm * currentPct) / 100) * 100) / 100;
            const isEditing = editingFeeId === panelData.id;

            if (isEditing) {
              const previewPct = Math.max(
                0,
                Math.min(100, parseFloat(editFeePct) || 0)
              );
              const previewFee =
                Math.round(((totalComm * previewPct) / 100) * 100) / 100;
              const previewGross =
                Math.round(((totalComm * agentSplit) / 100) * 100) / 100;
              const previewNet =
                Math.round((previewGross - previewFee) * 100) / 100;
              return (
                <div className="border-t border-slate-200 pt-1.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 flex-1">
                      Processing Fee
                    </label>
                    <input
                      type="number"
                      value={editFeePct}
                      onChange={(e) => setEditFeePct(e.target.value)}
                      onBlur={() => {
                        const pct = parseFloat(editFeePct);
                        if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
                          handleSaveFee(panelData.id, "override", pct);
                        }
                      }}
                      className="w-20 border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      step="0.01"
                      min="0"
                      max="100"
                      autoFocus
                      disabled={feeSaving}
                    />
                    <span className="text-xs text-slate-500">%</span>
                    <span className="text-rose-600 text-sm w-24 text-right">
                      &minus;{fmt(previewFee)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleSaveFee(panelData.id, "override", 0)}
                      disabled={feeSaving}
                      className="px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 rounded hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      Set to 0% &mdash; exempt this deal
                    </button>
                    <button
                      onClick={() => handleSaveFee(panelData.id, "reset")}
                      disabled={feeSaving}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-50 transition-colors"
                    >
                      Reset to brokerage default
                    </button>
                    <button
                      onClick={() => setEditingFeeId(null)}
                      disabled={feeSaving}
                      className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex justify-between text-xs pt-1 border-t border-slate-200">
                    <span className="text-slate-500">
                      Net agent payout (preview)
                    </span>
                    <span className="text-green-600 font-semibold">
                      {fmt(previewNet)}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div className="border-t border-slate-200 pt-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">
                    {override ? "Processing Fee" : "Brokerage Processing Fee"}{" "}
                    ({currentPct.toFixed(2)}%)
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        currentAmt > 0 ? "text-rose-600" : "text-slate-400"
                      }
                    >
                      {currentAmt > 0 ? `−${fmt(currentAmt)}` : fmt(0)}
                    </span>
                    <button
                      onClick={() => {
                        setEditingFeeId(panelData.id);
                        setEditFeePct(currentPct.toFixed(2));
                      }}
                      className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors"
                      title={override ? "Edit fee" : "Customize"}
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {override && (
                  <div className="text-[10px] text-amber-600 mt-0.5">
                    Custom override (brokerage default: {defaultPct.toFixed(2)}%)
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </PanelSection>

      {/* 5. Co-Broker */}
      {(panelData.coBrokeAgent ||
        panelData.coBrokeBrokerage ||
        (Array.isArray(panelData.coAgents) && panelData.coAgents.length > 0)) && (
        <PanelSection title="Co-Broker" icon={<User className="h-4 w-4" />}>
          <InfoRow label="Co-Broke Agent" value={panelData.coBrokeAgent} />
          <InfoRow
            label="Co-Broke Brokerage"
            value={panelData.coBrokeBrokerage}
          />
          {Array.isArray(panelData.coAgents) && panelData.coAgents.length > 0 && (
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
                      <span className="text-slate-400">{ca.splitPct}%</span>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </PanelSection>
      )}

      {/* 6. Documents */}
      {Array.isArray(panelData.files) && panelData.files.length > 0 && (
        <PanelSection title="Documents" icon={<FileCheck className="h-4 w-4" />}>
          <div className="space-y-2">
            {panelData.files.map(
              (
                file: { id: string; fileName: string; createdAt?: string },
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
        <PanelSection title="Notes" icon={<FileText className="h-4 w-4" />}>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">
            {panelData.notes}
          </p>
        </PanelSection>
      )}

      {/* Rejection reason */}
      {panelData.status === "rejected" && panelData.rejectionReason && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Ban className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700">
              Rejection Reason
            </span>
          </div>
          <p className="text-sm text-red-600">{panelData.rejectionReason}</p>
        </div>
      )}
    </>
  );
}

// ── Sub-Components ─────────────────────────────────────────────

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
  if (value == null || value === "" || value === "—") return null;
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
          {date && <p className="text-xs text-slate-400">{fmtDate(date)}</p>}
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
