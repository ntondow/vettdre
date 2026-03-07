"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Search,
  ArrowUpDown,
  ExternalLink,
  Copy,
  Download,
  Trash2,
  Calculator,
} from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import { getDealAnalyses, deleteDealAnalysis, saveDealAnalysis } from "../actions";
import { logGeneratedDocument } from "../export/actions";

// ── Types ────────────────────────────────────────────────────

interface SavedDeal {
  id: string;
  name: string | null;
  address: string | null;
  borough: string | null;
  status: string;
  dealType: string;
  dealSource: string;
  inputs: any;
  outputs: any;
  updatedAt: string;
}

const STRUCTURE_LABELS: Record<string, string> = {
  conventional: "Conventional",
  bridge_refi: "Bridge + Refi",
  all_cash: "All Cash",
  assumable: "Assumable",
  syndication: "Syndication",
};

const BOROUGH_FILTERS = ["All", "NYC", "MANHATTAN", "BROOKLYN", "BRONX", "QUEENS", "STATEN ISLAND"];
const SORT_OPTIONS = [
  { key: "newest", label: "Newest First" },
  { key: "oldest", label: "Oldest First" },
  { key: "capRate", label: "Highest Cap Rate" },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]["key"];

// ── Helpers ──────────────────────────────────────────────────

function getMetric(deal: SavedDeal, key: string): number {
  const out = deal.outputs as any;
  if (!out) return 0;
  // Try multiple paths for each metric
  switch (key) {
    case "capRate":
      return out?.keyMetrics?.capRate ?? out?.returns?.capRate ?? out?.capRate ?? 0;
    case "cashOnCash":
      return out?.keyMetrics?.cashOnCash ?? out?.returns?.cashOnCash ?? out?.cashOnCash ?? 0;
    case "irr":
      return out?.keyMetrics?.irr ?? out?.returns?.irr ?? out?.irr ?? 0;
    default:
      return 0;
  }
}

function getStructureType(deal: SavedDeal): string {
  const inp = deal.inputs as any;
  return inp?.structure || inp?.structureType || "conventional";
}

function fmtPct(v: number): string {
  return v ? `${v.toFixed(2)}%` : "—";
}

// ── Component ────────────────────────────────────────────────

export default function SavedAnalysesPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<SavedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [boroughFilter, setBoroughFilter] = useState("All");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const result = await getDealAnalyses();
        setDeals(result as SavedDeal[]);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Filter + sort
  const filtered = useMemo(() => {
    let list = deals;

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.name?.toLowerCase().includes(q) ||
          d.address?.toLowerCase().includes(q),
      );
    }

    // Borough
    if (boroughFilter !== "All") {
      if (boroughFilter === "NYC") {
        list = list.filter((d) => d.borough);
      } else {
        list = list.filter((d) => d.borough?.toUpperCase() === boroughFilter);
      }
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === "oldest") return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      if (sortBy === "capRate") return getMetric(b, "capRate") - getMetric(a, "capRate");
      return 0;
    });

    return list;
  }, [deals, search, boroughFilter, sortBy]);

  // Actions
  const handleOpen = (id: string) => {
    router.push(`/deals/new?id=${id}`);
  };

  const handleDuplicate = async (deal: SavedDeal) => {
    try {
      await saveDealAnalysis({
        name: `${deal.name || "Untitled"} (Copy)`,
        address: deal.address || undefined,
        borough: deal.borough || undefined,
        inputs: deal.inputs,
        outputs: deal.outputs,
      });
      const result = await getDealAnalyses();
      setDeals(result as SavedDeal[]);
      showToast("Deal duplicated");
    } catch {
      showToast("Duplicate failed");
    }
  };

  const handleExportPdf = async (deal: SavedDeal) => {
    try {
      const { generateDealPdf } = await import("@/lib/deal-pdf");
      generateDealPdf({
        dealName: deal.name || "Deal Analysis",
        address: deal.address || undefined,
        borough: deal.borough || undefined,
        inputs: deal.inputs,
        outputs: deal.outputs,
      });
      await logGeneratedDocument({
        docType: "deal_pdf",
        propertyAddress: deal.address || "Unknown",
        dealId: deal.id,
        fileName: `Deal-${(deal.address || deal.name || "analysis").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.pdf`,
      });
      showToast("PDF downloaded");
    } catch {
      showToast("Export failed");
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDealAnalysis(deletingId);
      setDeals((prev) => prev.filter((d) => d.id !== deletingId));
      showToast("Deal deleted");
    } catch {
      showToast("Delete failed");
    }
    setDeletingId(null);
  };

  return (
    <ResearchLayout
      icon={Bookmark}
      iconColor="text-blue-400"
      iconBg="bg-blue-600/20"
      title="Saved Analyses"
      subtitle="Browse and manage your saved deal analyses"
    >
      {/* Search + Filter bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or address..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {BOROUGH_FILTERS.map((b) => (
              <button
                key={b}
                onClick={() => setBoroughFilter(b)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  boroughFilter === b
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 appearance-none focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key} className="bg-[#0B0F19]">{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-white/5 rounded-xl h-44" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center mb-4">
            <Bookmark className="w-6 h-6 text-blue-400" />
          </div>
          <h3 className="text-sm font-medium text-white mb-1">
            {search || boroughFilter !== "All" ? "No matching analyses" : "No saved analyses yet"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {search || boroughFilter !== "All"
              ? "Try adjusting your search or filters."
              : "Run an analysis in the Deal Modeler to see it here."}
          </p>
        </div>
      )}

      {/* Card Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((deal) => {
            const structureType = getStructureType(deal);
            const capRate = getMetric(deal, "capRate");
            const coc = getMetric(deal, "cashOnCash");
            const irr = getMetric(deal, "irr");

            return (
              <div
                key={deal.id}
                className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {deal.name || deal.address || "Untitled"}
                    </h3>
                    {deal.address && deal.name && (
                      <p className="text-xs text-slate-500 truncate mt-0.5">{deal.address}</p>
                    )}
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-600/15 text-blue-400 flex-shrink-0 ml-2">
                    {STRUCTURE_LABELS[structureType] || structureType}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">Cap Rate</p>
                    <p className="text-sm font-semibold text-white">{fmtPct(capRate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">Cash-on-Cash</p>
                    <p className="text-sm font-semibold text-white">{fmtPct(coc)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 mb-0.5">IRR</p>
                    <p className="text-sm font-semibold text-white">{fmtPct(irr)}</p>
                  </div>
                </div>

                {/* Date + Borough */}
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-3">
                  <span>Updated {new Date(deal.updatedAt).toLocaleDateString()}</span>
                  {deal.borough && (
                    <>
                      <span className="text-slate-700">·</span>
                      <span>{deal.borough}</span>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-3 border-t border-white/5">
                  <button
                    onClick={() => handleOpen(deal.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </button>
                  <button
                    onClick={() => handleDuplicate(deal)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs transition-colors"
                    title="Duplicate"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleExportPdf(deal)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs transition-colors"
                    title="Export PDF"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(deal.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-red-600/20 text-slate-400 hover:text-red-400 rounded-lg text-xs transition-colors ml-auto"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[#131825] border border-white/10 rounded-xl p-6 max-w-sm w-full mx-4 animate-[modal-in_0.2s_ease]">
            <h3 className="text-sm font-semibold text-white mb-2">Delete Analysis?</h3>
            <p className="text-xs text-slate-400 mb-5">
              This action cannot be undone. The deal analysis and all associated data will be permanently removed.
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
