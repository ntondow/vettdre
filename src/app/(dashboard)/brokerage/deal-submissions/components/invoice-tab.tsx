"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  Receipt,
  Mail,
  AlertCircle,
} from "lucide-react";
import {
  getInvoiceForSubmission,
  sendInvoiceToAgent,
  pushToInvoice,
} from "../actions";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
} from "@/lib/bms-types";

// Mirror of the action's data shape — keeping a local type avoids importing
// a "use server" file's return type into a client module.
type InvoiceData = {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  sentAt: string | null;
  totalCommission: number;
  agentSplitPct: number;
  houseSplitPct: number;
  agentPayout: number;
  housePayout: number;
  processingFeePct: number;
  processingFeeAmt: number;
  paymentTerms: string;
  agentEmail: string | null;
  agentName: string;
};

type SendButtonState = "idle" | "sending" | "sent";

const fmt = (n: number | string | null | undefined) => {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

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

export function InvoiceTab({
  submissionId,
  submissionStatus,
  asOrg,
  onShowToast,
  onInvoiceCreated,
  onInvoiceSent,
}: {
  submissionId: string;
  submissionStatus: string;
  asOrg?: string;
  onShowToast: (
    type: "success" | "error",
    message: string,
    opts?: { action?: { label: string; href: string }; durationMs?: number },
  ) => void;
  // Lets the dashboard refresh the card list + Recently Approved rail when
  // the empty-state CTA pushes a new invoice.
  onInvoiceCreated: () => void;
  // Lets the dashboard refresh the card list when send/resend changes
  // status from draft → sent.
  onInvoiceSent: () => void;
}) {
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Send button — Q4 inline pattern: idle → sending → sent (brief) → idle.
  // The "Resend" label comes from the data.status, not from this state.
  const [sendState, setSendState] = useState<SendButtonState>("idle");
  const [emailAgent, setEmailAgent] = useState(true);
  const [pushing, setPushing] = useState(false);

  const overrideOpts = asOrg ? { overrideAsOrg: asOrg } : {};
  const overrideQs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getInvoiceForSubmission(submissionId, overrideOpts);
      if (result.success) {
        setData(result.data ?? null);
      } else {
        setError(result.error ?? "Failed to load invoice");
      }
    } catch {
      setError("Failed to load invoice");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, asOrg]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Empty-state CTA: push to invoice ────────────────────────
  async function handlePushToInvoice() {
    setPushing(true);
    try {
      const result = await pushToInvoice(submissionId, overrideOpts);
      if (result?.success) {
        const invoiceHref = result.invoiceId
          ? `/brokerage/invoices/${result.invoiceId}${overrideQs}`
          : null;
        onShowToast(
          "success",
          "Invoice created",
          invoiceHref
            ? { action: { label: "View invoice", href: invoiceHref }, durationMs: 8000 }
            : undefined,
        );
        onInvoiceCreated();
        await load();
      } else {
        onShowToast("error", result?.error || "Failed to create invoice");
      }
    } catch {
      onShowToast("error", "Failed to create invoice");
    } finally {
      setPushing(false);
    }
  }

  // ── Send / Resend ──────────────────────────────────────────
  async function handleSend() {
    if (!data) return;
    setSendState("sending");
    try {
      const result = await sendInvoiceToAgent(data.id, {
        skipEmail: !emailAgent,
        ...overrideOpts,
      });
      if (result.success) {
        setSendState("sent");
        const verb = result.resent ? "Resent" : "Sent";
        const detail = result.emailed
          ? result.ccBrokerage
            ? ` to ${data.agentEmail} (CC brokerage)`
            : ` to ${data.agentEmail}`
          : " (status updated, email skipped)";
        onShowToast("success", `${verb}${detail}`);
        onInvoiceSent();
        await load();
        // Brief "✓ Sent" state, then settle to idle. Q4 pattern.
        setTimeout(() => setSendState("idle"), 1500);
      } else {
        setSendState("idle");
        onShowToast("error", result.error || "Failed to send invoice");
      }
    } catch {
      setSendState("idle");
      onShowToast("error", "Failed to send invoice");
    }
  }

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div data-testid="invoice-tab-loading" className="space-y-3 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10" data-testid="invoice-tab-error">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  // ── Empty state: rejected ──────────────────────────────────
  if (submissionStatus === "rejected") {
    return (
      <div data-testid="invoice-tab-empty-rejected" className="text-center py-10">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 mb-2">
          <Receipt className="h-5 w-5 text-red-400" />
        </div>
        <p className="text-slate-700 font-medium">No invoice will be created</p>
        <p className="text-sm text-slate-500 mt-1">
          This submission was rejected.
        </p>
      </div>
    );
  }

  // ── Empty state: pre-invoiced (no invoice yet) ─────────────
  if (!data) {
    return (
      <div data-testid="invoice-tab-empty" className="text-center py-10">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 mb-2">
          <Receipt className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-slate-700 font-medium">No invoice yet</p>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          This submission hasn&apos;t been pushed to an invoice.
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

  // ── Populated state ────────────────────────────────────────

  const statusLabel = INVOICE_STATUS_LABELS[data.status] ?? data.status;
  const statusColors = INVOICE_STATUS_COLORS[data.status] ?? "bg-slate-100 text-slate-600";
  const isPaid = data.status === "paid";
  const isVoid = data.status === "void";
  const isSent = data.status === "sent";
  const showSendButton = !isPaid && !isVoid;
  const sendLabel =
    sendState === "sending"
      ? "Sending…"
      : sendState === "sent"
        ? "✓ Sent"
        : isSent
          ? "Resend"
          : "Send to agent";

  return (
    <div data-testid="invoice-tab-populated" className="space-y-5">
      {/* Header — invoice number + status badge + view-link */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
            Invoice
          </p>
          <Link
            href={`/brokerage/invoices/${data.id}${overrideQs}`}
            className="text-base font-semibold text-blue-600 hover:underline"
          >
            {data.invoiceNumber}
          </Link>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${statusColors}`}
          data-testid="invoice-status-badge"
        >
          {isPaid && <CheckCircle2 className="h-3 w-3" />}
          {statusLabel}
        </span>
      </div>

      {/* Dates strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DateCell label="Issued" value={fmtDate(data.issueDate)} />
        <DateCell label="Due" value={fmtDate(data.dueDate)} subtle={data.paymentTerms} />
        <DateCell label="Sent" value={fmtDate(data.sentAt)} dim={!data.sentAt} />
        <DateCell
          label="Paid"
          value={fmtDate(data.paidDate)}
          dim={!data.paidDate}
          accent={isPaid ? "emerald" : undefined}
        />
      </div>

      {/* Amounts */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-1.5 font-mono text-sm">
        <AmountRow label="Total Commission" value={fmt(data.totalCommission)} bold />
        <AmountRow
          label={`Agent Payout (${data.agentSplitPct.toFixed(1)}%)`}
          value={fmt(data.agentPayout)}
          accent="emerald"
        />
        <AmountRow
          label={`House Split (${data.houseSplitPct.toFixed(1)}%)`}
          value={fmt(data.housePayout)}
          accent="blue"
        />
        {data.processingFeeAmt > 0 && (
          <AmountRow
            label={`Processing Fee (${data.processingFeePct.toFixed(2)}%)`}
            value={`−${fmt(data.processingFeeAmt)}`}
            accent="rose"
          />
        )}
      </div>

      {/* CTAs */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {showSendButton ? (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={emailAgent}
                onChange={(e) => setEmailAgent(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                data-testid="invoice-tab-email-checkbox"
              />
              Email agent
              {data.agentEmail && (
                <span className="text-slate-400 text-xs">({data.agentEmail})</span>
              )}
            </label>
            <button
              type="button"
              onClick={handleSend}
              disabled={sendState !== "idle"}
              data-testid="invoice-tab-send-button"
              data-resend={isSent ? "true" : "false"}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-70 transition-colors"
            >
              {sendState === "sending" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : sendState === "sent" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {sendLabel}
            </button>
          </div>
        ) : (
          <span className="text-sm text-slate-500">
            {isPaid ? `Paid on ${fmtDate(data.paidDate)}` : "Voided"}
          </span>
        )}

        <Link
          href={`/brokerage/invoices/${data.id}${overrideQs}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View invoice
        </Link>
      </div>
    </div>
  );
}

function DateCell({
  label,
  value,
  subtle,
  dim,
  accent,
}: {
  label: string;
  value: string;
  subtle?: string;
  dim?: boolean;
  accent?: "emerald";
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p
        className={`text-sm font-medium ${
          dim ? "text-slate-300" : accent === "emerald" ? "text-emerald-600" : "text-slate-700"
        }`}
      >
        {value}
      </p>
      {subtle && <p className="text-[11px] text-slate-400 mt-0.5">{subtle}</p>}
    </div>
  );
}

function AmountRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: "emerald" | "blue" | "rose";
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "blue"
        ? "text-blue-600"
        : accent === "rose"
          ? "text-rose-600"
          : bold
            ? "text-slate-900"
            : "text-slate-700";
  return (
    <div className="flex justify-between">
      <span className={bold ? "text-slate-700 font-semibold" : "text-slate-500"}>
        {label}
      </span>
      <span className={`${valueClass} ${bold ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
