"use client";

// Sticky building profile header: address line, key stats, action buttons
// Stays visible above tab bar as user scrolls

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VitalityScore } from "@/lib/vitality-engine";
import { VITALITY_LEVEL_CONFIG } from "@/lib/vitality-engine";
import { fmtDate } from "../../sections/format-utils";

interface Props {
  displayAddr: string;
  displayBorough: string;
  displayNeighborhood: string | null;
  displayZip: string;
  block: string;
  lot: string;
  boroCode: string;
  pluto: any;
  data: any;
  intel: any;
  vitalityScore: VitalityScore | null;
  crmResult: { contactId: string; enriched: boolean } | null;
  addingToCRM: boolean;
  underwriting: boolean;
  pdfExporting: boolean;
  bovGenerating: boolean;
  connectedVia?: string[];
  onClose: () => void;
  onNameClick?: (name: string) => void;
  onAddToCRM: () => void;
  onUnderwrite: () => void;
  onExportPDF: () => void;
  onGenerateBOV: () => void;
  onManualModel: () => void;
}

export default function ProfileHeader({
  displayAddr,
  displayBorough,
  displayNeighborhood,
  displayZip,
  block,
  lot,
  boroCode,
  pluto,
  data,
  intel,
  vitalityScore,
  crmResult,
  addingToCRM,
  underwriting,
  pdfExporting,
  bovGenerating,
  connectedVia,
  onClose,
  onNameClick,
  onAddToCRM,
  onUnderwrite,
  onExportPDF,
  onGenerateBOV,
  onManualModel,
}: Props) {
  const [vitalityExpanded, setVitalityExpanded] = useState(false);

  const p = pluto;
  const units = p?.unitsRes || p?.unitsres || 0;
  const floors = p?.numFloors || p?.numfloors || 0;
  const yearBuilt = p?.yearBuilt || p?.yearbuilt || 0;
  const bldgArea = p?.bldgArea || p?.bldgarea || 0;
  const assessTotal = p?.assessTotal || p?.assesstot || 0;

  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
      {/* Address + action buttons row */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 truncate">{displayAddr}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {displayNeighborhood ? `${displayNeighborhood}, ${displayBorough}` : displayBorough}
              {displayZip ? ` ${displayZip}` : ""}
              {" "}· Block {block}, Lot {lot}
            </p>
            {connectedVia && connectedVia.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">Connected via:</span>
                {connectedVia.map((name, i) => (
                  <span key={i}>
                    {onNameClick ? (
                      <button onClick={() => onNameClick(name)} className="text-[10px] text-blue-600 hover:underline font-medium">{name}</button>
                    ) : (
                      <span className="text-[10px] text-slate-600 font-medium">{name}</span>
                    )}
                    {i < connectedVia.length - 1 && <span className="text-[10px] text-slate-300 ml-0.5">·</span>}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons — compact row */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {data && !crmResult && (
              <button onClick={onAddToCRM} disabled={addingToCRM}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1">
                {addingToCRM ? (
                  <><span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full" /> Adding...</>
                ) : "Add to CRM"}
              </button>
            )}
            {crmResult && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                {crmResult.enriched ? "Added & enriched!" : "Added to CRM!"}
              </span>
            )}
            <button onClick={onUnderwrite} disabled={underwriting}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1">
              {underwriting ? (
                <><span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full" /> ...</>
              ) : (
                <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Underwrite</>
              )}
            </button>
            <button onClick={onExportPDF} disabled={pdfExporting}
              className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1">
              {pdfExporting ? (
                <><span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-full" /> ...</>
              ) : (
                <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> PDF</>
              )}
            </button>
            <button onClick={onGenerateBOV} disabled={bovGenerating}
              className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1">
              {bovGenerating ? (
                <><span className="animate-spin inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full" /> BOV...</>
              ) : (
                <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> BOV</>
              )}
            </button>
            <a onClick={onManualModel}
              className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-[10px] font-bold rounded-lg transition-colors cursor-pointer">
              Manual
            </a>
          </div>
        </div>
      </div>

      {/* Compact stats strip */}
      {p && (
        <div className="px-4 pb-2 flex items-center gap-3 overflow-x-auto no-scrollbar">
          {[
            { label: "Units", value: units || "—" },
            { label: "Floors", value: floors || "—" },
            { label: "Built", value: yearBuilt || "—" },
            { label: "Sq Ft", value: bldgArea > 0 ? bldgArea.toLocaleString() : "—" },
            { label: "Assessed", value: assessTotal > 0 ? "$" + (assessTotal >= 1e6 ? (assessTotal / 1e6).toFixed(1) + "M" : Math.round(assessTotal / 1000) + "K") : "—" },
            { label: "Zoning", value: p.zoneDist1 || p.zoneDist || "—" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1 text-[10px] shrink-0">
              <span className="text-slate-400 uppercase tracking-wider">{s.label}</span>
              <span className="font-bold text-slate-800">{s.value}</span>
            </div>
          ))}

          {/* Vitality inline badge */}
          {vitalityScore && (() => {
            const cfg = VITALITY_LEVEL_CONFIG[vitalityScore.level];
            return (
              <button
                onClick={() => setVitalityExpanded(!vitalityExpanded)}
                className="flex items-center gap-1 text-[10px] shrink-0 px-1.5 py-0.5 rounded-full border border-slate-200 hover:border-slate-300 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                <span className="font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
              </button>
            );
          })()}
        </div>
      )}

      {/* Vitality expanded panel (below stats strip) */}
      {vitalityExpanded && vitalityScore && (() => {
        const cfg = VITALITY_LEVEL_CONFIG[vitalityScore.level];
        return (
          <div className={`px-4 pb-3 ${cfg.bgColor}`}>
            <div className="space-y-1 text-[10px]">
              {vitalityScore.positiveIndicators.slice(0, 3).map((poi, i) => (
                <p key={i} className="text-slate-600 flex items-center gap-1">
                  <span className="text-emerald-500">▲</span> {poi.brand || poi.name}
                </p>
              ))}
              {vitalityScore.negativeIndicators.slice(0, 2).map((poi, i) => (
                <p key={i} className="text-slate-600 flex items-center gap-1">
                  <span className="text-red-500">▼</span> {poi.brand || poi.name}
                </p>
              ))}
              <p className="text-slate-400">
                Score {vitalityScore.score > 0 ? "+" : ""}{vitalityScore.score} · ZIP {vitalityScore.zipCode} · {vitalityScore.confidence} confidence
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
