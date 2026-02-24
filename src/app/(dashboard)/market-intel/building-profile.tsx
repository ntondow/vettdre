"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchBuildingProfile, fetchRelatedProperties, createContactFromBuilding, fetchBuildingComps } from "./building-profile-actions";
import type { RPIERecord, LL84Data, LL97Risk, LL84UtilityEstimate } from "./building-profile-actions";
import { fetchBuildingIntelligence, findOwnerPortfolio } from "@/lib/data-fusion-engine";
import type { BuildingIntelligence } from "@/lib/data-fusion-engine";
import { skipTrace } from "./tracerfy";
import { getNeighborhoodNameByZip } from "@/lib/neighborhoods";
import { underwriteDeal } from "@/app/(dashboard)/deals/actions";
import type { CompSale, CompSummary, CompResult } from "@/lib/comps-engine";
import { fetchCompsWithValuation } from "./comps-actions";
import type { MarketAppreciation } from "@/lib/fhfa";
import type { RedfinMetrics, MarketTemperature } from "@/lib/redfin-market";
import FeatureGate from "@/components/ui/feature-gate";
import SmsComposeModal from "@/components/ui/sms-compose-modal";
import { fetchNeighborhoodProfile } from "./neighborhood-actions";
import type { NeighborhoodProfile } from "./neighborhood-actions";

interface Props {
  boroCode: string;
  block: string;
  lot: string;
  address?: string;
  borough?: string;
  ownerName?: string;
  onClose: () => void;
  onNameClick?: (name: string) => void;
  connectedVia?: string[];
}

const fmtPrice = (n: number) => n > 0 ? "$" + n.toLocaleString() : "—";
const fmtDate = (d: string) => {
  if (!d) return "—";
  try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d)); } catch { return d; }
};

// Collapsible section wrapper
function Section({ id, title, icon, badge, className, collapsed, onToggle, children }: {
  id: string; title: string; icon?: string; badge?: React.ReactNode;
  className?: string; collapsed: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className={className || "bg-white rounded-xl border border-slate-200"}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-5 text-left cursor-pointer">
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {badge}
        </div>
        <span className={"text-slate-400 text-xs transition-transform duration-200 " + (collapsed ? "" : "rotate-90")}>▶</span>
      </button>
      <div className={"grid transition-[grid-template-rows] duration-200 ease-out " + (collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BuildingProfile({ boroCode, block, lot, address, borough, ownerName, onClose, onNameClick, connectedVia }: Props) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [intel, setIntel] = useState<BuildingIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [relatedProperties, setRelatedProperties] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [relatedDone, setRelatedDone] = useState(false);
  const [ownerPortfolio, setOwnerPortfolio] = useState<{ bbl: string; address: string; units: number; borough: string; assessedValue: number }[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [skipTraceResult, setSkipTraceResult] = useState<any>(null);
  const [skipTracing, setSkipTracing] = useState(false);
  const [addingToCRM, setAddingToCRM] = useState(false);
  const [crmResult, setCrmResult] = useState<{ contactId: string; enriched: boolean } | null>(null);
  const [underwriting, setUnderwriting] = useState(false);
  // Comps state (basic — kept for backward compat)
  const [comps, setComps] = useState<CompSale[]>([]);
  const [compSummary, setCompSummary] = useState<CompSummary | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsLoaded, setCompsLoaded] = useState(false);
  const [compRadius, setCompRadius] = useState(2);
  const [compYears, setCompYears] = useState(5);
  const [compMinUnits, setCompMinUnits] = useState(5);
  // Enhanced comps with valuation
  const [compResult, setCompResult] = useState<CompResult | null>(null);
  const [enhancedCompsLoading, setEnhancedCompsLoading] = useState(false);
  const [enhancedRadius, setEnhancedRadius] = useState(0.5);
  const [enhancedMaxDays, setEnhancedMaxDays] = useState(730);
  // RPIE + LL84 state (populated from BuildingIntelligence)
  const [rpieRecords, setRpieRecords] = useState<RPIERecord[]>([]);
  const [ll84Data, setLl84Data] = useState<LL84Data | null>(null);
  const [ll97Risk, setLl97Risk] = useState<LL97Risk | null>(null);
  const [ll84Utilities, setLl84Utilities] = useState<LL84UtilityEstimate | null>(null);
  // Census / Neighborhood profile
  const [censusProfile, setCensusProfile] = useState<NeighborhoodProfile | null>(null);
  const [censusLoading, setCensusLoading] = useState(false);
  // HUD Fair Market Rents
  const [hudFmr, setHudFmr] = useState<import("@/lib/hud").HudFmrData | null>(null);
  // Market Trends (FHFA + Redfin)
  const [marketAppreciation, setMarketAppreciation] = useState<MarketAppreciation | null>(null);
  const [redfinMetrics, setRedfinMetrics] = useState<RedfinMetrics | null>(null);
  const [marketTemp, setMarketTemp] = useState<{ temperature: MarketTemperature; label: string } | null>(null);
  // Fannie Mae Loan Lookup
  const [fannieLoan, setFannieLoan] = useState<import("@/lib/fannie-mae").FannieLoanResult | null>(null);

  // Smart defaults: collapse lower-priority sections
  const [smsTarget, setSmsTarget] = useState<{ phone: string; name?: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    permits: true,
    violations: true,
    ecb: true,
    complaints: true,
    litigation: true,
    listings: true,
    comps: false,
    energy: true,
    census: true,
  });

  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const isCollapsed = (key: string) => !!collapsed[key];

  // ============================================================
  // UNIFIED DATA FETCH — Data Fusion Engine
  // Queries ALL sources in parallel, resolves entities, scores
  // ============================================================
  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");

    // Run both the fusion engine AND the legacy profile fetch in parallel
    // Fusion engine provides the unified intelligence layer
    // Legacy fetch provides the raw data the UI still directly references
    Promise.all([
      fetchBuildingIntelligence(bbl).catch(err => { console.error("Fusion engine error:", err); return null; }),
      fetchBuildingProfile(boroCode, block, lot).catch(err => { console.error("Legacy profile error:", err); return null; }),
    ])
      .then(([intelResult, legacyData]) => {
        if (intelResult) {
          setIntel(intelResult);
          // Populate RPIE/LL84 from fusion engine (already fetched in parallel)
          if (intelResult.compliance.rpieStatus === "non_compliant") {
            setRpieRecords(intelResult.compliance.rpieYearsMissed.map(y => ({
              bbl: intelResult.bbl, borough: "", address: "", block: "", lot: "",
              ownerName: "", neighborhood: "", buildingClass: "", assessedValue: 0,
              filingYear: y, units: 0,
            })));
          }
          if (intelResult.energy) {
            const e = intelResult.energy;
            setLl84Data({
              bbl: intelResult.bbl, propertyName: "", address: intelResult.address.raw,
              primaryUse: "", grossFloorArea: intelResult.property.grossSqft?.value || 0,
              yearBuilt: intelResult.property.yearBuilt?.value || 0,
              energyStarScore: e.energyStarScore, energyStarGrade: e.energyStarGrade,
              siteEui: e.siteEUI, sourceEui: e.sourceEUI,
              electricityUse: e.electricityKwh, naturalGasUse: e.gasTherms,
              waterUse: e.waterKgal, fuelOilUse: e.fuelOilGal,
              ghgEmissions: e.ghgEmissions, ghgIntensity: 0, reportingYear: e.reportingYear,
            });
            setLl84Utilities({
              electricityCost: Math.round(e.electricityKwh * 0.20),
              gasCost: Math.round(e.gasTherms * 1.20),
              waterCost: Math.round(e.waterKgal * 12.00),
              fuelOilCost: Math.round(e.fuelOilGal * 3.50),
              totalAnnualUtility: e.estimatedUtilityCost,
              source: "ll84_actual",
            });
            if (e.ll97Status !== "compliant") {
              const ll97s = e.ll97Status as string;
              setLl97Risk({
                compliant2024: false,
                compliant2030: ll97s !== "at_risk_2030" && ll97s !== "non_compliant",
                currentEmissionsPerSqft: 0, limit2024: 0, limit2030: 0,
                excessTons2024: 0, excessTons2030: 0,
                penalty2024: ll97s === "non_compliant" ? e.ll97PenaltyEstimate : 0,
                penalty2030: e.ll97PenaltyEstimate,
                buildingType: "",
              });
            }
          }
        }
        // Set legacy data for the existing UI sections
        if (legacyData) {
          // Merge corporate intel from fusion engine into legacy data
          if (intelResult?.corporateIntel) {
            legacyData.corporateIntel = intelResult.corporateIntel;
          }
          setData(legacyData);
        } else if (intelResult) {
          // Fallback: construct minimal legacy data from fusion engine
          setData({
            pluto: intelResult.raw.pluto,
            violations: intelResult.raw.violations,
            violationSummary: intelResult.raw.violationSummary,
            complaints: intelResult.raw.complaints,
            complaintSummary: intelResult.raw.complaintSummary,
            permits: intelResult.raw.permits,
            hpdContacts: intelResult.raw.hpdContacts,
            registrations: intelResult.raw.registrations,
            litigation: intelResult.raw.litigation,
            litigationSummary: intelResult.raw.litigationSummary,
            ecbViolations: intelResult.raw.ecbViolations,
            ecbSummary: intelResult.raw.ecbSummary,
            rentStabilized: intelResult.raw.rentStabilized,
            speculation: intelResult.raw.speculation,
            dobFilings: intelResult.raw.dobFilings,
            phoneRankings: intelResult.raw.phoneRankings,
            neighborhoodData: intelResult.raw.neighborhoodData,
            pdlEnrichment: intelResult.raw.pdlEnrichment,
            apolloEnrichment: intelResult.raw.apolloEnrichment,
            apolloOrgEnrichment: intelResult.raw.apolloOrgEnrichment,
            apolloKeyPeople: intelResult.raw.apolloKeyPeople,
            leadVerification: intelResult.raw.leadVerification,
            rankedContacts: intelResult.raw.rankedContacts,
            ownerContacts: intelResult.raw.ownerContacts,
            corporateIntel: intelResult.raw.corporateIntel || intelResult.corporateIntel,
            distressScore: intelResult.distressSignals.score,
            distressSignals: intelResult.distressSignals.signals.map(s => s.description),
          });
        } else {
          setFetchError("Failed to load building profile. The NYC data APIs may be slow or unavailable.");
        }
      })
      .finally(() => setLoading(false));
  }, [boroCode, block, lot]);

  // Fetch Census neighborhood profile when address is available
  useEffect(() => {
    if (!data?.pluto?.address) return;
    const addr = data.pluto.address;
    const boro = data.pluto.borough || borough || "";
    const fullAddr = `${addr}, ${boro}, NY`;
    setCensusLoading(true);
    fetchNeighborhoodProfile(fullAddr, { includeTrends: true })
      .then(profile => setCensusProfile(profile))
      .catch(err => console.error("Census profile error:", err))
      .finally(() => setCensusLoading(false));
  }, [data?.pluto?.address, data?.pluto?.borough, borough]);

  // Fetch HUD FMR when zip is available
  useEffect(() => {
    const zip = data?.pluto?.zipCode || data?.registrations?.[0]?.zip;
    if (!zip) return;
    import("@/lib/hud-actions").then(m => m.getHudFmr(zip)).then(setHudFmr).catch(() => {});
  }, [data?.pluto?.zipCode, data?.registrations]);

  // Fetch Market Trends (FHFA + Redfin) when zip is available
  useEffect(() => {
    const zip = data?.pluto?.zipCode || data?.registrations?.[0]?.zip;
    if (!zip) return;
    import("@/lib/market-trends-actions").then(m => {
      m.getAppreciation(zip).then(setMarketAppreciation).catch(() => {});
      m.getRedfinTemperature(zip).then(r => {
        if (r) {
          setRedfinMetrics(r.metrics);
          setMarketTemp({ temperature: r.temperature, label: r.label });
        }
      }).catch(() => {});
    });
  }, [data?.pluto?.zipCode, data?.registrations]);

  // Populate Fannie Mae loan data from fusion engine
  useEffect(() => {
    if (intel?.fannieMaeLoan) {
      setFannieLoan({
        isOwnedByFannieMae: intel.fannieMaeLoan.isOwnedByFannieMae,
        address: data?.pluto?.address || "",
        lookupDate: intel.fannieMaeLoan.lookupDate,
        servicerName: intel.fannieMaeLoan.servicerName,
      });
    }
  }, [intel?.fannieMaeLoan, data?.pluto?.address]);

  // Fetch related properties immediately if ownerName prop available (eliminates waterfall)
  useEffect(() => {
    if (!ownerName || ownerName.length < 4) return;
    setLoadingRelated(true);
    const currentBBL = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    fetchRelatedProperties([ownerName], boroCode)
      .then(r => setRelatedProperties(r.filter((p: any) => p.bbl !== currentBBL)))
      .catch(err => console.error("Related properties error:", err))
      .finally(() => { setLoadingRelated(false); setRelatedDone(true); });
  }, [boroCode, block, lot, ownerName]);

  // When data loads, refetch related properties with expanded HPD names
  useEffect(() => {
    if (!data?.pluto) return;
    const allNames: string[] = [];
    if (data.pluto.ownerName) allNames.push(data.pluto.ownerName);
    data.hpdContacts?.forEach((c: any) => {
      if (c.corporateName) allNames.push(c.corporateName);
      const name = (c.firstName + " " + c.lastName).trim();
      if (name.length > 3 && (c.type === "HeadOfficer" || c.type === "IndividualOwner")) allNames.push(name);
    });
    const unique = [...new Set(allNames.filter(n => n.length > 3))];
    if (unique.length === 0) { setRelatedDone(true); return; }
    if (ownerName && ownerName.length > 3 && !unique.some(n => n.toUpperCase() !== ownerName.toUpperCase())) return;
    setLoadingRelated(true);
    const currentBBL = data.pluto.boroCode + (data.pluto.block || "").padStart(5, "0") + (data.pluto.lot || "").padStart(4, "0");
    fetchRelatedProperties(unique, data.pluto.boroCode || "")
      .then(r => setRelatedProperties(r.filter((p: any) => p.bbl !== currentBBL)))
      .catch(err => console.error("Related properties error:", err))
      .finally(() => { setLoadingRelated(false); setRelatedDone(true); });
  }, [data]);

  // Load owner portfolio via fusion engine
  useEffect(() => {
    if (!intel || !intel.ownership.likelyOwner.entityName) return;
    setPortfolioLoading(true);
    findOwnerPortfolio(intel.ownership.likelyOwner.entityName, intel.bbl)
      .then(setOwnerPortfolio)
      .catch(() => {})
      .finally(() => setPortfolioLoading(false));
  }, [intel]);

  // Auto-load comps when building data is available
  useEffect(() => {
    if (compsLoaded || !data?.pluto) return;
    const zip = data.pluto.zipCode || data.registrations?.[0]?.zip;
    if (!zip || data.pluto.unitsTot < 5) return;
    setCompsLoaded(true);
    setCompsLoading(true);
    fetchBuildingComps({ zip, radiusMiles: compRadius, yearsBack: compYears, minUnits: compMinUnits, limit: 50 })
      .then(result => { setComps(result.comps); setCompSummary(result.summary); })
      .catch(err => console.error("Comps error:", err))
      .finally(() => setCompsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const refreshComps = () => {
    if (!data?.pluto) return;
    const zip = data.pluto.zipCode || data.registrations?.[0]?.zip;
    if (!zip) return;
    setCompsLoading(true);
    fetchBuildingComps({ zip, radiusMiles: compRadius, yearsBack: compYears, minUnits: compMinUnits, limit: 50 })
      .then(result => { setComps(result.comps); setCompSummary(result.summary); })
      .catch(err => console.error("Comps error:", err))
      .finally(() => setCompsLoading(false));
  };

  // Enhanced comps with valuation — auto-load when intel is available
  useEffect(() => {
    if (!intel || enhancedCompsLoading || compResult) return;
    const units = intel.property.residentialUnits?.value || intel.property.units?.value || 0;
    if (units < 2) return;
    setEnhancedCompsLoading(true);
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    fetchCompsWithValuation(bbl, { radiusMiles: enhancedRadius, maxAgeDays: enhancedMaxDays })
      .then(setCompResult)
      .catch(err => console.error("Enhanced comps error:", err))
      .finally(() => setEnhancedCompsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intel]);

  const refreshEnhancedComps = () => {
    setEnhancedCompsLoading(true);
    setCompResult(null);
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    fetchCompsWithValuation(bbl, { radiusMiles: enhancedRadius, maxAgeDays: enhancedMaxDays })
      .then(setCompResult)
      .catch(err => console.error("Enhanced comps error:", err))
      .finally(() => setEnhancedCompsLoading(false));
  };

  const handleSkipTrace = async () => {
    if (!data?.pluto) return;
    setSkipTracing(true);
    try {
      const ownerContact = data.hpdContacts?.find((c: any) => c.type === "IndividualOwner" || c.type === "HeadOfficer");
      const name = ownerContact
        ? (ownerContact.firstName + " " + ownerContact.lastName).trim()
        : data.pluto.ownerName || "";
      const addr = data.pluto.address || "";
      const boro = data.pluto.borough || "";
      const result = await skipTrace(name, addr, boro, "NY", "");
      setSkipTraceResult(result);
    } catch (err) {
      console.error("Skip trace error:", err);
      setSkipTraceResult({ error: "Skip trace failed" });
    }
    setSkipTracing(false);
  };

  const p = data?.pluto;
  const displayAddr = p?.address || address || `Block ${block}, Lot ${lot}`;
  const displayBorough = p?.borough || borough || ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][parseInt(boroCode)] || "";
  const displayZip = p?.zipCode || data?.registrations?.[0]?.zip || "";
  const displayNeighborhood = displayZip ? getNeighborhoodNameByZip(displayZip) : null;

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-4"></div>
          <p className="text-sm text-slate-500">Loading building profile...</p>
        </div>
      ) : fetchError ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">⚠️</p>
          <p className="text-sm font-medium text-slate-700 mb-1">Could not load building profile</p>
          <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">{fetchError}</p>
          <button
            onClick={() => {
              setFetchError(null);
              setLoading(true);
              const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
              Promise.all([
                fetchBuildingIntelligence(bbl).catch(() => null),
                fetchBuildingProfile(boroCode, block, lot).catch(() => null),
              ]).then(([intelResult, legacyData]) => {
                if (intelResult) setIntel(intelResult);
                if (legacyData) setData(legacyData);
                else if (!intelResult) setFetchError("Failed to load building profile. The NYC data APIs may be slow or unavailable.");
              }).finally(() => setLoading(false));
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Building Header — always visible */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{displayAddr}</h2>
                <p className="text-sm text-slate-500 mt-1">{displayNeighborhood ? `${displayNeighborhood}, ${displayBorough}` : displayBorough} • Block {block}, Lot {lot}</p>
              </div>
              {data && !crmResult && (
                <button
                  onClick={async () => {
                    if (!data) return;
                    setAddingToCRM(true);
                    try {
                      const topIndividual = data.rankedContacts?.find((r: any) =>
                        !r.name.toUpperCase().match(/LLC|CORP|INC|L\.P\.|TRUST/) && r.name.includes(" ")
                      );
                      const topCorp = data.hpdContacts?.find((c: any) => c.type === "CorporateOwner");
                      const name = topIndividual?.name || data.pluto?.ownerName || "";
                      const parts = name.trim().split(/\s+/);
                      const firstName = parts[0] || "Unknown";
                      const lastName = parts.slice(1).join(" ") || "Owner";
                      const result = await createContactFromBuilding({
                        firstName,
                        lastName,
                        company: topCorp?.corporateName || undefined,
                        phone: topIndividual?.phone || undefined,
                        email: topIndividual?.email || undefined,
                        address: data.pluto?.address || address,
                        borough: displayBorough,
                        boroCode,
                        block,
                        lot,
                      });
                      setCrmResult({ contactId: result.contactId, enriched: result.enriched });
                    } catch (err) {
                      console.error("Add to CRM error:", err);
                    }
                    setAddingToCRM(false);
                  }}
                  disabled={addingToCRM}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {addingToCRM ? (
                    <>
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
                      Adding...
                    </>
                  ) : (
                    "Add to CRM"
                  )}
                </button>
              )}
              <button
                onClick={async () => {
                  setUnderwriting(true);
                  try {
                    const result = await underwriteDeal({
                      boroCode,
                      block,
                      lot,
                      address: data?.pluto?.address || address,
                      borough: displayBorough,
                    });
                    router.push(`/deals/new?id=${result.id}`);
                  } catch (err) {
                    console.error("Underwrite error:", err);
                    setUnderwriting(false);
                  }
                }}
                disabled={underwriting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
              >
                {underwriting ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
                    Underwriting...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Underwrite This Deal
                  </>
                )}
              </button>
              <a
                href={`/deals/new?address=${encodeURIComponent(displayAddr)}&borough=${encodeURIComponent(displayBorough)}&block=${encodeURIComponent(block)}&lot=${encodeURIComponent(lot)}&bbl=${encodeURIComponent(boroCode + block.padStart(5, "0") + lot.padStart(4, "0"))}&units=${data?.pluto?.unitsRes || ""}&assessed=${data?.pluto?.assessTotal || ""}`}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors"
              >
                Manual Model
              </a>
              {crmResult && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                    {crmResult.enriched ? "Contact added & enriched via Apollo!" : "Contact added to CRM!"}
                  </span>
                  <a href={`/contacts/${crmResult.contactId}`} className="text-xs text-blue-600 hover:underline font-medium">View →</a>
                </div>
              )}
            </div>
            {connectedVia && connectedVia.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-400">Connected via:</span>
                {connectedVia.map((name, i) => (
                  <span key={i}>
                    {onNameClick ? (
                      <button onClick={() => onNameClick(name)} className="text-xs text-blue-600 hover:underline font-medium">{name}</button>
                    ) : (
                      <span className="text-xs text-slate-600 font-medium">{name}</span>
                    )}
                    {i < connectedVia.length - 1 && <span className="text-xs text-slate-300 ml-1">•</span>}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ============================================================ */}
          {/* INTELLIGENCE SCORES — Distress + Investment + Data Sources */}
          {/* ============================================================ */}
          {intel && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-bold text-slate-900">Intelligence Scores</h3>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  {intel.dataSources.length} data sources
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  Confidence: {intel.overallConfidence}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Distress Score */}
                <div className={`rounded-lg p-3 border ${
                  intel.distressSignals.score >= 61 ? "bg-red-50 border-red-200" :
                  intel.distressSignals.score >= 41 ? "bg-orange-50 border-orange-200" :
                  intel.distressSignals.score >= 21 ? "bg-amber-50 border-amber-200" :
                  "bg-emerald-50 border-emerald-200"
                }`}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Distress Score</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black ${
                      intel.distressSignals.score >= 61 ? "text-red-700" :
                      intel.distressSignals.score >= 41 ? "text-orange-700" :
                      intel.distressSignals.score >= 21 ? "text-amber-700" :
                      "text-emerald-700"
                    }`}>{intel.distressSignals.score}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      intel.distressSignals.score >= 81 ? "bg-red-200 text-red-800" :
                      intel.distressSignals.score >= 61 ? "bg-red-100 text-red-700" :
                      intel.distressSignals.score >= 41 ? "bg-orange-100 text-orange-700" :
                      intel.distressSignals.score >= 21 ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      {intel.distressSignals.score >= 81 ? "Very High" :
                       intel.distressSignals.score >= 61 ? "High" :
                       intel.distressSignals.score >= 41 ? "Elevated" :
                       intel.distressSignals.score >= 21 ? "Moderate" : "Low"}
                    </span>
                  </div>
                  {intel.distressSignals.signals.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {intel.distressSignals.signals.slice(0, 3).map((s, i) => (
                        <p key={i} className="text-[11px] text-slate-600 flex items-start gap-1">
                          <span className={s.severity === "high" ? "text-red-500" : s.severity === "medium" ? "text-amber-500" : "text-slate-400"}>&#x25CF;</span>
                          {s.description}
                        </p>
                      ))}
                      {intel.distressSignals.signals.length > 3 && (
                        <p className="text-[10px] text-slate-400">+{intel.distressSignals.signals.length - 3} more signals</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Investment Score */}
                <FeatureGate feature="bp_investment_score" blur>
                <div className={`rounded-lg p-3 border ${
                  intel.investmentSignals.score >= 60 ? "bg-blue-50 border-blue-200" :
                  intel.investmentSignals.score >= 30 ? "bg-slate-50 border-slate-200" :
                  "bg-slate-50 border-slate-200"
                }`}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Investment Score</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black ${
                      intel.investmentSignals.score >= 60 ? "text-blue-700" :
                      intel.investmentSignals.score >= 30 ? "text-blue-500" :
                      "text-slate-400"
                    }`}>{intel.investmentSignals.score}</span>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(star => (
                        <span key={star} className={`text-sm ${intel.investmentSignals.score >= star * 20 ? "text-amber-400" : "text-slate-200"}`}>&#x2605;</span>
                      ))}
                    </div>
                  </div>
                  {intel.investmentSignals.signals.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {intel.investmentSignals.signals.slice(0, 3).map((s, i) => (
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
              {intel.ownership.likelyOwner.entityName && (
                <FeatureGate feature="bp_owner_name" blur>
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Resolved Owner</p>
                  <p className="text-sm font-bold text-slate-900">{intel.ownership.likelyOwner.entityName}</p>
                  {intel.ownership.likelyOwner.likelyPerson && intel.ownership.likelyOwner.likelyPerson !== intel.ownership.likelyOwner.entityName && (
                    <p className="text-xs text-slate-600 mt-0.5">Likely individual: {intel.ownership.likelyOwner.likelyPerson}</p>
                  )}
                  {intel.ownership.likelyOwner.llcName && intel.ownership.likelyOwner.llcName !== intel.ownership.likelyOwner.entityName && (
                    <p className="text-xs text-slate-500 mt-0.5">Entity: {intel.ownership.likelyOwner.llcName}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-400">Sources: {intel.ownership.sources.join(", ")}</span>
                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{intel.ownership.confidence}% confidence</span>
                  </div>
                  {intel.ownership.likelyOwner.alternateNames.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1">Also seen as: {intel.ownership.likelyOwner.alternateNames.slice(0, 3).join(", ")}</p>
                  )}
                </div>
                </FeatureGate>
              )}

              {/* Fannie Mae Loan Status */}
              {fannieLoan && (
                <FeatureGate feature="bp_fannie_mae_loan" blur>
                <div className={`mt-3 p-3 rounded-lg ${fannieLoan.isOwnedByFannieMae ? "bg-emerald-50 border border-emerald-100" : "bg-slate-50"}`}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Mortgage Status</p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${fannieLoan.isOwnedByFannieMae ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                      {fannieLoan.isOwnedByFannieMae ? "Fannie Mae Backed" : "Non-Agency Loan"}
                    </span>
                    <span className="text-[10px] text-slate-400">as of {fannieLoan.lookupDate}</span>
                  </div>
                  {fannieLoan.isOwnedByFannieMae && fannieLoan.servicerName && (
                    <p className="text-xs text-emerald-700 mt-1">Servicer: {fannieLoan.servicerName}</p>
                  )}
                  {fannieLoan.isOwnedByFannieMae && (
                    <p className="text-[10px] text-emerald-600 mt-1">GSE-backed loans may offer streamlined refinancing and modification options</p>
                  )}
                </div>
                </FeatureGate>
              )}

              {/* Owner Portfolio */}
              {(ownerPortfolio.length > 0 || portfolioLoading) && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Owner Portfolio</p>
                  {portfolioLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent" />
                      <span className="text-xs text-slate-500">Discovering portfolio...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-slate-700 font-medium mb-2">
                        This owner has {ownerPortfolio.length + 1} properties totaling {ownerPortfolio.reduce((sum, p) => sum + p.units, 0) + (intel.property.units?.value || 0)} units
                      </p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {ownerPortfolio.slice(0, 8).map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-slate-700 font-medium truncate max-w-[200px]">{p.address || p.bbl}</span>
                            <div className="flex items-center gap-2 text-slate-500">
                              <span>{p.units} units</span>
                              <span className="text-slate-300">|</span>
                              <span>{p.borough}</span>
                            </div>
                          </div>
                        ))}
                        {ownerPortfolio.length > 8 && (
                          <p className="text-[10px] text-slate-400">+{ownerPortfolio.length - 8} more properties</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* ACTIVE LISTINGS (from Brave Web Search) */}
          {/* ============================================================ */}
          <FeatureGate feature="bp_live_listings" blur>
          {intel?.liveListings && (intel.liveListings.forSale.length > 0 || intel.liveListings.forRent.length > 0) && (
            <Section id="listings" title="Active Listings" icon="🏷️"
              badge={<span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">Live</span>}
              collapsed={isCollapsed("listings")} onToggle={() => toggle("listings")}>
              {/* For Sale */}
              {intel.liveListings.forSale.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">For Sale ({intel.liveListings.forSale.length})</p>
                  <div className="space-y-2">
                    {intel.liveListings.forSale.slice(0, 5).map((l, i) => (
                      <div key={i} className="flex items-start justify-between p-2.5 bg-green-50 rounded-lg border border-green-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{l.address}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {l.units && <span>{l.units} units · </span>}
                            {l.sqft && <span>{l.sqft.toLocaleString()} sf · </span>}
                            {l.brokerage && <span>{l.brokerage} · </span>}
                            {l.daysOnMarket !== undefined && <span>{l.daysOnMarket}d on market</span>}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{l.sourceDomain}</p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-sm font-bold text-green-700">{l.priceStr}</p>
                          {l.pricePerUnit && <p className="text-[10px] text-slate-400">${l.pricePerUnit.toLocaleString()}/unit</p>}
                          <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline mt-1 block">View Listing →</a>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Model This Price button */}
                  {intel.liveListings.forSale[0] && (
                    <button
                      onClick={() => {
                        const listing = intel.liveListings!.forSale[0];
                        try { sessionStorage.setItem("vettdre_listing_price", JSON.stringify({ price: listing.price, address: listing.address, source: listing.sourceDomain })); } catch {}
                        router.push("/deals/new");
                      }}
                      className="mt-2 w-full py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                    >
                      Model This Price in Deal Modeler →
                    </button>
                  )}
                </div>
              )}
              {/* For Rent (market rents) */}
              {intel.liveListings.forRent.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Rental Comps ({intel.liveListings.forRent.length})</p>
                  <div className="space-y-1.5">
                    {intel.liveListings.forRent.slice(0, 4).map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-700 font-medium truncate block">{l.address}</span>
                          <span className="text-slate-400 text-[10px]">{l.sourceDomain}</span>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <span className="font-bold text-slate-900">{l.priceStr}/mo</span>
                          {l.beds !== undefined && <span className="text-slate-400 ml-1">· {l.beds}BR</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const rents = intel.liveListings!.forRent;
                      const avgRent = rents.length > 0 ? Math.round(rents.reduce((s, r) => s + r.price, 0) / rents.length) : 0;
                      try { sessionStorage.setItem("vettdre_web_rents", JSON.stringify({ avgRent, count: rents.length, listings: rents.slice(0, 5) })); } catch {}
                      router.push("/deals/new");
                    }}
                    className="mt-2 w-full py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Use Web Rents in Deal Modeler →
                  </button>
                </div>
              )}
              {/* Web Comps */}
              {intel.liveListings.webComps.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Web Comps ({intel.liveListings.webComps.length})</p>
                  <div className="space-y-1.5">
                    {intel.liveListings.webComps.slice(0, 4).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 bg-amber-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-700 font-medium truncate block">{c.address}</span>
                          <span className="text-[10px] text-slate-400">{c.type === "sale" ? "Sold" : c.type === "pending" ? "Pending" : "Listed"}</span>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <span className="font-bold text-slate-900">{c.priceStr}</span>
                          {c.pricePerUnit && <span className="text-[10px] text-slate-400 block">${c.pricePerUnit.toLocaleString()}/unit</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Market Trend */}
              {intel.liveListings.marketInsight && (
                <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100 flex items-start gap-2">
                  <span className="text-base">
                    {intel.liveListings.marketTrend === "rising" ? "📈" : intel.liveListings.marketTrend === "declining" ? "📉" : "📊"}
                  </span>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-600 mb-0.5">
                      Market Trend: {intel.liveListings.marketTrend.charAt(0).toUpperCase() + intel.liveListings.marketTrend.slice(1)}
                    </p>
                    <p className="text-xs text-slate-700">{intel.liveListings.marketInsight}</p>
                  </div>
                </div>
              )}
            </Section>
          )}
          </FeatureGate>

          {/* ============================================================ */}
          {/* WEB INTELLIGENCE (from Brave Entity Research) */}
          {/* ============================================================ */}
          <FeatureGate feature="bp_web_intel" blur>
          {intel?.webIntelligence && intel.webIntelligence.newsCount > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🌐</span>
                <h3 className="text-sm font-bold text-slate-900">Web Intelligence</h3>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full uppercase">Brave</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Found {intel.webIntelligence.newsCount} web mentions for <strong className="text-slate-700">{intel.webIntelligence.entityName}</strong>
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {intel.webIntelligence.hasNegativeNews && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-semibold rounded-full">Negative Coverage</span>
                )}
                {intel.webIntelligence.hasLawsuits && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded-full">Lawsuits Found</span>
                )}
                {!intel.webIntelligence.hasNegativeNews && !intel.webIntelligence.hasLawsuits && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">Clean Record</span>
                )}
              </div>
              {intel.webIntelligence.topArticles.length > 0 && (
                <div className="space-y-1.5">
                  {intel.webIntelligence.topArticles.slice(0, 3).map((a, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded-lg text-xs">
                      <p className="text-slate-700">{a.snippet}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={"px-1.5 py-0.5 rounded text-[9px] font-semibold " + (a.sentiment === "negative" ? "bg-red-50 text-red-600" : a.sentiment === "positive" ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500")}>
                          {a.category}
                        </span>
                        {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-[10px]">Source →</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </FeatureGate>

          {/* ============================================================ */}
          {/* 1. PROPERTY OVERVIEW */}
          {/* ============================================================ */}
          <Section id="overview" title="Property Overview" icon="🏢"
            badge={p ? <span className="text-xs text-slate-400">{p.unitsRes} units · {p.numFloors} floors · {p.yearBuilt}</span> : undefined}
            collapsed={isCollapsed("overview")} onToggle={() => toggle("overview")}>
            {p && (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Units</p>
                    <p className="text-lg font-bold text-slate-900">{p.unitsRes || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Floors</p>
                    <p className="text-lg font-bold text-slate-900">{p.numFloors || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Year Built</p>
                    <p className="text-lg font-bold text-slate-900">{p.yearBuilt || "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Assessed Value</p>
                    <p className="text-lg font-bold text-slate-900">{fmtPrice(p.assessTotal)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Building Area</p>
                    <p className="text-lg font-bold text-slate-900">{p.bldgArea > 0 ? p.bldgArea.toLocaleString() + " sf" : "—"}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Zoning</p>
                    <p className="text-lg font-bold text-slate-900">{p.zoneDist1 || "—"}</p>
                  </div>
                </div>

                {/* Additional details */}
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
                  {p.ownerName && <span>Owner: <strong className="text-slate-700">{p.ownerName}</strong></span>}
                  {p.bldgClass && <span>Class: {p.bldgClass}</span>}
                  {p.lotArea > 0 && <span>Lot: {p.lotArea.toLocaleString()} sf</span>}
                  {p.builtFAR > 0 && <span>FAR: {p.builtFAR.toFixed(2)}</span>}
                  {p.yearAlter1 > 0 && <span>Altered: {p.yearAlter1}</span>}
                </div>

                {/* Building details grid */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2">Building Details</h4>
                    <div className="space-y-1.5 text-sm">
                      <p><span className="text-slate-500">Address:</span> <span className="font-medium">{p.address}, {p.borough}</span></p>
                      <p><span className="text-slate-500">Block/Lot:</span> <span className="font-medium">{p.block}/{p.lot}</span></p>
                      <p><span className="text-slate-500">Residential Units:</span> <span className="font-medium">{p.unitsRes}</span></p>
                      <p><span className="text-slate-500">Total Units:</span> <span className="font-medium">{p.unitsTot}</span></p>
                      <p><span className="text-slate-500">Floors:</span> <span className="font-medium">{p.numFloors}</span></p>
                      <p><span className="text-slate-500">Year Built:</span> <span className="font-medium">{p.yearBuilt}</span></p>
                      {p.yearAlter1 > 0 && <p><span className="text-slate-500">Last Altered:</span> <span className="font-medium">{p.yearAlter1}</span></p>}
                      <p><span className="text-slate-500">Building Class:</span> <span className="font-medium">{p.bldgClass}</span></p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2">Financial & Zoning</h4>
                    <div className="space-y-1.5 text-sm">
                      <p><span className="text-slate-500">Assessed Total:</span> <span className="font-medium">{fmtPrice(p.assessTotal)}</span></p>
                      <p><span className="text-slate-500">Assessed Land:</span> <span className="font-medium">{fmtPrice(p.assessLand)}</span></p>
                      <p><span className="text-slate-500">Building Area:</span> <span className="font-medium">{p.bldgArea.toLocaleString()} sf</span></p>
                      <p><span className="text-slate-500">Lot Area:</span> <span className="font-medium">{p.lotArea.toLocaleString()} sf</span></p>
                      <p><span className="text-slate-500">Zoning:</span> <span className="font-medium">{p.zoneDist1}{p.zoneDist2 ? " / " + p.zoneDist2 : ""}</span></p>
                      <p><span className="text-slate-500">Built FAR:</span> <span className="font-medium">{p.builtFAR.toFixed(2)}</span></p>
                      <p><span className="text-slate-500">Residential FAR:</span> <span className="font-medium">{p.residFAR.toFixed(2)}</span></p>
                      <p><span className="text-slate-500">PLUTO Owner:</span> <span className="font-medium">{p.ownerName}</span></p>
                    </div>
                  </div>
                </div>

                {/* Summary stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">HPD Violations</p>
                    <p className="text-xl font-bold text-slate-900">{data?.violationSummary?.total || 0}</p>
                    {data?.violationSummary?.open > 0 && <p className="text-xs text-red-600 font-medium mt-1">{data.violationSummary.open} open</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">311 Complaints</p>
                    <p className="text-xl font-bold text-slate-900">{data?.complaintSummary?.total || 0}</p>
                    {data?.complaintSummary?.recent > 0 && <p className="text-xs text-amber-600 font-medium mt-1">{data.complaintSummary.recent} recent</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">DOB Permits</p>
                    <p className="text-xl font-bold text-slate-900">{data?.permits?.length || 0}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">HPD Contacts</p>
                    <p className="text-xl font-bold text-slate-900">{data?.hpdContacts?.length || 0}</p>
                  </div>
                </div>

                {/* Second row of stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">HPD Lawsuits</p>
                    <p className="text-xl font-bold text-slate-900">{data?.litigationSummary?.total || 0}</p>
                    {data?.litigationSummary?.open > 0 && <p className="text-xs text-red-600 font-medium mt-1">{data.litigationSummary.open} open</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">ECB Violations</p>
                    <p className="text-xl font-bold text-slate-900">{data?.ecbSummary?.total || 0}</p>
                    {data?.ecbSummary?.totalPenalty > 0 && <p className="text-xs text-red-600 font-medium mt-1">{"$" + Math.round(data.ecbSummary.totalPenalty).toLocaleString() + " owed"}</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">Rent Stabilized</p>
                    <p className={"text-xl font-bold " + (data?.rentStabilized ? "text-blue-700" : "text-slate-300")}>
                      {data?.rentStabilized ? "Yes" : "No"}
                    </p>
                    {data?.rentStabilized && <p className="text-xs text-blue-600 mt-1">{data.rentStabilized.uc2024 || data.rentStabilized.uc2023 || data.rentStabilized.uc2022 || "?"} units</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">Speculation List</p>
                    <p className={"text-xl font-bold " + (data?.speculation?.onWatchList ? "text-red-600" : "text-slate-300")}>
                      {data?.speculation?.onWatchList ? "Yes" : "No"}
                    </p>
                    {data?.speculation?.salePrice > 0 && <p className="text-xs text-red-600 mt-1">{"Sold: $" + data.speculation.salePrice.toLocaleString()}</p>}
                  </div>
                </div>

                {/* RPIE Non-Compliance Banner */}
                <FeatureGate feature="bp_rpie" blur>
                {rpieRecords.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-start gap-2">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <p className="text-sm font-bold text-amber-800">RPIE Non-Compliant</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Owner has not filed required income & expense reports. Non-filers face fines up to $100K and cannot contest their tax assessment.
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          Missing year{rpieRecords.length > 1 ? "s" : ""}: {rpieRecords.map(r => r.filingYear).filter(Boolean).join(", ") || "Unknown"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                </FeatureGate>

                {/* Distress Score */}
                <FeatureGate feature="bp_distress_score" blur>
                {data && (
                  <div className={"mt-4 rounded-lg border p-4 " + (
                    data.distressScore >= 50 ? "bg-red-50 border-red-200" :
                    data.distressScore >= 25 ? "bg-orange-50 border-orange-200" :
                    data.distressScore > 0 ? "bg-amber-50 border-amber-200" :
                    "bg-emerald-50 border-emerald-200"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{data.distressScore > 0 ? "🔥" : "✅"}</span>
                        <span className="text-sm font-bold text-slate-900">Distress Score</span>
                      </div>
                      <span className={"text-xl font-black " + (
                        data.distressScore >= 50 ? "text-red-600" :
                        data.distressScore >= 25 ? "text-orange-600" :
                        data.distressScore > 0 ? "text-amber-600" :
                        "text-emerald-600"
                      )}>{data.distressScore}/100</span>
                    </div>
                    {data.distressScore > 0 ? (
                      <div className="space-y-1">
                        {data.distressSignals.map((s: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                            <span className="text-red-500">⚠</span>
                            <span>{s}</span>
                          </div>
                        ))}
                        {data.distressScore >= 40 && (
                          <p className="text-xs font-semibold mt-2 text-red-700">High distress — owner may be motivated to sell</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-700">Clean record — no distress signals detected</p>
                    )}
                  </div>
                )}
                </FeatureGate>
              </>
            )}
          </Section>

          {/* ============================================================ */}
          {/* ENERGY & WATER (LL84) */}
          {/* ============================================================ */}
          {ll84Data && (
            <Section id="energy" title="Energy & Water (LL84)" icon="⚡" collapsed={isCollapsed("energy")} onToggle={() => toggle("energy")}
              badge={ll84Data.energyStarGrade ? (
                <span className={`ml-2 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
                  ll84Data.energyStarGrade === "A" ? "bg-emerald-100 text-emerald-700" :
                  ll84Data.energyStarGrade === "B" ? "bg-green-100 text-green-700" :
                  ll84Data.energyStarGrade === "C" ? "bg-yellow-100 text-yellow-700" :
                  ll84Data.energyStarGrade === "D" ? "bg-orange-100 text-orange-700" :
                  "bg-red-100 text-red-700"
                }`}>{ll84Data.energyStarGrade}</span>
              ) : undefined}>
              <div className="space-y-4">
                {/* Grade + Score row */}
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center w-16 h-16 rounded-xl text-2xl font-black ${
                    ll84Data.energyStarGrade === "A" ? "bg-emerald-100 text-emerald-700" :
                    ll84Data.energyStarGrade === "B" ? "bg-green-100 text-green-700" :
                    ll84Data.energyStarGrade === "C" ? "bg-yellow-100 text-yellow-700" :
                    ll84Data.energyStarGrade === "D" ? "bg-orange-100 text-orange-700" :
                    ll84Data.energyStarGrade === "F" ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>{ll84Data.energyStarGrade || "?"}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Energy Star Score: {ll84Data.energyStarScore > 0 ? `${ll84Data.energyStarScore}/100` : "N/A"}</p>
                    <p className="text-xs text-slate-500">Site EUI: {ll84Data.siteEui > 0 ? `${ll84Data.siteEui.toFixed(1)} kBtu/sqft` : "N/A"}</p>
                    <p className="text-xs text-slate-400">Reporting Year: {ll84Data.reportingYear || "—"}</p>
                  </div>
                </div>

                {/* Utility breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase">Electricity</p>
                    <p className="text-sm font-semibold">{ll84Data.electricityUse > 0 ? `${Math.round(ll84Data.electricityUse).toLocaleString()} kWh` : "—"}</p>
                    {ll84Utilities && ll84Utilities.electricityCost > 0 && <p className="text-xs text-slate-500">${ll84Utilities.electricityCost.toLocaleString()}/yr</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase">Natural Gas</p>
                    <p className="text-sm font-semibold">{ll84Data.naturalGasUse > 0 ? `${Math.round(ll84Data.naturalGasUse).toLocaleString()} therms` : "—"}</p>
                    {ll84Utilities && ll84Utilities.gasCost > 0 && <p className="text-xs text-slate-500">${ll84Utilities.gasCost.toLocaleString()}/yr</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase">Water</p>
                    <p className="text-sm font-semibold">{ll84Data.waterUse > 0 ? `${Math.round(ll84Data.waterUse).toLocaleString()} kGal` : "—"}</p>
                    {ll84Utilities && ll84Utilities.waterCost > 0 && <p className="text-xs text-slate-500">${ll84Utilities.waterCost.toLocaleString()}/yr</p>}
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-slate-400 uppercase">Fuel Oil</p>
                    <p className="text-sm font-semibold">{ll84Data.fuelOilUse > 0 ? `${Math.round(ll84Data.fuelOilUse).toLocaleString()} gal` : "—"}</p>
                    {ll84Utilities && ll84Utilities.fuelOilCost > 0 && <p className="text-xs text-slate-500">${ll84Utilities.fuelOilCost.toLocaleString()}/yr</p>}
                  </div>
                </div>

                {ll84Utilities && ll84Utilities.totalAnnualUtility > 0 && (
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
                    {ll84Data.ghgIntensity > 0 && <p className="text-xs text-slate-400">{ll84Data.ghgIntensity.toFixed(2)} kgCO2e/sqft</p>}
                  </div>
                )}

                {/* LL97 Compliance Risk */}
                {ll97Risk && (
                  <div className={`rounded-lg border p-3 ${
                    !ll97Risk.compliant2024 ? "bg-red-50 border-red-200" :
                    !ll97Risk.compliant2030 ? "bg-amber-50 border-amber-200" :
                    "bg-emerald-50 border-emerald-200"
                  }`}>
                    <p className="text-xs font-bold text-slate-900 mb-2">LL97 Carbon Compliance</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">2024 Limit:</span>
                        <span className={`ml-1 font-semibold ${ll97Risk.compliant2024 ? "text-emerald-700" : "text-red-700"}`}>
                          {ll97Risk.compliant2024 ? "Compliant" : "Non-Compliant"}
                        </span>
                        {ll97Risk.penalty2024 > 0 && <p className="text-red-600 font-semibold mt-0.5">Penalty: ${ll97Risk.penalty2024.toLocaleString()}/yr</p>}
                      </div>
                      <div>
                        <span className="text-slate-500">2030 Limit:</span>
                        <span className={`ml-1 font-semibold ${ll97Risk.compliant2030 ? "text-emerald-700" : "text-amber-700"}`}>
                          {ll97Risk.compliant2030 ? "On Track" : "At Risk"}
                        </span>
                        {ll97Risk.penalty2030 > 0 && <p className="text-amber-600 font-semibold mt-0.5">Est. Penalty: ${ll97Risk.penalty2030.toLocaleString()}/yr</p>}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">LL97 penalty: $268/metric ton over limit</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ============================================================ */}
          {/* 2. AI OWNERSHIP ANALYSIS */}
          {/* ============================================================ */}
          {data?.hpdContacts?.length > 0 && (
            <Section id="ownership" title="AI Ownership Analysis" icon="🤖"
              badge={<span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Confidence Score</span>}
              className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200"
              collapsed={isCollapsed("ownership")} onToggle={() => toggle("ownership")}>
              {(() => {
                const contacts = data.hpdContacts || [];
                const owners = contacts.filter((c: any) => c.type === "IndividualOwner" || c.type === "CorporateOwner" || c.type === "HeadOfficer");
                const individuals = owners.filter((c: any) => c.type === "IndividualOwner" || c.type === "HeadOfficer");
                const corps = owners.filter((c: any) => c.type === "CorporateOwner");

                let bestOwner = "";
                let confidence = 0;
                let reasoning: string[] = [];

                if (individuals.length > 0) {
                  bestOwner = (individuals[0].firstName + " " + individuals[0].lastName).trim();
                  confidence = 75;
                  reasoning.push("Named as " + individuals[0].type + " in HPD registration");
                  if (data.ownerContacts?.some((oc: any) => oc.phone)) {
                    confidence += 10;
                    reasoning.push("Phone number found in DOB filings");
                  }
                  if (corps.length > 0) {
                    reasoning.push("Controls via " + (corps[0].corporateName || "LLC"));
                  }
                  if (data.litigation?.length > 0) {
                    const respondents = data.litigation.map((l: any) => l.respondent).filter(Boolean);
                    if (respondents.some((r: string) => r.toUpperCase().includes(bestOwner.split(" ").pop()?.toUpperCase() || ""))) {
                      confidence += 10;
                      reasoning.push("Name matches litigation respondent");
                    }
                  }
                } else if (corps.length > 0) {
                  bestOwner = corps[0].corporateName || "Unknown LLC";
                  confidence = 55;
                  reasoning.push("Only corporate owner registered — individual unknown");
                  reasoning.push("Consider NYS Secretary of State search for LLC members");
                }

                if (p?.ownerName && bestOwner) {
                  if (p.ownerName.toUpperCase().includes(bestOwner.split(" ").pop()?.toUpperCase() || "")) {
                    confidence += 5;
                    reasoning.push("Name aligns with PLUTO tax records");
                  }
                }

                confidence = Math.min(95, confidence);

                return bestOwner ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs text-slate-500">Most Likely Owner</p>
                        <p className="text-base font-bold text-slate-900">{bestOwner}</p>
                      </div>
                      <div className={"text-right px-3 py-1.5 rounded-lg " + (
                        confidence >= 80 ? "bg-emerald-100" : confidence >= 60 ? "bg-amber-100" : "bg-slate-100"
                      )}>
                        <p className="text-[10px] text-slate-500 uppercase">Confidence</p>
                        <p className={"text-xl font-black " + (
                          confidence >= 80 ? "text-emerald-700" : confidence >= 60 ? "text-amber-700" : "text-slate-600"
                        )}>{confidence}%</p>
                      </div>
                    </div>

                    {/* Phone Rankings — Call Priority */}
                    {(() => {
                      const phoneRankings = data.phoneRankings || [];
                      const bestAddr = individuals[0] ? [individuals[0].businessAddress, individuals[0].businessCity, individuals[0].businessState].filter(Boolean).join(", ") : "";
                      const primary = phoneRankings.find((pr: any) => pr.isPrimary);
                      const others = phoneRankings.filter((pr: any) => !pr.isPrimary);

                      return (phoneRankings.length > 0 || bestAddr) ? (
                        <div className="mt-2 mb-3 space-y-2">
                          {primary && (
                            <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">Call First</span>
                                <span className="text-xs font-bold text-emerald-700">{primary.score}% confidence</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <a href={"tel:" + primary.phone} className="text-xl font-bold text-slate-900 hover:text-blue-600 transition-colors">
                                  📞 {primary.phone}
                                </a>
                                <a href={"tel:" + primary.phone}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors">
                                  Call Now
                                </a>
                              </div>
                              <p className="text-xs text-slate-500 mt-1.5">{primary.reason}</p>
                              {primary.names?.length > 0 && (
                                <p className="text-xs text-slate-600 mt-0.5">
                                  Associated: {primary.names.join(", ")}
                                </p>
                              )}
                            </div>
                          )}
                          {others.length > 0 && (
                            <div className="bg-white/60 rounded-lg border border-emerald-100 p-3">
                              <p className="text-[10px] text-slate-400 uppercase font-medium mb-2">Other Numbers</p>
                              <div className="space-y-2">
                                {others.slice(0, 5).map((pr: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (
                                        pr.score >= 80 ? "bg-emerald-100 text-emerald-700" :
                                        pr.score >= 50 ? "bg-amber-100 text-amber-700" :
                                        "bg-slate-100 text-slate-500"
                                      )}>{pr.score}%</span>
                                      <a href={"tel:" + pr.phone} className="text-sm font-bold text-slate-800 hover:text-blue-600">{pr.phone}</a>
                                    </div>
                                    <span className="text-[10px] text-slate-400 max-w-[200px] truncate text-right">{pr.reason}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {bestAddr && (
                            <div className="bg-white/60 rounded-lg border border-emerald-100 px-3 py-2">
                              <p className="text-[10px] text-slate-400 uppercase font-medium">Mailing Address</p>
                              <p className="text-sm text-slate-700 mt-0.5">📍 {bestAddr}</p>
                            </div>
                          )}
                        </div>
                      ) : null;
                    })()}

                    <div className="space-y-1 mt-2">
                      {reasoning.map((r: string, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="text-emerald-500">✓</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No ownership data available for analysis.</p>
                );
              })()}

              {/* Data Confidence Score */}
              {data?.leadVerification?.confidenceScore && (
                <div className={"mt-4 rounded-lg border p-4 " + (
                  data.leadVerification.confidenceScore.grade === "A" ? "bg-gradient-to-r from-emerald-50 to-green-50 border-emerald-300" :
                  data.leadVerification.confidenceScore.grade === "B" ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300" :
                  data.leadVerification.confidenceScore.grade === "C" ? "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300" :
                  data.leadVerification.confidenceScore.grade === "D" ? "bg-gradient-to-r from-orange-50 to-red-50 border-orange-300" :
                  "bg-gradient-to-r from-slate-50 to-gray-50 border-slate-200"
                )}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🔒</span>
                      <span className="text-sm font-bold text-slate-900">Data Confidence Score</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={"text-3xl font-black " + (
                        data.leadVerification.confidenceScore.grade === "A" ? "text-emerald-700" :
                        data.leadVerification.confidenceScore.grade === "B" ? "text-blue-700" :
                        data.leadVerification.confidenceScore.grade === "C" ? "text-amber-700" :
                        data.leadVerification.confidenceScore.grade === "D" ? "text-orange-700" :
                        "text-red-700"
                      )}>
                        {data.leadVerification.confidenceScore.total}
                      </div>
                      <div className={"text-xl font-black px-2 py-0.5 rounded " + (
                        data.leadVerification.confidenceScore.grade === "A" ? "bg-emerald-200 text-emerald-800" :
                        data.leadVerification.confidenceScore.grade === "B" ? "bg-blue-200 text-blue-800" :
                        data.leadVerification.confidenceScore.grade === "C" ? "bg-amber-200 text-amber-800" :
                        data.leadVerification.confidenceScore.grade === "D" ? "bg-orange-200 text-orange-800" :
                        "bg-red-200 text-red-800"
                      )}>
                        {data.leadVerification.confidenceScore.grade}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mb-3 leading-relaxed">{data.leadVerification.confidenceScore.recommendation}</p>
                  <div className="space-y-1.5">
                    {data.leadVerification.confidenceScore.factors?.map((f: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className={f.matched ? "text-emerald-500" : "text-slate-300"}>
                            {f.matched ? "✅" : "⬜"}
                          </span>
                          <span className={f.matched ? "text-slate-700 font-medium" : "text-slate-400"}>{f.name}</span>
                          <span className="text-slate-400 text-[10px]">{f.source}</span>
                        </div>
                        <span className={f.matched ? "font-bold text-emerald-600" : "text-slate-300"}>
                          {f.matched ? `+${f.points}` : "0"}
                        </span>
                      </div>
                    ))}
                  </div>
                  {data.leadVerification.apollo && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">Apollo.io</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {data.leadVerification.apollo.title && (
                          <div>
                            <p className="text-slate-400">Title</p>
                            <p className="text-slate-900 font-medium">{data.leadVerification.apollo.title}</p>
                          </div>
                        )}
                        {data.leadVerification.apollo.organizationName && (
                          <div>
                            <p className="text-slate-400">Company</p>
                            <p className="text-slate-900 font-medium">{data.leadVerification.apollo.organizationName}</p>
                          </div>
                        )}
                        {data.leadVerification.apollo.linkedinUrl && (
                          <div className="col-span-2">
                            <a href={data.leadVerification.apollo.linkedinUrl} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 hover:underline">🔗 LinkedIn Profile</a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Corporate Filing — NY DOS */}
              {data?.corporateIntel && (
                <FeatureGate feature="bp_corp_basic" blur>
                <div className="mt-4 rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🏛️</span>
                    <span className="text-sm font-bold text-slate-900">NY Corporate Filing</span>
                    <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">DOS</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                    <div>
                      <p className="text-slate-400">Entity Name</p>
                      <p className="text-slate-900 font-bold">{data.corporateIntel.entityName}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Entity Type</p>
                      <p className="text-slate-900 font-medium">{data.corporateIntel.entityType}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">DOS ID</p>
                      <p className="text-slate-900 font-medium">{data.corporateIntel.dosId}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Formation Date</p>
                      <p className="text-slate-900 font-medium">
                        {data.corporateIntel.filingDate ? new Date(data.corporateIntel.filingDate).toLocaleDateString() : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Process Agent / Registered Agent */}
                  <div className="bg-white/60 rounded-lg border border-violet-100 p-3 mb-3">
                    <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">
                      {data.corporateIntel.registeredAgent ? "Registered Agent" : "Process Agent"}
                    </p>
                    <p className="text-sm font-bold text-slate-900">
                      {data.corporateIntel.registeredAgent || data.corporateIntel.processName || "—"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {data.corporateIntel.registeredAgentAddress || data.corporateIntel.processAddress || "—"}
                    </p>
                  </div>

                  {/* Related Entities — Pro+ only */}
                  {data.corporateIntel.totalRelatedEntities > 0 && (
                    <FeatureGate feature="bp_corp_full" blur>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-slate-400 uppercase font-medium">
                          Related Entities ({data.corporateIntel.totalRelatedEntities})
                        </p>
                      </div>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {data.corporateIntel.relatedEntities.slice(0, 10).map((e: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-white/60 rounded border border-violet-100 px-3 py-1.5">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-slate-800 truncate">{e.name}</p>
                              <p className="text-[10px] text-slate-400">{e.entityType} · Filed {e.filingDate ? new Date(e.filingDate).toLocaleDateString() : "—"}</p>
                            </div>
                            <span className="text-[10px] text-violet-500 font-medium ml-2 shrink-0">DOS {e.dosId}</span>
                          </div>
                        ))}
                        {data.corporateIntel.totalRelatedEntities > 10 && (
                          <p className="text-[10px] text-slate-400 text-center py-1">
                            + {data.corporateIntel.totalRelatedEntities - 10} more entities
                          </p>
                        )}
                      </div>
                    </div>
                    </FeatureGate>
                  )}
                </div>
                </FeatureGate>
              )}
            </Section>
          )}

          {/* ============================================================ */}
          {/* 3. CONTACT INTELLIGENCE */}
          {/* ============================================================ */}
          {(data?.ownerContacts?.length > 0 || data?.hpdContacts?.length > 0 || data?.rankedContacts?.length > 0) && (() => {
            const cleanPh = (ph: string) => ph.replace(/\D/g, "").slice(-10);
            // Merge ALL phone sources: DOB/HPD contacts, PDL phones, Apollo phone
            const phoneGroups = new Map<string, { phone: string; names: string[]; sources: string[]; addresses: string[]; count: number }>();
            const addPhone = (phone: string, name: string, source: string, address?: string) => {
              const key = cleanPh(phone);
              if (key.length < 7) return;
              if (!phoneGroups.has(key)) phoneGroups.set(key, { phone, names: [], sources: [], addresses: [], count: 0 });
              const g = phoneGroups.get(key)!;
              g.count++;
              if (name && !g.names.includes(name)) g.names.push(name);
              if (source && !g.sources.includes(source)) g.sources.push(source);
              if (address && !g.addresses.includes(address)) g.addresses.push(address);
            };
            // DOB/HPD owner contacts
            (data.ownerContacts || []).filter((c: any) => c.phone).forEach((c: any) => {
              addPhone(c.phone, c.name, c.source, c.address);
            });
            // PDL phones
            if (data.pdlEnrichment?.phones?.length) {
              const pdlName = data.pdlEnrichment.fullName || data.pdlEnrichment.firstName ? [data.pdlEnrichment.firstName, data.pdlEnrichment.lastName].filter(Boolean).join(" ") : "";
              data.pdlEnrichment.phones.forEach((ph: any) => {
                addPhone(ph.number, pdlName, "PDL (" + (ph.type || "phone") + ")");
              });
            }
            // Apollo phone
            if (data.apolloEnrichment?.phone) {
              const apolloName = [data.apolloEnrichment.firstName, data.apolloEnrichment.lastName].filter(Boolean).join(" ");
              addPhone(data.apolloEnrichment.phone, apolloName, "Apollo");
            }
            // Apollo org phone
            if (data.apolloOrgEnrichment?.phone) {
              addPhone(data.apolloOrgEnrichment.phone, data.apolloOrgEnrichment.name || "", "Apollo Org");
            }
            const hpdOwners = (data.hpdContacts || [])
              .filter((c: any) => (c.type?.includes("Owner") || c.type?.includes("Head")) && c.businessAddress)
              .slice(0, 4);
            const dobNoPhone = (data.ownerContacts || [])
              .filter((c: any) => !c.phone && c.address)
              .slice(0, 2);

            return (
              <FeatureGate feature="bp_owner_contact" blur>
              <Section id="contacts" title="Contact Intelligence" icon="📞"
                badge={<span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">{phoneGroups.size} unique phone{phoneGroups.size !== 1 ? "s" : ""}</span>}
                className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200"
                collapsed={isCollapsed("contacts")} onToggle={() => toggle("contacts")}>
                <div className="space-y-3">
                  {/* Deduplicated phone groups — all sources merged */}
                  {Array.from(phoneGroups.values()).map((g, i) => {
                    const sourceColors: Record<string, string> = {
                      "DOB Permit": "bg-amber-100 text-amber-700",
                      "DOB Job Filing": "bg-amber-100 text-amber-700",
                      "DOB NOW Filing": "bg-amber-100 text-amber-700",
                      "DOB NOW (Owner)": "bg-amber-100 text-amber-700",
                      "HPD Agent/Manager": "bg-teal-100 text-teal-700",
                      "Apollo": "bg-orange-100 text-orange-700",
                      "Apollo Org": "bg-orange-100 text-orange-700",
                    };
                    const getSourceColor = (src: string) => {
                      if (src.startsWith("PDL")) return "bg-blue-100 text-blue-700";
                      if (src.startsWith("DOB")) return "bg-amber-100 text-amber-700";
                      return sourceColors[src] || "bg-slate-100 text-slate-600";
                    };
                    return (
                      <div key={"pg-" + i} className="bg-white rounded-lg border border-blue-100 p-4">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <a href={"tel:" + g.phone} className="text-lg font-bold text-slate-900 hover:text-blue-600">📞 {g.phone}</a>
                            {g.sources.length > 1 && (
                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{g.sources.length} sources</span>
                            )}
                          </div>
                          <a href={"tel:" + g.phone} className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors">Call</a>
                        </div>
                        <p className="text-sm text-slate-600">
                          {g.names.map((name, ni) => (
                            <span key={ni}>
                              {onNameClick ? (
                                <button onClick={() => onNameClick(name)} className="text-blue-600 hover:underline">{name}</button>
                              ) : name}
                              {ni < g.names.length - 1 && <span className="text-slate-300 mx-1">·</span>}
                            </span>
                          ))}
                        </p>
                        {g.addresses[0] && <p className="text-xs text-slate-400 mt-1">📍 {g.addresses[0]}</p>}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {g.sources.map((src, si) => (
                            <span key={si} className={"text-[9px] font-bold px-1.5 py-0.5 rounded " + getSourceColor(src)}>{src}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* HPD owners without phone */}
                  {hpdOwners.map((c: any, i: number) => (
                    <div key={"hpd-" + i} className="bg-white rounded-lg border border-blue-100 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={"text-xs font-bold px-2 py-0.5 rounded uppercase " + (
                          c.type?.includes("Owner") ? "text-blue-700 bg-blue-50" : "text-indigo-700 bg-indigo-50"
                        )}>{c.type}</span>
                        <span className="text-xs text-slate-400">HPD Registration</span>
                        <span className="text-[10px] text-slate-300">No phone</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        {onNameClick ? (
                          <button onClick={() => onNameClick(c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" "))} className="text-blue-600 hover:underline">
                            {c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" ")} →
                          </button>
                        ) : (c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" "))}
                      </p>
                      {c.businessAddress && (
                        <p className="text-xs text-slate-500 mt-1">
                          📍 {[c.businessAddress, c.businessCity, c.businessState, c.businessZip].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* DOB contacts without phone */}
                  {dobNoPhone.map((c: any, i: number) => (
                    <div key={"dob-" + i} className="bg-white rounded-lg border border-slate-100 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded uppercase">Mailing Address</span>
                        <span className="text-xs text-slate-400">{c.source}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        {onNameClick ? (
                          <button onClick={() => onNameClick(c.name)} className="text-blue-600 hover:underline">{c.name} →</button>
                        ) : c.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">📍 {c.address}</p>
                    </div>
                  ))}
                </div>

                {phoneGroups.size === 0 && (
                  <p className="text-xs text-blue-500 mt-3 italic">No phone numbers found in public records.</p>
                )}

                {/* Smart Contact Directory */}
                {data?.rankedContacts?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-slate-900">Contact Directory</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">AI Ranked</span>
                    </div>
                    <div className="space-y-2">
                      {data.rankedContacts.slice(0, 8).map((contact: any, i: number) => (
                        <div key={i} className={"flex items-center justify-between p-2.5 rounded-lg border " + (
                          contact.phone ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100"
                        )}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={"text-[10px] font-bold px-1.5 py-0.5 rounded " + (
                                contact.score >= 80 ? "bg-emerald-100 text-emerald-700" :
                                contact.score >= 60 ? "bg-blue-100 text-blue-700" :
                                contact.score >= 40 ? "bg-amber-100 text-amber-700" :
                                "bg-slate-100 text-slate-600"
                              )}>{contact.role}</span>
                              <span className="text-[9px] text-slate-400">{contact.source}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-900 mt-0.5 cursor-pointer hover:text-blue-600" onClick={() => onNameClick && onNameClick(contact.name)}>
                              {contact.name} →
                            </p>
                            {contact.address && <p className="text-[11px] text-slate-500 truncate">📍 {contact.address}</p>}
                          </div>
                          <div className="text-right ml-3 flex-shrink-0">
                            {contact.phone ? (
                              <div className="flex items-center gap-1.5 justify-end">
                                <a href={"tel:" + contact.phone} className="text-sm font-bold text-emerald-700 hover:underline">{contact.phone}</a>
                                <button onClick={() => setSmsTarget({ phone: contact.phone, name: contact.name })} className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Send SMS">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">No phone</span>
                            )}
                            {contact.email && (
                              <a href={"mailto:" + contact.email} className="block text-[11px] text-blue-600 hover:underline mt-0.5 truncate max-w-[200px]">{contact.email}</a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PDL Enrichment */}
                {data?.pdlEnrichment && !data.pdlEnrichment.error && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">People Data Labs</span>
                      {data.pdlEnrichment.likelihood && (
                        <span className="text-[10px] text-slate-500">Match: {data.pdlEnrichment.likelihood}/10</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {data.pdlEnrichment.phones?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase">Phones</p>
                          {data.pdlEnrichment.phones.map((ph: any, i: number) => (
                            <a key={i} href={"tel:" + ph.number} className="block font-bold text-emerald-700 hover:underline">📞 {ph.number} <span className="text-[9px] text-slate-400 font-normal">{ph.type}</span></a>
                          ))}
                        </div>
                      )}
                      {data.pdlEnrichment.emails?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase">Emails</p>
                          {data.pdlEnrichment.emails.map((em: string, i: number) => (
                            <a key={i} href={"mailto:" + em} className="block text-blue-600 hover:underline truncate">✉️ {em}</a>
                          ))}
                        </div>
                      )}
                      {data.pdlEnrichment.jobTitle && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase">Professional</p>
                          <p className="text-slate-900">{data.pdlEnrichment.jobTitle}{data.pdlEnrichment.jobCompany ? " @ " + data.pdlEnrichment.jobCompany : ""}</p>
                        </div>
                      )}
                      {data.pdlEnrichment.linkedin && (
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase">LinkedIn</p>
                          <a href={data.pdlEnrichment.linkedin.startsWith("http") ? data.pdlEnrichment.linkedin : "https://" + data.pdlEnrichment.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">
                            🔗 {data.pdlEnrichment.linkedin.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Skip Trace */}
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🔍</span>
                      <span className="text-sm font-bold text-slate-900">Skip Trace</span>
                      <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Tracerfy</span>
                    </div>
                    {!skipTraceResult && (
                      <button onClick={handleSkipTrace} disabled={skipTracing}
                        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
                        {skipTracing ? "Searching..." : "Find Phone & Email ($0.02)"}
                      </button>
                    )}
                  </div>
                  {skipTracing && (
                    <div className="flex items-center gap-2 text-xs text-violet-600">
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-violet-600 border-t-transparent"></div>
                      <span>Searching databases for contact info... (up to 60s)</span>
                    </div>
                  )}
                  {skipTraceResult && !skipTraceResult.error && (
                    <div className="space-y-3">
                      {skipTraceResult.source && (
                        <div className="flex items-center gap-2">
                          <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (skipTraceResult.source === "PDL" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")}>
                            {skipTraceResult.source === "PDL" ? "People Data Labs" : "Tracerfy"}
                          </span>
                          {skipTraceResult.likelihood && (
                            <span className="text-[10px] text-slate-500">Match confidence: {skipTraceResult.likelihood}/10</span>
                          )}
                        </div>
                      )}
                      {skipTraceResult.phones?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Phone Numbers</p>
                          <div className="space-y-1">
                            {skipTraceResult.phones.map((ph: any, i: number) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">{ph.type}</span>
                                <a href={"tel:" + ph.number} className="text-sm font-bold text-slate-900 hover:text-blue-600">{ph.number}</a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {skipTraceResult.emails?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Email Addresses</p>
                          <div className="space-y-1">
                            {skipTraceResult.emails.map((em: string, i: number) => (
                              <a key={i} href={"mailto:" + em} className="block text-sm font-medium text-blue-600 hover:underline">{em}</a>
                            ))}
                          </div>
                        </div>
                      )}
                      {skipTraceResult.jobTitle && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Professional Info</p>
                          <p className="text-sm text-slate-900 font-medium">{skipTraceResult.jobTitle}{skipTraceResult.jobCompany ? " at " + skipTraceResult.jobCompany : ""}</p>
                        </div>
                      )}
                      {skipTraceResult.linkedin && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">LinkedIn</p>
                          <a href={skipTraceResult.linkedin} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                            🔗 {skipTraceResult.linkedin.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}
                          </a>
                        </div>
                      )}
                      {skipTraceResult.mailingAddress && (
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Mailing Address</p>
                          <p className="text-sm text-slate-700">{skipTraceResult.mailingAddress}</p>
                        </div>
                      )}
                      {skipTraceResult.phones?.length === 0 && skipTraceResult.emails?.length === 0 && (
                        <p className="text-xs text-slate-500">No additional contact info found via skip tracing.</p>
                      )}
                    </div>
                  )}
                  {skipTraceResult?.error && (
                    <p className="text-xs text-red-600">{skipTraceResult.error}</p>
                  )}
                  {!skipTraceResult && !skipTracing && (
                    <p className="text-xs text-slate-500">Click the button to search for phone numbers and email addresses. Uses 1 credit ($0.02) per lookup.</p>
                  )}
                </div>

                {/* HPD Contacts directory */}
                {data?.hpdContacts?.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-blue-200">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-slate-900">HPD Contacts</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{data.hpdContacts.length} registered</span>
                    </div>
                    <div className="space-y-2">
                      {data.hpdContacts.map((c: any, i: number) => (
                        <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className={"text-xs font-medium px-2 py-0.5 rounded mr-2 " + (
                                c.type.includes("Owner") ? "bg-emerald-50 text-emerald-700" :
                                c.type.includes("Head") ? "bg-blue-50 text-blue-700" :
                                c.type.includes("Agent") ? "bg-amber-50 text-amber-700" :
                                "bg-slate-100 text-slate-600"
                              )}>{c.type}</span>
                              <span className="text-sm font-semibold text-slate-900">
                                {c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" ")}
                              </span>
                            </div>
                            {onNameClick && (
                              <button onClick={() => onNameClick(c.corporateName || [c.firstName, c.lastName].filter(Boolean).join(" "))}
                                className="text-xs text-blue-600 hover:underline">
                                Search portfolio →
                              </button>
                            )}
                          </div>
                          {c.title && <p className="text-xs text-slate-500 mt-1">{c.title}</p>}
                          {c.businessAddress && (
                            <p className="text-xs text-slate-400 mt-1">
                              📍 {[c.businessAddress, c.businessCity, c.businessState, c.businessZip].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
              </FeatureGate>
            );
          })()}

          {/* ============================================================ */}
          {/* 4. ORGANIZATION INTELLIGENCE (Apollo) */}
          {/* ============================================================ */}
          {data?.apolloOrgEnrichment && (() => {
            const org = data.apolloOrgEnrichment;
            const keyPeople = data.apolloKeyPeople || [];
            const apolloPerson = data.apolloEnrichment;

            return (
              <Section id="orgIntel" title="Organization Intelligence" icon="🏢"
                badge={<span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">via Apollo.io</span>}
                className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl border border-indigo-200"
                collapsed={isCollapsed("orgIntel")} onToggle={() => toggle("orgIntel")}>
                <div className="space-y-4">
                  {/* Org Header */}
                  <div className="flex items-start gap-3">
                    {org.logoUrl ? (
                      <img src={org.logoUrl} alt="" className="w-10 h-10 rounded-lg object-contain border border-slate-200 bg-white" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
                        {(org.name || "?")[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{org.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {org.industry && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{org.industry}</span>
                        )}
                        {org.employeeCount && (
                          <span className="text-xs text-slate-500">{org.employeeCount} employees</span>
                        )}
                        {org.foundedYear && (
                          <span className="text-xs text-slate-400">Est. {org.foundedYear}</span>
                        )}
                      </div>
                      {org.revenue && (
                        <p className="text-xs text-slate-500 mt-1">Revenue: <span className="font-semibold text-slate-700">{org.revenue}</span></p>
                      )}
                    </div>
                  </div>

                  {/* Org Details Grid */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {org.phone && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">📞</span>
                        <a href={`tel:${org.phone}`} className="text-blue-600 hover:underline font-medium">{org.phone}</a>
                      </div>
                    )}
                    {org.website && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">🌐</span>
                        <a href={org.website.startsWith("http") ? org.website : "https://" + org.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">{org.website.replace(/^https?:\/\//, "")}</a>
                      </div>
                    )}
                    {org.address && (
                      <div className="flex items-center gap-1.5 col-span-2">
                        <span className="text-slate-400">📍</span>
                        <span className="text-slate-600">{org.address}</span>
                      </div>
                    )}
                    {org.linkedinUrl && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">🔗</span>
                        <a href={org.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>
                      </div>
                    )}
                  </div>

                  {org.shortDescription && (
                    <p className="text-xs text-slate-500 italic leading-relaxed">{org.shortDescription}</p>
                  )}

                  {/* Key People */}
                  {(keyPeople.length > 0 || apolloPerson) && (
                    <div className="pt-3 border-t border-indigo-200">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">Key People</p>
                      <div className="space-y-2">
                        {/* Primary enriched person first */}
                        {apolloPerson && (
                          <div className="bg-white border border-indigo-200 rounded-lg p-3">
                            <div className="flex items-start gap-3">
                              {apolloPerson.photoUrl ? (
                                <img src={apolloPerson.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                  {(apolloPerson.firstName || "?")[0]}{(apolloPerson.lastName || "?")[0]}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">{apolloPerson.firstName} {apolloPerson.lastName}</span>
                                  <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">ENRICHED</span>
                                </div>
                                {apolloPerson.title && <p className="text-xs text-slate-500 mt-0.5">{apolloPerson.title}</p>}
                                <div className="flex items-center gap-3 mt-1.5 text-xs">
                                  {apolloPerson.email && (
                                    <a href={`mailto:${apolloPerson.email}`} className="text-blue-600 hover:underline">📧 {apolloPerson.email}</a>
                                  )}
                                  {apolloPerson.phone && (
                                    <a href={`tel:${apolloPerson.phone}`} className="text-emerald-700 font-bold hover:underline">📞 {apolloPerson.phone}</a>
                                  )}
                                  {apolloPerson.linkedinUrl && (
                                    <a href={apolloPerson.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">🔗 LinkedIn</a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Other key people from search */}
                        {keyPeople.filter((kp: any) => {
                          if (!apolloPerson) return true;
                          return kp.firstName.toLowerCase() !== apolloPerson.firstName?.toLowerCase() || kp.lastName.toLowerCase() !== apolloPerson.lastName?.toLowerCase();
                        }).map((kp: any, i: number) => (
                          <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-medium text-slate-900">{kp.firstName} {kp.lastName}</span>
                                {kp.title && <span className="text-xs text-slate-400 ml-2">{kp.title}</span>}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {kp.hasEmail && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">📧</span>}
                                {kp.hasPhone && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-medium">📞</span>}
                              </div>
                            </div>
                            {kp.seniority && <p className="text-[10px] text-slate-400 mt-0.5">{kp.seniority}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            );
          })()}

          {/* ============================================================ */}
          {/* 5. ACTIVE LISTINGS */}
          {/* ============================================================ */}
          {p && (() => {
            const boroToCityMap: Record<string, string> = {
              Manhattan: "New York",
              Bronx: "Bronx",
              Brooklyn: "Brooklyn",
              Queens: "Queens",
              "Staten Island": "Staten Island",
            };
            const streetAddr = p.address || "";
            const boroName = p.borough || displayBorough;
            const cityName = boroToCityMap[boroName] || boroName;
            const zip = data?.neighborhoodData?.zip || data?.registrations?.[0]?.zip || "";
            const fullAddress = [streetAddr, cityName, "NY", zip].filter(Boolean).join(", ");
            const addrSlug = streetAddr.replace(/\s+/g, "-").toLowerCase();
            const fullSlug = fullAddress.replace(/\s+/g, "-");

            const platforms = {
              sale: [
                { name: "Zillow", color: "#006AFF", url: `https://www.zillow.com/homes/${encodeURIComponent(fullSlug)}_rb/` },
                { name: "StreetEasy", color: "#00A850", url: `https://streeteasy.com/building/${encodeURIComponent(addrSlug)}` },
                { name: "Realtor.com", color: "#D92228", url: `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(fullAddress.replace(/\s+/g, "-"))}` },
                { name: "Google", color: "#4285F4", url: `https://www.google.com/search?q=${encodeURIComponent(fullAddress + " for sale")}` },
              ],
              rent: [
                { name: "StreetEasy", color: "#00A850", url: `https://streeteasy.com/search?search=${encodeURIComponent(fullAddress)}` },
                { name: "Apartments.com", color: "#6B46C1", url: `https://www.apartments.com/${encodeURIComponent(addrSlug)}-${encodeURIComponent(boroName.toLowerCase())}-ny/` },
                { name: "RentHop", color: "#FF6B35", url: `https://www.renthop.com/search?search=${encodeURIComponent(fullAddress)}` },
                { name: "Google", color: "#4285F4", url: `https://www.google.com/search?q=${encodeURIComponent(fullAddress + " for rent")}` },
              ],
            };

            return (
              <Section id="listings" title="Active Listings" icon="🏠"
                badge={<span className="text-xs text-slate-400">External search</span>}
                collapsed={isCollapsed("listings")} onToggle={() => toggle("listings")}>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">For Sale</p>
                    <div className="flex flex-wrap gap-2">
                      {platforms.sale.map((pl) => (
                        <a key={pl.name} href={pl.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pl.color }} />
                          {pl.name}
                          <span className="text-slate-300 text-xs">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">For Rent</p>
                    <div className="flex flex-wrap gap-2">
                      {platforms.rent.map((pl) => (
                        <a key={pl.name} href={pl.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pl.color }} />
                          {pl.name}
                          <span className="text-slate-300 text-xs">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">Searching for <span className="font-medium text-slate-500">{fullAddress}</span></p>
                </div>
              </Section>
            );
          })()}

          {/* ============================================================ */}
          {/* 6. NEIGHBORHOOD INTELLIGENCE (Zillow) */}
          {/* ============================================================ */}
          {data?.neighborhoodData && (data.neighborhoodData.currentHomeValue || data.neighborhoodData.currentRent) && (() => {
            const nd = data.neighborhoodData;
            const avg = nd.nycAverages || {};

            const fmtK = (n: number) => n >= 1000000 ? "$" + (n / 1000000).toFixed(1) + "M" : n >= 1000 ? "$" + Math.round(n / 1000) + "K" : "$" + Math.round(n);
            const fmtPct = (n: number | null) => n !== null ? (n >= 0 ? "+" : "") + n.toFixed(1) + "%" : "—";

            const signals: string[] = [];
            if (nd.homeValueChange1Y !== null) {
              if (nd.homeValueChange1Y > 5) signals.push("Strong appreciation area");
              else if (nd.homeValueChange1Y > 0) signals.push("Moderate growth area");
              else signals.push("Values declining");
              signals.push("values " + (nd.homeValueChange1Y > 0 ? "up" : "down") + " " + Math.abs(nd.homeValueChange1Y).toFixed(1) + "% YoY");
            }
            if (nd.forSaleInventory !== null) {
              if (nd.forSaleInventory > 200) signals.push("high inventory");
              else if (nd.forSaleInventory > 100) signals.push("moderate inventory");
              else signals.push("tight inventory");
            }
            if (nd.rentChange1Y !== null && nd.rentChange1Y > 3) signals.push("rents rising fast");
            const marketSignal = signals.length > 0 ? signals.join(". ") + "." : null;

            const sparkData = nd.homeValueHistory?.map((h: { value: number }) => h.value) || [];

            const CompareBar = ({ label, value, nycAvg, fmt }: { label: string; value: number | null; nycAvg: number; fmt: (n: number) => string }) => {
              if (value === null || nycAvg <= 0) return null;
              const ratio = Math.min(value / nycAvg, 2);
              const pct = Math.round(ratio * 50);
              return (
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-24 text-slate-500 truncate">{label}</span>
                  <span className="w-16 font-bold text-slate-900 text-right">{fmt(value)}</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={"h-full rounded-full " + (ratio > 1 ? "bg-blue-500" : "bg-emerald-500")} style={{ width: pct + "%" }} />
                  </div>
                  <span className="w-16 text-slate-400 text-right">{fmt(nycAvg)}</span>
                </div>
              );
            };

            return (
              <Section id="neighborhood" title="Neighborhood Intelligence" icon="🏘️"
                badge={<span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium">ZIP: {nd.zip}</span>}
                className="bg-gradient-to-r from-cyan-50 to-sky-50 rounded-xl border border-cyan-200"
                collapsed={isCollapsed("neighborhood")} onToggle={() => toggle("neighborhood")}>
                {/* Two-column stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {nd.currentHomeValue && (
                    <div className="bg-white/70 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Typical Home Value</p>
                      <p className="text-xl font-black text-slate-900 mt-1">{fmtK(nd.currentHomeValue)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {nd.homeValueChange1Y !== null && (
                          <span className={"text-xs font-bold " + (nd.homeValueChange1Y >= 0 ? "text-emerald-600" : "text-red-600")}>
                            {nd.homeValueChange1Y >= 0 ? "▲" : "▼"} {fmtPct(nd.homeValueChange1Y)} YoY
                          </span>
                        )}
                      </div>
                      {nd.homeValueChange5Y !== null && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{fmtPct(nd.homeValueChange5Y)} over 5 years</p>
                      )}
                    </div>
                  )}
                  {nd.currentRent && (
                    <div className="bg-white/70 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Rent Index</p>
                      <p className="text-xl font-black text-slate-900 mt-1">{"$" + Math.round(nd.currentRent).toLocaleString()}<span className="text-sm font-normal text-slate-500">/mo</span></p>
                      {nd.rentChange1Y !== null && (
                        <span className={"text-xs font-bold " + (nd.rentChange1Y >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {nd.rentChange1Y >= 0 ? "▲" : "▼"} {fmtPct(nd.rentChange1Y)} YoY
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Sparkline */}
                {sparkData.length >= 2 && (() => {
                  const min = Math.min(...sparkData);
                  const max = Math.max(...sparkData);
                  const range = max - min || 1;
                  const w = 200, h = 36;
                  const points = sparkData.map((v: number, i: number) => {
                    const x = (i / (sparkData.length - 1)) * w;
                    const y = h - ((v - min) / range) * (h - 4) - 2;
                    return `${x},${y}`;
                  }).join(" ");
                  const color = sparkData[sparkData.length - 1] >= sparkData[0] ? "#10B981" : "#EF4444";
                  return (
                    <div className="mb-4">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Home Value Trend (12 months)</p>
                      <svg width={w} height={h} className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                        <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
                      </svg>
                    </div>
                  );
                })()}

                {/* Market activity */}
                {(nd.forSaleInventory !== null || nd.newListings !== null) && (
                  <div className="flex items-center gap-4 mb-4 text-xs">
                    {nd.forSaleInventory !== null && (
                      <div className="bg-white/70 rounded-lg px-3 py-2 flex-1">
                        <p className="text-[10px] text-slate-400 uppercase">For Sale</p>
                        <p className="font-bold text-slate-900">{Math.round(nd.forSaleInventory)} listings</p>
                      </div>
                    )}
                    {nd.newListings !== null && (
                      <div className="bg-white/70 rounded-lg px-3 py-2 flex-1">
                        <p className="text-[10px] text-slate-400 uppercase">New This Month</p>
                        <p className="font-bold text-slate-900">{Math.round(nd.newListings)} listings</p>
                      </div>
                    )}
                  </div>
                )}

                {/* NYC Comparison */}
                {avg.avgHomeValue > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">This ZIP vs NYC Average</p>
                    <div className="space-y-1.5">
                      <CompareBar label="Home Value" value={nd.currentHomeValue} nycAvg={avg.avgHomeValue} fmt={fmtK} />
                      <CompareBar label="Rent" value={nd.currentRent} nycAvg={avg.avgRent} fmt={(n) => "$" + Math.round(n).toLocaleString()} />
                      <CompareBar label="Inventory" value={nd.forSaleInventory} nycAvg={avg.avgInventory} fmt={(n) => String(Math.round(n))} />
                      <CompareBar label="YoY Growth" value={nd.homeValueChange1Y} nycAvg={avg.avgYoYGrowth} fmt={(n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%"} />
                    </div>
                  </div>
                )}

                {/* Market Signal */}
                {marketSignal && (
                  <div className="bg-white/70 rounded-lg p-3 border border-cyan-100">
                    <div className="flex items-start gap-2">
                      <span className="text-xs mt-0.5">{"💡"}</span>
                      <p className="text-xs text-slate-700 leading-relaxed">{marketSignal}</p>
                    </div>
                  </div>
                )}
              </Section>
            );
          })()}

          {/* ============================================================ */}
          {/* CENSUS DEMOGRAPHICS */}
          {/* ============================================================ */}
          {(censusProfile || censusLoading) && (
            <Section id="census" title="Census Demographics" icon="📊"
              badge={censusProfile?.censusTract ? (
                <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                  Tract {censusProfile.censusTract}
                </span>
              ) : undefined}
              className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200"
              collapsed={isCollapsed("census")} onToggle={() => toggle("census")}>
              {censusLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-violet-500 border-t-transparent" />
                  <span>Loading census data...</span>
                </div>
              ) : censusProfile ? (
                <div className="space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-3 gap-2">
                    {censusProfile.census?.medianHouseholdIncome != null && censusProfile.census.medianHouseholdIncome > 0 && (
                      <div className="bg-white/70 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Median Income</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                          ${(censusProfile.census.medianHouseholdIncome / 1000).toFixed(0)}k
                        </p>
                      </div>
                    )}
                    {(censusProfile.census?.medianRent ?? censusProfile.quickStats.medianRent) != null && (
                      <div className="bg-white/70 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Median Rent</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                          ${(censusProfile.census?.medianRent || censusProfile.quickStats.medianRent || 0).toLocaleString()}
                          <span className="text-[10px] font-normal text-slate-400">/mo</span>
                        </p>
                      </div>
                    )}
                    {censusProfile.census?.vacancyRate != null && (
                      <div className="bg-white/70 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Vacancy</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                          {censusProfile.census.vacancyRate.toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {censusProfile.census?.population != null && censusProfile.census.population > 0 && (
                      <div className="bg-white/70 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Population</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                          {censusProfile.census.population.toLocaleString()}
                        </p>
                      </div>
                    )}
                    {censusProfile.census?.medianAge != null && censusProfile.census.medianAge > 0 && (
                      <div className="bg-white/70 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Median Age</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                          {censusProfile.census.medianAge.toFixed(0)}
                        </p>
                      </div>
                    )}
                    {censusProfile.census?.medianHomeValue != null && censusProfile.census.medianHomeValue > 0 && (
                      <div className="bg-white/70 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Home Value</p>
                        <p className="text-base font-black text-slate-900 mt-0.5">
                          ${(censusProfile.census.medianHomeValue / 1000).toFixed(0)}k
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Renter vs Owner bar */}
                  {censusProfile.census && censusProfile.census.renterPct > 0 && (
                    <div className="bg-white/70 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5">Tenure Split</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-violet-700 font-bold w-12">{censusProfile.census.renterPct.toFixed(0)}%</span>
                        <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                            style={{ width: `${censusProfile.census.renterPct}%` }}
                          />
                        </div>
                        <span className="text-slate-500 w-12 text-right">{(100 - censusProfile.census.renterPct).toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                        <span>Renter</span>
                        <span>Owner</span>
                      </div>
                    </div>
                  )}

                  {/* Housing Stock Breakdown */}
                  {censusProfile.census && (() => {
                    const hs = censusProfile.census!.housingStock;
                    const total = hs.singleFamily + hs.twoUnit + hs.threeToFour + hs.fiveToNine + hs.tenToNineteen + hs.twentyToFortyNine + hs.fiftyPlus;
                    if (total === 0) return null;
                    const bars = [
                      { label: "50+ units", value: hs.fiftyPlus, color: "bg-violet-600" },
                      { label: "20-49", value: hs.twentyToFortyNine, color: "bg-violet-500" },
                      { label: "10-19", value: hs.tenToNineteen, color: "bg-violet-400" },
                      { label: "5-9", value: hs.fiveToNine, color: "bg-purple-400" },
                      { label: "3-4", value: hs.threeToFour, color: "bg-purple-300" },
                      { label: "2 units", value: hs.twoUnit, color: "bg-purple-200" },
                      { label: "1 family", value: hs.singleFamily, color: "bg-slate-300" },
                    ].filter(b => b.value > 0);
                    return (
                      <div className="bg-white/70 rounded-lg p-3">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Housing Stock</p>
                        <div className="space-y-1">
                          {bars.map(b => (
                            <div key={b.label} className="flex items-center gap-2 text-[11px]">
                              <span className="w-14 text-slate-500 text-right">{b.label}</span>
                              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${b.color} rounded-full`} style={{ width: `${(b.value / total) * 100}%` }} />
                              </div>
                              <span className="w-10 text-slate-600 font-medium">{((b.value / total) * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Market Signals */}
                  {censusProfile.signals.length > 0 && (
                    <div className="bg-white/70 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Market Signals</p>
                      <div className="space-y-1.5">
                        {censusProfile.signals.map((s, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-xs mt-0.5">
                              {s.sentiment === "positive" ? "🟢" : s.sentiment === "negative" ? "🔴" : "🟡"}
                            </span>
                            <div>
                              <span className="text-[10px] font-bold text-slate-500 uppercase">{s.label}: </span>
                              <span className="text-xs text-slate-700">{s.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Trends (if available) */}
                  {censusProfile.trends && censusProfile.trends.length >= 2 && (() => {
                    const t = censusProfile.trends!;
                    const first = t[0];
                    const last = t[t.length - 1];
                    const incomeGrowth = first.medianHouseholdIncome && last.medianHouseholdIncome
                      ? ((last.medianHouseholdIncome - first.medianHouseholdIncome) / first.medianHouseholdIncome * 100)
                      : null;
                    const rentGrowth = first.medianRent && last.medianRent
                      ? ((last.medianRent - first.medianRent) / first.medianRent * 100)
                      : null;
                    const popGrowth = first.population && last.population
                      ? ((last.population - first.population) / first.population * 100)
                      : null;
                    if (!incomeGrowth && !rentGrowth && !popGrowth) return null;
                    return (
                      <div className="bg-white/70 rounded-lg p-3">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                          Trends ({first.year}–{last.year})
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {incomeGrowth != null && (
                            <div>
                              <p className="text-[10px] text-slate-400">Income</p>
                              <p className={`text-sm font-bold ${incomeGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {incomeGrowth >= 0 ? "+" : ""}{incomeGrowth.toFixed(0)}%
                              </p>
                            </div>
                          )}
                          {rentGrowth != null && (
                            <div>
                              <p className="text-[10px] text-slate-400">Rent</p>
                              <p className={`text-sm font-bold ${rentGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {rentGrowth >= 0 ? "+" : ""}{rentGrowth.toFixed(0)}%
                              </p>
                            </div>
                          )}
                          {popGrowth != null && (
                            <div>
                              <p className="text-[10px] text-slate-400">Population</p>
                              <p className={`text-sm font-bold ${popGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {popGrowth >= 0 ? "+" : ""}{popGrowth.toFixed(0)}%
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* HUD Fair Market Rents */}
                  {hudFmr && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                        HUD Fair Market Rents (FY{hudFmr.year}) — {hudFmr.source === "api" ? `ZIP ${hudFmr.zip}` : "NYC Metro"}
                      </p>
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { label: "Studio", val: hudFmr.studio },
                          { label: "1BR", val: hudFmr.oneBr },
                          { label: "2BR", val: hudFmr.twoBr },
                          { label: "3BR", val: hudFmr.threeBr },
                          { label: "4BR", val: hudFmr.fourBr },
                        ].map(r => (
                          <div key={r.label} className="text-center">
                            <p className="text-[10px] text-slate-400">{r.label}</p>
                            <p className="text-sm font-bold text-slate-900">${r.val.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                      {censusProfile?.census?.medianRent && hudFmr.twoBr > censusProfile.census.medianRent * 1.2 && (
                        <p className="text-xs text-amber-600 mt-2 font-medium">
                          HUD FMR exceeds census median rent by {Math.round((hudFmr.twoBr / censusProfile.census.medianRent - 1) * 100)}% — potential rent gap
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </Section>
          )}

          {/* ============================================================ */}
          {/* 7. RELATED PROPERTIES (Portfolio) */}
          {/* ============================================================ */}
          <Section id="related" title="Related Properties" icon="🏘️"
            badge={<span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{loadingRelated ? "Searching..." : relatedProperties.length + " found"}</span>}
            collapsed={isCollapsed("related")} onToggle={() => toggle("related")}>
            {loadingRelated ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-500 border-t-transparent"></div>
                <span>Discovering connected properties...</span>
              </div>
            ) : relatedProperties.length > 0 ? (
              <>
                <div className="text-xs text-slate-500 mb-2">Properties linked through shared owners, LLCs, and head officers</div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {relatedProperties.slice(0, 20).map((rp: any, i: number) => (
                    <div key={i}
                      onClick={() => { onClose(); setTimeout(() => { if (onNameClick) onNameClick(rp.ownerName || rp.matchedVia); }, 100); }}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 cursor-pointer transition-colors border border-transparent hover:border-indigo-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{rp.address}</p>
                        <p className="text-[11px] text-slate-500">{rp.borough} · {rp.ownerName}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-2 flex-shrink-0 text-right">
                        <div>
                          <p className="text-sm font-bold text-indigo-700">{rp.units}</p>
                          <p className="text-[9px] text-slate-400">units</p>
                        </div>
                        <div><p className="text-xs text-slate-600">{rp.floors}fl</p></div>
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{rp.matchedVia?.split(" ")[0]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                  Total: <span className="font-bold text-slate-900">{relatedProperties.reduce((s: number, p: any) => s + p.units, 0).toLocaleString()} units</span> across <span className="font-bold text-slate-900">{relatedProperties.length} properties</span> · Est. value: <span className="font-bold text-slate-900">{"$" + Math.round(relatedProperties.reduce((s: number, p: any) => s + p.assessedValue, 0)).toLocaleString()}</span>
                </div>
              </>
            ) : relatedDone ? (
              <p className="text-xs text-slate-400 py-2">No related properties found — this owner appears to have a single-property portfolio.</p>
            ) : null}
          </Section>

          {/* ============================================================ */}
          {/* COMPARABLE SALES — Enhanced with Valuation */}
          {/* ============================================================ */}
          <Section id="comps" title="Comparable Sales" icon="📊"
            badge={
              <>
                {compResult && compResult.comps.length > 0 && (
                  <span className="text-xs text-slate-400">{compResult.comps.length} comps</span>
                )}
                {compResult && compResult.valuation.confidence !== "low" && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    compResult.valuation.confidence === "high" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {compResult.valuation.confidence === "high" ? "High" : "Medium"} Confidence
                  </span>
                )}
              </>
            }
            collapsed={isCollapsed("comps")} onToggle={() => toggle("comps")}>
            {enhancedCompsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
                Analyzing comparable sales...
              </div>
            ) : compResult && compResult.comps.length > 0 ? (
              <>
                {/* Valuation Summary Card */}
                {compResult.valuation.estimatedValue > 0 && (
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
                        <p className="text-lg font-black text-blue-900">{compResult.valuation.pricePerSqft ? `$${compResult.valuation.pricePerSqft.toLocaleString()}` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-blue-500 uppercase font-medium">Confidence</p>
                        <p className={`text-lg font-black ${
                          compResult.valuation.confidence === "high" ? "text-emerald-700" : compResult.valuation.confidence === "medium" ? "text-amber-700" : "text-red-600"
                        }`}>
                          {compResult.valuation.confidenceScore}/100
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-blue-600">{compResult.valuation.methodology}</p>

                    {/* Appreciation comparison */}
                    {compResult.subject.lastSalePrice && compResult.subject.lastSalePrice > 0 && compResult.valuation.estimatedValue > 0 && (
                      <div className="mt-2 pt-2 border-t border-blue-200 flex items-center gap-4">
                        <p className="text-xs text-slate-600">
                          Last sold for {fmtPrice(compResult.subject.lastSalePrice)}
                          {compResult.subject.lastSaleDate && ` in ${new Date(compResult.subject.lastSaleDate).getFullYear()}`}
                        </p>
                        {(() => {
                          const pctChange = Math.round(((compResult.valuation.estimatedValue - compResult.subject.lastSalePrice!) / compResult.subject.lastSalePrice!) * 100);
                          return (
                            <span className={`text-xs font-bold ${pctChange >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {pctChange >= 0 ? "+" : ""}{pctChange}% est. appreciation
                            </span>
                          );
                        })()}
                      </div>
                    )}

                    {/* Assessed value comparison */}
                    {compResult.subject.assessedValue && compResult.subject.assessedValue > 0 && compResult.valuation.estimatedValue > 0 && (
                      <p className="text-xs text-slate-500 mt-1">
                        Assessed at {fmtPrice(compResult.subject.assessedValue)} — comp estimate is {Math.round((compResult.valuation.estimatedValue / compResult.subject.assessedValue - 1) * 100)}% {compResult.valuation.estimatedValue > compResult.subject.assessedValue ? "above" : "below"} assessment
                      </p>
                    )}
                  </div>
                )}

                {/* Summary cards (quick stats) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Comps Found</p>
                    <p className="text-lg font-bold text-blue-800">{compResult.comps.length}</p>
                    <p className="text-[10px] text-blue-400">{compResult.searchParams.totalCandidates} candidates</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Avg $/Unit</p>
                    <p className="text-lg font-bold text-blue-800">{fmtPrice(compResult.valuation.pricePerUnit)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Avg Similarity</p>
                    <p className="text-lg font-bold text-blue-800">
                      {Math.round(compResult.comps.reduce((s, c) => s + c.similarityScore, 0) / compResult.comps.length)}/100
                    </p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-blue-500 uppercase font-medium">Avg $/SqFt</p>
                    <p className="text-lg font-bold text-blue-800">{compResult.valuation.pricePerSqft ? `$${compResult.valuation.pricePerSqft.toLocaleString()}` : "—"}</p>
                  </div>
                </div>

                {/* Adjust Search controls */}
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <label className="text-[10px] text-slate-500 flex items-center gap-1">
                    Radius:
                    <select value={enhancedRadius} onChange={e => setEnhancedRadius(parseFloat(e.target.value))} className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white">
                      <option value="0.25">0.25 mi</option>
                      <option value="0.5">0.5 mi</option>
                      <option value="1">1 mi</option>
                      <option value="2">2 mi</option>
                    </select>
                  </label>
                  <label className="text-[10px] text-slate-500 flex items-center gap-1">
                    Period:
                    <select value={enhancedMaxDays} onChange={e => setEnhancedMaxDays(parseInt(e.target.value))} className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white">
                      <option value="180">6 mo</option>
                      <option value="365">1 yr</option>
                      <option value="730">2 yr</option>
                      <option value="1825">5 yr</option>
                    </select>
                  </label>
                  <button onClick={refreshEnhancedComps} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Search
                  </button>
                </div>

                {/* Comps table with similarity scores */}
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
                      {compResult.comps.map((c, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-700 max-w-[200px] truncate" title={c.address}>{c.address}</td>
                          <td className="text-center px-2 py-1.5">{c.units}</td>
                          <td className="text-right px-3 py-1.5 font-medium">{fmtPrice(c.salePrice)}</td>
                          <td className="text-right px-2 py-1.5">{c.pricePerUnit > 0 ? fmtPrice(c.pricePerUnit) : "—"}</td>
                          <td className="text-right px-2 py-1.5 text-slate-500">{c.pricePerSqft ? `$${c.pricePerSqft}` : "—"}</td>
                          <td className="text-center px-2 py-1.5 text-slate-500">
                            {c.saleDate ? new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(new Date(c.saleDate)) : "—"}
                          </td>
                          <td className="text-center px-2 py-1.5 text-slate-400">{c.distanceMiles} mi</td>
                          <td className="text-center px-2 py-1.5">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              c.similarityScore >= 70 ? "bg-emerald-100 text-emerald-700" :
                              c.similarityScore >= 45 ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>
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
                {(data?.pluto?.unitsTot || data?.pluto?.unitsRes || 0) >= 2
                  ? "No comparable sales found. Try expanding the search radius or time period."
                  : "Comparable sales analysis is available for buildings with 2+ units."}
              </p>
            )}
          </Section>

          {/* ============================================================ */}
          {/* MARKET TRENDS — FHFA Appreciation + Redfin Metrics */}
          {/* ============================================================ */}
          {(marketAppreciation || redfinMetrics) && (
          <Section id="market-trends" title="Market Trends" icon="📈"
            collapsed={isCollapsed("market-trends")} onToggle={() => toggle("market-trends")}
            badge={
              <>
                {displayZip && <span className="text-xs text-slate-400">ZIP {displayZip}</span>}
                {marketTemp && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    marketTemp.temperature === "hot" ? "bg-red-100 text-red-700" :
                    marketTemp.temperature === "warm" ? "bg-amber-100 text-amber-700" :
                    marketTemp.temperature === "cool" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>{marketTemp.label}</span>
                )}
              </>
            }>
            {/* Price Appreciation */}
            {marketAppreciation && (
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Price Appreciation</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Local (ACRIS) */}
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">This Zip ({marketAppreciation.zip})</p>
                    {marketAppreciation.localAppreciation1Yr !== null ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <span className={`text-sm font-bold ${marketAppreciation.localAppreciation1Yr >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                            {marketAppreciation.localAppreciation1Yr >= 0 ? "+" : ""}{marketAppreciation.localAppreciation1Yr}%
                          </span>
                          <span className="text-[10px] text-slate-400">/ 1yr</span>
                        </div>
                        {marketAppreciation.localAppreciation5Yr !== null && (
                          <div className="flex items-center gap-1">
                            <span className={`text-xs font-medium ${marketAppreciation.localAppreciation5Yr >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {marketAppreciation.localAppreciation5Yr >= 0 ? "+" : ""}{marketAppreciation.localAppreciation5Yr}%
                            </span>
                            <span className="text-[10px] text-slate-400">/ 5yr</span>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400">{marketAppreciation.sampleSize} sales (ACRIS)</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No local data</p>
                    )}
                  </div>
                  {/* Metro (FHFA) */}
                  <div>
                    <p className="text-[10px] text-slate-400 mb-1">{marketAppreciation.metroName}</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span className={`text-sm font-bold ${marketAppreciation.metroAppreciation1Yr >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {marketAppreciation.metroAppreciation1Yr >= 0 ? "+" : ""}{marketAppreciation.metroAppreciation1Yr}%
                        </span>
                        <span className="text-[10px] text-slate-400">/ 1yr</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-medium ${marketAppreciation.metroAppreciation5Yr >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {marketAppreciation.metroAppreciation5Yr >= 0 ? "+" : ""}{marketAppreciation.metroAppreciation5Yr}%
                        </span>
                        <span className="text-[10px] text-slate-400">/ 5yr</span>
                      </div>
                      <p className="text-[10px] text-slate-400">FHFA HPI ({marketAppreciation.fhfaQuarter})</p>
                    </div>
                  </div>
                </div>
                {/* Outperformance indicator */}
                {marketAppreciation.localAppreciation1Yr !== null && (
                  <div className={`mt-2 text-xs font-medium ${
                    marketAppreciation.localAppreciation1Yr > marketAppreciation.metroAppreciation1Yr ? "text-emerald-600" : "text-amber-600"
                  }`}>
                    {marketAppreciation.localAppreciation1Yr > marketAppreciation.metroAppreciation1Yr
                      ? `Outperforming metro by ${(marketAppreciation.localAppreciation1Yr - marketAppreciation.metroAppreciation1Yr).toFixed(1)}%`
                      : `Underperforming metro by ${(marketAppreciation.metroAppreciation1Yr - marketAppreciation.localAppreciation1Yr).toFixed(1)}%`
                    }
                  </div>
                )}
                {marketAppreciation.medianPricePerUnit && (
                  <p className="text-xs text-slate-500 mt-1">Median $/unit: ${marketAppreciation.medianPricePerUnit.toLocaleString()}</p>
                )}
              </div>
            )}

            {/* Market Temperature (Redfin) */}
            {redfinMetrics && (
              <div className="bg-slate-50 rounded-lg p-3 mt-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Market Temperature ({redfinMetrics.period})</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Days on Market</p>
                    <p className="text-sm font-bold text-slate-900">{redfinMetrics.medianDaysOnMarket}</p>
                  </div>
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Sale-to-List</p>
                    <p className="text-sm font-bold text-slate-900">{(redfinMetrics.avgSaleToListRatio * 100).toFixed(0)}%</p>
                  </div>
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Price Drops</p>
                    <p className="text-sm font-bold text-slate-900">{redfinMetrics.pctPriceDrops}%</p>
                  </div>
                  <div className="text-center bg-white rounded-lg p-2">
                    <p className="text-[10px] text-slate-400">Supply</p>
                    <p className="text-sm font-bold text-slate-900">{redfinMetrics.monthsOfSupply} mo</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-500">Median Sale: ${redfinMetrics.medianSalePrice.toLocaleString()} | ${redfinMetrics.medianPricePerSqft}/sqft</p>
                  <p className="text-[10px] text-slate-400">Redfin</p>
                </div>
              </div>
            )}

            {/* Trend Summary */}
            {marketAppreciation && (
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  marketAppreciation.trend === "appreciating" ? "bg-emerald-100 text-emerald-700" :
                  marketAppreciation.trend === "declining" ? "bg-red-100 text-red-700" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {marketAppreciation.trend === "appreciating" ? "Appreciating" : marketAppreciation.trend === "declining" ? "Declining" : "Stable"}
                </span>
                {marketTemp && redfinMetrics && (
                  <span className="text-[10px] text-slate-400">
                    {redfinMetrics.inventoryCount} active listings | {redfinMetrics.monthsOfSupply} mo supply
                  </span>
                )}
              </div>
            )}
          </Section>
          )}

          {/* ============================================================ */}
          {/* 8. DOB JOB FILINGS (Permits) */}
          {/* ============================================================ */}
          <Section id="permits" title="DOB Job Filings" icon="📋"
            badge={<span className="text-xs text-slate-400">{data?.permits?.length || 0} permits</span>}
            collapsed={isCollapsed("permits")} onToggle={() => toggle("permits")}>
            {data?.permits?.length > 0 ? (
              <div className="space-y-2">
                {data.permits.map((permit: any, i: number) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {permit.workType || permit.permitType || "Permit"}
                        </span>
                        {permit.jobNumber && <span className="text-xs text-slate-400">Job #{permit.jobNumber}</span>}
                      </div>
                      <span className="text-xs text-slate-400">{fmtDate(permit.issuanceDate || permit.filingDate)}</span>
                    </div>
                    {permit.jobDescription && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{permit.jobDescription}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      {permit.estimatedCost && <span>Est. cost: {permit.estimatedCost}</span>}
                      {permit.ownerName && <span>Owner: {permit.ownerName}</span>}
                      {permit.ownerBusiness && <span>{permit.ownerBusiness}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">No DOB permits found.</p>}
          </Section>

          {/* ============================================================ */}
          {/* 9. LITIGATION */}
          {/* ============================================================ */}
          <Section id="litigation" title="HPD Litigation" icon="⚖️"
            badge={
              <>
                <span className="text-xs text-slate-400">{data?.litigationSummary?.total || 0} cases</span>
                {data?.litigationSummary?.open > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{data.litigationSummary.open} open</span>}
              </>
            }
            collapsed={isCollapsed("litigation")} onToggle={() => toggle("litigation")}>
            {data?.litigation?.length > 0 ? (
              <div className="space-y-2">
                {data.litigation.map((l: any, i: number) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={"text-xs font-bold px-1.5 py-0.5 rounded " + (
                          l.caseStatus === "OPEN" || l.caseStatus === "Open" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                        )}>{l.caseStatus}</span>
                        <span className="text-xs font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{l.caseType}</span>
                      </div>
                      <span className="text-xs text-slate-400">{fmtDate(l.caseOpenDate)}</span>
                    </div>
                    {l.respondent && <p className="text-xs text-slate-600 mt-1">Respondent: {l.respondent}</p>}
                    {l.findingOfHarassment === "YES" && (
                      <p className="text-xs text-red-600 font-semibold mt-1">Finding of Harassment</p>
                    )}
                    {l.penalty && <p className="text-xs text-slate-500 mt-0.5">Penalty: {l.penalty}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">No HPD litigation found.</p>}
          </Section>

          {/* ============================================================ */}
          {/* 10. HPD VIOLATIONS */}
          {/* ============================================================ */}
          <Section id="hpd-violations" title="HPD Violations" icon="🚨"
            badge={
              <>
                <span className="text-xs text-slate-400">{data?.violationSummary?.total || 0} total</span>
                {data?.violationSummary?.open > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{data.violationSummary.open} open</span>}
                {data?.violationSummary?.classC > 0 && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{data.violationSummary.classC} Class C</span>}
              </>
            }
            collapsed={isCollapsed("hpd-violations")} onToggle={() => toggle("hpd-violations")}>
            {data?.violations?.length > 0 ? (
              <>
                <div className="flex items-center gap-4 mb-4 text-xs">
                  <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-medium">{data.violationSummary.open} Open</span>
                  <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded font-medium">{data.violationSummary.classC} Class C</span>
                  <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">{data.violationSummary.classB} Class B</span>
                  <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">{data.violationSummary.classA} Class A</span>
                </div>
                <div className="space-y-2">
                  {data.violations.slice(0, 30).map((v: any, i: number) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={"text-xs font-bold px-1.5 py-0.5 rounded " + (
                          v.class === "C" ? "bg-orange-100 text-orange-800" :
                          v.class === "B" ? "bg-amber-100 text-amber-800" :
                          "bg-slate-100 text-slate-600"
                        )}>Class {v.class}</span>
                        <span className={"text-xs px-1.5 py-0.5 rounded " + (
                          v.currentStatus?.includes("OPEN") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                        )}>{v.currentStatus || v.status}</span>
                        <span className="text-xs text-slate-400 ml-auto">{fmtDate(v.inspectionDate)}</span>
                      </div>
                      {v.novDescription && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{v.novDescription}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-slate-400">No HPD violations found.</p>}
          </Section>

          {/* ============================================================ */}
          {/* 11. ECB/OATH VIOLATIONS */}
          {/* ============================================================ */}
          <Section id="ecb" title="ECB/OATH Violations" icon="⚠️"
            badge={
              <>
                <span className="text-xs text-slate-400">{data?.ecbSummary?.total || 0} total</span>
                {data?.ecbSummary?.totalPenalty > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{"$" + Math.round(data.ecbSummary.totalPenalty).toLocaleString() + " owed"}</span>}
              </>
            }
            collapsed={isCollapsed("ecb")} onToggle={() => toggle("ecb")}>
            {data?.ecbViolations?.length > 0 ? (
              <>
                {data.ecbSummary.totalPenalty > 0 && (
                  <div className="mb-4 bg-red-50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs text-red-700 font-semibold">Total Penalty Balance Due</span>
                    <span className="text-base font-bold text-red-800">{"$" + Math.round(data.ecbSummary.totalPenalty).toLocaleString()}</span>
                  </div>
                )}
                <div className="space-y-2">
                  {data.ecbViolations.map((e: any, i: number) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={"text-xs font-bold px-1.5 py-0.5 rounded " + (
                            e.status === "ACTIVE" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                          )}>{e.status || "ACTIVE"}</span>
                          {e.severity && <span className="text-xs text-slate-500">{e.severity}</span>}
                        </div>
                        <span className="text-xs text-slate-400">{fmtDate(e.issuedDate)}</span>
                      </div>
                      {e.infraction && <p className="text-xs text-slate-600 mt-1">{e.infraction}</p>}
                      <div className="flex gap-3 mt-1 text-xs text-slate-500">
                        {e.penaltyApplied > 0 && <span>{"Penalty: $" + Math.round(e.penaltyApplied).toLocaleString()}</span>}
                        {e.penaltyBalance > 0 && <span className="text-red-600 font-medium">{"Balance: $" + Math.round(e.penaltyBalance).toLocaleString()}</span>}
                        {e.respondent && <span>Respondent: {e.respondent}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-slate-400">No ECB violations found.</p>}
          </Section>

          {/* ============================================================ */}
          {/* 12. COMPLAINTS */}
          {/* ============================================================ */}
          <Section id="complaints" title="311 Complaints" icon="📢"
            badge={
              <>
                <span className="text-xs text-slate-400">{data?.complaintSummary?.total || 0} total</span>
                {data?.complaintSummary?.recent > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{data.complaintSummary.recent} recent</span>}
              </>
            }
            collapsed={isCollapsed("complaints")} onToggle={() => toggle("complaints")}>
            {/* Top complaint types */}
            {data?.complaintSummary?.topTypes?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-2">Top Complaint Types</p>
                <div className="flex flex-wrap gap-2">
                  {data.complaintSummary.topTypes.map((t: any, i: number) => (
                    <span key={i} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full font-medium">
                      {t.type} ({t.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {data?.complaints?.length > 0 ? (
              <div className="space-y-2">
                {data.complaints.slice(0, 30).map((c: any, i: number) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                          {c.type || "Unknown"}
                        </span>
                        {c.minorCategory && (
                          <span className="text-xs text-slate-500">{c.minorCategory}</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{fmtDate(c.receivedDate)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className={"px-1.5 py-0.5 rounded " + (
                        c.status === "Close" || c.status === "2" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                      )}>{c.status === "2" ? "Closed" : c.status === "1" ? "Open" : c.status}</span>
                      {c.apartment && <span>Apt: {c.apartment}</span>}
                      {c.statusDescription && <span>{c.statusDescription}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-400">No complaints found.</p>}
          </Section>

          {/* ============================================================ */}
          {/* DATA QUALITY DASHBOARD */}
          {/* ============================================================ */}
          {intel && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">📊</span>
                <h4 className="text-xs font-bold text-slate-700">Data Quality Dashboard</h4>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {intel.dataSources.map((source, i) => (
                  <span key={i} className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    {source}
                    {intel.dataFreshness[source] && (
                      <span className="text-slate-400 ml-1">{intel.dataFreshness[source]}</span>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-4 text-[10px] text-slate-400">
                <span>Aggregated from {intel.dataSources.length} sources</span>
                <span>Overall confidence: {intel.overallConfidence}%</span>
                <span>Updated: {new Date(intel.lastUpdated).toLocaleTimeString()}</span>
              </div>
              {/* Missing data indicators */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {!intel.energy && (intel.property.grossSqft?.value || 0) < 50000 && (
                  <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">No LL84 data (building &lt; 50K sqft)</span>
                )}
                {!intel.energy && (intel.property.grossSqft?.value || 0) >= 50000 && (
                  <span className="text-[10px] bg-amber-50 text-amber-500 px-2 py-0.5 rounded-full">Missing LL84 data (should be reporting)</span>
                )}
                {intel.compliance.rpieStatus === "unknown" && (
                  <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">No RPIE data</span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* SMS Compose Modal */}
      {smsTarget && (
        <SmsComposeModal
          to={smsTarget.phone}
          contactName={smsTarget.name}
          address={address}
          onClose={() => setSmsTarget(null)}
        />
      )}
    </div>
  );
}
