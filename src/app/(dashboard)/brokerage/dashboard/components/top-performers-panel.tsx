"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Trophy, Flame } from "lucide-react";
import { getLeaderboard } from "../../leaderboard/actions";
import { PanelShell } from "./panel-shell";
import type { LeaderboardEntry } from "@/lib/bms-types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const MEDALS = ["🥇", "🥈", "🥉"];

export function TopPerformersPanel({ asOrg }: { asOrg?: string }) {
  const overrideOpts = asOrg ? { overrideAsOrg: asOrg } : {};
  const overrideQs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await getLeaderboard("current_month", overrideOpts);
      setEntries(result || []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOrg, tick]);

  useEffect(() => {
    load();
  }, [load]);

  // Empty-state contract from slice 4 spec: hide entire panel when no
  // leaderboard entries — show "onboard agents" empty state instead of
  // an empty card.
  if (status === "ready" && (!entries || entries.length === 0)) {
    return (
      <PanelShell
        title="Top performers"
        status="ready"
        testId="top-performers-panel-empty"
      >
        <div className="text-center py-4">
          <Trophy className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium mb-2">
            No agent activity yet.
          </p>
          <Link
            href={`/brokerage/agents${overrideQs}`}
            className="text-xs text-blue-600 hover:underline font-medium"
          >
            Onboard agents →
          </Link>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Top performers"
      status={status}
      onRetry={() => setTick((t) => t + 1)}
      testId="top-performers-panel"
      trailingRight={
        entries && entries.length > 0 ? (
          <Link
            href={`/brokerage/leaderboard${overrideQs}`}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View all →
          </Link>
        ) : null
      }
    >
      <div className="space-y-3">
        {(entries ?? []).slice(0, 3).map((entry) => (
          <div key={entry.agentId} className="flex items-center gap-3">
            <span className="text-lg w-7 text-center">
              {MEDALS[entry.rank - 1] ?? `#${entry.rank}`}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {entry.agentName}
              </p>
              <p className="text-xs text-slate-500">
                {entry.dealsClosed.actual} deal
                {entry.dealsClosed.actual !== 1 ? "s" : ""} ·{" "}
                {fmt(entry.revenue.actual)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {entry.streak > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-orange-500">
                  <Flame className="h-3 w-3" />
                  {entry.streak}
                </span>
              )}
              <span
                className={`text-sm font-bold ${
                  entry.overallScore >= 100 ? "text-green-600" : "text-blue-600"
                }`}
              >
                {entry.overallScore}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
