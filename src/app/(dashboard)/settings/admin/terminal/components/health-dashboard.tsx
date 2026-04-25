"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, AlertTriangle, CheckCircle, RefreshCw, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { getIngestionHealth, triggerPipelineStage, resetDatasetErrors } from "../actions";
import type { IngestionHealthSummary, DatasetHealth, TriggerResult } from "../actions";

// ── Relative Time ────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Health Status Badge ──────────────────────────────────────

function StatusBadge({ status }: { status: DatasetHealth["healthStatus"] }) {
  const styles = {
    healthy: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    stale: "bg-slate-100 text-slate-500",
  };
  const icons = {
    healthy: <CheckCircle size={12} />,
    warning: <AlertTriangle size={12} />,
    failed: <XCircle size={12} />,
    stale: <Activity size={12} />,
  };
  const labels = {
    healthy: "Healthy",
    warning: "Warning",
    failed: "Failed",
    stale: "Stale",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {icons[status]} {labels[status]}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function HealthDashboard() {
  const [data, setData] = useState<IngestionHealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<TriggerResult | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const health = await getIngestionHealth();
      setData(health);
    } catch (err) {
      console.error("Failed to fetch health:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleTrigger = async (stage: "ingest" | "enrich" | "briefs") => {
    setTriggerLoading(stage);
    setTriggerResult(null);
    try {
      const result = await triggerPipelineStage(stage);
      setTriggerResult(result);
      // Refresh data after trigger
      await refresh();
    } catch (err) {
      setTriggerResult({ success: false, message: String(err) });
    } finally {
      setTriggerLoading(null);
    }
  };

  const handleResetErrors = async (datasetId: string) => {
    try {
      await resetDatasetErrors(datasetId);
      await refresh();
    } catch (err) {
      console.error("Reset failed:", err);
    }
  };

  const toggleError = (datasetId: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(datasetId)) next.delete(datasetId);
      else next.add(datasetId);
      return next;
    });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return <div className="text-slate-500 text-center py-10">Failed to load health data</div>;

  const datasetsWithErrors = data.datasets.filter((d) => d.lastError);

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Total Events" value={data.totalEvents.toLocaleString()} />
        <SummaryCard label="Last 24h" value={data.eventsLast24h.toLocaleString()} />
        <SummaryCard
          label="Pending Enrichment"
          value={data.pendingEnrichment.toLocaleString()}
          alert={data.pendingEnrichment > 100}
        />
        <SummaryCard
          label="Pending Briefs"
          value={data.pendingBriefs.toLocaleString()}
          alert={data.pendingBriefs > 100}
        />
        <SummaryCard
          label="Pipeline Health"
          value={`${data.healthyDatasets}/${data.totalDatasets}`}
          alert={data.healthyDatasets < data.totalDatasets}
        />
      </div>

      {/* ── Manual Triggers ───────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Manual Pipeline Triggers</h3>
        <div className="flex flex-wrap gap-2">
          {(["ingest", "enrich", "briefs"] as const).map((stage) => (
            <button
              key={stage}
              onClick={() => handleTrigger(stage)}
              disabled={triggerLoading !== null}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-lg text-sm font-medium text-slate-700 transition-colors"
            >
              {triggerLoading === stage ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {stage === "ingest" && "Run Ingestion"}
              {stage === "enrich" && "Run Enrichment"}
              {stage === "briefs" && "Generate Briefs"}
            </button>
          ))}
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-sm font-medium text-slate-500 transition-colors ml-auto"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {triggerResult && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${
            triggerResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}>
            {triggerResult.message}
          </div>
        )}
      </div>

      {/* ── Dataset Table ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Dataset Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-2 font-medium text-slate-500">Dataset</th>
                <th className="px-4 py-2 font-medium text-slate-500">Status</th>
                <th className="px-4 py-2 font-medium text-slate-500 text-right">Records</th>
                <th className="px-4 py-2 font-medium text-slate-500 text-right">24h</th>
                <th className="px-4 py-2 font-medium text-slate-500 text-right">Enrich</th>
                <th className="px-4 py-2 font-medium text-slate-500 text-right">Briefs</th>
                <th className="px-4 py-2 font-medium text-slate-500">Last Poll</th>
              </tr>
            </thead>
            <tbody>
              {data.datasets.map((ds) => (
                <tr key={ds.datasetId} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{ds.displayName}</div>
                    <div className="text-xs text-slate-400 font-mono">{ds.datasetId}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={ds.healthStatus} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                    {ds.recordCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                    {ds.eventsLast24h}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                    {ds.pendingEnrichment > 0 ? (
                      <span className="text-amber-600">{ds.pendingEnrichment}</span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                    {ds.pendingBriefs > 0 ? (
                      <span className="text-amber-600">{ds.pendingBriefs}</span>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {relativeTime(ds.lastCheckedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Error Log ─────────────────────────────────────── */}
      {datasetsWithErrors.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              Errors ({datasetsWithErrors.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100">
            {datasetsWithErrors.map((ds) => (
              <div key={ds.datasetId}>
                <button
                  onClick={() => toggleError(ds.datasetId)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-2">
                    {expandedErrors.has(ds.datasetId) ? (
                      <ChevronDown size={14} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-400" />
                    )}
                    <span className="text-sm font-medium text-slate-900">{ds.displayName}</span>
                    <StatusBadge status={ds.healthStatus} />
                  </div>
                  <span className="text-xs text-slate-400">{relativeTime(ds.lastCheckedAt)}</span>
                </button>
                {expandedErrors.has(ds.datasetId) && (
                  <div className="px-4 pb-3 ml-6">
                    <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-3 overflow-x-auto text-red-600 whitespace-pre-wrap">
                      {ds.lastError}
                    </pre>
                    <button
                      onClick={() => handleResetErrors(ds.datasetId)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Clear Error &amp; Reset to Idle
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary Card ─────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white border rounded-lg p-3 ${alert ? "border-amber-300" : "border-slate-200"}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-semibold font-mono ${alert ? "text-amber-600" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
