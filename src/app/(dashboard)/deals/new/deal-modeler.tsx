"use client";

import React, { useState } from "react";
import { DealModelerProvider, useDealModeler } from "./deal-modeler-context";
import { Section } from "./components/shared/field";
import { fmtPct, fmtX } from "./components/shared/format-utils";
import { DealHeader } from "./components/header/deal-header";
import { StructureTabs } from "./components/header/structure-tabs";
import { AcquisitionInputs } from "./components/inputs/acquisition-section";
import { IncomeSection } from "./components/inputs/income-section";
import { ExpenseSection } from "./components/inputs/expense-section";
import { ExitSection } from "./components/inputs/exit-section";
import dynamic from "next/dynamic";
const ResultsPanel = dynamic(() => import("./components/results/results-panel").then(m => ({ default: m.ResultsPanel })), {
  loading: () => <div className="animate-pulse bg-white/5 rounded-xl h-96" />,
});
import { T12Modal } from "./components/modals/t12-modal";
import { LoiModal } from "./components/modals/loi-modal";
import { MobileMetricsBar } from "./components/shared/mobile-metrics-bar";

// ============================================================
// Main export — wraps content in the context provider
// ============================================================
export default function DealModeler() {
  return (
    <DealModelerProvider>
      <DealModelerContent />
    </DealModelerProvider>
  );
}

// ============================================================
// Inner content — reads context and composes all sections
// ============================================================
function DealModelerContent() {
  const ctx = useDealModeler();
  const [mobileTab, setMobileTab] = useState<"inputs" | "results">("inputs");

  const {
    // Header props
    dealName, setDealName, address, borough, saving, savedId, saveMsg,
    handleSave, prefillLoading, isAiGenerated, propertyDetails,
    openLoiModal, handleGenerateInvestmentSummary, generatingSummary,
    exportPdf, outputs, inputs,
    // Structure tabs props
    activeStructure, setActiveStructure, showComparison, setShowComparison, runComparison,
    // Notes
    notes, setNotes,
    // Sticky summary
    structureAnalysis,
  } = ctx;

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white">
      {/* ── Header ── */}
      <DealHeader
        dealName={dealName}
        setDealName={setDealName}
        address={address}
        borough={borough}
        saving={saving}
        savedId={savedId}
        saveMsg={saveMsg}
        handleSave={handleSave}
        prefillLoading={prefillLoading}
        isAiGenerated={isAiGenerated}
        propertyDetails={propertyDetails}
        openLoiModal={openLoiModal}
        handleGenerateInvestmentSummary={handleGenerateInvestmentSummary}
        generatingSummary={generatingSummary}
        exportPdf={exportPdf}
        outputs={outputs}
        inputs={inputs}
      />

      {/* ── Structure Tabs ── */}
      <StructureTabs
        activeStructure={activeStructure}
        setActiveStructure={setActiveStructure}
        showComparison={showComparison}
        setShowComparison={setShowComparison}
        runComparison={runComparison}
      />

      {/* ── Mobile Tab Switcher ── */}
      <div className="md:hidden max-w-[1600px] mx-auto px-4 pt-4">
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button
            onClick={() => setMobileTab("inputs")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "inputs"
                ? "bg-blue-600 text-white"
                : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.05]"
            }`}
          >
            Inputs
          </button>
          <button
            onClick={() => setMobileTab("results")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === "results"
                ? "bg-blue-600 text-white"
                : "bg-white/[0.03] text-slate-400 hover:bg-white/[0.05]"
            }`}
          >
            Results
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        {/* Desktop: side-by-side */}
        <div className="hidden md:flex gap-6">
          {/* Left Panel — Inputs */}
          <div className="w-[440px] flex-shrink-0 space-y-4">
            <AcquisitionInputs />
            <IncomeSection />
            <ExpenseSection />
            <ExitSection />

            {/* Notes */}
            <Section title="Notes" defaultOpen={!!notes}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Deal notes, assumptions, conditions..."
                rows={4}
                className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none placeholder:text-slate-600"
              />
            </Section>

            {/* Sticky Summary Bar */}
            {structureAnalysis && (
              <div className="hidden lg:block sticky bottom-0 bg-slate-800/60 backdrop-blur-md border border-white/5 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  {[
                    {
                      label: "CoC",
                      value: fmtPct(structureAnalysis.cashOnCash),
                      threshold: structureAnalysis.cashOnCash >= 8 ? "text-emerald-400" : structureAnalysis.cashOnCash >= 4 ? "text-amber-400" : "text-red-400",
                    },
                    {
                      label: "IRR",
                      value: isFinite(structureAnalysis.irr) ? fmtPct(structureAnalysis.irr) : "N/A",
                      threshold: structureAnalysis.irr >= 15 ? "text-emerald-400" : structureAnalysis.irr >= 8 ? "text-amber-400" : "text-red-400",
                    },
                    {
                      label: "Eq Multiple",
                      value: fmtX(structureAnalysis.equityMultiple),
                      threshold: structureAnalysis.equityMultiple >= 2 ? "text-emerald-400" : structureAnalysis.equityMultiple >= 1.5 ? "text-amber-400" : "text-red-400",
                    },
                  ].map(m => (
                    <div key={m.label} className="text-center">
                      <p className="text-[9px] uppercase tracking-widest text-slate-500">{m.label}</p>
                      <p className={`text-sm font-bold ${m.threshold}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel — Results (sticky) */}
          <div className="flex-1 min-w-0 lg:sticky lg:top-[65px] lg:max-h-[calc(100vh-65px)] lg:overflow-y-auto no-scrollbar">
            <ResultsPanel />
          </div>
        </div>

        {/* Mobile: tab switch (Inputs ↔ Results) */}
        <div className="md:hidden">
          {mobileTab === "inputs" ? (
            <div className="space-y-4">
              <AcquisitionInputs />
              <IncomeSection />
              <ExpenseSection />
              <ExitSection />

              {/* Notes */}
              <Section title="Notes" defaultOpen={!!notes}>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Deal notes, assumptions, conditions..."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none placeholder:text-slate-600"
                />
              </Section>
            </div>
          ) : (
            <ResultsPanel />
          )}
        </div>
      </div>

      {/* ── Mobile Metrics Bar ── */}
      <MobileMetricsBar />

      {/* ── Modals ── */}
      <T12Modal />
      <LoiModal />
    </div>
  );
}
