"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  UserPlus,
  Search,
  Copy,
  RotateCw,
  XCircle,
  ExternalLink,
  MoreHorizontal,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Archive,
} from "lucide-react";
import { getOnboardings, voidOnboarding, resendOnboarding, deleteOnboarding, archiveOnboarding } from "./actions";
import {
  ONBOARDING_STATUS_LABELS,
  ONBOARDING_STATUS_COLORS,
} from "@/lib/onboarding-types";
import type { OnboardingStatusType } from "@/lib/onboarding-types";

// ── Types ────────────────────────────────────────────────────

interface OnboardingRow {
  id: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  status: OnboardingStatusType;
  token: string;
  sentAt: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  commissionPct: number | null;
  commissionFlat: number | null;
  monthlyRent: number | null;
  createdAt: string;
  agent?: { id: string; firstName: string; lastName: string; email: string };
  _documentSummary?: { total: number; signed: number; pending: number };
}

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "partially_signed", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
  { value: "voided", label: "Voided" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Component ────────────────────────────────────────────────

export default function OnboardingListPage() {
  const [onboardings, setOnboardings] = useState<OnboardingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const limit = 25;
  const totalPages = Math.ceil(total / limit);

  // Close menu on click outside
  useEffect(() => {
    if (!actionMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [actionMenu]);

  const fetchData = useCallback(async (p: number, status: string) => {
    setLoading(true);
    try {
      const result = await getOnboardings({ page: p, limit, status: status || undefined });
      if (result.success) {
        setOnboardings((result.data ?? []) as unknown as OnboardingRow[]);
        setTotal(result.total ?? 0);
      }
    } catch {
      setError("Failed to load onboardings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(1, statusFilter); }, [statusFilter, fetchData]);

  const handleCopyLink = (token: string) => {
    const url = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(url);
    setSuccess("Signing link copied to clipboard");
    setActionMenu(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleResend = async (id: string) => {
    setProcessing(id);
    setActionMenu(null);
    const result = await resendOnboarding(id);
    if (result.success) {
      setSuccess("Invite resent");
      await fetchData(page, statusFilter);
    } else {
      setError(result.error ?? "Failed to resend");
    }
    setProcessing(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleVoid = async (id: string) => {
    if (!confirm("Are you sure you want to void this onboarding?")) return;
    setProcessing(id);
    setActionMenu(null);
    const result = await voidOnboarding(id);
    if (result.success) {
      setSuccess("Onboarding voided");
      await fetchData(page, statusFilter);
    } else {
      setError(result.error ?? "Failed to void");
    }
    setProcessing(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to permanently delete this onboarding? This cannot be undone.")) return;
    setProcessing(id);
    setActionMenu(null);
    const result = await deleteOnboarding(id);
    if (result.success) {
      setSuccess("Onboarding deleted");
      await fetchData(page, statusFilter);
    } else {
      setError(result.error ?? "Failed to delete");
    }
    setProcessing(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Archive this onboarding?")) return;
    setProcessing(id);
    setActionMenu(null);
    const result = await archiveOnboarding(id);
    if (result.success) {
      setSuccess("Onboarding archived");
      await fetchData(page, statusFilter);
    } else {
      setError(result.error ?? "Failed to archive");
    }
    setProcessing(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Action menu items for a given onboarding
  const renderActionItems = (o: OnboardingRow) => (
    <>
      <Link href={`/brokerage/client-onboarding/${o.id}`} className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100">
        <FileText className="w-4 h-4" /> View Details
      </Link>
      <button onClick={() => handleCopyLink(o.token)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100">
        <Copy className="w-4 h-4" /> Copy Link
      </button>
      {["pending", "partially_signed"].includes(o.status) && (
        <button onClick={() => handleResend(o.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100">
          <RotateCw className="w-4 h-4" /> Resend
        </button>
      )}
      {!["completed", "voided", "expired"].includes(o.status) && (
        <button onClick={() => handleVoid(o.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 active:bg-red-100">
          <XCircle className="w-4 h-4" /> Void
        </button>
      )}
      {["completed", "voided", "expired"].includes(o.status) && (
        <button onClick={() => handleArchive(o.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100">
          <Archive className="w-4 h-4" /> Archive
        </button>
      )}
      <div className="border-t border-slate-100 my-1" />
      <button onClick={() => handleDelete(o.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 active:bg-red-100">
        <Trash2 className="w-4 h-4" /> Delete
      </button>
    </>
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-semibold text-slate-900 truncate">Client Onboarding</h1>
          <Link
            href="/brokerage/client-onboarding/new"
            className="inline-flex items-center gap-1.5 sm:gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg px-3 sm:px-4 py-2 transition-colors flex-shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">New Client Onboarding</span>
            <span className="sm:hidden">New</span>
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-3 sm:space-y-4">
        {/* Toasts */}
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 sm:px-4 py-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> <span className="flex-1">{success}</span>
            <button onClick={() => setSuccess(null)} className="p-1"><X className="w-4 h-4" /></button>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 sm:px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="p-1"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Status tabs — horizontally scrollable on mobile */}
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setStatusFilter(tab.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  statusFilter === tab.value
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-full" />
          </div>
        )}

        {/* Content */}
        {!loading && onboardings.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 py-12 sm:py-16 text-center">
            <UserPlus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-slate-900 mb-1">No client onboardings yet</h3>
            <p className="text-sm text-slate-500 mb-4">Invite your first client to get started.</p>
            <Link
              href="/brokerage/client-onboarding/new"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              New Client Onboarding
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile: Card layout */}
            <div className="sm:hidden space-y-3">
              {onboardings.map((o) => (
                <div key={o.id} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/brokerage/client-onboarding/${o.id}`} className="font-medium text-slate-900 hover:text-blue-600 text-sm block truncate">
                        {o.clientFirstName} {o.clientLastName}
                      </Link>
                      <div className="text-xs text-slate-500 truncate">{o.clientEmail}</div>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${ONBOARDING_STATUS_COLORS[o.status]}`}>
                      {ONBOARDING_STATUS_LABELS[o.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                    {(o.commissionFlat != null || o.commissionPct != null) && (
                      <span>{o.commissionFlat != null ? `$${Number(o.commissionFlat).toLocaleString()}` : `${Number(o.commissionPct)}%`}</span>
                    )}
                    {o._documentSummary && <span>{o._documentSummary.signed}/{o._documentSummary.total} docs</span>}
                    <span>Sent {fmtDateShort(o.sentAt)}</span>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-2">
                    <Link href={`/brokerage/client-onboarding/${o.id}`} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 active:bg-slate-300">
                      <FileText className="w-3.5 h-3.5" /> View
                    </Link>
                    <button onClick={() => handleCopyLink(o.token)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 active:bg-slate-300">
                      <Copy className="w-3.5 h-3.5" /> Copy Link
                    </button>
                    <div ref={actionMenu === o.id ? menuRef : undefined} className="relative">
                      <button
                        onClick={() => setActionMenu(actionMenu === o.id ? null : o.id)}
                        className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200 active:bg-slate-300"
                      >
                        {processing === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                      </button>
                      {actionMenu === o.id && (
                        <div className="absolute right-0 bottom-full mb-1 z-50 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                          {renderActionItems(o)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden sm:block bg-white rounded-lg border border-slate-200 overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-4 py-3 font-medium text-slate-500">Client</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Agent</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Fee</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Sent</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden md:table-cell">Expires</th>
                    <th className="px-4 py-3 font-medium text-slate-500 hidden lg:table-cell">Docs</th>
                    <th className="px-4 py-3 font-medium text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {onboardings.map((o) => (
                    <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/brokerage/client-onboarding/${o.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                          {o.clientFirstName} {o.clientLastName}
                        </Link>
                        <div className="text-xs text-slate-500">{o.clientEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                        {o.agent ? `${o.agent.firstName} ${o.agent.lastName}` : "--"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                        {o.commissionFlat != null
                          ? `$${Number(o.commissionFlat).toLocaleString()}`
                          : o.commissionPct ? `${Number(o.commissionPct)}%` : "--"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ONBOARDING_STATUS_COLORS[o.status]}`}>
                          {ONBOARDING_STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(o.sentAt)}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell whitespace-nowrap">{fmtDate(o.expiresAt)}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {o._documentSummary && (
                          <span className="text-xs text-slate-500">
                            {o._documentSummary.signed}/{o._documentSummary.total} signed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        <div ref={actionMenu === o.id ? menuRef : undefined} className="relative inline-block">
                          <button
                            onClick={() => setActionMenu(actionMenu === o.id ? null : o.id)}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                          >
                            {processing === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                          </button>
                          {actionMenu === o.id && (
                            <div className={`absolute right-0 z-50 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 ${
                              onboardings.indexOf(o) >= onboardings.length - 2 ? "bottom-full mb-1" : "top-full mt-1"
                            }`}>
                              {renderActionItems(o)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm gap-3">
            <span className="text-slate-500 text-xs sm:text-sm">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setPage(page - 1); fetchData(page - 1, statusFilter); }}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Prev</span>
              </button>
              <button
                onClick={() => { setPage(page + 1); fetchData(page + 1, statusFilter); }}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-40 text-sm"
              >
                <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
