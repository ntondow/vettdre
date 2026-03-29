"use client";

import { useState, useRef, useCallback } from "react";
import {
  Zap, ChevronDown, ChevronUp, Lock, TrendingUp, TrendingDown,
  ArrowRight, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Minus,
} from "lucide-react";
import { runQuickScreen } from "./quick-screen-actions";
import type { QuickScreenInput, QuickScreenResult } from "./quick-screen-actions";
import { hasPermission, getUpgradeMessage, type UserPlan } from "@/lib/feature-gate";

/* ------------------------------------------------------------------ */
/*  Currency formatting helpers                                        */
/* ------------------------------------------------------------------ */

function parsePriceInput(raw: string): number {
  const cleaned = raw.replace(/[^0-9.mkMK]/g, "");
  const match = cleaned.match(/^([\d.]+)\s*([mkMK])?$/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return 0;
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "m") return num * 1_000_000;
  if (suffix === "k") return num * 1_000;
  return num;
}

function formatCurrency(n: number, compact?: boolean): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (compact && abs >= 1_000_000) {
    return sign + "$" + (abs / 1_000_000).toFixed(1) + "M";
  }
  if (compact && abs >= 1_000) {
    return sign + "$" + (abs / 1_000).toFixed(0) + "K";
  }
  return sign + "$" + Math.round(abs).toLocaleString();
}

function formatPct(n: number, decimals = 1): string {
  if (!isFinite(n)) return "—";
  return n.toFixed(decimals) + "%";
}

/* ------------------------------------------------------------------ */
/*  Verdict config                                                     */
/* ------------------------------------------------------------------ */

const VERDICT_CONFIG: Record<
  QuickScreenResult["verdict"],
  { label: string; bg: string; text: string; border: string; Icon: typeof CheckCircle2 }
> = {
  strong_buy: { label: "STRONG BUY", bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300", Icon: CheckCircle2 },
  buy: { label: "BUY", bg: "bg-green-50", text: "text-green-800", border: "border-green-200", Icon: CheckCircle2 },
  hold: { label: "HOLD", bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", Icon: AlertTriangle },
  pass: { label: "PASS", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", Icon: Minus },
  hard_pass: { label: "HARD PASS", bg: "bg-red-100", text: "text-red-800", border: "border-red-300", Icon: XCircle },
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface QuickScreenPanelProps {
  // Building data from PLUTO (already loaded)
  address: string;
  borough: string;
  totalUnits: number;
  grossSqft: number;
  yearBuilt: number;
  numFloors: number;
  buildingClass: string;
  assessedValue?: number;
  // Optional context from building profile
  lastSalePrice?: number;
  lastSaleYear?: number;
  compsAvgPerUnit?: number;
  compsAvgPerSqft?: number;
  // BBL for "Go Deeper" link
  bbl: string;
  boroCode: string;
  block: string;
  lot: string;
  // Feature gate
  userPlan?: UserPlan;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuickScreenPanel({
  address,
  borough,
  totalUnits,
  grossSqft,
  yearBuilt,
  numFloors,
  buildingClass,
  assessedValue,
  lastSalePrice,
  lastSaleYear,
  compsAvgPerUnit,
  compsAvgPerSqft,
  bbl,
  boroCode,
  block,
  lot,
  userPlan = "pro",
}: QuickScreenPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [result, setResult] = useState<QuickScreenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);

  // User overrides for assumptions
  const [overrides, setOverrides] = useState<Partial<QuickScreenInput>>({});

  const gated = !hasPermission(userPlan, "quick_screen");

  const handleRun = useCallback(async () => {
    const price = parsePriceInput(priceInput);
    if (price <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await runQuickScreen({
        purchasePrice: price,
        address,
        borough,
        totalUnits,
        grossSqft,
        yearBuilt,
        numFloors,
        buildingClass,
        assessedValue,
        ...overrides,
      });
      setResult(res);
      setExpanded(true);
    } catch (err) {
      console.error("Quick Screen error:", err);
      setError("Quick Screen failed — try a different price or check the building data");
    } finally {
      setLoading(false);
    }
  }, [priceInput, address, borough, totalUnits, grossSqft, yearBuilt, numFloors, buildingClass, assessedValue, overrides]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRun();
  };

  const handleTryDifferentPrice = () => {
    setResult(null);
    setShowDetails(false);
    setPriceInput("");
    setTimeout(() => priceRef.current?.focus(), 50);
  };

  // Price suggestions
  const suggestedLow = assessedValue ? Math.round(assessedValue * 1.2) : undefined;
  const suggestedHigh = compsAvgPerUnit && totalUnits > 0
    ? Math.round(compsAvgPerUnit * totalUnits)
    : assessedValue ? Math.round(assessedValue * 2.0) : undefined;

  // ── Gated state ──────────────────────────────────────────────
  if (gated) {
    return (
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Lock className="w-4 h-4" />
          <span className="text-sm font-semibold">Quick Screen</span>
        </div>
        <p className="text-xs text-slate-400 mt-1">{getUpgradeMessage("quick_screen")}</p>
      </div>
    );
  }

  // ── Results view ─────────────────────────────────────────────
  if (result) {
    const v = VERDICT_CONFIG[result.verdict];
    const VIcon = v.Icon;

    return (
      <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Quick Screen</h3>
            <span className="text-xs text-slate-400">{formatCurrency(parsePriceInput(priceInput), true)}</span>
          </div>
          <button onClick={() => { setResult(null); setExpanded(false); }}
            className="text-xs text-slate-400 hover:text-slate-600">&times;</button>
        </div>

        <div className="p-4 space-y-4">
          {/* Verdict banner */}
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border ${v.bg} ${v.border}`}>
            <VIcon className={`w-5 h-5 flex-shrink-0 ${v.text}`} />
            <div>
              <p className={`text-sm font-bold ${v.text}`}>{v.label}</p>
              <p className="text-xs text-slate-600 mt-0.5">{result.verdictReason}</p>
            </div>
          </div>

          {/* 6 metric cards — 3×2 grid on desktop, 2×3 on mobile */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            <MetricCard label="Cap Rate" value={formatPct(result.capRate)} sub={result.marketCapRate ? `Market: ${formatPct(result.marketCapRate)}` : undefined} good={result.capRate >= 5.5} />
            <MetricCard label="Cash-on-Cash" value={formatPct(result.cashOnCash)} sub="Year 1" good={result.cashOnCash >= 7} />
            <MetricCard label="IRR (5yr)" value={result.irr > 0 ? formatPct(result.irr) : "N/A"} sub={`${result.assumptions.holdPeriodYears}yr hold`} good={result.irr >= 12} />
            <MetricCard label="Equity Multiple" value={isFinite(result.equityMultiple) && result.equityMultiple > 0 ? result.equityMultiple.toFixed(2) + "x" : "N/A"} sub="Total return" good={result.equityMultiple >= 1.5} />
            <MetricCard label="DSCR" value={isFinite(result.dscr) ? result.dscr.toFixed(2) + "x" : "N/A"} sub="Coverage" good={result.dscr >= 1.25} />
            <MetricCard label="Cash Flow" value={formatCurrency(result.monthlyCashFlow)} sub="/month" good={result.monthlyCashFlow > 0} />
          </div>

          {/* Details expansion */}
          <button onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showDetails ? "Hide Details" : "View Details"}
          </button>

          {showDetails && (
            <div className="bg-white rounded-lg border border-slate-100 p-3.5 space-y-3 text-xs">
              {/* Revenue */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Revenue</p>
                <div className="space-y-1">
                  <DetailRow label="Gross Rent" value={formatCurrency(result.annualGrossRent)}
                    note={`$${(result.assumptions.avgMonthlyRent || 0).toLocaleString()} x ${totalUnits} x 12`} />
                  <DetailRow label={`Less Vacancy (${formatPct(result.vacancyRate * 100, 0)})`}
                    value={`-${formatCurrency(result.annualGrossRent - result.effectiveGrossIncome)}`} negative />
                  <DetailRow label="Effective Income" value={formatCurrency(result.effectiveGrossIncome)} bold />
                </div>
              </div>

              {/* Expenses */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Expenses</p>
                <DetailRow label="Operating Expenses" value={formatCurrency(result.annualExpenses)}
                  note={`$${Math.round(result.assumptions.expensePerUnit).toLocaleString()}/unit`} />
                {result.expenseBenchmark && (
                  <p className="text-[10px] text-slate-400 ml-2">Market benchmark: ${result.expenseBenchmark.toLocaleString()}/unit</p>
                )}
              </div>

              {/* NOI & Debt */}
              <div className="border-t border-slate-100 pt-2">
                <DetailRow label="NOI" value={formatCurrency(result.noi)} bold />
                <DetailRow label="Debt Service" value={`-${formatCurrency(result.annualDebtService)}`}
                  note={`${formatCurrency(result.annualDebtService / 12)}/mo`} negative />
                <DetailRow label="Cash Flow" value={formatCurrency(result.noi - result.annualDebtService)}
                  note={`${formatCurrency(result.monthlyCashFlow)}/mo`} bold />
              </div>

              {/* Price metrics */}
              <div className="border-t border-slate-100 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Price Analysis</p>
                <DetailRow label="Per Unit" value={formatCurrency(result.pricePerUnit)} />
                {result.pricePerSqft > 0 && <DetailRow label="Per SF" value={`$${Math.round(result.pricePerSqft)}/SF`} />}
                {result.marketCapRate && (
                  <DetailRow label="Market Cap Rate" value={formatPct(result.marketCapRate)} />
                )}
              </div>

              {/* Exit */}
              <div className="border-t border-slate-100 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Exit (Year {result.assumptions.holdPeriodYears})
                </p>
                <DetailRow label="Exit Value" value={formatCurrency(result.exitValue, true)}
                  note={`at ${formatPct(result.assumptions.exitCapRate)} cap`} />
                <DetailRow label="Total Profit" value={formatCurrency(result.totalProfit)} bold />
              </div>

              {/* Assumptions */}
              <div className="border-t border-slate-100 pt-2">
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Assumptions: {formatPct(result.assumptions.rentGrowth * 100)} rent growth,{" "}
                  {formatPct(result.assumptions.expenseGrowth * 100)} expense growth,{" "}
                  25bp exit cap expansion, {formatPct(result.assumptions.interestRate * 100)} rate,{" "}
                  {result.assumptions.loanTermYears}yr amort, {formatPct(result.assumptions.downPaymentPct * 100, 0)} down
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <a
              href={`/deals/new?bbl=${bbl}&address=${encodeURIComponent(address)}&borough=${encodeURIComponent(borough)}&block=${block}&lot=${lot}&price=${parsePriceInput(priceInput)}`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Go Deeper
            </a>
            <button onClick={handleTryDifferentPrice}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
              Try Different Price
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Input view (no results yet) ──────────────────────────────
  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200 overflow-hidden">
      {/* Header — click to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900">Quick Screen</h3>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && <span className="text-xs text-slate-400">Enter a price to screen this deal</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Price input */}
          <div>
            <label className="text-xs font-medium text-slate-700">Purchase Price *</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base font-medium">$</span>
              <input
                ref={priceRef}
                type="text"
                inputMode="decimal"
                placeholder="4,500,000 or 4.5m"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-7 pr-3 py-2.5 text-base md:text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {priceInput && parsePriceInput(priceInput) > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  {formatCurrency(parsePriceInput(priceInput), true)}
                </span>
              )}
            </div>
          </div>

          {/* Price intelligence */}
          {(assessedValue || lastSalePrice || compsAvgPerUnit) && (
            <div className="bg-white rounded-lg border border-slate-100 p-2.5 space-y-1">
              <p className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Price context
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                {assessedValue && assessedValue > 0 && (
                  <span>Assessed: <strong>{formatCurrency(assessedValue, true)}</strong></span>
                )}
                {lastSalePrice && lastSalePrice > 0 && (
                  <span>Last sold: <strong>{formatCurrency(lastSalePrice, true)}</strong>{lastSaleYear ? ` (${lastSaleYear})` : ""}</span>
                )}
                {compsAvgPerUnit && compsAvgPerUnit > 0 && (
                  <span>Comps: <strong>{formatCurrency(compsAvgPerUnit)}/unit</strong>{compsAvgPerSqft ? ` ($${Math.round(compsAvgPerSqft)}/SF)` : ""}</span>
                )}
              </div>
              {suggestedLow && suggestedHigh && (
                <p className="text-[10px] text-slate-400">
                  Suggested range: {formatCurrency(suggestedLow, true)} – {formatCurrency(suggestedHigh, true)}
                </p>
              )}
            </div>
          )}

          {/* Assumptions toggle */}
          <button onClick={() => setShowAssumptions(!showAssumptions)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">
            {showAssumptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Adjust assumptions
          </button>

          {showAssumptions && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              <AssumptionField label="Rent/Unit/Mo" placeholder="Auto"
                value={overrides.avgMonthlyRent} prefix="$"
                onChange={(v) => setOverrides(prev => ({ ...prev, avgMonthlyRent: v || undefined }))} />
              <AssumptionField label="Vacancy %" placeholder="5%"
                value={overrides.vacancyRate ? overrides.vacancyRate * 100 : undefined} suffix="%"
                onChange={(v) => setOverrides(prev => ({ ...prev, vacancyRate: v ? v / 100 : undefined }))} />
              <AssumptionField label="Down Payment" placeholder="25%"
                value={overrides.downPaymentPct ? overrides.downPaymentPct * 100 : undefined} suffix="%"
                onChange={(v) => setOverrides(prev => ({ ...prev, downPaymentPct: v ? v / 100 : undefined }))} />
              <AssumptionField label="Interest Rate" placeholder="7.0%"
                value={overrides.interestRate ? overrides.interestRate * 100 : undefined} suffix="%"
                onChange={(v) => setOverrides(prev => ({ ...prev, interestRate: v ? v / 100 : undefined }))} />
              <AssumptionField label="Loan Term" placeholder="30"
                value={overrides.loanTermYears} suffix="yr"
                onChange={(v) => setOverrides(prev => ({ ...prev, loanTermYears: v || undefined }))} />
              <AssumptionField label="Hold Period" placeholder="5"
                value={overrides.holdPeriodYears} suffix="yr"
                onChange={(v) => setOverrides(prev => ({ ...prev, holdPeriodYears: v || undefined }))} />
            </div>
          )}

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={loading || !priceInput || parsePriceInput(priceInput) <= 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Screening...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Screen This Deal
              </>
            )}
          </button>
          {error && (
            <p className="text-xs text-red-600 mt-2 text-center">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function MetricCard({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-slate-100 p-2.5">
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${good ? "text-emerald-700" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

function DetailRow({ label, value, note, bold, negative }: {
  label: string; value: string; note?: string; bold?: boolean; negative?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className={`text-slate-600 ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span className="text-right">
        <span className={`${bold ? "font-bold text-slate-900" : ""} ${negative ? "text-red-600" : ""}`}>{value}</span>
        {note && <span className="text-[10px] text-slate-400 ml-1.5">{note}</span>}
      </span>
    </div>
  );
}

function AssumptionField({ label, placeholder, value, prefix, suffix, onChange }: {
  label: string; placeholder: string; value?: number; prefix?: string; suffix?: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-slate-500 font-medium">{label}</label>
      <div className="relative mt-0.5">
        {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{prefix}</span>}
        <input
          type="number"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
          className={`w-full ${prefix ? "pl-5" : "pl-2.5"} ${suffix ? "pr-6" : "pr-2.5"} py-1.5 text-base md:text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none`}
        />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}
