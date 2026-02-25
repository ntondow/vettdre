"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { calculateAll, DEFAULT_INPUTS } from "@/lib/deal-calculator";
import type { DealInputs, UnitMixRow, DealOutputs, CustomLineItem, CommercialTenant, ExpenseLineMeta } from "@/lib/deal-calculator";
import { analyzeExpenses } from "@/lib/expense-analyzer";
import type { ExpenseFlag } from "@/lib/expense-analyzer";
import { saveDealAnalysis, fetchDealPrefillData, getDealAnalysis, searchContacts, getContact, getUserProfile, sendLoiEmail, fetchComps } from "../actions";
import { fetchLL84Data, calculateLL97Risk, estimateLL84Utilities } from "@/app/(dashboard)/market-intel/building-profile-actions";
import type { DealPrefillData } from "../actions";
import type { CompSale, CompSummary, CompValuation } from "@/lib/comps-engine";
import { generateDealPdf } from "@/lib/deal-pdf";
import { generateLoiPdf } from "@/lib/loi-pdf";
import { generateLoiDocx } from "@/lib/loi-docx";
import { generateLoiPlainText, getLoiCoverEmailSubject, getLoiCoverEmailHtml, LOI_DEFAULTS } from "@/lib/loi-template";
import type { LoiData } from "@/lib/loi-template";
import type { DealStructureType, DealInputsBase, StructuredDealInputs, DealAnalysis as StructureAnalysis } from "@/lib/deal-structure-engine";
import { STRUCTURE_LABELS, STRUCTURE_DESCRIPTIONS, calculateDealStructure, getDefaultStructureInputs, compareDealStructures } from "@/lib/deal-structure-engine";
import { ChevronDown, Banknote, Building2, ArrowRightLeft, KeyRound, Users, Info } from "lucide-react";
import { BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Cell, ReferenceLine } from "recharts";

// ============================================================
// Structure selector constants
// ============================================================
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

// ============================================================
// Collapsible Section
// ============================================================
function Section({ title, defaultOpen = true, summary, children }: { title: string; defaultOpen?: boolean; summary?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</span>
          {!open && summary && <span className="text-[10px] text-slate-600 truncate">{summary}</span>}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="p-4 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AI Sparkle indicator for assumed fields
// ============================================================
function Sparkle() {
  return (
    <span className="inline-block ml-1 text-amber-400" title="AI-generated assumption">
      <svg className="w-3 h-3 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" /></svg>
    </span>
  );
}

// ============================================================
// Input Field with optional AI sparkle + badge
// ============================================================
function Field({ label, value, onChange, prefix, suffix, type = "number", step, min, className, aiAssumed, onClearAi, badge }: {
  label: string; value: number | string; onChange: (v: number) => void;
  prefix?: string; suffix?: string; type?: string; step?: string; min?: string; className?: string;
  aiAssumed?: boolean; onClearAi?: () => void; badge?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">
        {label}
        {aiAssumed && <Sparkle />}
        {badge && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 normal-case tracking-normal">{badge}</span>}
      </label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={e => {
            onChange(parseFloat(e.target.value) || 0);
            if (onClearAi) onClearAi();
          }}
          step={step || "any"}
          min={min}
          className={`w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30 ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""} ${aiAssumed ? "bg-amber-500/10 border-amber-500/20" : ""}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Slider + Text Input Field
// ============================================================
function SliderField({ label, value, onChange, min = 0, max = 100, step = 1, suffix = "%", badge }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string; badge?: string;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1.5">
        {label}
        {badge && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 normal-case tracking-normal">{badge}</span>}
      </label>
      <div className="flex items-center gap-3">
        <div className="flex-1 relative h-6 flex items-center">
          <div className="absolute inset-x-0 h-1 bg-white/10 rounded-full" />
          <div className="absolute left-0 h-1 bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute w-4 h-4 bg-white rounded-full shadow-lg pointer-events-none"
            style={{ left: `calc(${pct}% - 8px)` }}
          />
        </div>
        <div className="relative w-20">
          <input
            type="number"
            value={value}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            step={step}
            min={min}
            max={max}
            className="w-full px-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-sm font-semibold text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30 pr-6"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{suffix}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Semi-circular gauge for KPI cards
// ============================================================
function MetricGauge({ value, min, max, color }: { value: number; min: number; max: number; color: string }) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = max > min ? (clamped - min) / (max - min) : 0;
  // Arc: semicircle from 180° to 0° (left to right), radius 50, center (60, 60)
  const r = 46;
  const cx = 60;
  const cy = 58;
  const circumference = Math.PI * r; // half-circle
  const filled = circumference * pct;
  const gap = circumference - filled;
  return (
    <svg viewBox="0 0 120 68" className="w-full h-auto">
      {/* Background track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      {/* Filled arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${gap}`}
        className="transition-all duration-500"
      />
    </svg>
  );
}

// ============================================================
// Format helpers
// ============================================================
const fmt = (n: number) => n >= 0 ? `$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtX = (n: number) => `${n.toFixed(2)}x`;

// ============================================================
// Main Deal Modeler
// ============================================================
export default function DealModeler() {
  const searchParams = useSearchParams();
  const [inputs, setInputs] = useState<DealInputs>({ ...DEFAULT_INPUTS });
  const [dealName, setDealName] = useState("");
  const [dealType, setDealType] = useState("acquisition");
  const [dealSource, setDealSource] = useState("off_market");
  const [address, setAddress] = useState("");
  const [borough, setBorough] = useState("");
  const [block, setBlock] = useState("");
  const [lot, setLot] = useState("");
  const [bbl, setBbl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [propertyDetails, setPropertyDetails] = useState<DealPrefillData | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [assumptions, setAssumptions] = useState<Record<string, boolean>>({});
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  const [fredRate, setFredRate] = useState<number | null>(null);
  const [compValuation, setCompValuation] = useState<CompValuation | null>(null);
  const [renoEstimate, setRenoEstimate] = useState<import("@/lib/renovation-engine").RenovationEstimate | null>(null);
  const [strProjection, setStrProjection] = useState<import("@/lib/airbnb-market").STRProjection | null>(null);

  // Deal Structure state
  const [activeStructure, setActiveStructure] = useState<DealStructureType>("conventional");
  const [structureOverrides, setStructureOverrides] = useState<Partial<Record<DealStructureType, Record<string, number | boolean>>>>({});
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<StructureAnalysis[]>([]);

  // Fetch live FRED mortgage rate on mount
  useEffect(() => {
    import("@/lib/fred-actions").then(m => m.getFredMortgageRate()).then(setFredRate).catch(() => {});
  }, []);

  // Fetch enhanced comp valuation when BBL is available
  useEffect(() => {
    if (!bbl || bbl.length < 10) return;
    import("@/app/(dashboard)/market-intel/comps-actions")
      .then(m => m.fetchCompsWithValuation(bbl))
      .then(r => { if (r.valuation.estimatedValue > 0) setCompValuation(r.valuation); })
      .catch(() => {});
  }, [bbl]);

  // Fetch renovation estimate when BBL is available
  useEffect(() => {
    if (!bbl || bbl.length < 10) return;
    import("@/app/(dashboard)/market-intel/renovation-actions")
      .then(m => m.fetchRenovationEstimate(bbl))
      .then(est => { if (est) setRenoEstimate(est); })
      .catch(() => {});
  }, [bbl]);

  // Fetch STR (Airbnb) income projection when BBL is available
  useEffect(() => {
    if (!bbl || bbl.length < 10) return;
    import("@/app/(dashboard)/market-intel/str-actions")
      .then(m => m.fetchSTRProjection(bbl))
      .then(proj => { if (proj) setStrProjection(proj); })
      .catch(() => {});
  }, [bbl]);

  // Contact picker state
  const [contactId, setContactId] = useState<string | null>(null);
  const [linkedContact, setLinkedContact] = useState<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null } | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }[]>([]);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // LOI modal state
  const [showLoiModal, setShowLoiModal] = useState(false);
  const [loiData, setLoiData] = useState<LoiData | null>(null);
  const [loiSending, setLoiSending] = useState(false);
  const [loiMsg, setLoiMsg] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ fullName: string; email: string; phone: string; brokerage: string; licenseNumber: string; title: string } | null>(null);

  // T-12 modal
  const [showT12Modal, setShowT12Modal] = useState(false);
  const [t12Draft, setT12Draft] = useState<Record<string, number>>({});
  const [t12GrowthDraft, setT12GrowthDraft] = useState<Record<string, number>>({});

  // Comps state
  const [comps, setComps] = useState<CompSale[]>([]);
  const [compSummary, setCompSummary] = useState<CompSummary | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compRadius, setCompRadius] = useState(2);
  const [compYears, setCompYears] = useState(5);
  const [compMinUnits, setCompMinUnits] = useState(5);

  // Expense flags from anomaly detection
  const [expenseFlags, setExpenseFlags] = useState<ExpenseFlag[]>([]);

  // Load existing deal or pre-fill from query params
  useEffect(() => {
    if (prefilled) return;
    const dealId = searchParams.get("id");

    if (dealId) {
      setPrefillLoading(true);
      getDealAnalysis(dealId).then(deal => {
        setSavedId(deal.id);
        setDealName(deal.name || "");
        setAddress(deal.address || "");
        setBorough(deal.borough || "");
        setBlock(deal.block || "");
        setLot(deal.lot || "");
        setBbl(deal.bbl || "");
        setDealType(deal.dealType || "acquisition");
        setDealSource(deal.dealSource || "off_market");
        setNotes(deal.notes || "");
        if (deal.contactId) {
          setContactId(deal.contactId);
          getContact(deal.contactId).then(c => { if (c) setLinkedContact(c); });
        }
        if (deal.inputs) {
          const loaded = deal.inputs as unknown as DealInputs;
          setInputs(loaded);
          if (loaded._assumptions) {
            setAssumptions(loaded._assumptions);
            setIsAiGenerated(true);
          }
          if ((loaded as any)._structureType) {
            setActiveStructure((loaded as any)._structureType);
          }
          if ((loaded as any)._structureOverrides) {
            setStructureOverrides((loaded as any)._structureOverrides);
          }
        }
        setPrefillLoading(false);
      }).catch(() => setPrefillLoading(false));
      setPrefilled(true);
      return;
    }

    const addr = searchParams.get("address");
    const qBbl = searchParams.get("bbl");
    const qBorough = searchParams.get("borough");
    const qBlock = searchParams.get("block");
    const qLot = searchParams.get("lot");

    if (addr) { setAddress(addr); setDealName(addr); }
    if (qBorough) setBorough(qBorough);
    if (qBlock) setBlock(qBlock);
    if (qLot) setLot(qLot);

    if (qBbl) {
      setBbl(qBbl);
      setPrefillLoading(true);
      fetchDealPrefillData(qBbl).then(p => {
        if (!p) { setPrefillLoading(false); return; }
        setPropertyDetails(p);
        if (!addr && p.address) { setAddress(p.address); setDealName(p.address); }
        if (!qBorough && p.borough) setBorough(p.borough);
        if (!qBlock && p.block) setBlock(p.block);
        if (!qLot && p.lot) setLot(p.lot);
        setInputs(prev => ({
          ...prev,
          purchasePrice: p.lastSalePrice > 100000 ? p.lastSalePrice : (p.assessTotal > 0 ? p.assessTotal : prev.purchasePrice),
          realEstateTaxes: p.annualTaxes > 0 ? p.annualTaxes : prev.realEstateTaxes,
          insurance: p.unitsRes > 0 ? p.unitsRes * 1600 : prev.insurance,
          unitMix: p.suggestedUnitMix.length > 0 ? p.suggestedUnitMix : prev.unitMix,
        }));
        setPrefillLoading(false);
      }).catch(() => setPrefillLoading(false));

      // LL84/LL97: check for energy data and auto-add carbon penalty if applicable
      fetchLL84Data(qBbl).then(async (ll84) => {
        if (!ll84) return;
        // Override utilities with LL84 actuals
        const utils = await estimateLL84Utilities(ll84);
        if (utils.totalAnnualUtility > 0) {
          setInputs(prev => ({
            ...prev,
            electricityGas: utils.electricityCost + utils.gasCost + utils.fuelOilCost,
            waterSewer: utils.waterCost,
          }));
          setAssumptions(prev => { const a = { ...prev }; delete a.electricityGas; delete a.waterSewer; return a; });
        }
        // Check LL97 compliance and add penalty expense
        if (ll84.ghgEmissions > 0 && ll84.grossFloorArea > 0) {
          const primaryUse = ll84.primaryUse || "Multifamily Housing";
          const risk = await calculateLL97Risk(ll84.ghgEmissions, ll84.grossFloorArea, primaryUse);
          if (risk.penalty2024 > 0 || risk.penalty2030 > 0) {
            const penalty = risk.penalty2024 > 0 ? risk.penalty2024 : risk.penalty2030;
            setInputs(prev => ({
              ...prev,
              customExpenseItems: [
                ...(prev.customExpenseItems || []),
                { id: "ll97_penalty", name: `LL97 Carbon Penalty (Est.${risk.penalty2024 > 0 ? "" : " 2030"})`, amount: penalty },
              ],
            }));
          }
        }
      }).catch(() => {});
    }

    // NYS prefill from sessionStorage (set by NYS building profile)
    const nysSource = searchParams.get("source");
    if (nysSource === "nys") {
      try {
        const raw = sessionStorage.getItem("vettdre-nys-prefill");
        if (raw) {
          const p = JSON.parse(raw);
          sessionStorage.removeItem("vettdre-nys-prefill");
          if (p.address) { setAddress(p.address); setDealName(p.address); }
          if (p.county) setBorough(`${p.municipality || ""}, ${p.county} County`);
          setInputs(prev => ({
            ...prev,
            purchasePrice: p.lastSalePrice > 100000 ? p.lastSalePrice : (p.fullMarketValue > 0 ? p.fullMarketValue : prev.purchasePrice),
            realEstateTaxes: p.annualTaxes > 0 ? p.annualTaxes : prev.realEstateTaxes,
            insurance: p.unitsRes > 0 ? p.unitsRes * 1200 : prev.insurance,
            unitMix: p.suggestedUnitMix?.length > 0 ? p.suggestedUnitMix : prev.unitMix,
          }));
        }
      } catch {}
    }

    // NJ prefill from sessionStorage (set by NJ building profile)
    if (searchParams.get("source") === "nj") {
      try {
        const raw = sessionStorage.getItem("vettdre-nj-prefill");
        if (raw) {
          const p = JSON.parse(raw);
          sessionStorage.removeItem("vettdre-nj-prefill");
          if (p.address) { setAddress(p.address); setDealName(p.address); }
          if (p.county) setBorough(`${p.municipality || ""}, ${p.county} County, NJ`);
          setInputs(prev => ({
            ...prev,
            purchasePrice: p.lastSalePrice > 100000 ? p.lastSalePrice : (p.assessedTotal > 0 ? Math.round(p.assessedTotal * 1.3) : prev.purchasePrice),
            realEstateTaxes: p.assessedTotal > 0 ? Math.round(p.assessedTotal * 0.028) : prev.realEstateTaxes,
            insurance: p.units > 0 ? p.units * 1300 : prev.insurance,
          }));
        }
      } catch {}
    }

    setPrefilled(true);
  }, [searchParams, prefilled]);

  // Contact search with debounce
  const handleContactSearch = useCallback((q: string) => {
    setContactSearch(q);
    if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    if (q.length < 2) { setContactResults([]); setContactDropdownOpen(false); return; }
    contactSearchTimer.current = setTimeout(async () => {
      const results = await searchContacts(q);
      setContactResults(results);
      setContactDropdownOpen(results.length > 0);
    }, 300);
  }, []);

  const selectContact = useCallback((c: typeof contactResults[number]) => {
    setContactId(c.id);
    setLinkedContact(c);
    setContactSearch("");
    setContactResults([]);
    setContactDropdownOpen(false);
  }, []);

  const unlinkContact = useCallback(() => {
    setContactId(null);
    setLinkedContact(null);
  }, []);

  // Open LOI modal
  const openLoiModal = useCallback(async () => {
    if (!userProfile) {
      try {
        const p = await getUserProfile();
        setUserProfile(p);
        buildLoiData(p);
      } catch { buildLoiData(null); }
    } else {
      buildLoiData(userProfile);
    }
    setShowLoiModal(true);
    setLoiMsg(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile, inputs, address, bbl, propertyDetails, linkedContact, dealName]);

  const buildLoiData = useCallback((profile: typeof userProfile) => {
    const contactAddr = linkedContact
      ? [linkedContact.address, linkedContact.city, linkedContact.state, linkedContact.zip].filter(Boolean).join(", ")
      : "";
    setLoiData({
      propertyAddress: address || dealName || "Property",
      bbl: bbl || "",
      ownerName: propertyDetails?.ownerName || (linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName}` : ""),
      ownerAddress: contactAddr,
      offerPrice: inputs.purchasePrice,
      earnestMoneyPercent: LOI_DEFAULTS.earnestMoneyPercent,
      dueDiligenceDays: LOI_DEFAULTS.dueDiligenceDays,
      financingContingencyDays: LOI_DEFAULTS.financingContingencyDays,
      closingDays: LOI_DEFAULTS.closingDays,
      buyerEntity: profile?.fullName || "",
      buyerAddress: "",
      brokerName: profile?.fullName || "",
      brokerEmail: profile?.email || "",
      brokerPhone: profile?.phone || "",
      brokerLicense: profile?.licenseNumber || "",
      brokerage: profile?.brokerage || "",
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    });
  }, [address, dealName, bbl, propertyDetails, inputs.purchasePrice, linkedContact]);

  const outputs: DealOutputs = useMemo(() => calculateAll(inputs), [inputs]);

  // Build DealInputsBase from current inputs for the structure engine
  const structureBase: DealInputsBase = useMemo(() => {
    const totalUnitsCalc = inputs.unitMix.reduce((s, u) => s + u.count, 0);
    const grossRental = inputs.unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
    const otherInc = inputs.commercialRentAnnual + inputs.parkingIncome + inputs.storageIncome +
      inputs.lateFees + inputs.petDeposits + inputs.petRent + inputs.evCharging +
      inputs.trashRubs + inputs.waterRubs + (inputs.camRecoveries || 0) + inputs.otherMiscIncome +
      (inputs.customIncomeItems || []).reduce((s, i) => s + i.amount, 0);
    return {
      purchasePrice: inputs.purchasePrice,
      units: totalUnitsCalc,
      grossRentalIncome: grossRental,
      otherIncome: otherInc,
      vacancyRate: inputs.residentialVacancyRate,
      operatingExpenses: outputs.totalExpenses - inputs.realEstateTaxes - inputs.insurance - inputs.rmCapexReserve,
      capexReserve: inputs.rmCapexReserve,
      propertyTaxes: inputs.realEstateTaxes,
      insurance: inputs.insurance,
      holdPeriod: inputs.holdPeriodYears,
      exitCapRate: inputs.exitCapRate,
      annualRentGrowth: inputs.annualRentGrowth,
      annualExpenseGrowth: inputs.annualExpenseGrowth,
      renovationBudget: inputs.renovationBudget,
      closingCostsPct: inputs.purchasePrice > 0 ? (inputs.closingCosts / inputs.purchasePrice) * 100 : 3,
      currentMarketRate: fredRate || undefined,
      compEstimate: compValuation?.estimatedValue,
    };
  }, [inputs, outputs.totalExpenses, fredRate, compValuation]);

  // Merged structure inputs (defaults + user overrides)
  const mergedStructureInputs = useMemo(() => {
    const defaults = getDefaultStructureInputs(activeStructure, structureBase);
    return { ...defaults, ...(structureOverrides[activeStructure] || {}) };
  }, [activeStructure, structureBase, structureOverrides]);

  // Run structure analysis
  const structureAnalysis: StructureAnalysis | null = useMemo(() => {
    try {
      return calculateDealStructure(mergedStructureInputs as StructuredDealInputs);
    } catch { return null; }
  }, [mergedStructureInputs]);

  // Run expense anomaly detection whenever inputs change
  useEffect(() => {
    const totalUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);
    if (totalUnits <= 0) { setExpenseFlags([]); return; }
    const expenseMap: Record<string, number> = {
      insurance: inputs.insurance,
      electricityGas: inputs.electricityGas,
      waterSewer: inputs.waterSewer,
      rmGeneral: inputs.rmGeneral,
      payroll: inputs.payroll,
      cleaning: inputs.cleaning,
      trashRemoval: inputs.trashRemoval,
      landscaping: inputs.landscaping,
      elevator: inputs.elevator,
      snowRemoval: inputs.snowRemoval,
      realEstateTaxes: inputs.realEstateTaxes,
    };
    const flags = analyzeExpenses({
      expenses: expenseMap,
      totalUnits,
      totalIncome: outputs.totalIncome,
      managementFeePercent: inputs.managementFeePercent,
      customExpenses: inputs.customExpenseItems?.map(c => ({ id: c.id, name: c.name, amount: c.amount })),
    });
    setExpenseFlags(flags);
  }, [inputs, outputs.totalIncome]);

  // Load comps when we have property details with a zip
  const loadComps = useCallback(async (zip: string) => {
    setCompsLoading(true);
    try {
      const result = await fetchComps({ zip, radiusMiles: compRadius, yearsBack: compYears, minUnits: compMinUnits, limit: 50 });
      setComps(result.comps);
      setCompSummary(result.summary);
    } catch (err) {
      console.error("Failed to load comps:", err);
    } finally {
      setCompsLoading(false);
    }
  }, [compRadius, compYears, compMinUnits]);

  const update = useCallback((partial: Partial<DealInputs>) => {
    setInputs(prev => ({ ...prev, ...partial }));
  }, []);

  const clearAi = useCallback((field: string) => {
    setAssumptions(prev => { const next = { ...prev }; delete next[field]; return next; });
  }, []);

  const isAi = useCallback((field: string) => !!assumptions[field], [assumptions]);

  const updateUnit = useCallback((index: number, field: keyof UnitMixRow, value: number | string) => {
    setInputs(prev => {
      const unitMix = [...prev.unitMix];
      unitMix[index] = { ...unitMix[index], [field]: value };
      return { ...prev, unitMix };
    });
    clearAi("unitMix");
  }, [clearAi]);

  const addUnitType = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      unitMix: [...prev.unitMix, { type: "New", count: 1, monthlyRent: 2000 }],
    }));
    clearAi("unitMix");
  }, [clearAi]);

  const removeUnitType = useCallback((index: number) => {
    setInputs(prev => ({
      ...prev,
      unitMix: prev.unitMix.filter((_, i) => i !== index),
    }));
  }, []);

  // Custom line items
  const addCustomExpense = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      customExpenseItems: [...(prev.customExpenseItems || []), { id: Date.now().toString(), name: "New Expense", amount: 0 }],
    }));
  }, []);

  const removeCustomExpense = useCallback((id: string) => {
    setInputs(prev => ({
      ...prev,
      customExpenseItems: (prev.customExpenseItems || []).filter(e => e.id !== id),
    }));
  }, []);

  const updateCustomExpense = useCallback((id: string, field: keyof CustomLineItem, value: string | number) => {
    setInputs(prev => ({
      ...prev,
      customExpenseItems: (prev.customExpenseItems || []).map(e => e.id === id ? { ...e, [field]: value } : e),
    }));
  }, []);

  const addCustomIncome = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      customIncomeItems: [...(prev.customIncomeItems || []), { id: Date.now().toString(), name: "New Income", amount: 0 }],
    }));
  }, []);

  const removeCustomIncome = useCallback((id: string) => {
    setInputs(prev => ({
      ...prev,
      customIncomeItems: (prev.customIncomeItems || []).filter(e => e.id !== id),
    }));
  }, []);

  const updateCustomIncome = useCallback((id: string, field: keyof CustomLineItem, value: string | number) => {
    setInputs(prev => ({
      ...prev,
      customIncomeItems: (prev.customIncomeItems || []).map(e => e.id === id ? { ...e, [field]: value } : e),
    }));
  }, []);

  // T-12 helpers
  const openT12Modal = useCallback(() => {
    setT12Draft(inputs.t12Actuals || {});
    setT12GrowthDraft(inputs.t12GrowthFactors || {});
    setShowT12Modal(true);
  }, [inputs.t12Actuals, inputs.t12GrowthFactors]);

  const applyT12 = useCallback(() => {
    const newMeta: Record<string, ExpenseLineMeta> = { ...(inputs.expenseMeta || {}) };
    const updates: Partial<DealInputs> = {};
    for (const [field, actual] of Object.entries(t12Draft)) {
      if (actual > 0) {
        const gf = t12GrowthDraft[field] || 1.03;
        const budgeted = Math.round(actual * gf);
        (updates as any)[field] = budgeted;
        newMeta[field] = { source: 't12', methodology: `T-12 ($${actual.toLocaleString()}) + ${Math.round((gf - 1) * 100)}%`, t12Actual: actual, growthFactor: gf };
      }
    }
    setInputs(prev => ({ ...prev, ...updates, t12Actuals: t12Draft, t12GrowthFactors: t12GrowthDraft, expenseMeta: newMeta }));
    setShowT12Modal(false);
  }, [t12Draft, t12GrowthDraft, inputs.expenseMeta]);

  // Expense flag helpers
  const getFlagForField = useCallback((field: string) => {
    return expenseFlags.find(f => f.field === field);
  }, [expenseFlags]);

  const applySuggestedAmount = useCallback((flag: ExpenseFlag) => {
    if (flag.suggestedAmount != null) {
      update({ [flag.field]: flag.suggestedAmount } as any);
    }
  }, [update]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await saveDealAnalysis({
        id: savedId || undefined,
        name: dealName || address || "Untitled Deal",
        address: address || undefined,
        borough: borough || undefined,
        block: block || undefined,
        lot: lot || undefined,
        bbl: bbl || undefined,
        contactId: contactId || undefined,
        dealType,
        dealSource,
        inputs: { ...inputs, _assumptions: assumptions, _structureType: activeStructure, _structureOverrides: structureOverrides },
        outputs,
        notes: notes || undefined,
      });
      setSavedId(result.id);
      setSaveMsg("Saved!");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      setSaveMsg("Error: " + (err.message || "Failed"));
    } finally {
      setSaving(false);
    }
  };

  // Structure param update
  const updateStructureParam = useCallback((param: string, value: number | boolean) => {
    setStructureOverrides(prev => ({
      ...prev,
      [activeStructure]: { ...(prev[activeStructure] || {}), [param]: value },
    }));
  }, [activeStructure]);

  // Run comparison across all structures
  const runComparison = useCallback(() => {
    const structures: DealStructureType[] = ["all_cash", "conventional", "bridge_refi", "assumable", "syndication"];
    const results = compareDealStructures(structureBase, structures, structureOverrides as any);
    setComparisonResults(results);
    setShowComparison(true);
  }, [structureBase, structureOverrides]);

  // Keyboard shortcuts: Cmd+1-5 switch structures, Cmd+K toggle comparison
  useEffect(() => {
    const structures: DealStructureType[] = ["all_cash", "conventional", "bridge_refi", "assumable", "syndication"];
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        setActiveStructure(structures[idx]);
        setShowComparison(false);
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        if (showComparison) {
          setShowComparison(false);
        } else {
          runComparison();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showComparison, runComparison]);

  const totalUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);

  return (
    <div className="min-h-screen bg-[#0B0F19] text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0B0F19]/95 backdrop-blur-sm border-b border-white/5 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <a href="/deals" className="text-sm text-slate-400 hover:text-blue-400">&larr; Back</a>
            <div>
              <input
                value={dealName}
                onChange={e => setDealName(e.target.value)}
                placeholder="Deal name..."
                className="text-lg font-bold text-white border-none focus:outline-none bg-transparent placeholder:text-slate-600 w-full max-w-md"
              />
              {address && <p className="text-xs text-slate-500">{address}{borough ? `, ${borough}` : ""}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {saveMsg && <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{saveMsg}</span>}
            {savedId && (
              <a
                href={`/deals/promote?dealId=${savedId}`}
                className="px-3 md:px-4 py-2 border border-violet-500/20 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-sm font-medium rounded-lg transition-colors"
              >
                Structure Partnership
              </a>
            )}
            {inputs.purchasePrice > 0 && (
              <button
                onClick={openLoiModal}
                className="px-3 md:px-4 py-2 border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-medium rounded-lg transition-colors"
              >
                Generate LOI
              </button>
            )}
            <button
              onClick={() => generateDealPdf({ dealName: dealName || address || "Deal Analysis", address, borough, inputs, outputs, propertyDetails, notes, structureType: activeStructure, structureAnalysis: structureAnalysis || undefined, comparisonResults: comparisonResults.length > 0 ? comparisonResults : undefined })}
              className="px-3 md:px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Export PDF
            </button>
            <button onClick={handleSave} disabled={saving} className="px-3 md:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {saving ? "Saving..." : savedId ? "Update" : "Save Deal"}
            </button>
          </div>
        </div>
      </div>

      {prefillLoading && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-blue-400">
            <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full" />
            Loading deal data...
          </div>
        </div>
      )}

      {isAiGenerated && !prefillLoading && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 md:px-6 py-2.5">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-amber-400">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" /></svg>
            <span><strong>AI-Generated Assumptions</strong> — Review and adjust inputs as needed. Fields marked with <Sparkle /> were auto-calculated.</span>
          </div>
        </div>
      )}

      {propertyDetails && !prefillLoading && !isAiGenerated && (
        <div className="bg-green-500/10 border-b border-green-500/20 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto text-sm text-green-400">
            Pre-filled from {propertyDetails.address}, {propertyDetails.borough} — {propertyDetails.unitsRes} units, built {propertyDetails.yearBuilt}
            {propertyDetails.lastSalePrice > 0 && ` — Last sale: ${fmt(propertyDetails.lastSalePrice)}`}
          </div>
        </div>
      )}

      {/* Deal Structure Selector */}
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

      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ======================== LEFT PANEL — INPUTS ======================== */}
          <div className="w-full lg:w-[440px] flex-shrink-0 space-y-4">

            {/* Deal Info */}
            <Section title="Deal Info">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Deal Type</label>
                  <select value={dealType} onChange={e => setDealType(e.target.value)} className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white">
                    <option value="acquisition">Acquisition</option>
                    <option value="value_add">Value-Add</option>
                    <option value="new_development">New Development</option>
                    <option value="mixed_use">Mixed Use</option>
                    <option value="ground_up">Ground Up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Source</label>
                  <select value={dealSource} onChange={e => setDealSource(e.target.value)} className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white">
                    <option value="off_market">Off-Market</option>
                    <option value="on_market">On-Market</option>
                    <option value="new_development">New Development</option>
                    <option value="referral">Referral</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </Section>

            {/* Linked Contact */}
            <Section title="Linked Contact" defaultOpen={!!linkedContact}>
              {linkedContact ? (
                <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{linkedContact.firstName} {linkedContact.lastName}</p>
                    {linkedContact.email && <p className="text-xs text-slate-400 truncate">{linkedContact.email}</p>}
                  </div>
                  <button onClick={unlinkContact} className="text-slate-500 hover:text-red-400 text-lg leading-none" title="Unlink contact">&times;</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={contactSearch}
                    onChange={e => handleContactSearch(e.target.value)}
                    onFocus={() => { if (contactResults.length > 0) setContactDropdownOpen(true); }}
                    onBlur={() => setTimeout(() => setContactDropdownOpen(false), 200)}
                    placeholder="Search contacts by name or email..."
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  {contactDropdownOpen && contactResults.length > 0 && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-[#0B0F19] border border-white/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {contactResults.map(c => (
                        <button
                          key={c.id}
                          onMouseDown={e => { e.preventDefault(); selectContact(c); }}
                          className="w-full text-left px-3 py-2 hover:bg-white/[0.05] transition-colors"
                        >
                          <p className="text-sm font-medium text-white">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-slate-400">{c.email || "No email"}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Acquisition */}
            <Section title="Acquisition">
              <Field label="Purchase Price" value={inputs.purchasePrice} onChange={v => update({ purchasePrice: v })} prefix="$" aiAssumed={isAi("purchasePrice")} onClearAi={() => clearAi("purchasePrice")} />
              {compValuation && (
                <div className="flex items-center justify-between -mt-1 mb-1">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full font-medium border border-emerald-500/20">
                    Comp Estimate: ${(compValuation.estimatedValue / 1e6).toFixed(2)}M
                    <span className={`text-[10px] px-1 py-0.5 rounded ${compValuation.confidence === "high" ? "bg-emerald-500/20 text-emerald-400" : compValuation.confidence === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-slate-400"}`}>
                      {compValuation.confidence}
                    </span>
                  </span>
                  <button onClick={() => update({ purchasePrice: compValuation.estimatedValue })}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium">
                    Apply to deal
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Closing Costs" value={inputs.closingCosts} onChange={v => update({ closingCosts: v })} prefix="$" aiAssumed={isAi("closingCosts")} onClearAi={() => clearAi("closingCosts")} />
                <Field label="Renovation Budget" value={inputs.renovationBudget} onChange={v => update({ renovationBudget: v })} prefix="$" badge="Reno" />
              </div>
              {renoEstimate && (
                <div className="flex items-center justify-between -mt-1 mb-1">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-full font-medium border border-amber-500/20">
                    {renoEstimate.recommendedLevel.charAt(0).toUpperCase() + renoEstimate.recommendedLevel.slice(1)} Rehab: ${renoEstimate.totalCost[renoEstimate.recommendedLevel] >= 1e6 ? (renoEstimate.totalCost[renoEstimate.recommendedLevel] / 1e6).toFixed(2) + "M" : Math.round(renoEstimate.totalCost[renoEstimate.recommendedLevel] / 1000) + "K"}
                    {renoEstimate.arv[renoEstimate.recommendedLevel] > 0 && (
                      <span className="text-amber-300 font-normal">ARV ${(renoEstimate.arv[renoEstimate.recommendedLevel] / 1e6).toFixed(1)}M</span>
                    )}
                  </span>
                  <button onClick={() => update({ renovationBudget: renoEstimate.totalCost[renoEstimate.recommendedLevel] })}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium">
                    Apply to deal
                  </button>
                </div>
              )}
              <div className="bg-blue-500/10 rounded-lg p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Total Equity Required</span>
                  <span className="font-semibold text-blue-400">{fmt(outputs.totalEquity)}</span>
                </div>
              </div>
            </Section>

            {/* Financing */}
            <Section title="Financing" summary={`${inputs.ltvPercent}% LTV at ${inputs.interestRate}%`}>
              {fredRate && (
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1.5 text-xs bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full font-medium border border-blue-500/20">
                    30yr Fixed: {fredRate.toFixed(2)}%
                    <span className="text-blue-500/60 font-normal">FRED</span>
                  </span>
                  <button onClick={() => update({ interestRate: fredRate })}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                    Apply to deal
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="LTV" value={inputs.ltvPercent} onChange={v => update({ ltvPercent: v })} min={0} max={100} step={1} badge="FRED" />
                <SliderField label="Interest Rate" value={inputs.interestRate} onChange={v => update({ interestRate: v })} min={0} max={15} step={0.125} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amortization (yrs)" value={inputs.amortizationYears} onChange={v => update({ amortizationYears: v })} step="1" />
                <Field label="Loan Term (yrs)" value={inputs.loanTermYears} onChange={v => update({ loanTermYears: v })} step="1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Origination Fee" value={inputs.originationFeePercent} onChange={v => update({ originationFeePercent: v })} suffix="%" step="0.25" aiAssumed={isAi("originationFeePercent")} onClearAi={() => clearAi("originationFeePercent")} />
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={inputs.interestOnly} onChange={e => update({ interestOnly: e.target.checked })} className="rounded border-white/10 bg-slate-800/40 text-blue-500" />
                    Interest Only
                  </label>
                </div>
              </div>
              <div className="bg-white/[0.03] rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Loan Amount</span><span className="font-medium text-white">{fmt(outputs.loanAmount)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">IO Annual Payment</span><span className="font-medium text-white">{fmt(outputs.ioAnnualPayment)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Amort Annual Payment</span><span className="font-medium text-white">{fmt(outputs.annualDebtService)}</span></div>
              </div>
            </Section>

            {/* Structure-Specific Financing */}
            {activeStructure === "all_cash" && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                <p className="text-xs text-emerald-400 font-medium">All Cash — No leverage</p>
                <p className="text-[10px] text-emerald-500/60 mt-0.5">100% equity. Financing section above is ignored for structure analysis.</p>
              </div>
            )}

            {activeStructure === "bridge_refi" && (
              <Section title="Bridge → Refi (BRRRR)">
                {/* Visual Timeline */}
                <div className="flex items-stretch gap-0 mb-4 overflow-x-auto no-scrollbar">
                  {[
                    { phase: "ACQUIRE", detail: "Bridge Loan", time: "Month 0", color: "border-amber-500/30 bg-amber-500/5", dot: "bg-amber-400" },
                    { phase: "RENOVATE &\nSTABILIZE", detail: "Value-Add", time: `Month 1–${(mergedStructureInputs as any).bridgeTermMonths ?? 24}`, color: "border-blue-500/30 bg-blue-500/5", dot: "bg-blue-400" },
                    { phase: "REFINANCE", detail: "Permanent", time: `Month ${(mergedStructureInputs as any).bridgeTermMonths ?? 24}+`, color: "border-emerald-500/30 bg-emerald-500/5", dot: "bg-emerald-400" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center">
                      <div className={`border rounded-lg p-2.5 min-w-[100px] text-center ${step.color}`}>
                        <div className={`w-2 h-2 rounded-full mx-auto mb-1.5 ${step.dot}`} />
                        <p className="text-[10px] font-bold text-white leading-tight whitespace-pre-line">{step.phase}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{step.detail}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{step.time}</p>
                      </div>
                      {i < 2 && (
                        <div className="flex items-center px-1 text-slate-600">
                          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Phase 1: Bridge Loan</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bridge LTV" value={(mergedStructureInputs as any).bridgeLtvPct ?? 80} onChange={v => updateStructureParam("bridgeLtvPct", v)} suffix="%" step="1" />
                  <Field label="Bridge Rate" value={(mergedStructureInputs as any).bridgeRate ?? 10} onChange={v => updateStructureParam("bridgeRate", v)} suffix="%" step="0.25" />
                  <Field label="Term (months)" value={(mergedStructureInputs as any).bridgeTermMonths ?? 24} onChange={v => updateStructureParam("bridgeTermMonths", v)} step="1" />
                  <Field label="Origination Pts" value={(mergedStructureInputs as any).bridgeOriginationPts ?? 2} onChange={v => updateStructureParam("bridgeOriginationPts", v)} suffix="%" step="0.25" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Phase 2: Stabilization</p>
                <Field label="Post-Rehab Rent Bump" value={(mergedStructureInputs as any).postRehabRentBump ?? 20} onChange={v => updateStructureParam("postRehabRentBump", v)} suffix="%" step="1" />
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Phase 3: Permanent Refi</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Refi LTV (of ARV)" value={(mergedStructureInputs as any).refiLtvPct ?? 75} onChange={v => updateStructureParam("refiLtvPct", v)} suffix="%" step="1" />
                  <Field label="Refi Rate" value={(mergedStructureInputs as any).refiRate ?? (fredRate || 7)} onChange={v => updateStructureParam("refiRate", v)} suffix="%" step="0.125" />
                  <Field label="Amortization (yrs)" value={(mergedStructureInputs as any).refiAmortization ?? 30} onChange={v => updateStructureParam("refiAmortization", v)} step="1" />
                  <Field label="Refi Term (yrs)" value={(mergedStructureInputs as any).refiTermYears ?? 10} onChange={v => updateStructureParam("refiTermYears", v)} step="1" />
                </div>
                <Field label="ARV Override" value={(mergedStructureInputs as any).arvOverride ?? 0} onChange={v => updateStructureParam("arvOverride", v)} prefix="$" />
              </Section>
            )}

            {activeStructure === "assumable" && (
              <Section title="Assumable Mortgage">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Existing Loan</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Loan Balance" value={(mergedStructureInputs as any).existingLoanBalance ?? 0} onChange={v => updateStructureParam("existingLoanBalance", v)} prefix="$" />
                  <Field label="Locked Rate" value={(mergedStructureInputs as any).existingRate ?? 3.5} onChange={v => updateStructureParam("existingRate", v)} suffix="%" step="0.125" />
                  <Field label="Remaining (months)" value={(mergedStructureInputs as any).existingTermRemaining ?? 300} onChange={v => updateStructureParam("existingTermRemaining", v)} step="1" />
                  <Field label="Original Amort (yrs)" value={(mergedStructureInputs as any).existingAmortization ?? 30} onChange={v => updateStructureParam("existingAmortization", v)} step="1" />
                </div>
                <Field label="Assumption Fee" value={(mergedStructureInputs as any).assumptionFee ?? 1} onChange={v => updateStructureParam("assumptionFee", v)} suffix="%" step="0.25" />
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Supplemental Loan (Optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Supp. Amount" value={(mergedStructureInputs as any).supplementalLoanAmount ?? 0} onChange={v => updateStructureParam("supplementalLoanAmount", v)} prefix="$" />
                  <Field label="Supp. Rate" value={(mergedStructureInputs as any).supplementalRate ?? 0} onChange={v => updateStructureParam("supplementalRate", v)} suffix="%" step="0.125" />
                </div>
                {fredRate != null && (() => {
                  const assumedRate = (mergedStructureInputs as any).existingRate || 3.5;
                  const marketRate = fredRate;
                  const maxRate = Math.max(assumedRate, marketRate, 1);
                  const savings = marketRate - assumedRate;
                  const loanBal = (mergedStructureInputs as any).existingLoanBalance || 0;
                  const annualSavings = loanBal > 0 ? Math.round(loanBal * (savings / 100)) : 0;
                  return (
                    <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 mt-2 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Your Assumed Rate</span>
                          <span className="text-xs font-bold text-emerald-400 font-mono">{assumedRate.toFixed(2)}%</span>
                        </div>
                        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${(assumedRate / maxRate) * 100}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Today&apos;s Market Rate</span>
                          <span className="text-xs font-bold text-amber-400 font-mono">{marketRate.toFixed(2)}% <span className="text-[9px] font-normal text-slate-500 ml-1 px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">FRED</span></span>
                        </div>
                        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${(marketRate / maxRate) * 100}%` }} />
                        </div>
                      </div>
                      {savings > 0 && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                          <p className="text-xs font-bold text-emerald-400">You Save: {savings.toFixed(2)}%{annualSavings > 0 ? ` → ${fmt(annualSavings)}/year` : ""}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Section>
            )}

            {activeStructure === "syndication" && (
              <Section title="Syndication Structure">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Debt Terms</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="LTV" value={(mergedStructureInputs as any).ltvPct ?? 65} onChange={v => updateStructureParam("ltvPct", v)} suffix="%" step="1" />
                  <Field label="Rate" value={(mergedStructureInputs as any).interestRate ?? (fredRate || 7)} onChange={v => updateStructureParam("interestRate", v)} suffix="%" step="0.125" />
                  <Field label="Amortization" value={(mergedStructureInputs as any).amortizationYears ?? 30} onChange={v => updateStructureParam("amortizationYears", v)} step="1" />
                  <Field label="Loan Term" value={(mergedStructureInputs as any).loanTermYears ?? 10} onChange={v => updateStructureParam("loanTermYears", v)} step="1" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Equity Split</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="GP Equity %" value={(mergedStructureInputs as any).gpEquityPct ?? 10} onChange={v => updateStructureParam("gpEquityPct", v)} suffix="%" step="1" />
                  <Field label="LP Equity %" value={(mergedStructureInputs as any).lpEquityPct ?? 90} onChange={v => updateStructureParam("lpEquityPct", v)} suffix="%" step="1" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Sponsor Fees</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Acquisition Fee" value={(mergedStructureInputs as any).acquisitionFeePct ?? 2} onChange={v => updateStructureParam("acquisitionFeePct", v)} suffix="%" step="0.25" />
                  <Field label="Asset Mgmt Fee" value={(mergedStructureInputs as any).assetManagementFeePct ?? 1.5} onChange={v => updateStructureParam("assetManagementFeePct", v)} suffix="%" step="0.25" />
                  <Field label="Disposition Fee" value={(mergedStructureInputs as any).dispositionFeePct ?? 1} onChange={v => updateStructureParam("dispositionFeePct", v)} suffix="%" step="0.25" />
                  <Field label="Construction Mgmt" value={(mergedStructureInputs as any).constructionMgmtFeePct ?? 5} onChange={v => updateStructureParam("constructionMgmtFeePct", v)} suffix="%" step="1" />
                </div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2 mt-3">Waterfall</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Preferred Return" value={(mergedStructureInputs as any).preferredReturn ?? 8} onChange={v => updateStructureParam("preferredReturn", v)} suffix="%" step="0.5" />
                  <Field label="GP Promote (Pref)" value={(mergedStructureInputs as any).gpPromoteAbovePref ?? 20} onChange={v => updateStructureParam("gpPromoteAbovePref", v)} suffix="%" step="5" />
                  <Field label="IRR Hurdle" value={(mergedStructureInputs as any).irrHurdle ?? 15} onChange={v => updateStructureParam("irrHurdle", v)} suffix="%" step="1" />
                  <Field label="GP Promote (Hurdle)" value={(mergedStructureInputs as any).gpPromoteAboveHurdle ?? 30} onChange={v => updateStructureParam("gpPromoteAboveHurdle", v)} suffix="%" step="5" />
                </div>
              </Section>
            )}

            {/* Income — Residential */}
            <Section title="Income — Residential" summary={`GPR ${fmt(outputs.grossPotentialResidentialRent)}, ${inputs.residentialVacancyRate}% vacancy`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Unit Mix ({totalUnits} units){isAi("unitMix") && <Sparkle />}</span>
                  <button onClick={addUnitType} className="text-xs text-blue-400 hover:text-blue-300 font-medium">+ Add Type</button>
                </div>
                <div className="border border-white/5 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-white/[0.03]">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-500">Type</th>
                        <th className="text-center px-2 py-2 font-medium text-slate-500">Ct</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-500">Rent/Mo</th>
                        <th className="text-right px-3 py-2 font-medium text-slate-500">Annual</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.unitMix.map((u, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-2 py-1.5">
                            <input value={u.type} onChange={e => updateUnit(i, "type", e.target.value)} className="w-full px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" />
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" value={u.count} onChange={e => updateUnit(i, "count", parseInt(e.target.value) || 0)} className="w-14 text-center px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" min="0" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={u.monthlyRent} onChange={e => updateUnit(i, "monthlyRent", parseFloat(e.target.value) || 0)} className="w-full text-right px-1.5 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-white" />
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-400">{fmt(u.count * u.monthlyRent * 12)}</td>
                          <td className="pr-2">
                            {inputs.unitMix.length > 1 && (
                              <button onClick={() => removeUnitType(i)} className="text-slate-500 hover:text-red-400 text-sm">&times;</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-white/[0.03] border-t border-white/5">
                      <tr>
                        <td className="px-3 py-2 font-semibold text-white">GPR</td>
                        <td className="text-center px-2 py-2 font-semibold text-white">{totalUnits}</td>
                        <td></td>
                        <td className="text-right px-3 py-2 font-semibold text-white">{fmt(outputs.grossPotentialResidentialRent)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="Vacancy Rate" value={inputs.residentialVacancyRate} onChange={v => update({ residentialVacancyRate: v })} min={0} max={30} step={0.5} />
                <Field label="Concessions (annual)" value={inputs.concessions} onChange={v => update({ concessions: v })} prefix="$" aiAssumed={isAi("concessions")} onClearAi={() => clearAi("concessions")} />
              </div>
              <SliderField label="Annual Rent Growth" value={inputs.annualRentGrowth} onChange={v => update({ annualRentGrowth: v })} min={-5} max={15} step={0.5} />
              {strProjection && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 -mt-1">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs text-purple-400 font-medium">
                      STR Potential: ${strProjection.monthlySTRRevenue.toLocaleString()}/mo per unit
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${strProjection.strPremium > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {strProjection.strPremium > 0 ? "+" : ""}{strProjection.strPremium}% vs LTR
                      </span>
                    </span>
                  </div>
                  <p className="text-[10px] text-purple-500/60 mt-1">Based on {strProjection.neighborhood} Airbnb data — {strProjection.occupancyRate * 100}% occupancy, ${strProjection.avgNightlyRate}/night. NYC LL18 restricts STR.</p>
                </div>
              )}
            </Section>

            {/* Income — Commercial */}
            <Section title="Income — Commercial" defaultOpen={inputs.commercialRentAnnual > 0}>
              <Field label="Commercial Rent (annual)" value={inputs.commercialRentAnnual} onChange={v => update({ commercialRentAnnual: v })} prefix="$" aiAssumed={isAi("commercialRentAnnual")} onClearAi={() => clearAi("commercialRentAnnual")} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vacancy Rate" value={inputs.commercialVacancyRate} onChange={v => update({ commercialVacancyRate: v })} suffix="%" step="0.5" aiAssumed={isAi("commercialVacancyRate")} onClearAi={() => clearAi("commercialVacancyRate")} />
                <Field label="Concessions (annual)" value={inputs.commercialConcessions} onChange={v => update({ commercialConcessions: v })} prefix="$" />
              </div>
            </Section>

            {/* Income — Other */}
            <Section title="Income — Other" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Late Fees" value={inputs.lateFees} onChange={v => update({ lateFees: v })} prefix="$" />
                <Field label="Parking" value={inputs.parkingIncome} onChange={v => update({ parkingIncome: v })} prefix="$" />
                <Field label="Storage" value={inputs.storageIncome} onChange={v => update({ storageIncome: v })} prefix="$" />
                <Field label="Pet Deposits" value={inputs.petDeposits} onChange={v => update({ petDeposits: v })} prefix="$" />
                <Field label="Pet Rent" value={inputs.petRent} onChange={v => update({ petRent: v })} prefix="$" />
                <Field label="EV Charging" value={inputs.evCharging} onChange={v => update({ evCharging: v })} prefix="$" />
                <Field label="Trash RUBS" value={inputs.trashRubs} onChange={v => update({ trashRubs: v })} prefix="$" />
                <Field label="Water/Sewer RUBS" value={inputs.waterRubs} onChange={v => update({ waterRubs: v })} prefix="$" />
                <Field label="CAM Recoveries" value={inputs.camRecoveries || 0} onChange={v => update({ camRecoveries: v })} prefix="$" />
              </div>
              <Field label="Other Misc Income" value={inputs.otherMiscIncome} onChange={v => update({ otherMiscIncome: v })} prefix="$" />
              <button
                onClick={addCustomIncome}
                className="w-full px-3 py-2 border border-dashed border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5 text-slate-500 hover:text-blue-400 text-xs font-medium rounded-lg transition-colors"
              >
                + Add Income Line Item
              </button>
            </Section>

            {/* T-12 + Custom Expense Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={openT12Modal}
                className="flex-1 px-3 py-2 border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg transition-colors text-center"
              >
                Enter T-12 Actuals
              </button>
              <button
                onClick={addCustomExpense}
                className="flex-1 px-3 py-2 border border-white/10 hover:bg-white/[0.05] text-slate-400 text-xs font-medium rounded-lg transition-colors text-center"
              >
                + Add Expense Line
              </button>
            </div>

            {/* Expense Flags Summary */}
            {expenseFlags.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-400 mb-1">{expenseFlags.length} expense flag{expenseFlags.length !== 1 ? "s" : ""} detected</p>
                <p className="text-[10px] text-amber-500/60">Review flagged items in the P&L section on the right panel.</p>
              </div>
            )}

            {/* Expenses — Fixed */}
            <Section title="Expenses — Taxes & Insurance">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Real Estate Taxes" value={inputs.realEstateTaxes} onChange={v => update({ realEstateTaxes: v })} prefix="$" aiAssumed={isAi("realEstateTaxes")} onClearAi={() => clearAi("realEstateTaxes")} />
                <Field label="Property Insurance" value={inputs.insurance} onChange={v => update({ insurance: v })} prefix="$" aiAssumed={isAi("insurance")} onClearAi={() => clearAi("insurance")} />
                <Field label="License/Permit/Insp." value={inputs.licenseFees} onChange={v => update({ licenseFees: v })} prefix="$" aiAssumed={isAi("licenseFees")} onClearAi={() => clearAi("licenseFees")} />
                <Field label="Fire Meter Service" value={inputs.fireMeter} onChange={v => update({ fireMeter: v })} prefix="$" aiAssumed={isAi("fireMeter")} onClearAi={() => clearAi("fireMeter")} />
              </div>
            </Section>

            {/* Expenses — Utilities */}
            <Section title="Expenses — Utilities">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Electricity + Gas" value={inputs.electricityGas} onChange={v => update({ electricityGas: v })} prefix="$" aiAssumed={isAi("electricityGas")} onClearAi={() => clearAi("electricityGas")} />
                <Field label="Water / Sewer" value={inputs.waterSewer} onChange={v => update({ waterSewer: v })} prefix="$" aiAssumed={isAi("waterSewer")} onClearAi={() => clearAi("waterSewer")} />
              </div>
            </Section>

            {/* Expenses — Management */}
            <Section title="Expenses — Management & Personnel">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mgmt Fee" value={inputs.managementFeePercent} onChange={v => update({ managementFeePercent: v })} suffix="%" step="0.5" aiAssumed={isAi("managementFeePercent")} onClearAi={() => clearAi("managementFeePercent")} />
                <Field label="Payroll" value={inputs.payroll} onChange={v => update({ payroll: v })} prefix="$" aiAssumed={isAi("payroll")} onClearAi={() => clearAi("payroll")} />
              </div>
              <div className="bg-white/[0.03] rounded-lg p-3">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Calculated Mgmt Fee</span><span className="font-medium text-white">{fmt(outputs.managementFee)}</span></div>
              </div>
            </Section>

            {/* Expenses — Professional */}
            <Section title="Expenses — Professional Services">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Accounting" value={inputs.accounting} onChange={v => update({ accounting: v })} prefix="$" aiAssumed={isAi("accounting")} onClearAi={() => clearAi("accounting")} />
                <Field label="Legal" value={inputs.legal} onChange={v => update({ legal: v })} prefix="$" aiAssumed={isAi("legal")} onClearAi={() => clearAi("legal")} />
              </div>
              <Field label="Marketing / Leasing" value={inputs.marketing} onChange={v => update({ marketing: v })} prefix="$" aiAssumed={isAi("marketing")} onClearAi={() => clearAi("marketing")} />
            </Section>

            {/* Expenses — R&M */}
            <Section title="Expenses — Repairs & Maintenance">
              <div className="grid grid-cols-2 gap-3">
                <Field label="R&M General" value={inputs.rmGeneral} onChange={v => update({ rmGeneral: v })} prefix="$" aiAssumed={isAi("rmGeneral")} onClearAi={() => clearAi("rmGeneral")} />
                <Field label="R&M CapEx/Reserve" value={inputs.rmCapexReserve} onChange={v => update({ rmCapexReserve: v })} prefix="$" aiAssumed={isAi("rmCapexReserve")} onClearAi={() => clearAi("rmCapexReserve")} />
              </div>
              <Field label="General Admin" value={inputs.generalAdmin} onChange={v => update({ generalAdmin: v })} prefix="$" aiAssumed={isAi("generalAdmin")} onClearAi={() => clearAi("generalAdmin")} />
            </Section>

            {/* Expenses — Contract Services */}
            <Section title="Expenses — Contract Services" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Exterminating" value={inputs.exterminating} onChange={v => update({ exterminating: v })} prefix="$" aiAssumed={isAi("exterminating")} onClearAi={() => clearAi("exterminating")} />
                <Field label="Landscaping" value={inputs.landscaping} onChange={v => update({ landscaping: v })} prefix="$" aiAssumed={isAi("landscaping")} onClearAi={() => clearAi("landscaping")} />
                <Field label="Snow Removal" value={inputs.snowRemoval} onChange={v => update({ snowRemoval: v })} prefix="$" aiAssumed={isAi("snowRemoval")} onClearAi={() => clearAi("snowRemoval")} />
                <Field label="Elevator" value={inputs.elevator} onChange={v => update({ elevator: v })} prefix="$" aiAssumed={isAi("elevator")} onClearAi={() => clearAi("elevator")} />
                <Field label="Alarm Monitoring" value={inputs.alarmMonitoring} onChange={v => update({ alarmMonitoring: v })} prefix="$" aiAssumed={isAi("alarmMonitoring")} onClearAi={() => clearAi("alarmMonitoring")} />
                <Field label="Telephone/Internet" value={inputs.telephoneInternet} onChange={v => update({ telephoneInternet: v })} prefix="$" aiAssumed={isAi("telephoneInternet")} onClearAi={() => clearAi("telephoneInternet")} />
                <Field label="Cleaning" value={inputs.cleaning} onChange={v => update({ cleaning: v })} prefix="$" aiAssumed={isAi("cleaning")} onClearAi={() => clearAi("cleaning")} />
                <Field label="Trash Removal" value={inputs.trashRemoval} onChange={v => update({ trashRemoval: v })} prefix="$" aiAssumed={isAi("trashRemoval")} onClearAi={() => clearAi("trashRemoval")} />
              </div>
              <Field label="Other Contract Services" value={inputs.otherContractServices} onChange={v => update({ otherContractServices: v })} prefix="$" />
              <Field label="Annual Expense Growth" value={inputs.annualExpenseGrowth} onChange={v => update({ annualExpenseGrowth: v })} suffix="%" step="0.5" aiAssumed={isAi("annualExpenseGrowth")} onClearAi={() => clearAi("annualExpenseGrowth")} />
            </Section>

            {/* Custom Expense Items */}
            {inputs.customExpenseItems && inputs.customExpenseItems.length > 0 && (
              <Section title="Custom Expense Items" defaultOpen={true}>
                <div className="space-y-2">
                  {inputs.customExpenseItems.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        value={item.name}
                        onChange={e => updateCustomExpense(item.id, "name", e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-white"
                        placeholder="Expense name"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={e => updateCustomExpense(item.id, "amount", parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-right text-white"
                        />
                      </div>
                      <button onClick={() => removeCustomExpense(item.id)} className="text-slate-500 hover:text-red-400 text-sm">&times;</button>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Custom Income Items */}
            {inputs.customIncomeItems && inputs.customIncomeItems.length > 0 && (
              <Section title="Custom Income Items" defaultOpen={true}>
                <div className="space-y-2">
                  {inputs.customIncomeItems.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        value={item.name}
                        onChange={e => updateCustomIncome(item.id, "name", e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-white"
                        placeholder="Income name"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={e => updateCustomIncome(item.id, "amount", parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1.5 bg-slate-800/40 border border-white/5 rounded text-xs text-right text-white"
                        />
                      </div>
                      <button onClick={() => removeCustomIncome(item.id)} className="text-slate-500 hover:text-red-400 text-sm">&times;</button>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Exit Assumptions */}
            <Section title="Exit Assumptions" summary={`${inputs.holdPeriodYears}yr hold, ${inputs.exitCapRate}% exit cap`}>
              <div className="grid grid-cols-2 gap-3">
                <SliderField label="Hold Period (yrs)" value={inputs.holdPeriodYears} onChange={v => update({ holdPeriodYears: Math.max(1, Math.round(v)) })} min={1} max={30} step={1} suffix="yr" />
                <SliderField label="Exit Cap Rate" value={inputs.exitCapRate} onChange={v => update({ exitCapRate: v })} min={1} max={15} step={0.25} />
              </div>
              <Field label="Selling Costs" value={inputs.sellingCostPercent} onChange={v => update({ sellingCostPercent: v })} suffix="%" step="0.5" aiAssumed={isAi("sellingCostPercent")} onClearAi={() => clearAi("sellingCostPercent")} />
            </Section>

            {/* Notes */}
            <Section title="Notes" defaultOpen={!!notes}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Deal notes, assumptions, conditions..."
                rows={4}
                className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none placeholder:text-slate-600"
              />
            </Section>

            {/* Phase 10: Left Panel Sticky Summary Bar */}
            {structureAnalysis && (
              <div className="hidden lg:block sticky bottom-0 bg-slate-800/60 backdrop-blur-md border border-white/5 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between">
                  {[
                    { label: "CoC", value: fmtPct(structureAnalysis.cashOnCash), threshold: structureAnalysis.cashOnCash >= 8 ? "text-emerald-400" : structureAnalysis.cashOnCash >= 4 ? "text-amber-400" : "text-red-400" },
                    { label: "IRR", value: isFinite(structureAnalysis.irr) ? fmtPct(structureAnalysis.irr) : "N/A", threshold: structureAnalysis.irr >= 15 ? "text-emerald-400" : structureAnalysis.irr >= 8 ? "text-amber-400" : "text-red-400" },
                    { label: "Eq Multiple", value: fmtX(structureAnalysis.equityMultiple), threshold: structureAnalysis.equityMultiple >= 2 ? "text-emerald-400" : structureAnalysis.equityMultiple >= 1.5 ? "text-amber-400" : "text-red-400" },
                  ].map(m => (
                    <div key={m.label} className="text-center">
                      <p className="text-[9px] uppercase tracking-widest text-slate-500">{m.label}</p>
                      <p className={`text-sm font-bold ${m.threshold}`}>{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ======================== RIGHT PANEL — OUTPUTS ======================== */}
          <div className="flex-1 min-w-0 space-y-6 lg:max-h-[calc(100vh-65px)] lg:overflow-y-auto lg:sticky lg:top-[65px] no-scrollbar">

            {/* Structure Analysis */}
            {structureAnalysis && (
              <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">{structureAnalysis.label} Structure Analysis</h3>
                  <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wider">Deal Structure Engine</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "CoC Return", value: fmtPct(structureAnalysis.cashOnCash), color: structureAnalysis.cashOnCash >= 8 ? "text-green-400" : structureAnalysis.cashOnCash >= 4 ? "text-amber-400" : "text-red-400" },
                      { label: "IRR", value: isFinite(structureAnalysis.irr) ? fmtPct(structureAnalysis.irr) : "N/A", color: structureAnalysis.irr >= 15 ? "text-green-400" : structureAnalysis.irr >= 8 ? "text-amber-400" : "text-red-400" },
                      { label: "Equity Multiple", value: fmtX(structureAnalysis.equityMultiple), color: structureAnalysis.equityMultiple >= 2 ? "text-green-400" : structureAnalysis.equityMultiple >= 1.5 ? "text-amber-400" : "text-red-400" },
                      { label: "DSCR", value: structureAnalysis.dscr > 0 ? fmtX(structureAnalysis.dscr) : "N/A", color: structureAnalysis.dscr >= 1.25 ? "text-green-400" : structureAnalysis.dscr >= 1.0 ? "text-amber-400" : "text-red-400" },
                    ].map(m => (
                      <div key={m.label} className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">{m.label}</p>
                        <p className={`text-lg font-bold mt-0.5 ${m.color}`}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <div className="flex justify-between py-1"><span className="text-slate-500">Total Equity</span><span className="font-medium text-white">{fmt(structureAnalysis.totalEquity)}</span></div>
                    <div className="flex justify-between py-1"><span className="text-slate-500">Total Debt</span><span className="font-medium text-white">{fmt(structureAnalysis.totalDebt)}</span></div>
                    <div className="flex justify-between py-1"><span className="text-slate-500">Year 1 Cash Flow</span><span className={`font-medium ${structureAnalysis.cashFlow >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(structureAnalysis.cashFlow)}</span></div>
                    <div className="flex justify-between py-1"><span className="text-slate-500">Break-even Occ.</span><span className="font-medium text-white">{fmtPct(structureAnalysis.breakEvenOccupancy)}</span></div>
                    <div className="flex justify-between py-1"><span className="text-slate-500">Projected Sale</span><span className="font-medium text-white">{fmt(structureAnalysis.projectedSalePrice)}</span></div>
                    <div className="flex justify-between py-1"><span className="text-slate-500">Total Profit</span><span className={`font-medium ${structureAnalysis.totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(structureAnalysis.totalProfit)}</span></div>
                  </div>
                  {/* BRRRR-specific */}
                  {structureAnalysis.structure === "bridge_refi" && structureAnalysis.cashOutOnRefi != null && (
                    <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-emerald-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">BRRRR Metrics</p>
                        {(structureAnalysis.cashLeftInDeal || 0) <= 0 && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">Infinite Return</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">Cash-Out on Refi</span><span className="font-medium text-emerald-400">{fmt(structureAnalysis.cashOutOnRefi)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Cash Left in Deal</span><span className={`font-medium ${(structureAnalysis.cashLeftInDeal || 0) <= 0 ? "text-emerald-400" : "text-white"}`}>{fmt(structureAnalysis.cashLeftInDeal || 0)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Refi Loan</span><span className="font-medium text-white">{fmt(structureAnalysis.refiLoanAmount || 0)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Bridge Cost</span><span className="font-medium text-red-400">{fmt(structureAnalysis.totalBridgeCost || 0)}</span></div>
                      </div>
                    </div>
                  )}
                  {/* Assumable-specific */}
                  {structureAnalysis.structure === "assumable" && structureAnalysis.annualRateSavings != null && (
                    <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-green-500/20">
                      <p className="text-[10px] text-green-400 font-medium uppercase tracking-wider mb-2">Rate Advantage</p>
                      {/* Visual rate comparison */}
                      {(() => {
                        const assumed = structureAnalysis.blendedRate || ((mergedStructureInputs as any).existingRate || 3.5);
                        const market = fredRate || 7;
                        const maxR = Math.max(assumed, market, 1);
                        return (
                          <div className="space-y-2 mb-3">
                            <div>
                              <div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-500">Blended Rate</span><span className="text-emerald-400 font-mono font-medium">{fmtPct(assumed)}</span></div>
                              <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(assumed / maxR) * 100}%` }} /></div>
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] mb-0.5"><span className="text-slate-500">Market Rate</span><span className="text-amber-400 font-mono font-medium">{fmtPct(market)}</span></div>
                              <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${(market / maxR) * 100}%` }} /></div>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                          <p className="text-[9px] text-slate-500 uppercase">Annual</p>
                          <p className="font-bold text-emerald-400">{fmt(structureAnalysis.annualRateSavings)}</p>
                        </div>
                        <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
                          <p className="text-[9px] text-slate-500 uppercase">Total</p>
                          <p className="font-bold text-emerald-400">{fmt(structureAnalysis.totalRateSavings || 0)}</p>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg p-2 text-center">
                          <p className="text-[9px] text-slate-500 uppercase">Blended</p>
                          <p className="font-bold text-white">{fmtPct(structureAnalysis.blendedRate || 0)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Syndication waterfall visualization */}
                  {structureAnalysis.structure === "syndication" && structureAnalysis.gpIrr != null && (() => {
                    const gpPct = (mergedStructureInputs as any).gpEquityPct ?? 10;
                    const lpPct = (mergedStructureInputs as any).lpEquityPct ?? 90;
                    const prefReturn = (mergedStructureInputs as any).preferredReturn ?? 8;
                    const gpPromotePref = (mergedStructureInputs as any).gpPromoteAbovePref ?? 20;
                    const irrHurdle = (mergedStructureInputs as any).irrHurdle ?? 15;
                    const gpPromoteHurdle = (mergedStructureInputs as any).gpPromoteAboveHurdle ?? 30;
                    const gpTotal = structureAnalysis.gpTotalReturn || 0;
                    const lpTotal = structureAnalysis.lpTotalReturn || 0;
                    const totalReturns = gpTotal + lpTotal;
                    const gpPctOfReturns = totalReturns > 0 ? (gpTotal / totalReturns * 100) : 0;
                    const lpPctOfReturns = totalReturns > 0 ? (lpTotal / totalReturns * 100) : 0;
                    const tiers = [
                      { label: `Preferred Return (${prefReturn}%)`, lpSplit: 100, gpSplit: 0, shade: "bg-violet-500/20" },
                      { label: "Above Pref", lpSplit: 100 - gpPromotePref, gpSplit: gpPromotePref, shade: "bg-violet-500/40" },
                      { label: `Above ${irrHurdle}% IRR`, lpSplit: 100 - gpPromoteHurdle, gpSplit: gpPromoteHurdle, shade: "bg-violet-500/60" },
                    ];
                    return (
                      <div className="mt-3 bg-white/[0.03] rounded-lg p-3 border border-violet-500/20">
                        <p className="text-[10px] text-violet-400 font-medium uppercase tracking-wider mb-3">Promote Waterfall</p>
                        <div className="space-y-2 mb-3">
                          {tiers.map((t, i) => (
                            <div key={i}>
                              <div className="flex items-center justify-between text-[10px] mb-0.5">
                                <span className="text-slate-400">{t.label}</span>
                                <span className="text-slate-500">{t.lpSplit}% LP / {t.gpSplit}% GP</span>
                              </div>
                              <div className="h-3 bg-white/5 rounded-full overflow-hidden flex">
                                <div className="h-full bg-blue-500/60 transition-all" style={{ width: `${t.lpSplit}%` }} />
                                <div className={`h-full ${t.shade} transition-all`} style={{ width: `${t.gpSplit}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 text-[9px] text-slate-500 mb-3">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500/60" /> LP</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-500/40" /> GP Promote</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-violet-500/10 rounded-lg p-2.5 text-center border border-violet-500/20">
                            <p className="text-[9px] text-slate-500 uppercase mb-0.5">GP Total</p>
                            <p className="text-sm font-bold text-violet-400">{fmt(gpTotal)}</p>
                            <p className="text-[10px] text-slate-500">{gpPctOfReturns.toFixed(0)}% of returns</p>
                            <div className="flex justify-center gap-3 mt-1 text-[10px]">
                              <span className="text-slate-400">IRR: <span className="text-violet-400 font-medium">{fmtPct(structureAnalysis.gpIrr || 0)}</span></span>
                              <span className="text-slate-400">{fmtX(structureAnalysis.gpEquityMultiple || 0)}</span>
                            </div>
                          </div>
                          <div className="bg-blue-500/10 rounded-lg p-2.5 text-center border border-blue-500/20">
                            <p className="text-[9px] text-slate-500 uppercase mb-0.5">LP Total</p>
                            <p className="text-sm font-bold text-blue-400">{fmt(lpTotal)}</p>
                            <p className="text-[10px] text-slate-500">{lpPctOfReturns.toFixed(0)}% of returns</p>
                            <div className="flex justify-center gap-3 mt-1 text-[10px]">
                              <span className="text-slate-400">IRR: <span className="text-blue-400 font-medium">{fmtPct(structureAnalysis.lpIrr || 0)}</span></span>
                              <span className="text-slate-400">{fmtX(structureAnalysis.lpEquityMultiple || 0)}</span>
                            </div>
                          </div>
                        </div>
                        {(structureAnalysis.totalFees || 0) > 0 && (
                          <div className="mt-2 text-center text-[10px] text-slate-500">Sponsor Fees: <span className="text-white font-medium">{fmt(structureAnalysis.totalFees || 0)}</span></div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Comparison Table */}
            {showComparison && comparisonResults.length > 0 && (
              <div className="bg-slate-800/20 border border-violet-500/20 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 bg-white/[0.03] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Structure Comparison</h3>
                  <button onClick={() => setShowComparison(false)} className="text-xs text-violet-400 hover:text-violet-300">Close</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead className="bg-white/[0.03]">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-slate-500">Metric</th>
                        {comparisonResults.map(r => (
                          <th key={r.structure} className={`text-center px-3 py-3 font-semibold ${r.structure === activeStructure ? "text-blue-400 bg-blue-500/10" : "text-slate-500"}`}>
                            {r.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { key: "cashOnCash", label: "Cash-on-Cash", format: fmtPct, best: "max" as const },
                        { key: "irr", label: "IRR", format: fmtPct, best: "max" as const },
                        { key: "equityMultiple", label: "Equity Multiple", format: fmtX, best: "max" as const },
                        { key: "totalEquity", label: "Total Equity", format: fmt, best: "min" as const },
                        { key: "totalDebt", label: "Total Debt", format: fmt, best: "min" as const },
                        { key: "dscr", label: "DSCR", format: fmtX, best: "max" as const },
                        { key: "cashFlow", label: "Year 1 Cash Flow", format: fmt, best: "max" as const },
                        { key: "breakEvenOccupancy", label: "Break-even Occ.", format: fmtPct, best: "min" as const },
                        { key: "totalProfit", label: "Total Profit", format: fmt, best: "max" as const },
                      ]).map(({ key, label, format, best }) => {
                        const values = comparisonResults.map(r => (r as unknown as Record<string, number>)[key]);
                        const validValues = values.filter(v => isFinite(v) && v !== 0);
                        const bestVal = validValues.length > 0 ? (best === "max" ? Math.max(...validValues) : Math.min(...validValues)) : null;
                        return (
                          <tr key={key} className="border-t border-white/5">
                            <td className="px-4 py-2 font-medium text-slate-400">{label}</td>
                            {comparisonResults.map(r => {
                              const val = (r as unknown as Record<string, number>)[key];
                              const isBest = bestVal !== null && isFinite(val) && val !== 0 && val === bestVal;
                              return (
                                <td key={r.structure} className={`text-center px-3 py-2 font-medium ${isBest ? "text-green-400 bg-green-500/10" : r.structure === activeStructure ? "text-blue-400 bg-blue-500/5" : "text-slate-200"}`}>
                                  {isFinite(val) ? format(val) : "N/A"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* KPI Cards with Semi-Circular Gauges */}
            {(() => {
              const hasData = inputs.purchasePrice > 0 && outputs.noi !== 0;
              const beOcc = outputs.totalIncome > 0 ? ((outputs.totalExpenses + outputs.annualDebtService) / outputs.totalIncome) * 100 : 0;
              const kpis = [
                { label: "Cash-on-Cash", value: outputs.cashOnCashAmort, display: fmtPct(outputs.cashOnCashAmort), min: 0, max: 20, thresholds: [8, 4], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "Annual cash flow ÷ total equity invested. Target: 8-12% for stabilized multifamily." },
                { label: "IRR", value: outputs.irr, display: isFinite(outputs.irr) ? fmtPct(outputs.irr) : "N/A", min: 0, max: 30, thresholds: [15, 8], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "Internal Rate of Return — time-weighted annualized return over hold period. Target: 15%+ for value-add." },
                { label: "Equity Multiple", value: outputs.equityMultiple, display: fmtX(outputs.equityMultiple), min: 0, max: 4, thresholds: [2, 1.5], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "Total profit ÷ equity invested. 2.0x = you doubled your money. Target: 1.5-2.5x over 5-7 years." },
                { label: "Cap Rate", value: outputs.capRate, display: fmtPct(outputs.capRate), min: 0, max: 12, thresholds: [5, 3], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "NOI ÷ purchase price. Higher = better yield. NYC multifamily: 4-6% typical." },
                { label: "DSCR", value: outputs.dscr, display: fmtX(outputs.dscr), min: 0, max: 3, thresholds: [1.25, 1.0], hex: ["#34d399", "#fbbf24", "#f87171"], tip: "NOI ÷ annual debt service. Lenders require 1.20-1.25x minimum. Below 1.0x = negative cash flow." },
                { label: "Break-Even Occ.", value: beOcc, display: `${beOcc.toFixed(1)}%`, min: 0, max: 100, thresholds: [75, 90], hex: ["#34d399", "#fbbf24", "#f87171"], invert: true, tip: "Occupancy needed to cover expenses + debt service. Below 75% = strong cushion. Above 90% = risky." },
              ];
              return (
                <div className="sticky top-0 z-10 bg-[#0B0F19]/95 backdrop-blur-sm pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {kpis.map(k => {
                      if (!hasData) {
                        return (
                          <div key={k.label} className="border border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center">
                            <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wider mb-1">{k.label}</p>
                            <div className="w-20 -mb-3 opacity-20">
                              <MetricGauge value={0} min={k.min} max={k.max} color="rgba(255,255,255,0.1)" />
                            </div>
                            <p className="text-lg font-bold text-slate-700">—</p>
                          </div>
                        );
                      }
                      const hexColor = k.invert
                        ? (k.value <= k.thresholds[0] ? k.hex[0] : k.value <= k.thresholds[1] ? k.hex[1] : k.hex[2])
                        : (k.value >= k.thresholds[0] ? k.hex[0] : k.value >= k.thresholds[1] ? k.hex[1] : k.hex[2]);
                      const textColor = k.invert
                        ? (k.value <= k.thresholds[0] ? "text-emerald-400" : k.value <= k.thresholds[1] ? "text-amber-400" : "text-red-400")
                        : (k.value >= k.thresholds[0] ? "text-emerald-400" : k.value >= k.thresholds[1] ? "text-amber-400" : "text-red-400");
                      return (
                        <div key={k.label} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col items-center relative group">
                          <div className="flex items-center gap-1 mb-1">
                            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{k.label}</p>
                            <Info className="w-3 h-3 text-slate-600 cursor-help" />
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 p-2.5 bg-[#0B0F19] border border-white/10 rounded-lg shadow-xl text-[10px] text-slate-300 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-20">
                              {k.tip}
                            </div>
                          </div>
                          <div className="w-20 -mb-3">
                            <MetricGauge value={k.value} min={k.min} max={k.max} color={hexColor} />
                          </div>
                          <p className={`text-lg font-bold transition-all duration-200 ${textColor}`}>{k.display}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Year 1 Budget P&L — PRIMARY OUTPUT */}
            <div className="bg-slate-800/20 border border-blue-500/20 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 bg-white/[0.03] flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Year 1 Budget P&L</h3>
                {expenseFlags.length > 0 && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                    {expenseFlags.length} flag{expenseFlags.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="text-left py-1 font-medium">Line Item</th>
                      <th className="text-right py-1 font-medium">Year 1 Budget</th>
                      <th className="text-right py-1 font-medium">Per Unit</th>
                      <th className="text-right py-1 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* RESIDENTIAL INCOME */}
                    <tr className="border-t border-white/5"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-400">Residential Income</td></tr>
                    <PnlRowFull label="Gross Potential Residential Rent" value={outputs.grossPotentialResidentialRent} perUnit={totalUnits > 0 ? Math.round(outputs.grossPotentialResidentialRent / totalUnits) : undefined} />
                    <PnlRowFull label="Less: Residential Vacancy" value={-outputs.residentialVacancyLoss} indent note={`${inputs.residentialVacancyRate}%`} />
                    {outputs.concessionsLoss > 0 && <PnlRowFull label="Less: Concessions" value={-outputs.concessionsLoss} indent />}
                    <PnlRowFull label="Net Residential Rental Income" value={outputs.netResidentialIncome} bold border />

                    {/* COMMERCIAL INCOME */}
                    {outputs.grossPotentialCommercialRent > 0 && (
                      <>
                        <tr className="border-t border-white/5"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-400">Commercial Income</td></tr>
                        <PnlRowFull label="Gross Potential Commercial Rent" value={outputs.grossPotentialCommercialRent} />
                        <PnlRowFull label="Less: Commercial Vacancy" value={-outputs.commercialVacancyLoss} indent note={`${inputs.commercialVacancyRate}%`} />
                        {outputs.commercialConcessionsLoss > 0 && <PnlRowFull label="Less: Concessions" value={-outputs.commercialConcessionsLoss} indent />}
                        <PnlRowFull label="Net Commercial Rental Income" value={outputs.netCommercialIncome} bold border />
                      </>
                    )}

                    {/* OTHER INCOME */}
                    {outputs.totalOtherIncome > 0 && (
                      <>
                        <tr className="border-t border-white/5"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-400">Other Income</td></tr>
                        <PnlRowFull label="Total Other Income" value={outputs.totalOtherIncome} />
                      </>
                    )}

                    {/* TOTAL INCOME */}
                    <tr className="border-t-2 border-white/10">
                      <td className="py-2 font-bold text-white">TOTAL INCOME</td>
                      <td className="py-2 text-right font-bold text-white">{fmt(outputs.totalIncome)}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.totalIncome / totalUnits)) : ""}</td>
                      <td></td>
                    </tr>

                    {/* OPERATING EXPENSES */}
                    <tr><td colSpan={4} className="pt-4 pb-1 text-[10px] uppercase tracking-wider font-bold text-red-400">Operating Expenses</td></tr>
                    {outputs.expenseDetails.filter(d => d.amount > 0).map((d, i) => {
                      const flag = d.field ? getFlagForField(d.field) : undefined;
                      return (
                        <tr key={i} className={`border-t border-white/[0.03] ${flag ? "bg-amber-500/5" : ""}`}>
                          <td className="py-1.5 text-slate-400 flex items-center gap-1">
                            {flag && <span className="text-amber-400 cursor-help" title={flag.message}>&#9888;</span>}
                            {d.label}
                            {d.source && (
                              <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${d.source === 't12' ? 'bg-blue-500/10 text-blue-400' : d.source === 'ai_estimate' ? 'bg-purple-500/10 text-purple-400' : 'bg-white/5 text-slate-500'}`}>
                                {d.methodology || d.source}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-right text-slate-200">{fmt(d.amount)}</td>
                          <td className="py-1.5 text-right text-xs text-slate-500">{d.perUnit != null && d.perUnit > 0 ? fmt(d.perUnit) : ""}</td>
                          <td className="py-1.5 text-right">
                            {flag && flag.suggestedAmount != null && (
                              <button
                                onClick={() => applySuggestedAmount(flag)}
                                className="text-[9px] text-blue-400 hover:text-blue-300 underline"
                              >
                                Use {fmt(flag.suggestedAmount)}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-white/5">
                      <td className="py-2 font-semibold text-white">Total Operating Expenses</td>
                      <td className="py-2 text-right font-semibold text-red-400">{fmt(outputs.totalExpenses)}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.totalExpenses / totalUnits)) : ""}</td>
                      <td></td>
                    </tr>

                    {/* NOI */}
                    <tr className="border-t-2 border-double border-white/10">
                      <td className="py-3 font-bold text-lg text-white">NET OPERATING INCOME</td>
                      <td className={`py-3 text-right font-bold text-lg ${outputs.noi >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(outputs.noi)}</td>
                      <td className="py-3 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.noi / totalUnits)) : ""}</td>
                      <td></td>
                    </tr>

                    {/* Below NOI */}
                    <PnlRowFull label="IO Debt Service" value={-outputs.ioAnnualPayment} />
                    <PnlRowFull label="Net Income (IO)" value={outputs.netIncomeIO} bold border />
                    <PnlRowFull label="Amort Debt Service (30yr)" value={-outputs.annualDebtService} />
                    <PnlRowFull label="Net Income (Amort)" value={outputs.netIncomeAmort} bold border />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Analysis Section */}
            <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Analysis</h3></div>
              <div className="p-5">
                <table className="w-full text-sm">
                  <tbody>
                    <PnlRow label="Purchase Price" value={inputs.purchasePrice} />
                    <PnlRow label="Cap Rate" value={0} customValue={fmtPct(outputs.capRate)} />
                    <PnlRow label={`Loan Size (${inputs.ltvPercent}% LTV)`} value={outputs.loanAmount} />
                    <PnlRow label="Equity In + Closing" value={outputs.totalEquity} />
                    <PnlRow label="Interest Rate" value={0} customValue={`${inputs.interestRate}%`} />
                    <PnlRow label="IO Payment (Annual)" value={outputs.ioAnnualPayment} />
                    <PnlRow label="Amort Payment (30yr)" value={outputs.annualDebtService} />
                    <PnlRow label="Net Income (IO Loan)" value={outputs.netIncomeIO} bold border />
                    <PnlRow label="Net Income (Amort Loan)" value={outputs.netIncomeAmort} bold border />
                    <PnlRow label="Cash-on-Cash (IO)" value={0} customValue={fmtPct(outputs.cashOnCashIO)} />
                    <PnlRow label="Cash-on-Cash (Amort)" value={0} customValue={fmtPct(outputs.cashOnCashAmort)} />
                    <PnlRow label="Loan-to-Value" value={0} customValue={fmtPct(inputs.ltvPercent)} />
                    <PnlRow label="DSCR (30yr Amort)" value={0} customValue={fmtX(outputs.dscr)} />
                    <PnlRow label="Debt Yield" value={0} customValue={fmtPct(outputs.debtYield)} />
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cash Flow Chart */}
            <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="text-sm font-semibold text-slate-200">Cash Flow</h3>
              </div>
              <div className="px-4 py-3" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={[
                    ...outputs.cashFlows.map(cf => ({
                      name: `Yr ${cf.year}`,
                      cashFlow: cf.cashFlow,
                      cumulative: cf.cumulativeCashFlow,
                      isExit: false,
                    })),
                    {
                      name: "Exit",
                      cashFlow: outputs.exitProceeds,
                      cumulative: outputs.cashFlows.length > 0 ? outputs.cashFlows[outputs.cashFlows.length - 1].cumulativeCashFlow + outputs.exitProceeds : outputs.exitProceeds,
                      isExit: true,
                    },
                  ]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={{ stroke: "rgba(255,255,255,0.05)" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000000 || v <= -1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 || v <= -1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`} width={55} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0B0F19", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#94a3b8" }}
                      formatter={(value?: number, name?: string) => [fmt(Math.round(value ?? 0)), name === "cashFlow" ? "Cash Flow" : "Cumulative"]}
                    />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
                    <Bar dataKey="cashFlow" radius={[3, 3, 0, 0]} maxBarSize={28}>
                      {[...outputs.cashFlows.map(cf => ({ isExit: false, cashFlow: cf.cashFlow })), { isExit: true, cashFlow: outputs.exitProceeds }].map((entry, i) => (
                        <Cell key={i} fill={entry.isExit ? "#3b82f6" : entry.cashFlow >= 0 ? "#34d399" : "#f87171"} fillOpacity={entry.isExit ? 0.8 : 0.6} />
                      ))}
                    </Bar>
                    <Line type="monotone" dataKey="cumulative" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Year-by-Year Projections — Collapsible */}
            <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
              <Section title="Year-by-Year Projections" defaultOpen={false} summary={`${outputs.cashFlows.length} years + exit`}>
                <div className="overflow-x-auto -mx-4 -mb-3">
                  <table className="w-full text-xs font-mono min-w-[700px]">
                    <thead className="bg-white/[0.03] sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold text-slate-500 tabular-nums">Year</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500">Income</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500">Vacancy</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500">NOI</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500">Debt Svc</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500">Cash Flow</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500">Value</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-500">Equity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outputs.cashFlows.map((cf, i) => {
                        const projValue = inputs.exitCapRate > 0 ? cf.noi / (inputs.exitCapRate / 100) : 0;
                        const loanBal = outputs.loanAmount; // simplified — principal paydown ignored for projection
                        const equity = projValue - loanBal;
                        return (
                          <tr key={cf.year} className={`border-t border-white/5 ${i % 2 === 1 ? "bg-white/[0.015]" : ""}`}>
                            <td className="px-4 py-1.5 font-medium text-slate-300 tabular-nums">{cf.year}</td>
                            <td className="text-right px-3 py-1.5 text-slate-400 tabular-nums">{fmt(cf.egi)}</td>
                            <td className="text-right px-3 py-1.5 text-red-400/70 tabular-nums">({fmt(cf.vacancy)})</td>
                            <td className="text-right px-3 py-1.5 font-medium text-white tabular-nums">{fmt(cf.noi)}</td>
                            <td className="text-right px-3 py-1.5 text-red-400/70 tabular-nums">({fmt(cf.debtService)})</td>
                            <td className={`text-right px-3 py-1.5 font-medium tabular-nums ${cf.cashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(cf.cashFlow)}</td>
                            <td className="text-right px-3 py-1.5 text-slate-400 tabular-nums">{projValue > 0 ? fmt(Math.round(projValue)) : "—"}</td>
                            <td className={`text-right px-3 py-1.5 tabular-nums ${equity >= 0 ? "text-blue-400" : "text-red-400"}`}>{projValue > 0 ? fmt(Math.round(equity)) : "—"}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-white/10 bg-blue-500/5">
                        <td className="px-4 py-2 font-semibold text-slate-200">Exit</td>
                        <td colSpan={2} className="text-right px-3 py-2 text-[10px] text-slate-500">Sale @ {fmtPct(inputs.exitCapRate)} Cap</td>
                        <td className="text-right px-3 py-2 font-medium text-white tabular-nums">{fmt(outputs.exitValue)}</td>
                        <td className="text-right px-3 py-2 text-red-400 tabular-nums">({fmt(outputs.loanBalanceAtExit)})</td>
                        <td className="text-right px-3 py-2 font-bold text-blue-400 tabular-nums">{fmt(outputs.exitProceeds)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>

            {/* Sensitivity Matrix */}
            <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Sensitivity Analysis — IRR</h3></div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">{outputs.sensitivity.rowParam} \ {outputs.sensitivity.colParam}</th>
                      {outputs.sensitivity.colLabels.map((cl, i) => (
                        <th key={i} className={`px-3 py-2 text-center font-medium ${cl === "Base" ? "text-blue-400 bg-blue-500/10" : "text-slate-500"}`}>{cl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.sensitivity.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-white/5">
                        <td className={`px-3 py-2 font-medium ${outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%` ? "text-blue-400 bg-blue-500/10" : "text-slate-400"}`}>
                          {outputs.sensitivity.rowLabels[ri]}
                        </td>
                        {row.map((val, ci) => {
                          const isBase = outputs.sensitivity.colLabels[ci] === "Base" && outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%`;
                          return (
                            <td key={ci} className={`px-3 py-2 text-center font-medium ${isBase ? "bg-blue-500/20 text-blue-300 font-bold" : val >= 15 ? "text-green-400" : val >= 8 ? "text-amber-400" : "text-red-400"}`}>
                              {isFinite(val) ? `${val.toFixed(1)}%` : "N/A"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sources & Uses — Compact Monospaced */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Sources</h3>
                </div>
                <div className="px-4 py-2">
                  {outputs.sources.map((s, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                      <span className="text-xs text-slate-400">{s.label}</span>
                      <span className="text-xs font-mono tabular-nums font-medium text-white">{fmt(s.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1.5 mt-0.5 border-t border-white/10">
                    <span className="text-xs font-semibold text-white">Total</span>
                    <span className="text-xs font-mono tabular-nums font-bold text-white">{fmt(outputs.sources.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 bg-white/[0.03]">
                  <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Uses</h3>
                </div>
                <div className="px-4 py-2">
                  {outputs.uses.map((u, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-white/5 last:border-0">
                      <span className="text-xs text-slate-400">{u.label}</span>
                      <span className="text-xs font-mono tabular-nums font-medium text-white">{fmt(u.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-1.5 mt-0.5 border-t border-white/10">
                    <span className="text-xs font-semibold text-white">Total</span>
                    <span className="text-xs font-mono tabular-nums font-bold text-white">{fmt(outputs.uses.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exit Analysis */}
            <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Exit Analysis</h3></div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-xs text-slate-500 uppercase">Exit NOI</p><p className="text-lg font-bold text-white">{fmt(outputs.exitNoi)}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase">Exit Value</p><p className="text-lg font-bold text-white">{fmt(outputs.exitValue)}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase">Loan Balance</p><p className="text-lg font-bold text-red-400">{fmt(outputs.loanBalanceAtExit)}</p></div>
                  <div><p className="text-xs text-slate-500 uppercase">Net Proceeds</p><p className="text-lg font-bold text-green-400">{fmt(outputs.exitProceeds)}</p></div>
                </div>
              </div>
            </div>

            {/* Live Comps */}
            <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Live Comps</h3>
                {!compsLoading && comps.length === 0 && propertyDetails && (
                  <button
                    onClick={() => {
                      const zip = propertyDetails.bbl?.substring(0, 5) || "";
                      if (zip) loadComps(zip);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Load Comps
                  </button>
                )}
              </div>
              <div className="p-5">
                {compsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-400 border-t-transparent rounded-full" />
                    Searching comparable sales...
                  </div>
                ) : comps.length > 0 && compSummary ? (
                  <>
                    {/* Market comparison */}
                    {inputs.purchasePrice > 0 && totalUnits > 0 && compSummary.avgPricePerUnit > 0 && (
                      <div className={`mb-4 rounded-lg p-3 ${
                        inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
                      }`}>
                        <p className={`text-sm font-medium ${inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "text-green-400" : "text-red-400"}`}>
                          Your offer: {fmt(Math.round(inputs.purchasePrice / totalUnits))}/unit — Market avg: {fmt(compSummary.avgPricePerUnit)}/unit
                          {" "}({Math.abs(Math.round(((inputs.purchasePrice / totalUnits) / compSummary.avgPricePerUnit - 1) * 100))}% {inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "below" : "above"})
                        </p>
                        {inputs.purchasePrice / totalUnits > compSummary.avgPricePerUnit && (
                          <button
                            onClick={() => update({ purchasePrice: compSummary.avgPricePerUnit * totalUnits })}
                            className="mt-1 text-xs text-blue-400 hover:text-blue-300 underline"
                          >
                            Use Market Avg as Offer
                          </button>
                        )}
                      </div>
                    )}

                    {/* Summary stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-white/[0.03] rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase">Comps Found</p>
                        <p className="text-sm font-bold text-white">{compSummary.count}</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase">Avg $/Unit</p>
                        <p className="text-sm font-bold text-white">{fmt(compSummary.avgPricePerUnit)}</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase">Median $/Unit</p>
                        <p className="text-sm font-bold text-white">{fmt(compSummary.medianPricePerUnit)}</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase">Avg $/SqFt</p>
                        <p className="text-sm font-bold text-white">{compSummary.avgPricePerSqft > 0 ? fmt(compSummary.avgPricePerSqft) : "—"}</p>
                      </div>
                    </div>

                    {/* Filter controls */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <label className="text-[10px] text-slate-500 flex items-center gap-1">
                        Radius:
                        <select value={compRadius} onChange={e => setCompRadius(parseFloat(e.target.value))} className="bg-slate-800/40 border border-white/5 rounded px-1 py-0.5 text-xs text-white">
                          <option value="0.5">0.5 mi</option>
                          <option value="1">1 mi</option>
                          <option value="2">2 mi</option>
                          <option value="5">5 mi</option>
                          <option value="10">10 mi</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-500 flex items-center gap-1">
                        Years:
                        <select value={compYears} onChange={e => setCompYears(parseInt(e.target.value))} className="bg-slate-800/40 border border-white/5 rounded px-1 py-0.5 text-xs text-white">
                          <option value="1">1 yr</option>
                          <option value="2">2 yr</option>
                          <option value="3">3 yr</option>
                          <option value="5">5 yr</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-500 flex items-center gap-1">
                        Min Units:
                        <select value={compMinUnits} onChange={e => setCompMinUnits(parseInt(e.target.value))} className="bg-slate-800/40 border border-white/5 rounded px-1 py-0.5 text-xs text-white">
                          <option value="3">3+</option>
                          <option value="5">5+</option>
                          <option value="10">10+</option>
                          <option value="20">20+</option>
                        </select>
                      </label>
                      {propertyDetails && (
                        <button
                          onClick={() => {
                            const zip = propertyDetails.bbl?.substring(0, 5) || "";
                            if (zip) loadComps(zip);
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                        >
                          Refresh
                        </button>
                      )}
                    </div>

                    {/* Comps table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[700px]">
                        <thead className="bg-white/[0.03]">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-500">Address</th>
                            <th className="text-center px-2 py-2 font-medium text-slate-500">Boro</th>
                            <th className="text-center px-2 py-2 font-medium text-slate-500">Units</th>
                            <th className="text-right px-2 py-2 font-medium text-slate-500">SqFt</th>
                            <th className="text-center px-2 py-2 font-medium text-slate-500">Built</th>
                            <th className="text-right px-3 py-2 font-medium text-slate-500">Sale Price</th>
                            <th className="text-right px-2 py-2 font-medium text-slate-500">$/Unit</th>
                            <th className="text-right px-2 py-2 font-medium text-slate-500">$/SqFt</th>
                            <th className="text-center px-2 py-2 font-medium text-slate-500">Date</th>
                            <th className="text-center px-2 py-2 font-medium text-slate-500">Dist</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comps.slice(0, 20).map((c, i) => (
                            <tr key={i} className="border-t border-white/5 hover:bg-white/[0.03]">
                              <td className="px-3 py-1.5 text-slate-200 max-w-[180px] truncate" title={c.address}>{c.address}</td>
                              <td className="text-center px-2 py-1.5 text-slate-400">{c.borough.substring(0, 3)}</td>
                              <td className="text-center px-2 py-1.5 text-white">{c.totalUnits}</td>
                              <td className="text-right px-2 py-1.5 text-slate-400">{c.grossSqft > 0 ? c.grossSqft.toLocaleString() : "—"}</td>
                              <td className="text-center px-2 py-1.5 text-slate-400">{c.yearBuilt || "—"}</td>
                              <td className="text-right px-3 py-1.5 font-medium text-white">{fmt(c.salePrice)}</td>
                              <td className="text-right px-2 py-1.5 text-slate-200">{c.pricePerUnit > 0 ? fmt(c.pricePerUnit) : "—"}</td>
                              <td className="text-right px-2 py-1.5 text-slate-400">{c.pricePerSqft > 0 ? `$${c.pricePerSqft}` : "—"}</td>
                              <td className="text-center px-2 py-1.5 text-slate-400">{c.saleDate ? new Date(c.saleDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : "—"}</td>
                              <td className="text-center px-2 py-1.5 text-slate-500">{c.distance} mi</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">{propertyDetails ? "Click Load Comps to search comparable sales." : "Pre-fill a property to enable comps search."}</p>
                )}
              </div>
            </div>

            {/* Property Details (from pre-fill) */}
            {propertyDetails && (
              <div className="bg-slate-800/20 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5"><h3 className="text-sm font-semibold text-slate-200">Property Details</h3></div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                    <div><p className="text-xs text-slate-500">Address</p><p className="font-medium text-white">{propertyDetails.address}</p></div>
                    <div><p className="text-xs text-slate-500">Borough</p><p className="font-medium text-white">{propertyDetails.borough}</p></div>
                    <div><p className="text-xs text-slate-500">Block / Lot</p><p className="font-medium text-white">{propertyDetails.block} / {propertyDetails.lot}</p></div>
                    <div><p className="text-xs text-slate-500">BBL</p><p className="font-medium text-white">{propertyDetails.bbl}</p></div>
                    <div><p className="text-xs text-slate-500">Res Units</p><p className="font-medium text-white">{propertyDetails.unitsRes || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Total Units</p><p className="font-medium text-white">{propertyDetails.unitsTotal || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Year Built</p><p className="font-medium text-white">{propertyDetails.yearBuilt || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Stories</p><p className="font-medium text-white">{propertyDetails.numFloors || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Building Area</p><p className="font-medium text-white">{propertyDetails.bldgArea > 0 ? `${propertyDetails.bldgArea.toLocaleString()} sqft` : "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Lot Area</p><p className="font-medium text-white">{propertyDetails.lotArea > 0 ? `${propertyDetails.lotArea.toLocaleString()} sqft` : "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Zoning</p><p className="font-medium text-white">{propertyDetails.zoneDist || "—"}</p></div>
                    <div><p className="text-xs text-slate-500">Building Class</p><p className="font-medium text-white">{propertyDetails.bldgClass || "—"}</p></div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ======================== T-12 MODAL ======================== */}
      {showT12Modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowT12Modal(false)} />
          <div className="relative bg-[#0B0F19] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-[modal-in_0.2s_ease-out]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-bold text-white">Enter T-12 Actuals</h2>
                <p className="text-xs text-slate-500 mt-0.5">Enter trailing 12-month actual expenses. Year 1 Budget = T-12 x Growth Factor.</p>
              </div>
              <button onClick={() => setShowT12Modal(false)} className="text-slate-500 hover:text-slate-300 text-2xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_110px_80px_100px] gap-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider pb-1">
                  <span>Expense</span>
                  <span className="text-right">T-12 Actual</span>
                  <span className="text-center">Growth</span>
                  <span className="text-right">Yr 1 Budget</span>
                </div>
                {[
                  { field: "realEstateTaxes", label: "Real Estate Taxes" },
                  { field: "insurance", label: "Property Insurance" },
                  { field: "licenseFees", label: "License/Permit/Insp." },
                  { field: "fireMeter", label: "Fire Meter Service" },
                  { field: "electricityGas", label: "Electricity + Gas" },
                  { field: "waterSewer", label: "Water / Sewer" },
                  { field: "payroll", label: "Payroll" },
                  { field: "accounting", label: "Accounting" },
                  { field: "legal", label: "Legal" },
                  { field: "marketing", label: "Marketing / Leasing" },
                  { field: "rmGeneral", label: "R&M General" },
                  { field: "rmCapexReserve", label: "R&M CapEx/Reserve" },
                  { field: "generalAdmin", label: "General Admin" },
                  { field: "exterminating", label: "Exterminating" },
                  { field: "landscaping", label: "Landscaping" },
                  { field: "snowRemoval", label: "Snow Removal" },
                  { field: "elevator", label: "Elevator" },
                  { field: "alarmMonitoring", label: "Alarm Monitoring" },
                  { field: "telephoneInternet", label: "Telephone/Internet" },
                  { field: "cleaning", label: "Cleaning" },
                  { field: "trashRemoval", label: "Trash Removal" },
                ].map(({ field, label }) => {
                  const t12Val = t12Draft[field] || 0;
                  const gf = t12GrowthDraft[field] || 1.03;
                  const budgeted = t12Val > 0 ? Math.round(t12Val * gf) : 0;
                  return (
                    <div key={field} className="grid grid-cols-[1fr_110px_80px_100px] gap-2 items-center py-1 border-t border-white/[0.03]">
                      <span className="text-xs text-slate-400">{label}</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">$</span>
                        <input
                          type="number"
                          value={t12Val || ""}
                          onChange={e => setT12Draft(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }))}
                          className="w-full pl-5 pr-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-right text-white"
                          placeholder="0"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          value={Math.round((gf - 1) * 100)}
                          onChange={e => setT12GrowthDraft(prev => ({ ...prev, [field]: 1 + (parseFloat(e.target.value) || 0) / 100 }))}
                          className="w-full px-1 py-1 bg-slate-800/40 border border-white/5 rounded text-xs text-center text-white"
                          step="1"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span>
                      </div>
                      <span className="text-xs text-right text-slate-200 font-medium">{budgeted > 0 ? fmt(budgeted) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-end gap-2">
              <button onClick={() => setShowT12Modal(false)} className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg">Cancel</button>
              <button onClick={applyT12} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Apply T-12 to Budget</button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== LOI MODAL ======================== */}
      {showLoiModal && loiData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowLoiModal(false)} />
          <div className="relative bg-[#0B0F19] border border-white/10 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-[modal-in_0.2s_ease-out]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div>
                <h2 className="text-lg font-bold text-white">Generate Letter of Intent</h2>
                <p className="text-xs text-slate-500 mt-0.5">Review and customize before downloading or sending</p>
              </div>
              <button onClick={() => setShowLoiModal(false)} className="text-slate-500 hover:text-slate-300 text-2xl leading-none">&times;</button>
            </div>

            {/* Modal Body — two columns */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* Left: Editable form */}
              <div className="lg:w-1/2 overflow-y-auto p-6 space-y-4 border-r border-white/5">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Property</h3>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Property Address</label>
                    <input value={loiData.propertyAddress} onChange={e => setLoiData({ ...loiData, propertyAddress: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">BBL</label>
                    <input value={loiData.bbl} onChange={e => setLoiData({ ...loiData, bbl: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seller</h3>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Owner / Seller Name</label>
                    <input value={loiData.ownerName} onChange={e => setLoiData({ ...loiData, ownerName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Owner Address</label>
                    <input value={loiData.ownerAddress || ""} onChange={e => setLoiData({ ...loiData, ownerAddress: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Offer Terms</h3>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Offer Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                      <input type="number" value={loiData.offerPrice} onChange={e => setLoiData({ ...loiData, offerPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-7 pr-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Earnest Money %</label>
                      <input type="number" value={loiData.earnestMoneyPercent} onChange={e => setLoiData({ ...loiData, earnestMoneyPercent: parseFloat(e.target.value) || 0 })}
                        step="0.5" className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">DD Period (days)</label>
                      <input type="number" value={loiData.dueDiligenceDays} onChange={e => setLoiData({ ...loiData, dueDiligenceDays: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Financing (days)</label>
                      <input type="number" value={loiData.financingContingencyDays} onChange={e => setLoiData({ ...loiData, financingContingencyDays: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Closing (days)</label>
                      <input type="number" value={loiData.closingDays} onChange={e => setLoiData({ ...loiData, closingDays: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Buyer</h3>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Buyer Entity / Name</label>
                    <input value={loiData.buyerEntity} onChange={e => setLoiData({ ...loiData, buyerEntity: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Buyer Address</label>
                    <input value={loiData.buyerAddress || ""} onChange={e => setLoiData({ ...loiData, buyerAddress: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Broker Info</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Broker Name</label>
                      <input value={loiData.brokerName || ""} onChange={e => setLoiData({ ...loiData, brokerName: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Company</label>
                      <input value={loiData.brokerage || ""} onChange={e => setLoiData({ ...loiData, brokerage: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Email</label>
                      <input value={loiData.brokerEmail || ""} onChange={e => setLoiData({ ...loiData, brokerEmail: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Phone</label>
                      <input value={loiData.brokerPhone || ""} onChange={e => setLoiData({ ...loiData, brokerPhone: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">License #</label>
                    <input value={loiData.brokerLicense || ""} onChange={e => setLoiData({ ...loiData, brokerLicense: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
              </div>

              {/* Right: Live text preview */}
              <div className="lg:w-1/2 overflow-y-auto p-6 bg-white/[0.02]">
                <div className="bg-white/[0.03] rounded-lg border border-white/5 p-6">
                  <pre className="whitespace-pre-wrap text-xs text-slate-300 font-[inherit] leading-relaxed">
                    {generateLoiPlainText(loiData)}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {loiMsg && (
                  <span className={`text-sm ${loiMsg.startsWith("Error") || loiMsg.startsWith("Please") ? "text-red-400" : "text-green-400"}`}>{loiMsg}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { const pdf = generateLoiPdf(loiData); pdf.download(); }}
                  className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => { generateLoiDocx(loiData); }}
                  className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Download DOCX
                </button>
                <button
                  onClick={async () => {
                    // Must have saved deal first
                    if (!savedId) {
                      setLoiMsg("Please save the deal first before sending LOI.");
                      return;
                    }
                    // Need a recipient email
                    const recipientEmail = linkedContact?.email;
                    if (!recipientEmail) {
                      setLoiMsg("Please link a contact with an email address to send the LOI.");
                      return;
                    }

                    setLoiSending(true);
                    setLoiMsg(null);
                    try {
                      const pdf = generateLoiPdf(loiData);
                      const pdfBase64 = pdf.base64();
                      const subject = getLoiCoverEmailSubject(loiData);
                      const bodyHtml = getLoiCoverEmailHtml(loiData);

                      await sendLoiEmail({
                        dealId: savedId,
                        recipientEmail,
                        recipientName: `${linkedContact.firstName} ${linkedContact.lastName}`.trim(),
                        subject,
                        bodyHtml,
                        pdfBase64,
                        propertyAddress: loiData.propertyAddress,
                        contactId: contactId || undefined,
                      });

                      setLoiMsg("LOI sent successfully!");
                    } catch (err: any) {
                      setLoiMsg("Error: " + (err.message || "Failed to send"));
                    } finally {
                      setLoiSending(false);
                    }
                  }}
                  disabled={loiSending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loiSending ? "Sending..." : "Send via Email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// P&L Row helper (with optional custom formatted value)
// ============================================================
function PnlRow({ label, value, bold, indent, border, customValue }: {
  label: string; value: number; bold?: boolean; indent?: boolean; border?: boolean; customValue?: string;
}) {
  return (
    <tr className={border ? "border-t border-white/5" : ""}>
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold text-white" : "text-slate-400"}`}>{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-semibold text-white" : ""} ${!customValue && value < 0 ? "text-red-400" : ""}`}>
        {customValue ? customValue : value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
      </td>
    </tr>
  );
}

// P&L Row with Per Unit + Notes columns
function PnlRowFull({ label, value, bold, indent, border, perUnit, note }: {
  label: string; value: number; bold?: boolean; indent?: boolean; border?: boolean; perUnit?: number; note?: string;
}) {
  return (
    <tr className={border ? "border-t border-white/5" : ""}>
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold text-white" : "text-slate-400"}`}>{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-semibold text-white" : ""} ${value < 0 ? "text-red-400" : ""}`}>
        {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
      </td>
      <td className="py-1.5 text-right text-xs text-slate-500">
        {perUnit != null && perUnit > 0 ? fmt(perUnit) : ""}
      </td>
      <td className="py-1.5 text-right text-[10px] text-slate-500">{note || ""}</td>
    </tr>
  );
}
