"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Users,
  Receipt,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import { getKpiComparison, type KpiPeriod } from "../actions";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

type Snapshot = {
  houseRevenue: number;
  agentPayouts: number;
  pendingInvoices: number;
  closedDeals: number;
};

const PERIOD_PRIOR_LABELS: Record<KpiPeriod, string> = {
  month: "vs prior 30d",
  quarter: "vs prior 90d",
  year: "vs prior 365d",
};

export function KpiStrip({
  asOrg,
  period,
}: {
  asOrg?: string;
  period: KpiPeriod;
}) {
  const overrideOpts = asOrg ? { overrideAsOrg: asOrg } : {};
  const [data, setData] = useState<{ current: Snapshot; previous: Snapshot } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await getKpiComparison(period, overrideOpts);
      if (!result) {
        setStatus("error");
        return;
      }
      setData({ current: result.current, previous: result.previous });
      setStatus("ready");
    } catch {
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, asOrg, tick]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") {
    return (
      <div data-testid="kpi-strip-loading" className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div
        data-testid="kpi-strip-error"
        className="bg-white border border-slate-200 rounded-xl p-5 text-center"
      >
        <AlertCircle className="h-7 w-7 text-rose-400 mx-auto mb-2" />
        <p className="text-sm text-slate-600 mb-3">
          Couldn&apos;t load KPIs.
        </p>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const priorLabel = PERIOD_PRIOR_LABELS[period];

  return (
    <div data-testid="kpi-strip" className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <KpiCard
        icon={<DollarSign className="h-5 w-5" />}
        iconBg="bg-emerald-100 text-emerald-600"
        label="House Revenue"
        value={fmt(data.current.houseRevenue)}
        delta={pctDelta(data.current.houseRevenue, data.previous.houseRevenue)}
        priorLabel={priorLabel}
      />
      <KpiCard
        icon={<Users className="h-5 w-5" />}
        iconBg="bg-blue-100 text-blue-600"
        label="Agent Payouts"
        value={fmt(data.current.agentPayouts)}
        delta={pctDelta(data.current.agentPayouts, data.previous.agentPayouts)}
        priorLabel={priorLabel}
      />
      <KpiCard
        icon={<Receipt className="h-5 w-5" />}
        iconBg="bg-amber-100 text-amber-600"
        label="Pending Invoices"
        value={fmt(data.current.pendingInvoices)}
        delta={pctDelta(
          data.current.pendingInvoices,
          data.previous.pendingInvoices,
        )}
        priorLabel={priorLabel}
        // Pending going up isn't unambiguously "good" — flip the
        // semantic so green = went down, amber = went up.
        invertColor
      />
      <KpiCard
        icon={<CheckCircle2 className="h-5 w-5" />}
        iconBg="bg-violet-100 text-violet-600"
        label="Closed Deals"
        value={String(data.current.closedDeals)}
        delta={countDelta(data.current.closedDeals, data.previous.closedDeals)}
        priorLabel={priorLabel}
      />
    </div>
  );
}

function pctDelta(
  current: number,
  previous: number,
): { display: string; direction: "up" | "down" | "flat" } {
  if (previous === 0 && current === 0) return { display: "—", direction: "flat" };
  if (previous === 0) return { display: "new", direction: "up" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { display: "flat", direction: "flat" };
  const sign = pct > 0 ? "+" : "−";
  return {
    display: `${sign}${Math.abs(pct).toFixed(0)}%`,
    direction: pct > 0 ? "up" : "down",
  };
}

function countDelta(
  current: number,
  previous: number,
): { display: string; direction: "up" | "down" | "flat" } {
  const diff = current - previous;
  if (diff === 0) return { display: "flat", direction: "flat" };
  const sign = diff > 0 ? "+" : "−";
  return {
    display: `${sign}${Math.abs(diff)}`,
    direction: diff > 0 ? "up" : "down",
  };
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  delta,
  priorLabel,
  invertColor,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  delta: { display: string; direction: "up" | "down" | "flat" };
  priorLabel: string;
  invertColor?: boolean;
}) {
  // For most KPIs, "up" is good (emerald). For pending invoices,
  // "down" is good — invertColor flips the semantic.
  const good = invertColor ? "down" : "up";
  const colorClass =
    delta.direction === good
      ? "text-emerald-600"
      : delta.direction === "flat"
        ? "text-slate-400"
        : "text-rose-500";

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 md:p-5">
      <div className="flex items-center gap-2 md:gap-2.5 mb-2 md:mb-3">
        <div
          className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center ${iconBg}`}
        >
          {icon}
        </div>
        <span className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-xl md:text-2xl font-bold text-slate-900">{value}</div>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`text-xs font-medium ${colorClass}`}>
          {delta.direction === "up" && delta.display !== "flat" && (
            <TrendingUp className="inline h-3 w-3 mr-0.5" />
          )}
          {delta.direction === "down" && delta.display !== "flat" && (
            <TrendingDown className="inline h-3 w-3 mr-0.5" />
          )}
          {delta.display}
        </span>
        <span className="text-[11px] text-slate-400">{priorLabel}</span>
      </div>
    </div>
  );
}
