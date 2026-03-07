"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getMyAgent, getMySubmissions, getMyInvoices, getMyStats, getMyTransactions } from "./actions";
import { createDealSubmission } from "../deal-submissions/actions";
import { getBrokerageConfig } from "../invoices/actions";
import { generateInvoicePDF } from "@/lib/invoice-pdf";
import SubmissionForm from "../deal-submissions/submission-form";
import type { SubmissionFormData } from "../deal-submissions/submission-form";
import type { BrokerageConfig, TransactionStageType } from "@/lib/bms-types";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DEAL_TYPE_LABELS,
} from "@/lib/bms-types";
import {
  STAGE_LABELS,
  STAGE_COLORS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
} from "@/lib/transaction-templates";
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
  FolderOpen,
  Home,
  Trophy,
  Flame,
  Target,
} from "lucide-react";
import { getListings } from "../listings/actions";
import { getAgentDashboard, getLeaderboard } from "../leaderboard/actions";
import { BADGE_DEFINITIONS } from "@/lib/agent-badges";
import {
  LISTING_STATUS_LABELS,
  LISTING_STATUS_COLORS,
  LISTING_STATUS_SEQUENCE,
} from "@/lib/bms-types";
import type { BmsListingRecord, BmsListingStatusType, AgentDashboardData, LeaderboardEntry } from "@/lib/bms-types";

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
  const [stats, setStats] = useState({ totalDeals: 0, totalVolume: 0, totalPaidEarnings: 0, unpaidEarnings: 0, activeTransactions: 0 });

  // Active tab
  const [activeTab, setActiveTab] = useState<"submissions" | "invoices" | "transactions" | "listings" | "performance">("submissions");

  // Performance data
  const [perfData, setPerfData] = useState<AgentDashboardData | null>(null);
  const [perfLoading, setPerfLoading] = useState(true);
  const [miniLeaderboard, setMiniLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Transactions
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  // Listings
  const [myListings, setMyListings] = useState<BmsListingRecord[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);

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

  // ── Load Transactions ───────────────────────────────────────

  async function loadTransactions() {
    setTxLoading(true);
    try {
      const result = await getMyTransactions();
      setTransactions(result || []);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }

  useEffect(() => {
    if (agent) loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  // ── Load Listings ───────────────────────────────────────────

  async function loadListings() {
    setListingsLoading(true);
    try {
      const result = await getListings({ agentId: agent.id });
      setMyListings(result || []);
    } catch {
      setMyListings([]);
    } finally {
      setListingsLoading(false);
    }
  }

  useEffect(() => {
    if (agent) loadListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  // ── Load Performance ────────────────────────────────────────

  async function loadPerformance() {
    if (!agent) return;
    setPerfLoading(true);
    try {
      const [dash, lb] = await Promise.all([
        getAgentDashboard(agent.id),
        getLeaderboard("current_month"),
      ]);
      setPerfData(dash);
      setMiniLeaderboard(lb);
    } catch {
      setPerfData(null);
    } finally {
      setPerfLoading(false);
    }
  }

  useEffect(() => {
    if (agent) loadPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

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

  const isDeactivated = agent?.status === "inactive" || agent?.status === "terminated";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* Deactivation banner */}
      {isDeactivated && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <UserX className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Your account has been deactivated</p>
            <p className="text-sm text-amber-600 mt-0.5">
              Contact your broker for assistance. Your historical data is still visible below.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Deals</h1>
          <p className="text-sm text-slate-500 mt-1">Your submissions and invoices</p>
        </div>
        {!isDeactivated && (
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
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen className="h-4 w-4 text-teal-500" />
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Txns</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.activeTransactions}</p>
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
      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto no-scrollbar">
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
        <button
          onClick={() => setActiveTab("transactions")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "transactions"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FolderOpen className="h-4 w-4" />
          My Transactions
          <span className={`text-xs ${activeTab === "transactions" ? "text-blue-500" : "text-slate-400"}`}>
            {transactions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("listings")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "listings"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Home className="h-4 w-4" />
          My Listings
          <span className={`text-xs ${activeTab === "listings" ? "text-blue-500" : "text-slate-400"}`}>
            {myListings.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("performance")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "performance"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Trophy className="h-4 w-4" />
          Performance
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
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {/* Submissions cards — mobile */}
          {!subLoading && submissions.length > 0 && (
            <div className="space-y-3 md:hidden">
              {submissions.map((sub: any) => (
                <div key={sub.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-sm font-medium text-slate-800 truncate">{sub.propertyAddress}</p>
                    <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${SUBMISSION_STATUS_COLORS[sub.status] || "bg-slate-100 text-slate-600"}`}>
                      {SUBMISSION_STATUS_LABELS[sub.status] || sub.status}
                    </span>
                  </div>
                  {sub.clientName && <p className="text-xs text-slate-500 mb-1">Client: {sub.clientName}</p>}
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-600">{DEAL_TYPE_LABELS[sub.dealType] || sub.dealType}</span>
                    <span className="font-medium text-slate-800">{fmt(Number(sub.transactionValue))}</span>
                    <span className="font-medium text-green-600 ml-auto">{fmtFull(Number(sub.agentPayout))}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span>{fmtDate(sub.createdAt)}</span>
                    {sub.invoice && <span className="font-mono text-blue-600">{sub.invoice.invoiceNumber}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Submissions table — desktop */}
          {!subLoading && submissions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hidden md:block">
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
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {/* Invoices cards — mobile */}
          {!invLoading && invoices.length > 0 && (
            <div className="space-y-3 md:hidden">
              {invoices.map((inv: any) => (
                <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <span className="font-mono font-medium text-sm text-slate-800">{inv.invoiceNumber}</span>
                      <p className="text-sm text-slate-800 truncate">{inv.propertyAddress}</p>
                    </div>
                    <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${INVOICE_STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                      {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{DEAL_TYPE_LABELS[inv.dealType] || inv.dealType}</span>
                    <span className="font-medium text-green-600">{fmtFull(Number(inv.agentPayout))}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400">Due {fmtDate(inv.dueDate)}</span>
                    <button onClick={() => handleDownloadPDF(inv)} className="p-1.5 text-slate-400 hover:text-blue-600">
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invoices table — desktop */}
          {!invLoading && invoices.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hidden md:block">
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

      {/* ── Transactions Tab ───────────────────────────────── */}
      {activeTab === "transactions" && (
        <>
          {/* Loading */}
          {txLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-xl" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!txLoading && transactions.length === 0 && (
            <div className="text-center py-16">
              <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No transactions yet</p>
              <p className="text-sm text-slate-400 mt-1">
                Transactions will appear here once your deals progress to transaction management
              </p>
            </div>
          )}

          {/* Transaction cards */}
          {!txLoading && transactions.length > 0 && (
            <div className="space-y-3">
              {transactions.map((tx: any) => {
                const totalTasks = tx.tasks?.length || 0;
                const completedTasks = tx.tasks?.filter((t: any) => t.isCompleted).length || 0;
                const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const payoutStatus = tx.agentPayoutStatus;
                const payoutAmount = tx.agentPayoutAmount ? Number(tx.agentPayoutAmount) : null;
                return (
                  <Link
                    key={tx.id}
                    href={`/brokerage/transactions/${tx.id}`}
                    className="block bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">{tx.propertyAddress}</p>
                        {tx.propertyUnit && (
                          <p className="text-xs text-slate-500">Unit {tx.propertyUnit}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0 ml-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${TRANSACTION_TYPE_COLORS[tx.type as keyof typeof TRANSACTION_TYPE_COLORS] || "bg-slate-100 text-slate-600"}`}>
                          {TRANSACTION_TYPE_LABELS[tx.type as keyof typeof TRANSACTION_TYPE_LABELS] || tx.type}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STAGE_COLORS[tx.stage as TransactionStageType] || "bg-slate-100 text-slate-600"}`}>
                          {STAGE_LABELS[tx.stage as TransactionStageType] || tx.stage}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">{completedTasks}/{totalTasks} tasks</span>
                          <span className="text-xs text-slate-400">{progressPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {payoutStatus === "paid" && payoutAmount ? (
                          <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                            {fmt(payoutAmount)} paid
                          </span>
                        ) : payoutAmount ? (
                          <span className="text-xs text-amber-600 font-medium">
                            {fmt(payoutAmount)} pending
                          </span>
                        ) : tx.clientName ? (
                          <span className="text-xs text-slate-500">{tx.clientName}</span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Listings Tab ──────────────────────────────────── */}
      {activeTab === "listings" && (
        <>
          {/* Loading */}
          {listingsLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-xl" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!listingsLoading && myListings.length === 0 && (
            <div className="text-center py-16">
              <Home className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No listings assigned</p>
              <p className="text-sm text-slate-400 mt-1">
                Listings assigned to you will appear here
              </p>
            </div>
          )}

          {/* Listing cards */}
          {!listingsLoading && myListings.length > 0 && (
            <div className="space-y-3">
              {myListings.map((listing) => {
                const statusIdx = LISTING_STATUS_SEQUENCE.indexOf(listing.status as BmsListingStatusType);
                const rent = listing.rentPrice ? Number(listing.rentPrice) : null;
                return (
                  <Link
                    key={listing.id}
                    href={`/brokerage/listings/${listing.id}`}
                    className="block bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">
                          {listing.address}{listing.unit ? ` #${listing.unit}` : ""}
                        </p>
                        {listing.property && (
                          <p className="text-xs text-slate-500">{listing.property.name}</p>
                        )}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0 ml-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          LISTING_STATUS_COLORS[listing.status as BmsListingStatusType] || "bg-slate-100 text-slate-600"
                        }`}>
                          {LISTING_STATUS_LABELS[listing.status as BmsListingStatusType] || listing.status}
                        </span>
                        {rent && (
                          <span className="text-xs font-medium text-slate-600">
                            {fmt(rent)}/mo
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Pipeline dots */}
                    <div className="flex items-center gap-1.5">
                      {LISTING_STATUS_SEQUENCE.map((s, i) => (
                        <div
                          key={s}
                          className={`h-1.5 flex-1 rounded-full ${
                            i < statusIdx ? "bg-blue-500" :
                            i === statusIdx ? "bg-blue-500" :
                            "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      {listing.bedrooms != null && <span>{listing.bedrooms} bed</span>}
                      {listing.bathrooms != null && <span>{listing.bathrooms} bath</span>}
                      {listing.sqft != null && <span>{listing.sqft} sqft</span>}
                      {listing.daysOnMarket != null && (
                        <span className="ml-auto text-slate-400">{listing.daysOnMarket} DOM</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Performance Tab ─────────────────────────────────── */}
      {activeTab === "performance" && (
        <>
          {perfLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-xl" />
                ))}
              </div>
              <div className="h-48 bg-slate-100 animate-pulse rounded-xl" />
            </div>
          )}

          {!perfLoading && !perfData && (
            <div className="text-center py-16">
              <Target className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No performance data yet</p>
              <p className="text-sm text-slate-400 mt-1">Goals will appear here once your broker sets targets</p>
            </div>
          )}

          {!perfLoading && perfData && (
            <div className="space-y-6">
              {/* Rank + Streak header */}
              <div className="flex items-center gap-4 flex-wrap">
                {perfData.currentRank > 0 && (
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <div>
                      <span className="text-xs text-slate-500">Rank</span>
                      <p className="text-lg font-bold text-slate-900">
                        #{perfData.currentRank}
                        <span className="text-sm font-normal text-slate-400"> / {perfData.totalAgents}</span>
                      </p>
                    </div>
                  </div>
                )}
                {perfData.streak > 0 && (
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2">
                    <Flame className="h-5 w-5 text-orange-500" />
                    <div>
                      <span className="text-xs text-slate-500">Streak</span>
                      <p className="text-lg font-bold text-orange-600">{perfData.streak} mo</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  <div>
                    <span className="text-xs text-slate-500">Lifetime Deals</span>
                    <p className="text-lg font-bold text-slate-900">{perfData.lifetimeStats.totalDeals}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  <div>
                    <span className="text-xs text-slate-500">Lifetime Revenue</span>
                    <p className="text-lg font-bold text-slate-900">{fmt(perfData.lifetimeStats.totalRevenue)}</p>
                  </div>
                </div>
              </div>

              {/* Circular progress indicators */}
              {perfData.currentGoals && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <CircularProgress
                    label="Deals Closed"
                    actual={perfData.currentGoals.dealsClosedActual}
                    target={perfData.currentGoals.dealsClosedTarget}
                    color="#3b82f6"
                  />
                  <CircularProgress
                    label="Revenue"
                    actual={perfData.currentGoals.revenueActual}
                    target={perfData.currentGoals.revenueTarget}
                    color="#8b5cf6"
                    isCurrency
                  />
                  <CircularProgress
                    label="Listings Leased"
                    actual={perfData.currentGoals.listingsLeasedActual}
                    target={perfData.currentGoals.listingsLeasedTarget}
                    color="#f59e0b"
                  />
                  <CircularProgress
                    label="Listings Added"
                    actual={perfData.currentGoals.listingsAddedActual}
                    target={perfData.currentGoals.listingsAddedTarget}
                    color="#14b8a6"
                  />
                </div>
              )}

              {/* Badge Shelf */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Badges</h3>
                {perfData.badges.length === 0 ? (
                  <p className="text-sm text-slate-400">No badges earned yet. Keep hitting your targets!</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {perfData.badges.map((b) => (
                      <div key={b.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <span className="text-lg">{b.icon}</span>
                        <div>
                          <span className="text-sm font-medium text-slate-800">{b.name}</span>
                          <p className="text-[10px] text-slate-400">
                            {new Date(b.earnedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Locked badges */}
                {(() => {
                  const earnedTypes = new Set(perfData.badges.map((b) => b.type));
                  const locked = Object.entries(BADGE_DEFINITIONS).filter(([type]) => !earnedTypes.has(type));
                  if (locked.length === 0) return null;
                  return (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-500 mb-2">Locked</p>
                      <div className="flex flex-wrap gap-2">
                        {locked.map(([type, def]) => (
                          <div key={type} className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5 opacity-50">
                            <span className="text-sm grayscale">{def.icon}</span>
                            <span className="text-xs text-slate-500">{def.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Monthly History Chart */}
              {perfData.monthlyHistory.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Monthly History</h3>
                  <div className="flex items-end gap-1 h-32">
                    {perfData.monthlyHistory.slice().reverse().map((m, i) => {
                      const maxDeals = Math.max(...perfData.monthlyHistory.map((h) => h.dealsClosed), 1);
                      const barH = (m.dealsClosed / maxDeals) * 100;
                      const MONTH_NAMES_SHORT = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex justify-center">
                            <div
                              className={`w-full max-w-[32px] rounded-t transition-all ${
                                m.hitTargets ? "bg-green-500" : "bg-blue-400"
                              }`}
                              style={{ height: `${Math.max(barH, 4)}%` }}
                              title={`${m.dealsClosed} deals, ${fmt(m.revenue)} rev`}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {MONTH_NAMES_SHORT[m.month - 1]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-sm" /> Hit targets</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-400 rounded-sm" /> Missed</div>
                  </div>
                </div>
              )}

              {/* Mini Leaderboard */}
              {miniLeaderboard.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-800">Leaderboard</h3>
                    <a href="/brokerage/leaderboard" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View Full</a>
                  </div>
                  <div className="space-y-2">
                    {miniLeaderboard.slice(0, 5).map((e) => {
                      const isMe = agent && e.agentId === agent.id;
                      return (
                        <div
                          key={e.agentId}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                            isMe ? "bg-blue-50 border border-blue-200" : "bg-slate-50"
                          }`}
                        >
                          <span className="text-sm font-bold text-slate-500 w-6 text-center">
                            {e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : `#${e.rank}`}
                          </span>
                          <span className={`text-sm flex-1 ${isMe ? "font-semibold text-blue-700" : "text-slate-700"}`}>
                            {e.agentName}{isMe ? " (You)" : ""}
                          </span>
                          <span className={`text-sm font-bold ${e.overallScore >= 100 ? "text-green-600" : "text-slate-600"}`}>
                            {e.overallScore}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Circular Progress Component ───────────────────────────────

function CircularProgress({
  label,
  actual,
  target,
  color,
  isCurrency,
}: {
  label: string;
  actual: number;
  target: number | null;
  color: string;
  isCurrency?: boolean;
}) {
  const fmtCur = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

  const pct = target && target > 0 ? Math.min((actual / target) * 100, 150) : 0;
  const displayPct = Math.round(pct);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke={pct >= 100 ? "#22c55e" : color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${pct >= 100 ? "text-green-600" : "text-slate-800"}`}>
            {displayPct}%
          </span>
        </div>
      </div>
      <span className="text-xs font-medium text-slate-500 mt-2">{label}</span>
      <span className="text-sm font-semibold text-slate-800">
        {isCurrency ? fmtCur(actual) : actual}
        {target !== null && (
          <span className="text-xs text-slate-400 font-normal">/{isCurrency ? fmtCur(target) : target}</span>
        )}
      </span>
    </div>
  );
}
