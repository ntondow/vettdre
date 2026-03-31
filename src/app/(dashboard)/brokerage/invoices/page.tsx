"use client";

import { useState, useEffect, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getInvoices,
  updateInvoiceStatus,
  deleteInvoice,
  bulkMarkPaid,
  getBrokerageConfig,
} from "./actions";
import ExcelUpload from "./excel-upload";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  DEAL_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/bms-types";
import type { BrokerageConfig } from "@/lib/bms-types";
// PDF generators loaded dynamically on demand to reduce bundle size
const loadInvoicePdf = () => import("@/lib/invoice-pdf");
import { recordPayment } from "../payments/actions";
import {
  FileText,
  Download,
  Search,
  Trash2,
  CheckCircle,
  Ban,
  Plus,
  Upload,
  Printer,
  X,
  DollarSign,
  FolderOpen,
  AlertCircle,
  TrendingUp,
  Calendar,
} from "lucide-react";
import {
  STAGE_LABELS,
} from "@/lib/transaction-templates";
import type { TransactionStageType } from "@/lib/bms-types";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "\u2014";
  }
};

const STATUS_TABS = ["all", "draft", "sent", "paid", "void"] as const;

// Helper to determine if an invoice is unpaid
const isUnpaid = (inv: any) => inv.status === "draft" || inv.status === "sent";

// Helper to calculate paid amount from payments array
const getPaidAmount = (inv: any) => (inv.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);

// ── Component ─────────────────────────────────────────────────

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [brokerageConfig, setBrokerageConfig] = useState<BrokerageConfig | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Inline payment form
  const [paymentFormId, setPaymentFormId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "check", reference: "" });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Data Loading ────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    try {
      const result = await getInvoices({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search || undefined,
      });
      setInvoices(result.invoices || []);
      setCounts(result.counts || {});
      setTotal(result.total || 0);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getBrokerageConfig().then(c => setBrokerageConfig(c)).catch(() => {});
  }, []);

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

  // ── Selection ───────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map((inv: any) => inv.id)));
    }
  }

  // ── PDF Actions ─────────────────────────────────────────────

  async function downloadPDF(inv: any) {
    const { generateInvoicePDF } = await loadInvoicePdf();
    const doc = generateInvoicePDF(inv, brokerageConfig || undefined);
    doc.save(`${inv.invoiceNumber}.pdf`);
  }

  async function printPDF(inv: any) {
    const { generateInvoicePDF } = await loadInvoicePdf();
    const doc = generateInvoicePDF(inv, brokerageConfig || undefined);
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const win = window.open(url);
    if (win) {
      win.addEventListener("load", () => { win.print(); });
    }
  }

  async function downloadSelectedPDFs() {
    const selectedInvoices = invoices.filter((inv: any) => selected.has(inv.id));
    if (selectedInvoices.length === 0) return;

    const { generateInvoicePDF, generateBatchInvoicePDFs } = await loadInvoicePdf();
    if (selectedInvoices.length === 1) {
      const doc = generateInvoicePDF(selectedInvoices[0], brokerageConfig || undefined);
      doc.save(`${selectedInvoices[0].invoiceNumber}.pdf`);
    } else {
      const doc = generateBatchInvoicePDFs(selectedInvoices, brokerageConfig || undefined);
      doc.save("invoices-batch.pdf");
    }
  }

  // ── Row Actions ─────────────────────────────────────────────

  async function handleMarkPaid(id: string) {
    setActionLoading(id);
    await updateInvoiceStatus(id, "paid");
    setActionLoading(null);
    loadData();
  }

  async function handleVoid(id: string) {
    setActionLoading(id);
    await updateInvoiceStatus(id, "void");
    setActionLoading(null);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    setActionLoading(id);
    await deleteInvoice(id);
    setActionLoading(null);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    loadData();
  }

  async function handleBulkMarkPaid() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setActionLoading("bulk");
    await bulkMarkPaid(ids);
    setActionLoading(null);
    setSelected(new Set());
    loadData();
  }

  function openPaymentForm(inv: any) {
    const paidSoFar = (inv.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    const balance = Number(inv.agentPayout) - paidSoFar;
    setPaymentForm({ amount: balance.toFixed(2), method: "check", reference: "" });
    setPaymentError("");
    setPaymentFormId(inv.id);
  }

  async function handleInlineRecordPayment(inv: any) {
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { setPaymentError("Enter a valid amount"); return; }
    setPaymentLoading(true);
    setPaymentError("");
    const result = await recordPayment({
      invoiceId: inv.id,
      agentId: inv.agentId || undefined,
      amount,
      paymentMethod: paymentForm.method as any,
      referenceNumber: paymentForm.reference || undefined,
    });
    setPaymentLoading(false);
    if (result.success) {
      setPaymentFormId(null);
      loadData();
    } else {
      setPaymentError(result.error || "Failed to record payment");
    }
  }

  const totalCount = Object.values(counts).reduce((s, c) => s + c, 0);

  // ── Reconciliation Summary ──────────────────────────────────

  const summaryStats = useMemo(() => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentYear = new Date(now.getFullYear(), 0, 1);

    let totalOutstanding = 0;
    let totalCollectedThisMonth = 0;
    let totalCollectedThisYear = 0;

    invoices.forEach((inv: any) => {
      const agentPayoutNum = Number(inv.agentPayout);
      const paidAmount = getPaidAmount(inv);

      if (isUnpaid(inv)) {
        totalOutstanding += agentPayoutNum;
      }

      // Count collected payments
      (inv.payments || []).forEach((p: any) => {
        const paymentDate = new Date(p.paymentDate || p.createdAt);
        const amount = Number(p.amount);
        if (paymentDate >= currentMonth) {
          totalCollectedThisMonth += amount;
        }
        if (paymentDate >= currentYear) {
          totalCollectedThisYear += amount;
        }
      });
    });

    return {
      totalOutstanding,
      totalCollectedThisMonth,
      totalCollectedThisYear,
      totalInvoiceCount: invoices.length,
    };
  }, [invoices]);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">Generate, track, and manage commission invoices</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => router.push("/brokerage/invoices/bulk")}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Bulk Generate
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Excel
          </button>
          <button
            onClick={() => router.push("/brokerage/invoices/new")}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Invoice
          </button>
        </div>
      </div>

      {/* Reconciliation Summary Cards */}
      {!loading && invoices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-red-100">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Outstanding</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{fmt(summaryStats.totalOutstanding)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Unpaid invoices</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-green-100">
                <DollarSign className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">This Month</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{fmt(summaryStats.totalCollectedThisMonth)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Collected</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-blue-100">
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">This Year</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{fmt(summaryStats.totalCollectedThisYear)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Collected</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-purple-100">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{summaryStats.totalInvoiceCount}</p>
            <p className="text-xs text-slate-400 mt-0.5">Invoice{summaryStats.totalInvoiceCount !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}

      {/* Excel upload panel */}
      {showUpload && (
        <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 relative">
          <button
            onClick={() => setShowUpload(false)}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Upload Excel / CSV</h2>
          <ExcelUpload onComplete={() => { setShowUpload(false); loadData(); }} />
        </div>
      )}

      {/* Status tabs + Quick Filter */}
      <div className="flex gap-1 mb-4 overflow-x-auto no-scrollbar items-center">
        {STATUS_TABS.map(tab => {
          const count = tab === "all" ? totalCount : (counts[tab] || 0);
          const active = statusFilter === tab;
          return (
            <button
              key={tab}
              onClick={() => { setStatusFilter(tab); setSelected(new Set()); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                active ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {tab === "all" ? "All" : INVOICE_STATUS_LABELS[tab] || tab}
              <span className={`text-xs ${active ? "text-blue-500" : "text-slate-400"}`}>{count}</span>
            </button>
          );
        })}
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => { setStatusFilter("sent"); setSelected(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              statusFilter === "sent" ? "bg-amber-100 text-amber-700" : "text-slate-500 hover:bg-slate-100"
            }`}
            title="Show only unpaid invoices"
          >
            <AlertCircle className="h-4 w-4" />
            Unpaid
          </button>
        </div>
      </div>

      {/* Search + bulk actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice #, agent, or property..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 whitespace-nowrap">{selected.size} selected</span>
            <button
              onClick={downloadSelectedPDFs}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download PDFs
            </button>
            <button
              onClick={handleBulkMarkPaid}
              disabled={actionLoading === "bulk"}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              Mark Paid
            </button>
          </div>
        )}
      </div>

      {/* Loading shimmer */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="h-10 bg-slate-50" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 border-t border-slate-100 bg-slate-50/50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && invoices.length === 0 && (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No invoices found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search ? "Try a different search term" : "Generate invoices from approved deal submissions or upload an Excel file"}
          </p>
        </div>
      )}

      {/* Invoice table — desktop */}
      {!loading && invoices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === invoices.length && invoices.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-blue-600"
                  />
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice #</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent Payout</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">House</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Due Date</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv: any) => {
                const isActing = actionLoading === inv.id;
                const canMarkPaid = isUnpaid(inv);
                const canVoid = inv.status !== "void" && inv.status !== "paid";
                const paidAmount = getPaidAmount(inv);
                const agentPayoutNum = Number(inv.agentPayout);
                const hasPartialPayment = paidAmount > 0 && paidAmount < agentPayoutNum * 0.995;
                const paidPct = agentPayoutNum > 0 ? Math.min(100, Math.round((paidAmount / agentPayoutNum) * 100)) : 0;
                const balanceRemaining = agentPayoutNum - paidAmount;
                return (
                  <Fragment key={inv.id}>
                  <tr className="hover:bg-slate-50/50 transition-colors">
                    {/* Checkbox */}
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                    </td>

                    {/* Invoice # */}
                    <td className="px-3 py-3">
                      <span className="font-mono font-medium text-sm text-slate-800">{inv.invoiceNumber}</span>
                    </td>

                    {/* Agent */}
                    <td className="px-3 py-3">
                      <div className="text-sm text-slate-800">{inv.agentName}</div>
                      {inv.agentEmail && (
                        <div className="text-xs text-slate-400">{inv.agentEmail}</div>
                      )}
                    </td>

                    {/* Property */}
                    <td className="px-3 py-3">
                      <div className="text-sm text-slate-800 max-w-[200px] truncate" title={inv.propertyAddress}>
                        {inv.propertyAddress}
                      </div>
                      <div className="text-xs text-slate-400">
                        {DEAL_TYPE_LABELS[inv.dealType] || inv.dealType}
                      </div>
                    </td>

                    {/* Agent Payout + Payment Status */}
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm font-semibold text-green-600">
                        {fmt(agentPayoutNum)}
                      </span>
                      {hasPartialPayment ? (
                        <div className="mt-1">
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[10px] text-slate-400">{fmt(paidAmount)} paid</span>
                            <span className="text-[10px] font-medium text-red-600">{fmt(balanceRemaining)} due</span>
                          </div>
                        </div>
                      ) : inv.status === "paid" ? (
                        <div className="text-[10px] text-green-600 font-medium mt-1">Fully Paid</div>
                      ) : (
                        <div className="text-[10px] text-slate-400 mt-1">Unpaid</div>
                      )}
                    </td>

                    {/* House */}
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm text-slate-600">
                        {fmt(Number(inv.housePayout))}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${INVOICE_STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                        {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                      </span>
                      {inv.status === "paid" && inv.paidDate && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(inv.paidDate)}</div>
                      )}
                      {hasPartialPayment && (
                        <div className="text-[10px] text-amber-600 font-medium mt-0.5">Partial</div>
                      )}
                      {inv.transaction && (
                        <a
                          href={`/brokerage/transactions/${inv.transaction.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 mt-1 text-[10px] text-teal-600 hover:text-teal-700"
                          title={`Transaction: ${STAGE_LABELS[inv.transaction.stage as TransactionStageType] || inv.transaction.stage}`}
                        >
                          <FolderOpen className="h-2.5 w-2.5" />
                          {STAGE_LABELS[inv.transaction.stage as TransactionStageType] || "Linked"}
                        </a>
                      )}
                    </td>

                    {/* Due Date */}
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm text-slate-500">{inv.dueDate ? fmtDate(inv.dueDate) : "\u2014"}</span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => downloadPDF(inv)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Download PDF"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => printPDF(inv)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Print"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        {canMarkPaid && (
                          <>
                            <button
                              onClick={() => openPaymentForm(inv)}
                              className="p-1.5 text-slate-400 hover:text-green-600 transition-colors font-medium"
                              title="Record Payment"
                            >
                              <DollarSign className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleMarkPaid(inv.id)}
                              disabled={isActing}
                              className="p-1.5 text-slate-400 hover:text-green-600 disabled:opacity-50 transition-colors"
                              title="Mark Fully Paid"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {canVoid && (
                          <button
                            onClick={() => handleVoid(inv.id)}
                            disabled={isActing}
                            className="p-1.5 text-slate-400 hover:text-orange-500 disabled:opacity-50 transition-colors"
                            title="Void"
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(inv.id)}
                          disabled={isActing}
                          className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {paymentFormId === inv.id && (
                    <tr className="bg-green-50/50">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="flex items-end gap-3 flex-wrap">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Amount</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={paymentForm.amount}
                                onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-32 pl-6 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Method</label>
                            <select
                              value={paymentForm.method}
                              onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}
                              className="px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                            >
                              {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Ref #</label>
                            <input
                              type="text"
                              value={paymentForm.reference}
                              onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))}
                              placeholder="Optional"
                              className="w-28 px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleInlineRecordPayment(inv)}
                              disabled={paymentLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              {paymentLoading ? "..." : "Record"}
                            </button>
                            <button
                              onClick={() => setPaymentFormId(null)}
                              className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                          {paymentError && (
                            <span className="text-xs text-red-600">{paymentError}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice cards — mobile */}
      {!loading && invoices.length > 0 && (
        <div className="space-y-3 md:hidden">
          {invoices.map((inv: any) => {
            const agentPayoutNum = Number(inv.agentPayout);
            const paidAmount = getPaidAmount(inv);
            const hasPartialPayment = paidAmount > 0 && paidAmount < agentPayoutNum * 0.995;
            const paidPct = agentPayoutNum > 0 ? Math.min(100, Math.round((paidAmount / agentPayoutNum) * 100)) : 0;
            const canMarkPaid = isUnpaid(inv);
            const isActing = actionLoading === inv.id;
            const balanceRemaining = agentPayoutNum - paidAmount;
            return (
              <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <span className="font-mono font-medium text-sm text-slate-800">{inv.invoiceNumber}</span>
                    <p className="text-sm text-slate-800 truncate mt-0.5">{inv.propertyAddress}</p>
                    <p className="text-xs text-slate-500">{inv.agentName}</p>
                  </div>
                  <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded-full ${INVOICE_STATUS_COLORS[inv.status] || "bg-slate-100 text-slate-600"}`}>
                    {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <div className="flex-1">
                    <span className="text-xs text-slate-500">Agent Payout</span>
                    <p className="font-semibold text-green-600">{fmt(agentPayoutNum)}</p>
                    {hasPartialPayment ? (
                      <div className="mt-1 w-full">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full" style={{ width: `${paidPct}%` }} />
                        </div>
                        <div className="flex justify-between mt-0.5 text-[10px]">
                          <span className="text-slate-400">{fmt(paidAmount)} paid</span>
                          <span className="text-red-600 font-medium">{fmt(balanceRemaining)} due</span>
                        </div>
                      </div>
                    ) : inv.status === "paid" ? (
                      <div className="text-[10px] text-green-600 font-medium mt-1">Fully Paid</div>
                    ) : (
                      <div className="text-[10px] text-slate-400 mt-1">Unpaid</div>
                    )}
                  </div>
                  <div className="text-right ml-2">
                    <span className="text-xs text-slate-500">House</span>
                    <p className="text-slate-600">{fmt(Number(inv.housePayout))}</p>
                  </div>
                  {inv.dueDate && (
                    <div className="text-right ml-2">
                      <span className="text-xs text-slate-500">Due</span>
                      <p className="text-slate-500">{fmtDate(inv.dueDate)}</p>
                    </div>
                  )}
                </div>
                {inv.transaction && (
                  <a
                    href={`/brokerage/transactions/${inv.transaction.id}`}
                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 mb-2"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Txn: {STAGE_LABELS[inv.transaction.stage as TransactionStageType] || "Linked"}
                  </a>
                )}
                <div className="flex items-center gap-1 pt-2 border-t border-slate-100">
                  <button onClick={() => downloadPDF(inv)} className="p-2 text-slate-400 hover:text-blue-600" title="Download PDF">
                    <Download className="h-4 w-4" />
                  </button>
                  <button onClick={() => printPDF(inv)} className="p-2 text-slate-400 hover:text-slate-600" title="Print">
                    <Printer className="h-4 w-4" />
                  </button>
                  {canMarkPaid && (
                    <>
                      <button onClick={() => openPaymentForm(inv)} className="p-2 text-slate-400 hover:text-green-600 font-medium" title="Record Payment">
                        <DollarSign className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleMarkPaid(inv.id)} disabled={isActing} className="p-2 text-slate-400 hover:text-green-600 disabled:opacity-50" title="Mark Fully Paid">
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(inv.id)} disabled={isActing} className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-50 ml-auto" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
