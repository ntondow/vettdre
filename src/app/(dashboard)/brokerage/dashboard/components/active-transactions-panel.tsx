"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { getRecentActiveTransactions } from "../../transactions/actions";
import { PanelShell } from "./panel-shell";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/transaction-templates";
import type { TransactionStageType } from "@/lib/bms-types";

// Loose row type — getRecentActiveTransactions returns serialized
// data that the existing dashboard already consumes as `any[]`.
type Row = {
  id: string;
  propertyAddress: string;
  stage: string;
  agent?: { firstName?: string; lastName?: string } | null;
  tasks?: Array<{ isCompleted: boolean }>;
};

export function ActiveTransactionsPanel({ asOrg }: { asOrg?: string }) {
  const overrideOpts = asOrg ? { overrideAsOrg: asOrg } : {};
  const overrideQs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = (await getRecentActiveTransactions(5, overrideOpts)) as Row[];
      setRows(result || []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOrg, tick]);

  useEffect(() => {
    load();
  }, [load]);

  // Empty-state contract: hide the entire section when no active
  // transactions — the CTA strip already directs to /transactions for
  // this case.
  if (status === "ready" && (!rows || rows.length === 0)) {
    return null;
  }

  return (
    <PanelShell
      title="Active transactions"
      status={status}
      onRetry={() => setTick((t) => t + 1)}
      testId="active-transactions-panel"
      paddingClass="p-0"
      trailingRight={null}
      skeleton={
        <div className="px-5 py-5 space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-lg" />
          ))}
        </div>
      }
    >
      <div data-testid="active-transactions-list">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">
            Active transactions
          </span>
          <Link
            href={`/brokerage/transactions${overrideQs}`}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View all →
          </Link>
        </div>
        {(rows ?? []).map((tx) => {
          const totalTasks = tx.tasks?.length || 0;
          const completedTasks =
            tx.tasks?.filter((t) => t.isCompleted).length || 0;
          const progressPct =
            totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          const agent = tx.agent;
          return (
            <Link
              key={tx.id}
              href={`/brokerage/transactions/${tx.id}${overrideQs}`}
              className="flex items-center gap-4 px-5 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-slate-300 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {tx.propertyAddress}
                </p>
                {agent && (
                  <p className="text-xs text-slate-500">
                    {agent.firstName} {agent.lastName}
                  </p>
                )}
              </div>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                  STAGE_COLORS[tx.stage as TransactionStageType] ||
                  "bg-slate-100 text-slate-600"
                }`}
              >
                {STAGE_LABELS[tx.stage as TransactionStageType] || tx.stage}
              </span>
              <div className="w-16 flex-shrink-0">
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-0.5">
                  {completedTasks}/{totalTasks}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </PanelShell>
  );
}
