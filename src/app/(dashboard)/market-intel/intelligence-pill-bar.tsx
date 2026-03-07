"use client";

import { useState, useRef, useEffect } from "react";
import {
  Flame, HeartPulse, HardHat, Building, DollarSign,
  AlertTriangle, Phone, Tag, Settings, ArrowUpDown, Lock, Check, Loader2,
} from "lucide-react";
import { hasPermission, getUpgradeMessage, type UserPlan } from "@/lib/feature-gate";
import type { Feature } from "@/lib/feature-gate";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

interface LayerPill {
  layerId: string;
  label: string;
  tooltip: string;
  icon: typeof Flame;
  activeColor: string;       // Tailwind bg class when active
  activeBorder: string;      // Tailwind ring class when active
  featureGate?: Feature;
}

const LAYER_PILLS: LayerPill[] = [
  { layerId: "hot-leads", label: "Hot Leads", tooltip: "Buildings with high seller motivation — distress signals, long holds, violations", icon: Flame, activeColor: "bg-red-600", activeBorder: "ring-red-300", featureGate: "motivation_scoring" },
  { layerId: "vitality", label: "Vitality", tooltip: "Neighborhood change detection — gentrification and disinvestment from brand presence", icon: HeartPulse, activeColor: "bg-emerald-600", activeBorder: "ring-emerald-300", featureGate: "vitality_overlay" },
  { layerId: "new-developments", label: "New Devs", tooltip: "Recently constructed or permitted new development buildings", icon: HardHat, activeColor: "bg-amber-500", activeBorder: "ring-amber-300" },
  { layerId: "construction", label: "Construction", tooltip: "Active DOB construction permits and demolitions", icon: Building, activeColor: "bg-orange-500", activeBorder: "ring-orange-300", featureGate: "street_intel_construction" },
  { layerId: "recent-sales", label: "Sales", tooltip: "Recent sale prices from the last 24 months", icon: DollarSign, activeColor: "bg-green-600", activeBorder: "ring-green-300", featureGate: "street_intel_sales" },
  { layerId: "violations", label: "Violations", tooltip: "HPD and DOB violation density by building", icon: AlertTriangle, activeColor: "bg-red-500", activeBorder: "ring-red-300", featureGate: "street_intel_violations" },
  { layerId: "complaints-311", label: "311", tooltip: "Quality-of-life complaints — noise, heat/hot water, sanitation", icon: Phone, activeColor: "bg-violet-600", activeBorder: "ring-violet-300", featureGate: "street_intel_311" },
  { layerId: "building-labels", label: "Labels", tooltip: "Show owner name, units, and assessed value on buildings (zoom 17+)", icon: Tag, activeColor: "bg-slate-600", activeBorder: "ring-slate-300", featureGate: "building_labels" },
];

const SORT_OPTIONS = [
  { value: "units" as const, label: "Units" },
  { value: "value" as const, label: "Value" },
  { value: "year" as const, label: "Year Built" },
  { value: "floors" as const, label: "Floors" },
  { value: "distance" as const, label: "Distance" },
];

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface IntelligencePillBarProps {
  layerVisibility: Record<string, boolean>;
  onToggle: (layerId: string, visible: boolean) => void;
  userPlan?: UserPlan;
  loadingStates: Record<string, boolean>;
  sortBy: "units" | "value" | "year" | "floors" | "distance";
  onSortChange: (sort: "units" | "value" | "year" | "floors" | "distance") => void;
  excludePublic: boolean;
  onExcludePublicChange: (v: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntelligencePillBar({
  layerVisibility,
  onToggle,
  userPlan = "pro",
  loadingStates,
  sortBy,
  onSortChange,
  excludePublic,
  onExcludePublicChange,
}: IntelligencePillBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // Outside-click dismissal
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeCount = LAYER_PILLS.filter(
    (p) => layerVisibility[p.layerId] ?? false,
  ).length;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
      {/* Settings pill */}
      <div ref={settingsRef} className="relative flex-shrink-0">
        <button
          onClick={() => { setSettingsOpen(!settingsOpen); setSortOpen(false); }}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium border transition-colors ${
            settingsOpen
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {settingsOpen && (
          <div className="absolute top-full left-0 mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 animate-fade-in">
            <div className="p-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-slate-700">Hide public housing</span>
                <button
                  onClick={() => onExcludePublicChange(!excludePublic)}
                  className={`w-8 h-[18px] rounded-full flex-shrink-0 transition-colors relative ${
                    excludePublic ? "bg-blue-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${
                      excludePublic ? "left-[16px]" : "left-[2px]"
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-slate-200 flex-shrink-0" />

      {/* Layer pills */}
      {LAYER_PILLS.map((pill) => {
        const active = layerVisibility[pill.layerId] ?? false;
        const isLoading = loadingStates[pill.layerId] ?? false;
        const gated = pill.featureGate ? !hasPermission(userPlan, pill.featureGate) : false;
        const Icon = pill.icon;

        return (
          <button
            key={pill.layerId}
            onClick={() => {
              if (gated) {
                alert(getUpgradeMessage(pill.featureGate!));
                return;
              }
              onToggle(pill.layerId, !active);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border whitespace-nowrap transition-all flex-shrink-0 ${
              gated
                ? "opacity-50 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200"
                : active
                  ? `${pill.activeColor} text-white border-transparent ring-2 ${pill.activeBorder}`
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
            title={gated ? getUpgradeMessage(pill.featureGate!) : pill.tooltip}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : gated ? (
              <Lock className="w-3.5 h-3.5" />
            ) : (
              <Icon className="w-3.5 h-3.5" />
            )}
            <span>{pill.label}</span>
          </button>
        );
      })}

      {/* Separator */}
      <div className="w-px h-5 bg-slate-200 flex-shrink-0" />

      {/* Sort dropdown */}
      <div ref={sortRef} className="relative flex-shrink-0">
        <button
          onClick={() => { setSortOpen(!sortOpen); setSettingsOpen(false); }}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap ${
            sortOpen
              ? "bg-slate-800 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label}</span>
        </button>

        {sortOpen && (
          <div className="absolute top-full right-0 mt-1.5 w-36 bg-white rounded-xl shadow-xl border border-slate-200 z-50 animate-fade-in">
            <div className="py-1">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors"
                >
                  <span className={sortBy === opt.value ? "font-semibold text-slate-900" : "text-slate-600"}>
                    {opt.label}
                  </span>
                  {sortBy === opt.value && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Active count badge */}
      {activeCount > 0 && (
        <span className="flex-shrink-0 text-[10px] font-medium text-slate-400 whitespace-nowrap pl-1">
          {activeCount} active
        </span>
      )}
    </div>
  );
}
