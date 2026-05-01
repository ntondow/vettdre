"use client";

// Slice 8: Brokerage Dashboard — expiring-compliance alert.
//
// Surfaces NYS license + E&O + other compliance docs that are expiring
// within the next 60 days. Mounted directly under <PrimaryCtaStrip /> so
// the warning sits at the top of the visual flow.
//
// Why this component exists at all (read carefully — license expirations
// are NYS-regulated and slice 8 took Compliance OUT of the brokerage
// sub-nav; without this alert there would be no daily-flow surface that
// flags an expiring doc until the manager visits Settings → Compliance):
//
//   - Smoke contract `tests/smoke/brokerage-subnav-shape.test.ts` asserts
//     this component is imported AND rendered in dashboard/page.tsx.
//     Don't remove either without updating that contract — the alert
//     stays a load-bearing safeguard for the relocation.
//
// Behavior:
//   - Calls existing `getExpiringItems(60, options)` from compliance/actions.ts
//     (no Prisma schema change needed; the helper already supports
//     daysAhead-parameterized lookahead and overrideAsOrg).
//   - Auto-hides when totalItems is 0 OR while loading. No initial-paint
//     flash (returns null until the count resolves).
//   - View link propagates ?as_org= through under override so super_admin
//     viewing a tenant lands on the tenant's compliance page, not their own.
//
// 60 days is hard-coded with intent. Standard "expiring soon" buffer in
// the audit doc; if Gulino later asks for 30 or 90, that's a one-line
// follow-up slice — don't parameterize prematurely.

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getExpiringItems } from "@/app/(dashboard)/brokerage/compliance/actions";

const EXPIRING_WINDOW_DAYS = 60;

export function ComplianceAlert({ asOrg }: { asOrg?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const opts = asOrg ? { overrideAsOrg: asOrg } : {};
    getExpiringItems(EXPIRING_WINDOW_DAYS, opts)
      .then((r) => {
        if (cancelled) return;
        setCount(r.totalItems ?? 0);
      })
      .catch(() => {
        if (cancelled) return;
        setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [asOrg]);

  // Loading or zero — render nothing. The double guard (`!count` covers
  // null; `count === 0` covers resolved-but-empty) is what the smoke
  // contract checks for.
  if (!count || count === 0) return null;

  const viewHref = asOrg ? `/brokerage/compliance?as_org=${asOrg}` : "/brokerage/compliance";
  const docWord = count === 1 ? "document" : "documents";

  return (
    <div
      data-testid="compliance-expiring-alert"
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-900">
          {count} compliance {docWord} expiring in next {EXPIRING_WINDOW_DAYS} days
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Track license, E&amp;O, and other expiring docs before they lapse — NYS license loss is a real-world risk.
        </p>
      </div>
      <Link
        href={viewHref}
        className="text-sm font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap"
      >
        View →
      </Link>
    </div>
  );
}
