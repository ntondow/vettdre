"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Search,
  ClipboardList,
  DollarSign,
  TrendingUp,
  ChevronRight,
  X,
  Check,
  CheckCircle,
  Loader2,
  FileText,
  FileCheck,
  FileWarning,
  ExternalLink,
  Upload,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { getSubmissionById } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import { getSignedUrl, uploadFile } from "@/lib/bms-files";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  EXCLUSIVE_TYPE_LABELS,
  EXCLUSIVE_TYPE_COLORS,
  DEAL_TYPE_LABELS,
} from "@/lib/bms-types";

// ── Types ───────────────────────────────────────────────────

interface SubmissionRow {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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
  approvedBy?: string;
  approvedAt?: string;
  bmsPropertyId?: string;
  requiredDocs?: { signedLease?: boolean; agencyDisclosure?: boolean; fairHousing?: boolean; commissionAgreement?: boolean };
  bmsProperty?: { id: string; name: string; address?: string };
  files?: Array<{ id: string; fileName: string; fileSize: number; fileType: string; createdAt: string }>;
}

interface Props {
  initialSubmissions: Record<string, unknown>[];
  showSuccessBanner: boolean;
}

// ── Helpers ─────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PIPELINE_STAGES = ["submitted", "approved", "invoiced", "paid"] as const;
const PIPELINE_LABELS: Record<string, string> = { submitted: "Submitted", approved: "Approved", invoiced: "Invoiced", paid: "Paid" };
const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "commission", label: "Highest Commission" },
  { value: "status", label: "Status" },
];
const STATUS_ORDER: Record<string, number> = { submitted: 0, approved: 1, invoiced: 2, paid: 3, rejected: -1 };
const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ── Component ───────────────────────────────────────────────

export default function MyDealsView({ initialSubmissions, showSuccessBanner }: Props) {
  const [submissions] = useState<SubmissionRow[]>(initialSubmissions as unknown as SubmissionRow[]);
  const [banner, setBanner] = useState(showSuccessBanner);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [searchQuery, setSearchQuery] = useState("");

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);

  // Dismiss success banner
  useEffect(() => {
    if (banner) {
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/brokerage/my-deals");
      }
      const t = setTimeout(() => setBanner(false), 5000);
      return () => clearTimeout(t);
    }
  }, [banner]);

  // ── Stats (client-side from submissions) ──────────────────

  const stats = useMemo(() => {
    let activeDeals = 0;
    let pendingPayout = 0;
    let totalEarned = 0;
    const byStatus: Record<string, number> = {};

    for (const s of submissions) {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      if (s.status !== "paid" && s.status !== "rejected") activeDeals++;
      if (s.status === "approved" || s.status === "invoiced") pendingPayout += s.agentPayout;
      if (s.status === "paid") totalEarned += s.agentPayout;
    }

    return { activeDeals, pendingPayout, totalEarned, byStatus, total: submissions.length };
  }, [submissions]);

  // ── Filtered & Sorted ─────────────────────────────────────

  const filtered = useMemo(() => {
    let list = submissions;

    if (statusFilter) {
      list = list.filter((s) => s.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          s.propertyAddress.toLowerCase().includes(q) ||
          (s.tenantName && s.tenantName.toLowerCase().includes(q)) ||
          (s.clientName && s.clientName.toLowerCase().includes(q)),
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case "oldest":
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "commission":
        sorted.sort((a, b) => b.totalCommission - a.totalCommission);
        break;
      case "status":
        sorted.sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
        break;
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return sorted;
  }, [submissions, statusFilter, sortBy, searchQuery]);

  // ── Detail Panel ──────────────────────────────────────────

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
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
    }, 200);
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">My Deals</h1>
          <a
            href="/brokerage/my-deals/submit"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Submit a Deal
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Success banner */}
        {banner && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3 animate-section-reveal">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
            Deal submitted successfully.
            <button onClick={() => setBanner(false)} className="ml-auto text-green-600 hover:text-green-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Stats Row ──────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-blue-500" />
              <div>
                <div className="text-xs text-slate-500">Active Deals</div>
                <div className="text-lg font-bold text-slate-900">{stats.activeDeals}</div>
              </div>
            </div>
          </div>
          <div className={`rounded-xl border p-4 shadow-sm ${stats.pendingPayout > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-amber-500" />
              <div>
                <div className="text-xs text-slate-500">Pending Payout</div>
                <div className="text-lg font-bold text-slate-900">{USD.format(stats.pendingPayout)}</div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="text-xs text-slate-500">Total Earned</div>
                <div className="text-lg font-bold text-slate-900">{USD.format(stats.totalEarned)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Pipeline Tracker ────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-1">
          {PIPELINE_STAGES.map((stage, i) => {
            const count = stats.byStatus[stage] ?? 0;
            const active = count > 0;
            const isFiltered = statusFilter === stage;
            return (
              <div key={stage} className="flex items-center">
                <button
                  onClick={() => setStatusFilter(isFiltered ? "" : stage)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isFiltered
                      ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300"
                      : active
                        ? SUBMISSION_STATUS_COLORS[stage] ?? "bg-slate-100 text-slate-600"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {PIPELINE_LABELS[stage]}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isFiltered ? "bg-blue-200" : active ? "bg-white/50" : "bg-slate-200"}`}>
                    {count}
                  </span>
                </button>
                {i < PIPELINE_STAGES.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-slate-300 mx-1 hidden sm:block" />
                )}
              </div>
            );
          })}
          {(stats.byStatus.rejected ?? 0) > 0 && (
            <>
              <span className="text-slate-300 mx-1 hidden sm:inline">|</span>
              <button
                onClick={() => setStatusFilter(statusFilter === "rejected" ? "" : "rejected")}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  statusFilter === "rejected" ? "bg-red-100 text-red-700 ring-2 ring-red-300" : "bg-red-50 text-red-600"
                }`}
              >
                Rejected
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100">{stats.byStatus.rejected}</span>
              </button>
            </>
          )}
        </div>

        {/* ── Filter/Sort Bar ─────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search address or client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {statusFilter && (
            <button
              onClick={() => setStatusFilter("")}
              className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear filter
            </button>
          )}
        </div>

        {/* ── Deal Cards ──────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-1">
              {submissions.length === 0 ? "No deals submitted yet" : "No deals match your filter"}
            </h3>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              {submissions.length === 0
                ? "Closed a deal? Submit it here to track your payout."
                : "Try a different filter or search term."}
            </p>
            {submissions.length === 0 && (
              <a
                href="/brokerage/my-deals/submit"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
              >
                <Plus className="w-4 h-4" /> Submit a Deal
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((s) => (
              <DealCard key={s.id} submission={s} onClick={() => openDetail(s.id)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Detail Slide-Over Panel ────────────────────────── */}
      {selectedId && (
        <AgentDetailPanel
          detail={detail}
          loading={detailLoading}
          entered={panelEntered}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

// ── Deal Card ───────────────────────────────────────────────

function DealCard({ submission: s, onClick }: { submission: SubmissionRow; onClick: () => void }) {
  const isRejected = s.status === "rejected";
  const stageIndex = PIPELINE_STAGES.indexOf(s.status as typeof PIPELINE_STAGES[number]);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-xl border shadow-sm hover:shadow-md transition-all p-5 ${
        isRejected ? "border-l-4 border-l-red-400 border-slate-200" : "border-slate-200"
      }`}
    >
      {/* Top badges */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          {DEAL_TYPE_LABELS[s.dealType] ?? s.dealType}
        </span>
        {s.exclusiveType && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${EXCLUSIVE_TYPE_COLORS[s.exclusiveType] ?? ""}`}>
            {EXCLUSIVE_TYPE_LABELS[s.exclusiveType] ?? s.exclusiveType}
          </span>
        )}
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ml-auto ${SUBMISSION_STATUS_COLORS[s.status] ?? "bg-slate-100 text-slate-600"}`}>
          {SUBMISSION_STATUS_LABELS[s.status] ?? s.status}
        </span>
      </div>

      {/* Property + Client */}
      <div className="mb-3">
        <div className="font-semibold text-slate-900">
          {s.propertyAddress}{s.unit ? `, Unit ${s.unit}` : ""}
        </div>
        <div className="text-sm text-slate-500">
          {s.tenantName ? `Tenant: ${s.tenantName}` : s.clientName ? `Client: ${s.clientName}` : ""}
        </div>
      </div>

      {/* Commission row */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div>
          <span className="text-slate-400">Commission: </span>
          <span className="font-semibold text-slate-900">{USD.format(s.totalCommission)}</span>
        </div>
        <div>
          <span className="text-slate-400">Your Payout: </span>
          <span className="font-semibold text-emerald-700">{USD.format(s.agentPayout)}</span>
        </div>
      </div>

      {/* Mini progress tracker */}
      {!isRejected ? (
        <div className="flex items-center gap-0">
          {PIPELINE_STAGES.map((stage, i) => {
            const reached = stageIndex >= i;
            const isCurrent = stageIndex === i;
            return (
              <div key={stage} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-3 h-3 rounded-full border-2 ${
                      reached
                        ? "bg-emerald-500 border-emerald-500"
                        : "bg-white border-slate-300"
                    } ${isCurrent ? "ring-2 ring-emerald-200" : ""}`}
                  />
                  <span className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">{PIPELINE_LABELS[stage]}</span>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className={`w-8 sm:w-12 h-0.5 mx-0.5 mt-[-12px] ${stageIndex > i ? "bg-emerald-500" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <XCircle className="w-4 h-4" />
          <span>Rejected{s.rejectionReason ? `: ${s.rejectionReason}` : ""}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <span className="text-xs text-slate-400">Submitted {fmtDate(s.createdAt)}</span>
        <span className="text-xs font-medium text-blue-600 inline-flex items-center gap-1">
          View Details <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}

// ── Agent Detail Panel ──────────────────────────────────────

function AgentDetailPanel({
  detail,
  loading,
  entered,
  onClose,
}: {
  detail: SubmissionRow | null;
  loading: boolean;
  entered: boolean;
  onClose: () => void;
}) {
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<SubmissionRow["files"]>(null);

  // Sync files from detail
  useEffect(() => {
    if (detail?.files) setLocalFiles(detail.files);
  }, [detail?.files]);

  const handleViewFile = async (fileId: string) => {
    setViewingFileId(fileId);
    try {
      const result = await getSignedUrl(fileId);
      if (result.url) window.open(result.url, "_blank");
    } finally {
      setViewingFileId(null);
    }
  };

  const handleUploadDoc = async (docKey: string, file: File) => {
    if (!detail) return;
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File exceeds 10 MB limit");
      return;
    }
    setUploading(docKey);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadFile(fd, "deal_submission", detail.id);
      if (result.error) {
        setUploadError(result.error);
      } else if (result.attachment) {
        // Add to local files list
        setLocalFiles((prev) => [
          ...(prev ?? []),
          {
            id: (result.attachment as { id: string }).id,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const files = localFiles ?? detail?.files ?? [];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full md:w-[480px] bg-white shadow-xl flex flex-col transition-transform duration-200 ${entered ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
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

        {/* Body */}
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
                  label="Exclusive"
                  value={
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${EXCLUSIVE_TYPE_COLORS[detail.exclusiveType ?? ""] ?? ""}`}>
                      {EXCLUSIVE_TYPE_LABELS[detail.exclusiveType ?? ""] ?? detail.exclusiveType ?? "--"}
                    </span>
                  }
                />
                {detail.bmsProperty && <InfoRow label="Building" value={detail.bmsProperty.name} />}
                {(detail.dealType === "lease" || detail.dealType === "rental") ? (
                  <>
                    {detail.monthlyRent != null && <InfoRow label="Monthly Rent" value={USD.format(detail.monthlyRent)} />}
                    {detail.leaseStartDate && <InfoRow label="Lease Start" value={fmtDate(detail.leaseStartDate)} />}
                    {detail.leaseEndDate && <InfoRow label="Lease End" value={fmtDate(detail.leaseEndDate)} />}
                    {detail.tenantName && <InfoRow label="Tenant" value={detail.tenantName} />}
                    {detail.tenantEmail && <InfoRow label="Tenant Email" value={detail.tenantEmail} />}
                  </>
                ) : (
                  <>
                    <InfoRow label="Sale Price" value={USD.format(detail.transactionValue)} />
                    {detail.closingDate && <InfoRow label="Closing Date" value={fmtDate(detail.closingDate)} />}
                    {detail.representedSide && <InfoRow label="Represented" value={detail.representedSide === "buyer" ? "Buyer" : "Seller"} />}
                    {detail.clientName && <InfoRow label="Client" value={detail.clientName} />}
                  </>
                )}
              </PanelSection>

              {/* 3. Landlord */}
              {(detail.landlordName || detail.managementCo) && (
                <PanelSection title="Landlord / Billing">
                  {detail.landlordName && <InfoRow label="Landlord" value={detail.landlordName} />}
                  {detail.landlordEmail && <InfoRow label="Email" value={detail.landlordEmail} />}
                  {detail.landlordPhone && <InfoRow label="Phone" value={detail.landlordPhone} />}
                  {detail.landlordAddress && <InfoRow label="Address" value={detail.landlordAddress} />}
                  {detail.managementCo && <InfoRow label="Mgmt Co" value={detail.managementCo} />}
                </PanelSection>
              )}

              {/* 4. Commission Breakdown */}
              <PanelSection title="Commission Breakdown">
                <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Commission:</span>
                    <span className="font-bold text-slate-900">{USD.format(detail.totalCommission)}</span>
                  </div>
                  <div className="border-t border-slate-200 my-1" />
                  <div className="flex justify-between">
                    <span className="text-slate-500">Your Split ({detail.agentSplitPct}%):</span>
                    <span className="font-bold text-emerald-700">{USD.format(detail.agentPayout)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">House Split ({detail.houseSplitPct}%):</span>
                    <span className="text-slate-700">{USD.format(detail.housePayout)}</span>
                  </div>
                </div>
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

                {/* File list */}
                {files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((f) => (
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

                {/* Upload zone for missing docs (only if submitted) */}
                {detail.status === "submitted" && (
                  <MissingDocUploader
                    requiredDocs={detail.requiredDocs}
                    uploading={uploading}
                    uploadError={uploadError}
                    onUpload={handleUploadDoc}
                  />
                )}
              </PanelSection>

              {/* 7. Notes */}
              {detail.notes && (
                <PanelSection title="Notes">
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{detail.notes}</p>
                </PanelSection>
              )}
            </>
          )}
        </div>

        {/* Action bar */}
        {detail && (
          <div className="flex-shrink-0 border-t border-slate-200 px-6 py-3 bg-white">
            {detail.status === "submitted" && (
              <div className="text-center text-sm text-slate-500 py-1">
                <Loader2 className="w-4 h-4 inline mr-1.5 animate-spin text-blue-400" />
                Waiting for manager review
              </div>
            )}
            {detail.status === "approved" && (
              <div className="text-center text-sm text-emerald-600 font-medium py-1">
                <Check className="w-4 h-4 inline mr-1" />
                Approved — Waiting for invoice
                {detail.approvedAt && <div className="text-xs text-slate-400 font-normal mt-0.5">Approved {fmtDate(detail.approvedAt)}</div>}
              </div>
            )}
            {detail.status === "invoiced" && (
              <div className="text-center text-sm text-purple-600 font-medium py-1">
                Invoice Created — Awaiting Payment
              </div>
            )}
            {detail.status === "paid" && (
              <div className="text-center text-sm text-emerald-600 font-medium py-1">
                <Check className="w-4 h-4 inline mr-1" />
                Paid — {USD.format(detail.agentPayout)}
              </div>
            )}
            {detail.status === "rejected" && (
              <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">
                <div className="font-medium mb-1">Rejected</div>
                {detail.rejectionReason && <div>{detail.rejectionReason}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Missing Doc Uploader ────────────────────────────────────

function MissingDocUploader({
  requiredDocs,
  uploading,
  uploadError,
  onUpload,
}: {
  requiredDocs?: SubmissionRow["requiredDocs"];
  uploading: string | null;
  uploadError: string | null;
  onUpload: (docKey: string, file: File) => void;
}) {
  const missing: Array<{ key: string; label: string }> = [];
  if (!requiredDocs?.signedLease) missing.push({ key: "signedLease", label: "Signed Lease / Contract" });
  if (!requiredDocs?.agencyDisclosure) missing.push({ key: "agencyDisclosure", label: "NYS Agency Disclosure" });
  if (!requiredDocs?.fairHousing) missing.push({ key: "fairHousing", label: "Fair Housing Notice" });

  if (missing.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="text-xs font-medium text-amber-700 flex items-center gap-1">
        <AlertTriangle className="w-3.5 h-3.5" />
        Upload missing required documents
      </div>
      {uploadError && (
        <div className="text-xs text-red-600">{uploadError}</div>
      )}
      {missing.map((doc) => (
        <label
          key={doc.key}
          className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${
            uploading === doc.key ? "border-blue-300 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/30"
          }`}
        >
          {uploading === doc.key ? (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-sm text-slate-600">{uploading === doc.key ? "Uploading..." : doc.label}</span>
          <input
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            disabled={uploading !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(doc.key, f);
              e.target.value = "";
            }}
          />
        </label>
      ))}
    </div>
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
