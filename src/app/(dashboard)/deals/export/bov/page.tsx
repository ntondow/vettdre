"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileSpreadsheet,
  Download,
  ChevronDown,
  Check,
  X,
  Loader2,
  Circle,
  Building2,
  Palette,
} from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import PropertySearchInput from "@/components/research/property-search-input";
import type { PropertySelection } from "@/components/research/property-search-input";
import { assembleBovData } from "@/app/(dashboard)/market-intel/bov-actions";
import { fetchExpenseBenchmark, fetchRentProjection } from "../../benchmark-actions";
import { fetchRenovationEstimate } from "../../research-actions";
import { fetchMarketCapRate } from "../../caprate-actions";
import { fetchClosingCosts } from "../../closing-cost-actions";
import { getDealAnalyses } from "../../actions";
import { logGeneratedDocument, getBrandingForExport } from "../actions";
import type { BovPayload } from "@/lib/bov-types";

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

type ChecklistStatus = "pending" | "loading" | "done" | "error";

interface ChecklistItem {
  key: string;
  label: string;
  status: ChecklistStatus;
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { key: "building", label: "Building Intelligence", status: "pending" },
  { key: "comps", label: "Comparable Sales", status: "pending" },
  { key: "neighborhood", label: "Neighborhood Profile", status: "pending" },
  { key: "expenses", label: "Expense Benchmarks", status: "pending" },
  { key: "renovation", label: "Renovation Estimates", status: "pending" },
  { key: "capRates", label: "Market Cap Rates", status: "pending" },
  { key: "closingCosts", label: "Closing Costs", status: "pending" },
  { key: "rentProjection", label: "Rent Projections", status: "pending" },
];

const BOV_SECTIONS = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "property_overview", label: "Property Overview" },
  { key: "valuation", label: "Valuation Opinion" },
  { key: "comps", label: "Comparable Sales" },
  { key: "expenses", label: "Expense Analysis" },
  { key: "renovation", label: "Renovation Estimates" },
  { key: "rent_analysis", label: "Rent Analysis" },
  { key: "market_context", label: "Market Context" },
  { key: "neighborhood", label: "Neighborhood Profile" },
] as const;

type BovSectionKey = (typeof BOV_SECTIONS)[number]["key"];

// ── Component ────────────────────────────────────────────────

export default function BovGeneratorPage() {
  const searchParams = useSearchParams();
  const initialBbl = searchParams.get("bbl");

  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [dealsLoaded, setDealsLoaded] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [branding, setBranding] = useState<Branding | null>(null);
  const [toast, setToast] = useState("");

  // Assembly state
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [bovPayload, setBovPayload] = useState<BovPayload | null>(null);
  const [supplementalData, setSupplementalData] = useState<Record<string, any>>({});
  const [assembling, setAssembling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const assembleRef = useRef(0);

  // Customization
  const [includedSections, setIncludedSections] = useState<Set<BovSectionKey>>(
    new Set(BOV_SECTIONS.map((s) => s.key)),
  );
  const [lowValue, setLowValue] = useState(0);
  const [midValue, setMidValue] = useState(0);
  const [highValue, setHighValue] = useState(0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Load deals + branding
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

  useEffect(() => {
    loadDeals();
    (async () => {
      try {
        const b = await getBrandingForExport();
        setBranding(b);
      } catch {}
    })();
  }, [loadDeals]);

  // Update checklist item
  const updateChecklist = (key: string, status: ChecklistStatus) => {
    setChecklist((prev) => prev.map((item) => (item.key === key ? { ...item, status } : item)));
  };

  // ── Data Assembly ──────────────────────────────────────────

  const runAssembly = async (bbl: string, propertyInfo?: PropertySelection) => {
    const assemblyId = ++assembleRef.current;
    setAssembling(true);
    setBovPayload(null);
    setSupplementalData({});
    setChecklist(INITIAL_CHECKLIST.map((i) => ({ ...i, status: "pending" })));

    // Phase 1: BOV core data (building + comps + neighborhood in one call)
    const bovKeys = ["building", "comps", "neighborhood"];
    bovKeys.forEach((k) => updateChecklist(k, "loading"));

    const bovPromise = assembleBovData(bbl).then((result) => {
      if (assembleRef.current !== assemblyId) return null;
      bovKeys.forEach((k) => updateChecklist(k, "done"));

      // Pre-fill valuation ranges
      if (result.valuation) {
        setLowValue(result.valuation.reconciledLow || 0);
        setMidValue(result.valuation.reconciledLikely || 0);
        setHighValue(result.valuation.reconciledHigh || 0);
      }

      return result;
    }).catch(() => {
      if (assembleRef.current === assemblyId) {
        bovKeys.forEach((k) => updateChecklist(k, "error"));
      }
      return null;
    });

    // Phase 2: Supplemental data in parallel
    const units = propertyInfo?.unitsRes || 10;
    const yearBuilt = propertyInfo?.yearBuilt || 1920;
    const numFloors = propertyInfo?.numFloors || 4;
    const bldgClass = propertyInfo?.bldgClass || "C0";
    const bldgArea = propertyInfo?.bldgArea || 10000;
    const borough = propertyInfo?.borough || "MANHATTAN";

    // Expense benchmarks
    updateChecklist("expenses", "loading");
    const expensePromise = fetchExpenseBenchmark({
      bbl, yearBuilt, numFloors, bldgClass, bldgArea, unitsRes: units, borough,
    }).then((r) => {
      if (assembleRef.current === assemblyId) {
        updateChecklist("expenses", "done");
        setSupplementalData((prev) => ({ ...prev, expenses: r }));
      }
    }).catch(() => {
      if (assembleRef.current === assemblyId) updateChecklist("expenses", "error");
    });

    // Renovation estimates
    updateChecklist("renovation", "loading");
    const renovationPromise = fetchRenovationEstimate({
      bbl, units, sqft: bldgArea, yearBuilt, bldgClass, numFloors,
    }).then((r) => {
      if (assembleRef.current === assemblyId) {
        updateChecklist("renovation", "done");
        setSupplementalData((prev) => ({ ...prev, renovation: r }));
      }
    }).catch(() => {
      if (assembleRef.current === assemblyId) updateChecklist("renovation", "error");
    });

    // Market cap rates
    updateChecklist("capRates", "loading");
    const capRatePromise = fetchMarketCapRate(bbl).then((r) => {
      if (assembleRef.current === assemblyId) {
        updateChecklist("capRates", "done");
        setSupplementalData((prev) => ({ ...prev, capRates: r }));
      }
    }).catch(() => {
      if (assembleRef.current === assemblyId) updateChecklist("capRates", "error");
    });

    // Closing costs (need a rough price estimate)
    updateChecklist("closingCosts", "loading");
    const estimatedPrice = (propertyInfo?.assessTotal || 1000000) * 2;
    const closingPromise = fetchClosingCosts({
      purchasePrice: estimatedPrice,
      loanAmount: estimatedPrice * 0.7,
      structure: "conventional",
      units,
      borough,
    }).then((r) => {
      if (assembleRef.current === assemblyId) {
        updateChecklist("closingCosts", "done");
        setSupplementalData((prev) => ({ ...prev, closingCosts: r }));
      }
    }).catch(() => {
      if (assembleRef.current === assemblyId) updateChecklist("closingCosts", "error");
    });

    // Rent projections
    updateChecklist("rentProjection", "loading");
    const rentPromise = fetchRentProjection({
      bbl, totalUnits: units, holdPeriodYears: 5,
      marketRentGrowthPct: 3, avgMarketRent: 2000,
    }).then((r) => {
      if (assembleRef.current === assemblyId) {
        updateChecklist("rentProjection", "done");
        setSupplementalData((prev) => ({ ...prev, rentProjection: r }));
      }
    }).catch(() => {
      if (assembleRef.current === assemblyId) updateChecklist("rentProjection", "error");
    });

    // Wait for all
    const [bovResult] = await Promise.all([
      bovPromise, expensePromise, renovationPromise,
      capRatePromise, closingPromise, rentPromise,
    ]);

    if (assembleRef.current === assemblyId) {
      if (bovResult) setBovPayload(bovResult);
      setAssembling(false);
    }
  };

  // Handle property selection
  const handlePropertySelect = (p: PropertySelection) => {
    setProperty(p);
    setSelectedDealId("");
    runAssembly(p.bbl, p);
  };

  // Handle deal selection (extract BBL and run)
  const handleDealSelect = async (dealId: string) => {
    setSelectedDealId(dealId);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    const inp = deal.inputs as any;
    const bbl = inp?.bbl || deal.inputs?.bbl;
    if (!bbl) {
      showToast("Selected deal has no BBL — use property search instead");
      return;
    }

    setProperty(null);
    runAssembly(bbl, {
      address: deal.address || inp?.address || "",
      borough: inp?.borough || deal.borough || "",
      boroCode: "", block: "", lot: "", bbl, zip: "",
      unitsRes: inp?.units || inp?.totalUnits || 10,
      yearBuilt: inp?.yearBuilt || 1920,
      numFloors: inp?.numFloors || 4,
      bldgClass: inp?.bldgClass || "C0",
      ownerName: inp?.ownerName || "",
      assessTotal: inp?.assessTotal || 0,
      bldgArea: inp?.bldgArea || 10000,
      lotArea: inp?.lotArea || 0,
      zoneDist: inp?.zoneDist || "",
    });
  };

  // Generate BOV PDF
  const handleGenerate = async () => {
    if (!bovPayload) return;
    setGenerating(true);
    try {
      const { generateBovPdfBlob, getBovFilename } = await import("@/lib/bov-pdf");

      const blob = generateBovPdfBlob(bovPayload);
      const fileName = getBovFilename(bovPayload);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await logGeneratedDocument({
        docType: "bov",
        propertyAddress: bovPayload.property?.address || "Unknown",
        fileName,
      });

      showToast("BOV PDF downloaded");
    } catch {
      showToast("PDF generation failed");
    } finally {
      setGenerating(false);
    }
  };

  // Toggle section
  const toggleSection = (key: BovSectionKey) => {
    setIncludedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allDone = checklist.every((c) => c.status === "done" || c.status === "error");
  const anyLoading = checklist.some((c) => c.status === "loading");

  return (
    <ResearchLayout
      icon={FileSpreadsheet}
      iconColor="text-amber-400"
      iconBg="bg-amber-600/20"
      title="BOV Generator"
      subtitle="Generate Broker Opinion of Value reports"
    >
      <div className="space-y-6">
        {/* Property Selection */}
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium text-slate-300">Select a Property</h3>

          <PropertySearchInput
            onSelect={handlePropertySelect}
            initialBbl={initialBbl}
            selected={property}
            onClear={() => { setProperty(null); setBovPayload(null); setChecklist(INITIAL_CHECKLIST); }}
            theme="dark"
            placeholder="Search by address or BBL..."
          />

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-white/5" />
            <span className="text-xs text-slate-600">or</span>
            <div className="flex-1 border-t border-white/5" />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Load from Pipeline Deal</label>
            <div className="relative">
              <select
                value={selectedDealId}
                onChange={(e) => handleDealSelect(e.target.value)}
                onFocus={loadDeals}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white appearance-none pr-10 focus:outline-none focus:ring-1 focus:ring-amber-500"
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
        </div>

        {/* Progress Checklist */}
        {(assembling || allDone) && (
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Data Assembly</h3>
            <div className="space-y-2">
              {checklist.map((item, idx) => (
                <div
                  key={item.key}
                  className="flex items-center gap-3 py-1.5"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  {/* Status icon */}
                  {item.status === "pending" && (
                    <Circle className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  )}
                  {item.status === "loading" && (
                    <Loader2 className="w-4 h-4 text-amber-400 animate-spin flex-shrink-0" />
                  )}
                  {item.status === "done" && (
                    <div className="w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0 animate-[fade-in_0.3s_ease]">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="w-4 h-4 rounded-full bg-red-600/80 flex items-center justify-center flex-shrink-0">
                      <X className="w-3 h-3 text-white" />
                    </div>
                  )}

                  <span className={`text-sm ${
                    item.status === "done" ? "text-white" :
                    item.status === "loading" ? "text-amber-300" :
                    item.status === "error" ? "text-red-400" :
                    "text-slate-500"
                  }`}>
                    {item.label}
                  </span>

                  {item.status === "error" && (
                    <span className="text-[10px] text-red-400/60 ml-auto">skipped</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Customize + Generate (shown when data is loaded) */}
        {bovPayload && allDone && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Section Toggles */}
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Included Sections</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {BOV_SECTIONS.map((s) => {
                    const included = includedSections.has(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleSection(s.key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border transition-colors ${
                          included
                            ? "bg-amber-600/15 border-amber-500/30 text-amber-300"
                            : "bg-white/[0.02] border-white/5 text-slate-500"
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                          included ? "bg-amber-600 border-amber-600" : "border-white/20"
                        }`}>
                          {included && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Valuation Range */}
              {(lowValue > 0 || midValue > 0 || highValue > 0) && (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
                  <h3 className="text-sm font-medium text-slate-300 mb-3">Valuation Range</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Low</label>
                      <input
                        type="number"
                        value={lowValue || ""}
                        onChange={(e) => setLowValue(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Mid</label>
                      <input
                        type="number"
                        value={midValue || ""}
                        onChange={(e) => setMidValue(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">High</label>
                      <input
                        type="number"
                        value={highValue || ""}
                        onChange={(e) => setHighValue(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {generating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Generate BOV
              </button>
            </div>

            {/* Right sidebar: Branding + Property Summary */}
            <div className="space-y-5">
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-medium text-slate-300">Branding</h3>
                </div>
                {branding ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: branding.primaryColor }} />
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

              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  <h3 className="text-sm font-medium text-slate-300">Property</h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Address</span>
                    <span className="text-white truncate ml-2">
                      {bovPayload.property?.address || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Units</span>
                    <span className="text-white">{bovPayload.property?.unitsTotal || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Year Built</span>
                    <span className="text-white">{bovPayload.property?.yearBuilt || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Comps Found</span>
                    <span className="text-white">{bovPayload.comps?.length || 0}</span>
                  </div>
                  {bovPayload.valuation && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Est. Value</span>
                      <span className="text-white">
                        ${Math.round(bovPayload.valuation.reconciledLikely || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!property && !selectedDealId && !assembling && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-600/20 flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-sm font-medium text-white mb-1">BOV Generator</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Search for a property or select a pipeline deal to generate a professional Broker Opinion of Value report.
            </p>
          </div>
        )}
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
