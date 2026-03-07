"use client";

import React from "react";
import { FileBarChart, Upload } from "lucide-react";
import { Sparkle } from "../shared/field";
import { fmt } from "../shared/format-utils";
import type { DealInputs, DealOutputs } from "@/lib/deal-calculator";
import type { DealPrefillData } from "../../../actions";

export interface DealHeaderProps {
  dealName: string;
  setDealName: (v: string) => void;
  address: string;
  borough: string;
  saving: boolean;
  savedId: string | null;
  saveMsg: string | null;
  handleSave: () => void;
  prefillLoading: boolean;
  isAiGenerated: boolean;
  propertyDetails: DealPrefillData | null;
  openLoiModal: () => void;
  handleGenerateInvestmentSummary: () => void;
  generatingSummary: boolean;
  exportPdf: () => void;
  outputs: DealOutputs | null;
  inputs: DealInputs;
}

export function DealHeader({
  dealName,
  setDealName,
  address,
  borough,
  saving,
  savedId,
  saveMsg,
  handleSave,
  prefillLoading,
  isAiGenerated,
  propertyDetails,
  openLoiModal,
  handleGenerateInvestmentSummary,
  generatingSummary,
  exportPdf,
  outputs,
  inputs,
}: DealHeaderProps) {
  return (
    <>
      {/* Sticky header bar */}
      <div className="sticky top-0 z-20 bg-[#0B0F19]/95 backdrop-blur-sm border-b border-white/5 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <a href="/deals" className="text-sm text-slate-400 hover:text-blue-400">&larr; Back</a>
            <a
              href="/deals/import"
              className="hidden md:flex items-center gap-1 px-2.5 py-1 text-[11px] text-white/40 hover:text-white/70 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-md transition-colors"
            >
              <Upload className="w-3 h-3" />
              Import
            </a>
            <div>
              <input
                value={dealName}
                onChange={e => setDealName(e.target.value)}
                placeholder="Deal name..."
                className="text-lg font-bold text-white border-none focus:outline-none bg-transparent placeholder:text-slate-600 w-full max-w-md"
              />
              {address && <p className="text-xs text-slate-500">{address}{borough ? `, ${borough}` : ""}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {saveMsg && <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{saveMsg}</span>}
            {savedId && (
              <a
                href={`/deals/promote?dealId=${savedId}`}
                className="px-3 md:px-4 py-2 border border-violet-500/20 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-sm font-medium rounded-lg transition-colors"
              >
                Structure Partnership
              </a>
            )}
            {inputs.purchasePrice > 0 && (
              <button
                onClick={openLoiModal}
                className="px-3 md:px-4 py-2 border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium rounded-lg transition-colors"
              >
                Generate LOI
              </button>
            )}
            <button
              onClick={handleGenerateInvestmentSummary}
              disabled={generatingSummary || !outputs}
              className="flex items-center gap-1.5 px-3 md:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {generatingSummary ? (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <FileBarChart className="h-4 w-4" />
              )}
              Investment Summary
            </button>
            <button
              onClick={exportPdf}
              className="px-3 md:px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Export PDF
            </button>
            <button onClick={handleSave} disabled={saving} className="px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {saving ? "Saving..." : savedId ? "Update" : "Save Deal"}
            </button>
          </div>
        </div>
      </div>

      {/* Prefill loading banner */}
      {prefillLoading && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-blue-400">
            <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full" />
            Loading deal data...
          </div>
        </div>
      )}

      {/* AI Banner */}
      {isAiGenerated && !prefillLoading && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 md:px-6 py-2.5">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-amber-400">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" /></svg>
            <span><strong>AI-Generated Assumptions</strong> — Review and adjust inputs as needed. Fields marked with <Sparkle /> were auto-calculated.</span>
          </div>
        </div>
      )}

      {/* Property pre-fill banner */}
      {propertyDetails && !prefillLoading && !isAiGenerated && (
        <div className="bg-green-500/10 border-b border-green-500/20 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto text-sm text-green-400">
            Pre-filled from {propertyDetails.address}, {propertyDetails.borough} — {propertyDetails.unitsRes} units, built {propertyDetails.yearBuilt}
            {propertyDetails.lastSalePrice > 0 && ` — Last sale: ${fmt(propertyDetails.lastSalePrice)}`}
          </div>
        </div>
      )}
    </>
  );
}
