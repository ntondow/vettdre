"use client";

import { useState, useCallback } from "react";
import {
  GitCompare,
  Layers,
  BarChart3,
  ArrowRight,
  Check,
  Download,
  ChevronDown,
} from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import { getDealAnalyses } from "../actions";
import { runStructureComparison, loadDealsForComparison } from "./actions";
import { logGeneratedDocument } from "../export/actions";
import type { DealStructureType, DealAnalysis } from "@/lib/deal-structure-engine";

// ── Constants ────────────────────────────────────────────────

const STRUCTURE_OPTIONS: { key: DealStructureType; label: string }[] = [
  { key: "conventional", label: "Conventional" },
  { key: "bridge_refi", label: "Bridge + Refi" },
  { key: "all_cash", label: "All Cash" },
  { key: "assumable", label: "Assumable" },
  { key: "syndication", label: "Syndication" },
];

const METRICS: { key: string; label: string; format: (v: number) => string; higherBetter: boolean }[] = [
  { key: "capRate", label: "Cap Rate", format: (v) => `${v.toFixed(2)}%`, higherBetter: true },
  { key: "cashOnCash", label: "Cash-on-Cash", format: (v) => `${v.toFixed(2)}%`, higherBetter: true },
  { key: "irr", label: "IRR", format: (v) => `${v.toFixed(2)}%`, higherBetter: true },
  { key: "dscr", label: "DSCR", format: (v) => `${v.toFixed(2)}x`, higherBetter: true },
  { key: "equityMultiple", label: "Equity Multiple", format: (v) => `${v.toFixed(2)}x`, higherBetter: true },
  { key: "totalProfit", label: "Total Profit", format: (v) => `$${Math.round(v).toLocaleString()}`, higherBetter: true },
];

const DEAL_METRICS: { key: string; label: string; format: (v: number) => string; higherBetter: boolean }[] = [
  { key: "purchasePrice", label: "Purchase Price", format: (v) => `$${Math.round(v).toLocaleString()}`, higherBetter: false },
  { key: "pricePerUnit", label: "Price / Unit", format: (v) => `$${Math.round(v).toLocaleString()}`, higherBetter: false },
  { key: "capRate", label: "Cap Rate", format: (v) => `${v.toFixed(2)}%`, higherBetter: true },
  { key: "cashOnCash", label: "Cash-on-Cash", format: (v) => `${v.toFixed(2)}%`, higherBetter: true },
  { key: "irr", label: "IRR", format: (v) => `${v.toFixed(2)}%`, higherBetter: true },
  { key: "noi", label: "NOI", format: (v) => `$${Math.round(v).toLocaleString()}`, higherBetter: true },
  { key: "dscr", label: "DSCR", format: (v) => `${v.toFixed(2)}x`, higherBetter: true },
  { key: "equityRequired", label: "Equity Required", format: (v) => `$${Math.round(v).toLocaleString()}`, higherBetter: false },
];

type Tab = "structure" | "deal";

interface DealOption {
  id: string;
  name: string | null;
  address: string | null;
  borough: string | null;
  structure?: string | null;
  inputs: any;
  outputs: any;
}

// ── Helpers ──────────────────────────────────────────────────

function extractStructureMetric(analysis: DealAnalysis, key: string): number {
  return (analysis as any)[key] ?? 0;
}

function extractDealMetric(deal: DealOption, key: string): number {
  const inp = deal.inputs as any;
  const out = deal.outputs as any;
  switch (key) {
    case "purchasePrice":
      return inp?.purchasePrice || inp?.purchase_price || 0;
    case "pricePerUnit": {
      const price = inp?.purchasePrice || inp?.purchase_price || 0;
      const units = inp?.units || inp?.totalUnits || 1;
      return units > 0 ? price / units : 0;
    }
    case "capRate":
      return out?.keyMetrics?.capRate ?? out?.returns?.capRate ?? out?.capRate ?? 0;
    case "cashOnCash":
      return out?.keyMetrics?.cashOnCash ?? out?.returns?.cashOnCash ?? out?.cashOnCash ?? 0;
    case "irr":
      return out?.keyMetrics?.irr ?? out?.returns?.irr ?? out?.irr ?? 0;
    case "noi":
      return out?.noi ?? out?.income?.noi ?? 0;
    case "dscr":
      return out?.keyMetrics?.dscr ?? out?.returns?.dscr ?? out?.dscr ?? 0;
    case "equityRequired":
      return out?.financing?.equityRequired ?? out?.equity ?? out?.totalEquity ?? 0;
    default:
      return 0;
  }
}

// ── Component ────────────────────────────────────────────────

export default function ComparisonPage() {
  const [tab, setTab] = useState<Tab>("structure");
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [dealsLoaded, setDealsLoaded] = useState(false);
  const [toast, setToast] = useState("");

  // Structure comparison
  const [selectedDealId, setSelectedDealId] = useState("");
  const [selectedStructures, setSelectedStructures] = useState<DealStructureType[]>([]);
  const [structureResults, setStructureResults] = useState<DealAnalysis[] | null>(null);
  const [structureLoading, setStructureLoading] = useState(false);

  // Deal comparison
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [dealResults, setDealResults] = useState<DealOption[] | null>(null);
  const [dealLoading, setDealLoading] = useState(false);

  const loadDeals = useCallback(async () => {
    if (dealsLoaded) return;
    try {
      const result = await getDealAnalyses();
      setDeals(result as DealOption[]);
      setDealsLoaded(true);
    } catch {
      setDeals([]);
      setDealsLoaded(true);
    }
  }, [dealsLoaded]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Structure comparison handlers
  const toggleStructure = (key: DealStructureType) => {
    setSelectedStructures((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : prev.length < 3 ? [...prev, key] : prev,
    );
  };

  const runComparison = async () => {
    if (!selectedDealId || selectedStructures.length < 2) return;
    setStructureLoading(true);
    try {
      const results = await runStructureComparison(selectedDealId, selectedStructures);
      setStructureResults(results);
    } catch {
      showToast("Comparison failed");
    } finally {
      setStructureLoading(false);
    }
  };

  const exportComparison = async () => {
    if (!structureResults) return;
    try {
      const { generateDealPdf } = await import("@/lib/deal-pdf");
      const deal = deals.find((d) => d.id === selectedDealId);
      generateDealPdf({
        dealName: deal?.name || "Structure Comparison",
        address: deal?.address || undefined,
        inputs: deal?.inputs,
        outputs: deal?.outputs,
        comparisonResults: structureResults,
      });
      await logGeneratedDocument({
        docType: "comparison",
        propertyAddress: deal?.address || "Unknown",
        dealId: selectedDealId,
        fileName: `Comparison-${(deal?.address || "deal").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.pdf`,
      });
      showToast("Comparison PDF downloaded");
    } catch {
      showToast("Export failed");
    }
  };

  // Deal comparison handlers
  const toggleDeal = (id: string) => {
    setSelectedDealIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : prev.length < 4 ? [...prev, id] : prev,
    );
  };

  const runDealComparison = async () => {
    if (selectedDealIds.length < 2) return;
    setDealLoading(true);
    try {
      const results = await loadDealsForComparison(selectedDealIds);
      setDealResults(results as DealOption[]);
    } catch {
      showToast("Comparison failed");
    } finally {
      setDealLoading(false);
    }
  };

  // Best value index finders
  function getBestStructureIdx(metricKey: string, higherBetter: boolean): number {
    if (!structureResults || structureResults.length === 0) return -1;
    let bestIdx = 0;
    let bestVal = extractStructureMetric(structureResults[0], metricKey);
    for (let i = 1; i < structureResults.length; i++) {
      const val = extractStructureMetric(structureResults[i], metricKey);
      if (higherBetter ? val > bestVal : val < bestVal) {
        bestIdx = i;
        bestVal = val;
      }
    }
    return bestIdx;
  }

  function getBestDealIdx(metricKey: string, higherBetter: boolean): number {
    if (!dealResults || dealResults.length === 0) return -1;
    let bestIdx = 0;
    let bestVal = extractDealMetric(dealResults[0], metricKey);
    for (let i = 1; i < dealResults.length; i++) {
      const val = extractDealMetric(dealResults[i], metricKey);
      if (higherBetter ? val > bestVal : val < bestVal) {
        bestIdx = i;
        bestVal = val;
      }
    }
    return bestIdx;
  }

  return (
    <ResearchLayout
      icon={GitCompare}
      iconColor="text-violet-400"
      iconBg="bg-violet-600/20"
      title="Deal Comparison"
      subtitle="Compare structures and deals side-by-side"
    >
      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] border border-white/5 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => { setTab("structure"); loadDeals(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "structure" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          <Layers className="w-4 h-4" />
          Structure Comparison
        </button>
        <button
          onClick={() => { setTab("deal"); loadDeals(); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "deal" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Deal Comparison
        </button>
      </div>

      {/* ── Structure Comparison Tab ──────────────────────────── */}
      {tab === "structure" && (
        <div className="space-y-6">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <label className="block text-sm font-medium text-slate-300 mb-2">Select a Deal</label>
            <div className="relative">
              <select
                value={selectedDealId}
                onChange={(e) => { setSelectedDealId(e.target.value); setStructureResults(null); }}
                onFocus={loadDeals}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white appearance-none pr-10 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">Choose a saved deal...</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#0B0F19]">
                    {d.name || d.address || d.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select 2-3 Structures to Compare
              </label>
              <div className="flex flex-wrap gap-2">
                {STRUCTURE_OPTIONS.map((opt) => {
                  const selected = selectedStructures.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => toggleStructure(opt.key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        selected
                          ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
                          : "bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        selected ? "bg-violet-600 border-violet-600" : "border-white/20"
                      }`}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={runComparison}
              disabled={!selectedDealId || selectedStructures.length < 2 || structureLoading}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {structureLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              Compare Structures
            </button>
          </div>

          {/* Structure Results */}
          {structureResults && structureResults.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-300">Comparison Results</h3>
                <button
                  onClick={exportComparison}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PDF
                </button>
              </div>

              <div className={`grid gap-4 ${
                structureResults.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"
              }`}>
                {structureResults.map((result, idx) => (
                  <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-white mb-3">
                      {result.label || result.structure}
                    </h4>
                    <div className="space-y-2">
                      {METRICS.map((m) => {
                        const val = extractStructureMetric(result, m.key);
                        const bestIdx = getBestStructureIdx(m.key, m.higherBetter);
                        const isBest = bestIdx === idx && val !== 0;
                        return (
                          <div key={m.key} className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">{m.label}</span>
                            <span className={`text-sm font-medium ${
                              isBest ? "text-emerald-400" : "text-white"
                            }`}>
                              {val !== 0 ? m.format(val) : "N/A"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!structureResults && !structureLoading && !selectedDealId && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center mb-4">
                <Layers className="w-6 h-6 text-violet-400" />
              </div>
              <h3 className="text-sm font-medium text-white mb-1">Structure Comparison</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Select a saved deal and pick 2-3 financing structures to see how they perform side-by-side.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Deal Comparison Tab ───────────────────────────────── */}
      {tab === "deal" && (
        <div className="space-y-6">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select 2-4 Deals to Compare
            </label>
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {deals.length === 0 && !dealsLoaded && (
                <button onClick={loadDeals} className="text-sm text-violet-400 hover:underline">
                  Load deals...
                </button>
              )}
              {deals.length === 0 && dealsLoaded && (
                <p className="text-sm text-slate-500 py-4 text-center">No saved deals found</p>
              )}
              {deals.map((d) => {
                const selected = selectedDealIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleDeal(d.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      selected
                        ? "bg-violet-600/15 border border-violet-500/30"
                        : "bg-white/[0.02] border border-transparent hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? "bg-violet-600 border-violet-600" : "border-white/20"
                    }`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white truncate">{d.name || d.address || "Untitled"}</p>
                      {d.address && d.name && (
                        <p className="text-xs text-slate-500 truncate">{d.address}</p>
                      )}
                    </div>
                    {d.borough && (
                      <span className="text-xs text-slate-500 flex-shrink-0">{d.borough}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={runDealComparison}
              disabled={selectedDealIds.length < 2 || dealLoading}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {dealLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              Compare Deals
            </button>
          </div>

          {/* Deal Results Table */}
          {dealResults && dealResults.length > 0 && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase">Metric</th>
                      {dealResults.map((d) => (
                        <th key={d.id} className="text-right px-4 py-3 text-xs font-medium text-slate-400 max-w-[160px]">
                          <span className="truncate block">{d.name || d.address || "Deal"}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEAL_METRICS.map((m) => {
                      const bestIdx = getBestDealIdx(m.key, m.higherBetter);
                      return (
                        <tr key={m.key} className="border-b border-white/[0.03]">
                          <td className="px-4 py-2.5 text-slate-400">{m.label}</td>
                          {dealResults.map((d, idx) => {
                            const val = extractDealMetric(d, m.key);
                            const isBest = bestIdx === idx && val !== 0;
                            return (
                              <td key={d.id} className={`px-4 py-2.5 text-right font-medium ${
                                isBest ? "text-emerald-400" : "text-white"
                              }`}>
                                {val !== 0 ? m.format(val) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!dealResults && !dealLoading && selectedDealIds.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-violet-600/20 flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-violet-400" />
              </div>
              <h3 className="text-sm font-medium text-white mb-1">Deal Comparison</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Select 2-4 saved deals to compare their metrics side-by-side in a normalized table.
              </p>
            </div>
          )}
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
