"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Search,
  X,
  SlidersHorizontal,
  DollarSign,
  Clock,
  FileText,
  Upload,
  ExternalLink,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Circle,
  Building2,
  User,
  Briefcase,
  Receipt,
  Users,
  StickyNote,
  Paperclip,
  Eye,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { getSubmissionById } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import { getSignedUrl, uploadFile } from "@/lib/bms-files";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  DEAL_TYPE_LABELS,
} from "@/lib/bms-types";

// ── Local label/color maps for exclusive type ─────────────────

const EXCLUSIVE_TYPE_LABELS: Record<string, string> = {
  exclusive: "Exclusive",
  co_exclusive: "Co-Exclusive",
  open: "Open",
};

const EXCLUSIVE_TYPE_COLORS: Record<string, string> = {
  exclusive: "bg-indigo-100 text-indigo-700",
  co_exclusive: "bg-violet-100 text-violet-700",
  open: "bg-gray-100 text-gray-600",
};

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const fmtDate = (d: string) => {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const num = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));

// ── Pipeline stage definitions ────────────────────────────────

const PIPELINE_STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
] as const;

type SortOption = "newest" | "oldest" | "commission" | "status";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "commission", label: "Commission" },
  { value: "status", label: "Status" },
];

const STATUS_ORDER: Record<string, number> = {
  submitted: 0,
  under_review: 1,
  approved: 2,
  invoiced: 3,
  paid: 4,
  rejected: 5,
};

// Required docs for submission
const REQUIRED_DOCS = [
  "Fully Executed Contract",
  "Commission Agreement",
  "W-9",
];

// ── Props ─────────────────────────────────────────────────────

interface MyDealsViewProps {
  initialSubmissions: Record<string, unknown>[];
  showSuccessBanner: boolean;
}

// ── Sub-components ────────────────────────────────────────────

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 mr-3">{label}</span>
      <span
        className={`text-sm text-gray-900 text-right ${mono ? "font-mono" : ""}`}
      >
        {value || "\u2014"}
      </span>
    </div>
  );
}

function PanelSection({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-700 flex-1">
          {title}
        </span>
        <ChevronRight
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function DocCheck({
  label,
  present,
}: {
  label: string;
  present: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      {present ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Circle className="w-4 h-4 text-gray-300" />
      )}
      <span
        className={`text-sm ${present ? "text-gray-700" : "text-gray-400"}`}
      >
        {label}
      </span>
    </div>
  );
}

// ── Missing Doc Uploader ──────────────────────────────────────

function MissingDocUploader({
  submissionId,
  existingDocs,
  onUploaded,
}: {
  submissionId: string;
  existingDocs: { id: string; fileName: string }[];
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingNames = new Set(
    existingDocs.map((d) => d.fileName.toLowerCase())
  );

  const missingDocs = REQUIRED_DOCS.filter(
    (doc) =>
      !existingDocs.some((ed) =>
        ed.fileName.toLowerCase().includes(doc.toLowerCase().replace(/ /g, "_"))
      )
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadFile(formData, "deal_submission", submissionId);
      if (result.error) {
        setError(result.error);
      } else {
        onUploaded();
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (missingDocs.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Missing Documents
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            Upload the following to move your deal forward:
          </p>
        </div>
      </div>

      <div className="space-y-1 mb-3">
        {REQUIRED_DOCS.map((doc) => (
          <DocCheck
            key={doc}
            label={doc}
            present={!missingDocs.includes(doc)}
          />
        ))}
      </div>

      <label
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
          uploading
            ? "bg-gray-100 text-gray-400"
            : "bg-amber-600 text-white hover:bg-amber-700"
        }`}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {uploading ? "Uploading..." : "Upload Document"}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>

      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}
    </div>
  );
}

// ── Mini Progress Tracker ─────────────────────────────────────

function MiniProgressTracker({ status }: { status: string }) {
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.key === status);
  const isRejected = status === "rejected";

  return (
    <div className="flex items-center gap-0">
      {PIPELINE_STAGES.map((stage, i) => {
        const isCompleted = !isRejected && currentIndex >= 0 && i < currentIndex;
        const isCurrent = !isRejected && stage.key === status;
        const isFuture = !isCompleted && !isCurrent;

        return (
          <div key={stage.key} className="flex items-center">
            {i > 0 && (
              <div
                className={`w-5 h-0.5 ${
                  isCompleted ? "bg-green-400" : "bg-gray-200"
                }`}
              />
            )}
            <div className="relative group">
              <div
                className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                  isRejected
                    ? "border-red-300 bg-red-50"
                    : isCompleted
                      ? "border-green-500 bg-green-500"
                      : isCurrent
                        ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200 ring-offset-1 animate-pulse"
                        : "border-gray-300 bg-white"
                }`}
              >
                {isCompleted && (
                  <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                )}
              </div>
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap">
                <span className="text-[10px] text-gray-500 bg-white px-1 rounded shadow-sm">
                  {stage.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Deal Card ─────────────────────────────────────────────────

function DealCard({
  submission,
  onSelect,
}: {
  submission: Record<string, unknown>;
  onSelect: (id: string) => void;
}) {
  const status = str(submission.status);
  const dealType = str(submission.dealType);
  const exclusiveType = str(submission.exclusiveType);
  const address = str(submission.propertyAddress);
  const unit = str(submission.unit);
  const clientName = str(submission.clientName);
  const totalCommission = num(submission.totalCommission);
  const agentPayout = num(submission.agentPayout);
  const rejectionReason = str(submission.rejectionReason);
  const createdAt = str(submission.createdAt);
  const id = str(submission.id);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all">
      {/* Header: badges + date */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              SUBMISSION_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {SUBMISSION_STATUS_LABELS[status] ?? status}
          </span>
          {dealType && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {DEAL_TYPE_LABELS[dealType] ?? dealType}
            </span>
          )}
          {exclusiveType && EXCLUSIVE_TYPE_LABELS[exclusiveType] && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                EXCLUSIVE_TYPE_COLORS[exclusiveType] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {EXCLUSIVE_TYPE_LABELS[exclusiveType]}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-2">
          {fmtDate(createdAt)}
        </span>
      </div>

      {/* Address */}
      <div className="mb-2">
        <p className="text-sm font-semibold text-gray-900 leading-snug">
          {address}
          {unit ? `, Unit ${unit}` : ""}
        </p>
        {clientName && (
          <p className="text-xs text-gray-500 mt-0.5">
            Client: {clientName}
          </p>
        )}
      </div>

      {/* Commission + payout */}
      <div className="flex items-center gap-4 mb-3">
        <div>
          <p className="text-xs text-gray-400">Commission</p>
          <p className="text-sm font-semibold text-gray-800">
            {fmtFull(totalCommission)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Your Payout</p>
          <p className="text-sm font-semibold text-green-700">
            {fmtFull(agentPayout)}
          </p>
        </div>
      </div>

      {/* Mini progress tracker */}
      <div className="mb-3 py-2">
        <MiniProgressTracker status={status} />
      </div>

      {/* Rejection reason */}
      {status === "rejected" && rejectionReason && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 mb-3">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{rejectionReason}</p>
          </div>
        </div>
      )}

      {/* View details */}
      <button
        onClick={() => onSelect(id)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
      >
        <Eye className="w-4 h-4" />
        View Details
      </button>
    </div>
  );
}

// ── Agent Detail Panel ────────────────────────────────────────

function AgentDetailPanel({
  submissionId,
  onClose,
}: {
  submissionId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<{ id: string; fileName: string; url?: string }[]>([]);
  const [docRefresh, setDocRefresh] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const sub = await getSubmissionById(submissionId);
        if (sub?.success && sub.data) {
          setData(sub.data as Record<string, unknown>);
        } else {
          setData(null);
        }
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [submissionId, docRefresh]);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid closing on the click that opened the panel
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handleClick),
      100
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
        <div
          ref={panelRef}
          className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 overflow-y-auto animate-[slide-in-right_0.3s_ease-out]"
        >
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
        <div
          ref={panelRef}
          className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 overflow-y-auto"
        >
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Submission not found.
          </div>
        </div>
      </>
    );
  }

  const status = str(data.status);
  const agentPayout = num(data.agentPayout);
  const invoice = data.invoice as Record<string, unknown> | null | undefined;

  // Collect existing file attachments from the data (if the server includes them)
  const existingDocs: { id: string; fileName: string }[] = Array.isArray(
    (data as any)?.files
  )
    ? (data as any).files
    : [];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        ref={panelRef}
        className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white shadow-2xl z-50 overflow-y-auto animate-[slide-in-right_0.3s_ease-out]"
      >
        {/* Panel header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Deal Details
            </h2>
            <p className="text-xs text-gray-500">
              {str(data.propertyAddress)}
              {str(data.unit) ? `, Unit ${str(data.unit)}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Agent action bar */}
        <div className="px-5 py-3 border-b border-gray-100">
          <AgentActionBar
            status={status}
            agentPayout={agentPayout}
            rejectionReason={str(data.rejectionReason)}
            submissionId={str(data.id)}
            existingDocs={existingDocs}
            onDocUploaded={() => setDocRefresh((p) => p + 1)}
          />
        </div>

        {/* Sections */}
        <div className="divide-y divide-gray-100">
          {/* 1. Agent Info */}
          <PanelSection title="Agent Info" icon={User}>
            <InfoRow
              label="Name"
              value={`${str(data.agentFirstName)} ${str(data.agentLastName)}`}
            />
            <InfoRow label="Email" value={str(data.agentEmail)} />
            <InfoRow label="Phone" value={str(data.agentPhone)} />
            <InfoRow label="License #" value={str(data.agentLicense)} />
          </PanelSection>

          {/* 2. Deal Overview */}
          <PanelSection title="Deal Overview" icon={Building2}>
            <InfoRow label="Property" value={str(data.propertyAddress)} />
            <InfoRow label="Unit" value={str(data.unit)} />
            <InfoRow label="City" value={str(data.city)} />
            <InfoRow label="State" value={str(data.state)} />
            <InfoRow
              label="Deal Type"
              value={DEAL_TYPE_LABELS[str(data.dealType)] ?? str(data.dealType)}
            />
            <InfoRow
              label="Transaction Value"
              value={fmtFull(num(data.transactionValue))}
              mono
            />
            <InfoRow label="Closing Date" value={fmtDate(str(data.closingDate))} />
            <InfoRow
              label="Represented Side"
              value={str(data.representedSide)}
            />
          </PanelSection>

          {/* 3. Landlord / Billing */}
          <PanelSection title="Client / Billing" icon={Briefcase}>
            <InfoRow label="Client Name" value={str(data.clientName)} />
            <InfoRow label="Client Email" value={str(data.clientEmail)} />
            <InfoRow label="Client Phone" value={str(data.clientPhone)} />
          </PanelSection>

          {/* 4. Commission Breakdown */}
          <PanelSection title="Commission Breakdown" icon={Receipt}>
            <InfoRow
              label="Commission Type"
              value={str(data.commissionType) === "percentage" ? "Percentage" : "Flat"}
            />
            {num(data.commissionPct) > 0 && (
              <InfoRow
                label="Commission %"
                value={`${num(data.commissionPct)}%`}
                mono
              />
            )}
            {num(data.commissionFlat) > 0 && (
              <InfoRow
                label="Commission Flat"
                value={fmtFull(num(data.commissionFlat))}
                mono
              />
            )}
            <InfoRow
              label="Total Commission"
              value={fmtFull(num(data.totalCommission))}
              mono
            />
            <InfoRow
              label="Agent Split"
              value={`${num(data.agentSplitPct)}%`}
              mono
            />
            <InfoRow
              label="House Split"
              value={`${num(data.houseSplitPct)}%`}
              mono
            />
            <div className="mt-2 pt-2 border-t border-gray-100">
              <InfoRow
                label="Your Payout"
                value={
                  <span className="text-green-700 font-semibold">
                    {fmtFull(num(data.agentPayout))}
                  </span>
                }
              />
              <InfoRow
                label="House Payout"
                value={fmtFull(num(data.housePayout))}
                mono
              />
            </div>
          </PanelSection>

          {/* 5. Co-Broker */}
          <PanelSection title="Co-Broker" icon={Users} defaultOpen={false}>
            <InfoRow label="Co-Broke Agent" value={str(data.coBrokeAgent)} />
            <InfoRow
              label="Co-Broke Brokerage"
              value={str(data.coBrokeBrokerage)}
            />
            {Array.isArray(data.coAgents) &&
              (data.coAgents as Record<string, unknown>[]).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Co-Agents
                  </p>
                  {(data.coAgents as Record<string, unknown>[]).map(
                    (ca, i) => (
                      <div
                        key={i}
                        className="text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0"
                      >
                        {str(ca.name)} &mdash; {str(ca.email)} ({str(ca.role)},{" "}
                        {num(ca.splitPct)}%)
                      </div>
                    )
                  )}
                </div>
              )}
          </PanelSection>

          {/* 6. Documents */}
          <PanelSection title="Documents" icon={Paperclip}>
            {existingDocs.length > 0 ? (
              <div className="space-y-2">
                {existingDocs.map((doc) => (
                  <DocFileRow key={doc.id} doc={doc} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No documents uploaded yet.</p>
            )}

            {status === "submitted" && (
              <MissingDocUploader
                submissionId={str(data.id)}
                existingDocs={existingDocs}
                onUploaded={() => setDocRefresh((p) => p + 1)}
              />
            )}
          </PanelSection>

          {/* 7. Notes */}
          <PanelSection title="Notes" icon={StickyNote} defaultOpen={false}>
            {str(data.notes) ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {str(data.notes)}
              </p>
            ) : (
              <p className="text-sm text-gray-400">No notes.</p>
            )}
          </PanelSection>
        </div>
      </div>
    </>
  );
}

// ── Doc File Row (with signed URL viewer) ─────────────────────

function DocFileRow({ doc }: { doc: { id: string; fileName: string } }) {
  const [loading, setLoading] = useState(false);

  async function handleView() {
    setLoading(true);
    try {
      const result = await getSignedUrl(doc.id);
      if (result.url) {
        window.open(result.url, "_blank");
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
        <span className="text-sm text-gray-700 truncate">{doc.fileName}</span>
      </div>
      <button
        onClick={handleView}
        disabled={loading}
        className="p-1 hover:bg-gray-200 rounded transition-colors shrink-0"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
        ) : (
          <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>
    </div>
  );
}

// ── Agent Action Bar ──────────────────────────────────────────

function AgentActionBar({
  status,
  agentPayout,
  rejectionReason,
  submissionId,
  existingDocs,
  onDocUploaded,
}: {
  status: string;
  agentPayout: number;
  rejectionReason: string;
  submissionId: string;
  existingDocs: { id: string; fileName: string }[];
  onDocUploaded: () => void;
}) {
  if (status === "submitted" || status === "under_review") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
          <Clock className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700">
            Waiting for review
          </span>
        </div>
        <MissingDocUploader
          submissionId={submissionId}
          existingDocs={existingDocs}
          onUploaded={onDocUploaded}
        />
      </div>
    );
  }

  if (status === "approved") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <span className="text-sm font-medium text-green-700">Approved</span>
      </div>
    );
  }

  if (status === "invoiced") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg">
        <Receipt className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-medium text-purple-700">
          Invoice Created
        </span>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg">
        <DollarSign className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-700">
          Paid &mdash; {fmtFull(agentPayout)}
        </span>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="bg-red-50 border border-red-100 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm font-medium text-red-700">Rejected</span>
        </div>
        {rejectionReason && (
          <p className="text-xs text-red-600 ml-6">{rejectionReason}</p>
        )}
      </div>
    );
  }

  return null;
}

// ── Main Component ────────────────────────────────────────────

export default function MyDealsView({
  initialSubmissions,
  showSuccessBanner,
}: MyDealsViewProps) {
  const [submissions] = useState(initialSubmissions);
  const [banner, setBanner] = useState(showSuccessBanner);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [search, setSearch] = useState("");

  // ── Auto-dismiss banner ─────────────────────────────────────

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => {
      setBanner(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [banner]);

  // Remove ?submitted=1 from URL
  useEffect(() => {
    if (showSuccessBanner) {
      const url = new URL(window.location.href);
      url.searchParams.delete("submitted");
      window.history.replaceState({}, "", url.toString());
    }
  }, [showSuccessBanner]);

  // ── Computed stats ──────────────────────────────────────────

  const activeStatuses = new Set(["submitted", "under_review", "approved", "invoiced"]);
  const activeDeals = submissions.filter((s) =>
    activeStatuses.has(str(s.status))
  ).length;

  const pendingPayout = submissions
    .filter((s) => {
      const st = str(s.status);
      return st === "approved" || st === "invoiced";
    })
    .reduce((sum, s) => sum + num(s.agentPayout), 0);

  const totalEarned = submissions
    .filter((s) => str(s.status) === "paid")
    .reduce((sum, s) => sum + num(s.agentPayout), 0);

  // ── Pipeline counts ─────────────────────────────────────────

  const statusCounts: Record<string, number> = {};
  for (const s of submissions) {
    const st = str(s.status);
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }
  // Merge under_review into submitted count for the pipeline display
  const pipelineCounts = {
    submitted: (statusCounts["submitted"] || 0) + (statusCounts["under_review"] || 0),
    approved: statusCounts["approved"] || 0,
    invoiced: statusCounts["invoiced"] || 0,
    paid: statusCounts["paid"] || 0,
  };
  const rejectedCount = statusCounts["rejected"] || 0;

  // ── Filter + sort ───────────────────────────────────────────

  const filtered = submissions
    .filter((s) => {
      // Pipeline filter
      if (pipelineFilter) {
        const st = str(s.status);
        if (pipelineFilter === "submitted") {
          if (st !== "submitted" && st !== "under_review") return false;
        } else if (st !== pipelineFilter) {
          return false;
        }
      }

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const searchable = [
          str(s.propertyAddress),
          str(s.unit),
          str(s.clientName),
          str(s.dealType),
        ]
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return (
            new Date(str(b.createdAt)).getTime() -
            new Date(str(a.createdAt)).getTime()
          );
        case "oldest":
          return (
            new Date(str(a.createdAt)).getTime() -
            new Date(str(b.createdAt)).getTime()
          );
        case "commission":
          return num(b.totalCommission) - num(a.totalCommission);
        case "status":
          return (
            (STATUS_ORDER[str(a.status)] ?? 99) -
            (STATUS_ORDER[str(b.status)] ?? 99)
          );
        default:
          return 0;
      }
    });

  const clearFilters = useCallback(() => {
    setPipelineFilter(null);
    setSearch("");
    setSortBy("newest");
  }, []);

  const hasActiveFilters = pipelineFilter !== null || search.trim() !== "" || sortBy !== "newest";

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      {/* Success banner */}
      {banner && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3 animate-[fade-in_0.3s_ease-out]">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800 flex-1">
            Deal submitted successfully! Your brokerage will review it shortly.
          </p>
          <button
            onClick={() => setBanner(false)}
            className="p-1 hover:bg-green-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-green-600" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Deals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track your submissions, payouts, and deal progress
          </p>
        </div>
        <Link
          href="/brokerage/my-deals/submit"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <ArrowUpRight className="w-4 h-4" />
          Submit a Deal
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Active deals */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Briefcase className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Active Deals</span>
          </div>
          <p className="text-2xl font-bold text-gray-900 ml-10">
            {activeDeals}
          </p>
        </div>

        {/* Pending payout */}
        <div
          className={`rounded-xl border p-4 ${
            pendingPayout > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                pendingPayout > 0 ? "bg-amber-100" : "bg-gray-50"
              }`}
            >
              <Clock
                className={`w-4 h-4 ${
                  pendingPayout > 0 ? "text-amber-600" : "text-gray-400"
                }`}
              />
            </div>
            <span
              className={`text-sm ${
                pendingPayout > 0 ? "text-amber-700" : "text-gray-500"
              }`}
            >
              Pending Payout
            </span>
          </div>
          <p
            className={`text-2xl font-bold ml-10 ${
              pendingPayout > 0 ? "text-amber-800" : "text-gray-900"
            }`}
          >
            {fmt(pendingPayout)}
          </p>
        </div>

        {/* Total earned */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Total Earned</span>
          </div>
          <p className="text-2xl font-bold text-green-700 ml-10">
            {fmt(totalEarned)}
          </p>
        </div>
      </div>

      {/* Pipeline tracker */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex items-center flex-wrap gap-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const count = pipelineCounts[stage.key as keyof typeof pipelineCounts] || 0;
            const isActive = pipelineFilter === stage.key;

            return (
              <div key={stage.key} className="flex items-center gap-2">
                {i > 0 && (
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                )}
                <button
                  onClick={() =>
                    setPipelineFilter(isActive ? null : stage.key)
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {stage.label}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              </div>
            );
          })}

          {/* Separated rejected pill */}
          <div className="ml-auto">
            <button
              onClick={() =>
                setPipelineFilter(
                  pipelineFilter === "rejected" ? null : "rejected"
                )
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                pipelineFilter === "rejected"
                  ? "bg-red-600 text-white"
                  : "bg-red-50 text-red-600 hover:bg-red-100"
              }`}
            >
              Rejected
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  pipelineFilter === "rejected"
                    ? "bg-red-500 text-white"
                    : "bg-red-100 text-red-500"
                }`}
              >
                {rejectedCount}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter / sort bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by address, client, or deal type..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Deal cards */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <DealCard
              key={str(s.id)}
              submission={s}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        /* Empty state — no deals at all */
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No deals yet
          </h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
            Submit your first deal to start tracking commissions and payouts.
          </p>
          <Link
            href="/brokerage/my-deals/submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <ArrowUpRight className="w-4 h-4" />
            Submit a Deal
          </Link>
        </div>
      ) : (
        /* Empty state — filters returned no results */
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
          <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">
            No matching deals
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Try adjusting your filters or search terms.
          </p>
          <button
            onClick={clearFilters}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Detail slide-over panel */}
      {selectedId && (
        <AgentDetailPanel
          submissionId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
