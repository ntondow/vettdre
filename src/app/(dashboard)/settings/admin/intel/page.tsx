"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw, Database, Filter } from "lucide-react";

interface UnresolvedRecord {
  id: string;
  sourceTable: string;
  sourceRecordId: string;
  reason: string;
  raw: any;
  createdAt: string;
}

export default function UnresolvedRecordsPage() {
  const [records, setRecords] = useState<UnresolvedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => {
    loadRecords();
  }, [filter, page]);

  async function loadRecords() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        ...(filter !== "all" ? { source: filter } : {}),
      });
      const res = await fetch(`/api/intel/unresolved?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (err) {
      console.error("Failed to load unresolved records:", err);
    } finally {
      setLoading(false);
    }
  }

  const sources = ["all", "tax_liens", "hpd_registrations", "acris_legals", "exemptions", "nys_entities"];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Database size={20} />
            Unresolved Ingest Records
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Records that could not be resolved to a building in the spine. Review and resolve manually.
          </p>
        </div>
        <button
          onClick={() => loadRecords()}
          className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <Filter size={14} className="text-gray-400" />
        {sources.map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setPage(0); }}
            className={`px-2.5 py-1 text-xs rounded transition-colors ${
              filter === s
                ? "bg-blue-100 text-blue-700 font-medium"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All Sources" : s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Record ID</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Reason</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Created</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Data</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                  No unresolved records{filter !== "all" ? ` for ${filter}` : ""}
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.sourceTable}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 truncate max-w-[200px]">{r.sourceRecordId}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      <AlertTriangle size={10} />
                      {r.reason}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <details className="text-xs">
                      <summary className="cursor-pointer text-blue-600 hover:text-blue-800">View JSON</summary>
                      <pre className="mt-1 p-2 bg-gray-100 rounded text-[10px] max-h-40 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(r.raw, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {records.length > 0 && (
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-xs text-gray-400">Page {page + 1}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={records.length < PAGE_SIZE}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
