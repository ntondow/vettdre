"use client";

import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import {
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  EXCLUSIVE_TYPE_LABELS,
  EXCLUSIVE_TYPE_COLORS,
  DEAL_TYPE_LABELS,
} from "@/lib/bms-types";

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

export type SubmissionCardData = {
  id: string;
  status: string;
  createdAt?: string;
  agentFirstName?: string;
  agentLastName?: string;
  agentEmail?: string;
  propertyAddress?: string;
  unit?: string | null;
  dealType?: string;
  exclusiveType?: string | null;
  totalCommission?: number | string | null;
  agentPayout?: number | string | null;
};

// Slice 1c: visible card. One per submission. Click anywhere on the card
// header to expand; clicking inside `actions` (where we render "View invoice"
// type external links from approved/invoiced cards) does not toggle the
// expand. Children render the inline-expand body when `expanded` is true.
export function SubmissionCard({
  s,
  expanded,
  onToggle,
  actions,
  children,
}: {
  s: SubmissionCardData;
  expanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article
      data-testid="submission-card"
      data-submission-id={s.id}
      data-expanded={expanded ? "true" : "false"}
      className={`bg-white border rounded-xl shadow-sm transition-all ${
        expanded ? "border-blue-300 shadow-md" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`submission-${s.id}-detail`}
        data-testid="submission-card-toggle"
        className="w-full text-left px-5 py-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-xl"
      >
        <div className="flex items-start justify-between gap-4">
          {/* Left: status + agent + property */}
          <div className="flex-1 min-w-0 flex items-start gap-3">
            <span
              className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mt-0.5 flex-shrink-0 ${
                SUBMISSION_STATUS_COLORS[s.status] || "bg-slate-100 text-slate-600"
              }`}
            >
              {SUBMISSION_STATUS_LABELS[s.status] || s.status}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {s.propertyAddress || "—"}
                {s.unit && (
                  <span className="text-slate-400 font-normal">{` · Unit ${s.unit}`}</span>
                )}
              </p>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {[s.agentFirstName, s.agentLastName].filter(Boolean).join(" ") || "—"}
                <span className="mx-1.5 text-slate-300">·</span>
                {s.dealType ? DEAL_TYPE_LABELS[s.dealType] || s.dealType : "—"}
                <span className="mx-1.5 text-slate-300">·</span>
                {fmtDate(s.createdAt)}
                {s.exclusiveType && (
                  <>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span
                      className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded-full align-middle ${
                        EXCLUSIVE_TYPE_COLORS[s.exclusiveType] || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {EXCLUSIVE_TYPE_LABELS[s.exclusiveType] || s.exclusiveType}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right: commission + payout + chevron */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Commission</p>
              <p className="text-sm font-semibold text-slate-700 tabular-nums">
                {fmt(s.totalCommission)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wide">Agent payout</p>
              {/* U-027 fix: payout no longer styled like a clickable link.
                  Slate text; explicit "Agent payout" label gives the dollar
                  amount semantic context. */}
              <p className="text-sm font-semibold text-slate-700 tabular-nums">
                {fmt(s.agentPayout)}
              </p>
            </div>
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {/* Inline action chips below the header (e.g. "View invoice" for
          approved/invoiced cards). Stops propagation so clicks here don't
          collapse the card. */}
      {actions && (
        <div
          className="px-5 pb-3 flex flex-wrap gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}

      {/* Inline expand region. Parent renders the detail body + footer
          buttons here when `expanded` is true. */}
      {expanded && (
        <div
          id={`submission-${s.id}-detail`}
          data-testid="submission-card-expand"
          className="border-t border-slate-200 bg-slate-50/40 rounded-b-xl"
        >
          {children}
        </div>
      )}
    </article>
  );
}

export function CardActionLink({
  href,
  label,
  icon: Icon = ExternalLink,
}: {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
    >
      {label}
      <Icon className="h-3 w-3" />
    </a>
  );
}
