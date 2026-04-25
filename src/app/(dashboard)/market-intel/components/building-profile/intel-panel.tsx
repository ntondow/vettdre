"use client";

import { useState, useEffect, useCallback } from "react";
import { hasPermission } from "@/lib/feature-gate";
import type { UserPlan } from "@/lib/feature-gate";
import { intelApi } from "@/lib/intel-api-client";
import type { IntelBuildingResponse } from "@/lib/intel-api-types";
import SignalChip from "@/components/intel/SignalChip";
import UnitDirectory from "@/components/intel/UnitDirectory";
import MortgageStack from "@/components/intel/MortgageStack";
import EntityDossierSlideOver from "@/components/intel/EntityDossierSlideOver";
import IntelUpgradeTease from "@/components/intel/IntelUpgradeTease";

interface Props {
  bbl: string;
  plan: UserPlan;
}

/**
 * Intel panel embedded in the existing building profile slide-over.
 * Shows condo_intel data when available and plan-gated to pro+.
 *
 * Graceful degradation: renders nothing for buildings without Co_buildings data.
 * Shows upgrade tease for free/explorer users.
 */
export default function IntelPanel({ bbl, plan }: Props) {
  const [data, setData] = useState<IntelBuildingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUnits, setShowUnits] = useState(false);
  const [entityDossierId, setEntityDossierId] = useState<string | null>(null);

  const hasCondo = hasPermission(plan, "condo_intel");

  useEffect(() => {
    if (!hasCondo || !bbl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    intelApi.getBuilding(bbl).then(d => { setData(d); setLoading(false); });
  }, [bbl, hasCondo]);

  // Free/explorer: show upgrade tease only (don't show if pro+ but no data)
  if (!hasCondo) {
    return <IntelUpgradeTease />;
  }

  // Loading
  if (loading) {
    return (
      <div className="space-y-2 p-3">
        <div className="h-8 bg-slate-100 rounded animate-pulse" />
        <div className="h-20 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  // No condo_ownership data for this building — don't render anything
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Signals panel */}
      {data.signals.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Distress &amp; Opportunity Signals
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {data.signals
              .filter(s => s.score !== null && s.score > 0)
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .map(s => <SignalChip key={s.signalType} signal={s} />)}
          </div>
        </div>
      )}

      {/* Ownership summary */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Ownership Summary
        </h3>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">{data.ownershipSummary.uniqueOwners}</p>
            <p className="text-[9px] text-slate-400">Owners</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-green-600">{data.ownershipSummary.primaryResidencePct}%</p>
            <p className="text-[9px] text-slate-400">Primary Res.</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-600">{data.ownershipSummary.investorPct}%</p>
            <p className="text-[9px] text-slate-400">Investors</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-600">{data.ownershipSummary.sponsorOwnedCount}</p>
            <p className="text-[9px] text-slate-400">Sponsor</p>
          </div>
        </div>
      </div>

      {/* Unit directory toggle */}
      <div>
        <button
          onClick={() => setShowUnits(!showUnits)}
          className="w-full text-left flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <span className="text-xs font-medium text-slate-700">
            Unit Directory ({data.building.totalUnits || 0} units)
          </span>
          <span className="text-[10px] text-blue-600">{showUnits ? "Hide" : "Show"}</span>
        </button>
        {showUnits && (
          <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
            <UnitDirectory bbl={bbl} height={300} />
          </div>
        )}
      </div>

      {/* Mortgage stack */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Mortgage Stack
        </h3>
        <MortgageStack summary={data.mortgageSummary} />
      </div>

      {/* Last sale */}
      {data.lastSale && (
        <div className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded">
          <span className="font-medium">Last Sale:</span>{" "}
          {data.lastSale.price ? `$${(data.lastSale.price / 1_000_000).toFixed(2)}M` : "—"}{" "}
          on {data.lastSale.date}
          {data.lastSale.grantee && (
            <button
              onClick={() => {
                // Would need entity ID — skip for now, show name
              }}
              className="ml-1 text-blue-600 hover:text-blue-800"
            >
              → {data.lastSale.grantee}
            </button>
          )}
        </div>
      )}

      {/* Entity dossier slide-over */}
      {entityDossierId && (
        <EntityDossierSlideOver
          entityId={entityDossierId}
          onClose={() => setEntityDossierId(null)}
          onEntityClick={(id) => setEntityDossierId(id)} // recursive
        />
      )}
    </div>
  );
}
