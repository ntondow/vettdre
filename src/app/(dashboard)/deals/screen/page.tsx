"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Save,
  RotateCcw,
  Zap,
  Info,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Target,
  Upload,
} from "lucide-react";
import PropertySearchInput from "@/components/research/property-search-input";
import type { PropertySelection } from "@/components/research/property-search-input";
import {
  quickScreenLookup,
  quickScreenCalculate,
  solveForPrice,
  saveQuickScreen,
} from "./actions";
import type {
  QuickScreenLookupResult,
  QuickScreenInputs,
  QuickScreenResult,
} from "./actions";

// ── Formatters ──────────────────────────────────────────────

const fmt = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtFull = (n: number) => `$${Math.round(n).toLocaleString()}`;

// ── Gauge Component (matches deal modeler) ──────────────────

function MetricGauge({ value, min, max, color }: { value: number; min: number; max: number; color: string }) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = max > min ? (clamped - min) / (max - min) : 0;
  const r = 46;
  const cx = 60;
  const cy = 58;
  const circumference = Math.PI * r;
  const filled = circumference * pct;
  const gap = circumference - filled;
  return (
    <svg viewBox="0 0 120 68" className="w-full h-auto">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${filled} ${gap}`} className="transition-all duration-500" />
    </svg>
  );
}

// ── Metric Color Helper ─────────────────────────────────────

function metricColor(value: number, good: number, bad: number): { hex: string; text: string; bg: string } {
  if (value >= good) return { hex: "#10B981", text: "text-emerald-400", bg: "bg-emerald-500/10" };
  if (value <= bad) return { hex: "#EF4444", text: "text-red-400", bg: "bg-red-500/10" };
  return { hex: "#F59E0B", text: "text-amber-400", bg: "bg-amber-500/10" };
}

// ── Shimmer ─────────────────────────────────────────────────

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className || ""}`} />;
}

// ── Component ───────────────────────────────────────────────

export default function QuickScreenPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bblParam = searchParams.get("bbl");

  // Import pre-fill from /deals/import flow
  const importPrice = searchParams.get("price");
  const importIncome = searchParams.get("income");
  const importExpense = searchParams.get("expense");
  const importRate = searchParams.get("rate");
  const importExitCap = searchParams.get("exitCap");
  const importDp = searchParams.get("dp");
  const importFinanced = searchParams.get("financed");

  // Lookup state
  const [property, setProperty] = useState<PropertySelection | null>(null);
  const [lookupData, setLookupData] = useState<QuickScreenLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Input state
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [grossIncome, setGrossIncome] = useState(0);
  const [expenseRatio, setExpenseRatio] = useState(45);
  const [isFinanced, setIsFinanced] = useState(true);
  const [downPaymentPct, setDownPaymentPct] = useState(35);
  const [interestRate, setInterestRate] = useState(7.0);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [exitCapRate, setExitCapRate] = useState(5.5);
  const [holdPeriod, setHoldPeriod] = useState(5);

  // Solve for price
  const [solveMode, setSolveMode] = useState(false);
  const [targetCoc, setTargetCoc] = useState(8.0);
  const [solvedPrice, setSolvedPrice] = useState<number | null>(null);

  // Results
  const [result, setResult] = useState<QuickScreenResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [savedDealId, setSavedDealId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Pre-fill from import flow ────────────────────────────
  useEffect(() => {
    if (importPrice) setPurchasePrice(parseFloat(importPrice) || 0);
    if (importIncome) setGrossIncome(parseFloat(importIncome) || 0);
    if (importExpense) setExpenseRatio(parseFloat(importExpense) || 45);
    if (importRate) setInterestRate(parseFloat(importRate) || 7.0);
    if (importExitCap) setExitCapRate(parseFloat(importExitCap) || 5.5);
    if (importDp) setDownPaymentPct(parseFloat(importDp) || 35);
    if (importFinanced) setIsFinanced(importFinanced === "1");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Property Select (from shared search) ────────────────

  const handlePropertySelect = useCallback(async (p: PropertySelection) => {
    setProperty(p);
    setLookupLoading(true);
    try {
      const data = await quickScreenLookup(p.bbl);
      if (data) {
        setLookupData(data);
        setPurchasePrice(data.estimatedPurchasePrice);
        setGrossIncome(data.estimatedGrossIncome);
        setExpenseRatio(data.estimatedExpenseRatio);
        setInterestRate(data.currentMortgageRate);
      }
    } catch (e) {
      console.error("Lookup failed:", e);
    } finally {
      setLookupLoading(false);
    }
  }, []);

  // ── Calculate ─────────────────────────────────────────

  const doCalculate = useCallback(async () => {
    const price = solveMode ? (solvedPrice || 0) : purchasePrice;
    if (price <= 0 || grossIncome <= 0) {
      setResult(null);
      return;
    }
    setCalculating(true);
    try {
      const inputs: QuickScreenInputs = {
        purchasePrice: price,
        grossAnnualIncome: grossIncome,
        expenseRatioPct: expenseRatio,
        isFinanced,
        downPaymentPct,
        interestRate,
        loanTermYears,
        exitCapRate,
        holdPeriodYears: holdPeriod,
        solveForPrice: solveMode,
        targetCocPct: targetCoc,
      };
      const res = await quickScreenCalculate(inputs);
      setResult(res);
    } catch (e) {
      console.error("Calculation failed:", e);
    } finally {
      setCalculating(false);
    }
  }, [purchasePrice, grossIncome, expenseRatio, isFinanced, downPaymentPct, interestRate, loanTermYears, exitCapRate, holdPeriod, solveMode, solvedPrice, targetCoc]);

  // Debounced recalculation
  useEffect(() => {
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(() => doCalculate(), 150);
    return () => { if (calcTimer.current) clearTimeout(calcTimer.current); };
  }, [doCalculate]);

  // ── Solve for Price ───────────────────────────────────

  useEffect(() => {
    if (!solveMode || grossIncome <= 0) { setSolvedPrice(null); return; }
    const timer = setTimeout(async () => {
      try {
        const price = await solveForPrice({
          grossAnnualIncome: grossIncome,
          expenseRatioPct: expenseRatio,
          isFinanced,
          downPaymentPct,
          interestRate,
          loanTermYears,
          exitCapRate,
          holdPeriodYears: holdPeriod,
          targetCocPct: targetCoc,
        });
        setSolvedPrice(price);
      } catch { setSolvedPrice(null); }
    }, 200);
    return () => clearTimeout(timer);
  }, [solveMode, grossIncome, expenseRatio, isFinanced, downPaymentPct, interestRate, loanTermYears, exitCapRate, holdPeriod, targetCoc]);

  // ── Actions ───────────────────────────────────────────

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const price = solveMode ? (solvedPrice || 0) : purchasePrice;
      const id = await saveQuickScreen({
        dealId: savedDealId || undefined,
        address: property?.address,
        borough: property?.borough,
        block: property?.block,
        lot: property?.lot,
        bbl: property?.bbl,
        quickScreenInputs: {
          purchasePrice: price,
          grossAnnualIncome: grossIncome,
          expenseRatioPct: expenseRatio,
          isFinanced,
          downPaymentPct,
          interestRate,
          loanTermYears,
          exitCapRate,
          holdPeriodYears: holdPeriod,
          solveForPrice: solveMode,
          targetCocPct: targetCoc,
        },
        quickScreenResult: result,
        lookupData,
      });
      setSavedDealId(id);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 3000);
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleGoDeeper = async () => {
    // Save first, then navigate to deal modeler with the ID
    const price = solveMode ? (solvedPrice || 0) : purchasePrice;
    let dealId = savedDealId;
    if (!dealId && result) {
      dealId = await saveQuickScreen({
        address: property?.address,
        borough: property?.borough,
        block: property?.block,
        lot: property?.lot,
        bbl: property?.bbl,
        quickScreenInputs: {
          purchasePrice: price,
          grossAnnualIncome: grossIncome,
          expenseRatioPct: expenseRatio,
          isFinanced,
          downPaymentPct,
          interestRate,
          loanTermYears,
          exitCapRate,
          holdPeriodYears: holdPeriod,
          solveForPrice: solveMode,
          targetCocPct: targetCoc,
        },
        quickScreenResult: result,
        lookupData,
      });
      setSavedDealId(dealId);
    }
    if (dealId) {
      router.push(`/deals/new?id=${dealId}&from=screen`);
    } else if (property?.bbl) {
      const [, boro, rawBlock, rawLot] = property.bbl.match(/^(\d)(\d{5})(\d{4})$/) || [];
      if (boro) {
        router.push(`/deals/new?boroCode=${boro}&block=${rawBlock?.replace(/^0+/, "")}&lot=${rawLot?.replace(/^0+/, "")}`);
      }
    }
  };

  const handleReset = () => {
    setProperty(null);
    setLookupData(null);
    setPurchasePrice(0);
    setGrossIncome(0);
    setExpenseRatio(45);
    setIsFinanced(true);
    setDownPaymentPct(35);
    setInterestRate(7.0);
    setLoanTermYears(30);
    setExitCapRate(5.5);
    setHoldPeriod(5);
    setSolveMode(false);
    setTargetCoc(8.0);
    setSolvedPrice(null);
    setResult(null);
    setSavedDealId(null);
  };

  // ── Render ────────────────────────────────────────────

  const effectivePrice = solveMode ? (solvedPrice || 0) : purchasePrice;
  const hasInputs = effectivePrice > 0 && grossIncome > 0;

  return (
    <div className="min-h-full bg-[#0B0F19] text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Quick Screen</h1>
              <p className="text-xs text-slate-500">Back-of-envelope deal screening</p>
            </div>
          </div>
          <Link
            href="/deals/import"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/40 hover:text-white/70 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-lg transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Import from Document
          </Link>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Left: Inputs ── */}
          <div className="w-full lg:w-[420px] flex-shrink-0 space-y-4">

            {/* Property Lookup */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Property Lookup</label>
              <PropertySearchInput
                onSelect={handlePropertySelect}
                initialBbl={bblParam}
                selected={property}
                onClear={handleReset}
                loading={lookupLoading}
              />
              {lookupData && lookupData.rentStabilizedUnits > 0 && (
                <div className="mt-2">
                  <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    {lookupData.rentStabilizedUnits} rent-stabilized units
                  </span>
                </div>
              )}
            </div>

            {/* Core Inputs */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-4">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Deal Inputs</label>

              {/* Purchase Price / Solve for Price */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-400">Purchase Price</label>
                  <button
                    onClick={() => { setSolveMode(!solveMode); if (!solveMode) setSolvedPrice(null); }}
                    className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                      solveMode ? "bg-violet-500/20 text-violet-400" : "bg-white/5 text-slate-500 hover:text-slate-400"
                    }`}
                  >
                    <Target className="w-3 h-3" />
                    Solve for Price
                  </button>
                </div>
                {solveMode ? (
                  <div className="space-y-2">
                    <NumberInput
                      value={targetCoc}
                      onChange={setTargetCoc}
                      suffix="%"
                      label="Target Cash-on-Cash"
                      step={0.5}
                    />
                    {solvedPrice !== null && solvedPrice > 0 && (
                      <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-xs text-violet-400">Solved Price</span>
                        <span className="text-sm font-bold text-violet-300">{fmtFull(solvedPrice)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <CurrencyInput value={purchasePrice} onChange={setPurchasePrice} />
                )}
              </div>

              {/* Gross Income */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Gross Annual Income</label>
                <CurrencyInput value={grossIncome} onChange={setGrossIncome} />
              </div>

              {/* Expense Ratio Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-400">Expense Ratio</label>
                  <span className="text-xs font-bold text-white">{expenseRatio}%</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={70}
                  step={1}
                  value={expenseRatio}
                  onChange={e => setExpenseRatio(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                  <span>20%</span>
                  <span>70%</span>
                </div>
              </div>

              {/* Financing Toggle */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400">Financing</label>
                  <div className="flex items-center bg-white/5 rounded-lg p-0.5">
                    <button
                      onClick={() => setIsFinanced(false)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!isFinanced ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-400"}`}
                    >
                      All Cash
                    </button>
                    <button
                      onClick={() => setIsFinanced(true)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${isFinanced ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-400"}`}
                    >
                      Financed
                    </button>
                  </div>
                </div>

                {isFinanced && (
                  <div className="space-y-3 mt-2 pl-3 border-l-2 border-white/5">
                    <NumberInput value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" label="Down Payment" step={5} />
                    <NumberInput value={interestRate} onChange={setInterestRate} suffix="%" label="Interest Rate" step={0.25} />
                    <NumberInput value={loanTermYears} onChange={setLoanTermYears} suffix="yr" label="Loan Term" step={5} />
                  </div>
                )}
              </div>

              {/* Exit */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <NumberInput value={exitCapRate} onChange={setExitCapRate} suffix="%" label="Exit Cap Rate" step={0.25} />
                <NumberInput value={holdPeriod} onChange={setHoldPeriod} suffix="yr" label="Hold Period" step={1} />
              </div>
            </div>

            {/* Actions (mobile: show here) */}
            <div className="lg:hidden">
              <ActionBar
                hasResult={!!result}
                saving={saving}
                saveToast={saveToast}
                onGoDeeper={handleGoDeeper}
                onSave={handleSave}
                onReset={handleReset}
              />
            </div>
          </div>

          {/* ── Right: Results ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Loading shimmer */}
            {lookupLoading && (
              <div className="space-y-4">
                <Shimmer className="h-32" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map(i => <Shimmer key={i} className="h-36" />)}
                </div>
              </div>
            )}

            {/* No inputs state */}
            {!lookupLoading && !hasInputs && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
                  <Zap className="w-8 h-8 text-slate-600" />
                </div>
                <h2 className="text-base font-semibold text-slate-400 mb-2">Enter a deal to screen</h2>
                <p className="text-sm text-slate-600 text-center max-w-sm">
                  Look up a property by BBL or enter purchase price and income manually to see instant deal metrics.
                </p>
              </div>
            )}

            {/* Results */}
            {!lookupLoading && hasInputs && (
              <>
                {/* Traffic Light Verdict */}
                {result && <VerdictBanner verdict={result.verdict} text={result.verdictText} />}

                {/* 4 Primary Gauges */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <GaugeCard label="Cap Rate" value={result?.capRate || 0} display={fmtPct(result?.capRate || 0)} min={0} max={12} good={6} bad={4} />
                  <GaugeCard label="Cash-on-Cash" value={result?.cashOnCash || 0} display={fmtPct(result?.cashOnCash || 0)} min={0} max={20} good={8} bad={4} />
                  <GaugeCard label="IRR (5yr)" value={result?.irr || 0} display={result?.irr && isFinite(result.irr) ? fmtPct(result.irr) : "—"} min={0} max={30} good={15} bad={8} />
                  <GaugeCard label="DSCR" value={isFinanced ? (result?.dscr || 0) : 0}
                    display={isFinanced ? (result?.dscr ? result.dscr.toFixed(2) + "x" : "—") : "N/A"}
                    min={0} max={3} good={1.25} bad={1.0} inactive={!isFinanced} />
                </div>

                {/* Secondary Metrics */}
                {result && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <SecondaryCard label="Monthly Cash Flow" value={result.monthlyCashFlow > 0 ? `${fmtFull(result.monthlyCashFlow)}/mo` : `−${fmtFull(Math.abs(result.monthlyCashFlow))}/mo`}
                      color={result.monthlyCashFlow > 0 ? "text-emerald-400" : "text-red-400"} />
                    <SecondaryCard label="Equity Multiple" value={result.equityMultiple > 0 ? `${result.equityMultiple.toFixed(2)}x` : "—"}
                      color={result.equityMultiple >= 2 ? "text-emerald-400" : result.equityMultiple >= 1.5 ? "text-amber-400" : "text-slate-400"} />
                    <SecondaryCard label="Exit Value" value={result.exitValue > 0 ? fmt(result.exitValue) : "—"} color="text-blue-400" />
                    <SecondaryCard label="Gross Yield" value={fmtPct(result.grossYield)} color={result.grossYield >= 8 ? "text-emerald-400" : "text-slate-400"} />
                    <SecondaryCard label="Total Equity Required" value={result.totalEquityRequired > 0 ? fmtFull(result.totalEquityRequired) : "—"} color="text-slate-300" />
                    <SecondaryCard label="NOI" value={result.noi > 0 ? fmtFull(result.noi) : "—"} color="text-slate-300" />
                  </div>
                )}

                {/* Quick Summary */}
                {result && (
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Summary</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <SummaryRow label="Purchase Price" value={fmtFull(effectivePrice)} />
                      <SummaryRow label="Gross Income" value={fmtFull(grossIncome)} />
                      <SummaryRow label="Expenses ({expenseRatio}%)" value={fmtFull(Math.round(grossIncome * expenseRatio / 100))} />
                      <SummaryRow label="NOI" value={fmtFull(result.noi)} bold />
                      {isFinanced && (
                        <>
                          <SummaryRow label="Loan Amount" value={fmtFull(effectivePrice * (1 - downPaymentPct / 100))} />
                          <SummaryRow label="Annual Debt Service" value={fmtFull(result.noi - result.monthlyCashFlow * 12)} />
                        </>
                      )}
                      <SummaryRow label="Annual Cash Flow" value={fmtFull(result.monthlyCashFlow * 12)} bold />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Actions (desktop: show here) */}
            <div className="hidden lg:block">
              <ActionBar
                hasResult={!!result}
                saving={saving}
                saveToast={saveToast}
                onGoDeeper={handleGoDeeper}
                onSave={handleSave}
                onReset={handleReset}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save toast */}
      {saveToast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg animate-[fade-in_0.2s_ease-out]">
          Saved to pipeline
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function CurrencyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [display, setDisplay] = useState(value > 0 ? value.toLocaleString() : "");

  useEffect(() => {
    setDisplay(value > 0 ? value.toLocaleString() : "");
  }, [value]);

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, "");
    const num = parseInt(cleaned) || 0;
    setDisplay(num > 0 ? num.toLocaleString() : "");
    onChange(num);
  };

  return (
    <div className="relative">
      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={e => handleChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-base sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50"
      />
    </div>
  );
}

function NumberInput({ value, onChange, suffix, label, step }: {
  value: number; onChange: (v: number) => void; suffix: string; label: string; step: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs font-medium text-slate-500 flex-shrink-0">{label}</label>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onChange(Math.max(0, value - step))}
          className="w-7 h-7 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center text-sm font-medium">
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-base sm:text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <span className="text-xs text-slate-500 w-6">{suffix}</span>
        <button onClick={() => onChange(value + step)}
          className="w-7 h-7 rounded-md bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center text-sm font-medium">
          +
        </button>
      </div>
    </div>
  );
}

function VerdictBanner({ verdict, text }: { verdict: "go" | "maybe" | "no_go"; text: string }) {
  const config = {
    go: { bg: "bg-emerald-500/10 border-emerald-500/20", icon: "bg-emerald-500", label: "GO", labelBg: "bg-emerald-500", textColor: "text-emerald-400" },
    maybe: { bg: "bg-amber-500/10 border-amber-500/20", icon: "bg-amber-500", label: "MAYBE", labelBg: "bg-amber-500", textColor: "text-amber-400" },
    no_go: { bg: "bg-red-500/10 border-red-500/20", icon: "bg-red-500", label: "NO-GO", labelBg: "bg-red-500", textColor: "text-red-400" },
  }[verdict];

  return (
    <div className={`border rounded-xl p-4 flex items-center gap-4 ${config.bg}`}>
      <div className={`w-12 h-12 rounded-full ${config.icon} flex items-center justify-center flex-shrink-0 ${verdict !== "maybe" ? "animate-pulse" : ""}`}>
        {verdict === "go" && <ShieldCheck className="w-6 h-6 text-white" />}
        {verdict === "maybe" && <Info className="w-6 h-6 text-white" />}
        {verdict === "no_go" && <TrendingUp className="w-6 h-6 text-white rotate-180" />}
      </div>
      <div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${config.labelBg} text-white`}>{config.label}</span>
        <p className={`text-sm mt-1 ${config.textColor}`}>{text}</p>
      </div>
    </div>
  );
}

function GaugeCard({ label, value, display, min, max, good, bad, inactive }: {
  label: string; value: number; display: string; min: number; max: number; good: number; bad: number; inactive?: boolean;
}) {
  const { hex, text, bg } = inactive ? { hex: "rgba(255,255,255,0.1)", text: "text-slate-600", bg: "bg-white/[0.02]" } : metricColor(value, good, bad);
  return (
    <div className={`border border-white/5 rounded-xl p-4 flex flex-col items-center ${bg}`}>
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <div className="w-20 -mb-3">
        <MetricGauge value={value} min={min} max={max} color={hex} />
      </div>
      <p className={`text-lg font-bold transition-all duration-200 ${text}`}>{display}</p>
    </div>
  );
}

function SecondaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
      <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={`text-right ${bold ? "font-bold text-white" : "text-slate-300"}`}>{value}</span>
    </>
  );
}

function ActionBar({ hasResult, saving, saveToast, onGoDeeper, onSave, onReset }: {
  hasResult: boolean; saving: boolean; saveToast: boolean; onGoDeeper: () => void; onSave: () => void; onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onGoDeeper}
        disabled={!hasResult}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        Go Deeper
      </button>
      <button
        onClick={onSave}
        disabled={!hasResult || saving}
        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save to Pipeline"}
      </button>
      <button
        onClick={onReset}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-400 text-sm font-medium px-3 py-2.5 rounded-lg transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Reset
      </button>
    </div>
  );
}
