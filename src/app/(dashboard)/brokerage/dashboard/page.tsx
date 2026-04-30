"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { getDashboardHeader, type KpiPeriod } from "./actions";
import { KpiStrip } from "./components/kpi-strip";
import { PrimaryCtaStrip } from "./components/primary-cta-strip";
import { TasksPanel } from "./components/tasks-panel";
import { TopPerformersPanel } from "./components/top-performers-panel";
import { ActiveTransactionsPanel } from "./components/active-transactions-panel";

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

const PERIOD_DAYS: Record<KpiPeriod, number> = {
  month: 30,
  quarter: 90,
  year: 365,
};

function periodSubtitle(period: KpiPeriod): string {
  const days = PERIOD_DAYS[period];
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Slice 4: Manager Dashboard
//
// Per the approved wireframe:
//   1. Header (greeting using REAL user name even under override) +
//      period selector with explicit date-range subtitle (closes U-009).
//   2. Primary CTA strip — "n submissions waiting" or "All caught up.
//      View pipeline →". Closes U-011 (no-CTA bug).
//   3. 4 KPIs MAX with vs-prior-period delta — closes U-006 (KPI
//      overload) and U-007 (the duplicated finance panel is gone).
//   4. Two-column: Today's tasks + Top performers.
//   5. Active transactions list (max 5 rows; auto-hidden when empty).
//
// Per addition (A): each panel manages its own loading/error/retry —
// a slow fetch in one panel must not hang the page.
//
// Per addition (B): greeting uses ctx.userName (the real user) even
// when ?as_org= is active. The override banner already conveys data
// scope.
//
// Slice 5 closure (U-010): the screening KPI strip and its supporting
// action are removed from this directory entirely — see PR description.

export default function BrokerageDashboardPage() {
  const sp = useSearchParams();
  const asOrg = sp.get("as_org") ?? undefined;
  const overrideOpts = useMemo(
    () => (asOrg ? { overrideAsOrg: asOrg } : {}),
    [asOrg],
  );

  const [period, setPeriod] = useState<KpiPeriod>("month");
  const [header, setHeader] = useState<{
    userName: string;
    isOverride: boolean;
    viewingOrgName?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardHeader(overrideOpts)
      .then((result) => {
        if (cancelled || !result) return;
        setHeader(result);
      })
      .catch(() => {
        /* greeting falls back to a generic header — no need to error
           the whole page */
      });
    return () => {
      cancelled = true;
    };
  }, [overrideOpts]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {header?.userName
              ? `Welcome back, ${header.userName}`
              : "Brokerage Overview"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {periodSubtitle(period)}
          </p>
        </div>
        <div className="flex bg-slate-100 rounded-lg p-0.5 self-start">
          {(Object.keys(PERIOD_LABELS) as KpiPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-blue-100 text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Primary CTA strip ─────────────────────────────── */}
      <PrimaryCtaStrip asOrg={asOrg} />

      {/* ── 4 KPIs (with vs-prior delta) ──────────────────── */}
      <KpiStrip asOrg={asOrg} period={period} />

      {/* ── Tasks + Top Performers (two-column) ───────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        <TasksPanel asOrg={asOrg} />
        <TopPerformersPanel asOrg={asOrg} />
      </div>

      {/* ── Active transactions (auto-hides when empty) ───── */}
      <ActiveTransactionsPanel asOrg={asOrg} />
    </div>
  );
}
