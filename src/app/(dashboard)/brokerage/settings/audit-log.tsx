"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuditLogs } from "./actions";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  Filter,
  FileText,
  Receipt,
  Users,
  ShieldCheck,
  Settings,
  CreditCard,
  Layers,
  Loader2,
  ExternalLink,
  Inbox,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  orgId: string;
  userId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string } | null;
}

// ── Constants ────────────────────────────────────────────────

const ENTITY_TYPES = [
  { value: "all", label: "All Types", icon: Filter },
  { value: "deal_submission", label: "Submissions", icon: FileText },
  { value: "invoice", label: "Invoices", icon: Receipt },
  { value: "payment", label: "Payments", icon: CreditCard },
  { value: "agent", label: "Agents", icon: Users },
  { value: "commission_plan", label: "Plans", icon: Layers },
  { value: "compliance_doc", label: "Compliance", icon: ShieldCheck },
  { value: "settings", label: "Settings", icon: Settings },
];

const ENTITY_TYPE_LABELS: Record<string, string> = {
  deal_submission: "Submission",
  invoice: "Invoice",
  payment: "Payment",
  agent: "Agent",
  commission_plan: "Plan",
  compliance_doc: "Compliance",
  settings: "Settings",
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  deal_submission: "bg-blue-100 text-blue-700",
  invoice: "bg-emerald-100 text-emerald-700",
  payment: "bg-violet-100 text-violet-700",
  agent: "bg-amber-100 text-amber-700",
  commission_plan: "bg-cyan-100 text-cyan-700",
  compliance_doc: "bg-rose-100 text-rose-700",
  settings: "bg-slate-100 text-slate-700",
};

const ACTION_COLORS: Record<string, string> = {
  created: "text-green-700 bg-green-50",
  approved: "text-green-700 bg-green-50",
  paid: "text-green-700 bg-green-50",
  bulk_paid: "text-green-700 bg-green-50",
  invite_accepted: "text-green-700 bg-green-50",
  reactivated: "text-green-700 bg-green-50",
  updated: "text-blue-700 bg-blue-50",
  role_updated: "text-blue-700 bg-blue-50",
  settings_updated: "text-blue-700 bg-blue-50",
  assigned_agents: "text-blue-700 bg-blue-50",
  sent: "text-blue-700 bg-blue-50",
  submitted: "text-blue-700 bg-blue-50",
  rejected: "text-red-700 bg-red-50",
  deleted: "text-red-700 bg-red-50",
  voided: "text-red-700 bg-red-50",
  void: "text-red-700 bg-red-50",
  deactivated: "text-red-700 bg-red-50",
  invite_revoked: "text-red-700 bg-red-50",
  invited: "text-amber-700 bg-amber-50",
  bulk_approved: "text-green-700 bg-green-50",
  bulk_rejected: "text-red-700 bg-red-50",
  bulk_submitted: "text-blue-700 bg-blue-50",
};

const ROLE_LABELS: Record<string, string> = {
  brokerage_admin: "Admin",
  broker: "Broker",
  manager: "Manager",
  agent: "Agent",
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  brokerage_admin: "bg-purple-100 text-purple-700",
  broker: "bg-blue-100 text-blue-700",
  manager: "bg-teal-100 text-teal-700",
  agent: "bg-slate-100 text-slate-600",
};

const ENTITY_ROUTES: Record<string, string> = {
  deal_submission: "/brokerage/deal-submissions",
  invoice: "/brokerage/invoices",
  agent: "/brokerage/agents",
  commission_plan: "/brokerage/commission-plans",
  compliance_doc: "/brokerage/compliance",
  payment: "/brokerage/payments",
  settings: "/brokerage/settings",
};

// ── Helpers ──────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function fullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAction(action: string): string {
  return action
    .replace(/^bulk_/, "bulk ")
    .replace(/_/g, " ");
}

function buildDescription(log: AuditLogEntry): string {
  const actorName = log.actorName || log.user?.fullName || log.user?.email || "System";
  const details = log.details as Record<string, unknown> | null;
  const action = log.action;
  const entityLabel = ENTITY_TYPE_LABELS[log.entityType] || log.entityType;

  // Build entity description from details
  let entityDesc = "";
  if (details) {
    if (details.propertyAddress) entityDesc = ` for ${details.propertyAddress}`;
    else if (details.invoiceNumber) entityDesc = ` ${details.invoiceNumber}`;
    else if (details.agentName) entityDesc = ` ${details.agentName}`;
    else if (details.planName) entityDesc = ` "${details.planName}"`;
    else if (details.title) entityDesc = ` "${details.title}"`;
    else if (details.docType) entityDesc = ` (${String(details.docType).replace(/_/g, " ")})`;
  }

  // Special cases for human-readable descriptions
  if (action === "role_updated" && details?.previousRole && details?.newRole) {
    const prev = ROLE_LABELS[details.previousRole as string] || details.previousRole;
    const next = ROLE_LABELS[details.newRole as string] || details.newRole;
    return `${actorName} changed role of${entityDesc} from ${prev} to ${next}`;
  }

  if (action === "settings_updated" && details?.updatedFields) {
    const fields = details.updatedFields as string[];
    return `${actorName} updated brokerage settings (${fields.length} field${fields.length === 1 ? "" : "s"})`;
  }

  if (action === "assigned_agents" && details?.agentCount != null) {
    return `${actorName} assigned ${details.agentCount} agent(s) to plan${entityDesc}`;
  }

  if (action === "invite_accepted") {
    return `${entityDesc.trim() || "Agent"} accepted invitation and linked account`;
  }

  if (action === "invited" && details?.inviteEmail) {
    return `${actorName} invited${entityDesc} (${details.inviteEmail})`;
  }

  if (action === "invite_revoked") {
    return `${actorName} revoked invitation for${entityDesc}`;
  }

  if (action.startsWith("bulk_")) {
    const verb = action.replace("bulk_", "");
    return `${actorName} bulk ${verb} ${entityLabel.toLowerCase()}`;
  }

  // Status changes with previous status
  if (details?.previousStatus) {
    return `${actorName} ${formatAction(action)} ${entityLabel.toLowerCase()}${entityDesc} (was ${details.previousStatus})`;
  }

  return `${actorName} ${formatAction(action)} ${entityLabel.toLowerCase()}${entityDesc}`;
}

// ── Component ────────────────────────────────────────────────

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [entityType, setEntityType] = useState("all");
  const [actionSearch, setActionSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const result = await getAuditLogs({
      entityType: entityType !== "all" ? entityType : undefined,
      action: actionSearch.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      page,
      limit: 50,
    });
    setLogs(result.logs || []);
    setTotal(result.total || 0);
    setTotalPages(result.totalPages || 0);
    setLoading(false);
  }, [entityType, actionSearch, startDate, endDate, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [entityType, actionSearch, startDate, endDate]);

  // Debounce action search
  const [debouncedSearch, setDebouncedSearch] = useState(actionSearch);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(actionSearch), 400);
    return () => clearTimeout(t);
  }, [actionSearch]);

  // Trigger fetch on debounced search change
  useEffect(() => {
    if (debouncedSearch !== actionSearch) return;
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function handleClearFilters() {
    setEntityType("all");
    setActionSearch("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  const hasFilters = entityType !== "all" || actionSearch || startDate || endDate;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Entity Type */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Action Search */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Action</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={actionSearch}
                onChange={(e) => setActionSearch(e.target.value)}
                placeholder="Search actions..."
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />
              From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Result count */}
        <div className="mt-3 text-xs text-slate-400">
          {loading ? "Loading..." : `${total} log entr${total === 1 ? "y" : "ies"} found`}
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500 mb-1">No audit logs found</p>
            <p className="text-xs text-slate-400">
              {hasFilters
                ? "Try adjusting your filters"
                : "Actions will appear here as they happen"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left font-medium text-slate-500 px-4 py-3 w-[100px]">Time</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3 w-[160px]">Actor</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3 w-[110px]">Action</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3 w-[100px]">Entity</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3">Description</th>
                    <th className="text-left font-medium text-slate-500 px-4 py-3 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isExpanded = expandedId === log.id;
                    const hasDetails = log.details || log.previousValue || log.newValue;
                    const actionColor = ACTION_COLORS[log.action] || "text-slate-700 bg-slate-50";
                    const entityColor = ENTITY_TYPE_COLORS[log.entityType] || "bg-slate-100 text-slate-600";
                    const roleColor = ROLE_BADGE_COLORS[log.actorRole || ""] || "bg-slate-100 text-slate-600";
                    const entityRoute = ENTITY_ROUTES[log.entityType];

                    return (
                      <tr
                        key={log.id}
                        className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 ${isExpanded ? "bg-slate-50/80" : ""}`}
                      >
                        <td className="px-4 py-3 align-top">
                          <span
                            className="text-xs text-slate-500 cursor-default"
                            title={fullDate(log.createdAt)}
                          >
                            {relativeTime(log.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div>
                            <span className="text-sm font-medium text-slate-900">
                              {log.actorName || log.user?.fullName || log.user?.email || "System"}
                            </span>
                            {log.actorRole && (
                              <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${roleColor}`}>
                                {ROLE_LABELS[log.actorRole] || log.actorRole}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${actionColor}`}>
                            {formatAction(log.action)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${entityColor}`}>
                              {ENTITY_TYPE_LABELS[log.entityType] || log.entityType}
                            </span>
                            {entityRoute && log.entityId && log.entityType !== "settings" && (
                              <a
                                href={`${entityRoute}${log.entityType === "agent" ? `/${log.entityId}` : ""}`}
                                className="text-blue-500 hover:text-blue-700 transition-colors"
                                title="Go to entity"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="text-sm text-slate-600">
                            {buildDescription(log)}
                          </span>
                          {/* Expanded Details */}
                          {isExpanded && hasDetails && (
                            <div className="mt-2 p-3 bg-slate-100 rounded-lg text-xs font-mono space-y-2">
                              {log.details && (
                                <div>
                                  <span className="text-slate-400 font-sans text-[10px] uppercase tracking-wider">Details</span>
                                  <pre className="mt-0.5 text-slate-600 whitespace-pre-wrap break-all">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.previousValue && (
                                <div>
                                  <span className="text-slate-400 font-sans text-[10px] uppercase tracking-wider">Previous</span>
                                  <pre className="mt-0.5 text-red-600 whitespace-pre-wrap break-all">
                                    {JSON.stringify(log.previousValue, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.newValue && (
                                <div>
                                  <span className="text-slate-400 font-sans text-[10px] uppercase tracking-wider">New</span>
                                  <pre className="mt-0.5 text-green-600 whitespace-pre-wrap break-all">
                                    {JSON.stringify(log.newValue, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {hasDetails && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : log.id)}
                              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                              title={isExpanded ? "Collapse" : "Expand details"}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages} ({total} total)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 text-xs rounded transition-colors ${
                          pageNum === page
                            ? "bg-blue-600 text-white font-semibold"
                            : "text-slate-500 hover:bg-white hover:text-slate-700"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
