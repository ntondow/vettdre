"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import { getAutomationRuns, getAutomationRunStats } from "./actions";

// ── Types ────────────────────────────────────────────────────

interface AutomationRun {
  id: string;
  automationId: string;
  triggerData: Record<string, unknown>;
  actionsTaken: Record<string, unknown>[] | null;
  status: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface RunStats {
  success: number;
  partial: number;
  failed: number;
  total: number;
}

// ── Status Badge ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof CheckCircle2; bg: string; text: string; label: string }> = {
    success: { icon: CheckCircle2, bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Success" },
    partial: { icon: AlertTriangle, bg: "bg-amber-500/15", text: "text-amber-400", label: "Partial" },
    failed: { icon: XCircle, bg: "bg-red-500/15", text: "text-red-400", label: "Failed" },
  };
  const c = config[status] || config.failed;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ── Run Detail Modal ─────────────────────────────────────────

function RunDetailModal({
  run,
  onClose,
}: {
  run: AutomationRun;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-[modal-in_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
          <div>
            <h3 className="text-white font-semibold text-sm">Run Detail</h3>
            <p className="text-zinc-400 text-xs mt-0.5">
              {new Date(run.startedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            <button onClick={onClose} className="text-zinc-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-[60vh] p-5 space-y-4">
          {/* Trigger Data */}
          <div>
            <h4 className="text-zinc-300 text-xs font-medium uppercase tracking-wide mb-2">
              Trigger Data
            </h4>
            <pre className="bg-zinc-800 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto">
              {JSON.stringify(run.triggerData, null, 2)}
            </pre>
          </div>

          {/* Actions Taken */}
          {run.actionsTaken && run.actionsTaken.length > 0 && (
            <div>
              <h4 className="text-zinc-300 text-xs font-medium uppercase tracking-wide mb-2">
                Actions Executed
              </h4>
              <pre className="bg-zinc-800 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto">
                {JSON.stringify(run.actionsTaken, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {run.error && (
            <div>
              <h4 className="text-red-400 text-xs font-medium uppercase tracking-wide mb-2">
                Error
              </h4>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300">
                {run.error}
              </div>
            </div>
          )}

          {/* Timing */}
          <div>
            <h4 className="text-zinc-300 text-xs font-medium uppercase tracking-wide mb-2">
              Timing
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="text-zinc-500">Started</div>
                <div className="text-zinc-300">{new Date(run.startedAt).toLocaleString()}</div>
              </div>
              <div className="bg-zinc-800 rounded-lg p-3">
                <div className="text-zinc-500">Completed</div>
                <div className="text-zinc-300">
                  {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────

export default function RunHistoryPanel({
  automationId,
}: {
  automationId: string;
}) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null);
  const [loading, setLoading] = useState(true);

  const limit = 10;

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, statsRes] = await Promise.all([
        getAutomationRuns(automationId, page, limit, statusFilter),
        getAutomationRunStats(automationId),
      ]);
      if (runsRes.success) {
        setRuns(runsRes.runs as unknown as AutomationRun[]);
        setTotal(runsRes.total);
      }
      if (statsRes) setStats(statsRes);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [automationId, page, statusFilter]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mt-4 border-t border-zinc-700 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          <h4 className="text-sm font-medium text-zinc-300">Run History</h4>
          {stats && (
            <span className="text-xs text-zinc-500">
              ({stats.total} total)
            </span>
          )}
        </div>
        <button
          onClick={loadRuns}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Bar */}
      {stats && stats.total > 0 && (
        <div className="flex gap-3 mb-3">
          {[
            { label: "Success", count: stats.success, color: "text-emerald-400" },
            { label: "Partial", count: stats.partial, color: "text-amber-400" },
            { label: "Failed", count: stats.failed, color: "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1 text-xs">
              <span className={s.color}>{s.count}</span>
              <span className="text-zinc-500">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-1 mb-3">
        {["all", "success", "partial", "failed"].map((status) => (
          <button
            key={status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
            className={`px-2.5 py-1 rounded text-xs font-medium transition ${
              statusFilter === status
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Runs Table */}
      {loading ? (
        <div className="text-xs text-zinc-500 py-4 text-center">Loading...</div>
      ) : runs.length === 0 ? (
        <div className="text-xs text-zinc-500 py-4 text-center">
          No runs found. This automation hasn&apos;t been triggered yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRun(run)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition text-left"
            >
              <div className="flex items-center gap-3">
                <StatusBadge status={run.status} />
                <span className="text-xs text-zinc-300">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
              </div>
              {run.error && (
                <span className="text-xs text-red-400 truncate max-w-[200px]">
                  {run.error}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-2">
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded hover:bg-zinc-700 text-zinc-400 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRun && (
        <RunDetailModal run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}
