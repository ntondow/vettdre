"use client";

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import type { ClosingCostBreakdown, TaxReassessment } from "@/lib/nyc-deal-costs";
import { fetchClosingCosts, fetchTaxReassessment } from "../closing-cost-actions";
import { fetchExpenseBenchmark, fetchRentProjection, fetchLL97Projection } from "../benchmark-actions";
import { fetchMarketCapRate } from "../caprate-actions";
import type { ExpenseBenchmark } from "@/lib/expense-benchmarks";
import type { RentProjection } from "@/lib/rent-stabilization";
import type { LL97Projection } from "@/lib/ll97-penalties";
import type { CapRateAnalysis } from "@/lib/cap-rate-engine";
import { generateInvestmentSummaryPdf } from "@/lib/investment-summary-pdf";
import { assembleInvestmentSummary, assembleInvestmentSummaryFromInputs } from "../investment-summary-actions";
import { hasPermission, getUpgradeMessage } from "@/lib/feature-gate";
import { useUserPlan } from "@/components/providers/user-plan-provider";
import { useToast } from "@/components/ui/toast";
import { sanitizeFilename } from "@/lib/pdf-utils";
import { Sparkle } from "./components/shared/field";
import { fmt } from "./components/shared/format-utils";

// ============================================================
// Types
// ============================================================

type ContactRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type UserProfile = {
  fullName: string;
  email: string;
  phone: string;
  brokerage: string;
  licenseNumber: string;
  title: string;
};

export interface DealModelerContextValue {
  // Core state
  inputs: DealInputs;
  setInputs: React.Dispatch<React.SetStateAction<DealInputs>>;
  outputs: DealOutputs;
  dealName: string;
  setDealName: (v: string) => void;
  dealType: string;
  setDealType: (v: string) => void;
  dealSource: string;
  setDealSource: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  borough: string;
  setBorough: (v: string) => void;
  block: string;
  setBlock: (v: string) => void;
  lot: string;
  setLot: (v: string) => void;
  bbl: string;
  setBbl: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;

  // Save state
  saving: boolean;
  savedId: string | null;
  saveMsg: string | null;
  handleSave: () => Promise<void>;

  // Property details
  propertyDetails: DealPrefillData | null;
  prefillLoading: boolean;
  prefilled: boolean;

  // AI assumptions
  assumptions: Record<string, boolean>;
  isAiGenerated: boolean;
  isAi: (field: string) => boolean;
  clearAi: (field: string) => void;

  // Convenience updaters
  update: (partial: Partial<DealInputs>) => void;
  updateUnit: (index: number, field: keyof UnitMixRow, value: number | string) => void;
  addUnitType: () => void;
  removeUnitType: (index: number) => void;

  // Custom line items
  addCustomExpense: () => void;
  removeCustomExpense: (id: string) => void;
  updateCustomExpense: (id: string, field: keyof CustomLineItem, value: string | number) => void;
  addCustomIncome: () => void;
  removeCustomIncome: (id: string) => void;
  updateCustomIncome: (id: string, field: keyof CustomLineItem, value: string | number) => void;

  // Commercial tenants
  addCommercialTenant: () => void;
  removeCommercialTenant: (id: string) => void;
  updateCommercialTenant: (id: string, field: keyof CommercialTenant, value: string | number) => void;

  // Total units (derived)
  totalUnits: number;

  // Market data
  fredRate: number | null;
  compValuation: CompValuation | null;
  renoEstimate: import("@/lib/renovation-engine").RenovationEstimate | null;
  strProjection: import("@/lib/airbnb-market").STRProjection | null;

  // NYC deal cost state
  closingCostBreakdown: ClosingCostBreakdown | null;
  taxReassessment: TaxReassessment | null;
  showCostDetail: boolean;
  setShowCostDetail: (v: boolean) => void;
  useCEMA: boolean;
  setUseCEMA: (v: boolean) => void;

  // Benchmark engine state
  expenseBenchmark: ExpenseBenchmark | null;
  rentProjection: RentProjection | null;
  ll97Projection: LL97Projection | null;
  showBenchmarkDetail: boolean;
  setShowBenchmarkDetail: (v: boolean) => void;

  // Market cap rate state
  marketCapRate: CapRateAnalysis | null;

  // Deal structure state
  activeStructure: DealStructureType;
  setActiveStructure: (s: DealStructureType) => void;
  structureOverrides: Partial<Record<DealStructureType, Record<string, number | boolean>>>;
  showComparison: boolean;
  setShowComparison: (v: boolean) => void;
  comparisonResults: StructureAnalysis[];
  structureBase: DealInputsBase;
  mergedStructureInputs: Record<string, any>;
  structureAnalysis: StructureAnalysis | null;
  updateStructureParam: (param: string, value: number | boolean | string) => void;
  runComparison: () => void;

  // Contact picker
  contactId: string | null;
  linkedContact: ContactRecord | null;
  contactSearch: string;
  contactResults: ContactRecord[];
  contactDropdownOpen: boolean;
  setContactDropdownOpen: (v: boolean) => void;
  handleContactSearch: (q: string) => void;
  selectContact: (c: ContactRecord) => void;
  unlinkContact: () => void;

  // LOI modal
  showLoiModal: boolean;
  setShowLoiModal: (v: boolean) => void;
  loiData: LoiData | null;
  setLoiData: (d: LoiData | null) => void;
  loiSending: boolean;
  setLoiSending: (v: boolean) => void;
  loiMsg: string | null;
  setLoiMsg: (v: string | null) => void;
  userProfile: UserProfile | null;
  openLoiModal: () => Promise<void>;
  buildLoiData: (profile: UserProfile | null) => void;

  // T-12 modal
  showT12Modal: boolean;
  setShowT12Modal: (v: boolean) => void;
  t12Draft: Record<string, number>;
  setT12Draft: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  t12GrowthDraft: Record<string, number>;
  setT12GrowthDraft: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  openT12Modal: () => void;
  applyT12: () => void;

  // Comps
  comps: CompSale[];
  compSummary: CompSummary | null;
  compsLoading: boolean;
  compRadius: number;
  setCompRadius: (v: number) => void;
  compYears: number;
  setCompYears: (v: number) => void;
  compMinUnits: number;
  setCompMinUnits: (v: number) => void;
  loadComps: (zip: string) => Promise<void>;

  // Expense flags
  expenseFlags: ExpenseFlag[];
  getFlagForField: (field: string) => ExpenseFlag | undefined;
  applySuggestedAmount: (flag: ExpenseFlag) => void;

  // Income/expense view toggles
  itemizeClosing: boolean;
  setItemizeClosing: (v: boolean) => void;
  incomeView: "current" | "stabilized";
  setIncomeView: (v: "current" | "stabilized") => void;
  expenseEntryMode: "annual" | "monthly" | "perUnit";
  setExpenseEntryMode: (v: "annual" | "monthly" | "perUnit") => void;

  // PDF/Export
  handleGenerateInvestmentSummary: () => Promise<void>;
  generatingSummary: boolean;
  exportPdf: () => void;

  // Feature gate
  plan: any;
}

const DealModelerContext = createContext<DealModelerContextValue | null>(null);

export function useDealModeler(): DealModelerContextValue {
  const ctx = useContext(DealModelerContext);
  if (!ctx) throw new Error("useDealModeler must be used within DealModelerProvider");
  return ctx;
}

// ============================================================
// Provider
// ============================================================
export function DealModelerProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const { plan } = useUserPlan();
  const { toast } = useToast();

  // ── Core state ────────────────────────────────────────────
  const [inputs, setInputs] = useState<DealInputs>({ ...DEFAULT_INPUTS });
  const [dealName, setDealName] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
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

  // ── Market data state ─────────────────────────────────────
  const [fredRate, setFredRate] = useState<number | null>(null);
  const [compValuation, setCompValuation] = useState<CompValuation | null>(null);
  const [renoEstimate, setRenoEstimate] = useState<import("@/lib/renovation-engine").RenovationEstimate | null>(null);
  const [strProjection, setStrProjection] = useState<import("@/lib/airbnb-market").STRProjection | null>(null);

  // ── NYC Deal Costs state ──────────────────────────────────
  const [closingCostBreakdown, setClosingCostBreakdown] = useState<ClosingCostBreakdown | null>(null);
  const [taxReassessment, setTaxReassessment] = useState<TaxReassessment | null>(null);
  const [showCostDetail, setShowCostDetail] = useState(false);
  const [useCEMA, setUseCEMA] = useState(true);
  const closingCostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Benchmark engine state ────────────────────────────────
  const [expenseBenchmark, setExpenseBenchmark] = useState<ExpenseBenchmark | null>(null);
  const [rentProjection, setRentProjection] = useState<RentProjection | null>(null);
  const [ll97Projection, setLl97Projection] = useState<LL97Projection | null>(null);
  const [showBenchmarkDetail, setShowBenchmarkDetail] = useState(false);

  // ── Market cap rate state ─────────────────────────────────
  const [marketCapRate, setMarketCapRate] = useState<CapRateAnalysis | null>(null);

  // ── Deal Structure state ──────────────────────────────────
  const [activeStructure, setActiveStructure] = useState<DealStructureType>("conventional");
  const [structureOverrides, setStructureOverrides] = useState<Partial<Record<DealStructureType, Record<string, number | boolean>>>>({});
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonResults, setComparisonResults] = useState<StructureAnalysis[]>([]);

  // ── Contact picker state ──────────────────────────────────
  const [contactId, setContactId] = useState<string | null>(null);
  const [linkedContact, setLinkedContact] = useState<ContactRecord | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<ContactRecord[]>([]);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── LOI modal state ───────────────────────────────────────
  const [showLoiModal, setShowLoiModal] = useState(false);
  const [loiData, setLoiData] = useState<LoiData | null>(null);
  const [loiSending, setLoiSending] = useState(false);
  const [loiMsg, setLoiMsg] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // ── T-12 modal ────────────────────────────────────────────
  const [showT12Modal, setShowT12Modal] = useState(false);
  const [t12Draft, setT12Draft] = useState<Record<string, number>>({});
  const [t12GrowthDraft, setT12GrowthDraft] = useState<Record<string, number>>({});

  // ── Comps state ───────────────────────────────────────────
  const [comps, setComps] = useState<CompSale[]>([]);
  const [compSummary, setCompSummary] = useState<CompSummary | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compRadius, setCompRadius] = useState(2);
  const [compYears, setCompYears] = useState(5);
  const [compMinUnits, setCompMinUnits] = useState(5);

  // ── UI toggles ────────────────────────────────────────────
  const [itemizeClosing, setItemizeClosing] = useState(false);
  const [incomeView, setIncomeView] = useState<"current" | "stabilized">("current");
  const [expenseEntryMode, setExpenseEntryMode] = useState<"annual" | "monthly" | "perUnit">("annual");
  const [expenseFlags, setExpenseFlags] = useState<ExpenseFlag[]>([]);

  // ============================================================
  // Derived values
  // ============================================================

  const totalUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);
  const outputs: DealOutputs = useMemo(() => calculateAll(inputs), [inputs]);

  const structureBase: DealInputsBase = useMemo(() => {
    const totalUnitsCalc = inputs.unitMix.reduce((s, u) => s + u.count, 0);
    const grossRental = inputs.unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
    const commercialGross = inputs.commercialTenants?.length
      ? inputs.commercialTenants.reduce((s, t) => s + t.rentAnnual, 0)
      : inputs.commercialRentAnnual;
    const otherInc = commercialGross + inputs.parkingIncome + inputs.storageIncome +
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
      closingCostBreakdown: closingCostBreakdown || undefined,
      taxReassessment: taxReassessment || undefined,
      rentProjectionData: rentProjection ? { yearlyProjections: rentProjection.yearlyProjections.map(yp => ({ year: yp.year, totalAnnualRent: yp.totalAnnualRent })) } : undefined,
      ll97AnnualPenalties: ll97Projection ? ll97Projection.yearlyPenalties.map(yp => yp.annualPenalty) : undefined,
      stabilizedUnitCount: propertyDetails?.rentStabilizedUnits,
      stabilizedUnitPct: propertyDetails?.rentStabilizedUnits && totalUnitsCalc > 0 ? (propertyDetails.rentStabilizedUnits / totalUnitsCalc) * 100 : undefined,
      capRateAnalysis: marketCapRate ? { marketCapRate: marketCapRate.marketCapRate, range: marketCapRate.range, median: marketCapRate.median, suggestedExitCap: marketCapRate.suggestedExitCap, confidence: marketCapRate.confidence, trend: marketCapRate.trend, trendBpsPerYear: marketCapRate.trendBpsPerYear } : undefined,
    };
  }, [inputs, outputs.totalExpenses, fredRate, compValuation, closingCostBreakdown, taxReassessment, rentProjection, ll97Projection, propertyDetails?.rentStabilizedUnits, marketCapRate]);

  const mergedStructureInputs = useMemo(() => {
    const defaults = getDefaultStructureInputs(activeStructure, structureBase);
    return { ...defaults, ...(structureOverrides[activeStructure] || {}) };
  }, [activeStructure, structureBase, structureOverrides]);

  const structureAnalysis: StructureAnalysis | null = useMemo(() => {
    try {
      return calculateDealStructure(mergedStructureInputs as StructuredDealInputs);
    } catch { return null; }
  }, [mergedStructureInputs]);

  // ============================================================
  // Callbacks
  // ============================================================

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

  // Custom expenses
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

  // Commercial tenants
  const addCommercialTenant = useCallback(() => {
    setInputs(prev => ({
      ...prev,
      commercialTenants: [...(prev.commercialTenants || []), { id: Date.now().toString(), name: "Space " + ((prev.commercialTenants?.length || 0) + 1), rentAnnual: 0 }],
    }));
  }, []);

  const removeCommercialTenant = useCallback((id: string) => {
    setInputs(prev => {
      const updated = (prev.commercialTenants || []).filter(t => t.id !== id);
      const totalRent = updated.reduce((s, t) => s + t.rentAnnual, 0);
      return { ...prev, commercialTenants: updated, commercialRentAnnual: totalRent };
    });
  }, []);

  const updateCommercialTenant = useCallback((id: string, field: keyof CommercialTenant, value: string | number) => {
    setInputs(prev => {
      const updated = (prev.commercialTenants || []).map(t => t.id === id ? { ...t, [field]: value } : t);
      const totalRent = updated.reduce((s, t) => s + t.rentAnnual, 0);
      return { ...prev, commercialTenants: updated, commercialRentAnnual: totalRent };
    });
  }, []);

  // Custom income
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
        newMeta[field] = { source: "t12", methodology: `T-12 ($${actual.toLocaleString()}) + ${Math.round((gf - 1) * 100)}%`, t12Actual: actual, growthFactor: gf };
      }
    }
    setInputs(prev => ({ ...prev, ...updates, t12Actuals: t12Draft, t12GrowthFactors: t12GrowthDraft, expenseMeta: newMeta }));
    setShowT12Modal(false);
  }, [t12Draft, t12GrowthDraft, inputs.expenseMeta]);

  // Expense flags
  const getFlagForField = useCallback((field: string) => {
    return expenseFlags.find(f => f.field === field);
  }, [expenseFlags]);

  const applySuggestedAmount = useCallback((flag: ExpenseFlag) => {
    if (flag.suggestedAmount != null) {
      update({ [flag.field]: flag.suggestedAmount } as any);
    }
  }, [update]);

  // Contact search
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

  const selectContact = useCallback((c: ContactRecord) => {
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

  // LOI modal
  const buildLoiData = useCallback((profile: UserProfile | null) => {
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
  }, [userProfile, buildLoiData]);

  // Structure param update
  const updateStructureParam = useCallback((param: string, value: number | boolean | string) => {
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

  // Comps loading
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

  // Save
  const handleSave = useCallback(async () => {
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
  }, [savedId, dealName, address, borough, block, lot, bbl, contactId, dealType, dealSource, inputs, assumptions, activeStructure, structureOverrides, outputs, notes]);

  // Investment Summary PDF
  const handleGenerateInvestmentSummary = useCallback(async () => {
    if (!hasPermission(plan, "investment_summary")) {
      toast(getUpgradeMessage("investment_summary"), "info");
      return;
    }
    setGeneratingSummary(true);
    try {
      const payload = savedId
        ? await assembleInvestmentSummary(savedId)
        : await assembleInvestmentSummaryFromInputs(inputs as Record<string, any>, outputs as Record<string, any>, bbl || undefined);
      const blob = generateInvestmentSummaryPdf(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Investment-Summary-${sanitizeFilename(address || dealName || "Deal")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Investment Summary downloaded", "success");
    } catch (e) {
      console.error("Investment Summary generation failed:", e);
      toast("Failed to generate Investment Summary", "error");
    } finally {
      setGeneratingSummary(false);
    }
  }, [plan, savedId, inputs, outputs, bbl, address, dealName, toast]);

  // Export PDF
  const exportPdf = useCallback(() => {
    generateDealPdf({
      dealName: dealName || address || "Deal Analysis",
      address,
      borough,
      inputs,
      outputs,
      propertyDetails,
      notes,
      structureType: activeStructure,
      structureAnalysis: structureAnalysis || undefined,
      comparisonResults: comparisonResults.length > 0 ? comparisonResults : undefined,
    });
  }, [dealName, address, borough, inputs, outputs, propertyDetails, notes, activeStructure, structureAnalysis, comparisonResults]);

  // ============================================================
  // Effects
  // ============================================================

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

      // LL84/LL97: check for energy data
      fetchLL84Data(qBbl).then(async (ll84) => {
        if (!ll84) return;
        const utils = await estimateLL84Utilities(ll84);
        if (utils.totalAnnualUtility > 0) {
          setInputs(prev => ({
            ...prev,
            electricityGas: utils.electricityCost + utils.gasCost + utils.fuelOilCost,
            waterSewer: utils.waterCost,
          }));
          setAssumptions(prev => { const a = { ...prev }; delete a.electricityGas; delete a.waterSewer; return a; });
        }
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

    // NYS prefill from sessionStorage
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

    // NJ prefill from sessionStorage
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

  // Auto-fetch NYC closing costs (debounced 300ms)
  useEffect(() => {
    if (inputs.purchasePrice <= 0) { setClosingCostBreakdown(null); return; }
    if (closingCostTimer.current) clearTimeout(closingCostTimer.current);
    closingCostTimer.current = setTimeout(() => {
      const tUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);
      const loanAmt = inputs.purchasePrice * (inputs.ltvPercent / 100);
      const msi = mergedStructureInputs as Record<string, any>;
      const bridgeLoan = activeStructure === "bridge_refi" ? inputs.purchasePrice * ((msi.bridgeLtvPct ?? 80) / 100) : 0;
      const refiLoan = activeStructure === "bridge_refi" ? inputs.purchasePrice * ((msi.refiLtvPct ?? 75) / 100) * 1.2 : 0;
      const assumedBal = activeStructure === "assumable" ? (msi.existingLoanBalance ?? 0) : 0;
      const suppLoan = activeStructure === "assumable" ? (msi.supplementalLoanAmount ?? 0) : 0;
      fetchClosingCosts({
        purchasePrice: inputs.purchasePrice, loanAmount: loanAmt,
        structure: activeStructure, units: tUnits > 0 ? tUnits : 10,
        assumedBalance: assumedBal, supplementalLoan: suppLoan,
        bridgeLoanAmount: bridgeLoan, refiLoanAmount: refiLoan,
        useCEMA, borough: borough || undefined,
      }).then(setClosingCostBreakdown).catch(() => {});
    }, 300);
    return () => { if (closingCostTimer.current) clearTimeout(closingCostTimer.current); };
  }, [inputs.purchasePrice, inputs.ltvPercent, inputs.unitMix, activeStructure, useCEMA, borough, mergedStructureInputs]);

  // Auto-fetch tax reassessment when BBL and purchase price available
  useEffect(() => {
    if (!bbl || bbl.length < 10 || inputs.purchasePrice <= 0) { setTaxReassessment(null); return; }
    const tUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);
    fetchTaxReassessment({
      bbl, purchasePrice: inputs.purchasePrice,
      currentTaxBill: inputs.realEstateTaxes > 0 ? inputs.realEstateTaxes : undefined,
      units: tUnits > 0 ? tUnits : undefined,
      yearBuilt: propertyDetails?.yearBuilt ? Number(propertyDetails.yearBuilt) : undefined,
    }).then(r => { if (r) setTaxReassessment(r); }).catch(() => {});
  }, [bbl, inputs.purchasePrice, inputs.realEstateTaxes]);

  // Auto-fetch expense benchmark when property details available
  useEffect(() => {
    if (!propertyDetails || !propertyDetails.yearBuilt || !propertyDetails.unitsRes) return;
    fetchExpenseBenchmark({
      bbl: bbl || "",
      yearBuilt: propertyDetails.yearBuilt,
      numFloors: propertyDetails.numFloors,
      bldgClass: propertyDetails.bldgClass,
      bldgArea: propertyDetails.bldgArea,
      unitsRes: propertyDetails.unitsRes,
      borough: propertyDetails.borough || borough,
      hasElevator: propertyDetails.hasElevator,
      rentStabilizedUnits: propertyDetails.rentStabilizedUnits,
    }).then(b => { if (b) setExpenseBenchmark(b); }).catch(() => {});
  }, [propertyDetails, bbl, borough]);

  // Auto-fetch rent projection when stabilized units exist
  useEffect(() => {
    if (!propertyDetails?.rentStabilizedUnits || propertyDetails.rentStabilizedUnits <= 0) return;
    if (inputs.unitMix.length === 0) return;
    const avgRent = inputs.unitMix.reduce((s, u) => s + u.count * u.monthlyRent, 0) / Math.max(1, totalUnits);
    if (avgRent <= 0) return;
    fetchRentProjection({
      bbl: bbl || "",
      totalUnits: totalUnits || propertyDetails.unitsRes,
      holdPeriodYears: inputs.holdPeriodYears,
      marketRentGrowthPct: inputs.annualRentGrowth,
      avgMarketRent: avgRent,
      renovationBudget: inputs.renovationBudget > 0 ? inputs.renovationBudget : undefined,
    }).then(r => { if (r) setRentProjection(r); }).catch(() => {});
  }, [propertyDetails?.rentStabilizedUnits, bbl, inputs.holdPeriodYears, inputs.annualRentGrowth, inputs.renovationBudget, totalUnits]);

  // Auto-fetch LL97 projection when BBL available
  useEffect(() => {
    if (!bbl || bbl.length < 10) return;
    fetchLL97Projection({
      bbl,
      holdPeriodYears: inputs.holdPeriodYears,
    }).then(p => { if (p) setLl97Projection(p); }).catch(() => {});
  }, [bbl, inputs.holdPeriodYears]);

  // Auto-fetch market cap rate when BBL available
  useEffect(() => {
    if (!bbl || bbl.length < 10) return;
    fetchMarketCapRate(bbl)
      .then(cr => {
        if (cr) {
          setMarketCapRate(cr);
          if (isAi("exitCapRate") && cr.suggestedExitCap > 0) {
            update({ exitCapRate: cr.suggestedExitCap });
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbl]);

  // Run expense anomaly detection whenever inputs change
  useEffect(() => {
    const tUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);
    if (tUnits <= 0) { setExpenseFlags([]); return; }
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
      totalUnits: tUnits,
      totalIncome: outputs.totalIncome,
      managementFeePercent: inputs.managementFeePercent,
      customExpenses: inputs.customExpenseItems?.map(c => ({ id: c.id, name: c.name, amount: c.amount })),
    });
    setExpenseFlags(flags);
  }, [inputs, outputs.totalIncome]);

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

  // ============================================================
  // Context value
  // ============================================================

  const value: DealModelerContextValue = useMemo(() => ({
    inputs, setInputs, outputs,
    dealName, setDealName,
    dealType, setDealType,
    dealSource, setDealSource,
    address, setAddress,
    borough, setBorough,
    block, setBlock,
    lot, setLot,
    bbl, setBbl,
    notes, setNotes,
    saving, savedId, saveMsg, handleSave,
    propertyDetails, prefillLoading, prefilled,
    assumptions, isAiGenerated, isAi, clearAi,
    update, updateUnit, addUnitType, removeUnitType,
    addCustomExpense, removeCustomExpense, updateCustomExpense,
    addCustomIncome, removeCustomIncome, updateCustomIncome,
    addCommercialTenant, removeCommercialTenant, updateCommercialTenant,
    totalUnits,
    fredRate, compValuation, renoEstimate, strProjection,
    closingCostBreakdown, taxReassessment, showCostDetail, setShowCostDetail, useCEMA, setUseCEMA,
    expenseBenchmark, rentProjection, ll97Projection, showBenchmarkDetail, setShowBenchmarkDetail,
    marketCapRate,
    activeStructure, setActiveStructure, structureOverrides, showComparison, setShowComparison,
    comparisonResults, structureBase, mergedStructureInputs, structureAnalysis,
    updateStructureParam, runComparison,
    contactId, linkedContact, contactSearch, contactResults, contactDropdownOpen, setContactDropdownOpen,
    handleContactSearch, selectContact, unlinkContact,
    showLoiModal, setShowLoiModal, loiData, setLoiData, loiSending, setLoiSending,
    loiMsg, setLoiMsg, userProfile, openLoiModal, buildLoiData,
    showT12Modal, setShowT12Modal, t12Draft, setT12Draft, t12GrowthDraft, setT12GrowthDraft,
    openT12Modal, applyT12,
    comps, compSummary, compsLoading, compRadius, setCompRadius, compYears, setCompYears,
    compMinUnits, setCompMinUnits, loadComps,
    expenseFlags, getFlagForField, applySuggestedAmount,
    itemizeClosing, setItemizeClosing, incomeView, setIncomeView,
    expenseEntryMode, setExpenseEntryMode,
    handleGenerateInvestmentSummary, generatingSummary, exportPdf, plan,
  }), [
    inputs, outputs,
    dealName, dealType, dealSource, address, borough, block, lot, bbl, notes,
    saving, savedId, saveMsg, handleSave,
    propertyDetails, prefillLoading, prefilled,
    assumptions, isAiGenerated, isAi, clearAi,
    update, updateUnit, addUnitType, removeUnitType,
    addCustomExpense, removeCustomExpense, updateCustomExpense,
    addCustomIncome, removeCustomIncome, updateCustomIncome,
    addCommercialTenant, removeCommercialTenant, updateCommercialTenant,
    totalUnits,
    fredRate, compValuation, renoEstimate, strProjection,
    closingCostBreakdown, taxReassessment, showCostDetail, useCEMA,
    expenseBenchmark, rentProjection, ll97Projection, showBenchmarkDetail,
    marketCapRate,
    activeStructure, structureOverrides, showComparison,
    comparisonResults, structureBase, mergedStructureInputs, structureAnalysis,
    updateStructureParam, runComparison,
    contactId, linkedContact, contactSearch, contactResults, contactDropdownOpen,
    handleContactSearch, selectContact, unlinkContact,
    showLoiModal, loiData, loiSending, loiMsg, userProfile, openLoiModal, buildLoiData,
    showT12Modal, t12Draft, t12GrowthDraft, openT12Modal, applyT12,
    comps, compSummary, compsLoading, compRadius, compYears, compMinUnits, loadComps,
    expenseFlags, getFlagForField, applySuggestedAmount,
    itemizeClosing, incomeView, expenseEntryMode,
    handleGenerateInvestmentSummary, generatingSummary, exportPdf, plan,
  ]);

  return (
    <DealModelerContext.Provider value={value}>
      {children}
    </DealModelerContext.Provider>
  );
}
