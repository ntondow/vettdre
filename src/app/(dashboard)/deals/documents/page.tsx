"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Search,
  FileText,
  FileSignature,
  FileSpreadsheet,
  Calculator,
  GitCompare,
  Trash2,
  Calendar,
} from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import { getGeneratedDocuments, deleteGeneratedDocument } from "../export/actions";

// ── Types ────────────────────────────────────────────────────

interface Document {
  id: string;
  fileName: string;
  fileType: string;
  storagePath: string;
  entityId: string;
  createdAt: string;
  docType: string;
}

const DOC_TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  investment_summary: { label: "Investment Summary", icon: FileText, color: "text-emerald-400" },
  loi: { label: "LOI", icon: FileSignature, color: "text-violet-400" },
  bov: { label: "BOV", icon: FileSpreadsheet, color: "text-amber-400" },
  deal_pdf: { label: "Deal PDF", icon: Calculator, color: "text-blue-400" },
  comparison: { label: "Comparison", icon: GitCompare, color: "text-violet-400" },
};

const FILTER_OPTIONS = ["All", "investment_summary", "loi", "bov", "deal_pdf", "comparison"] as const;
const FILTER_LABELS: Record<string, string> = {
  All: "All",
  investment_summary: "Inv Summary",
  loi: "LOI",
  bov: "BOV",
  deal_pdf: "Deal PDF",
  comparison: "Comparison",
};

// ── Component ────────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const result = await getGeneratedDocuments();
        setDocs(result);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const filtered = useMemo(() => {
    let list = docs;
    if (filter !== "All") {
      list = list.filter((d) => d.docType === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((d) => d.fileName.toLowerCase().includes(q));
    }
    return list;
  }, [docs, filter, search]);

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteGeneratedDocument(deletingId);
      setDocs((prev) => prev.filter((d) => d.id !== deletingId));
      showToast("Document deleted");
    } catch {
      showToast("Delete failed");
    }
    setDeletingId(null);
  };

  return (
    <ResearchLayout
      icon={FolderOpen}
      iconColor="text-slate-400"
      iconBg="bg-slate-600/20"
      title="Documents"
      subtitle="Generated reports and deal documents"
    >
      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f
                  ? "bg-slate-600 text-white"
                  : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-white/5 rounded-xl h-16" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-600/20 flex items-center justify-center mb-4">
            <FolderOpen className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-medium text-white mb-1">
            {search || filter !== "All" ? "No matching documents" : "No documents generated yet"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-4">
            {search || filter !== "All"
              ? "Try adjusting your search or filters."
              : "Generate documents from the tools below to see them here."}
          </p>
          {!search && filter === "All" && (
            <div className="flex flex-wrap gap-2 justify-center">
              <Link
                href="/deals/export/investment-summary"
                className="px-3 py-1.5 bg-emerald-600/15 text-emerald-400 rounded-lg text-xs hover:bg-emerald-600/25 transition-colors"
              >
                Investment Summary
              </Link>
              <Link
                href="/deals/export/loi"
                className="px-3 py-1.5 bg-violet-600/15 text-violet-400 rounded-lg text-xs hover:bg-violet-600/25 transition-colors"
              >
                LOI Generator
              </Link>
              <Link
                href="/deals/export/bov"
                className="px-3 py-1.5 bg-amber-600/15 text-amber-400 rounded-lg text-xs hover:bg-amber-600/25 transition-colors"
              >
                BOV Generator
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Document List */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const config = DOC_TYPE_CONFIG[doc.docType] || {
              label: doc.docType,
              icon: FileText,
              color: "text-slate-400",
            };
            const Icon = config.icon;

            return (
              <div
                key={doc.id}
                className="flex items-center gap-4 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 hover:border-white/10 transition-colors group"
              >
                {/* Icon */}
                <div className={`w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4.5 h-4.5 ${config.color}`} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{doc.fileName}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                    <span className={`${config.color}`}>{config.label}</span>
                    <span className="text-slate-700">·</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <button
                  onClick={() => setDeletingId(doc.id)}
                  className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-600/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#131825] border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 animate-[modal-in_0.2s_ease]">
            <h3 className="text-sm font-semibold text-white mb-2">Delete Document?</h3>
            <p className="text-xs text-slate-400 mb-5">
              This will remove the document record. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50 animate-[fade-in_0.2s_ease]">
          {toast}
        </div>
      )}
    </ResearchLayout>
  );
}
