"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Download,
  ChevronDown,
  Check,
  Eye,
  Palette,
} from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import { getDealAnalyses } from "../../actions";
import { assembleInvestmentSummary } from "../../investment-summary-actions";
import { logGeneratedDocument, getBrandingForExport } from "../actions";

// ── Types ────────────────────────────────────────────────────

interface DealOption {
  id: string;
  name: string | null;
  address: string | null;
  borough: string | null;
  inputs: any;
  outputs: any;
}

interface Branding {
  companyName: string;
  primaryColor: string;
  logoUrl: string | null;
}

const SECTIONS = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "property_overview", label: "Property Overview" },
  { key: "deal_structure", label: "Deal Structure" },
  { key: "income_expenses", label: "Income & Expenses" },
  { key: "cash_flows", label: "Cash Flow Projections" },
  { key: "returns", label: "Investment Returns" },
  { key: "exit_analysis", label: "Exit Analysis" },
  { key: "sensitivity", label: "Sensitivity Analysis" },
  { key: "risk_factors", label: "Risk Factors" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

// ── Component ────────────────────────────────────────────────

export default function InvestmentSummaryPage() {
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [dealsLoaded, setDealsLoaded] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [branding, setBranding] = useState<Branding | null>(null);
  const [toast, setToast] = useState("");

  // Customization
  const [title, setTitle] = useState("Investment Summary");
  const [authorName, setAuthorName] = useState("");
  const [executiveSummary, setExecutiveSummary] = useState("");
  const [includedSections, setIncludedSections] = useState<Set<SectionKey>>(
    new Set(SECTIONS.map((s) => s.key)),
  );

  // Preview state
  const [payload, setPayload] = useState<any>(null);
  const [assembling, setAssembling] = useState(false);
  const [generating, setGenerating] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Load deals
  const loadDeals = useCallback(async () => {
    if (dealsLoaded) return;
    try {
      const result = await getDealAnalyses();
      setDeals(result as DealOption[]);
      setDealsLoaded(true);
    } catch {
      setDealsLoaded(true);
    }
  }, [dealsLoaded]);

  // Load branding on mount
  useEffect(() => {
    (async () => {
      try {
        const b = await getBrandingForExport();
        setBranding(b);
      } catch {}
    })();
    loadDeals();
  }, [loadDeals]);

  // Assemble data when deal is selected
  const handleDealSelect = async (dealId: string) => {
    setSelectedDealId(dealId);
    setPayload(null);
    if (!dealId) return;

    setAssembling(true);
    try {
      const result = await assembleInvestmentSummary(dealId);
      setPayload(result);
      // Pre-fill from payload
      if (result.generatedBy?.name) setAuthorName(result.generatedBy.name);
    } catch (e: any) {
      showToast(e?.message || "Failed to assemble data");
    } finally {
      setAssembling(false);
    }
  };

  // Generate PDF
  const handleGenerate = async () => {
    if (!payload) return;
    setGenerating(true);
    try {
      const { generateInvestmentSummaryPdf } = await import("@/lib/investment-summary-pdf");

      // Apply customizations to payload
      const customized = {
        ...payload,
        // If user provided a custom executive summary, we won't override the whole payload
        // but the PDF generator reads from the payload structure
      };

      const blob = generateInvestmentSummaryPdf(customized);
      const deal = deals.find((d) => d.id === selectedDealId);
      const fileName = `Investment-Summary-${(deal?.address || deal?.name || "deal").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.pdf`;

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Log document
      await logGeneratedDocument({
        docType: "investment_summary",
        propertyAddress: deal?.address || "Unknown",
        dealId: selectedDealId,
        fileName,
      });

      showToast("Investment Summary PDF downloaded");
    } catch (e: any) {
      showToast(e?.message || "PDF generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // Toggle section
  const toggleSection = (key: SectionKey) => {
    setIncludedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedDeal = deals.find((d) => d.id === selectedDealId);

  return (
    <ResearchLayout
      icon={FileText}
      iconColor="text-emerald-400"
      iconBg="bg-emerald-600/20"
      title="Investment Summary"
      subtitle="Generate professional investment summary PDFs"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-5">
          {/* Deal Selector */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <label className="block text-sm font-medium text-slate-300 mb-2">Select a Deal</label>
            <div className="relative">
              <select
                value={selectedDealId}
                onChange={(e) => handleDealSelect(e.target.value)}
                onFocus={loadDeals}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white appearance-none pr-10 focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
          </div>

          {/* Assembling indicator */}
          {assembling && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-8 flex flex-col items-center">
              <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mb-3" />
              <p className="text-sm text-slate-400">Assembling investment summary data...</p>
            </div>
          )}

          {/* Customization Panel */}
          {payload && !assembling && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-medium text-slate-300">Customize</h3>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Report Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Author Name</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Executive Summary (optional override)</label>
                <textarea
                  value={executiveSummary}
                  onChange={(e) => setExecutiveSummary(e.target.value)}
                  rows={3}
                  placeholder="Leave blank to use auto-generated summary..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              {/* Section Toggles */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">Included Sections</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {SECTIONS.map((s) => {
                    const included = includedSections.has(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleSection(s.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                          included
                            ? "bg-emerald-600/15 border-emerald-500/30 text-emerald-300"
                            : "bg-white/[0.02] border-white/5 text-slate-500"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                          included ? "bg-emerald-600 border-emerald-600" : "border-white/20"
                        }`}>
                          {included && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          {payload && !assembling && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {generating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Generate PDF
            </button>
          )}
        </div>

        {/* Right: Preview + Branding */}
        <div className="space-y-5">
          {/* Branding */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-medium text-slate-300">Branding</h3>
            </div>
            {branding ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: branding.primaryColor }}
                  />
                  <span className="text-xs text-slate-400">{branding.companyName}</span>
                </div>
                <p className="text-[10px] text-slate-600">
                  Update branding in Settings &rarr; Branding
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Loading branding...</p>
            )}
          </div>

          {/* Data Preview */}
          {payload && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-slate-500" />
                <h3 className="text-sm font-medium text-slate-300">Data Preview</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Property</span>
                  <span className="text-white">{payload.property?.address || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Structure</span>
                  <span className="text-white">{payload.dealStructure?.type || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Purchase Price</span>
                  <span className="text-white">
                    {payload.dealStructure?.purchasePrice
                      ? `$${Math.round(payload.dealStructure.purchasePrice).toLocaleString()}`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cap Rate</span>
                  <span className="text-white">
                    {payload.returns?.capRate ? `${payload.returns.capRate.toFixed(2)}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IRR</span>
                  <span className="text-white">
                    {payload.returns?.irr ? `${payload.returns.irr.toFixed(2)}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Equity Multiple</span>
                  <span className="text-white">
                    {payload.returns?.equityMultiple ? `${payload.returns.equityMultiple.toFixed(2)}x` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cash Flows</span>
                  <span className="text-white">{payload.cashFlows?.length || 0} years</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Risk Factors</span>
                  <span className="text-white">{payload.riskFactors?.length || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!payload && !assembling && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-6 flex flex-col items-center text-center">
              <FileText className="w-8 h-8 text-emerald-400/30 mb-3" />
              <p className="text-xs text-slate-500">
                Select a deal to preview the investment summary data.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50 animate-[fade-in_0.2s_ease]">
          {toast}
        </div>
      )}
    </ResearchLayout>
  );
}
