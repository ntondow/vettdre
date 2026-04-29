"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Banknote,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Receipt,
  Ban,
} from "lucide-react";
import {
  getInvoicePayments,
} from "../../payments/actions";
import {
  pushToInvoice,
  recordPaymentForInvoice,
} from "../actions";
import { PAYMENT_METHOD_LABELS } from "@/lib/bms-types";

type PaymentRow = {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
};

type PaymentSummary = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceTotal: number;
  totalPaid: number;
  balance: number;
  isFullyPaid: boolean;
  payments: PaymentRow[];
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n) || 0);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const todayIso = () => new Date().toISOString().split("T")[0];

const METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "check", label: PAYMENT_METHOD_LABELS.check ?? "Check" },
  { value: "ach", label: PAYMENT_METHOD_LABELS.ach ?? "ACH" },
  { value: "wire", label: PAYMENT_METHOD_LABELS.wire ?? "Wire" },
  { value: "stripe", label: PAYMENT_METHOD_LABELS.stripe ?? "Stripe" },
  { value: "other", label: PAYMENT_METHOD_LABELS.other ?? "Other" },
];

export function PaymentTab({
  submissionId,
  submissionStatus,
  invoiceId,
  asOrg,
  onShowToast,
  onPaymentRecorded,
}: {
  submissionId: string;
  submissionStatus: string;
  // null/undefined when the submission hasn't been pushed to an invoice
  // yet — the empty state for status < invoiced reuses the Invoice tab's
  // push-to-invoice CTA so users don't need to bounce between tabs.
  invoiceId: string | null;
  asOrg?: string;
  onShowToast: (
    type: "success" | "error",
    message: string,
    opts?: { action?: { label: string; href: string }; durationMs?: number },
  ) => void;
  // Lets the dashboard refresh the card list when status flips → paid.
  onPaymentRecorded: (paidInFull: boolean) => void;
}) {
  const overrideOpts = asOrg ? { overrideAsOrg: asOrg } : {};

  const [data, setData] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state — visible when status === "invoiced" (no payments yet)
  // OR when status === "paid" and the user clicks "+ Record additional".
  const [formOpen, setFormOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("");
  const [method, setMethod] = useState<string>("check");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Push-to-invoice CTA in the empty-state branch (status < invoiced).
  const [pushing, setPushing] = useState(false);

  const load = useCallback(async () => {
    if (!invoiceId) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getInvoicePayments(invoiceId, overrideOpts);
      if (result) {
        setData(result as PaymentSummary);
        // Default the amount input to the outstanding balance.
        if (typeof result.balance === "number" && result.balance > 0) {
          setAmountStr(result.balance.toFixed(2));
        }
      } else {
        setError("Failed to load payments");
      }
    } catch {
      setError("Failed to load payments");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, asOrg]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Push to invoice (mirrors Invoice tab) ──────────────────
  async function handlePushToInvoice() {
    setPushing(true);
    try {
      const result = await pushToInvoice(submissionId, overrideOpts);
      if (result?.success) {
        onShowToast("success", "Invoice created — record a payment to mark it Paid");
        onPaymentRecorded(false);
      } else {
        onShowToast("error", result?.error || "Failed to create invoice");
      }
    } catch {
      onShowToast("error", "Failed to create invoice");
    } finally {
      setPushing(false);
    }
  }

  // ── Submit payment ─────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId) return;
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) {
      setFormError("Enter a valid amount greater than zero");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await recordPaymentForInvoice(
        invoiceId,
        {
          amount,
          paymentMethod: method,
          paymentDate,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
        },
        overrideOpts,
      );
      if (result.success) {
        // Q1 (auto-flip): recordPayment auto-promotes invoice → "paid"
        // when the balance is closed. Surface it via toast.
        if (result.paidInFull) {
          onShowToast("success", "✓ Marked invoice as Paid");
        } else {
          onShowToast("success", "Payment recorded");
        }
        onPaymentRecorded(result.paidInFull === true);
        // Reset form + close, then reload the payments list.
        setFormOpen(false);
        setAmountStr("");
        setReferenceNumber("");
        setNotes("");
        setMethod("check");
        setPaymentDate(todayIso());
        await load();
      } else {
        setFormError(result.error || "Failed to record payment");
      }
    } catch {
      setFormError("Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────

  // Empty state when there's no invoice yet — show the same push-to-invoice
  // CTA as the Invoice tab so users don't have to switch tabs to act.
  if (!invoiceId) {
    if (submissionStatus === "rejected") {
      return (
        <div data-testid="payment-tab-empty-rejected" className="text-center py-10">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 mb-2">
            <Banknote className="h-5 w-5 text-red-400" />
          </div>
          <p className="text-slate-700 font-medium">No payment activity</p>
          <p className="text-sm text-slate-500 mt-1">
            This submission was rejected.
          </p>
        </div>
      );
    }
    return (
      <div data-testid="payment-tab-empty-no-invoice" className="text-center py-10">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2">
          <Banknote className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-slate-700 font-medium">No invoice yet</p>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Push this submission to an invoice before recording a payment.
        </p>
        <button
          type="button"
          onClick={handlePushToInvoice}
          disabled={pushing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pushing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Receipt className="h-4 w-4" />
          )}
          Push this submission to an invoice
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div data-testid="payment-tab-loading" className="space-y-3 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-10" data-testid="payment-tab-error">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600">{error ?? "Failed to load payments"}</p>
      </div>
    );
  }

  // Voided invoice — terminal state, no activity expected.
  if (submissionStatus === "void") {
    return (
      <div data-testid="payment-tab-void" className="text-center py-10">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2">
          <Ban className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-slate-700 font-medium">Voided</p>
        <p className="text-sm text-slate-500 mt-1">
          No payment activity expected.
        </p>
      </div>
    );
  }

  const hasPayments = data.payments.length > 0;
  // Show the form when:
  //  - the user clicked "+ Record additional payment" (formOpen=true), OR
  //  - the invoice is invoiced/sent with no payments yet (auto-show on
  //    the first land so the manager can record without an extra click).
  const showFormDefault = !hasPayments && !data.isFullyPaid;
  const showForm = formOpen || showFormDefault;

  return (
    <div data-testid="payment-tab-populated" className="space-y-5">
      {/* Balance summary */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-1.5 font-mono text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Invoice total</span>
          <span className="text-slate-700 font-semibold">{fmt(data.invoiceTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Paid</span>
          <span className="text-emerald-600">{fmt(data.totalPaid)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5">
          <span
            className={`font-semibold ${
              data.balance <= 0.01 ? "text-emerald-700" : "text-slate-700"
            }`}
          >
            {data.balance <= 0.01 ? "Balance" : "Outstanding balance"}
          </span>
          <span
            data-testid="payment-tab-balance"
            className={`font-semibold ${
              data.balance <= 0.01 ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {fmt(data.balance)}
          </span>
        </div>
      </div>

      {/* Payment history */}
      {hasPayments && (
        <div data-testid="payment-tab-history">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
            Payment history
          </p>
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-200 overflow-hidden">
            {data.payments.map((p) => (
              <li
                key={p.id}
                className="px-4 py-3 flex items-start justify-between gap-3 bg-white"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">
                    {fmtDate(p.paymentDate)}
                    <span className="text-slate-400 font-normal ml-2">
                      {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                    </span>
                  </p>
                  {p.referenceNumber && (
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      Ref {p.referenceNumber}
                    </p>
                  )}
                  {p.notes && (
                    <p className="text-xs text-slate-500 mt-0.5">{p.notes}</p>
                  )}
                </div>
                <span className="text-sm font-mono font-semibold text-emerald-600 whitespace-nowrap">
                  {fmt(Number(p.amount))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Record-payment form / CTA */}
      {showForm ? (
        <form onSubmit={handleSubmit} data-testid="payment-tab-form" className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Paid date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Reference number
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Check #, wire ref, etc."
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional"
            />
          </div>
          {formError && (
            <p className="text-sm text-rose-600" data-testid="payment-tab-form-error">
              {formError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            {hasPayments && (
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              data-testid="payment-tab-submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Record payment
            </button>
          </div>
        </form>
      ) : (
        // Status === paid (or partially paid + form was closed) — show the
        // affordance to record an additional payment without auto-opening
        // the form.
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setFormOpen(true);
              // When opening additional-payment form on a fully-paid
              // invoice, default the amount to 0 (manager will type a
              // correction); otherwise default to outstanding balance.
              setAmountStr(
                data.balance > 0.01 ? data.balance.toFixed(2) : "",
              );
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            data-testid="payment-tab-record-additional"
          >
            <Plus className="h-3.5 w-3.5" />
            Record additional payment
          </button>
        </div>
      )}
    </div>
  );
}
