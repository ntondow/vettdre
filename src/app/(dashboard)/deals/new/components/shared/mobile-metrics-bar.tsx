"use client";

import { useDealModeler } from "../../deal-modeler-context";
import { fmtPct, fmtX } from "./format-utils";

export function MobileMetricsBar() {
  const { outputs, structureAnalysis, inputs } = useDealModeler();

  const hasData = inputs.purchasePrice > 0 && outputs.noi !== 0;
  if (!hasData) return null;

  const metrics = [
    {
      label: "Cap Rate",
      value: fmtPct(outputs.capRate),
      color: outputs.capRate >= 5 ? "text-emerald-400" : outputs.capRate >= 3 ? "text-amber-400" : "text-red-400",
    },
    {
      label: "CoC",
      value: fmtPct(structureAnalysis?.cashOnCash ?? outputs.cashOnCashAmort),
      color: (structureAnalysis?.cashOnCash ?? outputs.cashOnCashAmort) >= 8
        ? "text-emerald-400"
        : (structureAnalysis?.cashOnCash ?? outputs.cashOnCashAmort) >= 4
        ? "text-amber-400"
        : "text-red-400",
    },
    {
      label: "IRR",
      value: isFinite(structureAnalysis?.irr ?? outputs.irr) ? fmtPct(structureAnalysis?.irr ?? outputs.irr) : "N/A",
      color: (structureAnalysis?.irr ?? outputs.irr) >= 15
        ? "text-emerald-400"
        : (structureAnalysis?.irr ?? outputs.irr) >= 8
        ? "text-amber-400"
        : "text-red-400",
    },
  ];

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 md:hidden bg-[#0B0F19]/95 backdrop-blur-md border-t border-white/10 px-4 py-2.5">
      <div className="flex items-center justify-around">
        {metrics.map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-[9px] uppercase tracking-widest text-slate-500">{m.label}</p>
            <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
