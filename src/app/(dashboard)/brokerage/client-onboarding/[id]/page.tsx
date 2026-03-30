"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Copy,
  RotateCw,
  XCircle,
  Receipt,
  User,
  Mail,
  Phone,
  AlertTriangle,
  ExternalLink,
  Loader2,
  X,
  Shield,
} from "lucide-react";
import { getOnboarding, voidOnboarding, resendOnboarding, generateInvoiceFromOnboarding } from "../actions";
import {
  ONBOARDING_STATUS_LABELS,
  ONBOARDING_STATUS_COLORS,
  DOC_TYPE_LABELS,
  SIGNING_STATUS_COLORS,
} from "@/lib/onboarding-types";
import type { OnboardingStatusType, SigningStatusType } from "@/lib/onboarding-types";

// ── Types ────────────────────────────────────────────────────

interface DocRecord {
  id: string;
  docType: string;
  title: string;
  status: SigningStatusType;
  signedAt: string | null;
  pdfUrl: string | null;
  sortOrder: number;
  auditLogs?: Array<{ id: string; action: string; actorType: string; actorName: string | null; ipAddress: string | null; createdAt: string }>;
}

interface OnboardingDetail {
  id: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string | null;
  status: OnboardingStatusType;
  token: string;
  expiresAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  commissionPct: number | null;
  monthlyRent: number | null;
  notes: string | null;
  dealType: string | null;
  propertyAddress: string | null;
  exclusiveType: string | null;
  contactId: string | null;
  createdAt: string;
  agent?: { id: string; firstName: string; lastName: string; email: string; phone: string | null; licenseNumber: string | null };
  documents?: DocRecord[];
  auditLogs?: Array<{ id: string; action: string; actorType: string; actorName: string | null; ipAddress: string | null; userAgent: string | null; createdAt: string; metadata: Record<string, unknown> | null }>;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-slate-400" />,
  viewed: <Eye className="w-4 h-4 text-blue-500" />,
  signed: <CheckCircle className="w-4 h-4 text-green-500" />,
};

// ── Component ────────────────────────────────────────────────

export default function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<OnboardingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ propertyAddress: "", unit: "", monthlyRent: "", leaseStartDate: "", leaseEndDate: "", closingDate: "" });
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const result = await getOnboarding(id);
      if (result.success && result.data) {
        setData(result.data as unknown as OnboardingDetail);
      } else {
        setError(result.error ?? "Not found");
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/sign/${data?.token}`);
    setSuccess("Signing link copied");
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleResend = async () => {
    setProcessing(true);
    const result = await resendOnboarding(id);
    if (result.success) {
      setSuccess("Invite resent");
      const refresh = await getOnboarding(id);
      if (refresh.success && refresh.data) setData(refresh.data as unknown as OnboardingDetail);
    } else setError(result.error ?? "Failed");
    setProcessing(false);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleVoid = async () => {
    setProcessing(true);
    const result = await voidOnboarding(id, voidReason || undefined);
    if (result.success) {
      setSuccess("Onboarding voided");
      setShowVoidConfirm(false);
      const refresh = await getOnboarding(id);
      if (refresh.success && refresh.data) setData(refresh.data as unknown as OnboardingDetail);
    } else setError(result.error ?? "Failed");
    setProcessing(false);
    setTimeout(() => setSuccess(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-slate-600">{error || "Onboarding not found"}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600 hover:text-blue-700">Go back</button>
      </div>
    );
  }

  const isVoided = data.status === "voided";
  const isExpired = data.status === "expired";
  const isCompleted = data.status === "completed";
  const canResend = ["pending", "partially_signed"].includes(data.status);
  const canVoid = ["draft", "pending", "partially_signed"].includes(data.status);

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
          <button onClick={() => router.push("/brokerage/client-onboarding")} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
            <ArrowLeft className="w-4 h-4" /> Client Onboarding
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{data.clientFirstName} {data.clientLastName}</h1>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${ONBOARDING_STATUS_COLORS[data.status]}`}>
                {ONBOARDING_STATUS_LABELS[data.status]}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Banners */}
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            <CheckCircle className="w-4 h-4" /> {success}
            <button onClick={() => setSuccess(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {isVoided && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4" /> This onboarding has been voided.
          </div>
        )}
        {isExpired && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
            <Clock className="w-4 h-4" /> This onboarding has expired.
          </div>
        )}
        {isCompleted && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> All documents signed. Completed {fmtDate(data.completedAt)}.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Client + Documents */}
          <div className="lg:col-span-2 space-y-6">
            {/* Client Info */}
            <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Client Information</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" /> {data.clientFirstName} {data.clientLastName}</div>
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400" /> {data.clientEmail}</div>
                {data.clientPhone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /> {data.clientPhone}</div>}
                {data.commissionPct != null && <div className="flex items-center gap-2"><Receipt className="w-4 h-4 text-slate-400" /> {Number(data.commissionPct)}% commission</div>}
              </div>
              {data.agent && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  Agent: {data.agent.firstName} {data.agent.lastName} ({data.agent.email})
                  {data.agent.licenseNumber && ` • License #${data.agent.licenseNumber}`}
                </div>
              )}
            </section>

            {/* Documents */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Documents</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {data.documents?.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 px-5 py-4">
                    {STATUS_ICON[doc.status] ?? <FileText className="w-4 h-4 text-slate-300" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">{doc.title}</div>
                      <div className="text-xs text-slate-400">
                        {doc.status === "signed" ? `Signed ${fmtDate(doc.signedAt)}` : doc.status === "viewed" ? "Viewed" : "Awaiting signature"}
                      </div>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${SIGNING_STATUS_COLORS[doc.status]}`}>
                      {doc.status}
                    </span>
                    {doc.status === "signed" && doc.pdfUrl && (
                      <a href={doc.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> View PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Audit Trail */}
            {data.auditLogs && data.auditLogs.length > 0 && (
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Signing Audit Trail
                  </h2>
                </div>
                <div className="px-5 py-4 space-y-4">
                  {data.auditLogs.map((log) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-slate-300 mt-1.5" />
                      <div className="min-w-0">
                        <div className="text-sm text-slate-700">
                          <span className="font-medium capitalize">{log.action}</span>
                          {log.actorName && <span className="text-slate-500"> by {log.actorName}</span>}
                          {log.actorType === "system" && <span className="text-slate-400"> (system)</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                          {fmtDate(log.createdAt)}
                          {log.ipAddress && log.ipAddress !== "unknown" && ` • IP: ${log.ipAddress}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right: Actions */}
          <div className="space-y-4">
            <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Actions</h2>

              <button onClick={handleCopyLink} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <Copy className="w-4 h-4" /> Copy Signing Link
              </button>

              {canResend && (
                <button onClick={handleResend} disabled={processing} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50">
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                  Resend Invite
                </button>
              )}

              {isCompleted && (
                <button
                  onClick={() => setShowInvoiceModal(true)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
                >
                  <Receipt className="w-4 h-4" /> Generate Invoice
                </button>
              )}

              {data.contactId && (
                <Link
                  href={`/contacts/${data.contactId}`}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User className="w-4 h-4" /> View Contact
                </Link>
              )}

              {canVoid && (
                <button onClick={() => setShowVoidConfirm(true)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                  <XCircle className="w-4 h-4" /> Void Onboarding
                </button>
              )}
            </section>

            {/* Meta info */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-xs text-slate-500 space-y-1">
              <div>Created: {fmtDate(data.createdAt)}</div>
              <div>Sent: {fmtDate(data.sentAt)}</div>
              <div>Expires: {fmtDate(data.expiresAt)}</div>
              {data.completedAt && <div>Completed: {fmtDate(data.completedAt)}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Void Confirmation Modal */}
      {showVoidConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" style={{ animation: "modal-in 0.2s ease-out" }}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Void Onboarding</h3>
            <p className="text-sm text-slate-500 mb-4">
              This will cancel the signing invitation for {data.clientFirstName} {data.clientLastName}. This action cannot be undone.
            </p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowVoidConfirm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button onClick={handleVoid} disabled={processing} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg px-4 py-2">
                {processing && <Loader2 className="w-4 h-4 animate-spin" />} Void
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Invoice Modal */}
      {showInvoiceModal && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" style={{ animation: "modal-in 0.2s ease-out" }}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Generate Invoice</h3>
            <p className="text-sm text-slate-500 mb-4">
              Enter the lease details for {data.clientFirstName} {data.clientLastName} to create a deal submission and invoice.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Property Address *</label>
                <input type="text" value={invoiceForm.propertyAddress} onChange={(e) => setInvoiceForm((f) => ({ ...f, propertyAddress: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="123 Main St, New York, NY" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit #</label>
                  <input type="text" value={invoiceForm.unit} onChange={(e) => setInvoiceForm((f) => ({ ...f, unit: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="4B" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Rent *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <input type="text" inputMode="decimal" value={invoiceForm.monthlyRent} onChange={(e) => setInvoiceForm((f) => ({ ...f, monthlyRent: e.target.value.replace(/[^0-9.]/g, "") }))} className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="3,500" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lease Start *</label>
                  <input type="date" value={invoiceForm.leaseStartDate} onChange={(e) => setInvoiceForm((f) => ({ ...f, leaseStartDate: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lease End *</label>
                  <input type="date" value={invoiceForm.leaseEndDate} onChange={(e) => setInvoiceForm((f) => ({ ...f, leaseEndDate: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Closing / Move-in Date</label>
                <input type="date" value={invoiceForm.closingDate} onChange={(e) => setInvoiceForm((f) => ({ ...f, closingDate: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowInvoiceModal(false)} disabled={invoiceSubmitting} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={async () => {
                  if (!invoiceForm.propertyAddress.trim() || !invoiceForm.monthlyRent || !invoiceForm.leaseStartDate || !invoiceForm.leaseEndDate) {
                    setError("Please fill in all required fields");
                    return;
                  }
                  setInvoiceSubmitting(true);
                  const result = await generateInvoiceFromOnboarding(id, {
                    propertyAddress: invoiceForm.propertyAddress.trim(),
                    unit: invoiceForm.unit.trim() || undefined,
                    monthlyRent: parseFloat(invoiceForm.monthlyRent) || 0,
                    leaseStartDate: invoiceForm.leaseStartDate || undefined,
                    leaseEndDate: invoiceForm.leaseEndDate || undefined,
                    closingDate: invoiceForm.closingDate || undefined,
                  });
                  setInvoiceSubmitting(false);
                  if (result.success) {
                    router.push("/brokerage/invoices?created=1");
                  } else {
                    setError(result.error ?? "Failed to generate invoice");
                    setShowInvoiceModal(false);
                  }
                }}
                disabled={invoiceSubmitting}
                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                {invoiceSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Generate Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
