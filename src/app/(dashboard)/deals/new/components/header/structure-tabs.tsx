"use client";

import React from "react";
import { Banknote, Building2, ArrowRightLeft, KeyRound, Users } from "lucide-react";
import type { DealStructureType } from "@/lib/deal-structure-engine";
import { STRUCTURE_LABELS } from "@/lib/deal-structure-engine";

const STRUCTURE_ICONS: Record<DealStructureType, typeof Banknote> = {
  all_cash: Banknote,
  conventional: Building2,
  bridge_refi: ArrowRightLeft,
  assumable: KeyRound,
  syndication: Users,
};

const STRUCTURE_SUBTITLES: Record<DealStructureType, string> = {
  all_cash: "Pure equity play",
  conventional: "Standard leverage",
  bridge_refi: "BRRRR strategy",
  assumable: "Below-market rate",
  syndication: "LP/GP structure",
};

export interface StructureTabsProps {
  activeStructure: DealStructureType;
  setActiveStructure: (s: DealStructureType) => void;
  showComparison: boolean;
  setShowComparison: (v: boolean) => void;
  runComparison: () => void;
}

export function StructureTabs({
  activeStructure,
  setActiveStructure,
  showComparison,
  setShowComparison,
  runComparison,
}: StructureTabsProps) {
  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-6 pt-4">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {(["all_cash", "conventional", "bridge_refi", "assumable", "syndication"] as DealStructureType[]).map(s => {
          const Icon = STRUCTURE_ICONS[s];
          return (
            <button
              key={s}
              onClick={() => { setActiveStructure(s); setShowComparison(false); }}
              className={`flex-shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border transition-all min-w-[120px] ${
                activeStructure === s
                  ? "bg-blue-500/5 border-l-2 border-l-blue-500 border-y-white/5 border-r-white/5"
                  : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${activeStructure === s ? "text-blue-400" : "text-slate-500"}`} />
              <div className="text-left">
                <p className={`text-[13px] font-bold leading-tight ${activeStructure === s ? "text-white" : "text-slate-300"}`}>{STRUCTURE_LABELS[s]}</p>
                <p className="text-[11px] text-slate-500 leading-tight">{STRUCTURE_SUBTITLES[s]}</p>
              </div>
            </button>
          );
        })}
        <div className="h-8 w-px bg-white/10 mx-1 flex-shrink-0" />
        <button
          onClick={runComparison}
          className={`flex-shrink-0 px-3.5 py-2.5 rounded-lg text-xs font-medium border transition-all ${
            showComparison
              ? "bg-violet-500/10 border-violet-500/30 text-violet-400"
              : "bg-white/[0.02] border-white/5 text-violet-400 hover:bg-white/[0.04]"
          }`}
        >
          Compare All
        </button>
      </div>
    </div>
  );
}
