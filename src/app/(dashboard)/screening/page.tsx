"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { listApplications, getScreeningStats, sendInvite, withdrawApplication } from "./actions";
import type { ScreeningListItem, ScreeningStats } from "./actions";
import StatusBadge from "@/components/screening/StatusBadge";
import RiskScoreBadge from "@/components/screening/RiskScoreBadge";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "invited", label: "Invited" },
  { key: "in_progress", label: "In Progress" },
  { key: "processing", label: "Processing" },
  { key: "complete", label: "Complete" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ScreeningListPage() {
  const pathname = usePathname();
  const [items, setItems] = useState<ScreeningListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<ScreeningStats | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const limit = 25;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [result, statsResult] = await Promise.all([
        listApplications({ status: statusFilter, page, limit }),
        getScreeningStats(),
      ]);
      setItems(result.items);
      setTotal(result.total);
      setStats(statsResult);
    } catch (e) {
      console.error("Failed to load screenings:", e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSendInvite = async (id: string) => {
    setActionMenu(null);
    const result = await sendInvite(id, "email");
    if (result.success) {
      setSuccess("Invite sent successfully");
      setTimeout(() => setSuccess(null), 3000);
      loadData();
    }
  };

  const handleWithdraw = async (id: string) => {
    setActionMenu(null);
    if (!confirm("Withdraw this screening application?")) return;
    const result = await withdrawApplication(id);
    if (result.success) {
      setSuccess("Application withdrawn");
      setTimeout(() => setSuccess(null), 3000);
      loadData();
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tenant Screening</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage screening applications and review results</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/screening/billing"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Billing
          </Link>
          <Link
            href="/screening/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + New Screening
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-slate-900" },
            { label: "Pending", value: stats.pending, color: "text-amber-600" },
            { label: "Processing", value: stats.processing, color: "text-blue-600" },
            { label: "Complete", value: stats.complete, color: "text-emerald-600" },
            { label: "Approved", value: stats.approved, color: "text-green-600" },
            { label: "Denied", value: stats.denied, color: "text-red-600" },
            { label: "Avg Score", value: stats.avgScore != null ? Math.round(stats.avgScore) : "—", color: "text-slate-900" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg border border-slate-200 p-3 text-center">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-slate-500 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Success Toast */}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2">
          {success}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.key
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Application List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          /* Skeleton Shimmer */
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
                <div className="h-5 bg-slate-100 rounded-full w-16" />
                <div className="hidden md:block h-5 bg-slate-100 rounded w-10" />
                <div className="hidden md:block h-3 bg-slate-100 rounded w-20" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm">No screening applications found</p>
            <Link href="/screening/new" className="text-blue-600 text-sm font-medium mt-2 inline-block hover:underline">
              Create your first screening
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-100">
              {items.map((item) => (
                <Link key={item.id} href={`/screening/${item.id}`} className="block p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {item.propertyAddress}
                        {item.unitNumber && <span className="text-slate-400"> #{item.unitNumber}</span>}
                      </p>
                      {item.primaryApplicant && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.primaryApplicant.firstName} {item.primaryApplicant.lastName}
                          {item.applicantCount > 1 && ` (+${item.applicantCount - 1})`}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">{fmtDate(item.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <StatusBadge status={item.status} />
                      <RiskScoreBadge score={item.riskScore} recommendation={item.recommendation} size="sm" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Property</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Applicant</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Score</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Tier</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-500">Created</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/screening/${item.id}`} className="text-slate-900 font-medium hover:text-blue-600 transition-colors">
                          {item.propertyAddress}
                        </Link>
                        {item.unitNumber && <span className="text-slate-400 ml-1">#{item.unitNumber}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {item.primaryApplicant ? (
                          <div>
                            <p className="text-slate-700">{item.primaryApplicant.firstName} {item.primaryApplicant.lastName}</p>
                            <p className="text-xs text-slate-400">{item.primaryApplicant.email}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {item.applicantCount > 1 && (
                          <span className="text-xs text-slate-400 ml-1">(+{item.applicantCount - 1})</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                      <td className="px-4 py-3"><RiskScoreBadge score={item.riskScore} recommendation={item.recommendation} size="sm" /></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          item.tier === "enhanced" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"
                        }`}>
                          {item.tier === "enhanced" ? "Enhanced" : "Base"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(item.createdAt)}</td>
                      <td className="px-4 py-3 text-right relative">
                        <button
                          onClick={() => setActionMenu(actionMenu === item.id ? null : item.id)}
                          className="text-slate-400 hover:text-slate-600 text-lg px-2"
                        >
                          ⋯
                        </button>
                        {actionMenu === item.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />
                            <div className="absolute right-4 top-10 z-20 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[150px]">
                              <Link
                                href={`/screening/${item.id}`}
                                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                onClick={() => setActionMenu(null)}
                              >
                                View Details
                              </Link>
                              {item.status === "draft" && (
                                <button
                                  onClick={() => handleSendInvite(item.id)}
                                  className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Send Invite
                                </button>
                              )}
                              {!["approved", "denied", "withdrawn"].includes(item.status) && (
                                <button
                                  onClick={() => handleWithdraw(item.id)}
                                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Withdraw
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500">Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}</p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
