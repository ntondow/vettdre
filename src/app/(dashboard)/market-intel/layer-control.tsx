"use client";

import { useState } from "react";
import {
  Layers,
  ChevronDown,
  ChevronUp,
  MapPin,
  Grid3X3,
  Droplets,
  TrendingUp,
  Building2,
  Palette,
  TrainFront,
  CircleDot,
  Lock,
  X,
  Flame,
  HeartPulse,
  HardHat,
  DollarSign,
  AlertTriangle,
  Phone,
  Tag,
} from "lucide-react";
import { MAP_LAYERS, type LayerGroup, type MapLayerConfig, BASEMAPS, saveLayerVisibility } from "@/lib/map-layers";
import { hasPermission, getUpgradeMessage, type UserPlan } from "@/lib/feature-gate";

interface Props {
  visibility: Record<string, boolean>;
  onToggle: (layerId: string, visible: boolean) => void;
  activeBasemap: string;
  onBasemapChange: (basemapId: string) => void;
  userPlan?: UserPlan;
}

const ICON_MAP: Record<string, any> = {
  MapPin, Grid3X3, Droplets, TrendingUp, Building2, Palette, TrainFront, CircleDot,
  Flame, HeartPulse, HardHat, DollarSign, AlertTriangle, Phone, Tag,
};

const GROUP_LABELS: Record<LayerGroup, string> = {
  base: "Base",
  intelligence: "Intelligence",
  transit: "Transit",
  regulatory: "Regulatory",
  boundaries: "Boundaries",
  "street-intel": "Street Intel",
};

const GROUP_ORDER: LayerGroup[] = ["intelligence", "street-intel", "regulatory", "transit", "boundaries"];

export default function LayerControl({ visibility, onToggle, activeBasemap, onBasemapChange, userPlan = "pro" }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<LayerGroup>>(
    new Set(["intelligence", "regulatory", "transit"]),
  );

  const toggleGroup = (group: LayerGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleToggle = (layerId: string, visible: boolean) => {
    onToggle(layerId, visible);
    // Persist to localStorage
    const updated = { ...visibility, [layerId]: visible };
    saveLayerVisibility(updated);
  };

  const layersByGroup = GROUP_ORDER.map((group) => ({
    group,
    layers: MAP_LAYERS.filter((l) => l.group === group),
  })).filter((g) => g.layers.length > 0);

  const activeCount = Object.values(visibility).filter(Boolean).length;

  return (
    <div className="absolute top-3 left-3 z-[1002]">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg shadow-md border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
      >
        <Layers className="w-4 h-4" />
        <span>Layers</span>
        {activeCount > 0 && (
          <span className="ml-0.5 w-5 h-5 flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold rounded-full">
            {activeCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Map Config
            </p>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 hover:bg-slate-100 rounded"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          {/* Layer groups */}
          <div className="max-h-[400px] overflow-y-auto">
            {layersByGroup.map(({ group, layers }) => (
              <div key={group} className="border-b border-slate-50 last:border-0">
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {GROUP_LABELS[group]}
                  </span>
                  {expandedGroups.has(group) ? (
                    <ChevronUp className="w-3 h-3 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  )}
                </button>
                {expandedGroups.has(group) && (
                  <div className="pb-1">
                    {layers.map((layer) => (
                      <LayerRow
                        key={layer.id}
                        layer={layer}
                        visible={visibility[layer.id] ?? layer.defaultVisible}
                        onToggle={handleToggle}
                        userPlan={userPlan}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Basemap Switcher */}
            <div className="border-t border-slate-100 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Base Map
              </p>
              <div className="flex gap-1">
                {BASEMAPS.map((bm) => (
                  <button
                    key={bm.id}
                    onClick={() => onBasemapChange(bm.id)}
                    className={`flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                      activeBasemap === bm.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {bm.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  layer,
  visible,
  onToggle,
  userPlan,
}: {
  layer: MapLayerConfig;
  visible: boolean;
  onToggle: (id: string, v: boolean) => void;
  userPlan: UserPlan;
}) {
  const Icon = ICON_MAP[layer.icon] || Layers;
  const gated = layer.featureGate && !hasPermission(userPlan, layer.featureGate);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 ${
        gated ? "opacity-50" : "hover:bg-slate-50"
      } transition-colors`}
    >
      <Icon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <span className="text-xs text-slate-700 flex-1 truncate">{layer.label}</span>
      {layer.minZoom > 12 && (
        <span className="text-[9px] text-slate-400 flex-shrink-0">
          z{layer.minZoom}+
        </span>
      )}
      {gated ? (
        <span title={getUpgradeMessage(layer.featureGate!)}>
          <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
        </span>
      ) : (
        <button
          onClick={() => onToggle(layer.id, !visible)}
          className={`w-7 h-4 rounded-full flex-shrink-0 transition-colors relative ${
            visible ? "bg-blue-600" : "bg-slate-300"
          }`}
          title={visible ? "Hide layer" : "Show layer"}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
              visible ? "left-3.5" : "left-0.5"
            }`}
          />
        </button>
      )}
    </div>
  );
}
