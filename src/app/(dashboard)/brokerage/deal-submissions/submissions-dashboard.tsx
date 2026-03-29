"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  FileCheck,
  FileWarning,
  Search,
  X,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Check,
  ExternalLink,
  Edit3,
  DollarSign,
  ClipboardList,
  TrendingUp,
  Receipt,
} from "lucide-react";
import {
  getAllSubmissions,
  getSubmissionById,
  approveSubmission,
  rejectSubmission,
  pushToInvoice,
  getSubmissionStats,
  getOrgAgents,
} from "./actions";
import { getFilesForEntity, getSignedUrl } from "@/lib/bms-files";
import { recordPayout, markSubmissionPaid } from "../reports/revenue/actions";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  EXCLUSIVE_TYPE_LABELS,
  EXCLUSIVE_TYPE_COLORS,
  DEAL_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/bms-types";
import type { ExclusiveType } from "@/lib/bms-types";

// ── Types ───────────────────────────────────────────────────

interface SubmissionRow {
  id: string;
  status: string;
  createdAt: string;
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  agentPhone?: string;
  agentLicense?: string;
  propertyAddress: string;
  unit?: string;
  city?: string;
  state?: string;
  dealType: string;
  exclusiveType?: string;
  transactionValue: number;
  totalCommission: number;
  agentSplitPct: number;
  houseSplitPct: number;
  agentPayout: number;
  housePayout: number;
  commissionType?: string;
  commissionPct?: number;
  commissionFlat?: number;
  monthlyRent?: number;
  leaseStartDate?: string;
  leaseEndDate?: string;
  closingDate?: string;
  tenantName?: string;
  tenantEmail?: string;
  tenantPhone?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  representedSide?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  landlordAddress?: string;
  managementCo?: string;
  coBrokeAgent?: string;
  coBrokeBrokerage?: string;
  notes?: string;
  rejectionReason?: string;
  bmsPropertyId?: string;
  requiredDocs?: { signedLease?: boolean; agencyDisclosure?: boolean; fairHousing?: boolean; commissionAgreement?: boolean };
  agent?: { id: string; firstName: string; lastName: string; email: string };
  bmsProperty?: { id: string; name: string; address?: string };
  files?: Array<{ id: string; fileName: string; fileSize: number; fileType: string; createdAt: string }>;
}

interface StatsData {
  total: number;
  byStatus: Record<string, number>;
  byExclusiveType: Record<string, number>;
  totalCommissionPending: number;
  totalCommissionPaid: number;
}

interface AgentOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Props {
  initialSubmissions: Record<string, unknown>[];
  initialTotal: number;
  initialStats: StatsData;
}

// ── Helpers ─────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_FILTERS = ["", "submitted", "approved", "invoiced", "paid", "rejected"] as const;
const STATUS_FILTER_LABELS: Record<string, string> = {
  "": "All",
  submitted: "Submitted",
  approved: "Approved",
  invoiced: "Invoiced",
  paid: "Paid",
  rejected: "Rejected",
};

// ── Component ───────────────────────────────────────────────

export default function SubmissionsDashboard({
  initialSubmissions,
  initialTotal,
  initialStats,
}: Props) {
  // Data
  const [submissions, setSubmissions] = useState<SubmissionRow[]>(initialSubmissions as unknown as SubmissionRow[]);
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState<StatsData>(initialStats);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [exclusiveFilter, setExclusiveFilter] = useState("");
  const [dealTypeFilter, setDealTypeFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);

  // Reject modal
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectEntered, setRejectEntered] = useState(false);

  // Payout modal
  const [payoutTargetId, setPayoutTargetId] = useState<string | null>(null);
  const [payoutEntered, setPayoutEntered] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState("check");
  const [payoutDate, setPayoutDate] = useState(new Date().toISOString().split("T")[0]);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [recordingPayout, setRecordingPayout] = useState(false);

  // Split edit
  const [editingSplit, setEditingSplit] = useState(false);
  const [overrideExclusiveType, setOverrideExclusiveType] = useState<string>("");
  const [overrideSplitPct, setOverrideSplitPct] = useState("");

  // Processing
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  const limit = 25;
  const totalPages = Math.ceil(total / limit);

  // Fetch agents on mount
  useEffect(() => {
    getOrgAgents().then((res) => {
      if (res.success && res.data) setAgents(res.data);
    });
  }, []);

  // ── Data Fetching ─────────────────────────────────────────

  const fetchSubmissions = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, unknown> = { page: p, limit };
      if (statusFilter) filters.status = statusFilter;
      if (exclusiveFilter) filters.exclusiveType = exclusiveFilter;
      if (dealTypeFilter) filters.dealType = dealTypeFilter;
      if (agentFilter) filters.agentId = agentFilter;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const result = await getAllSubmissions(filters as Parameters<typeof getAllSubmissions>[0]);
      if (result.success) {
        setSubmissions((result.data ?? []) as unknown as SubmissionRow[]);
        setTotal(result.total ?? 0);
        setPage(p);
      } else {
        setError(result.error ?? "Failed to load submissions");
      }
    } catch {
      setError("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, exclusiveFilter, dealTypeFilter, agentFilter, startDate, endDate, limit]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchSubmissions(page),
      getSubmissionStats().then((r) => { if (r.success && r.data) setStats(r.data as unknown as StatsData); }),
    ]);
  }, [fetchSubmissions, page]);

  // Refetch when filters change
  useEffect(() => {
    fetchSubmissions(1);
  }, [statusFilter, exclusiveFilter, dealTypeFilter, agentFilter, startDate, endDate, fetchSubmissions]);

  // Search debounce — searches happen through server filters, but we also filter client-side for immediate feedback
  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
  };

  // Client-side search filter (immediate, no server round-trip)
  const filteredSubmissions = searchQuery.trim()
    ? submissions.filter((s) => {
        const q = searchQuery.toLowerCase();
        return (
          s.propertyAddress.toLowerCase().includes(q) ||
          `${s.agentFirstName} ${s.agentLastName}`.toLowerCase().includes(q) ||
          (s.tenantName && s.tenantName.toLowerCase().includes(q)) ||
          (s.clientName && s.clientName.toLowerCase().includes(q))
        );
      })
    : submissions;

  // ── Detail Panel ──────────────────────────────────────────

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setEditingSplit(false);
    requestAnimationFrame(() => setPanelEntered(true));

    const result = await getSubmissionById(id);
    if (result.success && result.data) {
      setDetail(result.data as unknown as SubmissionRow);
    }
    setDetailLoading(false);
  };

  const closeDetail = () => {
    setPanelEntered(false);
    setTimeout(() => {
      setSelectedId(null);
      setDetail(null);
      setEditingSplit(false);
    }, 200);
  };

  // ── Actions ───────────────────────────────────────────────

  const handleApprove = async (id: string, overrides?: { exclusiveType?: ExclusiveType; agentSplitPct?: number; notes?: string }) => {
    setProcessingAction("approve");
    try {
      const result = await approveSubmission(id, overrides);
      if (result.success) {
        setSuccessMsg("Submission approved");
        closeDetail();
        await refreshAll();
      } else {
        setError(result.error ?? "Failed to approve");
      }
    } catch {
      setError("Failed to approve submission");
    } finally {
      setProcessingAction(null);
    }
  };

  const openRejectModal = (id: string) => {
    setRejectTargetId(id);
    setRejectReason("");
    requestAnimationFrame(() => setRejectEntered(true));
  };

  const closeRejectModal = () => {
    setRejectEntered(false);
    setTimeout(() => {
      setRejectTargetId(null);
      setRejectReason("");
    }, 200);
  };

  const handleReject = async () => {
    if (!rejectTargetId || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      const result = await rejectSubmission(rejectTargetId, rejectReason.trim());
      if (result.success) {
        setSuccessMsg("Submission rejected");
        closeRejectModal();
        closeDetail();
        await refreshAll();
      } else {
        setError(result.error ?? "Failed to reject");
      }
    } catch {
      setError("Failed to reject submission");
    } finally {
      setRejecting(false);
    }
  };

  const handleCreateInvoice = async (id: string) => {
    setProcessingAction("invoice");
    try {
      const result = await pushToInvoice(id);
      if (result.success) {
        setSuccessMsg(`Invoice created (ID: ${result.invoiceId?.slice(0, 8)}...)`);
        closeDetail();
        await refreshAll();
      } else {
        setError(result.error ?? "Failed to create invoice");
      }
    } catch {
      setError("Failed to create invoice");
    } finally {
      setProcessingAction(null);
    }
  };

  // ── Payout Handlers ────────────────────────────────────────

  const openPayoutModal = (id: string) => {
    setPayoutTargetId(id);
    setPayoutMethod("check");
    setPayoutDate(new Date().toISOString().split("T")[0]);
    setPayoutRef("");
    setPayoutNotes("");
    requestAnimationFrame(() => setPayoutEntered(true));
  };

  const closePayoutModal = () => {
    setPayoutEntered(false);
    setTimeout(() => setPayoutTargetId(null), 200);
  };

  const handleRecordPayout = async () => {
    if (!payoutTargetId) return;
    setRecordingPayout(true);
    try {
      const result = await recordPayout({
        submissionId: payoutTargetId,
        paymentMethod: payoutMethod,
        paymentDate: payoutDate,
        referenceNumber: payoutRef || undefined,
        notes: payoutNotes || undefined,
      });
      if (result.success) {
        setSuccessMsg("Payment recorded");
        closePayoutModal();
        closeDetail();
        await refreshAll();
      } else {
        setError(result.error ?? "Failed to record payout");
      }
    } catch {
      setError("Failed to record payout");
    } finally {
      setRecordingPayout(false);
    }
  };

  const handleQuickMarkPaid = async (id: string) => {
    setProcessingAction("markPaid");
    try {
      const result = await markSubmissionPaid(id);
      if (result.success) {
        setSuccessMsg("Marked as paid");
        closeDetail();
        await refreshAll();
      } else {
        setError(result.error ?? "Failed to mark as paid");
      }
    } catch {
      setError("Failed to mark as paid");
    } finally {
      setProcessingAction(null);
    }
  };

  // Clear success message after 4s
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <h1 className="text-xl font-semibold text-slate-900">Deal Submissions</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Success toast */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3 animate-section-reveal">
            <Check className="w-4 h-4" />
            {successMsg}
            <button onClick={() => setSuccessMsg(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Stats Row ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<ClipboardList className="w-5 h-5 text-slate-400" />} label="Total Submissions" value={stats.total} />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
            label="Pending Review"
            value={stats.byStatus?.submitted ?? 0}
            highlight={!!stats.byStatus?.submitted}
          />
          <StatCard icon={<DollarSign className="w-5 h-5 text-slate-400" />} label="Commission Pending" value={USD.format(stats.totalCommissionPending)} />
          <StatCard icon={<TrendingUp className="w-5 h-5 text-emerald-500" />} label="Paid Out" value={USD.format(stats.totalCommissionPaid)} />
        </div>

        {/* ── Filter Bar ─────────────────────────────────── */}
        <div className="space-y-3">
          {/* Status pills */}
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => {
              const count = s ? (stats.byStatus?.[s] ?? 0) : stats.total;
              const active = statusFilter === s;
              const isPending = s === "submitted" && (stats.byStatus?.submitted ?? 0) > 0;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    active
                      ? "bg-blue-100 text-blue-700"
                      : isPending
                        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {STATUS_FILTER_LABELS[s]}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-blue-200" : "bg-slate-200"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dropdowns + search row */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={exclusiveFilter}
              onChange={(e) => setExclusiveFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Exclusives</option>
              <option value="brokerage">Brokerage Exclusive</option>
              <option value="personal">Personal Exclusive</option>
            </select>
            <select
              value={dealTypeFilter}
              onChange={(e) => setDealTypeFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Deal Types</option>
              <option value="lease">Lease</option>
              <option value="sale">Sale</option>
            </select>
            {agents.length > 0 && (
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                ))}
              </select>
            )}
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search address, agent, tenant..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* ── Submissions Table ───────────────────────────── */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {loading && (
            <div className="h-0.5 bg-blue-100 overflow-hidden">
              <div className="h-full w-1/3 bg-blue-500 animate-pulse" />
            </div>
          )}
          {filteredSubmissions.length === 0 ? (
            <div className="py-16 text-center">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No submissions found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-500 hidden sm:table-cell">Date</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Agent</th>
                  <th className="px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Property</th>
                  <th className="px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Exclusive</th>
                  <th className="px-4 py-3 font-medium text-slate-500 hidden md:table-cell text-right">Commission</th>
                  <th className="px-4 py-3 font-medium text-slate-500 hidden lg:table-cell text-right">Payout</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openDetail(s.id)}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SUBMISSION_STATUS_COLORS[s.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {SUBMISSION_STATUS_LABELS[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{s.agentFirstName} {s.agentLastName}</div>
                      <div className="text-xs text-slate-500 md:hidden">{s.propertyAddress}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                      {s.propertyAddress}{s.unit ? ` #${s.unit}` : ""}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs font-medium text-slate-600">{DEAL_TYPE_LABELS[s.dealType] ?? s.dealType}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {s.exclusiveType && (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${EXCLUSIVE_TYPE_COLORS[s.exclusiveType] ?? ""}`}>
                          {EXCLUSIVE_TYPE_LABELS[s.exclusiveType] ?? s.exclusiveType}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900 hidden md:table-cell text-right font-medium">{USD.format(s.totalCommission)}</td>
                    <td className="px-4 py-3 text-emerald-700 hidden lg:table-cell text-right font-medium">{USD.format(s.agentPayout)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {s.status === "submitted" && (
                        <button onClick={() => openDetail(s.id)} className="text-xs font-medium text-blue-600 hover:text-blue-700">Review</button>
                      )}
                      {s.status === "approved" && (
                        <button onClick={() => handleCreateInvoice(s.id)} disabled={processingAction === "invoice"} className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-blue-300">
                          {processingAction === "invoice" ? "Creating..." : "Create Invoice"}
                        </button>
                      )}
                      {s.status === "invoiced" && (
                        <button onClick={() => openPayoutModal(s.id)} className="text-xs font-medium text-purple-600 hover:text-purple-700">Record Payout</button>
                      )}
                      {s.status === "paid" && <Check className="w-4 h-4 text-emerald-500 inline" />}
                      {s.status === "rejected" && (
                        <button onClick={() => openDetail(s.id)} className="text-xs text-slate-500 hover:text-slate-700">View</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <p className="text-slate-500">Page {page} of {totalPages} ({total} total)</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchSubmissions(page - 1)}
                disabled={page <= 1 || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <button
                onClick={() => fetchSubmissions(page + 1)}
                disabled={page >= totalPages || loading}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Slide-Over Panel ────────────────────────── */}
      {selectedId && (
        <DetailPanel
          detail={detail}
          loading={detailLoading}
          entered={panelEntered}
          processingAction={processingAction}
          editingSplit={editingSplit}
          overrideExclusiveType={overrideExclusiveType}
          overrideSplitPct={overrideSplitPct}
          onClose={closeDetail}
          onApprove={handleApprove}
          onReject={openRejectModal}
          onCreateInvoice={handleCreateInvoice}
          onEditSplit={() => {
            if (detail) {
              setOverrideExclusiveType(detail.exclusiveType ?? "");
              setOverrideSplitPct(String(detail.agentSplitPct));
              setEditingSplit(true);
            }
          }}
          onCancelEditSplit={() => setEditingSplit(false)}
          onChangeOverrideExclusiveType={setOverrideExclusiveType}
          onChangeOverrideSplitPct={setOverrideSplitPct}
        />
      )}

      {/* ── Reject Modal ─────────────────────────────────── */}
      {rejectTargetId && (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-200 ${rejectEntered ? "opacity-100" : "opacity-0"}`}>
          <div className="absolute inset-0 bg-black/30" onClick={closeRejectModal} />
          <div className={`relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 transition-transform duration-200 ${rejectEntered ? "scale-100" : "scale-95"}`} style={{ animation: rejectEntered ? "modal-in 0.2s ease-out" : undefined }}>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Reject Submission</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)..."
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={closeRejectModal} disabled={rejecting} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                {rejecting && <Loader2 className="w-4 h-4 animate-spin" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payout Modal ─────────────────────────────────── */}
      {payoutTargetId && (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-200 ${payoutEntered ? "opacity-100" : "opacity-0"}`}>
          <div className="absolute inset-0 bg-black/30" onClick={closePayoutModal} />
          <div className={`relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 transition-transform duration-200 ${payoutEntered ? "scale-100" : "scale-95"}`} style={{ animation: payoutEntered ? "modal-in 0.2s ease-out" : undefined }}>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Record Payout</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Payment Method</label>
                <select value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {Object.entries(PAYMENT_METHOD_LABELS).filter(([k]) => k !== "stripe").map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Payment Date</label>
                <input type="date" value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Reference # <span className="text-slate-400">(optional)</span></label>
                <input type="text" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="Check number, transaction ID..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Notes <span className="text-slate-400">(optional)</span></label>
                <textarea value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closePayoutModal} disabled={recordingPayout} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={handleRecordPayout}
                disabled={recordingPayout}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                {recordingPayout && <Loader2 className="w-4 h-4 animate-spin" />}
                Record Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${highlight ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-lg font-bold text-slate-900">{value}</div>
        </div>
      </div>
    </div>
  );
}

// ── Detail Panel ────────────────────────────────────────────

function DetailPanel({
  detail,
  loading,
  entered,
  processingAction,
  editingSplit,
  overrideExclusiveType,
  overrideSplitPct,
  onClose,
  onApprove,
  onReject,
  onCreateInvoice,
  onEditSplit,
  onCancelEditSplit,
  onChangeOverrideExclusiveType,
  onChangeOverrideSplitPct,
}: {
  detail: SubmissionRow | null;
  loading: boolean;
  entered: boolean;
  processingAction: string | null;
  editingSplit: boolean;
  overrideExclusiveType: string;
  overrideSplitPct: string;
  onClose: () => void;
  onApprove: (id: string, overrides?: { exclusiveType?: ExclusiveType; agentSplitPct?: number; notes?: string }) => void;
  onReject: (id: string) => void;
  onCreateInvoice: (id: string) => void;
  onEditSplit: () => void;
  onCancelEditSplit: () => void;
  onChangeOverrideExclusiveType: (v: string) => void;
  onChangeOverrideSplitPct: (v: string) => void;
}) {
  // File viewing
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);

  const handleViewFile = async (fileId: string) => {
    setViewingFileId(fileId);
    try {
      const result = await getSignedUrl(fileId);
      if (result.url) {
        window.open(result.url, "_blank");
      }
    } finally {
      setViewingFileId(null);
    }
  };

  // Override calculations
  const overrideSplitNum = parseFloat(overrideSplitPct) || 0;
  const overrideHouseSplit = 100 - overrideSplitNum;
  const overrideAgentPayout = detail ? detail.totalCommission * (overrideSplitNum / 100) : 0;
  const overrideHousePayout = detail ? detail.totalCommission * (overrideHouseSplit / 100) : 0;

  const handleApproveWithOverrides = () => {
    if (!detail) return;
    const overrides: { exclusiveType?: ExclusiveType; agentSplitPct?: number } = {};
    if (overrideExclusiveType && overrideExclusiveType !== detail.exclusiveType) {
      overrides.exclusiveType = overrideExclusiveType as ExclusiveType;
    }
    if (overrideSplitNum && overrideSplitNum !== detail.agentSplitPct) {
      overrides.agentSplitPct = overrideSplitNum;
    }
    onApprove(detail.id, Object.keys(overrides).length > 0 ? overrides : undefined);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full md:w-[480px] bg-white shadow-xl flex flex-col transition-transform duration-200 ${entered ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          {detail ? (
            <div>
              <div className="font-semibold text-slate-900">{detail.propertyAddress}{detail.unit ? ` #${detail.unit}` : ""}</div>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${SUBMISSION_STATUS_COLORS[detail.status] ?? ""}`}>
                {SUBMISSION_STATUS_LABELS[detail.status] ?? detail.status}
              </span>
            </div>
          ) : (
            <div className="h-6 w-48 animate-shimmer rounded" />
          )}
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading || !detail ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 rounded-lg animate-shimmer" />)}
            </div>
          ) : (
            <>
              {/* 1. Agent Info */}
              <PanelSection title="Agent Info">
                <InfoRow label="Name" value={`${detail.agentFirstName} ${detail.agentLastName}`} />
                <InfoRow label="Email" value={detail.agentEmail} />
                {detail.agentPhone && <InfoRow label="Phone" value={detail.agentPhone} />}
                {detail.agentLicense && <InfoRow label="License" value={detail.agentLicense} />}
              </PanelSection>

              {/* 2. Deal Overview */}
              <PanelSection title="Deal Overview">
                <InfoRow label="Deal Type" value={DEAL_TYPE_LABELS[detail.dealType] ?? detail.dealType} />
                <InfoRow
                  label="Exclusive Type"
                  value={
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${EXCLUSIVE_TYPE_COLORS[detail.exclusiveType ?? ""] ?? ""}`}>
                      {EXCLUSIVE_TYPE_LABELS[detail.exclusiveType ?? ""] ?? detail.exclusiveType ?? "--"}
                    </span>
                  }
                />
                {detail.bmsProperty && <InfoRow label="Building" value={detail.bmsProperty.name} />}
                {detail.dealType === "lease" || detail.dealType === "rental" ? (
                  <>
                    {detail.monthlyRent && <InfoRow label="Monthly Rent" value={USD.format(detail.monthlyRent)} />}
                    {detail.leaseStartDate && <InfoRow label="Lease Start" value={fmtDate(detail.leaseStartDate)} />}
                    {detail.leaseEndDate && <InfoRow label="Lease End" value={fmtDate(detail.leaseEndDate)} />}
                    {detail.tenantName && <InfoRow label="Tenant" value={detail.tenantName} />}
                    {detail.tenantEmail && <InfoRow label="Tenant Email" value={detail.tenantEmail} />}
                    {detail.tenantPhone && <InfoRow label="Tenant Phone" value={detail.tenantPhone} />}
                  </>
                ) : (
                  <>
                    <InfoRow label="Sale Price" value={USD.format(detail.transactionValue)} />
                    {detail.closingDate && <InfoRow label="Closing Date" value={fmtDate(detail.closingDate)} />}
                    {detail.representedSide && <InfoRow label="Represented" value={detail.representedSide === "buyer" ? "Buyer" : "Seller"} />}
                    {detail.clientName && <InfoRow label="Client" value={detail.clientName} />}
                    {detail.clientEmail && <InfoRow label="Client Email" value={detail.clientEmail} />}
                    {detail.clientPhone && <InfoRow label="Client Phone" value={detail.clientPhone} />}
                  </>
                )}
              </PanelSection>

              {/* 3. Landlord / Billing */}
              {(detail.landlordName || detail.landlordEmail || detail.managementCo) && (
                <PanelSection title="Landlord / Billing">
                  {detail.landlordName && <InfoRow label="Landlord" value={detail.landlordName} />}
                  {detail.landlordEmail && <InfoRow label="Email" value={detail.landlordEmail} />}
                  {detail.landlordPhone && <InfoRow label="Phone" value={detail.landlordPhone} />}
                  {detail.landlordAddress && <InfoRow label="Address" value={detail.landlordAddress} />}
                  {detail.managementCo && <InfoRow label="Mgmt Co" value={detail.managementCo} />}
                  {detail.bmsProperty && (
                    <div className="text-xs text-slate-400 mt-1">(From: {detail.bmsProperty.name})</div>
                  )}
                </PanelSection>
              )}

              {/* 4. Commission Breakdown */}
              <PanelSection title="Commission Breakdown">
                {!editingSplit ? (
                  <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Commission:</span>
                      <span className="font-bold text-slate-900">{USD.format(detail.totalCommission)}</span>
                    </div>
                    <div className="border-t border-slate-200 my-1" />
                    <div className="flex justify-between">
                      <span className="text-slate-500">Agent Split ({detail.agentSplitPct}%):</span>
                      <span className="font-bold text-emerald-700">{USD.format(detail.agentPayout)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">House Split ({detail.houseSplitPct}%):</span>
                      <span className="text-slate-700">{USD.format(detail.housePayout)}</span>
                    </div>
                    {(detail.status === "submitted" || detail.status === "approved") && (
                      <button onClick={onEditSplit} className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-sans">
                        <Edit3 className="w-3 h-3" /> Edit Split
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Exclusive Type Override</label>
                      <select
                        value={overrideExclusiveType}
                        onChange={(e) => onChangeOverrideExclusiveType(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="brokerage">Brokerage Exclusive</option>
                        <option value="personal">Personal Exclusive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Agent Split %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={overrideSplitPct}
                        onChange={(e) => onChangeOverrideSplitPct(e.target.value)}
                        className="w-24 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="font-mono text-sm space-y-1 bg-white rounded-lg p-3">
                      <div className="flex justify-between"><span className="text-slate-500">Agent ({overrideSplitNum}%):</span><span className="font-bold text-emerald-700">{USD.format(overrideAgentPayout)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">House ({overrideHouseSplit}%):</span><span className="text-slate-700">{USD.format(overrideHousePayout)}</span></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={onCancelEditSplit} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                    </div>
                  </div>
                )}
              </PanelSection>

              {/* 5. Co-Broker */}
              {(detail.coBrokeAgent || detail.coBrokeBrokerage) && (
                <PanelSection title="Co-Broker">
                  {detail.coBrokeAgent && <InfoRow label="Agent" value={detail.coBrokeAgent} />}
                  {detail.coBrokeBrokerage && <InfoRow label="Brokerage" value={detail.coBrokeBrokerage} />}
                </PanelSection>
              )}

              {/* 6. Documents */}
              <PanelSection title="Documents">
                <DocCheck label="Signed Lease / Contract" uploaded={detail.requiredDocs?.signedLease} />
                <DocCheck label="NYS Agency Disclosure" uploaded={detail.requiredDocs?.agencyDisclosure} />
                <DocCheck label="Fair Housing Notice" uploaded={detail.requiredDocs?.fairHousing} />
                <DocCheck label="Commission Agreement" uploaded={detail.requiredDocs?.commissionAgreement} optional />
                {detail.files && detail.files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {detail.files.map((f) => (
                      <div key={f.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="text-sm text-slate-700 truncate flex-1">{f.fileName}</span>
                        <span className="text-xs text-slate-400">{(f.fileSize / 1024).toFixed(0)}KB</span>
                        <button
                          onClick={() => handleViewFile(f.id)}
                          disabled={viewingFileId === f.id}
                          className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                        >
                          {viewingFileId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </PanelSection>

              {/* 7. Notes */}
              {detail.notes && (
                <PanelSection title="Notes">
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.notes}</p>
                </PanelSection>
              )}

              {/* Rejection reason */}
              {detail.status === "rejected" && detail.rejectionReason && (
                <PanelSection title="Rejection Reason">
                  <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">{detail.rejectionReason}</div>
                </PanelSection>
              )}
            </>
          )}
        </div>

        {/* Panel action bar */}
        {detail && (
          <div className="flex-shrink-0 border-t border-slate-200 px-6 py-3 bg-white">
            {detail.status === "submitted" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => editingSplit ? handleApproveWithOverrides() : onApprove(detail.id)}
                  disabled={processingAction === "approve"}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
                >
                  {processingAction === "approve" && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingSplit ? "Save & Approve" : "Approve"}
                </button>
                <button
                  onClick={() => onReject(detail.id)}
                  className="inline-flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
            {detail.status === "approved" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onCreateInvoice(detail.id)}
                  disabled={processingAction === "invoice"}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
                >
                  {processingAction === "invoice" && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Invoice
                </button>
                <button
                  onClick={() => onReject(detail.id)}
                  className="inline-flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
                >
                  Reject
                </button>
              </div>
            )}
            {detail.status === "invoiced" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => openPayoutModal(detail.id)}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
                >
                  Record Payout
                </button>
                <button
                  onClick={() => handleQuickMarkPaid(detail.id)}
                  disabled={processingAction === "markPaid"}
                  className="inline-flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg px-4 py-2.5 transition-colors disabled:opacity-50"
                >
                  {processingAction === "markPaid" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Quick Mark Paid
                </button>
              </div>
            )}
            {detail.status === "paid" && (
              <div className="text-center text-sm text-emerald-600 font-medium py-1">
                <Check className="w-4 h-4 inline mr-1" /> Paid
              </div>
            )}
            {detail.status === "rejected" && (
              <div className="text-center text-sm text-red-500 py-1">Rejected</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between text-sm">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-slate-900 text-right ml-4">{value}</span>
    </div>
  );
}

function DocCheck({ label, uploaded, optional }: { label: string; uploaded?: boolean; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {uploaded ? (
        <FileCheck className="w-4 h-4 text-emerald-500" />
      ) : optional ? (
        <FileText className="w-4 h-4 text-slate-300" />
      ) : (
        <FileWarning className="w-4 h-4 text-amber-500" />
      )}
      <span className={uploaded ? "text-slate-700" : optional ? "text-slate-400" : "text-amber-700"}>
        {label}
      </span>
      {!uploaded && !optional && <span className="text-xs text-amber-500">Missing</span>}
    </div>
  );
}
