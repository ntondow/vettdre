"use client";

import { useMemo } from "react";
import FeatureGate from "@/components/ui/feature-gate";
import QuickScreenPanel from "../../quick-screen-panel";
import { fmtPrice, fmtDate } from "../../sections/format-utils";
import { SkeletonTable, SkeletonSection } from "./skeleton-components";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TabFinancialsProps {
  pluto: any;
  intel: any;
  data: any;
  borough?: string;
  boroCode: string;
  block: string;
  lot: string;
  address?: string;
  // Comps
  compResult: any;
  enhancedCompsLoading: boolean;
  enhancedRadius: number;
  enhancedMaxDays: number;
  onRadiusChange: (r: number) => void;
  onMaxDaysChange: (d: number) => void;
  onRefreshComps: () => void;
  // Energy
  ll84Data: any;
  ll84Utilities: any;
  ll97Risk: any;
  rpieRecords: any[];
  // Renovation
  renoEstimate: any;
  renoLoading: boolean;
  // STR
  strProjection: any;
  strLoading: boolean;
  // Quick Screen
  displayAddr: string;
  displayBorough: string;
}

/* ------------------------------------------------------------------ */
/*  Section wrapper (card)                                             */
/* ------------------------------------------------------------------ */

function Card({ title, icon, badge, children, className }: {
  title: string; icon?: string; badge?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={className || "bg-white rounded-xl border border-slate-200"}>
      <div className="flex items-center justify-between p-5 pb-0">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {badge}
        </div>
      </div>
      <div className="p-5 pt-3">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper: compact price                                              */
/* ------------------------------------------------------------------ */

function compactPrice(n: number): string {
  if (!n || !isFinite(n)) return "--";
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return "$" + Math.round(n / 1_000).toLocaleString() + "K";
  return "$" + Math.round(n).toLocaleString();
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TabFinancials({
  pluto,
  intel,
  data,
  borough,
  boroCode,
  block,
  lot,
  address,
  compResult,
  enhancedCompsLoading,
  enhancedRadius,
  enhancedMaxDays,
  onRadiusChange,
  onMaxDaysChange,
  onRefreshComps,
  ll84Data,
  ll84Utilities,
  ll97Risk,
  rpieRecords,
  renoEstimate,
  renoLoading,
  strProjection,
  strLoading,
  displayAddr,
  displayBorough,
}: TabFinancialsProps) {
  const p = pluto || data?.pluto;
  const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");

  // Parse PLUTO fields once
  const plutoFields = useMemo(() => {
    if (!p) return null;
    const yr = parseInt(p.yearBuilt || p.yearbuilt || "0") || 0;
    const fl = parseInt(p.numFloors || p.numfloors || "0") || 0;
    const cls = p.bldgClass || p.bldgclass || "";
    const units = parseInt(p.unitsRes || p.unitsres || "0") || 0;
    const area = parseInt(p.bldgArea || p.bldgarea || "0") || 0;
    const boro = borough || p.borough || "";
    const hasElev = fl > 5 || cls.startsWith("D");
    return { yr, fl, cls, units, area, boro, hasElev };
  }, [p, borough]);

  // Cap rate analysis (memoized)
  const capAnalysis = useMemo(() => {
    if (!plutoFields || plutoFields.yr <= 0 || plutoFields.units <= 0) return null;
    if (!compResult?.comps?.length) return null;
    try {
      const { deriveMarketCapRate } = require("@/lib/cap-rate-engine");
      const result = deriveMarketCapRate({
        subject: {
          yearBuilt: plutoFields.yr,
          hasElevator: plutoFields.hasElev,
          numFloors: plutoFields.fl,
          bldgClass: plutoFields.cls,
          bldgArea: plutoFields.area,
          unitsRes: plutoFields.units,
          borough: plutoFields.boro,
        },
        comps: compResult.comps,
      });
      return result?.compCount > 0 ? result : null;
    } catch {
      return null;
    }
  }, [plutoFields, compResult]);

  // Expense benchmark (memoized)
  const expenseBenchmark = useMemo(() => {
    if (!plutoFields || plutoFields.yr <= 0 || plutoFields.units <= 0) return null;
    try {
      const { getExpenseBenchmark, CATEGORY_LABELS } = require("@/lib/expense-benchmarks");
      const bm = getExpenseBenchmark({
        yearBuilt: plutoFields.yr,
        hasElevator: plutoFields.hasElev,
        numFloors: plutoFields.fl,
        bldgClass: plutoFields.cls,
        bldgArea: plutoFields.area,
        unitsRes: plutoFields.units,
        borough: plutoFields.boro,
      });
      return { bm, CATEGORY_LABELS };
    } catch {
      return null;
    }
  }, [plutoFields]);

  return (
    <div className="space-y-4 pb-4">

      {/* ============================================================ */}
      {/* 1. COMPARABLE SALES (Enhanced with Valuation)                */}
      {/* ============================================================ */}
      <Card
        title="Comparable Sales"
        icon="📊"
        badge={
          <>
            {compResult && compResult.comps?.length > 0 && (
              <span className="text-xs text-slate-400">{compResult.comps.length} comps</span>
            )}
            {compResult && compResult.valuation?.confidence !== "low" && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                compResult.valuation?.confidence === "high"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {compResult.valuation?.confidence === "high" ? "High" : "Medium"} Confidence
              </span>
            )}
          </>
        }
      >
        {enhancedCompsLoading ? (
          /* ---- Loading skeleton ---- */
          <div className="space-y-3 py-2">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="animate-shimmer rounded h-3 w-24" />
                    <div className="animate-shimmer rounded h-5 w-20" />
                  </div>
                ))}
              </div>
            </div>
            <SkeletonTable rows={3} cols={8} />
          </div>
        ) : compResult && compResult.comps?.length > 0 ? (
          <>
            {/* ---- Valuation Summary Card ---- */}
            {compResult.valuation?.estimatedValue > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Estimated Value</p>
                    <p className="text-lg font-black text-blue-900">{fmtPrice(compResult.valuation.estimatedValue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Price/Unit</p>
                    <p className="text-lg font-black text-blue-900">{fmtPrice(compResult.valuation.pricePerUnit)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Price/SqFt</p>
                    <p className="text-lg font-black text-blue-900">
                      {compResult.valuation.pricePerSqft
                        ? `$${compResult.valuation.pricePerSqft.toLocaleString()}`
                        : "--"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Confidence</p>
                    <p className={`text-lg font-black ${
                      compResult.valuation.confidence === "high" ? "text-emerald-700" :
                      compResult.valuation.confidence === "medium" ? "text-amber-700" :
                      "text-red-600"
                    }`}>
                      {compResult.valuation.confidenceScore}/100
                    </p>
                  </div>
                </div>
                <p className="text-xs text-blue-600">{compResult.valuation.methodology}</p>

                {/* Appreciation comparison */}
                {compResult.subject?.lastSalePrice > 0 && compResult.valuation.estimatedValue > 0 && (
                  <div className="mt-2 pt-2 border-t border-blue-200 flex items-center gap-4">
                    <p className="text-xs text-slate-600">
                      Last sold for {fmtPrice(compResult.subject.lastSalePrice)}
                      {compResult.subject.lastSaleDate && ` in ${new Date(compResult.subject.lastSaleDate).getFullYear()}`}
                    </p>
                    {(() => {
                      const pctChange = Math.round(
                        ((compResult.valuation.estimatedValue - compResult.subject.lastSalePrice) /
                          compResult.subject.lastSalePrice) * 100,
                      );
                      return (
                        <span className={`text-xs font-bold ${pctChange >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {pctChange >= 0 ? "+" : ""}{pctChange}% est. appreciation
                        </span>
                      );
                    })()}
                  </div>
                )}

                {/* Assessed value comparison */}
                {compResult.subject?.assessedValue > 0 && compResult.valuation.estimatedValue > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Assessed at {fmtPrice(compResult.subject.assessedValue)} — comp estimate is{" "}
                    {Math.round((compResult.valuation.estimatedValue / compResult.subject.assessedValue - 1) * 100)}%{" "}
                    {compResult.valuation.estimatedValue > compResult.subject.assessedValue ? "above" : "below"} assessment
                  </p>
                )}
              </div>
            )}

            {/* ---- Market Cap Rate Card ---- */}
            {capAnalysis && (
              <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-200 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600">Market Cap Rate</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    capAnalysis.confidence === "high" ? "bg-emerald-100 text-emerald-700" :
                    capAnalysis.confidence === "medium" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{capAnalysis.confidence} confidence</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] text-violet-500">Weighted Avg</p>
                    <p className="text-lg font-black text-violet-900">{capAnalysis.marketCapRate.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-violet-500">Range</p>
                    <p className="text-lg font-black text-violet-900">
                      {capAnalysis.range.low.toFixed(1)}--{capAnalysis.range.high.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-violet-500">Median</p>
                    <p className="text-lg font-black text-violet-900">{capAnalysis.median.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-violet-500">Trend</p>
                    <p className={`text-lg font-black ${
                      capAnalysis.trend === "compressing" ? "text-emerald-700" :
                      capAnalysis.trend === "expanding" ? "text-red-700" : "text-slate-700"
                    }`}>
                      {capAnalysis.trend === "compressing" ? "\u2193" : capAnalysis.trend === "expanding" ? "\u2191" : "\u2192"}{" "}
                      {Math.abs(capAnalysis.trendBpsPerYear)}bp/yr
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-violet-500 mt-2">{capAnalysis.methodology}</p>
                <a
                  href={`/deals/new?bbl=${bbl}&exitCap=${capAnalysis.suggestedExitCap}`}
                  className="inline-block mt-2 text-[10px] text-violet-600 hover:text-violet-800 font-semibold"
                >
                  Open in Deal Modeler &rarr;
                </a>
              </div>
            )}

            {/* ---- Summary stat cards ---- */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-blue-500 uppercase font-medium">Comps Found</p>
                <p className="text-lg font-bold text-blue-800">{compResult.comps.length}</p>
                <p className="text-[10px] text-blue-400">
                  {compResult.searchParams?.totalCandidates ?? 0} candidates
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-blue-500 uppercase font-medium">Avg $/Unit</p>
                <p className="text-lg font-bold text-blue-800">{fmtPrice(compResult.valuation.pricePerUnit)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-blue-500 uppercase font-medium">Avg Similarity</p>
                <p className="text-lg font-bold text-blue-800">
                  {Math.round(
                    compResult.comps.reduce((s: number, c: any) => s + c.similarityScore, 0) / compResult.comps.length,
                  )}/100
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-[10px] text-blue-500 uppercase font-medium">Avg $/SqFt</p>
                <p className="text-lg font-bold text-blue-800">
                  {compResult.valuation.pricePerSqft
                    ? `$${compResult.valuation.pricePerSqft.toLocaleString()}`
                    : "--"}
                </p>
              </div>
            </div>

            {/* ---- Search controls ---- */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <label className="text-[10px] text-slate-500 flex items-center gap-1">
                Radius:
                <select
                  value={enhancedRadius}
                  onChange={(e) => onRadiusChange(parseFloat(e.target.value))}
                  className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
                >
                  <option value="0.25">0.25 mi</option>
                  <option value="0.5">0.5 mi</option>
                  <option value="1">1 mi</option>
                  <option value="2">2 mi</option>
                </select>
              </label>
              <label className="text-[10px] text-slate-500 flex items-center gap-1">
                Period:
                <select
                  value={enhancedMaxDays}
                  onChange={(e) => onMaxDaysChange(parseInt(e.target.value))}
                  className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
                >
                  <option value="180">6 mo</option>
                  <option value="365">1 yr</option>
                  <option value="730">2 yr</option>
                  <option value="1825">5 yr</option>
                </select>
              </label>
              <button
                onClick={onRefreshComps}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Search
              </button>
            </div>

            {/* ---- Comps table ---- */}
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs min-w-[750px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-slate-500">Address</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-500">Units</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-500">Sale Price</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-500">$/Unit</th>
                    <th className="text-right px-2 py-2 font-medium text-slate-500">$/SqFt</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-500">Date</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-500">Dist</th>
                    <th className="text-center px-2 py-2 font-medium text-slate-500">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {compResult.comps.map((c: any, i: number) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-700 max-w-[200px] truncate" title={c.address}>
                        {c.address}
                      </td>
                      <td className="text-center px-2 py-1.5">{c.units}</td>
                      <td className="text-right px-3 py-1.5 font-medium">{fmtPrice(c.salePrice)}</td>
                      <td className="text-right px-2 py-1.5">
                        {c.pricePerUnit > 0 ? fmtPrice(c.pricePerUnit) : "--"}
                      </td>
                      <td className="text-right px-2 py-1.5 text-slate-500">
                        {c.pricePerSqft ? `$${c.pricePerSqft.toLocaleString()}` : "--"}
                      </td>
                      <td className="text-center px-2 py-1.5 text-slate-500">
                        {c.saleDate
                          ? new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(
                              new Date(c.saleDate),
                            )
                          : "--"}
                      </td>
                      <td className="text-center px-2 py-1.5 text-slate-400">
                        {typeof c.distanceMiles === "number"
                          ? c.distanceMiles.toFixed(1) + " mi"
                          : c.distanceMiles != null
                            ? c.distanceMiles + " mi"
                            : "--"}
                      </td>
                      <td className="text-center px-2 py-1.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            c.similarityScore >= 70
                              ? "bg-emerald-100 text-emerald-700"
                              : c.similarityScore >= 45
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {c.similarityScore}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {(p?.unitsTot || p?.unitsRes || p?.unitstotal || p?.unitsres || 0) >= 2
              ? "No comparable sales found. Try expanding the search radius or time period."
              : "Comparable sales analysis is available for buildings with 2+ units."}
          </p>
        )}
      </Card>

      {/* ============================================================ */}
      {/* 2. EXPENSE BENCHMARK (RGB I&E)                               */}
      {/* ============================================================ */}
      {expenseBenchmark && (
        <Card
          title="Expense Benchmark"
          icon="📊"
          badge={
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
              RGB I&E
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 uppercase">Category</p>
              <p className="text-sm font-semibold text-slate-900">
                {expenseBenchmark.CATEGORY_LABELS[expenseBenchmark.bm.category]}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 uppercase">$/Unit/Year</p>
              <p className="text-sm font-semibold text-slate-900">
                ${expenseBenchmark.bm.totalPerUnit.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Line item breakdown */}
          {expenseBenchmark.bm.lineItems?.length > 0 && (
            <details className="mt-3 group">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform text-slate-400">&#9654;</span>
                Line Item Breakdown ({expenseBenchmark.bm.lineItems.length} categories)
              </summary>
              <div className="mt-2 space-y-1">
                {expenseBenchmark.bm.lineItems.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="font-medium text-slate-800">${item.perUnit.toLocaleString()}/unit</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs pt-1.5 mt-1 border-t border-slate-200 font-bold">
                  <span className="text-slate-900">Total</span>
                  <span className="text-slate-900">${expenseBenchmark.bm.totalPerUnit.toLocaleString()}/unit</span>
                </div>
              </div>
            </details>
          )}

          {/* Adjustment notes */}
          {expenseBenchmark.bm.adjustmentNotes?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {expenseBenchmark.bm.adjustmentNotes.map((note: string, i: number) => (
                <span key={i} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  {note}
                </span>
              ))}
            </div>
          )}

          <a
            href={`/deals/new?bbl=${bbl}&address=${encodeURIComponent(address || "")}&borough=${encodeURIComponent(borough || "")}&block=${block}&lot=${lot}`}
            className="block mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium text-center"
          >
            Open in Deal Modeler &rarr;
          </a>
        </Card>
      )}

      {/* ============================================================ */}
      {/* 3. QUICK SCREEN PANEL                                        */}
      {/* ============================================================ */}
      {p && parseInt(p.unitsRes || p.unitsres || "0") > 0 && (
        <QuickScreenPanel
          address={displayAddr}
          borough={displayBorough}
          totalUnits={parseInt(p.unitsRes || p.unitsres || "0")}
          grossSqft={parseInt(p.bldgArea || p.bldgarea || "0")}
          yearBuilt={parseInt(p.yearBuilt || p.yearbuilt || "0")}
          numFloors={parseInt(p.numFloors || p.numfloors || "0")}
          buildingClass={p.bldgClass || p.bldgclass || ""}
          assessedValue={parseFloat(p.assessTotal || p.assesstot || "0") || undefined}
          lastSalePrice={compResult?.subject?.lastSalePrice || undefined}
          lastSaleYear={
            compResult?.subject?.lastSaleDate
              ? new Date(compResult.subject.lastSaleDate).getFullYear()
              : undefined
          }
          compsAvgPerUnit={compResult?.valuation?.pricePerUnit || undefined}
          compsAvgPerSqft={compResult?.valuation?.pricePerSqft || undefined}
          bbl={bbl}
          boroCode={boroCode}
          block={block}
          lot={lot}
        />
      )}

      {/* ============================================================ */}
      {/* 4. ENERGY & WATER (LL84)                                     */}
      {/* ============================================================ */}
      {ll84Data && (
        <Card
          title="Energy & Water (LL84)"
          icon="\u26A1"
          badge={
            ll84Data.energyStarGrade ? (
              <span
                className={`ml-2 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
                  ll84Data.energyStarGrade === "A" ? "bg-emerald-100 text-emerald-700" :
                  ll84Data.energyStarGrade === "B" ? "bg-green-100 text-green-700" :
                  ll84Data.energyStarGrade === "C" ? "bg-yellow-100 text-yellow-700" :
                  ll84Data.energyStarGrade === "D" ? "bg-orange-100 text-orange-700" :
                  "bg-red-100 text-red-700"
                }`}
              >
                {ll84Data.energyStarGrade}
              </span>
            ) : undefined
          }
        >
          <div className="space-y-4">
            {/* Grade + Score row */}
            <div className="flex items-center gap-4">
              <div
                className={`flex items-center justify-center w-16 h-16 rounded-xl text-2xl font-black ${
                  ll84Data.energyStarGrade === "A" ? "bg-emerald-100 text-emerald-700" :
                  ll84Data.energyStarGrade === "B" ? "bg-green-100 text-green-700" :
                  ll84Data.energyStarGrade === "C" ? "bg-yellow-100 text-yellow-700" :
                  ll84Data.energyStarGrade === "D" ? "bg-orange-100 text-orange-700" :
                  ll84Data.energyStarGrade === "F" ? "bg-red-100 text-red-700" :
                  "bg-slate-100 text-slate-500"
                }`}
              >
                {ll84Data.energyStarGrade || "?"}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Energy Star Score: {ll84Data.energyStarScore > 0 ? `${ll84Data.energyStarScore}/100` : "N/A"}
                </p>
                <p className="text-xs text-slate-500">
                  Site EUI: {ll84Data.siteEui > 0 ? `${ll84Data.siteEui.toFixed(1)} kBtu/sqft` : "N/A"}
                </p>
                <p className="text-xs text-slate-400">Reporting Year: {ll84Data.reportingYear || "--"}</p>
              </div>
            </div>

            {/* Utility breakdown grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase">Electricity</p>
                <p className="text-sm font-semibold">
                  {ll84Data.electricityUse > 0 ? `${Math.round(ll84Data.electricityUse).toLocaleString()} kWh` : "--"}
                </p>
                {ll84Utilities?.electricityCost > 0 && (
                  <p className="text-xs text-slate-500">${ll84Utilities.electricityCost.toLocaleString()}/yr</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase">Natural Gas</p>
                <p className="text-sm font-semibold">
                  {ll84Data.naturalGasUse > 0 ? `${Math.round(ll84Data.naturalGasUse).toLocaleString()} therms` : "--"}
                </p>
                {ll84Utilities?.gasCost > 0 && (
                  <p className="text-xs text-slate-500">${ll84Utilities.gasCost.toLocaleString()}/yr</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase">Water</p>
                <p className="text-sm font-semibold">
                  {ll84Data.waterUse > 0 ? `${Math.round(ll84Data.waterUse).toLocaleString()} kGal` : "--"}
                </p>
                {ll84Utilities?.waterCost > 0 && (
                  <p className="text-xs text-slate-500">${ll84Utilities.waterCost.toLocaleString()}/yr</p>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 uppercase">Fuel Oil</p>
                <p className="text-sm font-semibold">
                  {ll84Data.fuelOilUse > 0 ? `${Math.round(ll84Data.fuelOilUse).toLocaleString()} gal` : "--"}
                </p>
                {ll84Utilities?.fuelOilCost > 0 && (
                  <p className="text-xs text-slate-500">${ll84Utilities.fuelOilCost.toLocaleString()}/yr</p>
                )}
              </div>
            </div>

            {/* Total annual utility cost */}
            {ll84Utilities?.totalAnnualUtility > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600">Estimated Annual Utility Cost (LL84 Data)</p>
                <p className="text-lg font-bold text-blue-800">${ll84Utilities.totalAnnualUtility.toLocaleString()}</p>
                <p className="text-[10px] text-blue-500">Rates: $0.20/kWh, $1.20/therm, $12.00/kGal, $3.50/gal</p>
              </div>
            )}

            {/* GHG Emissions */}
            {ll84Data.ghgEmissions > 0 && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">GHG Emissions</p>
                <p className="text-sm font-semibold">{ll84Data.ghgEmissions.toFixed(1)} metric tons CO2e</p>
                {ll84Data.ghgIntensity > 0 && (
                  <p className="text-xs text-slate-400">{ll84Data.ghgIntensity.toFixed(2)} kgCO2e/sqft</p>
                )}
              </div>
            )}

            {/* LL97 Carbon Compliance */}
            {ll97Risk && (
              <div
                className={`rounded-lg border p-3 ${
                  !ll97Risk.compliant2024 ? "bg-red-50 border-red-200" :
                  !ll97Risk.compliant2030 ? "bg-amber-50 border-amber-200" :
                  "bg-emerald-50 border-emerald-200"
                }`}
              >
                <p className="text-xs font-bold text-slate-900 mb-2">LL97 Carbon Compliance</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">2024 Limit:</span>
                    <span className={`ml-1 font-semibold ${ll97Risk.compliant2024 ? "text-emerald-700" : "text-red-700"}`}>
                      {ll97Risk.compliant2024 ? "Compliant" : "Non-Compliant"}
                    </span>
                    {ll97Risk.penalty2024 > 0 && (
                      <p className="text-red-600 font-semibold mt-0.5">
                        Penalty: ${ll97Risk.penalty2024.toLocaleString()}/yr
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500">2030 Limit:</span>
                    <span className={`ml-1 font-semibold ${ll97Risk.compliant2030 ? "text-emerald-700" : "text-amber-700"}`}>
                      {ll97Risk.compliant2030 ? "On Track" : "At Risk"}
                    </span>
                    {ll97Risk.penalty2030 > 0 && (
                      <p className="text-amber-600 font-semibold mt-0.5">
                        Est. Penalty: ${ll97Risk.penalty2030.toLocaleString()}/yr
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">LL97 penalty: $268/metric ton over limit</p>
                {(ll97Risk.penalty2024 > 0 || ll97Risk.penalty2030 > 0) && (
                  <p className="text-[10px] text-slate-500 mt-1">
                    5-year hold impact: ~$
                    {(
                      (ll97Risk.penalty2024 > 0 ? ll97Risk.penalty2024 : 0) * Math.min(5, 4) +
                      (ll97Risk.penalty2030 > 0 ? ll97Risk.penalty2030 : 0) * Math.max(0, 5 - 4)
                    ).toLocaleString()}
                    . See Deal Modeler for detailed projection.
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ============================================================ */}
      {/* 5. RENOVATION ESTIMATE                                       */}
      {/* ============================================================ */}
      {(renoEstimate || renoLoading) && (
        <FeatureGate feature="bp_renovation_basic" blur>
          <Card
            title="Renovation Estimate"
            icon="\uD83D\uDD27"
            badge={
              renoEstimate ? (
                <>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      renoEstimate.recommendedLevel === "gut" ? "bg-red-100 text-red-700" :
                      renoEstimate.recommendedLevel === "moderate" ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {renoEstimate.recommendedLevel.charAt(0).toUpperCase() + renoEstimate.recommendedLevel.slice(1)} Rehab
                  </span>
                  <span className="text-xs text-slate-400">
                    {compactPrice(renoEstimate.totalCost[renoEstimate.recommendedLevel])}
                  </span>
                </>
              ) : undefined
            }
          >
            {renoLoading ? (
              <div className="space-y-3 py-2">
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  <div className="animate-shimmer rounded h-3 w-32" />
                  <div className="animate-shimmer rounded h-5 w-20" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                      <div className="animate-shimmer rounded h-3 w-16" />
                      <div className="animate-shimmer rounded h-5 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            ) : renoEstimate ? (
              <div className="space-y-4">
                {/* Condition Assessment */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Condition Assessment</p>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        renoEstimate.recommendedLevel === "gut" ? "bg-red-100 text-red-700" :
                        renoEstimate.recommendedLevel === "moderate" ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      Recommended: {renoEstimate.recommendedLevel.charAt(0).toUpperCase() + renoEstimate.recommendedLevel.slice(1)} Renovation
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        renoEstimate.confidence === "high" ? "bg-emerald-100 text-emerald-700" :
                        renoEstimate.confidence === "medium" ? "bg-amber-100 text-amber-700" :
                        "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {renoEstimate.confidence} confidence
                    </span>
                  </div>
                  <div className="space-y-1">
                    {renoEstimate.conditionSignals?.map((signal: string, i: number) => (
                      <p key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-slate-400 mt-0.5">&#8226;</span>
                        {signal}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Cost Estimate Table */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left p-2.5 font-medium text-slate-500" />
                        {(["light", "moderate", "gut"] as const).map((lvl) => (
                          <th
                            key={lvl}
                            className={`text-right p-2.5 font-bold ${
                              lvl === renoEstimate.recommendedLevel ? "bg-blue-50 text-blue-800" : "text-slate-700"
                            }`}
                          >
                            {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                            {lvl === renoEstimate.recommendedLevel && (
                              <span className="block text-[9px] font-medium text-blue-500">Recommended</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="p-2.5 text-slate-600">Per Unit</td>
                        {(["light", "moderate", "gut"] as const).map((lvl) => (
                          <td
                            key={lvl}
                            className={`text-right p-2.5 font-medium ${
                              lvl === renoEstimate.recommendedLevel ? "bg-blue-50/50 text-blue-900" : "text-slate-800"
                            }`}
                          >
                            ${renoEstimate.costPerUnit[lvl]?.toLocaleString() ?? "--"}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="p-2.5 text-slate-600">Unit Total</td>
                        {(["light", "moderate", "gut"] as const).map((lvl) => (
                          <td
                            key={lvl}
                            className={`text-right p-2.5 font-medium ${
                              lvl === renoEstimate.recommendedLevel ? "bg-blue-50/50 text-blue-900" : "text-slate-800"
                            }`}
                          >
                            ${renoEstimate.unitRenovation[lvl]?.toLocaleString() ?? "--"}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="p-2.5 text-slate-600">Common Areas</td>
                        {(["light", "moderate", "gut"] as const).map((lvl) => (
                          <td
                            key={lvl}
                            className={`text-right p-2.5 font-medium ${
                              lvl === renoEstimate.recommendedLevel ? "bg-blue-50/50 text-blue-900" : "text-slate-800"
                            }`}
                          >
                            ${(renoEstimate.commonAreaCosts || []).reduce((s: number, c: any) => s + (c.cost || 0), 0).toLocaleString()}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="p-2.5 text-slate-600">Soft Costs</td>
                        {(["light", "moderate", "gut"] as const).map((lvl) => {
                          const softCost =
                            (renoEstimate.totalCost[lvl] || 0) -
                            (renoEstimate.unitRenovation[lvl] || 0) -
                            (renoEstimate.commonAreaCosts || []).reduce(
                              (s: number, c: any) => s + (c.cost || 0),
                              0,
                            );
                          return (
                            <td
                              key={lvl}
                              className={`text-right p-2.5 font-medium ${
                                lvl === renoEstimate.recommendedLevel ? "bg-blue-50/50 text-blue-900" : "text-slate-800"
                              }`}
                            >
                              {softCost > 0 ? "$" + Math.round(softCost).toLocaleString() : "--"}
                            </td>
                          );
                        })}
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="p-2.5 text-slate-900">Total</td>
                        {(["light", "moderate", "gut"] as const).map((lvl) => (
                          <td
                            key={lvl}
                            className={`text-right p-2.5 ${
                              lvl === renoEstimate.recommendedLevel ? "bg-blue-100 text-blue-900" : "text-slate-900"
                            }`}
                          >
                            {compactPrice(renoEstimate.totalCost[lvl])}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* After Repair Value (Pro+) */}
                {renoEstimate.currentEstimatedValue > 0 && (
                  <FeatureGate feature="bp_renovation_full" blur>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <p className="text-[10px] text-emerald-600 uppercase tracking-wider mb-2">After Repair Value</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-slate-400">Current Est. Value</p>
                          <p className="text-sm font-bold text-slate-900">
                            ${(renoEstimate.currentEstimatedValue / 1e6).toFixed(2)}M
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">ARV ({renoEstimate.recommendedLevel})</p>
                          <p className="text-sm font-bold text-emerald-800">
                            ${(renoEstimate.arv[renoEstimate.recommendedLevel] / 1e6).toFixed(2)}M
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">Renovation Cost</p>
                          <p className="text-sm font-bold text-slate-700">
                            {compactPrice(renoEstimate.totalCost[renoEstimate.recommendedLevel])}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400">ROI on Renovation</p>
                          <p
                            className={`text-sm font-bold ${
                              renoEstimate.renovationROI[renoEstimate.recommendedLevel] > 0
                                ? "text-emerald-700"
                                : "text-red-600"
                            }`}
                          >
                            {renoEstimate.renovationROI[renoEstimate.recommendedLevel]}%
                          </p>
                        </div>
                      </div>
                      {renoEstimate.renovationROI[renoEstimate.recommendedLevel] > 50 && (
                        <p className="text-xs text-emerald-700 mt-2 font-medium">
                          Strong value-add opportunity -- {renoEstimate.recommendedLevel} renovation could increase
                          property value by ~
                          {Math.round(
                            (renoEstimate.arv[renoEstimate.recommendedLevel] / renoEstimate.currentEstimatedValue - 1) *
                              100,
                          )}
                          %
                        </p>
                      )}
                    </div>
                  </FeatureGate>
                )}

                {/* Common Area Breakdown (expandable, Pro+) */}
                {renoEstimate.commonAreaCosts?.length > 0 && (
                  <FeatureGate feature="bp_renovation_full" blur>
                    <details className="group">
                      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform text-slate-400">&#9654;</span>
                        Common Area Breakdown ({renoEstimate.commonAreaCosts.length} items)
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {renoEstimate.commonAreaCosts.map((item: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">{item.item}</span>
                            <span className="font-medium text-slate-800">${item.cost.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </FeatureGate>
                )}

                <p className="text-[10px] text-slate-400">{renoEstimate.methodology}</p>
              </div>
            ) : null}
          </Card>
        </FeatureGate>
      )}

      {/* ============================================================ */}
      {/* 6. STR (AIRBNB) ANALYSIS                                     */}
      {/* ============================================================ */}
      {(strProjection || strLoading) && (
        <FeatureGate feature="bp_str_basic" blur>
          <Card
            title="Short-Term Rental Analysis"
            icon="\uD83C\uDFE0"
            badge={
              strProjection ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                    {strProjection.neighborhood}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      strProjection.strPremium > 50 ? "bg-emerald-100 text-emerald-700" :
                      strProjection.strPremium > 20 ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {strProjection.strPremium > 0 ? "+" : ""}{strProjection.strPremium}% vs LTR
                  </span>
                </span>
              ) : null
            }
          >
            {strLoading ? (
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                      <div className="animate-shimmer rounded h-3 w-20" />
                      <div className="animate-shimmer rounded h-5 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ) : strProjection ? (
              <div className="space-y-4">
                {/* Revenue Comparison: LTR vs STR */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2 font-semibold">
                      Long-Term Rental
                    </p>
                    <p className="text-lg font-bold text-slate-800">
                      ${strProjection.monthlyLTRRevenue.toLocaleString()}
                      <span className="text-xs font-normal text-slate-400">/mo per unit</span>
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      {strProjection.annualLTRRevenue >= 1e6
                        ? "$" + (strProjection.annualLTRRevenue / 1e6).toFixed(2) + "M"
                        : "$" + Math.round(strProjection.annualLTRRevenue / 1000).toLocaleString() + "K"}
                      /yr
                      {plutoFields && (
                        <span className="text-slate-400"> ({plutoFields.units} units)</span>
                      )}
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-[10px] text-blue-500 uppercase tracking-wide mb-2 font-semibold">
                      Short-Term Rental
                    </p>
                    <p className="text-lg font-bold text-blue-900">
                      ${strProjection.monthlySTRRevenue.toLocaleString()}
                      <span className="text-xs font-normal text-blue-400">/mo per unit</span>
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      {strProjection.annualSTRRevenue >= 1e6
                        ? "$" + (strProjection.annualSTRRevenue / 1e6).toFixed(2) + "M"
                        : "$" + Math.round(strProjection.annualSTRRevenue / 1000).toLocaleString() + "K"}
                      /yr
                      {plutoFields && (
                        <span className="text-blue-400"> ({plutoFields.units} units)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Premium callout + delta */}
                <div
                  className={`rounded-lg p-3 ${
                    strProjection.strPremium > 50 ? "bg-emerald-50 border border-emerald-200" :
                    strProjection.strPremium > 20 ? "bg-amber-50 border border-amber-200" :
                    "bg-slate-50 border border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-bold ${
                        strProjection.strPremium > 50 ? "text-emerald-800" :
                        strProjection.strPremium > 20 ? "text-amber-800" :
                        "text-slate-700"
                      }`}
                    >
                      {strProjection.strPremium > 0 ? "+" : ""}{strProjection.strPremium}% revenue potential with STR
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        strProjection.annualDelta > 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {strProjection.annualDelta > 0 ? "+" : "-"}$
                      {Math.abs(strProjection.annualDelta) >= 1e6
                        ? (Math.abs(strProjection.annualDelta) / 1e6).toFixed(2) + "M"
                        : Math.round(Math.abs(strProjection.annualDelta) / 1000).toLocaleString() + "K"}
                      /yr
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        strProjection.strPremium > 50 ? "bg-emerald-500" :
                        strProjection.strPremium > 20 ? "bg-amber-500" :
                        strProjection.strPremium > 0 ? "bg-blue-500" :
                        "bg-red-400"
                      }`}
                      style={{ width: `${Math.min(Math.max(strProjection.strPremium, 0), 150) / 1.5}%` }}
                    />
                  </div>
                </div>

                {/* Market Context (Pro+) */}
                <FeatureGate feature="bp_str_full" blur>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">
                      Market Context
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-slate-400">Avg Nightly</p>
                        <p className="text-sm font-bold text-slate-900">${strProjection.avgNightlyRate}</p>
                        <p className="text-[9px] text-slate-400">{strProjection.neighborhood}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-slate-400">Occupancy</p>
                        <p className="text-sm font-bold text-slate-900">
                          {Math.round(strProjection.occupancyRate * 100)}%
                        </p>
                        <p className="text-[9px] text-slate-400">avg rate</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-slate-400">Listings</p>
                        <p className="text-sm font-bold text-slate-900">
                          {strProjection.activeListings.toLocaleString()}
                        </p>
                        <p className="text-[9px] text-slate-400">in area</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-slate-400">Saturation</p>
                        <p
                          className={`text-sm font-bold ${
                            strProjection.marketSaturation === "high" ? "text-red-700" :
                            strProjection.marketSaturation === "medium" ? "text-amber-700" :
                            "text-emerald-700"
                          }`}
                        >
                          {strProjection.marketSaturation.charAt(0).toUpperCase() +
                            strProjection.marketSaturation.slice(1)}
                        </p>
                        <p className="text-[9px] text-slate-400">{strProjection.borough}</p>
                      </div>
                    </div>
                  </div>
                </FeatureGate>

                {/* Regulatory Warning (LL18) -- always shown */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{"\u26A0\uFE0F"}</span>
                    <div>
                      <p className="text-xs font-semibold text-amber-800">
                        NYC Local Law 18 -- Regulatory Risk: High
                      </p>
                      <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">
                        {strProjection.regulatoryNote}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Use case guidance (Pro+) */}
                <FeatureGate feature="bp_str_full" blur>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                      When STR Projections Apply
                    </p>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      STR projections are most relevant for: mixed-use buildings with ground floor commercial, buildings
                      being evaluated for condo conversion, and individual unit investors. For entire multifamily
                      buildings, long-term rental assumptions are typically more appropriate due to NYC LL18 restrictions.
                    </p>
                  </div>
                </FeatureGate>

                {/* Confidence + source */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      strProjection.confidence === "high" ? "bg-emerald-100 text-emerald-700" :
                      strProjection.confidence === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {strProjection.confidence} confidence
                  </span>
                  <p className="text-[10px] text-slate-400">{strProjection.dataSource}</p>
                </div>
              </div>
            ) : null}
          </Card>
        </FeatureGate>
      )}
    </div>
  );
}
