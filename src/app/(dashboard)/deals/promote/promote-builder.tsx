"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { hasPermission } from "@/lib/feature-gate";
import { calculateAll } from "@/lib/deal-calculator";
import type { DealInputs, DealOutputs } from "@/lib/deal-calculator";
import {
  calculatePromote,
  calculatePromoteSensitivity,
  WATERFALL_TEMPLATES,
} from "@/lib/promote-engine";
import type {
  WaterfallTier,
  PromoteOutputs,
  PromoteSensitivity,
  SensitivityCell,
} from "@/lib/promote-engine";
import { getDealAnalysis } from "@/app/(dashboard)/deals/actions";
import { savePromoteModel, getPromoteModel } from "./actions";

// ============================================================
// Format Helpers
// ============================================================

function fmt$(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtMult(n: number): string {
  return `${n.toFixed(2)}x`;
}

// ============================================================
// Main Component
// ============================================================

export default function PromoteBuilder() {
  const searchParams = useSearchParams();
  const dealId = searchParams.get("dealId");
  const { plan } = useUserPlan();

  // Deal data
  const [dealInputs, setDealInputs] = useState<DealInputs | null>(null);
  const [dealOutputs, setDealOutputs] = useState<DealOutputs | null>(null);
  const [dealName, setDealName] = useState("");
  const [dealAddress, setDealAddress] = useState("");
  const [loading, setLoading] = useState(true);

  // Promote state
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const [gpEquityPct, setGpEquityPct] = useState(10);
  const [lpEquityPct, setLpEquityPct] = useState(90);
  const [tiers, setTiers] = useState<WaterfallTier[]>([
    { name: "LP Preferred Return", prefRate: 8, gpSplitPct: 0, lpSplitPct: 100 },
    { name: "GP Catch-Up", catchUpPct: 50, gpSplitPct: 100, lpSplitPct: 0 },
    { name: "Profit Split", gpSplitPct: 30, lpSplitPct: 70 },
  ]);
  const [templateName, setTemplateName] = useState<string | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState<PromoteSensitivity | null>(null);
  const [sensiLoading, setSensiLoading] = useState(false);
  const [sensiMetric, setSensiMetric] = useState<"lpIrr" | "gpIrr" | "lpMultiple" | "gpMultiple">("lpIrr");
  const [activeTab, setActiveTab] = useState<"table" | "waterfall" | "sensitivity">("table");

  // ============================================================
  // Load Deal + Existing Promote Model
  // ============================================================

  useEffect(() => {
    if (!dealId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const deal = await getDealAnalysis(dealId);
        const inputs = JSON.parse(JSON.stringify(deal.inputs)) as DealInputs;
        const outputs = calculateAll(inputs);
        setDealInputs(inputs);
        setDealOutputs(outputs);
        setDealName(deal.name || "");
        setDealAddress(deal.address || "");

        // Load existing promote model
        const existing = await getPromoteModel(dealId);
        if (existing) {
          setPromoteId(existing.id);
          setGpEquityPct(existing.gpEquityPct);
          setLpEquityPct(existing.lpEquityPct);
          setTiers(existing.waterfallTiers as unknown as WaterfallTier[]);
          setTemplateName(existing.templateName || null);
        }
      } catch (err) {
        console.error("Failed to load deal:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [dealId]);

  // ============================================================
  // Real-time Promote Calculation
  // ============================================================

  const promoteOutputs = useMemo<PromoteOutputs | null>(() => {
    if (!dealInputs || !dealOutputs) return null;
    return calculatePromote(dealInputs, dealOutputs, {
      gpEquityPct,
      lpEquityPct,
      waterfallTiers: tiers,
    });
  }, [dealInputs, dealOutputs, gpEquityPct, lpEquityPct, tiers]);

  // ============================================================
  // Equity Split Handlers
  // ============================================================

  const handleGpChange = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setGpEquityPct(clamped);
    setLpEquityPct(100 - clamped);
  }, []);

  const handleLpChange = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    setLpEquityPct(clamped);
    setGpEquityPct(100 - clamped);
  }, []);

  // ============================================================
  // Template Selection
  // ============================================================

  const handleTemplateSelect = useCallback((name: string) => {
    const template = WATERFALL_TEMPLATES.find(t => t.name === name);
    if (!template) return;
    setGpEquityPct(template.gpEquityPct);
    setLpEquityPct(template.lpEquityPct);
    setTiers(template.tiers.map(t => ({ ...t })));
    setTemplateName(template.name);
  }, []);

  // ============================================================
  // Tier Editors
  // ============================================================

  const updateTier = useCallback((index: number, updates: Partial<WaterfallTier>) => {
    setTiers(prev => prev.map((t, i) => i === index ? { ...t, ...updates } : t));
    setTemplateName(null);
  }, []);

  const addTier = useCallback(() => {
    setTiers(prev => [...prev, { name: "New Tier", gpSplitPct: 50, lpSplitPct: 50 }]);
    setTemplateName(null);
  }, []);

  const removeTier = useCallback((index: number) => {
    setTiers(prev => prev.filter((_, i) => i !== index));
    setTemplateName(null);
  }, []);

  // ============================================================
  // Save
  // ============================================================

  const handleSave = useCallback(async () => {
    if (!dealId || !promoteOutputs) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await savePromoteModel({
        id: promoteId || undefined,
        dealAnalysisId: dealId,
        name: `${dealName || "Deal"} — Promote`,
        templateName: templateName || undefined,
        gpEquityPct,
        lpEquityPct,
        waterfallTiers: tiers,
        outputs: promoteOutputs,
      });
      setPromoteId(result.id);
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [dealId, promoteId, dealName, templateName, gpEquityPct, lpEquityPct, tiers, promoteOutputs]);

  // ============================================================
  // Sensitivity
  // ============================================================

  const runSensitivity = useCallback(() => {
    if (!dealInputs) return;
    setSensiLoading(true);
    setTimeout(() => {
      const result = calculatePromoteSensitivity(dealInputs, { gpEquityPct, lpEquityPct, waterfallTiers: tiers });
      setSensitivity(result);
      setSensiLoading(false);
      setActiveTab("sensitivity");
    }, 10);
  }, [dealInputs, gpEquityPct, lpEquityPct, tiers]);

  // ============================================================
  // No Deal Selected
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!dealId || !dealInputs || !dealOutputs) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-violet-100 rounded-full flex items-center justify-center text-2xl">
          📊
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Select a Deal</h2>
        <p className="text-sm text-slate-500 mb-6 max-w-sm">
          To structure a GP/LP partnership, first open a deal in the Deal Modeler and click &quot;Structure Partnership&quot;.
        </p>
        <div className="flex gap-3">
          <Link href="/deals/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            Open Deal Modeler
          </Link>
          <Link href="/pipeline" className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors">
            View Pipeline
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 md:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Promote Model</h1>
            <p className="text-xs text-slate-500">{dealName}{dealAddress ? ` — ${dealAddress}` : ""}</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {saveMsg && <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>{saveMsg}</span>}
            <Link href={`/deals/new?dealId=${dealId}`} className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors">
              Back to Deal
            </Link>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : promoteId ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ============================================== */}
          {/* LEFT PANEL — Inputs (2/5)                      */}
          {/* ============================================== */}
          <div className="lg:col-span-2 space-y-4">

            {/* Deal Summary Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Deal Summary</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">Purchase Price</span>
                  <p className="font-medium">{fmt$(dealInputs.purchasePrice)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Total Equity</span>
                  <p className="font-medium">{fmt$(dealOutputs.totalEquity)}</p>
                </div>
                <div>
                  <span className="text-slate-500">NOI</span>
                  <p className="font-medium">{fmt$(dealOutputs.noi)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Hold Period</span>
                  <p className="font-medium">{dealInputs.holdPeriodYears} years</p>
                </div>
                <div>
                  <span className="text-slate-500">Deal IRR</span>
                  <p className="font-medium">{fmtPct(dealOutputs.irr)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Exit Proceeds</span>
                  <p className="font-medium">{fmt$(dealOutputs.exitProceeds)}</p>
                </div>
              </div>
            </div>

            {/* GP/LP Equity Split */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Equity Split</h3>
              <div className="flex gap-4 mb-3">
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-1 block">GP Equity %</label>
                  <input
                    type="number"
                    value={gpEquityPct}
                    onChange={e => handleGpChange(parseFloat(e.target.value) || 0)}
                    min={0} max={100} step={1}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 mb-1 block">LP Equity %</label>
                  <input
                    type="number"
                    value={lpEquityPct}
                    onChange={e => handleLpChange(parseFloat(e.target.value) || 0)}
                    min={0} max={100} step={1}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {/* Visual equity bar */}
              <div className="h-3 rounded-full overflow-hidden flex bg-slate-100">
                <div className="bg-blue-600 transition-all duration-200" style={{ width: `${gpEquityPct}%` }} />
                <div className="bg-emerald-500 transition-all duration-200" style={{ width: `${lpEquityPct}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-500">
                <span>GP: {fmt$(dealOutputs.totalEquity * gpEquityPct / 100)}</span>
                <span>LP: {fmt$(dealOutputs.totalEquity * lpEquityPct / 100)}</span>
              </div>
            </div>

            {/* Template Selector */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Waterfall Template</h3>
                {!hasPermission(plan, "promote_templates") && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    Team
                  </span>
                )}
              </div>
              <select
                value={templateName || ""}
                onChange={e => handleTemplateSelect(e.target.value)}
                disabled={!hasPermission(plan, "promote_templates")}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Custom</option>
                {WATERFALL_TEMPLATES.map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Waterfall Tier Editor */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Waterfall Tiers</h3>
                <button onClick={addTier} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  + Add Tier
                </button>
              </div>
              <div className="space-y-3">
                {tiers.map((tier, idx) => (
                  <div key={idx} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <input
                        value={tier.name}
                        onChange={e => updateTier(idx, { name: e.target.value })}
                        className="text-sm font-medium text-slate-900 bg-transparent border-none focus:outline-none flex-1"
                        placeholder="Tier name"
                      />
                      {tiers.length > 1 && (
                        <button onClick={() => removeTier(idx)} className="text-xs text-red-500 hover:text-red-600 ml-2">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500">Pref Rate %</label>
                        <input
                          type="number"
                          value={tier.prefRate ?? ""}
                          onChange={e => {
                            const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                            updateTier(idx, { prefRate: val });
                          }}
                          placeholder="—"
                          min={0} max={100} step={0.5}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Catch-Up %</label>
                        <input
                          type="number"
                          value={tier.catchUpPct ?? ""}
                          onChange={e => {
                            const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                            updateTier(idx, { catchUpPct: val });
                          }}
                          placeholder="—"
                          min={0} max={100} step={5}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">GP Split %</label>
                        <input
                          type="number"
                          value={tier.gpSplitPct}
                          onChange={e => {
                            const gp = parseFloat(e.target.value) || 0;
                            updateTier(idx, { gpSplitPct: gp, lpSplitPct: 100 - gp });
                          }}
                          min={0} max={100} step={5}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">LP Split %</label>
                        <input
                          type="number"
                          value={tier.lpSplitPct}
                          onChange={e => {
                            const lp = parseFloat(e.target.value) || 0;
                            updateTier(idx, { lpSplitPct: lp, gpSplitPct: 100 - lp });
                          }}
                          min={0} max={100} step={5}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-slate-500">IRR Hurdle % (optional)</label>
                        <input
                          type="number"
                          value={tier.irrHurdle ?? ""}
                          onChange={e => {
                            const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
                            updateTier(idx, { irrHurdle: val });
                          }}
                          placeholder="—"
                          min={0} max={100} step={1}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ============================================== */}
          {/* RIGHT PANEL — Outputs (3/5)                    */}
          {/* ============================================== */}
          <div className="lg:col-span-3 space-y-4">

            {/* Summary Cards Row */}
            {promoteOutputs && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SummaryCard label="GP IRR" value={gpEquityPct > 0 ? fmtPct(promoteOutputs.gpIrr) : "N/A"} color="blue" />
                <SummaryCard label="LP IRR" value={fmtPct(promoteOutputs.lpIrr)} color="emerald" />
                <SummaryCard label="GP Multiple" value={gpEquityPct > 0 ? fmtMult(promoteOutputs.gpEquityMultiple) : "N/A"} color="blue" />
                <SummaryCard label="LP Multiple" value={fmtMult(promoteOutputs.lpEquityMultiple)} color="emerald" />
                <SummaryCard label="GP Promote" value={fmt$(promoteOutputs.gpPromoteEarned)} color="violet" />
              </div>
            )}

            {/* Tab Bar */}
            <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-1">
              <TabButton active={activeTab === "table"} onClick={() => setActiveTab("table")}>
                Distribution Table
              </TabButton>
              <TabButton active={activeTab === "waterfall"} onClick={() => setActiveTab("waterfall")}>
                Waterfall Chart
              </TabButton>
              <TabButton
                active={activeTab === "sensitivity"}
                onClick={() => {
                  if (hasPermission(plan, "promote_sensitivity")) {
                    if (!sensitivity) runSensitivity();
                    else setActiveTab("sensitivity");
                  }
                }}
                locked={!hasPermission(plan, "promote_sensitivity")}
              >
                Sensitivity
              </TabButton>
            </div>

            {/* Tab Content */}
            {activeTab === "table" && promoteOutputs && (
              <DistributionTable distributions={promoteOutputs.yearDistributions} />
            )}

            {activeTab === "waterfall" && promoteOutputs && (
              <WaterfallChart distributions={promoteOutputs.yearDistributions} />
            )}

            {activeTab === "sensitivity" && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">Sensitivity Analysis</h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={sensiMetric}
                      onChange={e => setSensiMetric(e.target.value as typeof sensiMetric)}
                      className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none"
                    >
                      <option value="lpIrr">LP IRR</option>
                      <option value="gpIrr">GP IRR</option>
                      <option value="lpMultiple">LP Multiple</option>
                      <option value="gpMultiple">GP Multiple</option>
                    </select>
                    <button
                      onClick={runSensitivity}
                      disabled={sensiLoading}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                    >
                      {sensiLoading ? "Computing..." : "Refresh"}
                    </button>
                  </div>
                </div>
                {sensiLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                  </div>
                ) : sensitivity ? (
                  <SensitivityTable data={sensitivity} metric={sensiMetric} />
                ) : (
                  <p className="text-sm text-slate-500 text-center py-8">Click &quot;Refresh&quot; to compute sensitivity matrix</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sub-Components
// ============================================================

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-xs opacity-70 mb-0.5">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, locked, children }: { active: boolean; onClick: () => void; locked?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1 ${
        active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
      } ${locked ? "opacity-50" : ""}`}
    >
      {children}
      {locked && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      )}
    </button>
  );
}

function DistributionTable({ distributions }: { distributions: PromoteOutputs["yearDistributions"] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-3 py-2 font-semibold text-slate-700">Year</th>
            <th className="text-right px-3 py-2 font-semibold text-slate-700">Cash Flow</th>
            <th className="text-right px-3 py-2 font-semibold text-slate-700">LP Pref</th>
            <th className="text-right px-3 py-2 font-semibold text-slate-700">GP Catch-Up</th>
            <th className="text-right px-3 py-2 font-semibold text-blue-700">GP Total</th>
            <th className="text-right px-3 py-2 font-semibold text-emerald-700">LP Total</th>
            <th className="text-right px-3 py-2 font-semibold text-slate-700">GP Cum</th>
            <th className="text-right px-3 py-2 font-semibold text-slate-700">LP Cum</th>
          </tr>
        </thead>
        <tbody>
          {distributions.map(d => (
            <tr key={d.year} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-900">{d.year}</td>
              <td className="px-3 py-2 text-right text-slate-600">{fmt$(d.distributableCash)}</td>
              <td className="px-3 py-2 text-right text-slate-600">{d.lpPref > 0 ? fmt$(d.lpPref) : "—"}</td>
              <td className="px-3 py-2 text-right text-slate-600">{d.gpCatchUp > 0 ? fmt$(d.gpCatchUp) : "—"}</td>
              <td className="px-3 py-2 text-right font-medium text-blue-700">{fmt$(d.gpTotal)}</td>
              <td className="px-3 py-2 text-right font-medium text-emerald-700">{fmt$(d.lpTotal)}</td>
              <td className="px-3 py-2 text-right text-slate-500">{fmt$(d.gpCumulative)}</td>
              <td className="px-3 py-2 text-right text-slate-500">{fmt$(d.lpCumulative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaterfallChart({ distributions }: { distributions: PromoteOutputs["yearDistributions"] }) {
  const maxCash = Math.max(...distributions.map(d => d.distributableCash), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">Year-by-Year Distribution</h3>
      <div className="space-y-3">
        {distributions.map(d => {
          const total = d.distributableCash || 1;
          const lpPrefPct = (d.lpPref / total) * 100;
          const gpCatchPct = (d.gpCatchUp / total) * 100;
          const lpSharePct = (d.lpShare / total) * 100;
          const gpSharePct = (d.gpShare / total) * 100;
          const barWidth = (d.distributableCash / maxCash) * 100;

          return (
            <div key={d.year}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-700">Year {d.year}</span>
                <span className="text-xs text-slate-500">{fmt$(d.distributableCash)}</span>
              </div>
              <div className="h-6 rounded-full overflow-hidden flex bg-slate-100" style={{ width: `${barWidth}%`, minWidth: "40px" }}>
                {lpPrefPct > 0 && (
                  <div className="bg-emerald-300 h-full" style={{ width: `${lpPrefPct}%` }} title={`LP Pref: ${fmt$(d.lpPref)}`} />
                )}
                {gpCatchPct > 0 && (
                  <div className="bg-blue-400 h-full" style={{ width: `${gpCatchPct}%` }} title={`GP Catch-Up: ${fmt$(d.gpCatchUp)}`} />
                )}
                {lpSharePct > 0 && (
                  <div className="bg-emerald-500 h-full" style={{ width: `${lpSharePct}%` }} title={`LP Share: ${fmt$(d.lpShare)}`} />
                )}
                {gpSharePct > 0 && (
                  <div className="bg-blue-600 h-full" style={{ width: `${gpSharePct}%` }} title={`GP Share: ${fmt$(d.gpShare)}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-300 inline-block" /> LP Pref</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400 inline-block" /> GP Catch-Up</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> LP Split</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> GP Split</span>
      </div>
    </div>
  );
}

function SensitivityTable({ data, metric }: { data: PromoteSensitivity; metric: keyof SensitivityCell }) {
  const formatCell = (cell: SensitivityCell) => {
    const val = cell[metric];
    if (metric === "lpIrr" || metric === "gpIrr") return fmtPct(val);
    return fmtMult(val);
  };

  const cellColor = (cell: SensitivityCell) => {
    const val = cell[metric];
    if (metric === "lpIrr" || metric === "gpIrr") {
      if (val > 15) return "bg-emerald-100 text-emerald-800";
      if (val > 8) return "bg-emerald-50 text-emerald-700";
      if (val > 0) return "bg-amber-50 text-amber-700";
      return "bg-red-50 text-red-700";
    }
    if (val > 2) return "bg-emerald-100 text-emerald-800";
    if (val > 1.5) return "bg-emerald-50 text-emerald-700";
    if (val > 1) return "bg-amber-50 text-amber-700";
    return "bg-red-50 text-red-700";
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-slate-500">Exit Cap \ Rent Growth</th>
            {data.rentGrowthLabels.map(l => (
              <th key={l} className="px-2 py-1.5 text-center text-slate-700 font-semibold">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri}>
              <td className="px-2 py-1.5 font-semibold text-slate-700">{data.exitCapLabels[ri]}</td>
              {row.map((cell, ci) => (
                <td key={ci} className={`px-2 py-1.5 text-center font-medium rounded ${cellColor(cell)}`}>
                  {formatCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
