"use client";

import { useState, useEffect, useRef } from "react";
import { getMyAgent, getMySubmissions, getMyInvoices, getMyStats } from "./actions";
import { createDealSubmission } from "../deal-submissions/actions";
import { getBrokerageConfig } from "../invoices/actions";
import { generateInvoicePDF } from "@/lib/invoice-pdf";
import SubmissionForm from "../deal-submissions/submission-form";
import type { SubmissionFormData } from "../deal-submissions/submission-form";
import type { BrokerageConfig } from "@/lib/bms-types";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DEAL_TYPE_LABELS,
} from "@/lib/bms-types";
import {
  Plus,
  FileText,
  Receipt,
  DollarSign,
  TrendingUp,
  Clock,
  Search,
  X,
  ChevronUp,
  Download,
  UserX,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const SUBMISSION_TABS = ["all", "submitted", "under_review", "approved", "invoiced", "paid", "rejected"] as const;
const INVOICE_TABS = ["all", "draft", "sent", "paid", "void"] as const;

// ── Component ─────────────────────────────────────────────────

export default function MyDealsPage() {
  // Agent identity
  const [agent, setAgent] = useState<any>(null);
  const [agentLoading, setAgentLoading] = useState(true);

  // Stats
  const [stats, setStats] = useState({ totalDeals: 0, totalVolume: 0, totalPaidEarnings: 0, unpaidEarnings: 0 });

  // Active tab
  const [activeTab, setActiveTab] = useState<"submissions" | "invoices">("submissions");

  // Submissions
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
  const [subTotal, setSubTotal] = useState(0);
  const [subLoading, setSubLoading] = useState(true);
  const [subStatus, setSubStatus] = useState("all");
  const [subSearch, setSubSearch] = useState("");

  // Invoices
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invCounts, setInvCounts] = useState<Record<string, number>>({});
  const [invTotal, setInvTotal] = useState(0);
  const [invLoading, setInvLoading] = useState(true);
  const [invStatus, setInvStatus] = useState("all");
  const [invSearch, setInvSearch] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);

  // Brokerage config for PDF
  const [brokerageConfig, setBrokerageConfig] = useState<BrokerageConfig>({ name: "" });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Load Agent ────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setAgentLoading(true);
      try {
        const [ag, st, cfg] = await Promise.all([
          getMyAgent(),
          getMyStats(),
          getBrokerageConfig(),
        ]);
        setAgent(ag);
        setStats(st);
        setBrokerageConfig(cfg);
      } catch {
        setAgent(null);
      } finally {
        setAgentLoading(false);
      }
    }
    init();
  }, []);

  // ── Load Submissions ──────────────────────────────────────

  async function loadSubmissions() {
    setSubLoading(true);
    try {
      const result = await getMySubmissions({
        status: subStatus === "all" ? undefined : subStatus,
        search: subSearch || undefined,
      });
      setSubmissions(result.submissions || []);
      setSubCounts(result.counts || {});
      setSubTotal(result.total || 0);
    } catch {
      setSubmissions([]);
    } finally {
      setSubLoading(false);
    }
  }

  useEffect(() => {
    if (agent) loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, subStatus]);

  useEffect(() => {
    if (!agent) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (activeTab === "submissions") loadSubmissions();
      else loadInvoices();
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSearch, invSearch]);

  // ── Load Invoices ─────────────────────────────────────────

  async function loadInvoices() {
    setInvLoading(true);
    try {
      const result = await getMyInvoices({
        status: invStatus === "all" ? undefined : invStatus,
        search: invSearch || undefined,
      });
      setInvoices(result.invoices || []);
      setInvCounts(result.counts || {});
      setInvTotal(result.total || 0);
    } catch {
      setInvoices([]);
    } finally {
      setInvLoading(false);
    }
  }

  useEffect(() => {
    if (agent) loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, invStatus]);

  // ── Submit Deal ───────────────────────────────────────────

  async function handleSubmitDeal(data: SubmissionFormData) {
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
      submissionSource: "internal",
    });
    setShowForm(false);
    loadSubmissions();
    getMyStats().then(setStats).catch(() => {});
  }

  // ── PDF Download ──────────────────────────────────────────

  function handleDownloadPDF(invoice: any) {
    const doc = generateInvoicePDF(invoice, brokerageConfig);
    doc.save(`${invoice.invoiceNumber || "invoice"}.pdf`);
  }

  // ── Derived ───────────────────────────────────────────────

  const subTotalCount = Object.values(subCounts).reduce((s, c) => s + c, 0);
  const invTotalCount = Object.values(invCounts).reduce((s, c) => s + c, 0);

  const defaultAgentInfo = agent ? {
    firstName: agent.firstName,
    lastName: agent.lastName,
    email: agent.email,
    phone: agent.phone || undefined,
    license: agent.licenseNumber || undefined,
  } : undefined;

  const defaultSplitPct = agent ? Number(agent.defaultSplitPct) || 70 : 70;

  // ── Loading state ─────────────────────────────────────────

  if (agentLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  // ── No linked agent ───────────────────────────────────────

  if (!agent) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <UserX className="h-8 w-8 text-slate-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No Agent Profile Linked</h1>
          <p className="text-slate-500 max-w-md mx-auto">
            Your account is not linked to an agent profile. Contact your broker for setup.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Deals</h1>
          <p className="text-sm text-slate-500 mt-1">Your submissions and invoices</p>
        </div>
        <button
          onClick={() => setShowForm(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            showForm
              ? "text-blue-700 bg-blue-50 border border-blue-200"
              : "text-white bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          Submit Deal
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">My Deals</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.totalDeals}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">My Volume</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{fmt(stats.totalVolume)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-green-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Earnings (Paid)</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{fmt(stats.totalPaidEarnings)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Payouts</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{fmt(stats.unpaidEarnings)}</p>
        </div>
      </div>

      {/* Collapsible submission form */}
      {showForm && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative">
          <button
            onClick={() => setShowForm(false)}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Submit a New Deal</h2>
          <SubmissionForm
            onSubmit={handleSubmitDeal}
            defaultAgentInfo={defaultAgentInfo}
            defaultSplitPct={defaultSplitPct}
          />
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("submissions")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "submissions"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText className="h-4 w-4" />
          My Submissions
          <span className={`text-xs ${activeTab === "submissions" ? "text-blue-500" : "text-slate-400"}`}>
            {subTotalCount}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "invoices"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Receipt className="h-4 w-4" />
          My Invoices
          <span className={`text-xs ${activeTab === "invoices" ? "text-blue-500" : "text-slate-400"}`}>
            {invTotalCount}
          </span>
        </button>
      </div>

      {/* ── Submissions Tab ──────────────────────────────── */}
      {activeTab === "submissions" && (
        <>
          {/* Status filters */}
          <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar">
            {SUBMISSION_TABS.map(tab => {
              const count = tab === "all" ? subTotalCount : (subCounts[tab] || 0);
              const active = subStatus === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setSubStatus(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    active ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {tab === "all" ? "All" : (SUBMISSION_STATUS_LABELS[tab] || tab)}
                  <span className={`text-xs ${active ? "text-blue-500" : "text-slate-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={subSearch}
              onChange={e => setSubSearch(e.target.value)}
              placeholder="Search by property address or client..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Loading */}
          {subLoading && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="h-10 bg-slate-50" />
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 border-t border-slate-100 bg-slate-50/50 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!subLoading && submissions.length === 0 && (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No submissions yet</p>
              <p className="text-sm text-slate-400 mt-1">
                {subSearch ? "Try a different search term" : "Submit your first deal to get started"}
              </p>
              {!subSearch && (
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Submit Deal
                </button>
              )}
            </div>
          )}

          {/* Submissions table */}
          {!subLoading && submissions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Value</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">My Payout</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissions.map((sub: any) => (
                    <tr key={sub.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-3">
                        <div className="text-sm font-medium text-slate-800">{sub.propertyAddress}</div>
                        {sub.clientName && (
                          <div className="text-xs text-slate-500">Client: {sub.clientName}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-slate-600">
                          {DEAL_TYPE_LABELS[sub.dealType] || sub.dealType}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-medium text-slate-800">
                          {fmt(Number(sub.transactionValue))}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-medium text-green-600">
                          {fmtFull(Number(sub.agentPayout))}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                          SUBMISSION_STATUS_COLORS[sub.status] || "bg-slate-100 text-slate-600"
                        }`}>
                          {SUBMISSION_STATUS_LABELS[sub.status] || sub.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {sub.invoice ? (
                          <span className="text-xs font-mono text-blue-600">{sub.invoice.invoiceNumber}</span>
                        ) : (
                          <span className="text-xs text-slate-400">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-slate-500">{fmtDate(sub.createdAt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Invoices Tab ─────────────────────────────────── */}
      {activeTab === "invoices" && (
        <>
          {/* Status filters */}
          <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar">
            {INVOICE_TABS.map(tab => {
              const count = tab === "all" ? invTotalCount : (invCounts[tab] || 0);
              const active = invStatus === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setInvStatus(tab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    active ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {tab === "all" ? "All" : (INVOICE_STATUS_LABELS[tab] || tab)}
                  <span className={`text-xs ${active ? "text-blue-500" : "text-slate-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={invSearch}
              onChange={e => setInvSearch(e.target.value)}
              placeholder="Search by invoice number or property..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Loading */}
          {invLoading && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="h-10 bg-slate-50" />
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 border-t border-slate-100 bg-slate-50/50 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!invLoading && invoices.length === 0 && (
            <div className="text-center py-16">
              <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No invoices yet</p>
              <p className="text-sm text-slate-400 mt-1">
                {invSearch ? "Try a different search term" : "Invoices will appear here once your deals are approved"}
              </p>
            </div>
          )}

          {/* Invoices table */}
          {!invLoading && invoices.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice #</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">My Payout</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Due</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-3 py-3">
                        <span className="text-sm font-mono font-medium text-slate-800">
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm text-slate-800">{inv.propertyAddress}</div>
                        {inv.clientName && (
                          <div className="text-xs text-slate-500">Client: {inv.clientName}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-slate-600">
                          {DEAL_TYPE_LABELS[inv.dealType] || inv.dealType}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-medium text-green-600">
                          {fmtFull(Number(inv.agentPayout))}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                          INVOICE_STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"
                        }`}>
                          {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-slate-500">{fmtDate(inv.dueDate)}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => handleDownloadPDF(inv)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
