"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getPaymentHistory,
  getPaymentSummary,
  recordPayment,
  deletePayment,
  exportPaymentHistory,
} from "./actions";
import { getInvoices } from "../invoices/actions";
import {
  PAYMENT_METHOD_LABELS,
} from "@/lib/bms-types";
import type { PaymentMethodType } from "@/lib/bms-types";
import {
  DollarSign,
  CreditCard,
  Download,
  Trash2,
  Plus,
  Search,
  Receipt,
  X,
  Filter,
  Hash,
  Clock,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const fmtDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "\u2014";
  }
};

const fmtShortDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "\u2014";
  }
};

const today = () => new Date().toISOString().split("T")[0];

const METHODS = ["all", "check", "ach", "wire", "cash", "stripe", "other"] as const;

const METHOD_COLORS: Record<string, string> = {
  check: "bg-slate-100 text-slate-700",
  ach: "bg-blue-100 text-blue-700",
  wire: "bg-purple-100 text-purple-700",
  cash: "bg-green-100 text-green-700",
  stripe: "bg-indigo-100 text-indigo-700",
  other: "bg-gray-100 text-gray-600",
};

// ── Component ─────────────────────────────────────────────────

export default function PaymentsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [payments, setPayments] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [summary, setSummary] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [method, setMethod] = useState("all");
  const [search, setSearch] = useState("");

  // Record payment
  const [showRecord, setShowRecord] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [newPayment, setNewPayment] = useState({
    amount: "",
    paymentMethod: "check" as PaymentMethodType,
    paymentDate: today(),
    referenceNumber: "",
    notes: "",
  });
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState("");

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Data Loading ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [historyResult, summaryResult] = await Promise.all([
        getPaymentHistory({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          method: method !== "all" ? method : undefined,
          page,
        }),
        getPaymentSummary(
          startDate || endDate
            ? { startDate: startDate || undefined, endDate: endDate || undefined }
            : undefined,
        ),
      ]);
      setPayments(historyResult.payments || []);
      setTotal(historyResult.total || 0);
      setTotalPages(historyResult.totalPages || 0);
      setSummary(summaryResult);
    } catch {
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, method, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Search filter (client-side on current page)
  const filteredPayments = search
    ? payments.filter((p: any) => {
        const q = search.toLowerCase();
        return (
          (p.invoice?.invoiceNumber || "").toLowerCase().includes(q) ||
          (p.invoice?.agentName || "").toLowerCase().includes(q) ||
          (p.agent ? `${p.agent.firstName} ${p.agent.lastName}`.toLowerCase().includes(q) : false) ||
          (p.invoice?.propertyAddress || "").toLowerCase().includes(q) ||
          (p.referenceNumber || "").toLowerCase().includes(q)
        );
      })
    : payments;

  // ── Record Payment ────────────────────────────────────────

  async function openRecordPayment() {
    setShowRecord(true);
    setSelectedInvoice(null);
    setRecordError("");
    setNewPayment({
      amount: "",
      paymentMethod: "check",
      paymentDate: today(),
      referenceNumber: "",
      notes: "",
    });
    // Load unpaid invoices
    try {
      const [draftResult, sentResult] = await Promise.all([
        getInvoices({ status: "draft", limit: 100 }),
        getInvoices({ status: "sent", limit: 100 }),
      ]);
      setUnpaidInvoices([
        ...(draftResult.invoices || []),
        ...(sentResult.invoices || []),
      ]);
    } catch {
      setUnpaidInvoices([]);
    }
  }

  function selectInvoice(inv: any) {
    setSelectedInvoice(inv);
    // Pre-fill amount with remaining balance (agentPayout for now — payments will be factored in server-side)
    setNewPayment(prev => ({
      ...prev,
      amount: String(Number(inv.agentPayout).toFixed(2)),
    }));
    setInvoiceSearch("");
  }

  async function handleRecordPayment() {
    if (!selectedInvoice) {
      setRecordError("Select an invoice first");
      return;
    }
    const amount = parseFloat(newPayment.amount);
    if (!amount || amount <= 0) {
      setRecordError("Enter a valid amount");
      return;
    }

    setRecordLoading(true);
    setRecordError("");

    const result = await recordPayment({
      invoiceId: selectedInvoice.id,
      agentId: selectedInvoice.agentId || undefined,
      amount,
      paymentMethod: newPayment.paymentMethod,
      paymentDate: newPayment.paymentDate || undefined,
      referenceNumber: newPayment.referenceNumber || undefined,
      notes: newPayment.notes || undefined,
    });

    setRecordLoading(false);

    if (result.success) {
      setShowRecord(false);
      loadData();
    } else {
      setRecordError(result.error || "Failed to record payment");
    }
  }

  // ── Delete Payment ────────────────────────────────────────

  async function handleDelete(id: string) {
    setActionLoading(id);
    await deletePayment(id);
    setActionLoading(null);
    setDeleteConfirm(null);
    loadData();
  }

  // ── Export CSV ─────────────────────────────────────────────

  async function handleExport() {
    const start = startDate || "2020-01-01";
    const end = endDate || new Date().toISOString().split("T")[0];
    const result = await exportPaymentHistory(start, end);
    if (result.success && result.csv) {
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payments-${start}-to-${end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ── Filtered invoices for search ──────────────────────────

  const invoiceSearchResults = invoiceSearch
    ? unpaidInvoices.filter((inv: any) => {
        const q = invoiceSearch.toLowerCase();
        return (
          (inv.invoiceNumber || "").toLowerCase().includes(q) ||
          (inv.agentName || "").toLowerCase().includes(q) ||
          (inv.propertyAddress || "").toLowerCase().includes(q)
        );
      })
    : unpaidInvoices;

  // ── Summary helpers ───────────────────────────────────────

  const topMethod = summary?.byMethod
    ? Object.entries(summary.byMethod as Record<string, { count: number; total: number }>).sort(
        (a, b) => b[1].count - a[1].count,
      )[0]
    : null;

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500 mt-1">Record and track agent commission payments</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={openRecordPayment}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Record Payment
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-green-100">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Paid</span>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {loading ? <span className="inline-block w-24 h-7 bg-slate-100 rounded animate-pulse" /> : fmt(summary?.totalPaid || 0)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-amber-100">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pending Payouts</span>
          </div>
          <p className="text-2xl font-bold text-amber-600">
            {loading ? <span className="inline-block w-24 h-7 bg-slate-100 rounded animate-pulse" /> : fmt(summary?.totalPending || 0)}
          </p>
          {!loading && summary?.pendingInvoiceCount > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">{summary.pendingInvoiceCount} invoice{summary.pendingInvoiceCount !== 1 ? "s" : ""}</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-blue-100">
              <Hash className="h-4 w-4 text-blue-600" />
            </div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Payments</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {loading ? <span className="inline-block w-16 h-7 bg-slate-100 rounded animate-pulse" /> : (summary?.paymentCount || 0)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-purple-100">
              <CreditCard className="h-4 w-4 text-purple-600" />
            </div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Top Method</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {loading ? (
              <span className="inline-block w-20 h-7 bg-slate-100 rounded animate-pulse" />
            ) : topMethod ? (
              PAYMENT_METHOD_LABELS[topMethod[0]] || topMethod[0]
            ) : (
              "\u2014"
            )}
          </p>
          {!loading && topMethod && (
            <p className="text-xs text-slate-400 mt-0.5">{topMethod[1].count} payment{topMethod[1].count !== 1 ? "s" : ""}</p>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by invoice #, agent, property, reference..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1); }}
            className="px-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="px-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={method}
          onChange={e => { setMethod(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {METHODS.map(m => (
            <option key={m} value={m}>
              {m === "all" ? "All Methods" : PAYMENT_METHOD_LABELS[m] || m}
            </option>
          ))}
        </select>
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
      {!loading && filteredPayments.length === 0 && (
        <div className="text-center py-16">
          <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No payments found</p>
          <p className="text-sm text-slate-400 mt-1">
            {search || startDate || endDate || method !== "all"
              ? "Try adjusting your filters"
              : "Record your first payment to get started"}
          </p>
          {!search && !startDate && !endDate && method === "all" && (
            <button
              onClick={openRecordPayment}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Record Payment
            </button>
          )}
        </div>
      )}

      {/* Payment History Table */}
      {!loading && filteredPayments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice #</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Agent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Property</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Method</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Reference #</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.map((p: any) => {
                const isDeleting = actionLoading === p.id;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-700">{fmtShortDate(p.paymentDate)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-medium text-blue-600">
                        {p.invoice?.invoiceNumber || "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-800">
                        {p.agent ? `${p.agent.firstName} ${p.agent.lastName}` : p.invoice?.agentName || "\u2014"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-slate-700 max-w-[200px] truncate" title={p.invoice?.propertyAddress}>
                        {p.invoice?.propertyAddress || "\u2014"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-green-600">
                        {fmtFull(Number(p.amount))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${METHOD_COLORS[p.paymentMethod] || "bg-slate-100 text-slate-600"}`}>
                        {PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-500 font-mono">
                        {p.referenceNumber || "\u2014"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        {deleteConfirm === p.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={isDeleting}
                              className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {isDeleting ? "..." : "Confirm"}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(p.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete payment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50">
              <p className="text-sm text-slate-500">
                {total} payment{total !== 1 ? "s" : ""} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Record Payment Panel */}
      {showRecord && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowRecord(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-50 shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Record Payment</h2>
              <button onClick={() => setShowRecord(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Invoice selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Invoice</label>
                {selectedInvoice ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 relative">
                    <button
                      onClick={() => setSelectedInvoice(null)}
                      className="absolute top-2 right-2 p-0.5 text-blue-400 hover:text-blue-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <p className="font-mono text-sm font-semibold text-blue-700">{selectedInvoice.invoiceNumber}</p>
                    <p className="text-sm text-slate-700 mt-0.5">{selectedInvoice.agentName}</p>
                    <p className="text-xs text-slate-500 truncate">{selectedInvoice.propertyAddress}</p>
                    <p className="text-sm font-medium text-blue-600 mt-1">
                      Balance: {fmtFull(Number(selectedInvoice.agentPayout))}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={invoiceSearch}
                        onChange={e => setInvoiceSearch(e.target.value)}
                        placeholder="Search invoices by #, agent, or property..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                      {invoiceSearchResults.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-4">
                          {unpaidInvoices.length === 0 ? "No unpaid invoices" : "No matching invoices"}
                        </p>
                      ) : (
                        invoiceSearchResults.slice(0, 20).map((inv: any) => (
                          <button
                            key={inv.id}
                            onClick={() => selectInvoice(inv)}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-medium text-slate-700">{inv.invoiceNumber}</span>
                              <span className="text-xs font-medium text-green-600">{fmt(Number(inv.agentPayout))}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{inv.agentName}</p>
                            <p className="text-xs text-slate-400 truncate">{inv.propertyAddress}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPayment.amount}
                    onChange={e => setNewPayment(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Payment Method</label>
                <select
                  value={newPayment.paymentMethod}
                  onChange={e => setNewPayment(prev => ({ ...prev, paymentMethod: e.target.value as PaymentMethodType }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Payment Date</label>
                <input
                  type="date"
                  value={newPayment.paymentDate}
                  onChange={e => setNewPayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Reference # */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Reference # <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newPayment.referenceNumber}
                  onChange={e => setNewPayment(prev => ({ ...prev, referenceNumber: e.target.value }))}
                  placeholder="Check #, transaction ID, etc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Notes <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newPayment.notes}
                  onChange={e => setNewPayment(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Error */}
              {recordError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-sm text-red-600">{recordError}</p>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleRecordPayment}
                disabled={recordLoading || !selectedInvoice}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {recordLoading ? (
                  <>
                    <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4" />
                    Record Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
