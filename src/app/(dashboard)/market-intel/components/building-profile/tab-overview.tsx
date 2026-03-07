"use client";

import OwnerContactCard from "../../sections/owner-contact-card";
import MotivationScoreCard from "../../sections/motivation-score-card";
import FeatureGate from "@/components/ui/feature-gate";
import ConditionSignal from "./condition-signal";
import ContactsList from "./contacts-list";
import { SkeletonPulse, SkeletonKeyValueGrid } from "./skeleton-components";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TabOverviewProps {
  pluto: any;
  intel: any; // BuildingIntelligence | null
  data: any;
  ownershipChain: any;
  entityIntel: any;
  portfolioDiscovery: any;
  contactEnrichment: any;
  contactEnrichmentLoading: boolean;
  ownershipDeepLoading: boolean;
  deepOwnershipStarted: boolean;
  ownerPortfolio: any[];
  portfolioLoading: boolean;
  motivationScore: any;
  motivationLoading: boolean;
  fannieLoan: any;
  loading: boolean;
  onLoadDeepAnalysis?: () => void;
  onNameClick?: (name: string) => void;
  onSmsClick: (phone: string, name?: string) => void;
  onPhoneResolved?: (phone: string) => void;
  onDealClick?: () => void;
  onNavigateTab?: (tab: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Distress Score helpers                                             */
/* ------------------------------------------------------------------ */

function distressLabel(score: number): string {
  if (score >= 81) return "Very High";
  if (score >= 61) return "High";
  if (score >= 41) return "Elevated";
  if (score >= 21) return "Moderate";
  return "Low";
}

function distressBgBorder(score: number): string {
  if (score >= 61) return "bg-red-50 border-red-200";
  if (score >= 41) return "bg-orange-50 border-orange-200";
  if (score >= 21) return "bg-amber-50 border-amber-200";
  return "bg-emerald-50 border-emerald-200";
}

function distressScoreColor(score: number): string {
  if (score >= 61) return "text-red-700";
  if (score >= 41) return "text-orange-700";
  if (score >= 21) return "text-amber-700";
  return "text-emerald-700";
}

function distressBadge(score: number): string {
  if (score >= 81) return "bg-red-200 text-red-800";
  if (score >= 61) return "bg-red-100 text-red-700";
  if (score >= 41) return "bg-orange-100 text-orange-700";
  if (score >= 21) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function signalDotColor(severity: string): string {
  if (severity === "high") return "text-red-500";
  if (severity === "medium") return "text-amber-500";
  return "text-slate-400";
}

/* ------------------------------------------------------------------ */
/*  Investment Score helpers                                           */
/* ------------------------------------------------------------------ */

function investmentBgBorder(score: number): string {
  if (score >= 60) return "bg-blue-50 border-blue-200";
  return "bg-slate-50 border-slate-200";
}

function investmentScoreColor(score: number): string {
  if (score >= 60) return "text-blue-700";
  if (score >= 30) return "text-blue-500";
  return "text-slate-400";
}

/* ------------------------------------------------------------------ */
/*  Intelligence Scores skeleton                                       */
/* ------------------------------------------------------------------ */

function IntelligenceScoresSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <SkeletonPulse className="h-4 w-32" />
        <SkeletonPulse className="h-4 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SkeletonPulse className="h-28 rounded-lg" />
        <SkeletonPulse className="h-28 rounded-lg" />
      </div>
      <SkeletonPulse className="h-20 rounded-lg" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TabOverview({
  pluto,
  intel,
  data,
  ownershipChain,
  entityIntel,
  portfolioDiscovery,
  contactEnrichment,
  contactEnrichmentLoading,
  ownershipDeepLoading,
  deepOwnershipStarted,
  ownerPortfolio,
  portfolioLoading,
  motivationScore,
  motivationLoading,
  fannieLoan,
  loading,
  onLoadDeepAnalysis,
  onNameClick,
  onSmsClick,
  onPhoneResolved,
  onDealClick,
  onNavigateTab,
}: TabOverviewProps) {
  return (
    <div className="space-y-3 p-4">
      {/* ── Owner + Contact Card ── */}
      <OwnerContactCard
        pluto={pluto}
        intel={intel}
        ownershipChain={ownershipChain}
        entityIntel={entityIntel}
        contactEnrichment={contactEnrichment}
        contactEnrichmentLoading={contactEnrichmentLoading}
        ownershipDeepLoading={ownershipDeepLoading}
        deepAnalysisRequested={deepOwnershipStarted}
        onLoadDeepAnalysis={onLoadDeepAnalysis}
        onNameClick={onNameClick}
        onSmsClick={onSmsClick}
        onPhoneResolved={onPhoneResolved}
      />

      {/* ── Motivation Score ── */}
      <MotivationScoreCard
        score={motivationScore}
        loading={motivationLoading}
        onEnrichClick={onLoadDeepAnalysis}
        onDealClick={onDealClick}
      />

      {/* ── Intelligence Scores ── */}
      {intel ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-bold text-slate-900">Intelligence Scores</h3>
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
              {intel.dataSources?.length ?? 0} data sources
            </span>
            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              Confidence: {intel.overallConfidence ?? 0}%
            </span>
          </div>

          {/* Score grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Distress Score */}
            <div className={`rounded-lg p-3 border ${distressBgBorder(intel.distressSignals?.score ?? 0)}`}>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                Distress Score
              </p>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-black ${distressScoreColor(intel.distressSignals?.score ?? 0)}`}>
                  {intel.distressSignals?.score ?? 0}
                </span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${distressBadge(intel.distressSignals?.score ?? 0)}`}>
                  {distressLabel(intel.distressSignals?.score ?? 0)}
                </span>
              </div>
              {intel.distressSignals?.signals?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {intel.distressSignals.signals.slice(0, 3).map((s: any, i: number) => (
                    <p key={i} className="text-[11px] text-slate-600 flex items-start gap-1">
                      <span className={signalDotColor(s.severity)}>&#x25CF;</span>
                      {s.description}
                    </p>
                  ))}
                  {intel.distressSignals.signals.length > 3 && (
                    <p className="text-[10px] text-slate-400">
                      +{intel.distressSignals.signals.length - 3} more signals
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Investment Score */}
            <FeatureGate feature="bp_investment_score" blur>
              <div className={`rounded-lg p-3 border ${investmentBgBorder(intel.investmentSignals?.score ?? 0)}`}>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                  Investment Score
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-black ${investmentScoreColor(intel.investmentSignals?.score ?? 0)}`}>
                    {intel.investmentSignals?.score ?? 0}
                  </span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span
                        key={star}
                        className={`text-sm ${
                          (intel.investmentSignals?.score ?? 0) >= star * 20
                            ? "text-amber-400"
                            : "text-slate-200"
                        }`}
                      >
                        &#x2605;
                      </span>
                    ))}
                  </div>
                </div>
                {intel.investmentSignals?.signals?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {intel.investmentSignals.signals.slice(0, 3).map((s: any, i: number) => (
                      <p key={i} className="text-[11px] text-slate-600 flex items-start gap-1">
                        <span className="text-blue-400">&#x25CF;</span>
                        {s.description}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </FeatureGate>
          </div>

          {/* Resolved Ownership */}
          {intel.ownership?.likelyOwner?.entityName && (
            <FeatureGate feature="bp_owner_name" blur>
              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                  Resolved Owner
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {intel.ownership.likelyOwner.entityName}
                </p>
                {intel.ownership.likelyOwner.likelyPerson &&
                  intel.ownership.likelyOwner.likelyPerson !== intel.ownership.likelyOwner.entityName && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      Likely individual: {intel.ownership.likelyOwner.likelyPerson}
                    </p>
                  )}
                {intel.ownership.likelyOwner.llcName &&
                  intel.ownership.likelyOwner.llcName !== intel.ownership.likelyOwner.entityName && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Entity: {intel.ownership.likelyOwner.llcName}
                    </p>
                  )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-400">
                    Sources: {intel.ownership.sources?.join(", ") ?? ""}
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                    {intel.ownership.confidence ?? 0}% confidence
                  </span>
                </div>
                {intel.ownership.likelyOwner.alternateNames?.length > 0 && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Also seen as: {intel.ownership.likelyOwner.alternateNames.slice(0, 3).join(", ")}
                  </p>
                )}
              </div>
            </FeatureGate>
          )}

          {/* Fannie Mae Loan Status */}
          {fannieLoan && (
            <FeatureGate feature="bp_fannie_mae_loan" blur>
              <div
                className={`mt-3 p-3 rounded-lg ${
                  fannieLoan.isOwnedByFannieMae
                    ? "bg-emerald-50 border border-emerald-100"
                    : "bg-slate-50"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                  Mortgage Status
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                      fannieLoan.isOwnedByFannieMae
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {fannieLoan.isOwnedByFannieMae ? "Fannie Mae Backed" : "Non-Agency Loan"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    as of{" "}
                    {fannieLoan.lookupDate
                      ? new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          year: "numeric",
                        }).format(new Date(fannieLoan.lookupDate))
                      : "\u2014"}
                  </span>
                </div>
                {fannieLoan.isOwnedByFannieMae && fannieLoan.servicerName && (
                  <p className="text-xs text-emerald-700 mt-1">
                    Servicer: {fannieLoan.servicerName}
                  </p>
                )}
                {fannieLoan.isOwnedByFannieMae && (
                  <p className="text-[10px] text-emerald-600 mt-1">
                    GSE-backed loans may offer streamlined refinancing and modification options
                  </p>
                )}
              </div>
            </FeatureGate>
          )}

          {/* Owner Portfolio (when deep portfolio discovery is not available) */}
          {!portfolioDiscovery && (ownerPortfolio.length > 0 || portfolioLoading) && (
            <div className="mt-3 p-3 bg-slate-50 rounded-lg">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
                Owner Portfolio
              </p>
              {portfolioLoading ? (
                <div className="space-y-2 py-1">
                  <SkeletonPulse className="h-3 w-48" />
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <SkeletonPulse className="h-3 w-36" />
                      <SkeletonPulse className="h-3 w-20" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-700 font-medium mb-2">
                    This owner has {ownerPortfolio.length + 1} properties totaling{" "}
                    {ownerPortfolio.reduce((sum: number, p: any) => sum + (p.units || 0), 0) +
                      (intel.property?.units?.value || 0)}{" "}
                    units
                  </p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {ownerPortfolio.slice(0, 8).map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium truncate max-w-[200px]">
                          {p.address || p.bbl}
                        </span>
                        <div className="flex items-center gap-2 text-slate-500">
                          <span>{p.units} units</span>
                          <span className="text-slate-300">|</span>
                          <span>{p.borough}</span>
                        </div>
                      </div>
                    ))}
                    {ownerPortfolio.length > 8 && (
                      <p className="text-[10px] text-slate-400">
                        +{ownerPortfolio.length - 8} more properties
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : loading ? (
        <IntelligenceScoresSkeleton />
      ) : null}

      {/* ── Condition Signal ── */}
      <ConditionSignal
        data={data}
        loading={loading && !intel}
        onNavigate={() => onNavigateTab?.("condition")}
      />

      {/* ── Contacts Preview ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <ContactsList
          hpdContacts={data?.hpdContacts ?? []}
          rankedContacts={data?.rankedContacts ?? []}
          enrichment={contactEnrichment}
          enrichmentLoading={contactEnrichmentLoading}
          maxVisible={3}
          onSmsClick={onSmsClick}
          onViewAll={() => onNavigateTab?.("ownership")}
        />
      </div>
    </div>
  );
}
