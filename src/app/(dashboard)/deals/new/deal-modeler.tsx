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
import type { CompSale, CompSummary } from "@/lib/comps-engine";
import { generateDealPdf } from "@/lib/deal-pdf";
import { generateLoiPdf } from "@/lib/loi-pdf";
import { generateLoiDocx } from "@/lib/loi-docx";
import { generateLoiPlainText, getLoiCoverEmailSubject, getLoiCoverEmailHtml, LOI_DEFAULTS } from "@/lib/loi-template";
import type { LoiData } from "@/lib/loi-template";

// ============================================================
// Collapsible Section
// ============================================================
function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ============================================================
// AI Sparkle indicator for assumed fields
// ============================================================
function Sparkle() {
  return (
    <span className="inline-block ml-1 text-amber-500" title="AI-generated assumption">
      <svg className="w-3 h-3 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" /></svg>
    </span>
  );
}

// ============================================================
// Input Field with optional AI sparkle
// ============================================================
function Field({ label, value, onChange, prefix, suffix, type = "number", step, min, className, aiAssumed, onClearAi }: {
  label: string; value: number | string; onChange: (v: number) => void;
  prefix?: string; suffix?: string; type?: string; step?: string; min?: string; className?: string;
  aiAssumed?: boolean; onClearAi?: () => void;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}
        {aiAssumed && <Sparkle />}
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
          className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${prefix ? "pl-7" : ""} ${suffix ? "pr-7" : ""} ${aiAssumed ? "bg-amber-50/40" : ""}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
      </div>
    </div>
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
        inputs: { ...inputs, _assumptions: assumptions },
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

  const totalUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <a href="/deals" className="text-sm text-slate-500 hover:text-blue-600">&larr; Back</a>
            <div>
              <input
                value={dealName}
                onChange={e => setDealName(e.target.value)}
                placeholder="Deal name..."
                className="text-lg font-bold text-slate-900 border-none focus:outline-none bg-transparent placeholder:text-slate-300 w-full max-w-md"
              />
              {address && <p className="text-xs text-slate-500">{address}{borough ? `, ${borough}` : ""}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {saveMsg && <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>{saveMsg}</span>}
            {inputs.purchasePrice > 0 && (
              <button
                onClick={openLoiModal}
                className="px-3 md:px-4 py-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-medium rounded-lg transition-colors"
              >
                Generate LOI
              </button>
            )}
            <button
              onClick={() => generateDealPdf({ dealName: dealName || address || "Deal Analysis", address, borough, inputs, outputs, propertyDetails, notes })}
              className="px-3 md:px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
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
        <div className="bg-blue-50 border-b border-blue-100 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-blue-700">
            <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
            Loading deal data...
          </div>
        </div>
      )}

      {isAiGenerated && !prefillLoading && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5">
          <div className="max-w-[1600px] mx-auto flex items-center gap-2 text-sm text-amber-800">
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" /></svg>
            <span><strong>AI-Generated Assumptions</strong> — Review and adjust inputs as needed. Fields marked with <Sparkle /> were auto-calculated.</span>
          </div>
        </div>
      )}

      {propertyDetails && !prefillLoading && !isAiGenerated && (
        <div className="bg-green-50 border-b border-green-100 px-4 md:px-6 py-2">
          <div className="max-w-[1600px] mx-auto text-sm text-green-700">
            Pre-filled from {propertyDetails.address}, {propertyDetails.borough} — {propertyDetails.unitsRes} units, built {propertyDetails.yearBuilt}
            {propertyDetails.lastSalePrice > 0 && ` — Last sale: ${fmt(propertyDetails.lastSalePrice)}`}
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ======================== LEFT PANEL — INPUTS ======================== */}
          <div className="w-full lg:w-[440px] flex-shrink-0 space-y-4">

            {/* Deal Info */}
            <Section title="Deal Info">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Deal Type</label>
                  <select value={dealType} onChange={e => setDealType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                    <option value="acquisition">Acquisition</option>
                    <option value="value_add">Value-Add</option>
                    <option value="new_development">New Development</option>
                    <option value="mixed_use">Mixed Use</option>
                    <option value="ground_up">Ground Up</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Source</label>
                  <select value={dealSource} onChange={e => setDealSource(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
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
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{linkedContact.firstName} {linkedContact.lastName}</p>
                    {linkedContact.email && <p className="text-xs text-slate-500 truncate">{linkedContact.email}</p>}
                  </div>
                  <button onClick={unlinkContact} className="text-slate-400 hover:text-red-500 text-lg leading-none" title="Unlink contact">&times;</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={contactSearch}
                    onChange={e => handleContactSearch(e.target.value)}
                    onFocus={() => { if (contactResults.length > 0) setContactDropdownOpen(true); }}
                    onBlur={() => setTimeout(() => setContactDropdownOpen(false), 200)}
                    placeholder="Search contacts by name or email..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {contactDropdownOpen && contactResults.length > 0 && (
                    <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {contactResults.map(c => (
                        <button
                          key={c.id}
                          onMouseDown={e => { e.preventDefault(); selectContact(c); }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-slate-900">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-slate-500">{c.email || "No email"}</p>
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="Closing Costs" value={inputs.closingCosts} onChange={v => update({ closingCosts: v })} prefix="$" aiAssumed={isAi("closingCosts")} onClearAi={() => clearAi("closingCosts")} />
                <Field label="Renovation Budget" value={inputs.renovationBudget} onChange={v => update({ renovationBudget: v })} prefix="$" />
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total Equity Required</span>
                  <span className="font-semibold text-blue-700">{fmt(outputs.totalEquity)}</span>
                </div>
              </div>
            </Section>

            {/* Financing */}
            <Section title="Financing">
              <div className="grid grid-cols-2 gap-3">
                <Field label="LTV" value={inputs.ltvPercent} onChange={v => update({ ltvPercent: v })} suffix="%" step="1" aiAssumed={isAi("ltvPercent")} onClearAi={() => clearAi("ltvPercent")} />
                <Field label="Interest Rate" value={inputs.interestRate} onChange={v => update({ interestRate: v })} suffix="%" step="0.125" aiAssumed={isAi("interestRate")} onClearAi={() => clearAi("interestRate")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amortization (yrs)" value={inputs.amortizationYears} onChange={v => update({ amortizationYears: v })} step="1" />
                <Field label="Loan Term (yrs)" value={inputs.loanTermYears} onChange={v => update({ loanTermYears: v })} step="1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Origination Fee" value={inputs.originationFeePercent} onChange={v => update({ originationFeePercent: v })} suffix="%" step="0.25" aiAssumed={isAi("originationFeePercent")} onClearAi={() => clearAi("originationFeePercent")} />
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={inputs.interestOnly} onChange={e => update({ interestOnly: e.target.checked })} className="rounded border-slate-300 text-blue-600" />
                    Interest Only
                  </label>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Loan Amount</span><span className="font-medium">{fmt(outputs.loanAmount)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">IO Annual Payment</span><span className="font-medium">{fmt(outputs.ioAnnualPayment)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Amort Annual Payment</span><span className="font-medium">{fmt(outputs.annualDebtService)}</span></div>
              </div>
            </Section>

            {/* Income — Residential */}
            <Section title="Income — Residential">
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-500">Unit Mix ({totalUnits} units){isAi("unitMix") && <Sparkle />}</span>
                  <button onClick={addUnitType} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Add Type</button>
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
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
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1.5">
                            <input value={u.type} onChange={e => updateUnit(i, "type", e.target.value)} className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs" />
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" value={u.count} onChange={e => updateUnit(i, "count", parseInt(e.target.value) || 0)} className="w-14 text-center px-1 py-1 border border-slate-200 rounded text-xs" min="0" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={u.monthlyRent} onChange={e => updateUnit(i, "monthlyRent", parseFloat(e.target.value) || 0)} className="w-full text-right px-1.5 py-1 border border-slate-200 rounded text-xs" />
                          </td>
                          <td className="px-3 py-1.5 text-right text-slate-600">{fmt(u.count * u.monthlyRent * 12)}</td>
                          <td className="pr-2">
                            {inputs.unitMix.length > 1 && (
                              <button onClick={() => removeUnitType(i)} className="text-slate-300 hover:text-red-500 text-sm">&times;</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="px-3 py-2 font-semibold text-slate-700">GPR</td>
                        <td className="text-center px-2 py-2 font-semibold">{totalUnits}</td>
                        <td></td>
                        <td className="text-right px-3 py-2 font-semibold text-slate-700">{fmt(outputs.grossPotentialResidentialRent)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vacancy Rate" value={inputs.residentialVacancyRate} onChange={v => update({ residentialVacancyRate: v })} suffix="%" step="0.5" aiAssumed={isAi("residentialVacancyRate")} onClearAi={() => clearAi("residentialVacancyRate")} />
                <Field label="Concessions (annual)" value={inputs.concessions} onChange={v => update({ concessions: v })} prefix="$" aiAssumed={isAi("concessions")} onClearAi={() => clearAi("concessions")} />
              </div>
              <Field label="Annual Rent Growth" value={inputs.annualRentGrowth} onChange={v => update({ annualRentGrowth: v })} suffix="%" step="0.5" aiAssumed={isAi("annualRentGrowth")} onClearAi={() => clearAi("annualRentGrowth")} />
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
                className="w-full px-3 py-2 border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-500 hover:text-blue-600 text-xs font-medium rounded-lg transition-colors"
              >
                + Add Income Line Item
              </button>
            </Section>

            {/* T-12 + Custom Expense Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={openT12Modal}
                className="flex-1 px-3 py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-medium rounded-lg transition-colors text-center"
              >
                Enter T-12 Actuals
              </button>
              <button
                onClick={addCustomExpense}
                className="flex-1 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium rounded-lg transition-colors text-center"
              >
                + Add Expense Line
              </button>
            </div>

            {/* Expense Flags Summary */}
            {expenseFlags.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">{expenseFlags.length} expense flag{expenseFlags.length !== 1 ? "s" : ""} detected</p>
                <p className="text-[10px] text-amber-600">Review flagged items in the P&L section on the right panel.</p>
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
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex justify-between text-xs"><span className="text-slate-500">Calculated Mgmt Fee</span><span className="font-medium">{fmt(outputs.managementFee)}</span></div>
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
                        className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs"
                        placeholder="Expense name"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={e => updateCustomExpense(item.id, "amount", parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1.5 border border-slate-200 rounded text-xs text-right"
                        />
                      </div>
                      <button onClick={() => removeCustomExpense(item.id)} className="text-slate-300 hover:text-red-500 text-sm">&times;</button>
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
                        className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs"
                        placeholder="Income name"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={e => updateCustomIncome(item.id, "amount", parseFloat(e.target.value) || 0)}
                          className="w-full pl-5 pr-2 py-1.5 border border-slate-200 rounded text-xs text-right"
                        />
                      </div>
                      <button onClick={() => removeCustomIncome(item.id)} className="text-slate-300 hover:text-red-500 text-sm">&times;</button>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Exit Assumptions */}
            <Section title="Exit Assumptions">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Hold Period (yrs)" value={inputs.holdPeriodYears} onChange={v => update({ holdPeriodYears: Math.max(1, Math.round(v)) })} step="1" min="1" aiAssumed={isAi("holdPeriodYears")} onClearAi={() => clearAi("holdPeriodYears")} />
                <Field label="Exit Cap Rate" value={inputs.exitCapRate} onChange={v => update({ exitCapRate: v })} suffix="%" step="0.25" aiAssumed={isAi("exitCapRate")} onClearAi={() => clearAi("exitCapRate")} />
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
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </Section>
          </div>

          {/* ======================== RIGHT PANEL — OUTPUTS ======================== */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Key Metrics Cards */}
            <div className="sticky top-[65px] z-10 bg-white/95 backdrop-blur-sm pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                {[
                  { label: "Cap Rate", value: fmtPct(outputs.capRate), color: outputs.capRate >= 5 ? "text-green-700" : outputs.capRate >= 3 ? "text-amber-700" : "text-red-700" },
                  { label: "CoC (IO)", value: fmtPct(outputs.cashOnCashIO), color: outputs.cashOnCashIO >= 8 ? "text-green-700" : outputs.cashOnCashIO >= 4 ? "text-amber-700" : "text-red-700" },
                  { label: "CoC (Amort)", value: fmtPct(outputs.cashOnCashAmort), color: outputs.cashOnCashAmort >= 6 ? "text-green-700" : outputs.cashOnCashAmort >= 2 ? "text-amber-700" : "text-red-700" },
                  { label: "IRR", value: isFinite(outputs.irr) ? fmtPct(outputs.irr) : "N/A", color: outputs.irr >= 15 ? "text-green-700" : outputs.irr >= 8 ? "text-amber-700" : "text-red-700" },
                  { label: "DSCR", value: fmtX(outputs.dscr), color: outputs.dscr >= 1.25 ? "text-green-700" : outputs.dscr >= 1.0 ? "text-amber-700" : "text-red-700" },
                  { label: "Debt Yield", value: fmtPct(outputs.debtYield), color: outputs.debtYield >= 8 ? "text-green-700" : outputs.debtYield >= 6 ? "text-amber-700" : "text-red-700" },
                  { label: "Eq Multiple", value: fmtX(outputs.equityMultiple), color: outputs.equityMultiple >= 2 ? "text-green-700" : outputs.equityMultiple >= 1.5 ? "text-amber-700" : "text-red-700" },
                  { label: "NOI", value: fmt(outputs.noi), color: outputs.noi > 0 ? "text-green-700" : "text-red-700" },
                ].map(m => (
                  <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{m.label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Year 1 Budget P&L — PRIMARY OUTPUT */}
            <div className="bg-white border-2 border-blue-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-blue-100 bg-blue-50/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Year 1 Budget P&L</h3>
                {expenseFlags.length > 0 && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
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
                    <tr className="border-t border-slate-100"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-600">Residential Income</td></tr>
                    <PnlRowFull label="Gross Potential Residential Rent" value={outputs.grossPotentialResidentialRent} perUnit={totalUnits > 0 ? Math.round(outputs.grossPotentialResidentialRent / totalUnits) : undefined} />
                    <PnlRowFull label="Less: Residential Vacancy" value={-outputs.residentialVacancyLoss} indent note={`${inputs.residentialVacancyRate}%`} />
                    {outputs.concessionsLoss > 0 && <PnlRowFull label="Less: Concessions" value={-outputs.concessionsLoss} indent />}
                    <PnlRowFull label="Net Residential Rental Income" value={outputs.netResidentialIncome} bold border />

                    {/* COMMERCIAL INCOME */}
                    {outputs.grossPotentialCommercialRent > 0 && (
                      <>
                        <tr className="border-t border-slate-100"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-600">Commercial Income</td></tr>
                        <PnlRowFull label="Gross Potential Commercial Rent" value={outputs.grossPotentialCommercialRent} />
                        <PnlRowFull label="Less: Commercial Vacancy" value={-outputs.commercialVacancyLoss} indent note={`${inputs.commercialVacancyRate}%`} />
                        {outputs.commercialConcessionsLoss > 0 && <PnlRowFull label="Less: Concessions" value={-outputs.commercialConcessionsLoss} indent />}
                        <PnlRowFull label="Net Commercial Rental Income" value={outputs.netCommercialIncome} bold border />
                      </>
                    )}

                    {/* OTHER INCOME */}
                    {outputs.totalOtherIncome > 0 && (
                      <>
                        <tr className="border-t border-slate-100"><td colSpan={4} className="pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-blue-600">Other Income</td></tr>
                        <PnlRowFull label="Total Other Income" value={outputs.totalOtherIncome} />
                      </>
                    )}

                    {/* TOTAL INCOME */}
                    <tr className="border-t-2 border-slate-300">
                      <td className="py-2 font-bold text-slate-900">TOTAL INCOME</td>
                      <td className="py-2 text-right font-bold text-slate-900">{fmt(outputs.totalIncome)}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.totalIncome / totalUnits)) : ""}</td>
                      <td></td>
                    </tr>

                    {/* OPERATING EXPENSES */}
                    <tr><td colSpan={4} className="pt-4 pb-1 text-[10px] uppercase tracking-wider font-bold text-red-600">Operating Expenses</td></tr>
                    {outputs.expenseDetails.filter(d => d.amount > 0).map((d, i) => {
                      const flag = d.field ? getFlagForField(d.field) : undefined;
                      return (
                        <tr key={i} className={`border-t border-slate-50 ${flag ? "bg-amber-50/40" : ""}`}>
                          <td className="py-1.5 text-slate-600 flex items-center gap-1">
                            {flag && <span className="text-amber-500 cursor-help" title={flag.message}>&#9888;</span>}
                            {d.label}
                            {d.source && (
                              <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${d.source === 't12' ? 'bg-blue-100 text-blue-600' : d.source === 'ai_estimate' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                                {d.methodology || d.source}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-right text-slate-700">{fmt(d.amount)}</td>
                          <td className="py-1.5 text-right text-xs text-slate-500">{d.perUnit != null && d.perUnit > 0 ? fmt(d.perUnit) : ""}</td>
                          <td className="py-1.5 text-right">
                            {flag && flag.suggestedAmount != null && (
                              <button
                                onClick={() => applySuggestedAmount(flag)}
                                className="text-[9px] text-blue-600 hover:text-blue-800 underline"
                              >
                                Use {fmt(flag.suggestedAmount)}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-slate-200">
                      <td className="py-2 font-semibold text-slate-900">Total Operating Expenses</td>
                      <td className="py-2 text-right font-semibold text-red-700">{fmt(outputs.totalExpenses)}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{totalUnits > 0 ? fmt(Math.round(outputs.totalExpenses / totalUnits)) : ""}</td>
                      <td></td>
                    </tr>

                    {/* NOI */}
                    <tr className="border-t-2 border-double border-slate-400">
                      <td className="py-3 font-bold text-lg text-slate-900">NET OPERATING INCOME</td>
                      <td className={`py-3 text-right font-bold text-lg ${outputs.noi >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(outputs.noi)}</td>
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
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Analysis</h3></div>
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

            {/* Cash Flow Waterfall */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Cash Flow Waterfall</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-500">Year</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">GPR</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Vacancy</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">EGI</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Expenses</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">NOI</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Debt Svc</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Cash Flow</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-slate-500">Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.cashFlows.map(cf => (
                      <tr key={cf.year} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-700">{cf.year}</td>
                        <td className="text-right px-3 py-2 text-slate-600">{fmt(cf.gpr)}</td>
                        <td className="text-right px-3 py-2 text-red-500">({fmt(cf.vacancy)})</td>
                        <td className="text-right px-3 py-2 text-slate-600">{fmt(cf.egi)}</td>
                        <td className="text-right px-3 py-2 text-red-500">({fmt(cf.expenses)})</td>
                        <td className="text-right px-3 py-2 font-medium text-slate-700">{fmt(cf.noi)}</td>
                        <td className="text-right px-3 py-2 text-red-500">({fmt(cf.debtService)})</td>
                        <td className={`text-right px-3 py-2 font-medium ${cf.cashFlow >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(cf.cashFlow)}</td>
                        <td className={`text-right px-3 py-2 ${cf.cumulativeCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(cf.cumulativeCashFlow)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-blue-50/50">
                      <td className="px-4 py-2 font-semibold text-slate-700">Exit</td>
                      <td colSpan={4} className="text-right px-3 py-2 text-xs text-slate-500">Sale @ {fmtPct(inputs.exitCapRate)} Cap</td>
                      <td className="text-right px-3 py-2 font-medium">{fmt(outputs.exitValue)}</td>
                      <td className="text-right px-3 py-2 text-red-500">({fmt(outputs.loanBalanceAtExit)})</td>
                      <td className="text-right px-3 py-2 font-bold text-blue-700">{fmt(outputs.exitProceeds)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sensitivity Matrix */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Sensitivity Analysis — IRR</h3></div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-500 font-medium">{outputs.sensitivity.rowParam} \ {outputs.sensitivity.colParam}</th>
                      {outputs.sensitivity.colLabels.map((cl, i) => (
                        <th key={i} className={`px-3 py-2 text-center font-medium ${cl === "Base" ? "text-blue-700 bg-blue-50" : "text-slate-500"}`}>{cl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.sensitivity.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-slate-100">
                        <td className={`px-3 py-2 font-medium ${outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%` ? "text-blue-700 bg-blue-50" : "text-slate-600"}`}>
                          {outputs.sensitivity.rowLabels[ri]}
                        </td>
                        {row.map((val, ci) => {
                          const isBase = outputs.sensitivity.colLabels[ci] === "Base" && outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%`;
                          return (
                            <td key={ci} className={`px-3 py-2 text-center font-medium ${isBase ? "bg-blue-100 text-blue-800 font-bold" : val >= 15 ? "text-green-700" : val >= 8 ? "text-amber-700" : "text-red-700"}`}>
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

            {/* Sources & Uses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50"><h3 className="text-sm font-semibold text-slate-700">Sources</h3></div>
                <div className="p-4">
                  {outputs.sources.map((s, i) => (
                    <div key={i} className="flex justify-between py-1.5 text-sm">
                      <span className="text-slate-600">{s.label}</span>
                      <span className="font-medium text-slate-900">{fmt(s.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 mt-1 border-t border-slate-200 text-sm font-bold">
                    <span>Total Sources</span>
                    <span>{fmt(outputs.sources.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50"><h3 className="text-sm font-semibold text-slate-700">Uses</h3></div>
                <div className="p-4">
                  {outputs.uses.map((u, i) => (
                    <div key={i} className="flex justify-between py-1.5 text-sm">
                      <span className="text-slate-600">{u.label}</span>
                      <span className="font-medium text-slate-900">{fmt(u.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 mt-1 border-t border-slate-200 text-sm font-bold">
                    <span>Total Uses</span>
                    <span>{fmt(outputs.uses.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exit Analysis */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Exit Analysis</h3></div>
              <div className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-xs text-slate-400 uppercase">Exit NOI</p><p className="text-lg font-bold text-slate-900">{fmt(outputs.exitNoi)}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase">Exit Value</p><p className="text-lg font-bold text-slate-900">{fmt(outputs.exitValue)}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase">Loan Balance</p><p className="text-lg font-bold text-red-600">{fmt(outputs.loanBalanceAtExit)}</p></div>
                  <div><p className="text-xs text-slate-400 uppercase">Net Proceeds</p><p className="text-lg font-bold text-green-700">{fmt(outputs.exitProceeds)}</p></div>
                </div>
              </div>
            </div>

            {/* Live Comps */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Live Comps</h3>
                {!compsLoading && comps.length === 0 && propertyDetails && (
                  <button
                    onClick={() => {
                      const zip = propertyDetails.bbl?.substring(0, 5) || "";
                      if (zip) loadComps(zip);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Load Comps
                  </button>
                )}
              </div>
              <div className="p-5">
                {compsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
                    Searching comparable sales...
                  </div>
                ) : comps.length > 0 && compSummary ? (
                  <>
                    {/* Market comparison */}
                    {inputs.purchasePrice > 0 && totalUnits > 0 && compSummary.avgPricePerUnit > 0 && (
                      <div className={`mb-4 rounded-lg p-3 ${
                        inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                      }`}>
                        <p className={`text-sm font-medium ${inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "text-green-800" : "text-red-800"}`}>
                          Your offer: {fmt(Math.round(inputs.purchasePrice / totalUnits))}/unit — Market avg: {fmt(compSummary.avgPricePerUnit)}/unit
                          {" "}({Math.abs(Math.round(((inputs.purchasePrice / totalUnits) / compSummary.avgPricePerUnit - 1) * 100))}% {inputs.purchasePrice / totalUnits < compSummary.avgPricePerUnit ? "below" : "above"})
                        </p>
                        {inputs.purchasePrice / totalUnits > compSummary.avgPricePerUnit && (
                          <button
                            onClick={() => update({ purchasePrice: compSummary.avgPricePerUnit * totalUnits })}
                            className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Use Market Avg as Offer
                          </button>
                        )}
                      </div>
                    )}

                    {/* Summary stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase">Comps Found</p>
                        <p className="text-sm font-bold text-slate-900">{compSummary.count}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase">Avg $/Unit</p>
                        <p className="text-sm font-bold text-slate-900">{fmt(compSummary.avgPricePerUnit)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase">Median $/Unit</p>
                        <p className="text-sm font-bold text-slate-900">{fmt(compSummary.medianPricePerUnit)}</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-400 uppercase">Avg $/SqFt</p>
                        <p className="text-sm font-bold text-slate-900">{compSummary.avgPricePerSqft > 0 ? fmt(compSummary.avgPricePerSqft) : "—"}</p>
                      </div>
                    </div>

                    {/* Filter controls */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <label className="text-[10px] text-slate-500 flex items-center gap-1">
                        Radius:
                        <select value={compRadius} onChange={e => setCompRadius(parseFloat(e.target.value))} className="border border-slate-200 rounded px-1 py-0.5 text-xs">
                          <option value="0.5">0.5 mi</option>
                          <option value="1">1 mi</option>
                          <option value="2">2 mi</option>
                          <option value="5">5 mi</option>
                          <option value="10">10 mi</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-500 flex items-center gap-1">
                        Years:
                        <select value={compYears} onChange={e => setCompYears(parseInt(e.target.value))} className="border border-slate-200 rounded px-1 py-0.5 text-xs">
                          <option value="1">1 yr</option>
                          <option value="2">2 yr</option>
                          <option value="3">3 yr</option>
                          <option value="5">5 yr</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-500 flex items-center gap-1">
                        Min Units:
                        <select value={compMinUnits} onChange={e => setCompMinUnits(parseInt(e.target.value))} className="border border-slate-200 rounded px-1 py-0.5 text-xs">
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
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Refresh
                        </button>
                      )}
                    </div>

                    {/* Comps table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[700px]">
                        <thead className="bg-slate-50">
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
                            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-1.5 text-slate-700 max-w-[180px] truncate" title={c.address}>{c.address}</td>
                              <td className="text-center px-2 py-1.5 text-slate-500">{c.borough.substring(0, 3)}</td>
                              <td className="text-center px-2 py-1.5">{c.totalUnits}</td>
                              <td className="text-right px-2 py-1.5 text-slate-500">{c.grossSqft > 0 ? c.grossSqft.toLocaleString() : "—"}</td>
                              <td className="text-center px-2 py-1.5 text-slate-500">{c.yearBuilt || "—"}</td>
                              <td className="text-right px-3 py-1.5 font-medium">{fmt(c.salePrice)}</td>
                              <td className="text-right px-2 py-1.5">{c.pricePerUnit > 0 ? fmt(c.pricePerUnit) : "—"}</td>
                              <td className="text-right px-2 py-1.5 text-slate-500">{c.pricePerSqft > 0 ? `$${c.pricePerSqft}` : "—"}</td>
                              <td className="text-center px-2 py-1.5 text-slate-500">{c.saleDate ? new Date(c.saleDate).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : "—"}</td>
                              <td className="text-center px-2 py-1.5 text-slate-400">{c.distance} mi</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">{propertyDetails ? "Click Load Comps to search comparable sales." : "Pre-fill a property to enable comps search."}</p>
                )}
              </div>
            </div>

            {/* Property Details (from pre-fill) */}
            {propertyDetails && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">Property Details</h3></div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                    <div><p className="text-xs text-slate-400">Address</p><p className="font-medium">{propertyDetails.address}</p></div>
                    <div><p className="text-xs text-slate-400">Borough</p><p className="font-medium">{propertyDetails.borough}</p></div>
                    <div><p className="text-xs text-slate-400">Block / Lot</p><p className="font-medium">{propertyDetails.block} / {propertyDetails.lot}</p></div>
                    <div><p className="text-xs text-slate-400">BBL</p><p className="font-medium">{propertyDetails.bbl}</p></div>
                    <div><p className="text-xs text-slate-400">Res Units</p><p className="font-medium">{propertyDetails.unitsRes || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Total Units</p><p className="font-medium">{propertyDetails.unitsTotal || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Year Built</p><p className="font-medium">{propertyDetails.yearBuilt || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Stories</p><p className="font-medium">{propertyDetails.numFloors || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Building Area</p><p className="font-medium">{propertyDetails.bldgArea > 0 ? `${propertyDetails.bldgArea.toLocaleString()} sqft` : "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Lot Area</p><p className="font-medium">{propertyDetails.lotArea > 0 ? `${propertyDetails.lotArea.toLocaleString()} sqft` : "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Zoning</p><p className="font-medium">{propertyDetails.zoneDist || "—"}</p></div>
                    <div><p className="text-xs text-slate-400">Building Class</p><p className="font-medium">{propertyDetails.bldgClass || "—"}</p></div>
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowT12Modal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-[modal-in_0.2s_ease-out]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Enter T-12 Actuals</h2>
                <p className="text-xs text-slate-500 mt-0.5">Enter trailing 12-month actual expenses. Year 1 Budget = T-12 x Growth Factor.</p>
              </div>
              <button onClick={() => setShowT12Modal(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_110px_80px_100px] gap-2 text-[10px] font-medium text-slate-400 uppercase tracking-wider pb-1">
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
                    <div key={field} className="grid grid-cols-[1fr_110px_80px_100px] gap-2 items-center py-1 border-t border-slate-50">
                      <span className="text-xs text-slate-600">{label}</span>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">$</span>
                        <input
                          type="number"
                          value={t12Val || ""}
                          onChange={e => setT12Draft(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }))}
                          className="w-full pl-5 pr-1 py-1 border border-slate-200 rounded text-xs text-right"
                          placeholder="0"
                        />
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          value={Math.round((gf - 1) * 100)}
                          onChange={e => setT12GrowthDraft(prev => ({ ...prev, [field]: 1 + (parseFloat(e.target.value) || 0) / 100 }))}
                          className="w-full px-1 py-1 border border-slate-200 rounded text-xs text-center"
                          step="1"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
                      </div>
                      <span className="text-xs text-right text-slate-700 font-medium">{budgeted > 0 ? fmt(budgeted) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button onClick={() => setShowT12Modal(false)} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg">Cancel</button>
              <button onClick={applyT12} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Apply T-12 to Budget</button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== LOI MODAL ======================== */}
      {showLoiModal && loiData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowLoiModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-[modal-in_0.2s_ease-out]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Generate Letter of Intent</h2>
                <p className="text-xs text-slate-500 mt-0.5">Review and customize before downloading or sending</p>
              </div>
              <button onClick={() => setShowLoiModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Modal Body — two columns */}
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              {/* Left: Editable form */}
              <div className="lg:w-1/2 overflow-y-auto p-6 space-y-4 border-r border-slate-100">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Property</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Property Address</label>
                    <input value={loiData.propertyAddress} onChange={e => setLoiData({ ...loiData, propertyAddress: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">BBL</label>
                    <input value={loiData.bbl} onChange={e => setLoiData({ ...loiData, bbl: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Seller</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Owner / Seller Name</label>
                    <input value={loiData.ownerName} onChange={e => setLoiData({ ...loiData, ownerName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Owner Address</label>
                    <input value={loiData.ownerAddress || ""} onChange={e => setLoiData({ ...loiData, ownerAddress: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Offer Terms</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Offer Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                      <input type="number" value={loiData.offerPrice} onChange={e => setLoiData({ ...loiData, offerPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Earnest Money %</label>
                      <input type="number" value={loiData.earnestMoneyPercent} onChange={e => setLoiData({ ...loiData, earnestMoneyPercent: parseFloat(e.target.value) || 0 })}
                        step="0.5" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">DD Period (days)</label>
                      <input type="number" value={loiData.dueDiligenceDays} onChange={e => setLoiData({ ...loiData, dueDiligenceDays: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Financing (days)</label>
                      <input type="number" value={loiData.financingContingencyDays} onChange={e => setLoiData({ ...loiData, financingContingencyDays: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Closing (days)</label>
                      <input type="number" value={loiData.closingDays} onChange={e => setLoiData({ ...loiData, closingDays: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Buyer</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Buyer Entity / Name</label>
                    <input value={loiData.buyerEntity} onChange={e => setLoiData({ ...loiData, buyerEntity: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Buyer Address</label>
                    <input value={loiData.buyerAddress || ""} onChange={e => setLoiData({ ...loiData, buyerAddress: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Broker Info</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Broker Name</label>
                      <input value={loiData.brokerName || ""} onChange={e => setLoiData({ ...loiData, brokerName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Company</label>
                      <input value={loiData.brokerage || ""} onChange={e => setLoiData({ ...loiData, brokerage: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                      <input value={loiData.brokerEmail || ""} onChange={e => setLoiData({ ...loiData, brokerEmail: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                      <input value={loiData.brokerPhone || ""} onChange={e => setLoiData({ ...loiData, brokerPhone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">License #</label>
                    <input value={loiData.brokerLicense || ""} onChange={e => setLoiData({ ...loiData, brokerLicense: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Right: Live text preview */}
              <div className="lg:w-1/2 overflow-y-auto p-6 bg-slate-50">
                <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
                  <pre className="whitespace-pre-wrap text-xs text-slate-700 font-[inherit] leading-relaxed">
                    {generateLoiPlainText(loiData)}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {loiMsg && (
                  <span className={`text-sm ${loiMsg.startsWith("Error") || loiMsg.startsWith("Please") ? "text-red-600" : "text-green-600"}`}>{loiMsg}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { const pdf = generateLoiPdf(loiData); pdf.download(); }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => { generateLoiDocx(loiData); }}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
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
    <tr className={border ? "border-t border-slate-200" : ""}>
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-semibold text-slate-900" : ""} ${!customValue && value < 0 ? "text-red-600" : ""}`}>
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
    <tr className={border ? "border-t border-slate-200" : ""}>
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${bold ? "font-semibold text-slate-900" : "text-slate-600"}`}>{label}</td>
      <td className={`py-1.5 text-right ${bold ? "font-semibold text-slate-900" : ""} ${value < 0 ? "text-red-600" : ""}`}>
        {value < 0 ? `(${fmt(Math.abs(value))})` : fmt(value)}
      </td>
      <td className="py-1.5 text-right text-xs text-slate-500">
        {perUnit != null && perUnit > 0 ? fmt(perUnit) : ""}
      </td>
      <td className="py-1.5 text-right text-[10px] text-slate-400">{note || ""}</td>
    </tr>
  );
}
