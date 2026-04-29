"use client";

import Link from "next/link";
import { CheckCircle, ExternalLink } from "lucide-react";

export type RecentlyApprovedItem = {
  id: string;
  agentName: string;
  propertyAddress: string;
  totalCommission?: number | string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  approvedAt: number; // epoch ms (sortable in-session)
};

const fmt = (n: number | string | null | undefined) => {
  const val = Number(n) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
};

// Slice 1c: right-column rail showing the last 5–10 submissions the manager
// approved in this session. Session-scoped only (no DB read) — once they leave
// the page the rail resets. Kept lightweight on purpose; the Approved tab in
// later slices is the persistent view.
export function RecentlyApprovedRail({
  items,
  asOrg,
}: {
  items: RecentlyApprovedItem[];
  asOrg?: string;
}) {
  if (items.length === 0) {
    return (
      <div
        data-testid="recently-approved-rail"
        className="bg-white border border-slate-200 rounded-xl p-4"
      >
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Recently Approved
        </h3>
        <p className="text-xs text-slate-400">
          Approvals from this session show here.
        </p>
      </div>
    );
  }

  const qs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";

  return (
    <div
      data-testid="recently-approved-rail"
      className="bg-white border border-slate-200 rounded-xl p-4"
    >
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Recently Approved
      </h3>
      <ul className="space-y-3">
        {items.slice(0, 10).map((item) => (
          <li key={item.id} className="text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 font-medium truncate">
                  {item.propertyAddress}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {item.agentName}
                  {item.totalCommission != null && (
                    <span className="ml-1 text-slate-400">
                      {"•"} {fmt(item.totalCommission)}
                    </span>
                  )}
                </p>
                {item.invoiceId && (
                  <Link
                    href={`/brokerage/invoices/${item.invoiceId}${qs}`}
                    className="inline-flex items-center gap-1 mt-0.5 text-xs text-blue-600 hover:underline"
                  >
                    {item.invoiceNumber ?? "View invoice"}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
