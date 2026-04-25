"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Landmark, BarChart3 } from "lucide-react";
import { intelApi } from "@/lib/intel-api-client";
import type { IntelBuildingResponse } from "@/lib/intel-api-types";
import type { UserPlan } from "@/lib/feature-gate";
import SignalChip from "@/components/intel/SignalChip";
import UnitDirectory from "@/components/intel/UnitDirectory";
import MortgageStack from "@/components/intel/MortgageStack";
import EntityDossierSlideOver from "@/components/intel/EntityDossierSlideOver";
import IntelUpgradeTease from "@/components/intel/IntelUpgradeTease";

interface Props {
  bbl: string;
  building: {
    id: string;
    bbl: string;
    address: string;
    normalizedAddress: string;
    borough: number;
    totalUnits: number | null;
    residentialUnits: number | null;
    yearBuilt: number | null;
    buildingClass: string | null;
    propertyType: string | null;
  };
  hasCondo: boolean;
  plan: UserPlan;
}

const BORO_NAMES: Record<number, string> = { 1: "Manhattan", 2: "Bronx", 3: "Brooklyn", 4: "Queens", 5: "Staten Island" };
type Tab = "overview" | "units" | "owners" | "mortgages";

export default function BuildingDossierClient({ bbl, building, hasCondo, plan }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<IntelBuildingResponse | null>(null);
  const [loading, setLoading] = useState(hasCondo);
  const [entityDossierId, setEntityDossierId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCondo) return;
    intelApi.getBuilding(bbl).then(d => { setData(d); setLoading(false); });
  }, [bbl, hasCondo]);

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: "overview", label: "Overview", icon: Building2 },
    { key: "units", label: "Units", icon: Users },
    { key: "owners", label: "Owners", icon: BarChart3 },
    { key: "mortgages", label: "Mortgages", icon: Landmark },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{building.address}</h1>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-sm text-slate-500">{BORO_NAMES[building.borough]}</span>
          <span className="text-xs font-mono text-slate-400">BBL {bbl}</span>
          {building.propertyType && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 capitalize">
              {building.propertyType}
            </span>
          )}
          {building.totalUnits && (
            <span className="text-xs text-slate-500">{building.totalUnits} units</span>
          )}
          {building.yearBuilt && (
            <span className="text-xs text-slate-500">Built {building.yearBuilt}</span>
          )}
        </div>

        {/* Signal chips */}
        {data?.signals && data.signals.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {data.signals
              .filter(s => s.score !== null && (s.score || 0) > 0)
              .sort((a, b) => (b.score || 0) - (a.score || 0))
              .map(s => <SignalChip key={s.signalType} signal={s} />)}
          </div>
        )}
      </div>

      {/* Plan gate */}
      {!hasCondo ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Building2 size={32} className="mx-auto text-slate-300 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Building Intelligence</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            Unit-level ownership, distress signals, mortgage stack analysis, and owner dossiers are available on the Pro plan.
          </p>
          <a
            href="/settings/billing"
            className="inline-block mt-4 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Upgrade to Pro
          </a>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b border-slate-200 mb-4">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !data ? (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">Building intelligence not yet available for this property.</p>
              <p className="text-xs mt-1">Data is populated as buildings are ingested from NYC Open Data sources.</p>
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <div className="space-y-6">
                  {/* Ownership summary */}
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <h2 className="text-sm font-semibold text-slate-800 mb-3">Ownership Summary</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-2xl font-bold text-slate-900">{data.ownershipSummary.uniqueOwners}</p>
                        <p className="text-xs text-slate-400">Unique Owners</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-600">{data.ownershipSummary.primaryResidencePct}%</p>
                        <p className="text-xs text-slate-400">Primary Residence</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-600">{data.ownershipSummary.investorPct}%</p>
                        <p className="text-xs text-slate-400">Investor-Owned</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">{data.ownershipSummary.sponsorOwnedCount}</p>
                        <p className="text-xs text-slate-400">Sponsor Units</p>
                      </div>
                    </div>
                  </div>

                  {/* Mortgage summary */}
                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                    <h2 className="text-sm font-semibold text-slate-800 mb-3">Mortgage Stack</h2>
                    <MortgageStack summary={data.mortgageSummary} />
                  </div>

                  {/* Last sale */}
                  {data.lastSale && (
                    <div className="bg-white rounded-lg border border-slate-200 p-4">
                      <h2 className="text-sm font-semibold text-slate-800 mb-2">Last Sale</h2>
                      <p className="text-sm text-slate-600">
                        {data.lastSale.price ? `$${(data.lastSale.price / 1_000_000).toFixed(2)}M` : "—"} on {data.lastSale.date}
                      </p>
                      {data.lastSale.grantor && <p className="text-xs text-slate-400">From: {data.lastSale.grantor}</p>}
                      {data.lastSale.grantee && <p className="text-xs text-slate-400">To: {data.lastSale.grantee}</p>}
                    </div>
                  )}
                </div>
              )}

              {tab === "units" && (
                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <UnitDirectory bbl={bbl} height={500} />
                </div>
              )}

              {tab === "owners" && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Owner graph view coming in Phase 9
                </div>
              )}

              {tab === "mortgages" && (
                <div className="bg-white rounded-lg border border-slate-200 p-4">
                  <MortgageStack summary={data.mortgageSummary} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Entity dossier */}
      {entityDossierId && (
        <EntityDossierSlideOver
          entityId={entityDossierId}
          onClose={() => setEntityDossierId(null)}
          onEntityClick={setEntityDossierId}
        />
      )}
    </div>
  );
}
