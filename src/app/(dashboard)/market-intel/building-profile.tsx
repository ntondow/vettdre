"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchRelatedProperties, createContactFromBuilding, fetchBuildingComps } from "./building-profile-actions";
import type { RPIERecord, LL84Data, LL97Risk, LL84UtilityEstimate } from "./building-profile-actions";
import { fetchBuildingIntelligence, fetchBuildingCritical, fetchBuildingStandard, fetchBuildingBackground, findOwnerPortfolio } from "@/lib/data-fusion-engine";
import type { BuildingIntelligence } from "@/lib/data-fusion-types";
import { skipTrace } from "./tracerfy";
import { getNeighborhoodNameByZip } from "@/lib/neighborhoods";
import { underwriteDeal } from "@/app/(dashboard)/deals/actions";
import type { CompSale, CompSummary, CompResult } from "@/lib/comps-engine";
import { fetchCompsWithValuation } from "./comps-actions";
import type { MarketAppreciation } from "@/lib/fhfa";
import type { RedfinMetrics, MarketTemperature } from "@/lib/redfin-market";
import FeatureGate from "@/components/ui/feature-gate";
import UpgradePrompt from "@/components/ui/upgrade-prompt";
import { hasPermission } from "@/lib/feature-gate";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { Users, TrendingUp } from "lucide-react";
import SmsComposeModal from "@/components/ui/sms-compose-modal";
import { fetchNeighborhoodProfile } from "./neighborhood-actions";
import type { NeighborhoodProfile } from "./neighborhood-actions";
import BuildingProfileSkeleton from "./building-profile-skeleton";
import { getOwnershipIntelligence } from "./ownership-actions";
import type { OwnershipChain, DeepEntityResult, PortfolioDiscovery } from "./ownership-actions";
import { isEntityName } from "@/lib/entity-resolver";
import { enrichBuildingContacts } from "./contact-actions";
import type { EnrichmentResult } from "@/lib/contact-enrichment-pipeline";
import { calculateMotivationFromIntel } from "./motivation-actions";
import type { MotivationScore } from "@/lib/motivation-engine";
import { getVitalityScore } from "./vitality-actions";
import type { VitalityScore } from "@/lib/vitality-engine";
import { getStreetViewUrls, type StreetViewData } from "./street-intel-actions";
import { assembleBovData } from "./bov-actions";
// BOV PDF loaded dynamically on demand to reduce bundle size
const loadBovPdf = () => import("@/lib/bov-pdf");
// Tab shell components
import ProfileHeader from "./components/building-profile/profile-header";
import ProfileTabs from "./components/building-profile/profile-tabs";
import type { ProfileTab } from "./components/building-profile/profile-tabs";
import TabOverview from "./components/building-profile/tab-overview";
import TabOwnership from "./components/building-profile/tab-ownership";
import TabFinancials from "./components/building-profile/tab-financials";
import TabCondition from "./components/building-profile/tab-condition";
import TabMarket from "./components/building-profile/tab-market";

export interface PlutoDataProp {
  address: string; ownerName: string; unitsRes: number; unitsTot: number;
  yearBuilt: number; numFloors: number; bldgArea: number; lotArea: number;
  assessTotal: number; bldgClass: string; zoneDist: string; borough: string;
  zip: string; lat: number; lng: number;
}

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
  onPrimaryPhoneChange?: (phone: string | null) => void;
  plutoData?: PlutoDataProp;
}

export default function BuildingProfile({ boroCode, block, lot, address, borough, ownerName, onClose, onNameClick, connectedVia, onPrimaryPhoneChange, plutoData: plutoDataProp }: Props) {
  const router = useRouter();
  const { plan } = useUserPlan();
  useEffect(() => { router.prefetch("/deals/new"); }, [router]);

  // If plutoData prop provided, seed initial data for instant PLUTO section render
  const initialData = plutoDataProp ? {
    pluto: {
      address: plutoDataProp.address || "", ownerName: plutoDataProp.ownerName || "",
      unitsres: String(plutoDataProp.unitsRes ?? 0), unitstotal: String(plutoDataProp.unitsTot ?? 0),
      unitsRes: plutoDataProp.unitsRes || 0, unitsTot: plutoDataProp.unitsTot || 0,
      yearBuilt: plutoDataProp.yearBuilt || 0, numFloors: plutoDataProp.numFloors || 0,
      bldgArea: plutoDataProp.bldgArea || 0, lotArea: plutoDataProp.lotArea || 0,
      assessTotal: plutoDataProp.assessTotal || 0, bldgClass: plutoDataProp.bldgClass || "",
      zoneDist: plutoDataProp.zoneDist || "", borough: plutoDataProp.borough || "",
      zipCode: plutoDataProp.zip || "", latitude: String(plutoDataProp.lat ?? 0), longitude: String(plutoDataProp.lng ?? 0),
      boroCode, block, lot,
    },
  } : null;

  const [data, setData] = useState<any>(initialData);
  const [intel, setIntel] = useState<BuildingIntelligence | null>(null);
  const [loading, setLoading] = useState(!plutoDataProp);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [relatedProperties, setRelatedProperties] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [relatedDone, setRelatedDone] = useState(false);
  const [ownerPortfolio, setOwnerPortfolio] = useState<{ bbl: string; address: string; units: number; borough: string; assessedValue: number }[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  // Deep ownership intelligence
  const [ownershipChain, setOwnershipChain] = useState<OwnershipChain | null>(null);
  const [entityIntel, setEntityIntel] = useState<DeepEntityResult | null>(null);
  const [portfolioDiscovery, setPortfolioDiscovery] = useState<PortfolioDiscovery | null>(null);
  const [ownershipDeepLoading, setOwnershipDeepLoading] = useState(false);
  // Contact enrichment pipeline
  const [contactEnrichment, setContactEnrichment] = useState<EnrichmentResult | null>(null);
  const [contactEnrichmentLoading, setContactEnrichmentLoading] = useState(false);
  const [skipTraceResult, setSkipTraceResult] = useState<any>(null);
  const [skipTracing, setSkipTracing] = useState(false);
  const [addingToCRM, setAddingToCRM] = useState(false);
  const [crmResult, setCrmResult] = useState<{ contactId: string; enriched: boolean } | null>(null);
  const [underwriting, setUnderwriting] = useState(false);
  const [bovGenerating, setBovGenerating] = useState(false);
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
  const censusAttempted = useRef(false);
  // HUD Fair Market Rents
  const [hudFmr, setHudFmr] = useState<import("@/lib/hud").HudFmrData | null>(null);
  // Market Trends (FHFA + Redfin)
  const [marketAppreciation, setMarketAppreciation] = useState<MarketAppreciation | null>(null);
  const [redfinMetrics, setRedfinMetrics] = useState<RedfinMetrics | null>(null);
  const [marketTemp, setMarketTemp] = useState<{ temperature: MarketTemperature; label: string } | null>(null);
  // Fannie Mae Loan Lookup
  const [fannieLoan, setFannieLoan] = useState<import("@/lib/fannie-mae").FannieLoanResult | null>(null);
  // Renovation Estimate
  const [renoEstimate, setRenoEstimate] = useState<import("@/lib/renovation-engine").RenovationEstimate | null>(null);
  const [renoLoading, setRenoLoading] = useState(false);
  // STR (Airbnb) Projection
  const [strProjection, setStrProjection] = useState<import("@/lib/airbnb-market").STRProjection | null>(null);
  const [strLoading, setStrLoading] = useState(false);
  // PDF Export
  const [pdfExporting, setPdfExporting] = useState(false);
  // Motivation Score
  const [motivationScore, setMotivationScore] = useState<MotivationScore | null>(null);
  const [motivationLoading, setMotivationLoading] = useState(false);
  // Neighborhood Vitality
  const [vitalityScore, setVitalityScore] = useState<VitalityScore | null>(null);
  // Street View
  const [streetView, setStreetView] = useState<StreetViewData | null>(null);
  const [streetViewLoading, setStreetViewLoading] = useState(false);

  const [smsTarget, setSmsTarget] = useState<{ phone: string; name?: string } | null>(null);
  const [primaryPhone, setPrimaryPhone] = useState<string | null>(null);
  // Tab state
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  // ============================================================
  // PROGRESSIVE DATA FETCH — Phased Loading
  // Phase 1 (Critical): PLUTO, HPD Violations, HPD Registrations + Contacts → loading=false
  // Phase 2 (Standard): DOB Permits, Complaints, Litigation, ECB, DOB Filings, Sales → merge
  // Phase 3 (Background): LL84 Energy, RPIE, Rent Stabilization, Speculation → merge
  // Full Intel: fetchBuildingIntelligence → entity resolution, scoring, enrichments
  // All 4 run in parallel. Cache layer deduplicates network calls.
  // ============================================================
  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");

    // Launch all phases + full intelligence in parallel
    const criticalP = fetchBuildingCritical(bbl).catch(err => { console.error("Phase 1 error:", err); return null; });
    const standardP = fetchBuildingStandard(bbl).catch(err => { console.error("Phase 2 error:", err); return null; });
    const backgroundP = fetchBuildingBackground(bbl).catch(err => { console.error("Phase 3 error:", err); return null; });
    const intelP = fetchBuildingIntelligence(bbl).catch(err => { console.error("Fusion engine error:", err); return null; });

    // Phase 1 resolves → loading=false, critical sections render
    criticalP.then(result => {
      if (result) {
        setData((prev: any) => ({ ...(prev || {}), ...result }));
      }
      setLoading(false);
    });

    // Phase 2 resolves → merge standard data (permits, complaints, litigation, ECB, filings, sales)
    standardP.then(result => {
      if (result) {
        setData((prev: any) => ({ ...(prev || {}), ...result }));
      }
    });

    // Phase 3 resolves → merge background data (energy, rent stab, speculation, RPIE)
    backgroundP.then(result => {
      if (result) {
        setData((prev: any) => ({ ...(prev || {}), ...result }));
      }
    });

    // Full intelligence resolves → set intel + overlay enrichments into data
    intelP.then(intelResult => {
      if (intelResult) {
        setIntel(intelResult);
        // Populate RPIE/LL84 from fusion engine
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
        // Overlay enrichments and scores into data
        setData((prev: any) => ({
          ...(prev || {}),
          neighborhoodData: intelResult.raw.neighborhoodData,
          pdlEnrichment: intelResult.raw.pdlEnrichment,
          apolloEnrichment: intelResult.raw.apolloEnrichment,
          apolloOrgEnrichment: intelResult.raw.apolloOrgEnrichment,
          apolloKeyPeople: intelResult.raw.apolloKeyPeople,
          leadVerification: intelResult.raw.leadVerification,
          rankedContacts: intelResult.raw.rankedContacts,
          ownerContacts: intelResult.raw.ownerContacts,
          phoneRankings: intelResult.raw.phoneRankings,
          corporateIntel: intelResult.raw.corporateIntel || intelResult.corporateIntel,
          distressScore: intelResult.distressSignals.score,
          distressSignals: intelResult.distressSignals.signals.map(s => s.description),
        }));
      }

      // If nothing loaded at all after all phases, show error
      setData((prev: any) => {
        if (!prev || Object.keys(prev).length === 0) {
          setFetchError("Failed to load building profile. The NYC data APIs may be slow or unavailable.");
        }
        return prev;
      });
    });
  }, [boroCode, block, lot]);

  // Batched secondary data: Census, HUD FMR, Vitality, Street View — all trigger on pluto address
  useEffect(() => {
    if (!data?.pluto?.address) return;
    const zip = data.pluto.zipCode || data?.registrations?.[0]?.zip;
    const lat = parseFloat(data.pluto.latitude || "0");
    const lng = parseFloat(data.pluto.longitude || "0");
    const addr = address || data.pluto.address;
    const boro = data.pluto.borough || borough || "";

    setCensusLoading(true);
    setStreetViewLoading(true);
    censusAttempted.current = true;
    Promise.allSettled([
      fetchNeighborhoodProfile(`${addr}, ${boro}, NY`, { includeTrends: true }),
      zip ? import("@/lib/hud-actions").then(m => m.getHudFmr(zip)) : Promise.resolve(null),
      zip ? getVitalityScore(zip) : Promise.resolve(null),
      lat && lng && addr ? getStreetViewUrls(addr, lat, lng) : Promise.resolve(null),
    ]).then(([censusR, hudR, vitalityR, svR]) => {
      if (censusR.status === "fulfilled" && censusR.value) setCensusProfile(censusR.value);
      if (hudR.status === "fulfilled" && hudR.value) setHudFmr(hudR.value);
      if (vitalityR.status === "fulfilled" && vitalityR.value) setVitalityScore(vitalityR.value);
      if (svR.status === "fulfilled" && svR.value) setStreetView(svR.value);
    }).finally(() => {
      setCensusLoading(false);
      setStreetViewLoading(false);
    });
  }, [data?.pluto?.address, data?.pluto?.borough, data?.pluto?.zipCode, data?.pluto?.latitude, data?.pluto?.longitude, borough, address]);

  // Sync Market Trends from fusion engine (replaces duplicate FHFA/Redfin fetch)
  useEffect(() => {
    if (!intel?.marketTrends) return;
    setMarketAppreciation({
      zip: data?.pluto?.zipCode || "",
      localAppreciation1Yr: intel.marketTrends.localAppreciation1Yr,
      localAppreciation5Yr: null,
      metroAppreciation1Yr: intel.marketTrends.metroAppreciation1Yr,
      metroAppreciation5Yr: 0,
      medianPricePerUnit: null,
      sampleSize: 0,
      trend: intel.marketTrends.trend,
      metroName: "New York-Newark-Jersey City",
      fhfaQuarter: "",
    });
    if (intel.marketTrends.medianDaysOnMarket != null) {
      setRedfinMetrics({ medianDaysOnMarket: intel.marketTrends.medianDaysOnMarket } as RedfinMetrics);
    }
    if (intel.marketTrends.marketTemperature) {
      setMarketTemp({ temperature: intel.marketTrends.marketTemperature, label: intel.marketTrends.marketTemperature });
    }
  }, [intel?.marketTrends, data?.pluto?.zipCode]);

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

  // Compute motivation score from intel (no API call — pure sync scoring)
  useEffect(() => {
    if (!intel) return;
    if (motivationScore) return; // Already scored
    setMotivationLoading(true);
    calculateMotivationFromIntel(intel)
      .then(score => setMotivationScore(score))
      .catch(() => {})
      .finally(() => setMotivationLoading(false));
  }, [intel, motivationScore]);

  // Fetch renovation estimate when building data is loaded (full breakdown needed by UI)
  useEffect(() => {
    if (!intel || !data?.pluto || renoEstimate) return;
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    const units = parseInt(data.pluto.unitsres || data.pluto.unitstotal || "0");
    if (units <= 0) return;
    setRenoLoading(true);
    import("./renovation-actions")
      .then(m => m.fetchRenovationEstimate(bbl))
      .then(est => { if (est) setRenoEstimate(est); })
      .catch(() => {})
      .finally(() => setRenoLoading(false));
  }, [intel, data?.pluto, boroCode, block, lot, renoEstimate]);

  // Fetch STR (Airbnb) income projection (full data needed by UI)
  useEffect(() => {
    if (!intel || !data?.pluto || strProjection) return;
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    const units = parseInt(data.pluto.unitsres || data.pluto.unitstotal || "0");
    if (units <= 0) return;
    setStrLoading(true);
    import("./str-actions")
      .then(m => m.fetchSTRProjection(bbl))
      .then(proj => { if (proj) setStrProjection(proj); })
      .catch(() => {})
      .finally(() => setStrLoading(false));
  }, [intel, data?.pluto, boroCode, block, lot, strProjection]);

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

  // Load owner portfolio via fusion engine (skip if deep ownership already loaded)
  useEffect(() => {
    if (!intel || !intel.ownership.likelyOwner.entityName) return;
    if (portfolioDiscovery) return;
    setPortfolioLoading(true);
    findOwnerPortfolio(intel.ownership.likelyOwner.entityName, intel.bbl)
      .then(setOwnerPortfolio)
      .catch(() => {})
      .finally(() => setPortfolioLoading(false));
  }, [intel, portfolioDiscovery]);

  // Deep ownership intelligence — auto-loads as background tier when intel arrives
  // ACRIS chain, NY DOS LLC piercing, and portfolio discovery use free public APIs
  const [deepOwnershipStarted, setDeepOwnershipStarted] = useState(false);

  useEffect(() => {
    if (deepOwnershipStarted) return;
    if (!intel) return;
    const ownerName = intel.ownership.likelyOwner.entityName || intel.ownership.registeredOwner;
    const llcName = intel.ownership.llcName || (isEntityName(ownerName) ? ownerName : undefined);
    if (!ownerName || ownerName.length < 3) return;
    setDeepOwnershipStarted(true);
    setOwnershipDeepLoading(true);
    getOwnershipIntelligence(intel.bbl, ownerName, llcName)
      .then(result => {
        if (result.chain) setOwnershipChain(result.chain);
        if (result.entityIntel) setEntityIntel(result.entityIntel);
        if (result.portfolio) {
          setPortfolioDiscovery(result.portfolio);
          setOwnerPortfolio(result.portfolio.properties.map(p => ({
            bbl: p.bbl, address: p.address, units: p.units, borough: p.borough, assessedValue: p.assessedValue,
          })));
        }
      })
      .catch(err => console.error("Ownership intelligence error:", err))
      .finally(() => setOwnershipDeepLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intel, deepOwnershipStarted]);

  // Manual re-trigger for deep ownership (if auto-load failed or user wants refresh)
  const loadDeepOwnership = useCallback(() => {
    if (!intel) return;
    const ownerName = intel.ownership.likelyOwner.entityName || intel.ownership.registeredOwner;
    const llcName = intel.ownership.llcName || (isEntityName(ownerName) ? ownerName : undefined);
    if (!ownerName || ownerName.length < 3) return;
    setOwnershipDeepLoading(true);
    getOwnershipIntelligence(intel.bbl, ownerName, llcName)
      .then(result => {
        if (result.chain) setOwnershipChain(result.chain);
        if (result.entityIntel) setEntityIntel(result.entityIntel);
        if (result.portfolio) {
          setPortfolioDiscovery(result.portfolio);
          setOwnerPortfolio(result.portfolio.properties.map(p => ({
            bbl: p.bbl, address: p.address, units: p.units, borough: p.borough, assessedValue: p.assessedValue,
          })));
        }
      })
      .catch(err => console.error("Ownership intelligence error:", err))
      .finally(() => setOwnershipDeepLoading(false));
  }, [intel]);

  // Contact enrichment pipeline — auto-triggers AFTER deep ownership completes
  useEffect(() => {
    if (!deepOwnershipStarted) return; // Wait for ownership to start loading
    if (!intel) return;
    if (contactEnrichment) return; // Already enriched
    const oName = intel.ownership.likelyOwner.entityName || intel.ownership.registeredOwner;
    if (!oName || oName.length < 3) return;

    // Wait for ownership deep loading to finish first so we can use pierced person name
    if (ownershipDeepLoading) return;

    setContactEnrichmentLoading(true);
    const bbl = intel.bbl;
    const piercedPerson = entityIntel?.ultimatePerson || undefined;
    const entity = intel.ownership.llcName || (isEntityName(oName) ? oName : undefined);
    const regAgent = entityIntel?.piercingChain?.find(s => s.relationship === "Registered Agent")?.toEntity;
    const regAgentAddr = entityIntel?.piercingChain?.find(s => s.relationship === "Registered Agent")?.address;
    const hpdContacts = data?.ownerContacts || data?.hpdContacts || [];
    const propertyAddr = data?.pluto?.address || "";
    const boro = data?.pluto?.borough || "";
    const piercingChain = entityIntel?.piercingChain?.map(s => ({
      fromEntity: s.fromEntity, toEntity: s.toEntity, relationship: s.relationship,
    }));

    enrichBuildingContacts(
      bbl, oName, piercedPerson, entity, regAgent, regAgentAddr,
      hpdContacts, propertyAddr, boro, piercingChain,
    )
      .then(result => {
        if (result.totalPhones > 0 || result.totalEmails > 0) {
          setContactEnrichment(result);
        }
      })
      .catch(err => console.error("Contact enrichment error:", err))
      .finally(() => setContactEnrichmentLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepOwnershipStarted, intel, ownershipDeepLoading, entityIntel]);

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

  // ============================================================
  // ACTION HANDLERS (extracted from inline JSX)
  // ============================================================

  const handleAddToCRM = async () => {
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
  };

  const handleUnderwrite = async () => {
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
  };

  const handleExportPDF = async () => {
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    setPdfExporting(true);
    try {
      const res = await fetch(`/api/report/${bbl}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        alert(err.error || "Failed to generate report");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VettdRE-Report-${displayAddr.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 60)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export error:", err);
    }
    setPdfExporting(false);
  };

  const handleGenerateBOV = async () => {
    const bblStr = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    setBovGenerating(true);
    try {
      const [payload, { generateBovPdfBlob, getBovFilename }] = await Promise.all([
        assembleBovData(bblStr),
        loadBovPdf(),
      ]);
      const blob = generateBovPdfBlob(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getBovFilename(payload);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("BOV generation error:", err);
    }
    setBovGenerating(false);
  };

  const handleManualModel = () => {
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    router.push(`/deals/new?address=${encodeURIComponent(displayAddr)}&borough=${encodeURIComponent(displayBorough)}&block=${encodeURIComponent(block)}&lot=${encodeURIComponent(lot)}&bbl=${encodeURIComponent(bbl)}&units=${data?.pluto?.unitsRes || ""}&assessed=${data?.pluto?.assessTotal || ""}`);
  };

  const handleRetry = () => {
    setFetchError(null);
    setLoading(true);
    const bbl = boroCode + block.padStart(5, "0") + lot.padStart(4, "0");
    fetchBuildingCritical(bbl)
      .then(r => { if (r) setData((prev: any) => ({ ...(prev || {}), ...r })); setLoading(false); })
      .catch(() => setLoading(false));
    fetchBuildingStandard(bbl)
      .then(r => { if (r) setData((prev: any) => ({ ...(prev || {}), ...r })); })
      .catch(() => {});
    fetchBuildingBackground(bbl)
      .then(r => { if (r) setData((prev: any) => ({ ...(prev || {}), ...r })); })
      .catch(() => {});
    fetchBuildingIntelligence(bbl)
      .then(r => {
        if (r) {
          setIntel(r);
          setData((prev: any) => ({
            ...(prev || {}),
            rankedContacts: r.raw.rankedContacts,
            ownerContacts: r.raw.ownerContacts,
            phoneRankings: r.raw.phoneRankings,
            corporateIntel: r.raw.corporateIntel || r.corporateIntel,
            distressScore: r.distressSignals.score,
            distressSignals: r.distressSignals.signals.map(s => s.description),
          }));
        } else {
          setData((prev: any) => {
            if (!prev || Object.keys(prev).length === 0) setFetchError("Failed to load building profile.");
            return prev;
          });
        }
      })
      .catch(() => {});
  };

  // ============================================================
  // JSX RETURN — Tab Shell Orchestrator
  // ============================================================

  return (
    <div className="flex flex-col h-full">
      {loading ? (
        <BuildingProfileSkeleton />
      ) : fetchError ? (
        <div className="text-center py-16">
          <p className="text-3xl mb-3">{"\u26A0\uFE0F"}</p>
          <p className="text-sm font-medium text-slate-700 mb-1">Could not load building profile</p>
          <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">{fetchError}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Sticky Header: address, stats, action buttons */}
          <ProfileHeader
            displayAddr={displayAddr}
            displayBorough={displayBorough}
            displayNeighborhood={displayNeighborhood}
            displayZip={displayZip}
            block={block}
            lot={lot}
            boroCode={boroCode}
            pluto={p}
            data={data}
            intel={intel}
            vitalityScore={vitalityScore}
            crmResult={crmResult}
            addingToCRM={addingToCRM}
            underwriting={underwriting}
            pdfExporting={pdfExporting}
            bovGenerating={bovGenerating}
            connectedVia={connectedVia}
            onClose={onClose}
            onNameClick={onNameClick}
            onAddToCRM={handleAddToCRM}
            onUnderwrite={handleUnderwrite}
            onExportPDF={handleExportPDF}
            onGenerateBOV={handleGenerateBOV}
            onManualModel={handleManualModel}
          />

          {/* Tab Bar */}
          <ProfileTabs
            active={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "ownership", label: "Ownership", loading: ownershipDeepLoading || contactEnrichmentLoading, locked: !hasPermission(plan, "deep_ownership") },
              { id: "financials", label: "Financials", loading: enhancedCompsLoading, locked: !hasPermission(plan, "cap_rate_analysis") },
              { id: "condition", label: "Condition", badge: data?.violationSummary?.open || null },
              { id: "market", label: "Market", loading: censusLoading },
            ]}
          />

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "overview" && (
              <TabOverview
                pluto={p}
                intel={intel}
                data={data}
                ownershipChain={ownershipChain}
                entityIntel={entityIntel}
                portfolioDiscovery={portfolioDiscovery}
                contactEnrichment={contactEnrichment}
                contactEnrichmentLoading={contactEnrichmentLoading}
                ownershipDeepLoading={ownershipDeepLoading}
                deepOwnershipStarted={deepOwnershipStarted}
                ownerPortfolio={ownerPortfolio}
                portfolioLoading={portfolioLoading}
                motivationScore={motivationScore}
                motivationLoading={motivationLoading}
                fannieLoan={fannieLoan}
                loading={!data}
                onLoadDeepAnalysis={loadDeepOwnership}
                onNameClick={onNameClick}
                onSmsClick={(phone, name) => setSmsTarget({ phone, name })}
                onPhoneResolved={(phone) => { setPrimaryPhone(phone); onPrimaryPhoneChange?.(phone); }}
                onDealClick={handleUnderwrite}
                onNavigateTab={(tab) => setActiveTab(tab as ProfileTab)}
              />
            )}

            {activeTab === "ownership" && (
              hasPermission(plan, "deep_ownership") ? (
                <TabOwnership
                  pluto={p}
                  intel={intel}
                  data={data}
                  ownershipChain={ownershipChain}
                  entityIntel={entityIntel}
                  portfolioDiscovery={portfolioDiscovery}
                  contactEnrichment={contactEnrichment}
                  contactEnrichmentLoading={contactEnrichmentLoading}
                  ownershipDeepLoading={ownershipDeepLoading}
                  deepOwnershipStarted={deepOwnershipStarted}
                  skipTraceResult={skipTraceResult}
                  skipTracing={skipTracing}
                  loading={!data}
                  onSkipTrace={handleSkipTrace}
                  onLoadDeepAnalysis={loadDeepOwnership}
                  onNameClick={onNameClick}
                  onSmsClick={(phone, name) => setSmsTarget({ phone, name })}
                />
              ) : (
                <UpgradePrompt
                  feature="deep_ownership"
                  variant="tab"
                  icon={Users}
                  title="Unlock Ownership Intelligence"
                  description="Access ACRIS deed history, corporate filings, LLC piercing, skip tracing, and full ownership chain analysis."
                />
              )
            )}

            {activeTab === "financials" && (
              hasPermission(plan, "cap_rate_analysis") ? (
                <TabFinancials
                  pluto={p}
                  intel={intel}
                  data={data}
                  borough={borough}
                  boroCode={boroCode}
                  block={block}
                  lot={lot}
                  address={address}
                  compResult={compResult}
                  enhancedCompsLoading={enhancedCompsLoading}
                  enhancedRadius={enhancedRadius}
                  enhancedMaxDays={enhancedMaxDays}
                  onRadiusChange={setEnhancedRadius}
                  onMaxDaysChange={setEnhancedMaxDays}
                  onRefreshComps={refreshEnhancedComps}
                  ll84Data={ll84Data}
                  ll84Utilities={ll84Utilities}
                  ll97Risk={ll97Risk}
                  rpieRecords={rpieRecords}
                  renoEstimate={renoEstimate}
                  renoLoading={renoLoading}
                  strProjection={strProjection}
                  strLoading={strLoading}
                  displayAddr={displayAddr}
                  displayBorough={displayBorough}
                />
              ) : (
                <UpgradePrompt
                  feature="cap_rate_analysis"
                  variant="tab"
                  icon={TrendingUp}
                  title="Unlock Financial Analysis"
                  description="Access comp sales, cap rate analysis, renovation estimates, STR projections, energy benchmarks, and expense modeling."
                />
              )
            )}

            {activeTab === "condition" && (
              <TabCondition
                data={data}
                intel={intel}
                rpieRecords={rpieRecords}
                loading={!data}
              />
            )}

            {activeTab === "market" && (
              <TabMarket
                pluto={p}
                intel={intel}
                data={data}
                address={address}
                borough={borough}
                displayAddr={displayAddr}
                displayBorough={displayBorough}
                displayZip={displayZip}
                censusProfile={censusProfile}
                censusLoading={censusLoading}
                censusAttempted={censusAttempted.current}
                hudFmr={hudFmr}
                marketAppreciation={marketAppreciation}
                redfinMetrics={redfinMetrics}
                marketTemp={marketTemp}
                relatedProperties={relatedProperties}
                loadingRelated={loadingRelated}
                relatedDone={relatedDone}
                onClose={onClose}
                onNameClick={onNameClick}
              />
            )}

            {/* Street View — overview tab only */}
            {activeTab === "overview" && streetView?.imageUrl && (
              <FeatureGate feature="street_view">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{"\uD83D\uDCF7"}</span>
                    <h3 className="text-sm font-bold text-slate-900">Street View</h3>
                  </div>
                  <div className="relative rounded-lg overflow-hidden bg-slate-100">
                    <img
                      src={streetView.imageUrl}
                      alt={`Street view of ${address || "property"}`}
                      className="w-full h-48 object-cover"
                      loading="lazy"
                    />
                  </div>
                  {streetView.fullUrl && (
                    <a
                      href={streetView.fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium mt-2"
                    >
                      Open in Google Street View &rarr;
                    </a>
                  )}
                </div>
              </FeatureGate>
            )}

            {/* Data Quality Dashboard — shared across tabs */}
            {intel && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{"\uD83D\uDCCA"}</span>
                  <h4 className="text-xs font-bold text-slate-700">Data Quality Dashboard</h4>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {intel.dataSources.map((source: string, i: number) => (
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

            {/* Last updated timestamp */}
            {intel && (
              <div className="text-center py-2 text-[10px] text-slate-400">
                Data refreshed {new Date().toLocaleTimeString()} {"\u00B7"} Cached sources may be up to 24h old
              </div>
            )}
          </div>
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
