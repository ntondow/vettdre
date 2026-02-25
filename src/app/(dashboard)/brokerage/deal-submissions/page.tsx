"use client";

import { useState, useEffect, useRef } from "react";
import {
  getDealSubmissions,
  updateSubmissionStatus,
  deleteSubmission,
  getPublicSubmissionLink,
  createDealSubmission,
} from "./actions";
import { createInvoiceFromSubmission } from "../invoices/actions";
import SubmissionForm from "./submission-form";
import type { SubmissionFormData } from "./submission-form";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  DEAL_TYPE_LABELS,
} from "@/lib/bms-types";
import {
  CheckCircle,
  XCircle,
  FileText,
  Plus,
  Link2,
  Copy,
  Search,
  Trash2,
  ChevronDown,
  X,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "\u2014";
  }
};

const STATUS_TABS = ["all", "submitted", "approved", "invoiced", "paid", "rejected"] as const;

// ── Component ─────────────────────────────────────────────────

export default function DealSubmissionsPage() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [publicLink, setPublicLink] = useState("");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Load data ───────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    try {
      const result = await getDealSubmissions({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search || undefined,
      });
      setSubmissions(result.submissions || []);
      setCounts(result.counts || {});
      setTotal(result.total || 0);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadData(), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Actions ─────────────────────────────────────────────────

  async function handleApprove(id: string) {
    setActionLoading(id);
    await updateSubmissionStatus(id, "approved");
    setActionLoading(null);
    loadData();
  }

  async function handleReject(id: string) {
    setActionLoading(id);
    await updateSubmissionStatus(id, "rejected", rejectReason || undefined);
    setRejectingId(null);
    setRejectReason("");
    setActionLoading(null);
    loadData();
  }

  async function handleGenerateInvoice(id: string) {
    setActionLoading(id);
    const result = await createInvoiceFromSubmission(id);
    setActionLoading(null);
    if (!result.success) {
      alert(result.error || "Failed to generate invoice");
    }
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this submission? This cannot be undone.")) return;
    setActionLoading(id);
    await deleteSubmission(id);
    setActionLoading(null);
    if (expandedId === id) setExpandedId(null);
    loadData();
  }

  async function handleNewSubmit(data: SubmissionFormData) {
    await createDealSubmission({
      agentFirstName: data.agentFirstName,
      agentLastName: data.agentLastName,
      agentEmail: data.agentEmail,
      agentPhone: data.agentPhone || undefined,
      agentLicense: data.agentLicense || undefined,
      propertyAddress: data.propertyAddress,
      unit: data.unit || undefined,
      city: data.city || undefined,
      state: data.state,
      dealType: data.dealType,
      transactionValue: data.transactionValue,
      closingDate: data.closingDate || undefined,
      commissionType: data.commissionType,
      commissionPct: data.commissionPct || undefined,
      commissionFlat: data.commissionFlat || undefined,
      totalCommission: data.totalCommission,
      agentSplitPct: data.agentSplitPct,
      houseSplitPct: data.houseSplitPct,
      agentPayout: data.agentPayout,
      housePayout: data.housePayout,
      clientName: data.clientName || undefined,
      clientEmail: data.clientEmail || undefined,
      clientPhone: data.clientPhone || undefined,
      representedSide: data.representedSide || undefined,
      coBrokeAgent: data.coBrokeAgent || undefined,
      coBrokeBrokerage: data.coBrokeBrokerage || undefined,
      notes: data.notes || undefined,
    });
    setShowNewForm(false);
    loadData();
  }

  async function handleShowPublicLink() {
    const result = await getPublicSubmissionLink();
    if (result.token) {
      setPublicLink(`${window.location.origin}/submit-deal/${result.token}`);
      setShowLinkModal(true);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totalCount = Object.values(counts).reduce((s, c) => s + c, 0);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deal Submissions</h1>
          <p className="text-sm text-slate-500 mt-1">Review and approve agent deal submissions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleShowPublicLink}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Public Link
          </button>
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Submission
          </button>
        </div>
      </div>

      {/* New submission form */}
      {showNewForm && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative">
          <button
            onClick={() => setShowNewForm(false)}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">New Deal Submission</h2>
          <SubmissionForm onSubmit={handleNewSubmit} />
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map(tab => {
          const count = tab === "all" ? totalCount : (counts[tab] || 0);
          const active = statusFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                active ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {tab === "all" ? "All" : SUBMISSION_STATUS_LABELS[tab] || tab}
              <span className={`text-xs ${active ? "text-blue-500" : "text-slate-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by address, agent, or client..."
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && submissions.length === 0 && (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No submissions found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? "Try a different search term" : "Create your first deal submission to get started"}
          </p>
        </div>
      )}

      {/* Submission cards */}
      {!loading && submissions.length > 0 && (
        <div className="space-y-3">
          {submissions.map((s: any) => {
            const isExpanded = expandedId === s.id;
            const isActing = actionLoading === s.id;
            return (
              <div
                key={s.id}
                className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Card header — clickable */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  className="w-full text-left px-5 py-4"
                >
                  {/* Row 1: address + badges */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900 truncate">{s.propertyAddress}</span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${SUBMISSION_STATUS_COLORS[s.status] || "bg-slate-100 text-slate-600"}`}>
                        {SUBMISSION_STATUS_LABELS[s.status] || s.status}
                      </span>
                      {s.submissionSource === "external" && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700">External</span>
                      )}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>

                  {/* Row 2: agent */}
                  <div className="text-sm text-slate-500 mb-2">
                    {s.agentFirstName} {s.agentLastName} &middot; {s.agentEmail}
                  </div>

                  {/* Row 3: stats */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span className="text-slate-600">
                      {DEAL_TYPE_LABELS[s.dealType] || s.dealType} &middot; {fmt(Number(s.transactionValue))}
                    </span>
                    <span className="text-slate-500">
                      Commission: {fmt(Number(s.totalCommission))}
                    </span>
                    <span className="text-green-600 font-medium">
                      Agent: {fmt(Number(s.agentPayout))}
                    </span>
                    <span className="text-blue-600 font-medium">
                      House: {fmt(Number(s.housePayout))}
                    </span>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <span className="text-slate-400 block text-xs">Closing Date</span>
                        <span className="text-slate-700">{s.closingDate ? fmtDate(s.closingDate) : "\u2014"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-xs">Agent Split</span>
                        <span className="text-slate-700">{Number(s.agentSplitPct).toFixed(1)}% / {Number(s.houseSplitPct).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-xs">Submitted</span>
                        <span className="text-slate-700">{fmtDate(s.createdAt)}</span>
                      </div>
                      {s.clientName && (
                        <div>
                          <span className="text-slate-400 block text-xs">Client</span>
                          <span className="text-slate-700">
                            {s.clientName}
                            {s.representedSide ? ` (${s.representedSide})` : ""}
                          </span>
                        </div>
                      )}
                      {s.coBrokeAgent && (
                        <div>
                          <span className="text-slate-400 block text-xs">Co-Broke</span>
                          <span className="text-slate-700">
                            {s.coBrokeAgent}
                            {s.coBrokeBrokerage ? ` — ${s.coBrokeBrokerage}` : ""}
                          </span>
                        </div>
                      )}
                      {s.unit && (
                        <div>
                          <span className="text-slate-400 block text-xs">Unit</span>
                          <span className="text-slate-700">{s.unit}</span>
                        </div>
                      )}
                    </div>

                    {s.notes && (
                      <div className="text-sm">
                        <span className="text-slate-400 text-xs block">Notes</span>
                        <p className="text-slate-600 mt-0.5">{s.notes}</p>
                      </div>
                    )}

                    {s.status === "rejected" && s.rejectionReason && (
                      <div className="text-sm bg-red-50 border border-red-100 rounded-lg p-3">
                        <span className="text-red-500 text-xs font-medium block">Rejection Reason</span>
                        <p className="text-red-700 mt-0.5">{s.rejectionReason}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      {s.status === "submitted" && (
                        <>
                          {rejectingId === s.id ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Reason for rejection..."
                                className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                                autoFocus
                              />
                              <button
                                onClick={() => handleReject(s.id)}
                                disabled={isActing}
                                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleApprove(s.id)}
                                disabled={isActing}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectingId(s.id)}
                                disabled={isActing}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                              >
                                <XCircle className="h-4 w-4" />
                                Reject
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {s.status === "approved" && (
                        <button
                          onClick={() => handleGenerateInvoice(s.id)}
                          disabled={isActing}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                        >
                          <FileText className="h-4 w-4" />
                          Generate Invoice
                        </button>
                      )}

                      {(s.status === "invoiced" || s.status === "paid") && s.invoice && (
                        <span className="text-sm text-purple-600 font-medium">
                          {s.invoice.invoiceNumber}
                        </span>
                      )}

                      <div className="flex-1" />

                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={isActing}
                        className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                        title="Delete submission"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Public link modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Public Submission Link</h3>
              <button onClick={() => setShowLinkModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Share this link with agents so they can submit deals without logging in.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={publicLink}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700"
              />
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
